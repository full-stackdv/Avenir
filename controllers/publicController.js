
// Avenir Construction/controllers/publicController.js
const db = require('../config/db'); // Keep for blog posts if still needed
const pageContentService = require('../services/pageContentService'); // <<< NEW IMPORT
const settingsService = require('../services/settingsService'); // For fallbacks, if needed
const postService = require('../services/postService'); // Assuming you have this for recent posts
 

// Render Homepage
exports.renderHomepage = async (req, res, next) => {
    try {
        const pageKey = 'home'; // Matches the page_key in your page_content table
        const [pageData, recentPostsData] = await Promise.all([
            pageContentService.getPageContent(pageKey),
            postService.getRecentPosts(3, true) // Get 3 published posts, true for published only
        ]);

        res.render('index', { // since directory is views/index.ejs
            title: (pageData.meta_title || settingsService.getSetting('site_name') || 'Avenir Construction') + ' - Home', // Example: use meta_title from pageData if exists
            pageTitle: pageData.hero_main_title || 'Welcome to Avenir Construction', // Fallback if needed
            layout: './layouts/public_layout', // Standardized
            content: pageData, // Pass all fetched content for 'home'
            recentPosts: recentPostsData.posts || [], // Pass recent posts
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user,
            // For contact form on homepage if it exists and posts back to /contact
           contactFormData: req.session.contactFormData && req.session.contactFormData.source_page === 'homepage' ? req.session.contactFormData : {},
            contactFormErrors: req.session.contactFormErrors && req.session.contactFormData && req.session.contactFormData.source_page === 'homepage' ? req.session.contactFormErrors : [],
            getSetting: settingsService.getSetting // Provide for any remaining getSetting calls or fallbacks
        });
        // Clear session data specific to homepage contact form submission attempts
        if (req.session.contactFormData && req.session.contactFormData.source_page === 'homepage') {
            delete req.session.contactFormData;
            delete req.session.contactFormErrors;
        }
    } catch (error) {
        console.error("Error rendering homepage:", error);
        next(error);
    }
};

// @desc    Show About Us page
// @route   GET /about
// @access  Public
exports.showAboutPage = async (req, res, next) => {
    try {
        const pageKey = 'about';
        const pageData = await pageContentService.getPageContent(pageKey);

        res.render('public/about', {
            title: (pageData.meta_title || 'About Us') + ` - ${settingsService.getSetting('site_name', 'Avenir Construction')}`,
            pageTitle: pageData.hero_title || 'About Our Company',
            layout: './layouts/public_layout', // Standardized
            content: pageData,
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user,
            getSetting: settingsService.getSetting
        });
    } catch (error) {
        console.error("Error rendering about page:", error);
        next(error);
    }
};

// @desc    Show Gallery page
// @route   GET /gallery
// @access  Public
exports.showGalleryPage = async (req, res, next) => {
    try {
        const pageKey = 'gallery';
        const pageData = await pageContentService.getPageContent(pageKey);

        res.render('public/gallery', {
            title: (pageData.meta_title || 'Project Gallery') + ` - ${settingsService.getSetting('site_name', 'Avenir Construction')}`,
            pageTitle: pageData.hero_title || 'Our Projects Showcase',
            layout: './layouts/public_layout', // Standardized
            content: pageData, // Contains projects_list, filter_buttons etc.
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user,
            getSetting: settingsService.getSetting
        });
    } catch (error) {
        console.error("Error rendering gallery page:", error);
        next(error);
    }
};


// @desc    Show Blog listing page
// @route   GET /blog
// @access  Public
exports.showBlogPage = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        // Use settingsService for items_per_page for consistency
        const limit = parseInt(settingsService.getSetting('blog_posts_per_page', 9));
        const offset = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        // Fetch recent posts and categories for the sidebar (using postService)
        const [sidebarData, blogPostsData] = await Promise.all([
            postService.getBlogSidebarData(), // Expects { recentPosts: [], categories: [] }
            postService.getPublishedPosts({ page, limit, searchQuery }) // Expects { posts: [], totalPosts, totalPages, currentPage }
        ]);


        res.render('public/blog', {
            title: 'Avenir Construction Blog',
            pageTitle: searchQuery ? `Search Results for "${searchQuery}"` : 'Avenir Construction Blog',
            posts: blogPostsData.posts || [],
            currentPage: blogPostsData.currentPage || page,
            totalPages: blogPostsData.totalPages || 0,
            totalPosts: blogPostsData.totalPosts || 0,
            searchQuery: searchQuery,
            recentPosts: sidebarData.recentPosts || [], // For sidebar partial
            categories: sidebarData.categories || [],   // For sidebar partial
            layout: './layouts/public_layout', // Standardized
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user,
            getSetting: settingsService.getSetting
        });
    } catch (error) {
        console.error("Error fetching blog posts:", error);
        next(error);
    }
};


