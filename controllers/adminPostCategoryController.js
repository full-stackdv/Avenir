
// controllers/adminPostCategoryController.js
const db = require('../config/db'); // Assuming your DB connection module
//const slugify = require('slugify');
//const slugify = require('../utils/slugify'); // Assuming your slugify utility

/*
//const pageContentService = require('../services/pageContentService');
//const postService = require('../services/postService');

// @desc    Show form to create a new post category
// @route   GET /admin/post-categories/create
// @access  Private (Admin)
exports.showCreateCategoryForm = (req, res) => {
    res.render('admin/post-categories/create', {
        title: 'Create Post Category - Admin',
        pageTitle: 'Create New Post Category',
        formData: req.session.categoryFormData || {}, // For repopulating form on error
        errors: req.session.categoryErrors || [],   // For displaying validation errors
        layout: './layouts/admin_layout' // Assuming you have an admin layout
    });
    // Clear session data after rendering
    delete req.session.categoryFormData;
    delete req.session.categoryErrors;
};

// @desc    Handle creation of a new post category
// @route   POST /admin/post-categories/create
// @access  Private (Admin)
exports.handleCreateCategory = async (req, res, next) => {
    const { name, slug: inputSlug, description } = req.body;
    let errors = [];

    // --- Basic Validation ---
    if (!name || name.trim() === '') {
        errors.push({ param: 'name', msg: 'Category name is required.' });
    } else if (name.length > 255) {
        errors.push({ param: 'name', msg: 'Category name cannot exceed 255 characters.' });
    }

    if (inputSlug && inputSlug.length > 255) {
        errors.push({ param: 'slug', msg: 'Slug cannot exceed 255 characters.' });
    }
    if (description && description.length > 65535) { // TEXT type limit
        errors.push({ param: 'description', msg: 'Description is too long.' });
    }

    if (errors.length > 0) {
        req.session.categoryFormData = req.body;
        req.session.categoryErrors = errors;
        return res.redirect('/admin/post-categories/create');
    }

    // Generate slug if not provided or if provided, slugify it
    let finalSlug = inputSlug && inputSlug.trim() !== ''
        ? slugify(inputSlug.trim(), { lower: true, strict: true, remove: /[*+~.()'"!:@]/g })
        : slugify(name.trim(), { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });

    try {
        // Check if slug already exists
        let slugExists = true;
        let counter = 1;
        const baseSlug = finalSlug;

        while (slugExists) {
            const [existingSlugRows] = await db.query('SELECT id FROM post_categories WHERE slug = ?', [finalSlug]);
            if (existingSlugRows.length === 0) {
                slugExists = false;
            } else {
                finalSlug = `${baseSlug}-${counter}`;
                counter++;
            }
        }

        const newCategory = {
            name: name.trim(),
            slug: finalSlug,
            description: description ? description.trim() : null
        };

        await db.query('INSERT INTO post_categories SET ?', newCategory);

        req.flash('success_msg', 'Post category created successfully.');
        res.redirect('/admin/post-categories'); // Redirect to the list of categories or dashboard
    } catch (error) {
        console.error("Error creating post category:", error);
        // Check for unique constraint violation on slug (though the loop above tries to prevent it)
        if (error.code === 'ER_DUP_ENTRY' || error.sqlMessage?.includes('UNIQUE constraint failed: post_categories.slug')) {
             req.session.categoryFormData = req.body;
             req.session.categoryErrors = [{ param: 'slug', msg: 'This slug is already in use. Please choose a different one or leave it blank to auto-generate.' }];
             return res.redirect('/admin/post-categories/create');
        }
        req.flash('error_msg', 'Server error while creating category. Please try again.');
        res.redirect('/admin/post-categories/create'); // Or use next(error)
    }
};

*/

// @desc    List all post categories
// @route   GET /admin/post-categories
// @access  Admin
exports.listCategories = async (req, res, next) => {
    try {
        const [categories] = await db.query(`
            SELECT pc.*, COUNT(ptc.post_id) as post_count
            FROM post_categories pc
            LEFT JOIN post_to_category ptc ON pc.id = ptc.category_id
            GROUP BY pc.id
            ORDER BY pc.name ASC
        `);
        res.render('admin/post-categories/list', {
            title: 'Post Categories - Admin',
            pageTitle: 'Manage Post Categories',
            categories,
            layout: './layouts/admin_layout'
        });
    } catch (error) {
        console.error("Error listing categories:", error);
        next(error);
    }
};

