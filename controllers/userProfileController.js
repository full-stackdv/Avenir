// Avenircon/controllers/userProfileController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

// @desc    Show form to create user profile
// @route   GET /profile/create
// @access  Private
exports.showCreateProfileForm = async (req, res, next) => {
  try {
    // Check if profile already exists (has first_name, last_name, etc.)
    const [userRows] = await db.query(
      "SELECT id, username, email, first_name, last_name, company_name FROM users WHERE id = ?",
      [req.session.user.id]
    );
    
    if (userRows.length === 0) {
      req.flash('error_msg', 'User not found.');
      return res.redirect('/dashboard');
    }
    
    const user = userRows[0];
    
    // If profile already has basic info, redirect to profile page
    if (user.first_name && user.last_name && user.email) {
      req.flash('info_msg', 'Your profile is already set up.');
      return res.redirect('/profile');
    }
    
    res.render('profile/create', {
      title: 'Create Profile - Avenircon',
      pageTitle: 'Complete Your Profile',
      formData: req.session.profileFormData || {
        username: user.username,
        email: user.email
      }, // Pre-fill with existing user data
      errors: req.session.profileFormErrors || [],
      layout: './layouts/main_layout'
    });
    
    // Clear session data after displaying
    delete req.session.profileFormData;
    delete req.session.profileFormErrors;
    
  } catch (error) {
    console.error("Error showing create profile form:", error);
    next(error);
  }
};

// @desc    Handle creating user profile information
// @route   POST /profile/create
// @access  Private
exports.handleCreateProfile = async (req, res, next) => {
  const userId = req.session.user.id;
  const { first_name, last_name, company_name, email } = req.body;
  let errors = [];
  
  // Validation
  if (!first_name || first_name.trim() === '') errors.push({ param: 'first_name', msg: 'First name is required.' });
  if (first_name && first_name.length > 100) errors.push({ param: 'first_name', msg: 'First name is too long.' });
  if (!last_name || last_name.trim() === '') errors.push({ param: 'last_name', msg: 'Last name is required.' });
  if (last_name && last_name.length > 100) errors.push({ param: 'last_name', msg: 'Last name is too long.' });
  if (company_name && company_name.length > 150) errors.push({ param: 'company_name', msg: 'Company name is too long.' });
  
  if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ param: 'email', msg: 'Invalid email format.' });
  
  if (errors.length > 0) {
    req.session.profileFormData = { ...req.body, username: req.session.user.username };
    req.session.profileFormErrors = errors;
    return res.redirect('/profile/create');
  }
  
  try {
    // Check if email is already taken by another user
    if (email.trim() !== req.session.user.email) {
      const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ? AND id != ?", [email.trim(), userId]);
      if (existingEmail.length > 0) {
        errors.push({ param: 'email', msg: 'This email address is already registered by another user.' });
      }
    }
    
    if (errors.length > 0) {
      req.session.profileFormData = { ...req.body, username: req.session.user.username };
      req.session.profileFormErrors = errors;
      return res.redirect('/profile/create');
    }
    
    const profileData = {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      company_name: company_name ? company_name.trim() : null,
      email: email.trim(),
      updated_at: new Date()
    };
    
    await db.query("UPDATE users SET ? WHERE id = ?", [profileData, userId]);
    
    // Update session with new user details
    req.session.user.first_name = profileData.first_name;
    req.session.user.last_name = profileData.last_name;
    req.session.user.company_name = profileData.company_name;
    req.session.user.email = profileData.email;
    
    req.flash('success_msg', 'Profile created successfully!');
    res.redirect('/profile');
    
  } catch (error) {
    console.error("Error creating profile:", error);
    req.session.profileFormData = { ...req.body, username: req.session.user.username };
    req.session.profileFormErrors = [{ msg: 'Server error while creating profile. Please try again.' }];
    res.redirect('/profile/create');
  }
};

