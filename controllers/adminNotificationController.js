// constructpro/controllers/adminNotificationTemplateController.js
//To Do for Refactoring:

//Identify all email sending points: Search your project for nodemailer.createTransport or direct email sending logic.

//Define Template Keys: For each type of email, ensure a corresponding template_key exists in the notification_templates table (add more via SQL if needed).

//Identify Placeholders: For each template, determine what dynamic data (placeholders) it needs. Update the available_placeholders JSON in the database and ensure your code passes this data.

//Replace Logic: Update the code to call notificationService.sendNotification(templateKey, recipientEmail, data)

//This completes the implementation plan for Email Notification Template Management. After you've implemented these parts and the refactoring, your admins will have much better control over system communications! 
const notificationService = require('../services/notificationService');
const settingsService = require('../services/settingsService');

exports.listTemplates = async (req, res, next) => {
  try {
    const templates = await notificationService.listAllTemplates();
    res.render('admin/communication/notification_templates/list', {
      title: 'Email Notification Templates',
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'notification_templates',
      templates,
      messages: req.flash()
    });
  } catch (error) {
    next(error);
  }
};

exports.showEditForm = async (req, res, next) => {
  try {
    const templateKey = req.params.templateKey;
    const template = await notificationService.getTemplateByKey(templateKey);
    if (!template) {
      req.flash('error', 'Notification template not found.');
      return res.redirect('/admin/communication/notification-templates');
    }
    res.render('admin/communication/notification_templates/edit_form', {
      title: `Edit Template: ${template.description || template.template_key}`,
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'notification_templates',
      template,
      messages: req.flash()
    });
  } catch (error) {
    next(error);
  }
};

exports.handleUpdate = async (req, res, next) => {
  const templateKey = req.params.templateKey;
  const { subject_template, body_html_template, body_text_template } = req.body;
  try {
    const template = await notificationService.getTemplateByKey(templateKey);
    if (!template) {
      req.flash('error', 'Notification template not found.');
      return res.redirect('/admin/communication/notification-templates');
    }
    if (!template.is_customizable) {
      req.flash('error', 'This template is not customizable.');
      return res.redirect(`/admin/communication/notification-templates/${templateKey}/edit`);
    }
    
    // Basic validation
    if (!subject_template || !body_html_template || !body_text_template) {
      req.flash('error', 'Subject, HTML Body, and Text Body are required.');
      return res.redirect(`/admin/communication/notification-templates/${templateKey}/edit`);
    }
    
    const result = await notificationService.updateTemplate(templateKey, {
      subject_template,
      body_html_template,
      body_text_template
    });
    
    if (result.affectedRows > 0) {
      req.flash('success', `Template '${templateKey}' updated successfully.`);
    } else {
      req.flash('info', 'No changes made to the template or template not found/customizable.');
    }
    res.redirect('/admin/communication/notification-templates');
  } catch (error) {
    console.error(`Error updating template ${templateKey}:`, error);
    req.flash('error', `Failed to update template: ${error.message}`);
    res.redirect(`/admin/communication/notification-templates/${templateKey}/edit`);
  }
};

exports.handleSendTestEmail = async (req, res, next) => {
  const templateKey = req.params.templateKey;
  // Use admin's email or a configured test email from settings
  const adminEmail = req.session.user.email || settingsService.getSetting('admin_email');
  
  if (!adminEmail) {
    req.flash('error', 'Admin email not found to send test.');
    return res.redirect('/admin/communication/notification-templates');
  }
  
  try {
    if (!settingsService.getSetting('smtp_enabled', false)) {
      req.flash('warning', 'SMTP is not enabled. Test email cannot be sent. Please configure SMTP settings.');
      return res.redirect('/admin/communication/notification-templates');
    }
    
    const result = await notificationService.sendTestNotification(templateKey, adminEmail);
    if (result.success) {
      req.flash('success', `Test email for '${templateKey}' sent to ${adminEmail}. Please check your inbox.`);
    } else {
      req.flash('error', `Failed to send test email for '${templateKey}': ${result.message}`);
    }
  } catch (error) {
    console.error(`Error sending test email for ${templateKey}:`, error);
    req.flash('error', `An unexpected error occurred while sending test email: ${error.message}`);
  }
  res.redirect('/admin/communication/notification-templates');
};

// Optional: handleResetToDefault - This requires storing default versions of templates.
// For simplicity, this is omitted for now. It could involve:
// 1. Having a separate table for default templates.
// 2. Embedding default templates in code (less flexible).
// 3. Re-inserting from a seed data script (requires careful handling).
/*
exports.handleResetToDefault = async (req, res, next) => {
    const templateKey = req.params.templateKey;
    // ... logic to fetch original/default template content ...
    // ... then call notificationService.updateTemplate with default content ...
    req.flash('info', 'Reset to default functionality not yet implemented.');
    res.redirect(`/admin/communication/notification-templates/${templateKey}/edit`);
};
*/