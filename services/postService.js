// services/postService.js
const db = require('../config/db');
const { slugify } = require('../utils/slugify'); // Assuming you have a slugify utility

/**
 * Fetches published posts with pagination and search.
 * @param {object} options - Options object.
 * @param {number} [options.page=1] - Current page number.
 * @param {number} [options.limit=9] - Number of posts per page.
 * @param {string} [options.searchQuery=''] - Search term.
 * @returns {Promise<object>} Object containing posts, totalPosts, totalPages, currentPage.
 */
exports.getPublishedPosts = async ({ page = 1, limit = 9, searchQuery = '' }) => {
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let queryParams = [];
    let countQueryParams = [];
    let whereClauses = ["p.status = 'published'"];

    if (searchQuery) {
        whereClauses.push("(p.title LIKE ? OR p.content LIKE ? OR p.summary LIKE ?)");
        const searchPattern = `%${searchQuery}%`;
        queryParams.push(searchPattern, searchPattern, searchPattern);
        countQueryParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    queryParams.push(parseInt(limit, 10), parseInt(offset, 10));

    const postsSql = `
        SELECT 
            p.id, p.title, p.slug, p.summary, p.content, p.feature_image_path, 
            DATE_FORMAT(p.published_at, '%M %d, %Y') as published_at_formatted, 
            p.published_at,
            u.username as author_username, u.first_name, u.last_name,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = TRUE) as approved_comment_count
            ${/* Add category fetching if implemented */''}
        FROM posts p 
        LEFT JOIN users u ON p.user_id = u.id 
        ${whereSql}
        ORDER BY p.published_at DESC 
        LIMIT ? OFFSET ?`;
    
    const countSql = `SELECT COUNT(*) as total_posts FROM posts p ${whereSql}`;
    
    try {
        const [posts] = await db.query(postsSql, queryParams);
        const [[{ total_posts }]] = await db.query(countSql, countQueryParams);

        const postsWithAuthor = posts.map(post => ({
            ...post,
            author_name: post.first_name && post.last_name ? `${post.first_name} ${post.last_name}` : post.author_username || 'ConstructPro Team'
        }));

        return {
            posts: postsWithAuthor,
            totalPosts: total_posts,
            totalPages: Math.ceil(total_posts / parseInt(limit, 10)),
            currentPage: parseInt(page, 10)
        };
    } catch (error) {
        console.error("Error in getPublishedPosts:", error);
        throw error;
    }
};

/**
 * Fetches a specified number of recent posts.
 * @param {number} [count=3] - Number of recent posts to fetch.
 * @param {boolean} [publishedOnly=true] - Whether to fetch only published posts.
 * @returns {Promise<object>} Object containing posts.
 */
exports.getRecentPosts = async (count = 3, publishedOnly = true) => {
    let whereClause = '';
    if (publishedOnly) {
        whereClause = "WHERE p.status = 'published'";
    }

    const sql = `
        SELECT 
            p.id, p.title, p.slug, p.summary, p.content, p.feature_image_path,
            DATE_FORMAT(p.published_at, '%M %d, %Y') as published_at_formatted,
            p.published_at
        FROM posts p
        ${whereClause}
        ORDER BY p.published_at DESC
        LIMIT ?`;
    try {
        const [posts] = await db.query(sql, [parseInt(count, 10)]);
        return { posts };
    } catch (error) {
        console.error("Error in getRecentPosts:", error);
        throw error;
    }
};

/**
 * Fetches a single post by its slug, along with its approved comments, and increments view count.
 * @param {string} slug - The slug of the post.
 * @returns {Promise<object|null>} Object containing post and comments, or null if not found.
 */

exports.getPostBySlugWithComments = async (slug) => {
    if (!slug) return null;

    const postSql = `
        SELECT 
            p.id, p.title, p.slug, p.summary, p.content, p.meta_title, p.meta_description,
            p.feature_image_path, p.user_id, p.status, p.view_count,
            DATE_FORMAT(p.published_at, '%M %d, %Y at %h:%i %p') as published_at_formatted,
            p.published_at,
            u.username as author_username, u.first_name, u.last_name, u.profile_image_path as author_avatar
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.slug = ? AND p.status = 'published'`; // Ensure only published posts are publicly accessible

    const commentsSql = `
        SELECT 
            c.id, c.post_id, c.user_id, c.parent_comment_id, c.content,
            DATE_FORMAT(c.created_at, '%M %d, %Y at %h:%i %p') as created_at_formatted,
            c.created_at,
            c.author_name as comment_author_name, 
            c.author_email as comment_author_email, 
            u.username as registered_author_username,
            u.first_name as registered_author_first_name,
            u.last_name as registered_author_last_name,
            u.profile_image_path as registered_author_avatar
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ? AND c.is_approved = TRUE
        ORDER BY c.created_at ASC`; // Fetch oldest first to build hierarchy if needed

    try {
        const [[post]] = await db.query(postSql, [slug]);

        if (!post) {
            return null; // Post not found or not published
        }

        post.author_name = post.first_name && post.last_name ? `${post.first_name} ${post.last_name}` : post.author_username || 'ConstructPro Team';

        const [comments] = await db.query(commentsSql, [post.id]);

        const formattedComments = comments.map(comment => ({
            ...comment,
            author_display_name: comment.user_id 
                ? (comment.registered_author_first_name && comment.registered_author_last_name 
                    ? `${comment.registered_author_first_name} ${comment.registered_author_last_name}` 
                    : comment.registered_author_username)
                : comment.comment_author_name || 'Anonymous',
            author_avatar: comment.user_id ? comment.registered_author_avatar : null // Or a default guest avatar
        }));

        // Increment view count
        await db.query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", [post.id]);
        post.view_count +=1; // Reflect the incremented count in the returned object

        return { post, comments: formattedComments };
    } catch (error) {
        console.error(`Error in getPostBySlugWithComments for slug ${slug}:`, error);
        throw error;
    }
};

 
/**
 * Fetches a single post by its slug, along with its approved comments, categories, documents, and increments view count.
 * @param {string} slug - The slug of the post.
 * @returns {Promise<object|null>} Object containing post (with .categories and .documents), and comments, or null if not found.
 */
 

exports.getPostBySlugWithComments = async (slug) => {
    if (!slug) return null;

    const postSql = `
        SELECT 
            p.id, p.title, p.slug, p.summary, p.content, p.meta_title, p.meta_description,
            p.feature_image_path, p.user_id, p.status, p.view_count,
            DATE_FORMAT(p.published_at, '%M %d, %Y at %h:%i %p') as published_at_formatted,
            p.published_at,
            p.created_at,  
            u.username as author_username, u.first_name, u.last_name, u.profile_image_path as author_avatar
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.slug = ? AND p.status = 'published'`; // Ensure only published posts are publicly accessible

    const commentsSql = `
        SELECT 
            c.id, c.post_id, c.user_id, c.parent_comment_id, c.content,
            DATE_FORMAT(c.created_at, '%M %d, %Y at %h:%i %p') as created_at_formatted,
            c.created_at,
            c.author_name as comment_author_name, 
            c.author_email as comment_author_email, 
            u.username as registered_author_username,
            u.first_name as registered_author_first_name,
            u.last_name as registered_author_last_name,
            u.profile_image_path as registered_author_avatar
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ? AND c.is_approved = TRUE
        ORDER BY c.created_at ASC`;

    // SQL to fetch categories for the post
    const categoriesSql = `
        SELECT 
            pc.id, pc.name, pc.slug 
        FROM post_categories pc
        JOIN post_category_pivot pcp ON pc.id = pcp.category_id
        WHERE pcp.post_id = ?
        ORDER BY pc.name ASC`;

    // SQL to fetch documents for the post
    const documentsSql = `
        SELECT 
            pd.id, pd.original_filename, pd.stored_filename, pd.mimetype, pd.filesize, pd.title, pd.created_at 
        FROM post_documents pd
        WHERE pd.post_id = ?
        ORDER BY pd.created_at DESC`;

    try {
        const [[post]] = await db.query(postSql, [slug]);

        if (!post) {
            console.warn(`Post not found or not published with slug: ${slug}`);
            return null; // Post not found or not published
        }

        // Determine author display name
        post.author_name = post.first_name && post.last_name 
            ? `${post.first_name} ${post.last_name}` 
            : post.author_username || 'AvenirCon Team'; // Fallback to site name

        // Fetch comments
        const [comments] = await db.query(commentsSql, [post.id]);
        const formattedComments = comments.map(comment => ({
            ...comment,
            author_display_name: comment.user_id 
                ? (comment.registered_author_first_name && comment.registered_author_last_name 
                    ? `${comment.registered_author_first_name} ${comment.registered_author_last_name}` 
                    : comment.registered_author_username)
                : comment.comment_author_name || 'Anonymous',
            author_avatar: comment.user_id ? comment.registered_author_avatar : null
        }));

        // Fetch categories
        const [categoryRows] = await db.query(categoriesSql, [post.id]);
        post.categories = categoryRows; // Attach categories array to the post object

        // Fetch documents
        const [documentRows] = await db.query(documentsSql, [post.id]);
        post.documents = documentRows; // Attach documents array to the post object

        // Increment view count
        try {
            await db.query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", [post.id]);
            post.view_count +=1; // Reflect the incremented count in the returned object
        } catch (vcError) {
            console.error(`Failed to update view count for post ID ${post.id}:`, vcError);
            // Non-critical error, proceed with returning data
        }
        
        return { post, comments: formattedComments };
    } catch (error) {
        console.error(`Error in getPostBySlugWithComments for slug ${slug}:`, error);
        // Re-throwing the error so the controller can catch it and send an appropriate response (e.g., 500 or next(error))
        throw error; 
    }
};


/**
 * Adds a new comment to a post.
 * @param {string} postSlug - The slug of the post to comment on.
 * @param {object} commentData - Comment data.
 * @param {string} commentData.content - The comment text.
 * @param {string} [commentData.author_name] - Name of the guest author.
 * @param {string} [commentData.author_email] - Email of the guest author.
 * @param {object} [commentData.user] - Logged-in user object (req.session.user).
 * @param {string} [commentData.ip_address] - IP address of the commenter.
 * @param {number} [commentData.parent_comment_id] - ID of the parent comment if it's a reply.
 * @returns {Promise<object>} Result object with success status and errors/data.
 */
exports.addCommentToPost = async (postSlug, commentData) => {
    const { content, author_name, author_email, user, ip_address, parent_comment_id = null } = commentData;
    let errors = [];

    if (!content || content.trim() === '') {
        errors.push({ field: 'content', msg: 'Comment content cannot be empty.' });
    }
    if (content && content.length > 2000) { // Max length for comments
        errors.push({ field: 'content', msg: 'Comment is too long (max 2000 characters).' });
    }

    let userId = null;
    let finalAuthorName = author_name ? author_name.trim() : 'Anonymous';
    let finalAuthorEmail = author_email ? author_email.trim() : null;

    if (user && user.id) { // If a logged-in user is submitting
        userId = user.id;
        finalAuthorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
        finalAuthorEmail = user.email;
    } else { // Guest comment validation
        if (!author_name || author_name.trim() === '') {
            errors.push({ field: 'author_name', msg: 'Name is required for guest comments.' });
        }
        if (!author_email || author_email.trim() === '') {
            errors.push({ field: 'author_email', msg: 'Email is required for guest comments.' });
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author_email.trim())) {
            errors.push({ field: 'author_email', msg: 'Invalid email format for guest comments.' });
        }
    }

    if (errors.length > 0) {
        return { success: false, errors };
    }

    try {
        const [[post]] = await db.query("SELECT id FROM posts WHERE slug = ? AND status = 'published'", [postSlug]);
        if (!post) {
            return { success: false, errors: [{ msg: 'Post not found or not open for comments.' }] };
        }

        const newComment = {
            post_id: post.id,
            user_id: userId,
            parent_comment_id: parent_comment_id,
            content: content.trim(),
            author_name: finalAuthorName,
            author_email: finalAuthorEmail,
            ip_address: ip_address,
            is_approved: false, // Comments require approval by default
            // created_at and updated_at will be set by DB default or CURRENT_TIMESTAMP
        };

        const [result] = await db.query("INSERT INTO comments SET ?", newComment);
        
        // TODO: Optionally, send a notification to admin about new comment
        // notificationService.sendNotification('new_comment_admin_approval', adminEmail, { ... });


        return { success: true, commentId: result.insertId, needsApproval: true };

    } catch (error) {
        console.error("Error in addCommentToPost:", error);
        // Check for specific DB errors like foreign key constraint for parent_comment_id if necessary
        return { success: false, errors: [{ msg: 'Could not save your comment due to a server error.' }] };
    }
};

