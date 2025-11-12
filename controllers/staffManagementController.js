// controllers/staffManagementController.js
const db = require('../config/db');
const { deleteUploadedFile } = require('../config/multerConfig'); // For deleting old photos

// Get all staff members
exports.listStaff = async (req, res, next) => {
    try {
        const [staffMembers] = await db.query(`
            SELECT s.id, s.full_name, s.position, s.employee_id_number, s.email, s.photo_filename, 
                   DATE_FORMAT(s.issue_date, '%Y-%m-%d') as issue_date, 
                   DATE_FORMAT(s.expiry_date, '%Y-%m-%d') as expiry_date,
                   u.username as created_by_username
            FROM staff s
            LEFT JOIN users u ON s.created_by_id = u.id
            ORDER BY s.full_name ASC
        `);
        res.render('staff/list', {
            title: 'Staff Management',
            layout: './layouts/admin_layout',
            user: req.session.user,
            staffMembers,
            currentPath: req.path
        });
    } catch (error) {
        console.error('Error fetching staff:', error);
        next(error);
    }
};

// Show staff registration form
exports.showRegisterForm = (req, res) => {
    const formData = req.session.formData || {};
    const errors = req.session.errors || {};
    delete req.session.formData;
    delete req.session.errors;

    res.render('staff/register', {
        title: 'Register New Staff',
        layout: './layout/admin_layout',
        user: req.session.user,
        formData,
        errors,
        currentPath: req.path
    });
};

// Handle staff registration
exports.registerStaff = async (req, res, next) => {
    const { full_name, position, employee_id_number, phone, email, issue_date, expiry_date } = req.body;
    const photo_filename = req.file ? req.file.filename : null;
    const created_by_id = req.session.user ? req.session.user.id : null;

    // Basic Validation (can be expanded with express-validator)
    let errors = {};
    if (!full_name) errors.full_name = 'Full name is required.';
    if (!position) errors.position = 'Position is required.';
    if (!employee_id_number) errors.employee_id_number = 'Employee ID is required.';
    if (!issue_date) errors.issue_date = 'Issue date is required.';
    if (!expiry_date) errors.expiry_date = 'Expiry date is required.';
    // Add more validation as needed (e.g., date formats, email format, ID uniqueness check early)

    if (Object.keys(errors).length > 0) {
        if (photo_filename) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`); // Clean up uploaded photo if validation fails
        req.session.formData = req.body;
        req.session.errors = errors;
        req.flash('error_msg', 'Please correct the errors below.');
        return res.redirect('/staff/register');
    }

    try {
        // Check for unique employee_id_number and email if provided
        if (employee_id_number) {
            const [existingId] = await db.query("SELECT id FROM staff WHERE employee_id_number = ?", [employee_id_number]);
            if (existingId.length > 0) {
                if (photo_filename) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`);
                errors.employee_id_number = 'This Employee ID already exists.';
            }
        }
        if (email) {
            const [existingEmail] = await db.query("SELECT id FROM staff WHERE email = ?", [email]);
            if (existingEmail.length > 0) {
                if (photo_filename && !errors.employee_id_number) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`);
                errors.email = 'This Email already exists for another staff member.';
            }
        }
        if (Object.keys(errors).length > 0) {
            req.session.formData = req.body;
            req.session.errors = errors;
            req.flash('error_msg', 'Please correct the errors below.');
            return res.redirect('/staff/register');
        }


        const [result] = await db.query(
            "INSERT INTO staff (full_name, position, employee_id_number, phone, email, photo_filename, issue_date, expiry_date, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [full_name, position, employee_id_number, phone || null, email || null, photo_filename, issue_date, expiry_date, created_by_id]
        );
        req.flash('success_msg', 'Staff member registered successfully.');
        res.redirect('/staff');
    } catch (error) {
        console.error('Error registering staff:', error);
        if (photo_filename) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`); // Clean up on DB error
        // Specific error handling (e.g., ER_DUP_ENTRY if somehow missed by pre-check)
        if (error.code === 'ER_DUP_ENTRY') {
             if (error.message.includes('employee_id_number')) {
                errors.employee_id_number = 'This Employee ID already exists.';
            } else if (error.message.includes('email')) {
                errors.email = 'This Email already exists for another staff member.';
            } else {
                 req.flash('error_msg', 'A unique constraint was violated.');
            }
        } else {
            req.flash('error_msg', 'An error occurred during registration.');
        }
        req.session.formData = req.body;
        req.session.errors = errors;
        next(error); // Or res.redirect('/staff/register');
    }
};

