// Avenircon/controllers/authController.js
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const crypto = require('crypto'); // Ensure crypto is required for password reset
const adminAuditLogController = require('./adminAuditLogController'); // <<< EXISTING IMPORT
const notificationService = require('../services/notificationService'); // <<< NEW IMPORT

// --- Render Pages ---

exports.showRegisterPage = (req, res, next) => { // Added next
  try {
    res.render('register', {
      title: 'Register - ConstructPro', // Changed Avenircon to ConstructPro
      pageTitle: 'Create Your Account', 
      layout: './layout/public_layout', // Standardized layout path
      formData: req.session.registerFormData || {}, 
      errors: req.session.registerFormErrors || []  
    });
    delete req.session.registerFormData;
    delete req.session.registerFormErrors;
  } catch (error) {
    console.error("Error rendering register page:", error);
    next(error); 
  }
};

exports.showLoginPage = (req, res, next) => { // Added next
  try {
    res.render('login', {
      title: 'Login - ConstructPro', // Changed Avenircon to ConstructPro
      pageTitle: 'Login to Your Account', 
      layout: './layout/public_layout', // Standardized layout path
      formData: req.session.loginFormData || {}, 
      errors: req.session.loginFormErrors || []  
    });
    delete req.session.loginFormData;
    delete req.session.loginFormErrors;
  } catch (error) {
    console.error("Error rendering login page:", error);
    next(error); 
  }
};

exports.registerUser = async (req, res, next) => { 
  const { username, email, password, confirm_password, first_name, last_name, company_name } = req.body;
  let errors = [];
  
  if (!username || !email || !password || !confirm_password) {
    errors.push({ msg: 'Please fill in all required fields (username, email, password, confirm password).' });
  }
  if (password !== confirm_password) {
    errors.push({ msg: 'Passwords do not match.' });
  }
  if (password && password.length < 6) { 
    errors.push({ msg: 'Password should be at least 6 characters.' });
  }
  
  if (errors.length > 0) {
    req.session.registerFormData = req.body;
    req.session.registerFormErrors = errors;
    return res.redirect('/register');
  }
  
  try {
    const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUsers.length > 0) {
      errors.push({ msg: 'Username or Email already registered.' });
      req.session.registerFormData = req.body;
      req.session.registerFormErrors = errors;
      return res.redirect('/register');
    }
    
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const newUser = {
      username,
      email,
      password_hash,
      first_name: first_name || null,
      last_name: last_name || null,
      company_name: company_name || null,
      role: 'User', // Explicitly set default role
      is_active: true // Explicitly set default activity
    };
    
    const [insertResult] = await db.query('INSERT INTO users SET ?', newUser);
    const newUserId = insertResult.insertId;

    // Send welcome email
    const mailData = {
      userName: username, 
      // You can add other relevant data for the welcome email template here
      // e.g., siteName will be added globally by notificationService
    };
    try {
      const emailResult = await notificationService.sendNotification('user_welcome', email, mailData);
      if (!emailResult.success) {
        console.warn(`Welcome email for ${email} could not be sent: ${emailResult.message}`);
        // Do not block registration if email fails, but log it.
        // Admin might need to review failed email attempts.
      }
    } catch (emailError) {
        console.error(`Critical error sending welcome email for ${email}:`, emailError);
    }
    
    req.flash('success_msg', 'You are now registered and can log in! A welcome email has been sent.');
    res.redirect('/login');
    
  } catch (err) {
    console.error("Error during registration:", err);
    errors.push({ msg: 'Something went wrong during registration. Please try again.' });
    req.session.registerFormData = req.body;
    req.session.registerFormErrors = errors;
    res.redirect('/register'); 
  }
};