/**
 * Fetches data for the blog sidebar (recent posts and categories).
 * @returns {Promise<object>} Object containing recentPosts and categories.
 */
exports.getBlogSidebarData = async () => {
    try {
        const [recentPostsData, categoriesData] = await Promise.all([
            exports.getRecentPosts(5, true), // Get 5 recent published posts
            exports.getCategories(10)          // Get up to 10 categories
        ]);

        return {
            recentPosts: recentPostsData.posts || [],
            categories: categoriesData.categories || []
        };
    } catch (error) {
        console.error("Error in getBlogSidebarData:", error);
        // Return empty arrays on error to prevent crashing the page
        return { recentPosts: [], categories: [] };
    }
};

 /**
 * Fetches data for the blog sidebar (e.g., recent posts, all categories).
 * @returns {Promise<object>} Object containing recentPosts and categories.
 */

exports.getBlogSidebarData = async () => {
    try {
        const recentPostsSql = `
            SELECT title, slug, DATE_FORMAT(published_at, '%M %d, %Y') as published_at_formatted 
            FROM posts 
            WHERE status = 'published' 
            ORDER BY published_at DESC 
            LIMIT 5`; // Or your desired limit
        const [recentPosts] = await db.query(recentPostsSql);

        const allCategoriesSql = `
            SELECT pc.name, pc.slug, COUNT(pcp.post_id) as post_count
            FROM post_categories pc
            LEFT JOIN post_category_pivot pcp ON pc.id = pcp.category_id
            LEFT JOIN posts p ON pcp.post_id = p.id AND p.status = 'published'
            GROUP BY pc.id, pc.name, pc.slug
            HAVING post_count > 0 -- Only show categories with published posts
            ORDER BY pc.name ASC`;
        const [allCategories] = await db.query(allCategoriesSql);

        return { recentPosts, categories: allCategories };
    } catch (error) {
        console.error("Error fetching blog sidebar data:", error);
        return { recentPosts: [], categories: [] }; // Return empty defaults on error
    }
};


