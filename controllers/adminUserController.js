// controllers/adminUserController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

//const VALID_ROLES = ['User', 'Client', 'Team Member', 'Site Supervisor', 'Project Manager', 'Editor', 'Admin']; // Define your actual roles

const VALID_ROLES = ['User', 'Client', 'Subcontractor', 'Team Member', 'Site Supervisor', 'Project Manager', 'Editor', 'Admin']; // Add 'Subcontractor'
// Ensure 'User' and 'Team Member' are defined if they are distinct from 'Client'

// @desc    List all users in the admin area
// @route   GET /admin/users
// @access  Private (Admin)
exports.listUsers = async (req, res, next) => {
    try {
        const searchTerm = req.query.search || '';
        const roleFilter = req.query.role || '';
        const statusFilter = req.query.status || ''; // 'active', 'inactive'
        let page = parseInt(req.query.page) || 1;
        const limit = 15; // Users per page
        const offset = (page - 1) * limit;

        let queryParams = [];
        let countQueryParams = [];

        let baseQuery = `
            SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role, u.is_active, 
                   DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i') as created_at_formatted
            FROM users u
        `;
        let countQuery = `SELECT COUNT(*) as total FROM users u`;
        let whereClauses = [];

        if (searchTerm) {
            whereClauses.push(`(u.username LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`);
            const searchLike = `%${searchTerm}%`;
            queryParams.push(searchLike, searchLike, searchLike, searchLike);
            countQueryParams.push(searchLike, searchLike, searchLike, searchLike);
        }
        if (roleFilter && VALID_ROLES.includes(roleFilter)) {
            whereClauses.push(`u.role = ?`);
            queryParams.push(roleFilter);
            countQueryParams.push(roleFilter);
        }
        if (statusFilter) {
            if (statusFilter === 'active') {
                whereClauses.push(`u.is_active = TRUE`);
            } else if (statusFilter === 'inactive') {
                whereClauses.push(`u.is_active = FALSE`);
            }
        }

        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
            countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        baseQuery += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        const [users] = await db.query(baseQuery, queryParams);
        const [countResult] = await db.query(countQuery, countQueryParams);
        const totalUsers = countResult[0].total;
        const totalPages = Math.ceil(totalUsers / limit);

        res.render('admin/users/list', {
            title: 'Manage Users - Admin',
            pageTitle: 'User Management',
            users: users,
            layout: './layouts/admin_layout',
            currentSearch: searchTerm,
            currentRole: roleFilter,
            currentStatus: statusFilter,
            allRoles: VALID_ROLES,
            currentPage: page,
            totalPages: totalPages,
            totalUsers: totalUsers
        });
    } catch (error) {
        console.error("Error fetching users for admin:", error);
        next(error);
    }
};

// @desc    Toggle user's active status
// @route   POST /admin/users/:userId/toggle-status
// @access  Private (Admin)
exports.toggleUserStatus = async (req, res, next) => {
    const userIdToToggle = parseInt(req.params.userId);
    const adminUserId = req.session.user.id;

    if (userIdToToggle === adminUserId) {
        req.flash('error_msg', 'You cannot change your own active status.');
        return res.redirect('/admin/users');
    }

    try {
        const [userRows] = await db.query("SELECT id, is_active, role FROM users WHERE id = ?", [userIdToToggle]);
        if (userRows.length === 0) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }
        const user = userRows[0];
        const newStatus = !user.is_active;

        // Safeguard: Prevent deactivating the last active admin
        if (user.role === 'Admin' && !newStatus) { // Trying to deactivate an admin
            const [activeAdminRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = TRUE AND id != ?", [userIdToToggle]);
            if (activeAdminRows[0].count === 0) {
                req.flash('error_msg', 'Cannot deactivate the last active admin account.');
                return res.redirect('/admin/users');
            }
        }

        await db.query("UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?", [newStatus, userIdToToggle]);
        req.flash('success_msg', `User status updated to ${newStatus ? 'Active' : 'Inactive'}.`);
        res.redirect('/admin/users');
    } catch (error) {
        console.error("Error toggling user status:", error);
        req.flash('error_msg', 'Failed to update user status.');
        res.redirect('/admin/users');
    }
};