exports.loginUser = async (req, res, next) => { 
  const { email_or_username, password } = req.body;
  let errors = [];
  
  if (!email_or_username || !password) {
    errors.push({ msg: 'Please enter both email/username and password.' });
  }
  
  if (errors.length > 0) {
    req.session.loginFormData = req.body;
    req.session.loginFormErrors = errors;
    return res.redirect('/login');
  }
  
  try {
    const [users] = await db.query('SELECT id, username, email, password_hash, role, first_name, last_name, company_name, is_active FROM users WHERE email = ? OR username = ?', [email_or_username, email_or_username]);
    
    if (users.length === 0) {
      errors.push({ msg: 'Invalid credentials. User not found.' });
      req.session.loginFormData = req.body;
      req.session.loginFormErrors = errors;
      return res.redirect('/login');
    }
    
    const user = users[0];

    if (!user.is_active) {
        errors.push({ msg: 'Your account is inactive. Please contact support.' });
        req.session.loginFormData = req.body;
        req.session.loginFormErrors = errors;
        return res.redirect('/login');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (isMatch) {
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role, 
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: user.company_name
      };
      req.flash('success_msg', 'You are logged in!');
      // Log successful login
      if (typeof adminAuditLogController.logAction === 'function') { // Check if function exists
        adminAuditLogController.logAction(user.id, 'USER_LOGIN_SUCCESS', 'users', user.id, {ip_address: req.ip});
      } else {
        console.warn('adminAuditLogController.logAction is not a function. Login audit skipped.');
      }

      res.redirect(user.role.toLowerCase() === 'admin' ? '/admin' : '/dashboard');
    } else {
      errors.push({ msg: 'Invalid credentials. Password incorrect.' });
      req.session.loginFormData = req.body;
      req.session.loginFormErrors = errors;
      // Log failed login attempt
      if (typeof adminAuditLogController.logAction === 'function') {
        adminAuditLogController.logAction(null, 'USER_LOGIN_FAILED', 'users', null, {attempted_login: email_or_username, ip_address: req.ip});
      } else {
        console.warn('adminAuditLogController.logAction is not a function. Failed login audit skipped.');
      }
      return res.redirect('/login');
    }
  } catch (err) {
    console.error("Error during login:", err);
    errors.push({ msg: 'Something went wrong during login. Please try again.' });
    req.session.loginFormData = req.body; 
    req.session.loginFormErrors = errors;
    res.redirect('/login');
  }
};

// If a specific dashboard is needed via authController, it requires a distinct route and clear purpose.
exports.showDashboardPage = (req, res) => {
  // This internal auth check is redundant if the route uses isAuthenticated middleware
  if (!req.session.user) {
    req.flash('error_msg', 'Please log in to view that resource.');
    return res.redirect('/login');
  }
  res.render('dashboard', { // This would render views/dashboard.ejs
    title: 'Dashboard - Avenircon',
    // layout: './layouts/admin_layout', // INCORRECT for general user dashboard
    layout: './layouts/main_layout', // Should be main_layout if it's the user dashboard
    user: req.session.user
  });
};


exports.logoutUser = (req, res, next) => {
  const userId = req.session.user ? req.session.user.id : null;
  req.flash('success_msg', 'You have been logged out.'); 
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return next(err); 
    }
    // Log successful logout
    if (userId && typeof adminAuditLogController.logAction === 'function') {
        adminAuditLogController.logAction(userId, 'USER_LOGOUT', 'users', userId, {ip_address: req.ip});
    } else if (userId) {
        console.warn('adminAuditLogController.logAction is not a function. Logout audit skipped.');
    }
    res.redirect('/login');
  });
};


exports.showForgotPasswordPage = (req, res, next) => { 
  try {
    res.render('forgot-password', {
      title: 'Forgot Password - ConstructPro', // Changed Avenircon to ConstructPro
      pageTitle: 'Reset Your Password', 
      layout: './layout/public_layout', // Standardized layout path
      formData: req.session.forgotPasswordFormData || {},
      errors: req.session.forgotPasswordErrors || []
    });
    delete req.session.forgotPasswordFormData;
    delete req.session.forgotPasswordErrors;
  } catch (error) {
    console.error("Error rendering forgot password page:", error);
    next(error);
  }
};