/**
 * Fetches post categories.
 * @param {number} [limit=0] - Limit the number of categories returned (0 for all).
 * @returns {Promise<object>} Object containing categories.
 */
exports.getCategories = async (limit = 0) => {
    // This is a basic implementation. A more advanced version would count posts in each category.
    let sql = `
        SELECT 
            pc.id, pc.name, pc.slug, pc.description,
            (SELECT COUNT(pcp.post_id) 
             FROM post_category_pivot pcp 
             JOIN posts p ON pcp.post_id = p.id 
             WHERE pcp.category_id = pc.id AND p.status = 'published') as post_count
        FROM post_categories pc
        HAVING post_count > 0  -- Only show categories with published posts
        ORDER BY pc.name ASC`;

    if (limit > 0) {
        sql += ` LIMIT ${parseInt(limit, 10)}`;
    }

    try {
        const [categories] = await db.query(sql);
        return { categories };
    } catch (error) {
        console.error("Error in getCategories:", error);
        // If post_categories table doesn't exist, this will fail.
        // Consider returning an empty array gracefully.
        if (error.code === 'ER_NO_SUCH_TABLE') {
            console.warn("post_categories table not found. Categories feature will be limited.");
            return { categories: [] };
        }
        throw error;
    }
};


// --- Admin Panel Specific Post Service Methods (Example - can be in adminPostService.js) ---