// @desc    Show form for admin to change a user's password
// @route   GET /admin/users/:userId/change-password
// @access  Private (Admin)
exports.showChangeUserPasswordForm = async (req, res, next) => {
    try {
        const userIdToEdit = parseInt(req.params.userId);
        const [userRows] = await db.query("SELECT id, username FROM users WHERE id = ?", [userIdToEdit]);

        if (userRows.length === 0) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }

        res.render('admin/users/change_password_for_user', {
            title: `Change Password for ${userRows[0].username} - Admin`,
            pageTitle: `Change Password for User: ${userRows[0].username}`,
            userToEdit: userRows[0],
            formData: {},
            errors: req.session.adminChangePasswordErrors || [],
            layout: './layouts/admin_layout'
        });
        delete req.session.adminChangePasswordErrors;
    } catch (error) {
        console.error("Error showing change user password form for admin:", error);
        next(error);
    }
};

// @desc    Handle admin changing a user's password
// @route   POST /admin/users/:userId/change-password
// @access  Private (Admin)
exports.handleChangeUserPassword = async (req, res, next) => {
    const userIdToEdit = parseInt(req.params.userId);
    const { new_password, confirm_new_password } = req.body;
    let errors = [];

    if (!new_password || !confirm_new_password) {
        errors.push({ msg: 'Both password fields are required.' });
    }
    if (new_password && new_password.length < 6) {
        errors.push({ msg: 'New password must be at least 6 characters long.' });
    }
    if (new_password !== confirm_new_password) {
        errors.push({ msg: 'Passwords do not match.' });
    }

    if (errors.length > 0) {
        req.session.adminChangePasswordErrors = errors;
        return res.redirect(`/admin/users/${userIdToEdit}/change-password`);
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(new_password, salt);

        await db.query("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [newPasswordHash, userIdToEdit]);

        // TODO: Add audit log entry for password change by admin
        // await auditLogController.logAction(req.session.user.id, 'ADMIN_PASSWORD_RESET', 'users', userIdToEdit, { targetUsername: 'username_here' });


        req.flash('success_msg', `Password for user has been changed successfully.`);
        res.redirect('/admin/users');
    } catch (error) {
        console.error("Error changing user password by admin:", error);
        req.session.adminChangePasswordErrors = [{ msg: 'Server error while changing password.' }];
        res.redirect(`/admin/users/${userIdToEdit}/change-password`);
    }
};


// @desc    Show form for admin to edit a user's details
// @route   GET /admin/users/:userId/edit
// @access  Private (Admin)
exports.showEditUserFormAdmin = async (req, res, next) => {
    try {
        const userIdToEdit = parseInt(req.params.userId);
        const [userRows] = await db.query(
            "SELECT id, username, email, first_name, last_name, company_name, role, is_active FROM users WHERE id = ?",
            [userIdToEdit]
        );

        if (userRows.length === 0) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }
        const user = userRows[0];

        res.render('admin/users/edit_user', {
            title: `Edit User: ${user.username} - Admin`,
            pageTitle: `Edit User Details: ${user.username}`,
            userToEdit: user,
            availableRoles: VALID_ROLES, // For role editing as well
            formData: req.session.adminEditUserFormData || user, // Pre-fill with user data or session data on error
            errors: req.session.adminEditUserErrors || [],
            layout: './layouts/admin_layout'
        });
        delete req.session.adminEditUserFormData;
        delete req.session.adminEditUserErrors;
    } catch (error) {
        console.error("Error showing edit user form for admin:", error);
        next(error);
    }
};