exports.handleForgotPassword = async (req, res, next) => { 
  const { email } = req.body;
  
  try {
    if (!email || email.trim() === '') {
      req.session.forgotPasswordErrors = [{ msg: 'Please enter your email address.' }];
      req.session.forgotPasswordFormData = req.body;
      return res.redirect('/forgot-password');
    }
    
    const [users] = await db.query('SELECT id, email, username, is_active FROM users WHERE email = ?', [email.trim()]);
        
    if (users.length > 0 && users[0].is_active) {
      const user = users[0];
      const token = crypto.randomBytes(32).toString('hex'); 
      const expires_at = new Date(Date.now() + 3600000); // Token expires in 1 hour
      
      await db.query(
        'INSERT INTO password_resets (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
        [user.id, user.email, token, expires_at]
      );
      
      const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
      
      const mailData = {
          userName: user.username, // Or user.first_name if preferred
          resetLink: resetLink
      };

      try {
          const emailResult = await notificationService.sendNotification('password_reset_request', user.email, mailData);
          if (!emailResult.success) {
              console.error(`Password reset email for ${user.email} could not be sent: ${emailResult.message}`);
              // Don't expose email sending failure to user for security (prevents enumeration)
          }
      } catch (emailError) {
          console.error(`Critical error sending password reset email for ${user.email}:`, emailError);
      }
    }
    // Always show a generic message to prevent email enumeration
    req.flash('info_msg', 'If an account with that email exists and is active, a password reset link has been sent. Please check your email.');
    res.redirect('/forgot-password');
    
  } catch (error) {
    console.error("Error in handleForgotPassword:", error);
    // Still show generic message to user for security
    req.flash('info_msg', 'If an account with that email exists and is active, a password reset link has been sent. Please check your email.');
    res.redirect('/forgot-password'); 
  }
};

exports.showResetPasswordPage = async (req, res, next) => { 
  const { token } = req.params;
  try {
    const [resetRequests] = await db.query('SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()', [token]);
    if (resetRequests.length === 0) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot-password');
    }
    res.render('reset-password', {
      title: 'Reset Password - ConstructPro', // Changed Avenircon to ConstructPro
      pageTitle: 'Set Your New Password', 
      layout: './layout/public_layout', // Standardized layout path
      token,
      formData: req.session.resetPasswordFormData || {}, 
      errors: req.session.resetPasswordErrors || []   
    });
    delete req.session.resetPasswordFormData;
    delete req.session.resetPasswordErrors;
  } catch (error) {
    console.error("Error showing reset password page:", error);
    req.flash('error_msg', 'Error processing your request.');
    res.redirect('/forgot-password'); 
  }
};

exports.handleResetPassword = async (req, res, next) => { 
  const { token } = req.params;
  const { password, confirm_password } = req.body;
  let errors = [];

  if (!password || !confirm_password) {
    errors.push({ msg: "Please fill in both password fields."});
  } else {
    if (password.length < 6) { 
      errors.push({ msg: 'Password should be at least 6 characters.'});
    }
    if (password !== confirm_password) {
      errors.push({ msg: 'Passwords do not match.'});
    }
  }

  if (errors.length > 0) {
    req.session.resetPasswordFormData = { password: '', confirm_password: '' }; 
    req.session.resetPasswordErrors = errors;
    return res.redirect(`/reset-password/${token}`); 
  }
  
  try {
    const [resetRequests] = await db.query('SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()', [token]);
    if (resetRequests.length === 0) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot-password');
    }
    
    const resetRequest = resetRequests[0];
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const [userRows] = await db.query('SELECT id, username, email, is_active FROM users WHERE id = ?', [resetRequest.user_id]);
    if(userRows.length === 0 || !userRows[0].is_active){
        req.flash('error_msg', 'Cannot reset password for this account. It may be inactive or not found.');
        await db.query('DELETE FROM password_resets WHERE id = ?', [resetRequest.id]); // Clean up token
        return res.redirect('/login');
    }
    const user = userRows[0];

    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, resetRequest.user_id]);
    await db.query('DELETE FROM password_resets WHERE id = ?', [resetRequest.id]); 
    
    // Optional: Send password change confirmation email
    // try {
    //   await notificationService.sendNotification('password_changed_confirmation', user.email, { userName: user.username });
    // } catch (emailError) {
    //   console.warn(`Password change confirmation email for ${user.email} could not be sent: ${emailError.message}`);
    // }

    req.flash('success_msg', 'Password has been reset successfully. You can now log in.');
    res.redirect('/login');
    
  } catch (error) {
    console.error("Error resetting password:", error);
    req.flash('error_msg', 'Error resetting password. Please try again.');
    req.session.resetPasswordErrors = [{msg: 'An internal error occurred. Please try again.'}];
    res.redirect(`/reset-password/${token}`);
  }
};