// @desc    Display user's profile page
// @route   GET /profile
// @access  Private
exports.showProfilePage = async (req, res, next) => {
  try {
    const [userRows] = await db.query(
      "SELECT id, username, email, first_name, last_name, company_name, role, " +
      "DATE_FORMAT(created_at, '%M %d, %Y') as join_date_formatted " +
      "FROM users WHERE id = ?", [req.session.user.id]
    );
    
    if (userRows.length === 0) {
      req.flash('error_msg', 'User profile not found.'); // Should not happen for an authenticated user
      return res.redirect('/dashboard');
    }
    
    res.render('profile/view', { // Ensure views/profile/view.ejs exists
      title: 'My Profile - Avenircon',
      pageTitle: 'My Profile',
      profileUser: userRows[0],
      layout: './layouts/main_layout'
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    next(error);
  }
};


/*
// @desc    Show form to create user profile
// @route   GET /profile/create
// @access  Private
exports.showCreateProfileForm = async (req, res, next) => {
  try {
    const [userRows] = await db.query("SELECT id, username, email, first_name, last_name, company_name FROM users WHERE id = ?", [req.session.user.id]);
    if (userRows.length === 0) {
      req.flash('error_msg', 'New user profile creating not found for creating.');
      return res.redirect('/dashboard');
    }
    
    res.render('profile/create', { // Ensure views/profile/create.ejs exists
      title: 'Create Profile - Avenircon',
      pageTitle: 'Create Your Profile',
      formData: req.session.profileFormData || userRows[0], // Use session data on error, else DB data
      errors: req.session.profileFormErrors || [],
      layout: './layouts/main_layout'
    });
    delete req.session.profileFormData;
    delete req.session.profileFormErrors;
  } catch (error) {
    console.error("Error showing create profile form:", error);
    next(error);
  }
};
*/
//UPdate route 
// @desc    Show form to create user profile
// @route   GET /profile/create
// @access  Private
exports.showCreateProfileForm = (req, res, next) => {
    try {
        res.render('profile/create', {
            title: 'Create New User Profile - Avenircon',
            pageTitle: 'Create New User Profile',
            layout: './layouts/main_layout',
            formData: req.session.createProfileFormData || {},
            errors: req.session.createProfileErrors || []
        });
        delete req.session.createProfileFormData;
        delete req.session.createProfileErrors;
    } catch (error) {
        console.error("Error rendering create user profile page:", error);
        next(error);
    }
};

//UPdate route 
// @desc    Handle creating user profile information
// @route   POST /profile/create
// @access  Private

// Handle the submission of the new user profile form
exports.handleCreateProfile = async (req, res) => {
    const userId = req.session.user.id;
    const { id, username, email, first_name, last_name, company_name, } = req.body;

    // Basic Validations
    if (!username) {
        errors.push({ msg: 'User Name is required.' });
    }
  if (!first_name || first_name.trim() === '') errors.push({ param: 'first_name', msg: 'First name is required.' });
  if (first_name && first_name.length > 100) errors.push({ param: 'first_name', msg: 'First name is too long.' });
  if (!last_name || last_name.trim() === '') errors.push({ param: 'last_name', msg: 'Last name is required.' });
  if (last_name && last_name.length > 100) errors.push({ param: 'last_name', msg: 'Last name is too long.' });
  if (company_name && company_name.length > 150) errors.push({ param: 'company_name', msg: 'Company name is too long.' });
  
  if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ param: 'email', msg: 'Invalid email format.' });
  
  if (errors.length > 0) {
    req.session.profileFormData = { ...req.body, username: req.session.user.username }; // Keep original username
    req.session.profileFormErrors = errors;
    return res.redirect('/profile/create');
  }
  
  try {
    if (email.trim() !== req.session.user.email) { // Check email uniqueness only if changed
      const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ? AND id != ?", [email.trim(), userId]);
      if (existingEmail.length > 0) {
        errors.push({ param: 'email', msg: 'This email address is already registered by another user.' });
      }
    }
    
    const newUserData = {
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            company_name: company_name ? company_name.trim() : null,
            email: email.trim(),
            created_at: new Date()
            // status defaults to 'project team' as per schema
            // project_manager_id or project_id can be assigned later
        };
        
        await db.query("INSERT users SET ? WHERE id = ?", [newUserData, userId]);
        const [result] = await db.query('INSERT INTO users SET ?', newUserData);
        const userId = result.insertId;

        req.flash('success_msg', 'User created successfully!');
        res.redirect('/dashboard'); // Or redirect to a user details page: `/admin/${userId}` later
  } catch (err) {
        console.error("Error creating user profile:", err);
        errors.push({ msg: 'Something went wrong while creating the user profile. Please try again.' });
        res.render('profile/create', {
            title: 'Create New User Profile - Avenircon',
            errors,
            formData: req.body
        });
    }
};



// @desc    Show form to edit user profile
// @route   GET /profile/edit
// @access  Private
exports.showEditProfileForm = async (req, res, next) => {
  try {
    const [userRows] = await db.query("SELECT id, username, email, first_name, last_name, company_name FROM users WHERE id = ?", [req.session.user.id]);
    if (userRows.length === 0) {
      req.flash('error_msg', 'User profile not found for editing.');
      return res.redirect('/dashboard');
    }
    
    res.render('profile/edit', { // Ensure views/profile/edit.ejs exists
      title: 'Edit Profile - Avenircon',
      pageTitle: 'Edit Your Profile',
      formData: req.session.profileFormData || userRows[0], // Use session data on error, else DB data
      errors: req.session.profileFormErrors || [],
      layout: './layouts/main_layout'
    });
    delete req.session.profileFormData;
    delete req.session.profileFormErrors;
  } catch (error) {
    console.error("Error showing edit profile form:", error);
    next(error);
  }
};