/*
// @desc    Show Blog listing page
// @route   GET /blog
// @access  Public
exports.showBlogPage = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(settingsService.getSetting('blog_posts_per_page', 9));
        // const offset = (page - 1) * limit; // offset calculation is usually done within postService
        const searchQuery = req.query.search || '';

        const [sidebarData, blogPostsData] = await Promise.all([
            postService.getBlogSidebarData(),
            postService.getPublishedPosts({ page, limit, searchQuery })
        ]);

        // For the blog page title itself, you might want to fetch 'blog_listing' page_key content
         const pageKey = 'blog_listing'; // Example
         const blogPageContent = await pageContentService.getPageContent(pageKey);
        // Then use blogPageContent.header_title or similar.
        // For now, using the logic from your controller.

        res.render('public/blog', {
            title: (searchQuery ? `Search: ${searchQuery}` : settingsService.getSetting('blog_page_meta_title', 'Blog')) + ` - ${settingsService.getSetting('site_name', 'ConstructPro')}`,
            pageTitle: searchQuery ? `Search Results for "${searchQuery}"` : settingsService.getSetting('blog_page_main_heading', 'ConstructPro Blog'),
            pageSubtitle: settingsService.getSetting('blog_page_subtitle', 'Insights, news, and updates...'), // Example for subtitle
            posts: blogPostsData.posts || [],
            currentPage: blogPostsData.currentPage || page,
            totalPages: blogPostsData.totalPages || 0,
            totalPosts: blogPostsData.totalPosts || 0,
            searchQuery: searchQuery,
            recentPosts: sidebarData.recentPosts || [],
            categories: sidebarData.categories || [],
            layout: './layouts/public_layout', // Adjusted
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user,
            getSetting: settingsService.getSetting
        });
    } catch (error) {
        console.error("Error fetching blog posts:", error);
        next(error);
    }
};
*/

/*
// @desc    Show single blog post page
// @route   GET /blog/:slug
// @access  Public
exports.showSinglePostPage = async (req, res, next) => {
    try {
        const slug = req.params.slug;
        // Use postService to get single post and its comments
        const postData = await postService.getPostBySlugWithComments(slug);

        if (!postData || !postData.post) {
            console.warn(`Attempt to access non-existent or unpublished post with slug: ${slug}`);
            const err = new Error('Post Not Found');
            err.status = 404;
            return next(err);
        }

        const { post, comments } = postData;

        // Increment view count (moved to postService.getPostBySlugWithComments if desired)
        // For simplicity, keeping it here for now if postService doesn't handle it.
        if (post && post.id) {
             try {
                await db.query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", [post.id]);
             } catch(vcError){
                console.error("Failed to update view count for post " + post.id, vcError);
             }
        }
        
        // Fetch recent posts and categories for the sidebar (using postService)
        const sidebarData = await postService.getBlogSidebarData();

        res.render('public/single-post', {
            title: `${post.title} - Avenir Construction Blog`,
            pageTitle: post.title,
            post: post,
            comments: comments || [],
            commentFormData: req.session.commentFormData || {},
            commentFormErrors: req.session.commentFormErrors || [],
            currentUser: req.session.user,
            isAuthenticated: !!req.session.user,
            recentPosts: sidebarData.recentPosts || [], // For sidebar partial
            categories: sidebarData.categories || [],   // For sidebar partial
            layout: './layouts/public_layout', // Standardized
            getSetting: settingsService.getSetting
        });
        delete req.session.commentFormData;
        delete req.session.commentFormErrors;

    } catch (error) {
        console.error(`Error fetching single post with slug '${req.params.slug}':`, error);
        next(error);
    }
};
*/