/*
// Avenircon/controllers/authController.js
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const crypto = require('crypto'); // Ensure crypto is required for password reset
const adminAuditLogController = require('./adminAuditLogController'); // <<< NEW IMPORT

// --- Render Pages ---

exports.showRegisterPage = (req, res, next) => { // Added next
  try {
    res.render('register', {
      title: 'Register - Avenircon',
      pageTitle: 'Create Your Account', // Added pageTitle for layout consistency
      layout: './layouts/public_layout',
      formData: req.session.registerFormData || {}, // Use session data if exists
      errors: req.session.registerFormErrors || []  // Use session data if exists
    });
    // Clear session data after rendering
    delete req.session.registerFormData;
    delete req.session.registerFormErrors;
  } catch (error) {
    console.error("Error rendering register page:", error);
    next(error); // Pass to global error handler
  }
};

exports.showLoginPage = (req, res, next) => { // Added next
  try {
    res.render('login', {
      title: 'Login - Avenircon',
      pageTitle: 'Login to Your Account', // Added pageTitle
      layout: './layouts/public_layout',
      formData: req.session.loginFormData || {}, // Use session data if exists
      errors: req.session.loginFormErrors || []  // Use session data if exists
    });
    // Clear session data after rendering
    delete req.session.loginFormData;
    delete req.session.loginFormErrors;
  } catch (error) {
    console.error("Error rendering login page:", error);
    next(error); // Pass to global error handler
  }
};

exports.registerUser = async (req, res, next) => { // Added next
  const { username, email, password, confirm_password, first_name, last_name, company_name } = req.body;
  let errors = [];
  
  if (!username || !email || !password || !confirm_password) {
    errors.push({ msg: 'Please fill in all required fields (username, email, password, confirm password).' });
  }
  if (password !== confirm_password) {
    errors.push({ msg: 'Passwords do not match.' });
  }
  if (password && password.length < 6) { // Consider making password length a config
    errors.push({ msg: 'Password should be at least 6 characters.' });
  }
  
  if (errors.length > 0) {
    // Store errors and form data in session for PRG pattern
    req.session.registerFormData = req.body;
    req.session.registerFormErrors = errors;
    return res.redirect('/register');
  }
  
  try {
    const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUsers.length > 0) {
      errors.push({ msg: 'Username or Email already registered.' });
      req.session.registerFormData = req.body;
      req.session.registerFormErrors = errors;
      return res.redirect('/register');
    }
    
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const newUser = {
      username,
      email,
      password_hash,
      first_name: first_name || null,
      last_name: last_name || null,
      company_name: company_name || null,
      // role: 'User' // Default role should be set in DB schema or here if not
      // is_active: true // Default activity status
    };
    
    await db.query('INSERT INTO users SET ?', newUser);
    
    req.flash('success_msg', 'You are now registered and can log in!');
    res.redirect('/login');
    
  } catch (err) {
    console.error("Error during registration:", err);
    errors.push({ msg: 'Something went wrong during registration. Please try again.' });
    req.session.registerFormData = req.body;
    req.session.registerFormErrors = errors;
    res.redirect('/register'); // Redirect to show errors via session
  }
};

exports.loginUser = async (req, res, next) => { // Added next
  const { email_or_username, password } = req.body;
  let errors = [];
  
  if (!email_or_username || !password) {
    errors.push({ msg: 'Please enter both email/username and password.' });
  }
  
  if (errors.length > 0) {
    req.session.loginFormData = req.body;
    req.session.loginFormErrors = errors;
    return res.redirect('/login');
  }
  
  try {
    const [users] = await db.query('SELECT id, username, email, password_hash, role, first_name, last_name, company_name, is_active FROM users WHERE email = ? OR username = ?', [email_or_username, email_or_username]);
    
    if (users.length === 0) {
      errors.push({ msg: 'Invalid credentials. User not found.' });
      req.session.loginFormData = req.body;
      req.session.loginFormErrors = errors;
      return res.redirect('/login');
    }
    
    const user = users[0];

    // Optional: Check if user is active
    if (!user.is_active) {
        errors.push({ msg: 'Your account is inactive. Please contact support.' });
        req.session.loginFormData = req.body;
        req.session.loginFormErrors = errors;
        return res.redirect('/login');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (isMatch) {
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role, // Ensure 'role' is correctly populated from DB
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: user.company_name
      };
      req.flash('success_msg', 'You are logged in!');
      // Redirect to admin dashboard if admin, otherwise general dashboard
      res.redirect(user.role === 'Admin' ? '/admin' : '/dashboard');
    } else {
      errors.push({ msg: 'Invalid credentials. Password incorrect.' });
      req.session.loginFormData = req.body;
      req.session.loginFormErrors = errors;
      return res.redirect('/login');
    }
  } catch (err) {
    console.error("Error during login:", err);
    errors.push({ msg: 'Something went wrong during login. Please try again.' });
    req.session.loginFormData = req.body; // Keep form data even on server error
    req.session.loginFormErrors = errors;
    res.redirect('/login');
  }
};

exports.logoutUser = (req, res, next) => {
  req.flash('success_msg', 'You have been logged out.'); // Flash before destroying session
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      // Even if session destroy fails, try to redirect, but log the error.
      // A more robust solution might clear the cookie manually.
      return next(err); // Let global error handler deal with it, or redirect.
    }
    res.redirect('/login');
  });
};

/*
// This method seems to be legacy or conflicting with the /dashboard route in routes/app.js
// The main user dashboard should be handled by routes/app.js and use 'main_layout'.
// Commenting out for now to avoid confusion and potential conflicts.
// If a specific dashboard is needed via authController, it requires a distinct route and clear purpose.
exports.showDashboardPage = (req, res) => {
  // This internal auth check is redundant if the route uses isAuthenticated middleware
  if (!req.session.user) {
    req.flash('error_msg', 'Please log in to view that resource.');
    return res.redirect('/login');
  }
  res.render('dashboard', { // This would render views/dashboard.ejs
    title: 'Dashboard - Avenircon',
    // layout: './layouts/admin_layout', // INCORRECT for general user dashboard
    layout: './layouts/main_layout', // Should be main_layout if it's the user dashboard
    user: req.session.user
  });
};
*/
/*
exports.showForgotPasswordPage = (req, res, next) => { // Added next
  try {
    res.render('forgot-password', {
      title: 'Forgot Password - Avenircon',
      pageTitle: 'Reset Your Password', // Added pageTitle
      layout: './layouts/public_layout',
      formData: req.session.forgotPasswordFormData || {},
      errors: req.session.forgotPasswordErrors || []
    });
    delete req.session.forgotPasswordFormData;
    delete req.session.forgotPasswordErrors;
  } catch (error) {
    console.error("Error rendering forgot password page:", error);
    next(error);
  }
};

exports.handleForgotPassword = async (req, res, next) => { // Added next
  const { email } = req.body;
  
  try {
    if (!email || email.trim() === '') {
      req.session.forgotPasswordErrors = [{ msg: 'Please enter your email address.' }];
      req.session.forgotPasswordFormData = req.body;
      return res.redirect('/forgot-password');
    }
    
    const [users] = await db.query('SELECT id, email FROM users WHERE email = ? AND is_active = TRUE', [email.trim()]);
    
    // Always show a generic message to prevent email enumeration
    // even if user not found or inactive
    if (users.length > 0) {
      const user = users[0];
      const token = crypto.randomBytes(32).toString('hex'); // Increased token length
      const expires_at = new Date(Date.now() + 3600000); // Token expires in 1 hour
      
      await db.query(
        'INSERT INTO password_resets (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
        [user.id, user.email, token, expires_at]
      );
      
      // In a real app, you would email this link:
      const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
      console.log(`Password reset link for ${user.email}: ${resetLink}`);
      // TODO: Implement actual email sending (e.g., using Nodemailer)
    }
    
    req.flash('info_msg', 'If an account with that email exists and is active, a password reset link has been sent. Please check your email (and console for now).');
    res.redirect('/forgot-password');
    
  } catch (error) {
    console.error("Error in handleForgotPassword:", error);
    req.flash('error_msg', 'An error occurred. Please try again.');
    res.redirect('/forgot-password'); // Redirect to avoid re-submission on refresh
  }
};

exports.showResetPasswordPage = async (req, res, next) => { // Added next
  const { token } = req.params;
  try {
    const [resetRequests] = await db.query('SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()', [token]);
    if (resetRequests.length === 0) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot-password');
    }
    res.render('reset-password', {
      title: 'Reset Password - Avenircon',
      pageTitle: 'Set Your New Password', // Added pageTitle
      layout: './layouts/public_layout',
      token,
      formData: req.session.resetPasswordFormData || {}, // For PRG pattern if POST fails
      errors: req.session.resetPasswordErrors || []   // For PRG pattern
    });
    delete req.session.resetPasswordFormData;
    delete req.session.resetPasswordErrors;
  } catch (error) {
    console.error("Error showing reset password page:", error);
    req.flash('error_msg', 'Error processing your request.');
    res.redirect('/forgot-password'); // Fallback redirect
  }
};

exports.handleResetPassword = async (req, res, next) => { // Added next
  const { token } = req.params;
  const { password, confirm_password } = req.body;
  let errors = [];

  if (!password || !confirm_password) {
    errors.push({ msg: "Please fill in both password fields."});
  } else {
    if (password.length < 6) { // Consistent password length check
      errors.push({ msg: 'Password should be at least 6 characters.'});
    }
    if (password !== confirm_password) {
      errors.push({ msg: 'Passwords do not match.'});
    }
  }

  if (errors.length > 0) {
    req.session.resetPasswordFormData = { password: '', confirm_password: '' }; // Don't repopulate passwords
    req.session.resetPasswordErrors = errors;
    return res.redirect(`/reset-password/${token}`); // PRG pattern
  }
  
  try {
    const [resetRequests] = await db.query('SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()', [token]);
    if (resetRequests.length === 0) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot-password');
    }
    
    const resetRequest = resetRequests[0];
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    // Ensure user is still active before changing password
    const [userRows] = await db.query('SELECT is_active FROM users WHERE id = ?', [resetRequest.user_id]);
    if(userRows.length === 0 || !userRows[0].is_active){
        req.flash('error_msg', 'Cannot reset password for this account. It may be inactive.');
        return res.redirect('/login');
    }

    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, resetRequest.user_id]);
    await db.query('DELETE FROM password_resets WHERE id = ?', [resetRequest.id]); // Delete used token
    
    req.flash('success_msg', 'Password has been reset successfully. You can now log in.');
    res.redirect('/login');
    
  } catch (error) {
    console.error("Error resetting password:", error);
    req.flash('error_msg', 'Error resetting password. Please try again.');
    // In case of server error, redirect back to the form (token should still be in URL)
    // PRG pattern: store minimal error in session, redirect
    req.session.resetPasswordErrors = [{msg: 'An internal error occurred. Please try again.'}];
    res.redirect(`/reset-password/${token}`);
  }
};

*/