// @desc    Handle updating user profile information
// @route   POST /profile/edit
// @access  Private
exports.handleUpdateProfile = async (req, res, next) => {
  const userId = req.session.user.id;
  // Username is typically not editable by user, or requires special handling.
  // For now, assuming username is not changed here.
  const { first_name, last_name, company_name, email } = req.body;
  let errors = [];
  
  if (!first_name || first_name.trim() === '') errors.push({ param: 'first_name', msg: 'First name is required.' });
  if (first_name && first_name.length > 100) errors.push({ param: 'first_name', msg: 'First name is too long.' });
  if (!last_name || last_name.trim() === '') errors.push({ param: 'last_name', msg: 'Last name is required.' });
  if (last_name && last_name.length > 100) errors.push({ param: 'last_name', msg: 'Last name is too long.' });
  if (company_name && company_name.length > 150) errors.push({ param: 'company_name', msg: 'Company name is too long.' });
  
  if (!email || email.trim() === '') errors.push({ param: 'email', msg: 'Email is required.' });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push({ param: 'email', msg: 'Invalid email format.' });
  
  if (errors.length > 0) {
    req.session.profileFormData = { ...req.body, username: req.session.user.username }; // Keep original username
    req.session.profileFormErrors = errors;
    return res.redirect('/profile/edit');
  }
  
  try {
    if (email.trim() !== req.session.user.email) { // Check email uniqueness only if changed
      const [existingEmail] = await db.query("SELECT id FROM users WHERE email = ? AND id != ?", [email.trim(), userId]);
      if (existingEmail.length > 0) {
        errors.push({ param: 'email', msg: 'This email address is already registered by another user.' });
      }
    }
    
    if (errors.length > 0) {
      req.session.profileFormData = { ...req.body, username: req.session.user.username };
      req.session.profileFormErrors = errors;
      return res.redirect('/profile/edit');
    }
    
    const updatedUserData = {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      company_name: company_name ? company_name.trim() : null,
      email: email.trim(),
      updated_at: new Date()
    };
    
    await db.query("UPDATE users SET ? WHERE id = ?", [updatedUserData, userId]);
    
    // Update session with new user details
    req.session.user.first_name = updatedUserData.first_name;
    req.session.user.last_name = updatedUserData.last_name;
    req.session.user.company_name = updatedUserData.company_name;
    req.session.user.email = updatedUserData.email;
    // req.session.user.username remains unchanged based on current form
    
    req.flash('success_msg', 'Profile updated successfully.');
    res.redirect('/profile');
    
  } catch (error) {
    console.error("Error updating profile:", error);
    req.session.profileFormData = { ...req.body, username: req.session.user.username };
    req.session.profileFormErrors = [{ msg: 'Server error while updating profile. Please try again.' }];
    res.redirect('/profile/edit');
  }
};

// @desc    Show form to change user password
// @route   GET /profile/change-password
// @access  Private
exports.showChangePasswordForm = (req, res, next) => { // Added next
  try {
    res.render('profile/change_password', { // Ensure views/profile/change_password.ejs exists
      title: 'Change Password - Avenircon',
      pageTitle: 'Change Your Password',
      formData: req.session.passwordFormData || {}, // For PRG errors (but don't repopulate passwords)
      errors: req.session.passwordFormErrors || [],
      layout: './layouts/main_layout'
    });
    delete req.session.passwordFormData; // Should be empty anyway for passwords
    delete req.session.passwordFormErrors;
  } catch (error) {
    console.error("Error rendering change password page:", error);
    next(error);
  }
};

// @desc    Handle password change
// @route   POST /profile/change-password
// @access  Private
exports.handlePasswordChange = async (req, res, next) => {
  const userId = req.session.user.id;
  const { current_password, new_password, confirm_new_password } = req.body;
  let errors = [];
  
  if (!current_password || !new_password || !confirm_new_password) {
    errors.push({ msg: 'All password fields are required.' });
  }
  if (new_password && new_password.length < 6) {
    errors.push({ param: 'new_password', msg: 'New password must be at least 6 characters long.' });
  }
  if (new_password !== confirm_new_password) {
    errors.push({ param: 'confirm_new_password', msg: 'New passwords do not match.' });
  }
  
  if (errors.length > 0) {
    req.session.passwordFormErrors = errors; // Store only errors, not passwords
    return res.redirect('/profile/change-password');
  }
  
  try {
    const [userRows] = await db.query("SELECT password_hash FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) { // Highly unlikely for an authenticated user
      req.flash('error_msg', 'User not found.');
      return res.redirect('/dashboard');
    }
    const user = userRows[0];
    
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      errors.push({ param: 'current_password', msg: 'Incorrect current password.' });
      req.session.passwordFormErrors = errors;
      return res.redirect('/profile/change-password');
    }
    
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(new_password, salt);
    
    await db.query("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [newPasswordHash, userId]);
    
    req.flash('success_msg', 'Password changed successfully. Please log in again for security.');
    // Destroy session to force re-login after password change for enhanced security
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session after password change:", err);
        return res.redirect('/login'); // Fallback
      }
      res.redirect('/login');
    });
    
  } catch (error) {
    console.error("Error changing password:", error);
    req.session.passwordFormErrors = [{ msg: 'Server error while changing password. Please try again.' }];
    res.redirect('/profile/change-password');
  }
};
