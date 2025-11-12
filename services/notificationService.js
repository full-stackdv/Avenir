// constructpro/services/notificationService.js
const db = require('../config/db');
const nodemailer = require('nodemailer');
//const settingsService = require('./settingsService'); // For SMTP settings and site name

/**
 * Renders a template string with the given data object.
 * Replaces placeholders like {{key}} with corresponding values from data.
 * @param {string} templateString The template string.
 * @param {object} data The data object with key-value pairs for placeholders.
 * @returns {string} The rendered string.
 */
function renderTemplate(templateString, data) {
  if (!templateString) return '';
  let rendered = templateString;
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, data[key]);
    }
  }
  // Replace siteName globally if not provided in specific data
  const siteName = settingsService.getSetting('site_name', 'ConstructPro');
  rendered = rendered.replace(/{{siteName}}/g, siteName);
  return rendered;
}

/**
 * Fetches a notification template by its key.
 * @param {string} templateKey The unique key of the template.
 * @returns {Promise<object|null>} The template object or null if not found.
 */
exports.getTemplateByKey = async (templateKey) => {
  try {
    const [rows] = await db.query('SELECT * FROM notification_templates WHERE template_key = ?', [templateKey]);
    if (rows.length > 0) {
      const template = rows[0];
      if (template.available_placeholders) {
        try {
          template.parsed_placeholders = JSON.parse(template.available_placeholders);
        } catch (e) {
          console.error(`Failed to parse placeholders for template ${templateKey}:`, e);
          template.parsed_placeholders = [];
        }
      } else {
        template.parsed_placeholders = [];
      }
      return template;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching template ${templateKey}:`, error);
    throw error;
  }
};

/**
 * Lists all notification templates.
 * @returns {Promise<Array<object>>} A list of template objects.
 */
exports.listAllTemplates = async () => {
  try {
    const [rows] = await db.query('SELECT id, template_key, description, subject_template, is_customizable, updated_at FROM notification_templates ORDER BY template_key');
    return rows;
  } catch (error) {
    console.error('Error listing all templates:', error);
    throw error;
  }
};

/**
 * Updates a notification template.
 * @param {string} templateKey The key of the template to update.
 * @param {object} data The data to update { subject_template, body_html_template, body_text_template }.
 * @returns {Promise<object>} Result of the update operation.
 */
exports.updateTemplate = async (templateKey, data) => {
  const { subject_template, body_html_template, body_text_template } = data;
  try {
    const [result] = await db.query(
      'UPDATE notification_templates SET subject_template = ?, body_html_template = ?, body_text_template = ?, updated_at = CURRENT_TIMESTAMP WHERE template_key = ? AND is_customizable = TRUE',
      [subject_template, body_html_template, body_text_template, templateKey]
    );
    return result;
  } catch (error) {
    console.error(`Error updating template ${templateKey}:`, error);
    throw error;
  }
};


/**
 * Sends a notification email.
 * @param {string} templateKey The key of the template to use.
 * @param {string} recipientEmail The email address of the recipient.
 * @param {object} data The data object for rendering placeholders in the template.
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
exports.sendNotification = async (templateKey, recipientEmail, data = {}) => {
  if (!settingsService.getSetting('smtp_enabled', false)) {
    console.warn(`Email sending skipped: SMTP is not enabled. Template: ${templateKey}, To: ${recipientEmail}`);
    // In a real app, you might want to log this to a persistent log for admins to see
    return { success: false, message: 'SMTP is not enabled in system settings.' };
  }
  
  const template = await this.getTemplateByKey(templateKey);
  if (!template) {
    console.error(`Email sending failed: Template ${templateKey} not found.`);
    return { success: false, message: `Notification template '${templateKey}' not found.` };
  }
  
  // Add common/global placeholders
  const enhancedData = {
    ...data,
    siteName: settingsService.getSetting('site_name', 'ConstructPro'),
    recipientEmail: recipientEmail,
    // You can add more global placeholders like siteUrl if configured
    // siteUrl: settingsService.getSetting('site_url', 'http://localhost:3000') 
  };
  
  const subject = renderTemplate(template.subject_template, enhancedData);
  const htmlBody = renderTemplate(template.body_html_template, enhancedData);
  const textBody = renderTemplate(template.body_text_template, enhancedData);
  
  const transporter = nodemailer.createTransport({
    host: settingsService.getSetting('smtp_host'),
    port: parseInt(settingsService.getSetting('smtp_port', 587)),
    secure: settingsService.getSetting('smtp_secure', false), // true for 465, false for others
    auth: {
      user: settingsService.getSetting('smtp_user'),
      pass: settingsService.getSetting('smtp_password'),
    },
    // tls: { rejectUnauthorized: false } // For self-signed certs in dev; NOT for production
  });
  
  const mailOptions = {
    from: `"${settingsService.getSetting('email_from_name', 'ConstructPro')}" <${settingsService.getSetting('email_from_address', 'noreply@constructpro.com')}>`,
    to: recipientEmail,
    subject: subject,
    text: textBody,
    html: htmlBody,
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${templateKey} to ${recipientEmail}. Message ID: ${info.messageId}`);
    // Optionally log successful email to a database table `email_logs`
    // await logEmailAttempt(templateKey, recipientEmail, 'success', info.messageId);
    return { success: true, message: 'Email sent successfully.', messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending email ${templateKey} to ${recipientEmail}:`, error);
    // await logEmailAttempt(templateKey, recipientEmail, 'failed', null, error.message);
    return { success: false, message: `Failed to send email: ${error.message}` };
  }
};

/**
 * Sends a test email for a given template to the specified recipient.
 * @param {string} templateKey The key of the template to test.
 * @param {string} recipientEmail The email address to send the test to.
 * @returns {Promise<{success: boolean, message: string, messageId?: string}>}
 */
exports.sendTestNotification = async (templateKey, recipientEmail) => {
  const template = await this.getTemplateByKey(templateKey);
  if (!template) {
    return { success: false, message: `Test email failed: Template '${templateKey}' not found.` };
  }
  
  // Prepare generic test data based on available placeholders
  const testData = {
    userName: "Test User",
    invitedUserName: "Test Invited User",
    inviterName: "Admin User",
    projectName: "Sample Project X",
    resetLink: `${settingsService.getSetting('site_url', 'http://localhost:3000')}/auth/reset-password/test-token-123`,
    verificationLink: `${settingsService.getSetting('site_url', 'http://localhost:3000')}/auth/verify-email/test-token-456`,
    invitationLink: `${settingsService.getSetting('site_url', 'http://localhost:3000')}/project/invitation/test-token-789`,
    // Add more common placeholders if needed for comprehensive testing
  };
  
  // Include any specific placeholders mentioned in the template if not already generic
  if (template.parsed_placeholders) {
    template.parsed_placeholders.forEach(pKey => {
      const keyName = pKey.replace(/[{}]/g, ""); // remove {{ and }}
      if (!testData.hasOwnProperty(keyName)) {
        testData[keyName] = `[Sample ${keyName}]`;
      }
    });
  }
  
  
  return this.sendNotification(templateKey, recipientEmail, testData);
}; 