
const db = require('../config/db');
const slugify = require('slugify');
const fs = require('fs'); // File System module for deleting files
const path = require('path'); // Path module

// Helper function to delete an uploaded file from a specific directory within public/uploads
const deleteUploadedFile = (directory, filename) => {
  if (!filename || !directory) {
    console.warn('deleteUploadedFile called with missing directory or filename.');
    return;
  }
  const filePath = path.join(__dirname, '../public/uploads', directory, filename);
  fs.unlink(filePath, (err) => {
    if (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error deleting file ${filename} from ${directory}:`, err);
      } else {
        // console.log(`File ${filename} not found in ${directory}, no deletion needed.`);
      }
    } else {
      console.log(`Successfully deleted file: ${filename} from ${directory}`);
    }
  });
};

// Helper function to ensure categories is an array of strings
const normalizeCategories = (categoriesInput) => {
    if (!categoriesInput) return [];
    if (Array.isArray(categoriesInput)) return categoriesInput.map(String);
    return [String(categoriesInput)]; // If single value, make it an array of one string
};


// @desc List all posts in the admin area
// @route GET /admin/posts
// @access Private (Admin/Editor)
exports.listPosts = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.id, 
        p.title, 
        p.slug, 
        p.status, 
        p.published_at, 
        p.updated_at, 
        p.feature_image_path, 
        u.username AS author_name,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = FALSE) AS pending_comment_count,
        GROUP_CONCAT(pc.name SEPARATOR ', ') AS categories_list
      FROM posts p 
      LEFT JOIN users u ON p.user_id = u.id 
      LEFT JOIN post_category_pivot pcp ON p.id = pcp.post_id
      LEFT JOIN post_categories pc ON pcp.category_id = pc.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `;
    const [posts] = await db.query(query);
    
    res.render('admin/postmanager/index', {
      title: 'Manage Posts - Admin',
      pageTitle: 'Manage Posts',
      posts: posts,
      layout: './layouts/admin_layout'
    });
  } catch (error) {
    console.error("Error fetching posts for admin:", error);
    next(error);
  }
};


// @desc Show form to create a new post
// @route GET /admin/posts/create
// @access Private (Admin/Editor)
exports.showCreatePostForm = async (req, res, next) => {
  try {
    const [allCategories] = await db.query('SELECT id, name FROM post_categories ORDER BY name ASC');
    
    // Ensure formData.categories is an array of strings if it exists from session
    let formData = req.session.createPostFormData || {};
    if (formData.categories) {
        formData.categories = normalizeCategories(formData.categories);
    }

    res.render('admin/postmanager/create', {
      title: 'Create New Post - Admin',
      pageTitle: 'Create New Post',
      formData: formData,
      errors: req.session.createPostErrors || [],
      allCategories: allCategories,
      layout: './layouts/admin_layout'
    });
    delete req.session.createPostFormData;
    delete req.session.createPostErrors;
  } catch (error) {
    console.error("Error fetching categories for create post form:", error);
    next(error);
  }
};

// @desc Handle creation of a new post
// @route POST /admin/posts/create
// @access Private (Admin/Editor)
exports.handleCreatePost = async (req, res, next) => {
  let { title, slug: inputSlug, summary, content, status, categories } = req.body;
  const userId = req.session.user.id;
  let errors = [];
  
  categories = normalizeCategories(categories); // Ensure categories is an array

  // --- Server-side Validation ---
  if (!title || title.trim() === '') errors.push({ param: 'title', msg: 'Title is required.' });
  if (title && title.length > 255) errors.push({ param: 'title', msg: 'Title cannot exceed 255 characters.' });
  if (inputSlug && inputSlug.length > 255) errors.push({ param: 'slug', msg: 'Slug cannot exceed 255 characters.' });
  if (!content || content.trim() === '') errors.push({ param: 'content', msg: 'Content is required.' });
  if (!status || !['draft', 'published', 'archived'].includes(status)) {
    errors.push({ param: 'status', msg: 'Invalid status selected.' });
  }
  if (summary && summary.length > 500) errors.push({ param: 'summary', msg: 'Summary cannot exceed 500 characters.' });

  // Validate categories
  if (categories.length > 0) {
    try {
      const [validCategories] = await db.query('SELECT id FROM post_categories WHERE id IN (?)', [categories]);
      if (validCategories.length !== categories.length) {
        errors.push({ param: 'categories', msg: 'One or more selected categories are invalid.' });
      }
    } catch (catError) {
      errors.push({ param: 'categories', msg: 'Error validating categories.' });
    }
  }
  
  if (req.fileValidationError) {
      errors.push({ param: 'feature_image', msg: req.fileValidationError });
  }
  
  if (errors.length > 0) {
    if (req.file) deleteUploadedFile('feature_images', req.file.filename);
    req.session.createPostFormData = { ...req.body, categories }; // Pass normalized categories back
    req.session.createPostErrors = errors;
    return res.redirect('/admin/posts/create');
  }
  
  // Slug generation/handling
  let finalSlug = inputSlug && inputSlug.trim() !== ''
      ? slugify(inputSlug.trim(), { lower: true, strict: true, remove: /[*+~.()'"!:@]/g })
      : slugify(title.trim(), { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });

  const connection = await db.getConnection(); // For transaction

  try {
    await connection.beginTransaction();

    let slugExists = true;
    let counter = 1;
    const baseSlug = finalSlug;
    while (slugExists) {
      const [existingSlugRows] = await connection.query('SELECT id FROM posts WHERE slug = ?', [finalSlug]);
      if (existingSlugRows.length === 0) {
        slugExists = false;
      } else {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }
  
    const newPost = {
      user_id: userId,
      title: title.trim(),
      slug: finalSlug,
      summary: summary ? summary.trim() : null,
      content: content.trim(),
      status,
      published_at: status === 'published' ? new Date() : null,
      feature_image_path: req.file ? req.file.filename : null
    };
    
    const [insertResult] = await connection.query('INSERT INTO posts SET ?', newPost);
    const newPostId = insertResult.insertId;

    if (categories.length > 0) {
      const categoryLinks = categories.map(categoryId => [newPostId, parseInt(categoryId)]);
      await connection.query('INSERT INTO post_category_pivot (post_id, category_id) VALUES ?', [categoryLinks]);
    }

    await connection.commit();
    req.flash('success_msg', 'Post created successfully.');
    res.redirect('/admin/posts');

  } catch (error) {
    await connection.rollback();
    console.error("Error creating post:", error);
    if (req.file) deleteUploadedFile('feature_images', req.file.filename);
    req.session.createPostFormData = { ...req.body, categories };
    req.session.createPostErrors = [{ msg: 'Server error while creating post. Please try again.' }];
    res.redirect('/admin/posts/create');
  } finally {
    if (connection) connection.release();
  }
};

// @desc Show form to edit an existing post
// @route GET /admin/posts/:id/edit
// @access Private (Admin/Editor)
exports.showEditPostForm = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const [postRows] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
    
    if (postRows.length === 0) {
      req.flash('error_msg', 'Post not found.');
      return res.redirect('/admin/posts');
    }
    const post = postRows[0];
    
    const [documents] = await db.query(
      "SELECT id, original_filename, stored_filename, mimetype, filesize, title, created_at FROM post_documents WHERE post_id = ? ORDER BY created_at DESC",
      [postId]
    );

    const [allCategories] = await db.query('SELECT id, name FROM post_categories ORDER BY name ASC');
    const [selectedCategoryRows] = await db.query('SELECT category_id FROM post_category_pivot WHERE post_id = ?', [postId]);
    const selectedPostCategoryIds = selectedCategoryRows.map(row => String(row.category_id));

    let formDataFromSession = req.session.editPostFormData;
    let errorsFromSession = req.session.editPostErrors;
    const docErrorsFromSession = req.session.documentUploadErrors;

    let effectiveFormData;
    if (formDataFromSession) {
        effectiveFormData = { ...formDataFromSession };
        // Ensure categories from session are correctly formatted (array of strings)
        effectiveFormData.categories = normalizeCategories(formDataFromSession.categories);
    } else {
        // On initial load, populate with DB data including categories
        effectiveFormData = { ...post, categories: selectedPostCategoryIds };
    }
    
    res.render('admin/postmanager/edit', {
      title: `Edit Post: ${post.title} - Admin`,
      pageTitle: `Edit Post: ${post.title}`,
      post: post, // Original post data for context like breadcrumbs
      post_documents: documents,
      formData: effectiveFormData, // This now includes .categories correctly
      errors: errorsFromSession || [],
      documentUploadErrors: docErrorsFromSession || [],
      allCategories: allCategories,
      // selectedPostCategoryIds: selectedPostCategoryIds, // No longer strictly needed in view if formData handles it
      layout: './layouts/admin_layout'
    });
    delete req.session.editPostFormData;
    delete req.session.editPostErrors;
    delete req.session.documentUploadErrors;
  } catch (error) {
    console.error("Error fetching post, documents, and categories for edit:", error);
    next(error);
  }
};


// @desc Handle update of an existing post
// @route POST /admin/posts/:id/edit
// @access Private (Admin/Editor)
exports.handleUpdatePost = async (req, res, next) => {
  const postId = req.params.id;
  let { title, slug: newSlugInput, summary, content, status, remove_feature_image, categories } = req.body;
  let errors = [];

  categories = normalizeCategories(categories); // Ensure categories is an array

  let originalPost;
  try {
    const [originalPostRows] = await db.query('SELECT id, slug, feature_image_path, published_at, status as original_status FROM posts WHERE id = ?', [postId]);
    if (originalPostRows.length === 0) {
      req.flash('error_msg', 'Post not found.');
      if (req.file) deleteUploadedFile('feature_images', req.file.filename);
      return res.redirect('/admin/posts');
    }
    originalPost = originalPostRows[0];
  } catch (dbError) {
    console.error("DB error fetching original post for update:", dbError);
    if (req.file) deleteUploadedFile('feature_images', req.file.filename);
    next(dbError);
    return;
  }

  // --- Validation ---
  if (!title || title.trim() === '') errors.push({ param: 'title', msg: 'Title is required.' });
  if (title && title.length > 255) errors.push({ param: 'title', msg: 'Title cannot exceed 255 characters.' });
  if (!newSlugInput || newSlugInput.trim() === '') errors.push({ param: 'slug', msg: 'Slug is required.' });
  else if (newSlugInput.length > 255) errors.push({ param: 'slug', msg: 'Slug cannot exceed 255 characters.' });
  if (!content || content.trim() === '') errors.push({ param: 'content', msg: 'Content is required.' });
  if (!status || !['draft', 'published', 'archived'].includes(status)) {
    errors.push({ param: 'status', msg: 'Invalid status selected.' });
  }
  if (summary && summary.length > 500) errors.push({ param: 'summary', msg: 'Summary cannot exceed 500 characters.' });

  // Validate categories
  if (categories.length > 0) {
    try {
      const [validCategories] = await db.query('SELECT id FROM post_categories WHERE id IN (?)', [categories]);
      if (validCategories.length !== categories.length) {
        errors.push({ param: 'categories', msg: 'One or more selected categories are invalid.' });
      }
    } catch (catError) {
      errors.push({ param: 'categories', msg: 'Error validating categories.' });
    }
  }

  if (req.fileValidationError) {
      errors.push({ param: 'feature_image', msg: req.fileValidationError });
  }
  
  let finalSlug = slugify(newSlugInput.trim(), { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
  if (finalSlug !== originalPost.slug) {
    try {
      let slugExists = true;
      let counter = 1;
      const baseSlug = finalSlug;
      while (slugExists) {
        const [existingSlug] = await db.query('SELECT id FROM posts WHERE slug = ? AND id != ?', [finalSlug, postId]);
        if (existingSlug.length === 0) {
          slugExists = false;
        } else {
          finalSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    } catch (dbError) {
        console.error("DB error checking slug uniqueness:", dbError);
        errors.push({param: 'slug', msg: 'Error checking slug uniqueness. Please try again.'});
    }
  }
  
  if (errors.length > 0) {
    if (req.file) deleteUploadedFile('feature_images', req.file.filename);
    // Ensure all fields are passed back, especially feature_image_path and categories
    req.session.editPostFormData = { 
        ...req.body, 
        feature_image_path: originalPost.feature_image_path, // Keep original image path if new one failed validation
        categories // Pass normalized categories back
    }; 
    req.session.editPostErrors = errors;
    return res.redirect(`/admin/posts/${postId}/edit`);
  }

  const connection = await db.getConnection(); // For transaction
  
  try {
    await connection.beginTransaction();

    let newFeatureImagePath = originalPost.feature_image_path;
    if (remove_feature_image === 'true') {
      if (originalPost.feature_image_path) {
        deleteUploadedFile('feature_images', originalPost.feature_image_path);
      }
      newFeatureImagePath = null;
    } else if (req.file) {
      if (originalPost.feature_image_path && originalPost.feature_image_path !== req.file.filename) {
        deleteUploadedFile('feature_images', originalPost.feature_image_path);
      }
      newFeatureImagePath = req.file.filename;
    }
    
    let newPublishedAt = originalPost.published_at; // Default to existing
    if (status === 'published') {
        if (originalPost.original_status !== 'published') { // Was not published, now is
            newPublishedAt = new Date();
        }
        // If it was already published and remains published, newPublishedAt keeps originalPost.published_at
    } else { // Status is 'draft' or 'archived'
        // If you want to clear published_at when moving to draft/archived:
        // newPublishedAt = null; 
        // Or, if you want to retain the historical publish date even if it's now unpublished:
        // newPublishedAt = originalPost.published_at; // (already the default)
        // Let's choose to keep it for historical record. If it was never published, it will remain null.
    }


    const updatedPost = {
      title: title.trim(),
      slug: finalSlug,
      summary: summary ? summary.trim() : null,
      content: content.trim(),
      status,
      feature_image_path: newFeatureImagePath,
      published_at: newPublishedAt,
      updated_at: new Date()
    };

    await connection.query('UPDATE posts SET ? WHERE id = ?', [updatedPost, postId]);

    // Update categories: Delete old, insert new
    await connection.query('DELETE FROM post_category_pivot WHERE post_id = ?', [postId]);
    if (categories.length > 0) {
      const categoryLinks = categories.map(categoryId => [postId, parseInt(categoryId)]);
      await connection.query('INSERT INTO post_category_pivot (post_id, category_id) VALUES ?', [categoryLinks]);
    }

    await connection.commit();
    req.flash('success_msg', 'Post updated successfully.');
    res.redirect('/admin/posts');

  } catch (error) {
    await connection.rollback();
    console.error("Error updating post:", error);
    if (req.file && req.file.filename !== newFeatureImagePath) { // New file was uploaded but not used due to error
      deleteUploadedFile('feature_images', req.file.filename);
    }
    req.session.editPostFormData = { 
        ...req.body, 
        feature_image_path: originalPost.feature_image_path, // Restore original image path for form
        categories // Pass normalized categories back
    };
    req.session.editPostErrors = [{ msg: 'Server error while updating post. Please try again.' }];
    res.redirect(`/admin/posts/${postId}/edit`);
  } finally {
    if (connection) connection.release();
  }
};

// @desc Handle deletion of a post
// @route POST /admin/posts/:id/delete
// @access Private (Admin/Editor)
exports.handleDeletePost = async (req, res, next) => {
  const postId = req.params.id;
  const connection = await db.getConnection(); 

  try {
    await connection.beginTransaction();

    const [postRows] = await connection.query('SELECT feature_image_path FROM posts WHERE id = ?', [postId]);
    
    if (postRows.length > 0 && postRows[0].feature_image_path) {
      deleteUploadedFile('feature_images', postRows[0].feature_image_path);
    }

    const [documents] = await connection.query("SELECT stored_filename FROM post_documents WHERE post_id = ?", [postId]);
    for (const doc of documents) {
        deleteUploadedFile('documents', doc.stored_filename);
    }
    
    // Cascade deletes should handle post_category_pivot, post_documents, comments
    // If not, delete manually:
    // await connection.query("DELETE FROM post_category_pivot WHERE post_id = ?", [postId]);
    // await connection.query("DELETE FROM post_documents WHERE post_id = ?", [postId]);
    // await connection.query("DELETE FROM comments WHERE post_id = ?", [postId]);

    const [result] = await connection.query('DELETE FROM posts WHERE id = ?', [postId]);
    
    if (result.affectedRows === 0) {
      req.flash('error_msg', 'Post not found or already deleted.');
    } else {
      req.flash('success_msg', 'Post and its associated content deleted successfully.');
    }
    await connection.commit();
    res.redirect('/admin/posts');
  } catch (error) {
    await connection.rollback();
    console.error("Error deleting post:", error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2') { // This check is good but cascade should prevent it
        req.flash('error_msg', 'Error deleting post: It is referenced by other data. Ensure database foreign keys are set to ON DELETE CASCADE.');
    } else {
        req.flash('error_msg', 'Server error deleting post.');
    }
    res.redirect('/admin/posts');
  } finally {
    if (connection) connection.release();
  }
};

// Just make sure the previewPost also fetches and passes categories if desired for the preview
// @desc    Show a preview of a post using public template within admin layout
// @route   GET /admin/posts/:id/preview
// @access  Private (Admin/Editor)
exports.previewPost = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const [postRows] = await db.query(
      `SELECT p.*, u.username as author_name 
       FROM posts p LEFT JOIN users u ON p.user_id = u.id 
       WHERE p.id = ?`, [postId]
    );
    
    if (postRows.length === 0) {
      req.flash('error_msg', 'Post not found for preview.');
      return res.redirect('/admin/posts');
    }
    const postToPreview = postRows[0];

    const [categories] = await db.query(
        `SELECT pc.id, pc.name, pc.slug 
         FROM post_categories pc
         JOIN post_category_pivot pcp ON pc.id = pcp.category_id
         WHERE pcp.post_id = ?
         ORDER BY pc.name ASC`, [postId]
    );
    postToPreview.categories = categories; // Attach categories to the post object
    
    const [comments] = await db.query( 
      "SELECT c.id, c.content, c.author_name, c.created_at, u.username as user_commenter_name " +
      "FROM comments c LEFT JOIN users u ON c.user_id = u.id " +
      "WHERE c.post_id = ? AND c.is_approved = TRUE ORDER BY c.created_at ASC", [postToPreview.id]
    );
    
    res.render('public/single-post', { 
      title: `Preview: ${postToPreview.title} - Admin`,
      pageTitle: `Admin Preview: ${postToPreview.title}`,
      post: postToPreview, // Now includes .categories
      comments: comments || [],
      currentUser: req.session.user,
      isAuthenticated: !!req.session.user,
      formData: {}, 
      errors: [],   
      layout: './layouts/admin_layout', 
      isAdminPreview: true 
    });
    
  } catch (error) {
    console.error("Error generating post preview:", error);
    next(error);
  }
};



// ... (rest of  controller methods: listPostCommentsAdmin, approveComment, etc. remain the same) ...
// ... (handleDocumentUpload, deletePostDocument, previewPost, showPostStatistics also remain largely the same,
 
// Make sure other methods like listPostCommentsAdmin, approveComment, etc. are correctly exported if they are in the same file
// exports.listPostCommentsAdmin = ...
// exports.approveComment = ...
// etc.

// The remaining functions (document management, comments, statistics) from your original controller
// can be appended here. Their core logic doesn't directly interact with the post category *form* data,
// but you might want to display post categories on some of those pages (e.g., statistics page).

// --- Document Management Controller Methods --- (Copied from original, no changes needed for category form alignment)
// @desc    Handle new document uploads for a specific post
// @route   POST /admin/posts/:postId/documents/upload
// @access  Private (Admin/Editor)
exports.handleDocumentUpload = async (req, res, next) => {
  const postId = req.params.postId;
  const uploadedById = req.session.user.id;
  const documentTitlesInput = req.body.document_titles || "";
  const documentTitlesArray = documentTitlesInput.split(',').map(title => title.trim()).filter(title => title);
  let documentUploadErrors = [];
  
  if (!req.files || req.files.length === 0) {
    req.flash('info_msg', 'No new documents were selected for upload.');
    return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
  
  req.files.forEach(file => {
    if (file.fileValidationError) { 
      documentUploadErrors.push(`Error with ${file.originalname}: ${file.fileValidationError}`);
      deleteUploadedFile('documents', file.filename); 
    }
  });
  
  const validFiles = req.files.filter(file => !file.fileValidationError);

  if (documentUploadErrors.length > 0 && validFiles.length === 0) {
    req.session.documentUploadErrors = documentUploadErrors;
    req.flash('error_msg', 'All selected documents had issues. Please check errors.');
    return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
  if (documentUploadErrors.length > 0 && validFiles.length > 0) {
    req.flash('info_msg', 'Some documents uploaded successfully, others had issues (see errors below).');
  }
  
  if (validFiles.length === 0) { 
    if(!req.flash('info_msg').length && !req.flash('error_msg').length) req.flash('error_msg', 'No valid documents to upload.');
    return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }

  try {
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const documentData = {
        post_id: postId,
        uploaded_by_id: uploadedById,
        original_filename: file.originalname,
        stored_filename: file.filename,
        file_path: `documents/${file.filename}`,
        mimetype: file.mimetype,
        filesize: file.size,
        title: documentTitlesArray[i] || file.originalname,
      };
      await db.query("INSERT INTO post_documents SET ?", documentData);
    }
    if (validFiles.length > 0) {
      req.flash('success_msg', `${validFiles.length} document(s) uploaded successfully.`);
    }
    if (documentUploadErrors.length > 0) {
        req.session.documentUploadErrors = documentUploadErrors;
    }
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
    
  } catch (error) {
    console.error("Error saving document(s) metadata:", error);
    validFiles.forEach(file => deleteUploadedFile('documents', file.filename));
    req.session.documentUploadErrors = (req.session.documentUploadErrors || []).concat([{ msg: 'Server error while saving document data.' }]);
    req.flash('error_msg', 'Could not save document information due to a server error.');
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
};

// @desc    Delete a specific document associated with a post
// @route   POST /admin/posts/:postId/documents/:documentId/delete
// @access  Private (Admin/Editor)
exports.deletePostDocument = async (req, res, next) => {
  const { postId, documentId } = req.params;
  
  try {
    const [docRows] = await db.query("SELECT stored_filename FROM post_documents WHERE id = ? AND post_id = ?", [documentId, postId]);
    
    if (docRows.length === 0) {
      req.flash('error_msg', 'Document not found or does not belong to this post.');
      return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
    }
    
    const docToDelete = docRows[0];
    deleteUploadedFile('documents', docToDelete.stored_filename);
    
    const [result] = await db.query("DELETE FROM post_documents WHERE id = ?", [documentId]);
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Document deleted successfully.');
    } else {
      req.flash('error_msg', 'Could not delete document from database (it may have been already deleted).');
    }
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
    
  } catch (error) {
    console.error("Error deleting post document:", error);
    req.flash('error_msg', 'Server error while deleting document.');
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
};


// @desc    List all comments for a specific post in the admin area
// @route   GET /admin/posts/:postId/comments
// @access  Private (Admin/Editor)
exports.listPostCommentsAdmin = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const [postRows] = await db.query("SELECT id, title, slug FROM posts WHERE id = ?", [postId]);
    if (postRows.length === 0) {
      req.flash('error_msg', 'Post not found.');
      return res.redirect('/admin/posts');
    }
    const post = postRows[0];
    
    const [comments] = await db.query(
      "SELECT c.id, c.content, c.author_name, c.author_email, c.created_at, c.is_approved, c.user_id, u.username as user_commenter_name " +
      "FROM comments c LEFT JOIN users u ON c.user_id = u.id " +
      "WHERE c.post_id = ? ORDER BY c.is_approved ASC, c.created_at DESC",
      [postId]
    );
    
    res.render('admin/posts/comments', { // Check this path: admin/posts/comments.ejs or admin/postmanager/comments.ejs ?
      title: `Comments for ${post.title} - Admin`,
      pageTitle: `Comments for "${post.title}"`,
      post: post,
      comments: comments,
      layout: './layouts/admin_layout'
    });
  } catch (error) {
    console.error("Error fetching comments for admin:", error);
    next(error);
  }
};

// @desc    Approve a specific comment
// @route   POST /admin/posts/:postId/comments/:commentId/approve
// @access  Private (Admin/Editor)
exports.approveComment = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const [result] = await db.query(
      "UPDATE comments SET is_approved = TRUE WHERE id = ? AND post_id = ?", 
      [commentId, postId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Comment approved successfully.');
    } else {
      req.flash('error_msg', 'Comment not found or could not be approved.');
    }
    res.redirect(`/admin/posts/${postId}/comments`);
  } catch (error) {
    console.error("Error approving comment:", error);
    req.flash('error_msg', 'Server error while approving comment.');
    res.redirect(req.headers.referer || `/admin/posts/${req.params.postId}/comments`);
  }
};

// @desc    Unapprove a specific comment (set back to pending)
// @route   POST /admin/posts/:postId/comments/:commentId/unapprove
// @access  Private (Admin/Editor)
exports.unapproveComment = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const [result] = await db.query(
      "UPDATE comments SET is_approved = FALSE WHERE id = ? AND post_id = ?", 
      [commentId, postId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Comment unapproved and set to pending.');
    } else {
      req.flash('error_msg', 'Comment not found or could not be unapproved.');
    }
    res.redirect(`/admin/posts/${postId}/comments`);
  } catch (error) {
    console.error("Error unapproving comment:", error);
    req.flash('error_msg', 'Server error while unapproving comment.');
    res.redirect(req.headers.referer || `/admin/posts/${req.params.postId}/comments`);
  }
};

// @desc    Delete a specific comment (Admin action)
// @route   POST /admin/posts/:postId/comments/:commentId/delete
// @access  Private (Admin/Editor)
exports.deleteCommentAdmin = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const [result] = await db.query(
      "DELETE FROM comments WHERE id = ? AND post_id = ?", 
      [commentId, postId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Comment deleted successfully.');
    } else {
      req.flash('error_msg', 'Comment not found or already deleted.');
    }
    res.redirect(`/admin/posts/${postId}/comments`);
  } catch (error) {
    console.error("Error deleting comment by admin:", error);
    req.flash('error_msg', 'Server error while deleting comment.');
    res.redirect(req.headers.referer || `/admin/posts/${req.params.postId}/comments`);
  }
};


// @desc    Show statistics for a specific post
// @route   GET /admin/posts/:id/statistics
// @access  Private (Admin/Editor)
exports.showPostStatistics = async (req, res, next) => {
    try {
        const postId = req.params.id;
        const [postRows] = await db.query(
            `SELECT p.id, p.title, p.slug, p.created_at, p.published_at, p.updated_at, p.view_count,
             GROUP_CONCAT(pc.name SEPARATOR ', ') AS categories_list
             FROM posts p
             LEFT JOIN post_category_pivot pcp ON p.id = pcp.post_id
             LEFT JOIN post_categories pc ON pcp.category_id = pc.id
             WHERE p.id = ?
             GROUP BY p.id`, [postId]
        );

        if (postRows.length === 0) {
            req.flash('error_msg', 'Post not found for statistics.');
            return res.redirect('/admin/posts');
        }
        const post = postRows[0];

        const [[commentStatsRow]] = await db.query(
            "SELECT " +
            "COUNT(*) AS total_comments, " +
            "SUM(CASE WHEN is_approved = TRUE THEN 1 ELSE 0 END) AS approved_comments, " +
            "SUM(CASE WHEN is_approved = FALSE THEN 1 ELSE 0 END) AS pending_comments " +
            "FROM comments WHERE post_id = ?",
            [postId]
        );
        
        const stats = {
            total_comments: parseInt(commentStatsRow?.total_comments) || 0,
            approved_comments: parseInt(commentStatsRow?.approved_comments) || 0,
            pending_comments: parseInt(commentStatsRow?.pending_comments) || 0,
        };

        res.render('admin/posts/statistics', { // Check this path: admin/posts/statistics.ejs or admin/postmanager/statistics.ejs ?
            title: `Statistics for: ${post.title} - Admin`,
            pageTitle: `Post Statistics: "${post.title}"`,
            post: post, // Now includes .categories_list
            commentStats: stats,
            layout: './layouts/admin_layout'
        });
    } catch (error) {
        console.error("Error fetching post statistics:", error);
        next(error);
    }
};

/*
// avenircon/controllers/adminPostController.js
const db = require('../config/db');
const slugify = require('slugify');
const fs = require('fs'); // File System module for deleting files
const path = require('path'); // Path module

// Helper function to delete an uploaded file from a specific directory within public/uploads
const deleteUploadedFile = (directory, filename) => {
  if (!filename || !directory) {
    console.warn('deleteUploadedFile called with missing directory or filename.');
    return;
  }
  const filePath = path.join(__dirname, '../public/uploads', directory, filename);
  fs.unlink(filePath, (err) => {
    if (err) {
      // It's common for unlink to fail if the file doesn't exist, which might not be a critical error.
      if (err.code !== 'ENOENT') { // ENOENT: Error NO ENTity (file not found)
        console.error(`Error deleting file ${filename} from ${directory}:`, err);
      } else {
        console.log(`File ${filename} not found in ${directory}, no deletion needed.`);
      }
    } else {
      console.log(`Successfully deleted file: ${filename} from ${directory}`);
    }
  });
};


// @desc List all posts in the admin area
// @route GET /admin/posts
// @access Private (Admin/Editor)
exports.listPosts = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.id, 
        p.title, 
        p.slug, 
        p.status, 
        p.published_at, 
        p.updated_at, 
        p.feature_image_path, 
        u.username AS author_name,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = FALSE) AS pending_comment_count
      FROM posts p 
      LEFT JOIN users u ON p.user_id = u.id 
      ORDER BY p.updated_at DESC
    `;
    const [posts] = await db.query(query);
    
    res.render('admin/postmanager/index', { // Assuming your list view is admin/postmanager/index.ejs
      title: 'Manage Posts - Admin',
      pageTitle: 'Manage Posts', // For H1 in layout
      posts: posts,
      layout: './layouts/admin_layout'
    });
  } catch (error) {
    console.error("Error fetching posts for admin:", error);
    next(error);
  }
};


// @desc Show form to create a new post
// @route GET /admin/posts/create
// @access Private (Admin/Editor)
exports.showCreatePostForm = (req, res) => {
  res.render('admin/postmanager/create', {
    title: 'Create New Post - Admin',
    pageTitle: 'Create New Post',
    formData: req.session.createPostFormData || {}, // Use session stored formData
    errors: req.session.createPostErrors || [],   // Use session stored errors
    layout: './layouts/admin_layout'
  });
  // Clear session data after rendering
  delete req.session.createPostFormData;
  delete req.session.createPostErrors;
};

// @desc Handle creation of a new post
// @route POST /admin/posts/create
// @access Private (Admin/Editor)
exports.handleCreatePost = async (req, res, next) => {
  const { title, summary, content, status } = req.body;
  const userId = req.session.user.id;
  let errors = [];
  
  // --- Server-side Validation (Basic) ---
  if (!title || title.trim() === '') errors.push({ param: 'title', msg: 'Title is required.' });
  if (title && title.length > 255) errors.push({ param: 'title', msg: 'Title cannot exceed 255 characters.' });
  if (!content || content.trim() === '') errors.push({ param: 'content', msg: 'Content is required.' });
  if (!status || !['draft', 'published', 'archived'].includes(status)) {
    errors.push({ param: 'status', msg: 'Invalid status selected.' });
  }
  if (summary && summary.length > 500) errors.push({ param: 'summary', msg: 'Summary cannot exceed 500 characters.' });
  
  // Multer error handling (check if req.fileValidationError exists, set by Multer config for example)
  if (req.fileValidationError) {
      errors.push({ param: 'feature_image', msg: req.fileValidationError });
  }
  
  if (errors.length > 0) {
    if (req.file) { // If there's a file uploaded but validation fails
      deleteUploadedFile('feature_images', req.file.filename);
    }
    req.session.createPostFormData = req.body;
    req.session.createPostErrors = errors;
    return res.redirect('/admin/posts/create');
  }
  
  let finalSlug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
  try {
    let slugExists = true;
    let counter = 1;
    const baseSlug = finalSlug; // Keep original slug for appending counter
    while (slugExists) {
      const [existingSlugRows] = await db.query('SELECT id FROM posts WHERE slug = ?', [finalSlug]);
      if (existingSlugRows.length === 0) {
        slugExists = false;
      } else {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }
  
    const newPost = {
      user_id: userId,
      title,
      slug: finalSlug,
      summary: summary || null,
      content,
      status,
      published_at: status === 'published' ? new Date() : null,
      feature_image_path: req.file ? req.file.filename : null
    };
    
    await db.query('INSERT INTO posts SET ?', newPost);
    req.flash('success_msg', 'Post created successfully.');
    res.redirect('/admin/posts');

  } catch (error) {
    console.error("Error creating post:", error);
    if (req.file) { // If DB error occurs after file upload
      deleteUploadedFile('feature_images', req.file.filename);
    }
    req.session.createPostFormData = req.body;
    req.session.createPostErrors = [{ msg: 'Server error while creating post. Please try again.' }];
    res.redirect('/admin/posts/create');
  }
};

//adminPostController.ejs
// @desc Show form to edit an existing post (and manage its documents)
// @route GET /admin/posts/:id/edit
// @access Private (Admin/Editor)
exports.showEditPostForm = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const [postRows] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
    
    if (postRows.length === 0) {
      req.flash('error_msg', 'Post not found.');
      return res.redirect('/admin/posts');
    }
    const post = postRows[0];
    
    const [documents] = await db.query(
      "SELECT id, original_filename, stored_filename, mimetype, filesize, title, created_at FROM post_documents WHERE post_id = ? ORDER BY created_at DESC",
      [postId]
    );
    
    const formDataFromSession = req.session.editPostFormData;
    const errorsFromSession = req.session.editPostErrors;
    const docErrorsFromSession = req.session.documentUploadErrors;

    res.render('admin/postmanager/edit', {
      title: `Edit Post: ${post.title} - Admin`,
      pageTitle: `Edit Post: ${post.title}`,
      post: post, // Original post data for context
      post_documents: documents,
      formData: formDataFromSession || post, // Use session data if exists, else original post data
      errors: errorsFromSession || [],
      documentUploadErrors: docErrorsFromSession || [],
      layout: './layouts/admin_layout'
    });
    delete req.session.editPostFormData;
    delete req.session.editPostErrors;
    delete req.session.documentUploadErrors;
  } catch (error) {
    console.error("Error fetching post and documents for edit:", error);
    next(error);
  }
};


// @desc Handle update of an existing post
// @route POST /admin/posts/:id/edit
// @access Private (Admin/Editor)
exports.handleUpdatePost = async (req, res, next) => {
  const postId = req.params.id;
  const { title, slug: newSlugInput, summary, content, status, remove_feature_image } = req.body;
  let errors = [];
  
  let originalPost;
  try {
    const [originalPostRows] = await db.query('SELECT id, slug, feature_image_path, published_at, status as original_status FROM posts WHERE id = ?', [postId]);
    if (originalPostRows.length === 0) {
      req.flash('error_msg', 'Post not found.');
      if (req.file) deleteUploadedFile('feature_images', req.file.filename);
      return res.redirect('/admin/posts');
    }
    originalPost = originalPostRows[0];
  } catch (dbError) {
    console.error("DB error fetching original post for update:", dbError);
    if (req.file) deleteUploadedFile('feature_images', req.file.filename); // Clean up if file was uploaded
    next(dbError); // Pass to global error handler
    return;
  }

  // --- Validation ---
  if (!title || title.trim() === '') errors.push({ param: 'title', msg: 'Title is required.' });
  if (title && title.length > 255) errors.push({ param: 'title', msg: 'Title cannot exceed 255 characters.' });
  if (!newSlugInput || newSlugInput.trim() === '') errors.push({ param: 'slug', msg: 'Slug is required.' });
  else if (newSlugInput.length > 255) errors.push({ param: 'slug', msg: 'Slug cannot exceed 255 characters.' });
  if (!content || content.trim() === '') errors.push({ param: 'content', msg: 'Content is required.' });
  if (!status || !['draft', 'published', 'archived'].includes(status)) {
    errors.push({ param: 'status', msg: 'Invalid status selected.' });
  }
  if (summary && summary.length > 500) errors.push({ param: 'summary', msg: 'Summary cannot exceed 500 characters.' });

  if (req.fileValidationError) {
      errors.push({ param: 'feature_image', msg: req.fileValidationError });
  }
  
  let finalSlug = slugify(newSlugInput.trim(), { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
  if (finalSlug !== originalPost.slug) { // Only check for uniqueness if slug has changed
    try {
      let slugExists = true;
      let counter = 1;
      const baseSlug = finalSlug;
      while (slugExists) {
        const [existingSlug] = await db.query('SELECT id FROM posts WHERE slug = ? AND id != ?', [finalSlug, postId]);
        if (existingSlug.length === 0) {
          slugExists = false;
        } else {
          finalSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    } catch (dbError) {
        console.error("DB error checking slug uniqueness:", dbError);
        errors.push({param: 'slug', msg: 'Error checking slug uniqueness. Please try again.'});
    }
  }
  
  if (errors.length > 0) {
    if (req.file) deleteUploadedFile('feature_images', req.file.filename);
    req.session.editPostFormData = { ...req.body, feature_image_path: originalPost.feature_image_path }; // Keep original image if not changed
    req.session.editPostErrors = errors;
    return res.redirect(`/admin/posts/${postId}/edit`);
  }
  
  try {
    let newFeatureImagePath = originalPost.feature_image_path;
    
    if (remove_feature_image === 'true') {
      if (originalPost.feature_image_path) {
        deleteUploadedFile('feature_images', originalPost.feature_image_path);
      }
      newFeatureImagePath = null;
    } else if (req.file) { // A new file was uploaded
      if (originalPost.feature_image_path && originalPost.feature_image_path !== req.file.filename) {
        deleteUploadedFile('feature_images', originalPost.feature_image_path);
      }
      newFeatureImagePath = req.file.filename;
    }
    
    const updatedPost = {
      title,
      slug: finalSlug,
      summary: summary || null,
      content,
      status,
      feature_image_path: newFeatureImagePath,
      published_at: (originalPost.original_status !== 'published' && status === 'published') ? new Date() : (status !== 'published' ? null : originalPost.published_at), // Set published_at if becoming published, clear if no longer published (or keep if already was)
      updated_at: new Date()
    };
     // If post was published and is now draft/archived, nullify published_at
    if (originalPost.original_status === 'published' && (status === 'draft' || status === 'archived')) {
        // Retain original published_at if you want to keep history of first publication, or set to null
        // updatedPost.published_at = originalPost.published_at; // Keep original
        // or if strict:
        // updatedPost.published_at = null; // If becoming unpublished means it has no current publish date
        // Current logic: keeps original published_at if status !== 'published' unless it was never published.
        // Let's refine: if moving from published to non-published, published_at should ideally remain to show when it *was* published.
        // If moving from non-published to published, set it. If staying published, keep it.
        // If moving from published to non-published, we might want to keep the original publish date.
        // The current logic: `(originalPost.original_status !== 'published' && status === 'published') ? new Date() : (status !== 'published' ? null : originalPost.published_at)`
        // This sets to null if status becomes not 'published'. This is debatable. Let's make it simpler:
        // If it becomes published now, set date. If it was published and stays published, keep date. Otherwise, it's null (or its old value if it had one and becomes draft).
        if (status === 'published') {
            updatedPost.published_at = originalPost.published_at || new Date(); // Set new if wasn't published, else keep existing
        } else {
            updatedPost.published_at = originalPost.published_at; // Keep original if becoming draft/archived from published, or null if it was draft already
        }
    }


    await db.query('UPDATE posts SET ? WHERE id = ?', [updatedPost, postId]);
    req.flash('success_msg', 'Post updated successfully.');
    res.redirect('/admin/posts');
  } catch (error) {
    console.error("Error updating post:", error);
    // If error occurred after new file upload and new file wasn't meant to be the one saved
    if (req.file && req.file.filename !== newFeatureImagePath) {
      deleteUploadedFile('feature_images', req.file.filename);
    }
    req.session.editPostFormData = { ...req.body, feature_image_path: originalPost.feature_image_path };
    req.session.editPostErrors = [{ msg: 'Server error while updating post. Please try again.' }];
    res.redirect(`/admin/posts/${postId}/edit`);
  }
};



// @desc    List all comments for a specific post in the admin area
// @route   GET /admin/posts/:postId/comments
// @access  Private (Admin/Editor)
exports.listPostCommentsAdmin = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const [postRows] = await db.query("SELECT id, title, slug FROM posts WHERE id = ?", [postId]);
    if (postRows.length === 0) {
      req.flash('error_msg', 'Post not found.');
      return res.redirect('/admin/posts');
    }
    const post = postRows[0];
    
    const [comments] = await db.query(
      "SELECT c.id, c.content, c.author_name, c.author_email, c.created_at, c.is_approved, c.user_id, u.username as user_commenter_name " +
      "FROM comments c LEFT JOIN users u ON c.user_id = u.id " +
      "WHERE c.post_id = ? ORDER BY c.is_approved ASC, c.created_at DESC",
      [postId]
    );
    
    res.render('admin/posts/comments', {
      title: `Comments for ${post.title} - Admin`,
      pageTitle: `Comments for "${post.title}"`,
      post: post,
      comments: comments,
      layout: './layouts/admin_layout'
    });
  } catch (error) {
    console.error("Error fetching comments for admin:", error);
    next(error);
  }
};

// @desc    Approve a specific comment
// @route   POST /admin/posts/:postId/comments/:commentId/approve
// @access  Private (Admin/Editor)
exports.approveComment = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const [result] = await db.query(
      "UPDATE comments SET is_approved = TRUE WHERE id = ? AND post_id = ?", // Added post_id for safety
      [commentId, postId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Comment approved successfully.');
    } else {
      req.flash('error_msg', 'Comment not found or could not be approved.');
    }
    res.redirect(`/admin/posts/${postId}/comments`);
  } catch (error) {
    console.error("Error approving comment:", error);
    req.flash('error_msg', 'Server error while approving comment.');
    res.redirect(req.headers.referer || `/admin/posts/${req.params.postId}/comments`);
  }
};

// @desc    Unapprove a specific comment (set back to pending)
// @route   POST /admin/posts/:postId/comments/:commentId/unapprove
// @access  Private (Admin/Editor)
exports.unapproveComment = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const [result] = await db.query(
      "UPDATE comments SET is_approved = FALSE WHERE id = ? AND post_id = ?", // Added post_id for safety
      [commentId, postId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Comment unapproved and set to pending.');
    } else {
      req.flash('error_msg', 'Comment not found or could not be unapproved.');
    }
    res.redirect(`/admin/posts/${postId}/comments`);
  } catch (error) {
    console.error("Error unapproving comment:", error);
    req.flash('error_msg', 'Server error while unapproving comment.');
    res.redirect(req.headers.referer || `/admin/posts/${req.params.postId}/comments`);
  }
};

// @desc    Delete a specific comment (Admin action)
// @route   POST /admin/posts/:postId/comments/:commentId/delete
// @access  Private (Admin/Editor)
exports.deleteCommentAdmin = async (req, res, next) => {
  try {
    const { postId, commentId } = req.params;
    const [result] = await db.query(
      "DELETE FROM comments WHERE id = ? AND post_id = ?", // Added post_id for safety
      [commentId, postId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Comment deleted successfully.');
    } else {
      req.flash('error_msg', 'Comment not found or already deleted.');
    }
    res.redirect(`/admin/posts/${postId}/comments`);
  } catch (error) {
    console.error("Error deleting comment by admin:", error);
    req.flash('error_msg', 'Server error while deleting comment.');
    res.redirect(req.headers.referer || `/admin/posts/${req.params.postId}/comments`);
  }
};

// @desc Handle deletion of a post
// @route POST /admin/posts/:id/delete
// @access Private (Admin/Editor)
exports.handleDeletePost = async (req, res, next) => {
  const postId = req.params.id;
  try {
    // First, get post details to delete associated files
    const [postRows] = await db.query('SELECT feature_image_path FROM posts WHERE id = ?', [postId]);
    
    if (postRows.length > 0 && postRows[0].feature_image_path) {
      deleteUploadedFile('feature_images', postRows[0].feature_image_path);
    }

    // Also delete associated documents
    const [documents] = await db.query("SELECT stored_filename FROM post_documents WHERE post_id = ?", [postId]);
    for (const doc of documents) {
        deleteUploadedFile('documents', doc.stored_filename);
    }
    // The actual deletion from post_documents and comments tables should be handled by
    // ON DELETE CASCADE in the database schema for foreign keys pointing to posts.id.
    // If not, you'd need to delete them manually here before deleting the post.
    // e.g., await db.query("DELETE FROM post_documents WHERE post_id = ?", [postId]);
    // e.g., await db.query("DELETE FROM comments WHERE post_id = ?", [postId]);


    const [result] = await db.query('DELETE FROM posts WHERE id = ?', [postId]);
    
    if (result.affectedRows === 0) {
      req.flash('error_msg', 'Post not found or already deleted.');
    } else {
      req.flash('success_msg', 'Post and its associated content (comments, documents - if DB cascades) deleted successfully.');
    }
    res.redirect('/admin/posts');
  } catch (error) {
    console.error("Error deleting post:", error);
    // Check for foreign key constraint error (ER_ROW_IS_REFERENCED_2)
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        req.flash('error_msg', 'Error deleting post: It is referenced by other data (e.g., comments or documents). Please ensure database foreign keys are set to ON DELETE CASCADE or remove related items manually.');
    } else {
        req.flash('error_msg', 'Server error deleting post.');
    }
    res.redirect('/admin/posts');
  }
};

// --- Document Management Controller Methods ---

// @desc    Handle new document uploads for a specific post
// @route   POST /admin/posts/:postId/documents/upload
// @access  Private (Admin/Editor)
exports.handleDocumentUpload = async (req, res, next) => {
  const postId = req.params.postId;
  const uploadedById = req.session.user.id;
  const documentTitlesInput = req.body.document_titles || "";
  const documentTitlesArray = documentTitlesInput.split(',').map(title => title.trim()).filter(title => title);
  let documentUploadErrors = [];
  
  if (!req.files || req.files.length === 0) {
    // This case might be handled by Multer if `minCount` is set, or if no file is an error by itself
    // If Multer allows no files, then this check is useful.
    req.flash('info_msg', 'No new documents were selected for upload.');
    return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`); // Anchor to section
  }
  
  // Check for individual file errors from Multer (e.g., if fileFilter rejected some)
  req.files.forEach(file => {
    if (file.fileValidationError) { // Custom error property set by Multer config
      documentUploadErrors.push(`Error with ${file.originalname}: ${file.fileValidationError}`);
      deleteUploadedFile('documents', file.filename); // Clean up problematic file
    }
  });
  
  // Filter out files that had validation errors
  const validFiles = req.files.filter(file => !file.fileValidationError);

  if (documentUploadErrors.length > 0 && validFiles.length === 0) {
    req.session.documentUploadErrors = documentUploadErrors;
    req.flash('error_msg', 'All selected documents had issues. Please check errors.');
    return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
  if (documentUploadErrors.length > 0 && validFiles.length > 0) {
    // Some files are okay, some are not. Flash a mixed message.
    req.flash('info_msg', 'Some documents uploaded successfully, others had issues (see errors below).');
  }
  
  if (validFiles.length === 0) { // If, after filtering, no valid files remain
    // Errors already flashed or an info message if no files were ever selected.
    if(!req.flash('info_msg').length) req.flash('error_msg', 'No valid documents to upload.'); // Avoid double message
    return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }

  try {
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const documentData = {
        post_id: postId,
        uploaded_by_id: uploadedById,
        original_filename: file.originalname,
        stored_filename: file.filename,
        file_path: `documents/${file.filename}`, // Store relative path from 'uploads'
        mimetype: file.mimetype,
        filesize: file.size,
        title: documentTitlesArray[i] || file.originalname, // Default title to original filename
      };
      await db.query("INSERT INTO post_documents SET ?", documentData);
    }
    if (validFiles.length > 0) {
      req.flash('success_msg', `${validFiles.length} document(s) uploaded successfully.`);
    }
    if (documentUploadErrors.length > 0) { // If there were also errors
        req.session.documentUploadErrors = documentUploadErrors; // Pass specific errors for display
    }
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
    
  } catch (error) {
    console.error("Error saving document(s) metadata:", error);
    validFiles.forEach(file => deleteUploadedFile('documents', file.filename)); // Cleanup
    req.session.documentUploadErrors = (req.session.documentUploadErrors || []).concat([{ msg: 'Server error while saving document data.' }]);
    req.flash('error_msg', 'Could not save document information due to a server error.');
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
};

// @desc    Delete a specific document associated with a post
// @route   POST /admin/posts/:postId/documents/:documentId/delete
// @access  Private (Admin/Editor)
exports.deletePostDocument = async (req, res, next) => {
  const { postId, documentId } = req.params;
  
  try {
    const [docRows] = await db.query("SELECT stored_filename FROM post_documents WHERE id = ? AND post_id = ?", [documentId, postId]);
    
    if (docRows.length === 0) {
      req.flash('error_msg', 'Document not found or does not belong to this post.');
      return res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
    }
    
    const docToDelete = docRows[0];
    deleteUploadedFile('documents', docToDelete.stored_filename);
    
    const [result] = await db.query("DELETE FROM post_documents WHERE id = ?", [documentId]);
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Document deleted successfully.');
    } else {
      req.flash('error_msg', 'Could not delete document from database (it may have been already deleted).');
    }
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
    
  } catch (error) {
    console.error("Error deleting post document:", error);
    req.flash('error_msg', 'Server error while deleting document.');
    res.redirect(`/admin/posts/${postId}/edit#post-documents-section`);
  }
};

// @desc    Show a preview of a post using public template within admin layout
// @route   GET /admin/posts/:id/preview
// @access  Private (Admin/Editor)
exports.previewPost = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const [postRows] = await db.query(
      "SELECT p.*, u.username as author_name " +
      "FROM posts p LEFT JOIN users u ON p.user_id = u.id " +
      "WHERE p.id = ?", [postId]
    );
    
    if (postRows.length === 0) {
      req.flash('error_msg', 'Post not found for preview.');
      return res.redirect('/admin/posts');
    }
    const postToPreview = postRows[0];
    
    const [comments] = await db.query( // Fetch approved comments for preview
      "SELECT c.id, c.content, c.author_name, c.created_at, u.username as user_commenter_name " +
      "FROM comments c LEFT JOIN users u ON c.user_id = u.id " +
      "WHERE c.post_id = ? AND c.is_approved = TRUE ORDER BY c.created_at ASC", [postToPreview.id]
    );
    
    res.render('public/single-post', { // Render the PUBLIC view template
      title: `Preview: ${postToPreview.title} - Admin`, // For browser tab
      pageTitle: `Admin Preview: ${postToPreview.title}`, // For H1 in admin layout
      post: postToPreview,
      comments: comments || [],
      currentUser: req.session.user, // For comment form within public/single-post
      isAuthenticated: !!req.session.user,
      // For comment form repopulation (usually empty in preview context)
      formData: {}, 
      errors: [],   
      layout: './layouts/admin_layout', // CRITICAL: Use admin layout
      isAdminPreview: true // Custom flag for "Preview Mode" banner
    });
    
  } catch (error) {
    console.error("Error generating post preview:", error);
    next(error);
  }
};

// @desc    Show statistics for a specific post
// @route   GET /admin/posts/:id/statistics
// @access  Private (Admin/Editor)
exports.showPostStatistics = async (req, res, next) => {
    try {
        const postId = req.params.id;
        const [postRows] = await db.query(
            "SELECT id, title, slug, created_at, published_at, updated_at, view_count " +
            "FROM posts WHERE id = ?", [postId]
        );

        if (postRows.length === 0) {
            req.flash('error_msg', 'Post not found for statistics.');
            return res.redirect('/admin/posts');
        }
        const post = postRows[0];

        const [[commentStatsRow]] = await db.query( // Query returns an array with one object, or empty if no comments
            "SELECT " +
            "COUNT(*) AS total_comments, " +
            "SUM(CASE WHEN is_approved = TRUE THEN 1 ELSE 0 END) AS approved_comments, " +
            "SUM(CASE WHEN is_approved = FALSE THEN 1 ELSE 0 END) AS pending_comments " +
            "FROM comments WHERE post_id = ?",
            [postId]
        );
        
        const stats = { // Ensure defaults if commentStatsRow is undefined or counts are null
            total_comments: parseInt(commentStatsRow?.total_comments) || 0,
            approved_comments: parseInt(commentStatsRow?.approved_comments) || 0,
            pending_comments: parseInt(commentStatsRow?.pending_comments) || 0,
        };

        res.render('admin/posts/statistics', {
            title: `Statistics for: ${post.title} - Admin`,
            pageTitle: `Post Statistics: "${post.title}"`,
            post: post,
            commentStats: stats,
            layout: './layouts/admin_layout'
        });
    } catch (error) {
        console.error("Error fetching post statistics:", error);
        next(error);
    }
};


/*
That's a great and logical extension for the adminPostController.js! This structure covers not only the core CRUD for posts but also essential related functionalities like previews, statistics, and comment moderation. It aligns well with the "Admin Post Manager" requirements, especially RA1.1 (Access Control) and RA1.2 (Admin Layout).

Let's break down how these new structures would fit and what they'd entail:

Analyzing the Proposed adminPostController.js Structures:

The existing methods we've worked on are:

exports.listPosts, exports.showCreatePostForm, exports.handleCreatePost, 
exports.showEditPostForm, exports.handleUpdatePost, exports.handleDeletePost, 

Now for the new ones:

Preview Edited Post:

// @desc Show form to preview edited post

// @route GET /admin/posts/:id/preview

// @access Private (Admin/Editor)

Controller Method: exports.previewPost = async (req, res, next) => { ... }

Functionality:

Fetch the post by req.params.id (similar to showEditPostForm).

It could render the post using a public-facing template (like views/public/single-post.ejs) but within the admin layout to give a true preview of how it would look to a user, potentially with a banner saying "Admin Preview Mode".

Alternatively, if the "preview" is just to see the content before publishing without full public styling, it could be a simpler admin-specific view.

This is especially useful for 'draft' posts or before committing major edits to a 'published' post.

The key difference from showEditPostForm is that this isn't for editing, it's for viewing the rendered output.

Post Statistics:

// @desc show post statistics

// @route GET /admin/posts/:id/statistics

// @access Private (Admin/Editor)

Controller Method: exports.showPostStatistics = async (req, res, next) => { ... }

Functionality:

Fetch the post by req.params.id.

Fetch related statistics:

Number of views (requires a view tracking mechanism, e.g., a separate post_views table or a counter on the posts table that increments on public view).

Number of comments (approved, pending).

(Potentially) Likes, shares (if such features exist).

Creation date, last updated date, publication date.

Render an admin view (e.g., views/admin/posts/statistics.ejs) displaying this data, possibly with charts.

Web Traffic Statistics (General Admin):

// @desc show web traffic statistics

// @route GET /admin/traffic

// @access Private (Admin/Editor)

Controller Method: Could be in adminPostController.js if closely related, or a new adminDashboardController.js or adminAnalyticsController.js. Let's assume it's here for now: exports.showTrafficStatistics = async (req, res, next) => { ... }

Functionality:

This is broader than a single post. It would likely involve:

Total site visits over time (requires an analytics solution or custom tracking).

Most viewed posts.

Referral sources.

This is a more advanced feature and might be out of scope for the initial "Admin Post Manager" unless a very basic version is intended (e.g., just listing posts by a simple view count).

Show Comments on a Post (Admin View):

// @desc show comments on posts

// @route GET /admin/posts/:id/comments

// @access Private (Admin/Editor)

Controller Method: exports.listPostCommentsAdmin = async (req, res, next) => { ... }

Functionality:

Fetch the post by req.params.id (to display post title context).

Fetch all comments (approved, pending, maybe even spam/rejected if you have those statuses) for that post_id.

Order them (e.g., by date, or pending first).

Render an admin view (e.g., views/admin/posts/comments.ejs) listing these comments, with actions to approve, unapprove, delete, or mark as spam for each.

Handle Approve Comments:

// @desc handle approve comments on posts

// @route POST /admin/posts/:postId/comments/:commentId/approve (Note: I've adjusted the route to be more RESTful and include postId for context, and commentId clearly).

// @access Private (Admin/Editor)

Controller Method: exports.approveComment = async (req, res, next) => { ... }

Functionality:

Receive req.params.postId and req.params.commentId.

Update the comments table: set is_approved = TRUE for the given commentId.

(Optional) Log this action in an audit log.

Redirect back to the admin comments list (/admin/posts/:postId/comments) with a success message.

Handle Delete Comments:

// @desc handle delete comments on posts

// @route POST /admin/posts/:postId/comments/:commentId/delete

// @access Private (Admin/Editor)

Controller Method: exports.deleteCommentAdmin = async (req, res, next) => { ... }

Functionality:

Receive req.params.postId and req.params.commentId.

Delete the comment from the comments table for the given commentId.

(Optional) Log this action.

Redirect back to the admin comments list (/admin/posts/:postId/comments) with a success message.

Implications and Next Steps based on this expanded scope:

Database Schema:

Post Views: If you want post statistics like view counts, you'll need a way to track this. Options:

A simple view_count INT DEFAULT 0 column on the posts table (incremented in publicController.showSinglePostPage).

A separate post_views table (id, post_id, user_id (nullable), ip_address, viewed_at) for more detailed tracking (prevents multiple counts from the same user/IP in a short period).

Comments Table: Ensure is_approved (BOOLEAN/TINYINT) exists. You might also consider a status field for comments (e.g., 'pending', 'approved', 'rejected', 'spam').

New EJS Views for Admin:

views/admin/posts/preview.ejs (or use views/public/single-post.ejs with an admin context)

views/admin/posts/statistics.ejs

views/admin/traffic_statistics.ejs (if this feature is pursued)

views/admin/posts/comments.ejs (for listing comments with moderation actions)

Routes (routes/admin.js):

Add these new routes, pointing to the corresponding controller methods.

Apply authorizeAdminOrEditor (or authorizeAdminOnly if appropriate) middleware.

Controller Implementation:

Implement the logic for each new controller method.

Prioritization for Current Goal ("Public Pages and Admin Post Manager"):

For our immediate goal, the most relevant additions from your list are:

Comment Moderation:

GET /admin/posts/:id/comments (to list comments for a post) - exports.listPostCommentsAdmin

POST /admin/posts/:postId/comments/:commentId/approve - exports.approveComment

POST /admin/posts/:postId/comments/:commentId/delete - exports.deleteCommentAdmin

These directly support the blog functionality by allowing admins to manage comments submitted through the public blog post pages.

The "Preview Post", "Post Statistics", and "Web Traffic Statistics" are excellent enhancements but could be considered Phase 2 of the Admin Post Manager or separate features if time is a constraint.

Let's focus on implementing the Comment Moderation features next, as they tie directly into the public blog's comment system.

Plan:

Create EJS View for Admin Comment Listing: views/admin/posts/comments.ejs.

Implement Controller Methods in adminPostController.js:

listPostCommentsAdmin

approveComment

deleteCommentAdmin

Add Routes in routes/admin.js for these actions.

Does this sound like a good way to proceed with the expanded vision for adminPostController.js, focusing on comment moderation first?
*/