/**
 * Creates a new blog post. (Admin)
 * @param {object} postData - Data for the new post.
 * @param {number} userId - ID of the user creating the post.
 * @returns {Promise<object>} Result of the insert operation.
 */
exports.createPost = async (postData, userId) => {
    const { title, content, summary, status, feature_image_path, category_ids = [] } = postData;
    const slug = slugify(title); // Implement or import a slugify function

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const post = {
            user_id: userId,
            title,
            slug,
            content,
            summary: summary || content.substring(0, 250), // Auto-generate summary if not provided
            status: status || 'draft',
            feature_image_path,
            published_at: status === 'published' ? new Date() : null,
            // created_at, updated_at are handled by DB
        };
        const [result] = await connection.query('INSERT INTO posts SET ?', post);
        const postId = result.insertId;

        if (category_ids && category_ids.length > 0) {
            const categoryValues = category_ids.map(catId => [postId, parseInt(catId)]);
            await connection.query('INSERT INTO post_category_pivot (post_id, category_id) VALUES ?', [categoryValues]);
        }

        await connection.commit();
        return { success: true, postId, slug };
    } catch (error) {
        await connection.rollback();
        console.error("Error creating post:", error);
        // Check for duplicate slug (ER_DUP_ENTRY for unique constraint)
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error(`A post with the title "${title}" (slug: "${slug}") already exists. Please choose a different title.`);
        }
        throw error;
    } finally {
        if (connection) connection.release();
    }
};