// Show staff edit form
exports.showEditForm = async (req, res, next) => {
    try {
        const [staffMembers] = await db.query("SELECT id, full_name, position, employee_id_number, phone, email, photo_filename, DATE_FORMAT(issue_date, '%Y-%m-%d') as issue_date, DATE_FORMAT(expiry_date, '%Y-%m-%d') as expiry_date FROM staff WHERE id = ?", [req.params.id]);
        if (staffMembers.length === 0) {
            req.flash('error_msg', 'Staff member not found.');
            return res.redirect('/staff');
        }
        const formData = req.session.formData || staffMembers[0];
        const errors = req.session.errors || {};
        delete req.session.formData;
        delete req.session.errors;

        res.render('staff/edit', {
            title: 'Edit Staff Member',
            layout: './layout/admin_layout',
            user: req.session.user,
            currentStaff: staffMembers[0], // For context like existing photo
            formData, // Use formData for repopulating fields
            errors,
            currentPath: req.path
        });
    } catch (error) {
        console.error('Error fetching staff for edit:', error);
        next(error);
    }
};

// Handle staff update
exports.updateStaff = async (req, res, next) => {
    const { id } = req.params;
    const { full_name, position, employee_id_number, phone, email, issue_date, expiry_date, existing_photo_filename } = req.body;
    let photo_filename = existing_photo_filename;
    let newPhotoUploaded = false;

    if (req.file) {
        photo_filename = req.file.filename;
        newPhotoUploaded = true;
    }

    let errors = {};
    if (!full_name) errors.full_name = 'Full name is required.';
    // ... add other validations as in registerStaff ...

    if (Object.keys(errors).length > 0) {
        if (newPhotoUploaded) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`);
        req.session.formData = { ...req.body, photo_filename: existing_photo_filename }; // Keep existing photo if new one fails validation
        req.session.errors = errors;
        req.flash('error_msg', 'Please correct the errors below.');
        return res.redirect(`/staff/${id}/edit`);
    }

    try {
        // Check for unique employee_id_number and email (if changed)
        if (employee_id_number) {
            const [existingId] = await db.query("SELECT id FROM staff WHERE employee_id_number = ? AND id != ?", [employee_id_number, id]);
            if (existingId.length > 0) errors.employee_id_number = 'This Employee ID already exists for another staff member.';
        }
        if (email) {
            const [existingEmail] = await db.query("SELECT id FROM staff WHERE email = ? AND id != ?", [email, id]);
            if (existingEmail.length > 0) errors.email = 'This Email already exists for another staff member.';
        }
        if (Object.keys(errors).length > 0) {
            if (newPhotoUploaded) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`);
            req.session.formData = { ...req.body, photo_filename: existing_photo_filename };
            req.session.errors = errors;
            req.flash('error_msg', 'Please correct the errors below.');
            return res.redirect(`/staff/${id}/edit`);
        }

        const [updateResult] = await db.query(
            "UPDATE staff SET full_name = ?, position = ?, employee_id_number = ?, phone = ?, email = ?, photo_filename = ?, issue_date = ?, expiry_date = ? WHERE id = ?",
            [full_name, position, employee_id_number, phone || null, email || null, photo_filename, issue_date, expiry_date, id]
        );

        if (updateResult.affectedRows > 0 && newPhotoUploaded && existing_photo_filename && existing_photo_filename !== photo_filename) {
            deleteUploadedFile(`uploads/staff_photos/${existing_photo_filename}`);
        }

        req.flash('success_msg', 'Staff member updated successfully.');
        res.redirect('/staff');
    } catch (error) {
        console.error('Error updating staff:', error);
        if (newPhotoUploaded) deleteUploadedFile(`uploads/staff_photos/${photo_filename}`);
        // Handle specific DB errors
        if (error.code === 'ER_DUP_ENTRY') {
             if (error.message.includes('employee_id_number')) {
                errors.employee_id_number = 'This Employee ID already exists for another staff member.';
            } else if (error.message.includes('email')) {
                errors.email = 'This Email already exists for another staff member.';
            } else {
                 req.flash('error_msg', 'A unique constraint was violated during update.');
            }
        } else {
            req.flash('error_msg', 'An error occurred during update.');
        }
        req.session.formData = { ...req.body, photo_filename: newPhotoUploaded ? photo_filename : existing_photo_filename };
        req.session.errors = errors;
        next(error); // Or res.redirect(`/staff/${id}/edit`);
    }
};

// Handle staff deletion
exports.deleteStaff = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [staffMember] = await db.query("SELECT photo_filename FROM staff WHERE id = ?", [id]);
        if (staffMember.length === 0) {
            req.flash('error_msg', 'Staff member not found.');
            return res.redirect('/staff');
        }

        const { photo_filename } = staffMember[0];
        const [deleteResult] = await db.query("DELETE FROM staff WHERE id = ?", [id]);

        if (deleteResult.affectedRows > 0 && photo_filename) {
            deleteUploadedFile(`uploads/staff_photos/${photo_filename}`);
        }
        req.flash('success_msg', 'Staff member deleted successfully.');
        res.redirect('/staff');
    } catch (error) {
        console.error('Error deleting staff:', error);
        req.flash('error_msg', 'An error occurred while deleting staff member.');
        next(error);
    }
};