// @desc    Show single blog post page
// @route   GET /blog/:slug
// @access  Public
exports.showSinglePostPage = async (req, res, next) => {
    try {
        const slug = req.params.slug;
        const postData = await postService.getPostBySlugWithComments(slug); // This now includes post.categories and post.documents

        if (!postData || !postData.post) {
            console.warn(`Attempt to access non-existent or unpublished post with slug: ${slug}`);
            const err = new Error('Post Not Found');
            err.status = 404;
            return next(err); // Pass to error handling middleware
        }

        const { post, comments } = postData; // post object now has .categories and .documents

        // View count increment is now handled within postService

        const sidebarData = await postService.getBlogSidebarData(); // Assuming this fetches recentPosts and allCategories for sidebar

        res.render('public/single-post', {
            title: `${post.meta_title || post.title} - ${settingsService.getSetting('blog_page_meta_title', 'Blog')} - ${settingsService.getSetting('site_name', 'ConstructPro')}`,
            meta_description: post.meta_description || settingsService.getSetting('blog_page_meta_description', ''), // For SEO
            pageTitle: post.title,
            post: post, // This object now contains .categories and .documents
            comments: comments || [],
            commentFormData: req.session.commentFormData || {},
            commentFormErrors: req.session.commentFormErrors || [],
            success_msg_comment: req.flash('success_msg_comment')[0], // Get the first message if any
            currentUser: req.session.user,
            isAuthenticated: !!req.session.user,
            recentPosts: sidebarData.recentPosts || [],
            allBlogCategories: sidebarData.categories || [], // Renamed for clarity to avoid conflict with post.categories
            layout: './layouts/public_layout',
            getSetting: settingsService.getSetting
        });
        delete req.session.commentFormData;
        delete req.session.commentFormErrors;

    } catch (error) {
        console.error(`Error fetching single post with slug '${req.params.slug}':`, error);
        next(error); // Pass to error handling middleware
    }
};




// @desc    Handle new comment submission
// @route   POST /blog/:slug/comments
// @access  Public (with moderation)
exports.handleAddComment = async (req, res, next) => {
    const postSlug = req.params.slug;
    const { content } = req.body;
    let { author_name, author_email } = req.body;
    const currentUser = req.session.user;
    let errors = [];

    try {
        // Use postService to add comment
        const result = await postService.addCommentToPost(postSlug, {
            content,
            author_name,
            author_email,
            user: currentUser, // Pass the user object
            ip_address: req.ip
        });

        if (!result.success) {
            req.session.commentFormData = req.body;
            req.session.commentFormErrors = result.errors; // Errors from postService
            return res.redirect(`/blog/${postSlug}#comment-form`);
        }

        req.flash('info_msg', 'Your comment has been submitted and is awaiting moderation. Thank you!');
        res.redirect(`/blog/${postSlug}#comments`);

    } catch (error) { // Catch unexpected errors from service or DB
        console.error('Error saving comment via controller:', error);
        req.session.commentFormData = req.body;
        // Ensure commentFormErrors is always an array for the EJS
        req.session.commentFormErrors = req.session.commentFormErrors && req.session.commentFormErrors.length > 0 
                                       ? req.session.commentFormErrors 
                                       : [{ msg: 'Server error: Could not save your comment. Please try again.' }];
        res.redirect(`/blog/${postSlug}#comment-form`);
    }
};

// @desc    Show Contact Us page
// @route   GET /contact
// @access  Public
exports.showContactPage = async (req, res, next) => {
    try {
        const pageKey = 'contact'; // Assuming you might have some editable sections for contact page
        const pageData = await pageContentService.getPageContent(pageKey);

        const initialFormData = req.session.user
            ? { name: `${req.session.user.first_name || ''} ${req.session.user.last_name || ''}`.trim() || req.session.user.username, email: req.session.user.email }
            : {};

        res.render('public/contact', {
            title: (pageData.meta_title || 'Contact Us') + ` - ${settingsService.getSetting('site_name', 'Avenir Construction')}`,
            pageTitle: pageData.hero_title || 'Get In Touch With Us',
            layout: './layouts/public_layout', // Standardized
            content: pageData, // Pass dynamic content for contact page
            formData: req.session.contactFormData || initialFormData,
            errors: req.session.contactFormErrors || [],
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user,
            getSetting: settingsService.getSetting
        });
        delete req.session.contactFormData;
        delete req.session.contactFormErrors;
    } catch (error) {
        console.error("Error rendering contact page:", error);
        next(error);
    }
};

