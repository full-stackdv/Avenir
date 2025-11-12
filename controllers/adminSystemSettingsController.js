//const settingsService = require('../services/settingsService');

const settingsService = require('../services/settingsService'); // Service to interact with settings data
const nodemailer = require('nodemailer'); // For the SMTP test functionality

/**
 * Displays the system settings form.
 * Fetches all settings, groups them, and renders the settings page.
 */
exports.showSettingsForm = async (req, res, next) => {
  try {
    // 1. Fetch all settings from the database, grouped by their 'setting_group'
    const groupedSettings = await settingsService.getAllSettingsFromDB(true); 
    
    // 2. Get an array of unique group names (e.g., ['email', 'general', 'maintenance']) and sort them
    const settingGroups = Object.keys(groupedSettings).sort(); 
    
    // 3. Render the EJS template, passing the grouped settings and group names
    res.render('admin/settings/index', { // Assumes your EJS file is at 'views/admin/settings/index.ejs'
      title: 'System Settings',
      layout: 'layout/admin_layout', // Specifies the layout file
      user: req.session.user, // User data for the layout/template
      currentMenu: 'system_settings', // For highlighting the active menu item in a sidebar
      groupedSettings, // The object containing settings grouped by their category
      settingGroups,   // The array of group names for tab generation and ordering
      messages: req.flash() // For displaying flash messages (success, error, info)
    });
  } catch (error) {
    console.error("Error fetching system settings for form:", error);
    req.flash('error', 'Failed to load system settings.');
    res.redirect('/admin/dashboard'); // Or an appropriate error page
  }
};


/**
 * Handles the submission of the system settings form to update settings.
 */
exports.handleUpdateSettings = async (req, res, next) => {
  const settingsToUpdate = [];
  
  try {
    // Fetch all settings defined in the DB to correctly handle boolean values
    // (checkboxes that are unchecked are not sent in the form body)
    const allDbSettings = await settingsService.getAllSettingsFromDB(false); // false = not grouped
    
    for (const dbSetting of allDbSettings) {
      const key = dbSetting.setting_key;
      
      // Skip password update if the submitted value is the placeholder or empty
      if (dbSetting.input_type === 'password' && (req.body[key] === '********' || req.body[key] === '' || req.body[key] === undefined)) {
        continue; // Don't add this password to settingsToUpdate
      }
      
      if (dbSetting.input_type === 'boolean') {
        // If a checkbox (boolean) is checked, req.body[key] will be its value (e.g., 'true' or 'on').
        // If unchecked, req.body[key] will be undefined.
        // We convert this to 'true' or 'false' string for consistent storage.
        settingsToUpdate.push({ key: key, value: req.body[key] ? 'true' : 'false' });
      } else if (req.body.hasOwnProperty(key)) {
        // For all other input types, if the key exists in the submitted form body, add it for update.
        settingsToUpdate.push({ key: key, value: req.body[key] });
      }
      // Note: If a non-boolean setting key from the DB is NOT in req.body, it means
      // it wasn't part of the submitted form (which shouldn't happen if the form is complete)
      // or there's an issue. This logic only updates settings that are present in the submission
      // or are explicitly handled (like booleans).
    }
    
    if (settingsToUpdate.length > 0) {
      const result = await settingsService.updateSettings(settingsToUpdate); // Batch update
      if (result.success) {
        req.flash('success', `${result.settingsUpdated} setting(s) updated successfully.`);
      } else {
        req.flash('error', 'An issue occurred while updating some settings.');
      }
    } else {
      req.flash('info', 'No settings were submitted for update or no changes were detected.');
    }
  } catch (error) {
    console.error("Error updating system settings:", error);
    req.flash('error', 'Failed to update system settings. Please try again.');
  }
  // Redirect back to the settings page (the hash for the active tab will be preserved by the client-side JS)
  res.redirect('/admin/settings'); 
};

/**
 * Handles the request to test SMTP settings.
 * Reads current SMTP settings, attempts to send a test email.
 */
exports.testSmtpSettings = async (req, res, next) => {
  try {
    const adminEmail = settingsService.getSetting('admin_email', 'test@example.com'); // Get admin email to send test to
    
    // Check if SMTP is even enabled
    if (!settingsService.getSetting('smtp_enabled', false)) {
      req.flash('warning', 'SMTP is not enabled in settings. Please enable it and save before testing.');
      return res.redirect('/admin/settings#email'); // Redirect to the email tab
    }
    
    // Configure Nodemailer transporter with current settings
    const transporter = nodemailer.createTransport({
      host: settingsService.getSetting('smtp_host'),
      port: parseInt(settingsService.getSetting('smtp_port', 587)), // Ensure port is an integer
      secure: settingsService.getSetting('smtp_secure', false), // true for 465 (SSL), false for other ports (TLS usually)
      auth: {
        user: settingsService.getSetting('smtp_user'),
        pass: settingsService.getSetting('smtp_password'), // Actual password from settings
      },
      // For debugging with self-signed certificates (use with caution in production)
      // tls: { 
      //   rejectUnauthorized: settingsService.getSetting('smtp_reject_unauthorized_tls', true) // Add a setting for this
      // } 
    });
    
    // Verify connection configuration
    await transporter.verify(); 
    
    // Send the test email
    await transporter.sendMail({
      from: `"${settingsService.getSetting('email_from_name', 'System Test')}" <${settingsService.getSetting('email_from_address', 'noreply@example.com')}>`,
      to: adminEmail,
      subject: `${settingsService.getSetting('site_name', 'Your Application')} - SMTP Test Email`,
      text: 'This is a test email from your application to verify your SMTP settings. If you received this, your settings are correct!',
      html: '<p>This is a test email from <strong>your application</strong> to verify your SMTP settings.</p><p>If you received this, your settings are correct!</p>',
    });
    
    req.flash('success', `Test email sent successfully to ${adminEmail}. Please check your inbox (and spam folder).`);
  } catch (error) {
    console.error("SMTP Test Error:", error);
    // Provide a more user-friendly error message
    let errorMessage = `Failed to send test email. Error: ${error.message}.`;
    if (error.code === 'ECONNREFUSED') {
        errorMessage += ' Ensure the SMTP host and port are correct and the mail server is running.';
    } else if (error.code === 'EAUTH') {
        errorMessage += ' Check your SMTP username and password.';
    }
    // Add more specific error handling as needed
    req.flash('error', errorMessage);
  }
  // Redirect back to the settings page, specifically to the 'email' tab
  res.redirect('/admin/settings#email'); 
};