/**
 * Updates an existing blog post. (Admin)
 * @param {number} postId - ID of the post to update.
 * @param {object} postData - Data to update.
 * @param {Array<number>} [category_ids] - Array of category IDs for the post.
 * @returns {Promise<object>} Result of the update operation.
 */
exports.updatePost = async (postId, postData, category_ids = null) => { // category_ids can be null if not updating categories
    const { title, content, summary, status, feature_image_path, slug: newSlug } = postData;
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [[existingPost]] = await connection.query('SELECT slug, status as old_status FROM posts WHERE id = ?', [postId]);
        if (!existingPost) {
            throw new Error('Post not found for update.');
        }

        const updateData = { ...postData }; // Clone postData
        delete updateData.category_ids; // Remove category_ids if it was passed in postData object

        if (title && !newSlug) { // If title changes but slug is not explicitly provided, re-slugify
            updateData.slug = slugify(title);
        } else if (newSlug) {
            updateData.slug = slugify(newSlug); // Ensure provided slug is clean
        }


        // Handle published_at timestamp
        if (status === 'published' && existingPost.old_status !== 'published') {
            updateData.published_at = new Date(); // Set published_at if transitioning to published
        } else if (status !== 'published') {
            updateData.published_at = null; // Clear published_at if unpublishing
        }
        // If already published and status remains published, published_at is not changed unless explicitly passed

        updateData.updated_at = new Date(); // Always update updated_at

        const [result] = await connection.query('UPDATE posts SET ? WHERE id = ?', [updateData, postId]);

        // Handle categories if category_ids is provided (even if it's an empty array)
        if (category_ids !== null) {
            await connection.query('DELETE FROM post_category_pivot WHERE post_id = ?', [postId]);
            if (category_ids.length > 0) {
                const categoryValues = category_ids.map(catId => [postId, parseInt(catId)]);
                await connection.query('INSERT INTO post_category_pivot (post_id, category_id) VALUES ?', [categoryValues]);
            }
        }

        await connection.commit();
        return { success: true, affectedRows: result.affectedRows, newSlug: updateData.slug || existingPost.slug };
    } catch (error) {
        await connection.rollback();
        console.error(`Error updating post ${postId}:`, error);
        if (error.code === 'ER_DUP_ENTRY') {
             const conflictingSlug = title ? slugify(title) : newSlug;
            throw new Error(`A post with a similar title or the slug "${conflictingSlug}" already exists. Please choose a different title/slug.`);
        }
        throw error;
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Deletes a post. (Admin)
 * @param {number} postId - ID of the post to delete.
 * @returns {Promise<object>} Result of the delete operation.
 */
exports.deletePost = async (postId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        // Delete associated comments first (or set post_id to NULL if you want to keep comments)
        await connection.query('DELETE FROM comments WHERE post_id = ?', [postId]);
        // Delete category associations
        await connection.query('DELETE FROM post_category_pivot WHERE post_id = ?', [postId]);
        // Delete the post
        const [result] = await connection.query('DELETE FROM posts WHERE id = ?', [postId]);
        await connection.commit();
        return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
        await connection.rollback();
        console.error(`Error deleting post ${postId}:`, error);
        throw error;
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Fetches a single post by ID for admin editing.
 * @param {number} postId - The ID of the post.
 * @returns {Promise<object|null>} The post object or null if not found.
 */
exports.getPostByIdForAdmin = async (postId) => {
    const sql = `
        SELECT 
            p.*, 
            u.username as author_username, u.first_name, u.last_name
            ${/* Add GROUP_CONCAT for category_ids */''}
            ,(SELECT GROUP_CONCAT(pcp.category_id) FROM post_category_pivot pcp WHERE pcp.post_id = p.id) as category_ids_csv
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.id = ?`;
    try {
        const [[post]] = await db.query(sql, [postId]);
        if (post && post.category_ids_csv) {
            post.category_ids = post.category_ids_csv.split(',').map(id => parseInt(id, 10));
        } else if (post) {
            post.category_ids = [];
        }
        return post;
    } catch (error) {
        console.error(`Error fetching post by ID ${postId} for admin:`, error);
        throw error;
    }
};


// Ensure other service functions are also exported if they exist
// module.exports = { getPostBySlugWithComments, getBlogSidebarData, ... };


/*
module.exports = {
  //getPublishedPosts, 
  //getRecentPosts, 
  getPostBySlugWithComments,
  //addCommentToPost, 
  getBlogSidebarData, 
  getCategories, 
  createPost,
  updatePost, 
  deletePost, 
  getPostByIdForAdmin
};
*/


// module.exports = { getPostBySlugWithComments, getBlogSidebarData, ... };


// services/postService.js
//const db = require('../config/db');
// ...
/*
exports.getPublishedPosts = async ({ page = 1, limit = 9, searchQuery = '' }) => {
    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereClauses = ["p.status = 'published'"];

    if (searchQuery) {
        whereClauses.push("(p.title LIKE ? OR p.content LIKE ?)");
        queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }
    
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    queryParams.push(limit, offset);

    const postsSql = `
        SELECT p.id, p.title, p.slug, p.summary, p.content, p.feature_image_path, 
               DATE_FORMAT(p.published_at, '%M %d, %Y') as published_at_formatted, 
               u.username as author_username, u.first_name, u.last_name,
               (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = TRUE) as approved_comment_count 
        FROM posts p LEFT JOIN users u ON p.user_id = u.id 
        ${whereSql}
        ORDER BY p.published_at DESC LIMIT ? OFFSET ?`;
    
    const countSql = `SELECT COUNT(*) as total_posts FROM posts p ${whereSql}`;
    
    const [posts] = await db.query(postsSql, queryParams);
    const [[{ total_posts }]] = await db.query(countSql, queryParams.slice(0, queryParams.length - 2)); // Exclude limit & offset

    const postsWithAuthor = posts.map(post => ({
        ...post,
        author_name: post.first_name && post.last_name ? `${post.first_name} ${post.last_name}` : post.author_username || 'ConstructPro Team'
    }));

    return {
        posts: postsWithAuthor,
        totalPosts: total_posts,
        totalPages: Math.ceil(total_posts / limit),
        currentPage: parseInt(page)
    };
};
// ... other methods like getPostBySlugWithComments, addCommentToPost, getBlogSidebarData ...




*/


// module.exports = { getPostBySlugWithComments, getBlogSidebarData, ... };