// @desc    Handle contact form submission
// @route   POST /contact or other public route
// @access  Public
exports.handleContactForm = async (req, res, next) => {
    const { name, email, subject, message, source_page } = req.body;
    let errors = [];

    if (!name || name.trim() === '') errors.push({ field: 'name', message: 'Name is required.' });
    if (name && name.length > 100) errors.push({ field: 'name', message: 'Name is too long (max 100).' });

    if (!email || email.trim() === '') errors.push({ field: 'email', message: 'Email is required.' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ field: 'email', message: 'Invalid email format.' });
    if(email && email.length > 255) errors.push({ field: 'email', message: 'Email is too long (max 255).' });


    if (!message || message.trim() === '') errors.push({ field: 'message', message: 'Message is required.' });
    if (message && message.length > 2000) errors.push({ field: 'message', message: 'Message is too long (max 2000).' });

    if (subject && subject.length > 255) errors.push({ field: 'subject', message: 'Subject is too long (max 255).' });


    // Determine redirect path based on source_page
    let redirectAnchor = '#contact-form-section'; // Default anchor
    if (source_page === 'homepage' && req.body.landingContactForm) { // More specific check for homepage form
        redirectAnchor = '#landingContactForm'; // Assuming the form on homepage has this ID
    }
    const redirectPath = source_page === 'homepage' ? '/' : (source_page === 'contact_page' ? '/contact' : '/');


    if (errors.length > 0) {
        req.session.contactFormData = { ...req.body, source_page }; // Persist source_page too
        req.session.contactFormErrors = errors;
        req.flash('error_array', errors.map(e => e.message));
        return res.redirect(redirectPath + redirectAnchor);
    }

    try {
        const newMessage = {
            name: name.trim(),
            email: email.trim(),
            subject: subject ? subject.trim() : 'No Subject Provided', // Ensure subject isn't null if DB expects it
            message: message.trim(),
            ip_address: req.ip,
            is_read: false,
            status: 'New',
            source_page: source_page || 'unknown' // Store where the form was submitted from
        };

        await db.query("INSERT INTO contact_messages SET ?", newMessage);

        // Optionally send an email notification to admin(s) using notificationService
        try {
            await notificationService.sendNotification('new_contact_message_admin', settingsService.getSetting('admin_email'), {
                contactName: newMessage.name,
                contactEmail: newMessage.email,
                contactSubject: newMessage.subject,
                contactMessage: newMessage.message.substring(0, 200) + (newMessage.message.length > 200 ? '...' : ''), // Snippet
                messageLink: `${req.protocol}://${req.get('host')}/admin/contact-messages` // Link to admin panel
            });
        } catch (emailError) {
            console.warn("Failed to send admin notification for new contact message:", emailError);
        }


        req.flash('success_msg', 'Your message has been sent successfully! We will get back to you soon.');
        delete req.session.contactFormData;
        delete req.session.contactFormErrors;
        res.redirect(redirectPath + redirectAnchor);

    } catch (error) {
        console.error("Error saving contact message:", error);
        req.session.contactFormData = { ...req.body, source_page };
        req.session.contactFormErrors = [{ message: 'Sorry, there was an error sending your message. Please try again later.' }];
        req.flash('error_msg', 'Sorry, there was an error sending your message. Please try again later.');
        res.redirect(redirectPath + redirectAnchor);
    }
};

// Module exports
module.exports = exports;