/*
exports.showSettingsForm = async (req, res, next) => {
  try {
    const groupedSettings = await settingsService.getAllSettingsFromDB(true);
    const settingGroups = Object.keys(groupedSettings).sort(); // Get sorted group names
    
    res.render('admin/settings/index', {
      title: 'System Settings',
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'system_settings',
      groupedSettings,
      settingGroups, // Pass sorted group names for tab ordering
      messages: req.flash()
    });
  } catch (error) {
    console.error("Error fetching system settings for form:", error);
    req.flash('error', 'Failed to load system settings.');
    res.redirect('/admin/dashboard'); // Or an error page
  }
};

exports.handleUpdateSettings = async (req, res, next) => {
  const settingsToUpdate = [];
  // req.body will contain key-value pairs from the form
  // Need to handle checkboxes: if not checked, they might not be in req.body.
  // So, fetch all boolean settings and if a key is not in req.body, assume it's 'false'.
  
  try {
    const allDbSettings = await settingsService.getAllSettingsFromDB(false);
    
    for (const dbSetting of allDbSettings) {
      const key = dbSetting.setting_key;
      if (dbSetting.input_type === 'password' && (req.body[key] === '********' || req.body[key] === '')) {
        // Skip password update if it's placeholder or empty
        continue;
      }
      
      if (dbSetting.input_type === 'boolean') {
        // If checkbox is checked, req.body[key] will be 'on' or its value.
        // If unchecked, req.body[key] will be undefined.
        settingsToUpdate.push({ key: key, value: req.body[key] ? 'true' : 'false' });
      } else if (req.body.hasOwnProperty(key)) {
        // For other types, if the key exists in body, update it
        settingsToUpdate.push({ key: key, value: req.body[key] });
      }
      // If a non-boolean setting key from DB is not in req.body, it means it wasn't part of the form or something went wrong.
      // We are only updating settings that are submitted or explicitly handled (like booleans).
    }
    
    if (settingsToUpdate.length > 0) {
      const result = await settingsService.updateSettings(settingsToUpdate);
      if (result.success) {
        req.flash('success', `${result.settingsUpdated} setting(s) updated successfully.`);
      } else {
        req.flash('error', 'An issue occurred while updating some settings.');
      }
    } else {
      req.flash('info', 'No settings were submitted for update.');
    }
  } catch (error) {
    console.error("Error updating system settings:", error);
    req.flash('error', 'Failed to update system settings. Please try again.');
  }
  res.redirect('/admin/settings');
};

// Optional: Endpoint to test SMTP settings
exports.testSmtpSettings = async (req, res, next) => {
  // This would require a mailer service (e.g., using Nodemailer)
  // configured to use settings from settingsService.getSetting(...)
  const nodemailer = require('nodemailer'); // You'd need to npm install nodemailer
  
  try {
    const adminEmail = settingsService.getSetting('admin_email', 'test@example.com');
    if (!settingsService.getSetting('smtp_enabled', false)) {
      req.flash('warning', 'SMTP is not enabled in settings.');
      return res.redirect('/admin/settings#email'); // Redirect to email tab
    }
    
    const transporter = nodemailer.createTransport({
      host: settingsService.getSetting('smtp_host'),
      port: parseInt(settingsService.getSetting('smtp_port', 587)),
      secure: settingsService.getSetting('smtp_secure', false), // true for 465, false for other ports
      auth: {
        user: settingsService.getSetting('smtp_user'),
        pass: settingsService.getSetting('smtp_password'),
      },
      // tls: { rejectUnauthorized: false } // Add if using self-signed certs, for testing only
    });
    
    await transporter.verify(); // Verify connection configuration
    
    await transporter.sendMail({
      from: `"${settingsService.getSetting('email_from_name', 'avenircon Test')}" <${settingsService.getSetting('email_from_address', 'noreply@avenircon.com')}>`,
      to: adminEmail,
      subject: 'avenircon SMTP Test Email',
      text: 'This is a test email from avenircon to verify your SMTP settings.',
      html: '<p>This is a test email from <b>Avenircon</b> to verify your SMTP settings.</p>',
    });
    
    req.flash('success', `Test email sent successfully to ${adminEmail}. Please check your inbox.`);
  } catch (error) {
    console.error("SMTP Test Error:", error);
    req.flash('error', `Failed to send test email: ${error.message}`);
  }
  res.redirect('/admin/settings#email'); // Redirect to email tab using URL fragment
};


// adminSystemSettingsController.js


*/