// @desc    Handle admin updating a user's details
// @route   POST /admin/users/:userId/edit
// @access  Private (Admin)
exports.handleEditUserAdmin = async (req, res, next) => {
    const userIdToEdit = parseInt(req.params.userId);
    const adminUserId = req.session.user.id; // Admin performing the action

    // Username is typically not editable. If you want to allow it, add specific checks for uniqueness.
    const { first_name, last_name, company_name, email, role, is_active_status } = req.body;
    let errors = [];

    // --- Validation ---
    if (!first_name || first_name.trim() === '') errors.push({ param: 'first_name', msg: 'First name is required.' });
    if (first_name && first_name.length > 100) errors.push({ param: 'first_name', msg: 'First name is too long.' });
    if (!last_name || last_name.trim() === '') errors.push({ param: 'last_name', msg: 'Last name is required.' });
    if (last_name && last_name.length > 100) errors.push({ param: 'last_name', msg: 'Last name is too long.' });
    if (company_name && company_name.length > 150) errors.push({ param: 'company_name', msg: 'Company name is too long.' });

    if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ param: 'email', msg: 'Invalid email format.' });

    if (!role || !VALID_ROLES.includes(role)) {
        errors.push({ param: 'role', msg: 'Invalid role selected.' });
    }

    const newIsActive = is_active_status === 'active'; // Convert form value to boolean

    // Fetch original user data for comparison and safeguards
    let originalUser;
    try {
        const [userRows] = await db.query("SELECT email, role, is_active FROM users WHERE id = ?", [userIdToEdit]);
        if (userRows.length === 0) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }
        originalUser = userRows[0];
    } catch (dbError) {
        console.error("Error fetching original user for edit:", dbError);
        return next(dbError);
    }

    // Email Uniqueness Check (if changed)
    if (email.trim().toLowerCase() !== originalUser.email.toLowerCase()) {
        try {
            const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ? AND id != ?", [email.trim(), userIdToEdit]);
            if (existingEmail.length > 0) {
                errors.push({ param: 'email', msg: 'This email address is already registered by another user.' });
            }
        } catch (dbError) {
            errors.push({ param: 'email', msg: 'Error checking email uniqueness.' });
        }
    }

    // Role change safeguard (cannot change own role if sole admin, or demote sole admin)
    if (userIdToEdit === adminUserId && role !== 'Admin' && originalUser.role === 'Admin') {
        const [activeAdminRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = TRUE AND id != ?", [userIdToEdit]);
        if (activeAdminRows[0].count === 0) {
            errors.push({ param: 'role', msg: 'You cannot change your own role from Admin if you are the only active admin.' });
        }
    }
    if (originalUser.role === 'Admin' && role !== 'Admin' && userIdToEdit !== adminUserId) { // Trying to demote another admin
         const [activeAdminRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = TRUE AND id != ?", [userIdToEdit]);
         if (activeAdminRows[0].count === 0) {
            errors.push({ param: 'role', msg: 'Cannot change role of the last active admin.' });
        }
    }


    // Active status safeguard (cannot deactivate self if sole admin, or deactivate sole admin)
    if (originalUser.role === 'Admin' && !newIsActive) {
        const [activeAdminRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = TRUE AND id != ?", [userIdToEdit]);
        if (activeAdminRows[0].count === 0) {
            errors.push({ param: 'is_active_status', msg: `Cannot deactivate ${userIdToEdit === adminUserId ? 'your own account as you are' : 'this user as they are'} the last active admin.` });
        }
    }


    if (errors.length > 0) {
        req.session.adminEditUserFormData = { ...req.body, id: userIdToEdit, username: originalUser.username /* or fetch it */ };
        req.session.adminEditUserErrors = errors;
        return res.redirect(`/admin/users/${userIdToEdit}/edit`);
    }

    try {
        const updatedUserData = {
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            company_name: company_name ? company_name.trim() : null,
            email: email.trim(),
            role: role,
            is_active: newIsActive,
            updated_at: new Date()
        };

        await db.query("UPDATE users SET ? WHERE id = ?", [updatedUserData, userIdToEdit]);

        // TODO: Add audit log entry for user edit by admin
        // await auditLogController.logAction(adminUserId, 'ADMIN_USER_EDIT', 'users', userIdToEdit, { changes: updatedUserData });

        req.flash('success_msg', 'User details updated successfully.');
        res.redirect('/admin/users');

    } catch (error) {
        console.error("Error updating user by admin:", error);
        req.session.adminEditUserFormData = { ...req.body, id: userIdToEdit, username: originalUser.username };
        req.session.adminEditUserErrors = [{ msg: 'Server error while updating user details.' }];
        res.redirect(`/admin/users/${userIdToEdit}/edit`);
    }
};
 

// @desc    Show form to assign/change a user's role
// @route   GET /admin/users/:userId/assign-role
// @access  Private (Admin)
exports.showAssignRoleForm = async (req, res, next) => {
    try {
        const userIdToEdit = parseInt(req.params.userId);
        const [userRows] = await db.query("SELECT id, username, role FROM users WHERE id = ?", [userIdToEdit]);

        if (userRows.length === 0) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }
        const user = userRows[0];

        res.render('admin/users/assign_role', {
            title: `Assign Role to ${user.username} - Admin`,
            pageTitle: `Assign Role: ${user.username}`,
            userToEdit: user,
            availableRoles: VALID_ROLES,
            currentRole: user.role,
            errors: req.session.assignRoleErrors || [],
            layout: './layouts/admin_layout'
        });
        delete req.session.assignRoleErrors;
    } catch (error) {
        console.error("Error showing assign role form:", error);
        next(error);
    }
};

// @desc    Handle assigning/changing a user's role
// @route   POST /admin/users/:userId/assign-role
// @access  Private (Admin)
exports.handleAssignRole = async (req, res, next) => {
    const userIdToEdit = parseInt(req.params.userId);
    const adminUserId = req.session.user.id;
    const { new_role } = req.body;
    let errors = [];

    if (!new_role || !VALID_ROLES.includes(new_role)) {
        errors.push({ msg: 'Invalid role selected.' });
    }

    if (userIdToEdit === adminUserId && new_role !== 'Admin') {
         // Check if this admin is the only active admin
        const [userRows] = await db.query("SELECT role FROM users WHERE id = ?", [userIdToEdit]);
        if (userRows.length > 0 && userRows[0].role === 'Admin') {
            const [activeAdminRows] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = TRUE AND id != ?", [userIdToEdit]);
            if (activeAdminRows[0].count === 0) {
                 errors.push({ msg: 'You cannot change your own role if you are the only active admin.' });
            }
        }
    }


    if (errors.length > 0) {
        req.session.assignRoleErrors = errors;
        return res.redirect(`/admin/users/${userIdToEdit}/assign-role`);
    }

    try {
        const [originalUser] = await db.query("SELECT role FROM users WHERE id = ?", [userIdToEdit]);
        if (originalUser.length === 0) {
            req.flash('error_msg', 'User not found.');
            return res.redirect('/admin/users');
        }
        const oldRole = originalUser[0].role;

        await db.query("UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?", [new_role, userIdToEdit]);

        // TODO: Add audit log entry
        // await auditLogController.logAction(req.session.user.id, 'USER_ROLE_CHANGED', 'users', userIdToEdit, { oldRole: oldRole, newRole: new_role });


        req.flash('success_msg', `User role updated to ${new_role}.`);
        res.redirect('/admin/users');
    } catch (error) {
        console.error("Error assigning role:", error);
        req.session.assignRoleErrors = [{ msg: 'Server error while assigning role.' }];
        res.redirect(`/admin/users/${userIdToEdit}/assign-role`);
    }
};


// controllers/adminUserController.js
// ... (existing requires and VALID_ROLES) ...


// @desc    Show form for admin to create a new user
// @route   GET /admin/users/create
// @access  Private (Admin)
exports.showCreateUserFormAdmin = async (req, res, next) => {
    try {
        res.render('admin/users/create_user', {
            title: 'Add New User - Admin',
            pageTitle: 'Create New User Account',
            availableRoles: VALID_ROLES,
            formData: req.session.adminCreateUserFormData || {},
            errors: req.session.adminCreateUserErrors || [],
            layout: './layouts/admin_layout'
        });
        delete req.session.adminCreateUserFormData;
        delete req.session.adminCreateUserErrors;
    } catch (error) {
        console.error("Error showing create user form for admin:", error);
        next(error);
    }
};

// @desc    Handle admin creating a new user
// @route   POST /admin/users/create
// @access  Private (Admin)
exports.handleCreateUserAdmin = async (req, res, next) => {
    const { username, email, first_name, last_name, company_name, password, confirm_password, role, is_active_status } = req.body;
    let errors = [];

    // --- Validation ---
    if (!username || username.trim() === '') errors.push({ param: 'username', msg: 'Username is required.' });
    else if (username.length < 3 || username.length > 50) errors.push({ param: 'username', msg: 'Username must be between 3 and 50 characters.' });
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) errors.push({ param: 'username', msg: 'Username can only contain letters, numbers, and underscores.' });

    if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ param: 'email', msg: 'Invalid email format.' });

    if (!password) errors.push({ param: 'password', msg: 'Password is required.' });
    else if (password.length < 6) errors.push({ param: 'password', msg: 'Password must be at least 6 characters long.' });
    if (password !== confirm_password) errors.push({ param: 'confirm_password', msg: 'Passwords do not match.' });

    if (!first_name || first_name.trim() === '') errors.push({ param: 'first_name', msg: 'First name is required.' });
    // Add length checks for first_name, last_name, company_name as in edit form

    if (!role || !VALID_ROLES.includes(role)) {
        errors.push({ param: 'role', msg: 'Invalid role selected.' });
    }
    const isActive = is_active_status === 'active';

    if (errors.length > 0) {
        req.session.adminCreateUserFormData = req.body;
        req.session.adminCreateUserErrors = errors;
        return res.redirect('/admin/users/create');
    }

    try {
        // Check for existing username or email
        const [existingUser] = await db.query("SELECT id FROM users WHERE username = ? OR email = ?", [username.trim(), email.trim()]);
        if (existingUser.length > 0) {
            if (existingUser[0].username === username.trim()) errors.push({ param: 'username', msg: 'Username already taken.' });
            if (existingUser[0].email === email.trim()) errors.push({ param: 'email', msg: 'Email already registered.' });
            req.session.adminCreateUserFormData = req.body;
            req.session.adminCreateUserErrors = errors;
            return res.redirect('/admin/users/create');
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUser = {
            username: username.trim(),
            email: email.trim(),
            password_hash,
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            company_name: company_name ? company_name.trim() : null,
            role,
            is_active: isActive,
            // profile_image_path will be default or updated by user later
        };

        const [result] = await db.query("INSERT INTO users SET ?", newUser);
        const newUserId = result.insertId;

        // TODO: Add audit log entry
        // await auditLogController.logAction(req.session.user.id, 'ADMIN_USER_CREATE', 'users', newUserId, { username: newUser.username, role: newUser.role });

        req.flash('success_msg', `User '${newUser.username}' created successfully.`);
        res.redirect('/admin/users');

    } catch (error) {
        console.error("Error creating user by admin:", error);
        req.session.adminCreateUserFormData = req.body;
        req.session.adminCreateUserErrors = [{ msg: 'Server error while creating user.' }];
        res.redirect('/admin/users/create');
    }
};
/*
Admin Edit User Details (New): Admins should be able to edit basic details of other users (e.g., first name, last name, email, company – but typically not username or password directly from this form, password change has its own form).
Admin Add New User (New): Admins should be able to create new user accounts from the admin panel. This will involve setting a username, email, initial password, and role.
Handle Contact Message Submission (from Public Forms): Ensure that when a user submits a contact message through your public-facing forms (e.g., on the homepage or a dedicated contact page), this message is saved to the contact_messages database table.
*/