/*
// Avenircon/controllers/publicController.js
const db = require('../config/db');

// Render Homepage (This is mostly a placeholder if routes/app.js handles GET / directly)
// The main logic for homepage is in routes/app.js -> router.get('/')
// This controller method would only be called if a route explicitly targets publicController.renderHomepage.
exports.renderHomepage = (req, res, next) => { // Added next
    try {
        res.render('index', { // Assuming views/index.ejs
            title: 'AvenirCon - Home',
            pageTitle: 'Welcome to Avenir Construction', // For layout H1
            layout: './layouts/public_layout',
        });
    } catch (error) {
        console.error("Error rendering homepage via publicController:", error);
        next(error);
    }
};

// @desc    Show About Us page
// @route   GET /about
// @access  Public
exports.showAboutPage = (req, res, next) => { // Added next
    try {
        res.render('public/about', { // Ensure views/public/about.ejs exists
            title: 'About Us - Avenir Construction',
            pageTitle: 'About Avenir Construction',
            layout: './layouts/public_layout'
        });
    } catch (error) {
        console.error("Error rendering about page:", error);
        next(error);
    }
};

// @desc    Show Blog listing page
// @route   GET /blog
// @access  Public
exports.showBlogPage = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(process.env.BLOG_POSTS_PER_PAGE) || 9; // Configurable posts per page
        const offset = (page - 1) * limit;

        const [posts] = await db.query(
            "SELECT p.id, p.title, p.slug, p.summary, p.feature_image_path, " +
            "DATE_FORMAT(p.published_at, '%M %d, %Y') as published_at_formatted, " +
            "u.username as author_username, u.first_name, u.last_name, " + // Added user details for author
            "(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = TRUE) as approved_comment_count " +
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id " +
            "WHERE p.status = 'published' ORDER BY p.published_at DESC LIMIT ? OFFSET ?",
            [limit, offset]
        );

        // Add a derived author_display_name to each post
        const postsWithAuthor = posts.map(post => ({
            ...post,
            author_display_name: post.first_name && post.last_name ? `${post.first_name} ${post.last_name}` : post.author_username || 'Avenircon Team'
        }));

        const [[{ total_posts }]] = await db.query(
            "SELECT COUNT(*) as total_posts FROM posts WHERE status = 'published'"
        );
        const totalPages = Math.ceil(total_posts / limit);

        res.render('public/blog', { // Ensure views/public/blog.ejs exists
            title: 'AvenirCon Blog',
            pageTitle: 'AvenirCon Blog',
            posts: postsWithAuthor,
            currentPage: page,
            totalPages: totalPages,
            layout: './layouts/public_layout'
        });
    } catch (error) {
        console.error("Error fetching blog posts:", error);
        next(error);
    }
};


// @desc    Show About Us page
// @route   GET /about
// @access  Public
exports.showGalleryPage = (req, res, next) => { // Added next
    try {
        res.render('public/gallery', { // Ensure views/public/about.ejs exists
            title: 'Gallery - Avenir Construction',
            pageTitle: 'Avenir Construction - Our Projects',
            layout: './layouts/public_layout'
        });
    } catch (error) {
        console.error("Error rendering about page:", error);
        next(error);
    }
};

// @desc    Handle new comment submission
// @route   POST /blog/:slug/comments
// @access  Public (with moderation)
exports.handleAddComment = async (req, res, next) => {
    const postSlug = req.params.slug;
    const { content } = req.body; // Main content
    let { author_name, author_email } = req.body; // Guest fields
    const currentUser = req.session.user;
    let errors = [];

    let postId;
    try { 
        const [postRows] = await db.query('SELECT id FROM posts WHERE slug = ? AND status = "published"', [postSlug]);
        if (postRows.length === 0) {
            req.flash('error_msg', 'Cannot comment on this post as it may not exist or is not published.');
            return res.redirect(req.headers.referer || '/blog');
        }
        postId = postRows[0].id;
    } catch (dbError) {
        console.error('Error fetching post ID for comment:', dbError);
        req.flash('error_msg', 'Server error. Could not submit comment at this time.');
        return res.redirect(req.headers.referer || `/blog/${postSlug}`);
    }

    if (!content || content.trim() === '') errors.push({ msg: 'Comment content cannot be empty.' });
    if (content && content.length > 2000) errors.push({ msg: 'Comment is too long (max 2000 characters).' });

    let effectiveAuthorName;
    let effectiveAuthorEmail;

    if (currentUser) {
        effectiveAuthorName = currentUser.username || `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim();
        effectiveAuthorEmail = currentUser.email;
    } else {
        author_name = author_name ? author_name.trim() : '';
        author_email = author_email ? author_email.trim() : null;

        if (!author_name) errors.push({ msg: 'Name is required for guest comments.' });
        if (author_name && author_name.length > 100) errors.push({ msg: 'Name is too long (max 100 characters).' });
        
        if (author_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author_email)) {
             errors.push({ msg: 'Please enter a valid email address or leave it blank.' });
        }
        if (author_email && author_email.length > 255) errors.push({ msg: 'Email is too long (max 255 characters).' });
        
        effectiveAuthorName = author_name;
        effectiveAuthorEmail = author_email;
    }

    if (errors.length > 0) {
        req.session.commentFormData = req.body; 
        req.session.commentFormErrors = errors;
        return res.redirect(`/blog/${postSlug}#comment-form`); 
    }

    const newComment = {
        post_id: postId,
        content: content.trim(),
        is_approved: false, 
        user_id: currentUser ? currentUser.id : null,
        author_name: effectiveAuthorName, 
        author_email: effectiveAuthorEmail,
        // ip_address: req.ip // Optional: store IP
    };

    try {
        await db.query('INSERT INTO comments SET ?', newComment);
        req.flash('info_msg', 'Your comment has been submitted and is awaiting moderation. Thank you!');
        res.redirect(`/blog/${postSlug}#comments`); // Anchor to comments section
    } catch (error) {
        console.error('Error saving comment:', error);
        req.session.commentFormData = req.body;
        req.session.commentFormErrors = [{ msg: 'Server error: Could not save your comment. Please try again.' }];
        res.redirect(`/blog/${postSlug}#comment-form`);
    }
};

// @desc    Show Contact Us page
// @route   GET /contact
// @access  Public
exports.showContactPage = (req, res, next) => { 
    try {
        const initialFormData = req.session.user
            ? { name: `${req.session.user.first_name || ''} ${req.session.user.last_name || ''}`.trim() || req.session.user.username, email: req.session.user.email }
            : {};

        res.render('public/contact', { 
            title: 'Contact Us - AvenirCon',
            pageTitle: 'Get In Touch With Us',
            formData: req.session.contactFormData || initialFormData,
            errors: req.session.contactFormErrors || [],
            layout: './layouts/public_layout'
        });
        delete req.session.contactFormData; 
        delete req.session.contactFormErrors;
    } catch (error) {
        console.error("Error rendering contact page:", error);
        next(error);
    }
};



 
// @desc    Handle contact form submission
// @route   POST /contact or other public route
// @access  Public
exports.handleContactForm = async (req, res, next) => {
    const { name, email, subject, message, source_page } = req.body; // source_page helps redirect
    let errors = [];

    // --- Validation ---
    if (!name || name.trim() === '') errors.push({ field: 'name', message: 'Name is required.' });
    if (!email || email.trim() === '') errors.push({ field: 'email', message: 'Email is required.' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ field: 'email', message: 'Invalid email format.' });
    if (!message || message.trim() === '') errors.push({ field: 'message', message: 'Message is required.' });
    if (subject && subject.length > 255) errors.push({ field: 'subject', message: 'Subject is too long.' });
    if (name && name.length > 100) errors.push({ field: 'name', message: 'Name is too long.' });

    const redirectPath = source_page === 'homepage' ? '/' : (source_page === 'contactpage' ? '/contact' : '/'); // Determine redirect path

    if (errors.length > 0) {
        // Store errors and form data in session for PRG pattern
        req.session.contactFormData = { ...req.body }; // Store all submitted data
        req.session.contactFormErrors = errors;
        req.flash('error_array', errors.map(e => e.message)); // For _messages partial if it handles arrays
        return res.redirect(redirectPath + '#contact-form-section'); // Redirect back to the form
    }

    try {
        const newMessage = {
            name: name.trim(),
            email: email.trim(),
            subject: subject ? subject.trim() : null,
            message: message.trim(),
            ip_address: req.ip, // Get user's IP address
            is_read: false, // New messages are unread
            status: 'New'   // Using the ENUM from your contact_messages table
        };

        await db.query("INSERT INTO contact_messages SET ?", newMessage);

        // TODO: Optionally send an email notification to admin(s) about the new message

        req.flash('success_msg', 'Your message has been sent successfully! We will get back to you soon.');
        // Clear form data from session on success
        delete req.session.contactFormData;
        delete req.session.contactFormErrors;
        res.redirect(redirectPath + '#contact-form-section');

    } catch (error) {
        console.error("Error saving contact message:", error);
        req.session.contactFormData = { ...req.body };
        req.session.contactFormErrors = [{ message: 'Sorry, there was an error sending your message. Please try again later.' }];
        req.flash('error_msg', 'Sorry, there was an error sending your message. Please try again later.');
        res.redirect(redirectPath + '#contact-form-section');
    }
};



// @desc    Show single blog post page
// @route   GET /blog/:slug
// @access  Public
exports.showSinglePostPage = async (req, res, next) => {
    try {
        const slug = req.params.slug;
        const [postRows] = await db.query(
            "SELECT p.*, " +
            "u.username as author_username, u.first_name, u.last_name " + // Added user details for author
            "FROM posts p LEFT JOIN users u ON p.user_id = u.id " +
            "WHERE p.slug = ? AND p.status = 'published'", [slug]
        );
        
        if (postRows.length === 0) {
            console.warn(`Attempt to access non-existent or unpublished post with slug: ${slug}`);
            const err = new Error('Post Not Found');
            err.status = 404;
            return next(err); 
        }
        const post = postRows[0];
        // Construct author name for display in post details
        post.author_name = post.first_name && post.last_name ? `${post.first_name} ${post.last_name}` : post.author_username || 'AvenirCon Team';

        if (post && post.id) {
            await db.query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", [post.id]);
        }
        
        const [comments] = await db.query(
            "SELECT c.id, c.content, c.author_name, c.created_at, " + // Using raw created_at for flexibility in EJS
            "u.username as user_commenter_name, u.profile_image_path " + 
            "FROM comments c LEFT JOIN users u ON c.user_id = u.id " +
            "WHERE c.post_id = ? AND c.is_approved = TRUE ORDER BY c.created_at DESC", // Show newest approved first
            [post.id]
        );
        
        res.render('public/single-post', { 
            title: `${post.title} - AvenirCon Blog`,
            pageTitle: post.title, 
            post: post,
            comments: comments,
            // Ensure these variables are correctly named for single-post.ejs
            commentFormData: req.session.commentFormData || {}, 
            commentFormErrors: req.session.commentFormErrors || [], // Changed from commentErrors to commentFormErrors
            currentUser: req.session.user, // Pass currentUser for conditional rendering in form
            isAuthenticated: !!req.session.user, // Pass isAuthenticated
            layout: './layouts/public_layout'
        });
        delete req.session.commentFormData;
        delete req.session.commentFormErrors;

    } catch (error) {
        console.error(`Error fetching single post with slug '${req.params.slug}':`, error);
        next(error);
    }
};


/*
// @desc    Handle Contact Form Submission (can be from /contact or homepage)
// @route   POST /contact (or other routes if forms post here)
// @access  Public
exports.handleContactForm = async (req, res, next) => { 
    const { name, email, subject, message, source_page } = req.body; 
    let errors = [];
    
    if (!name || name.trim() === '') errors.push({ msg: 'Name is required.' });
    if (name && name.length > 150) errors.push({ msg: 'Name is too long.' });
    if (!email || email.trim() === '') errors.push({ msg: 'Email is required.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ msg: 'Please enter a valid email address.' });
    if (!message || message.trim() === '') errors.push({ msg: 'Message is required.' });
    if (message && message.length > 2000) errors.push({ msg: 'Message is too long (max 2000 characters).' });
    if (subject && subject.length > 255) errors.push({ msg: 'Subject is too long.' });
    
    const redirectPath = source_page === 'homepage' ? '/#contact-section-landing' : '/contact'; 

    if (errors.length > 0) {
        req.session.contactFormData = req.body; 
        req.session.contactFormErrors = errors;  
        return res.redirect(redirectPath); 
    }
    
    try {
        await db.query(
            'INSERT INTO contact_messages (name, email, subject, message, source_page, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [name.trim(), email.trim(), subject ? subject.trim() : 'No Subject', message.trim(), source_page || 'contact_page']
        );
        req.flash('success_msg', 'Your message has been sent successfully! We will get back to you soon.');
        res.redirect(redirectPath + (redirectPath.includes('?') ? '&' : '?') + 'success=true'); // Ensure query param is appended correctly
    } catch (error) {
        console.error('Error saving contact message:', error);
        req.session.contactFormData = req.body;
        req.session.contactFormErrors = [{ msg: 'Server error: Could not send your message. Please try again later.' }];
        res.redirect(redirectPath);
    }
};
*/
/*
module.exports = exports; // Make sure to export the functions
*/