// @desc    Show form to create a new category
// @route   GET /admin/post-categories/create
// @access  Admin
exports.showCreateCategoryForm = (req, res, next) => {
    try {
        res.render('admin/post-categories/create', {
            title: 'Create Category - Admin',
            pageTitle: 'Create New Post Category',
            category: {}, // Empty object for the form partial
            errors: [],   // For consistency if using a shared form partial
            layout: './layouts/admin_layout'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Handle creation of a new category
// @route   POST /admin/post-categories/create
// @access  Admin
exports.handleCreateCategory = async (req, res, next) => {
    const { name, description } = req.body;
    let generatedSlug = slugify(name);
    let errors = [];

    if (!name) {
        errors.push({ msg: 'Category name is required.' });
    }

    if (errors.length > 0) {
        return res.render('admin/post-categories/create', {
            title: 'Create Category - Admin',
            pageTitle: 'Create New Post Category',
            category: { name, description },
            errors,
            layout: './layouts/admin_layout'
        });
    }

    try {
        // Check if name or slug already exists
        const [existing] = await db.query('SELECT id FROM post_categories WHERE name = ? OR slug = ?', [name, generatedSlug]);
        if (existing.length > 0) {
            req.flash('error_msg', 'A category with this name or slug already exists.');
            return res.redirect('/admin/post-categories/create');
        }

        await db.query('INSERT INTO post_categories (name, slug, description) VALUES (?, ?, ?)', [name, generatedSlug, description || null]);
        req.flash('success_msg', 'Category created successfully.');
        res.redirect('/admin/post-categories');
    } catch (error) {
        console.error("Error creating category:", error);
        if (error.code === 'ER_DUP_ENTRY') {
             req.flash('error_msg', 'A category with this name or slug already exists.');
        } else {
            req.flash('error_msg', 'Failed to create category. Please try again.');
        }
        res.redirect('/admin/post-categories/create'); // Or render form with error
    }
};

// @desc    Show form to edit a category
// @route   GET /admin/post-categories/:id/edit
// @access  Admin
exports.showEditCategoryForm = async (req, res, next) => {
    try {
        const categoryId = req.params.id;
        const [categories] = await db.query('SELECT * FROM post_categories WHERE id = ?', [categoryId]);
        if (categories.length === 0) {
            req.flash('error_msg', 'Category not found.');
            return res.redirect('/admin/post-categories');
        }
        res.render('admin/post-categories/edit', {
            title: 'Edit Category - Admin',
            pageTitle: `Edit Category: ${categories[0].name}`,
            category: categories[0],
            errors: [],
            layout: './layouts/admin_layout'
        });
    } catch (error) {
        console.error("Error fetching category for edit:", error);
        next(error);
    }
};

// @desc    Handle update of a category
// @route   POST /admin/post-categories/:id/edit
// @access  Admin
exports.handleUpdateCategory = async (req, res, next) => {
    const categoryId = req.params.id;
    const { name, description } = req.body;
    let newSlug = slugify(name);
    let errors = [];

    if (!name) {
        errors.push({ msg: 'Category name is required.' });
    }
    
    const [originalCategoryRows] = await db.query('SELECT name, slug FROM post_categories WHERE id = ?', [categoryId]);
    if (originalCategoryRows.length === 0) {
        req.flash('error_msg', 'Category not found.');
        return res.redirect('/admin/post-categories');
    }
    const originalCategory = originalCategoryRows[0];

    if (errors.length > 0) {
        // Re-fetch category to pass to render if there are validation errors
        return res.render('admin/post-categories/edit', {
            title: 'Edit Category - Admin',
            pageTitle: `Edit Category: ${originalCategory.name}`,
            category: { id: categoryId, name, description, slug: originalCategory.slug }, // Use original slug for display, new name if changed
            errors,
            layout: './layouts/admin_layout'
        });
    }

    try {
        // Check if new name or slug conflicts with an *other* category
        const [existing] = await db.query('SELECT id FROM post_categories WHERE (name = ? OR slug = ?) AND id != ?', [name, newSlug, categoryId]);
        if (existing.length > 0) {
            req.flash('error_msg', 'Another category with this name or slug already exists.');
            // It's better to redirect back to the edit form with original data + attempted changes
            // For simplicity here, redirecting; ideally, re-render form with errors and current input.
             return res.redirect(`/admin/post-categories/${categoryId}/edit`);
        }

        await db.query('UPDATE post_categories SET name = ?, slug = ?, description = ? WHERE id = ?', [name, newSlug, description || null, categoryId]);
        req.flash('success_msg', 'Category updated successfully.');
        res.redirect('/admin/post-categories');
    } catch (error) {
        console.error("Error updating category:", error);
         if (error.code === 'ER_DUP_ENTRY') {
             req.flash('error_msg', 'Another category with this name or slug already exists.');
        } else {
            req.flash('error_msg', 'Failed to update category. Please try again.');
        }
        res.redirect(`/admin/post-categories/${categoryId}/edit`);
    }
};

// @desc    Handle deletion of a category
// @route   POST /admin/post-categories/:id/delete
// @access  Admin
exports.handleDeleteCategory = async (req, res, next) => {
    const categoryId = req.params.id;
    try {
        // Optional: Check if category is in use before deleting
        const [postsInCategory] = await db.query('SELECT COUNT(*) as count FROM post_to_category WHERE category_id = ?', [categoryId]);
        if (postsInCategory[0].count > 0) {
            req.flash('error_msg', `Cannot delete category as it is associated with ${postsInCategory[0].count} post(s). Please disassociate posts first.`);
            return res.redirect('/admin/post-categories');
        }

        const [result] = await db.query('DELETE FROM post_categories WHERE id = ?', [categoryId]);
        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Category deleted successfully.');
        } else {
            req.flash('error_msg', 'Category not found or already deleted.');
        }
        res.redirect('/admin/post-categories');
    } catch (error) {
        console.error("Error deleting category:", error);
        req.flash('error_msg', 'Failed to delete category. It might be in use or a database error occurred.');
        res.redirect('/admin/post-categories');
    }
};



// functions for listing, editing, and deleting categories here
// e.g., exports.listCategories, exports.showEditCategoryForm, exports.handleUpdateCategory, exports.handleDeleteCategory