/*
// --- Render Pages ---

// Render Homepage (Handled by routes/app.js which renders views/index.ejs directly)
// This method might not be strictly needed if app.js's GET / handles it,
// but keeping it for potential future use or if you decide to centralize public page rendering.
exports.renderHomepage = (req, res) => {
    res.render('index', { // Assumes views/index.ejs is your landing page
        title: 'Avenircon - Home',
        pageTitle: 'Welcome to Avenircon', // More specific for the H1 in a layout
        // activePage: 'home', // This is handled by res.locals.currentPath now
        layout: './layouts/public_layout',
        // Any data needed by views/index.ejs if it were to use this controller.
        // For now, views/index.ejs is self-contained or uses res.locals.
        // Pass formData and errors from session if coming from a failed submission on homepage contact form
        formData: req.session.contactFormData || {},
        errors: req.session.contactFormErrors || []
    });
    // Clear session data after rendering for homepage contact form
    if (req.session.contactFormData && req.session.contactFormData.source_page === 'homepage') {
        delete req.session.contactFormData;
        delete req.session.contactFormErrors;
    }
};


// @desc    Handle Contact Form Submission
// @route   POST /contact
// @access  Public
exports.handleContactForm = async (req, res, next) => {
    const { name, email, subject, message, source_page } = req.body; // source_page from hidden input
    let errors = [];
    
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Name is required.' });
    if (name && name.length > 150) errors.push({ param: 'name', msg: 'Name is too long.' });
    if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ param: 'email', msg: 'Please enter a valid email address.' });
    if (!message || message.trim() === '') errors.push({ param: 'message', msg: 'Message is required.' });
    if (message && message.length > 2000) errors.push({ param: 'message', msg: 'Message is too long (max 2000 characters).' });
    if (subject && subject.length > 255) errors.push({ param: 'subject', msg: 'Subject is too long.' });
    
    const redirectPath = source_page === 'homepage' ? '/#contact-section-landing' : '/contact';

    if (errors.length > 0) {
        req.session.contactFormData = req.body; // Store submitted data in session
        req.session.contactFormErrors = errors;  // Store errors in session
        return res.redirect(redirectPath); // Redirect back to form
    }
    
    try {
        await db.query(
            'INSERT INTO contact_messages (name, email, subject, message, source_page, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [name.trim(), email.trim(), subject ? subject.trim() : 'No Subject', message.trim(), source_page || 'unknown']
        );
        req.flash('success_msg', 'Your message has been sent successfully! We will get back to you soon.');
        // Clear form data from session on success
        delete req.session.contactFormData;
        delete req.session.contactFormErrors;
        res.redirect(redirectPath); // Redirect to the same page (form should be clear or show success)
    } catch (error) {
        console.error('Error saving contact message:', error);
        req.session.contactFormData = req.body;
        req.session.contactFormErrors = [{ msg: 'Server error: Could not send your message. Please try again later.' }];
        res.redirect(redirectPath);
    }
};
*/


/*
// @desc    Handle Contact Form Submission (can be from /contact or homepage)
// @route   POST /contact (or other routes if forms post here)
// @access  Public
exports.handleContactForm = async (req, res, next) => { // Added next
    const { name, email, subject, message, source_page } = req.body; // source_page from hidden input
    let errors = [];
    
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Name is required.' });
    if (name && name.length > 150) errors.push({ param: 'name', msg: 'Name is too long.' });
    if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ param: 'email', msg: 'Please enter a valid email address.' });
    if (!message || message.trim() === '') errors.push({ param: 'message', msg: 'Message is required.' });
    if (message && message.length > 2000) errors.push({ param: 'message', msg: 'Message is too long (max 2000 characters).' });
    if (subject && subject.length > 255) errors.push({ param: 'subject', msg: 'Subject is too long.' });
    
    // Determine redirect path based on where the form was submitted from
    const redirectPath = source_page === 'homepage' ? '/#contact-section-landing' : '/contact'; // Example anchor

    if (errors.length > 0) {
        req.session.contactFormData = req.body; // Store submitted data for PRG
        req.session.contactFormErrors = errors;  // Store errors for PRG
        return res.redirect(redirectPath); // Redirect back to the form
    }
    
    try {
        await db.query(
            'INSERT INTO contact_messages (name, email, subject, message, source_page, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [name.trim(), email.trim(), subject ? subject.trim() : 'No Subject', message.trim(), source_page || 'contact_page']
        );
        req.flash('success_msg', 'Your message has been sent successfully! We will get back to you soon.');
        // DO NOT clear req.session.contactFormData here, as the GET route for /contact or / will handle it.
        res.redirect(redirectPath + '?success=true'); // Add success param if needed for client-side display
    } catch (error) {
        console.error('Error saving contact message:', error);
        req.session.contactFormData = req.body;
        req.session.contactFormErrors = [{ msg: 'Server error: Could not send your message. Please try again later.' }];
        res.redirect(redirectPath);
    }
};
*/

