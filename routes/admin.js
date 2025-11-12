// Avenircon/routes/admin.js
const express = require('express');
const router = express.Router();
//const postService = require('../services/postService');


// --- Controller Imports ---
const adminPostController = require('../controllers/adminPostController');
const adminUserController = require('../controllers/adminUserController'); // New
const adminAuditLogController = require('../controllers/adminAuditLogController'); // New
const adminContactMessageController = require('../controllers/adminContactMessageController'); // New
const projectTemplateController = require('../controllers/projectTemplateController'); // <<< NEW IMPORT
const adminSystemSettingsController = require('../controllers/adminSystemSettingsController'); // New controller
const adminBackupController = require('../controllers/adminBackupController');
const adminAnnouncementController = require('../controllers/adminAnnouncementController');
const adminNotificationTemplateController = require('../controllers/adminNotificationTemplateController');
const adminPageContentController = require('../controllers/adminPageContentController');
const adminPostCategoryController = require('../controllers/adminPostCategoryController');
const idCardController = require('../controllers/idCardController'); // Make sure this is required
// Add other admin-specific controllers like project template management if they exist

const { uploadCompanyAsset } = require('../config/multerConfig'); // Make sure this is required


 
// --- Middleware ---
//const { authorizeAdminOnly } = require('../middleware/authMiddleware'); // Ensure this path is correct

// --- Middleware Imports ---
const { isAuthenticated, hasRole } = require('../middleware/authMiddleware');
const { uploadFeatureImage, uploadDocument } = require('../config/multerConfig'); // Assuming this is correct
const { ensureAuthenticated, isAdmin } = require('../middleware/authMiddleware'); // 

//const authorizeStaffOnly = [isAuthenticated, hasRole('Admin')]; // Ensure this or similar is defined
// --- Multer Instances ---
// Assuming you have these for blog posts (from your adminPostController)
//const { uploadFeatureImage, uploadPostDocument } = require('../config/multerConfig');
// For Page Content Management
const { uploadPageContentImages } = require('../config/multerConfig');


// --- Authorization Middleware Definitions ---
const authorizeAdminOrEditor = [isAuthenticated, hasRole(['Admin', 'Editor'])];
const authorizeAdminOnly = [isAuthenticated, hasRole('Admin')]; // For admin-only features

// At the top of routes/admin.js
router.use((req, res, next) => {
    res.locals.currentPath = req.path; // or req.originalUrl
    res.locals.currentUser = req.session.user; // Make currentUser available to all admin views
    next();
});

// Admin Dashboard / Landing Page
router.get('/', authorizeAdminOnly, (req, res) => {
  res.render('admin/index', { // Ensure views/admin/index.ejs exists or create a simple one
    title: 'Admin Dashboard - Avenircon',
    pageTitle: 'Admin Dashboard',
    layout: './layouts/admin_layout'
  });
});

// --- Post Management Routes (Existing) ---
router.get('/posts', authorizeAdminOrEditor, adminPostController.listPosts);
router.get('/posts/create', authorizeAdminOrEditor, adminPostController.showCreatePostForm);
router.post(
  '/posts/create',
  authorizeAdminOrEditor,
  uploadFeatureImage.single('feature_image'),
  adminPostController.handleCreatePost
);
router.get('/posts/:id/edit', authorizeAdminOrEditor, adminPostController.showEditPostForm);
router.post(
  '/posts/:id/edit',
  authorizeAdminOrEditor,
  uploadFeatureImage.single('feature_image'),
  adminPostController.handleUpdatePost
);
router.post('/posts/:id/delete', authorizeAdminOrEditor, adminPostController.handleDeletePost);
router.get('/posts/:id/preview', authorizeAdminOrEditor, adminPostController.previewPost);
router.get('/posts/:id/statistics', authorizeAdminOrEditor, adminPostController.showPostStatistics);

// --- Comment Moderation Routes for a Specific Post (Existing) ---
router.get('/posts/:postId/comments', authorizeAdminOrEditor, adminPostController.listPostCommentsAdmin);
router.post('/posts/:postId/comments/:commentId/approve', authorizeAdminOrEditor, adminPostController.approveComment);
router.post('/posts/:postId/comments/:commentId/unapprove', authorizeAdminOrEditor, adminPostController.unapproveComment); // Ensure this method exists if needed
router.post('/posts/:postId/comments/:commentId/delete', authorizeAdminOrEditor, adminPostController.deleteCommentAdmin);

// --- Document Management Routes for a Specific Post (Existing) ---
/*router.post(
  '/posts/:postId/documents/upload',
  authorizeAdminOrEditor,
  uploadDocument.array('post_documents', 5),
  adminPostController.handleDocumentUpload
);*/

//router.post('/posts/:postId/documents/upload', authorizeAdminOnly, uploadPostDocument.array('post_documents', 5), adminPostController.handleDocumentUpload);

router.post(
  '/posts/:postId/documents/:documentId/delete',
  authorizeAdminOrEditor,
  adminPostController.deletePostDocument
);

// Optional: Route for updating document metadata (title/description)
// router.post('/posts/:postId/documents/:documentId/update-meta', authorizeAdminOrEditor, adminPostController.updateDocumentMetadata);

// =============================================
// --- NEW ADMIN ROUTES FOR USER MANAGEMENT ---
// =============================================
// M6.1: List Users & Toggle Status & Admin Change Password & ADMIN EDIT USER
router.get('/users', authorizeAdminOnly, adminUserController.listUsers);
router.post('/users/:userId/toggle-status', authorizeAdminOnly, adminUserController.toggleUserStatus);
router.get('/users/:userId/change-password', authorizeAdminOnly, adminUserController.showChangeUserPasswordForm);
router.post('/users/:userId/change-password', authorizeAdminOnly, adminUserController.handleChangeUserPassword);
router.get('/users/:userId/edit', authorizeAdminOnly, adminUserController.showEditUserFormAdmin); // <<< NEW
router.post('/users/:userId/edit', authorizeAdminOnly, adminUserController.handleEditUserAdmin); // <<< NEW

// M6.2: Assign Roles (This can be part of the edit user form or remain separate)
// If part of edit form, these specific routes might be redundant if edit form handles role changes.
// For now, keeping them separate as per original plan.
router.get('/users/:userId/assign-role', authorizeAdminOnly, adminUserController.showAssignRoleForm);
router.post('/users/:userId/assign-role', authorizeAdminOnly, adminUserController.handleAssignRole);

 

// ADMIN ADD NEW USER
router.get('/users/create', authorizeAdminOnly, adminUserController.showCreateUserFormAdmin); // <<< NEW
router.post('/users/create', authorizeAdminOnly, adminUserController.handleCreateUserAdmin); // <<< NEW
// =============================================

// --- NEW ADMIN ROUTES FOR AUDIT LOGS ---
// =============================================

// M6.3: Audit Log Viewer
router.get('/audit-logs', authorizeAdminOnly, adminAuditLogController.listAuditLogs);
// add other routes 
//router.get('/audit-logs', adminAuditLogController.listAuditLogs); // <<< ADD THIS ROUTE

// ====================================================
// --- NEW ADMIN ROUTES FOR CONTACT MESSAGES (MX) ---
// ====================================================
router.get('/contact-messages', authorizeAdminOnly, adminContactMessageController.listContactMessages);
router.get('/contact-messages/:messageId', authorizeAdminOnly, adminContactMessageController.showContactMessageDetails);
router.post('/contact-messages/:messageId/delete', authorizeAdminOnly, adminContactMessageController.deleteContactMessage);
// Optional: Route for marking as read explicitly if not done on view
// router.post('/contact-messages/:messageId/mark-read', authorizeAdminOnly, adminContactMessageController.markMessageAsRead);


// System Project Template Management (Admin)  <<<< NEW ROUTES >>>>
// System Project Template Management (Admin)
router.get('/project-templates', authorizeAdminOnly, projectTemplateController.listSystemTemplates);
router.get('/project-templates/create', authorizeAdminOnly, projectTemplateController.showCreateSystemTemplateForm);
router.post('/project-templates/create', authorizeAdminOnly, projectTemplateController.handleCreateSystemTemplate);
router.get('/project-templates/:templateId/edit', authorizeAdminOnly, projectTemplateController.showEditSystemTemplateForm);
router.post('/project-templates/:templateId/edit', authorizeAdminOnly, projectTemplateController.handleUpdateSystemTemplate);
router.post('/project-templates/:templateId/delete', authorizeAdminOnly, projectTemplateController.handleDeleteSystemTemplate);

// ===============================================================
// --- NEW ROUTES: TASKS for System Project Templates (Admin) ---
// ===============================================================
router.get('/project-templates/:templateId/tasks', authorizeAdminOnly, projectTemplateController.listTemplateTasks);
router.get('/project-templates/:templateId/tasks/create', authorizeAdminOnly, projectTemplateController.showCreateTemplateTaskForm);
router.post('/project-templates/:templateId/tasks/create', authorizeAdminOnly, projectTemplateController.handleCreateTemplateTask);
router.get('/project-templates/:templateId/tasks/:taskId/edit', authorizeAdminOnly, projectTemplateController.showEditTemplateTaskForm);
router.post('/project-templates/:templateId/tasks/:taskId/edit', authorizeAdminOnly, projectTemplateController.handleUpdateTemplateTask);
router.post('/project-templates/:templateId/tasks/:taskId/delete', authorizeAdminOnly, projectTemplateController.handleDeleteTemplateTask);


// NEW ROUTE for editing template structure
router.get('/project-templates/:templateId/structure', authorizeAdminOnly, projectTemplateController.showEditTemplateStructureForm);

// NEW POST ROUTE for adding a template task
router.post('/project-templates/:templateId/tasks/add', authorizeAdminOnly, projectTemplateController.handleAddTemplateTask);


// NEW ROUTE for getting template task details (for editing)
router.get('/project-templates/:templateId/tasks/:taskId/details', authorizeAdminOnly, projectTemplateController.getTemplateTaskDetails);

router.post('/project-templates/:templateId/tasks/:taskId/update', authorizeAdminOnly, projectTemplateController.handleUpdateTemplateTask);

// NEW ROUTE for deleting a template task
router.post('/project-templates/:templateId/tasks/:taskId/delete', authorizeAdminOnly, projectTemplateController.handleRemoveTemplateTask);

// NEW ROUTE for reordering template tasks
router.post('/project-templates/:templateId/tasks/reorder', authorizeAdminOnly, projectTemplateController.handleReorderTemplateTasks);


 
/*
// System Settings Routes
router.get('/settings', authorizeAdminOnly, adminSystemSettingsController.showSettingsForm);
router.post('/settings/update', authorizeAdminOnly, adminSystemSettingsController.handleUpdateSettings);
router.post('/settings/test-smtp', authorizeAdminOnly, adminSystemSettingsController.testSmtpSettings); // Optional SMTP test
*/

// ==================================================================
// SYSTEM SETTINGS & MAINTENANCE
// ==================================================================
router.get('/settings', authorizeAdminOnly, adminSystemSettingsController.showSettingsForm);
router.post('/settings/update', authorizeAdminOnly, adminSystemSettingsController.handleUpdateSettings);
router.post('/settings/test-smtp', authorizeAdminOnly, adminSystemSettingsController.testSmtpSettings);

router.get('/system/backups', authorizeAdminOnly, adminBackupController.showBackupPage);
router.post('/system/backups/trigger-manual', authorizeAdminOnly, adminBackupController.handleTriggerManualBackup);
router.post('/system/backups/:backupId/delete', authorizeAdminOnly, adminBackupController.handleDeleteBackup);
// router.get('/system/backups/:backupId/download', authorizeAdminOnly, adminBackupController.handleDownloadBackup); // Optional


// ==================================================================
// CONTENT MANAGEMENT (Announcements, Static Pages)
// ==================================================================
// Announcements
router.get('/content/announcements', authorizeAdminOnly, adminAnnouncementController.listAnnouncements);
router.get('/content/announcements/create', authorizeAdminOnly, adminAnnouncementController.showCreateForm);
router.post('/content/announcements/create', authorizeAdminOnly, adminAnnouncementController.handleCreate);
router.get('/content/announcements/:id/edit', authorizeAdminOnly, adminAnnouncementController.showEditForm);
router.post('/content/announcements/:id/edit', authorizeAdminOnly, adminAnnouncementController.handleUpdate);
router.post('/content/announcements/:id/delete', authorizeAdminOnly, adminAnnouncementController.handleDelete);
router.post('/content/announcements/:id/toggle-active', authorizeAdminOnly, adminAnnouncementController.handleToggleActive);

// Static Page Content Management
router.get('/pages', authorizeAdminOnly, adminPageContentController.listEditablePages);
router.get('/pages/:pageKey/edit', authorizeAdminOnly, adminPageContentController.showEditPageForm);
router.post(
    '/pages/:pageKey/edit',
    authorizeAdminOnly,
    uploadPageContentImages, // Multer middleware using .any() for flexible file fields
    adminPageContentController.handleUpdatePageContent
);

// ==================================================================
// COMMUNICATION (Notification Templates, Contact Messages)
// ==================================================================
// Email Notification Templates
router.get('/communication/notification-templates', authorizeAdminOnly, adminNotificationTemplateController.listTemplates);
router.get('/communication/notification-templates/:templateKey/edit', authorizeAdminOnly, adminNotificationTemplateController.showEditForm);
router.post('/communication/notification-templates/:templateKey/edit', authorizeAdminOnly, adminNotificationTemplateController.handleUpdate);
router.post('/communication/notification-templates/:templateKey/send-test', authorizeAdminOnly, adminNotificationTemplateController.handleSendTestEmail);
// router.post('/communication/notification-templates/:templateKey/reset-default', authorizeAdminOnly, adminNotificationTemplateController.handleResetToDefault); // Optional


// Company ID Card Settings (Admin only)
router.get('/idcard/settings', authorizeAdminOnly, idCardController.showCompanySettingsForm);
router.post('/idcard/settings', authorizeAdminOnly,
    uploadCompanyAsset.fields([ // Use .fields() for multiple named file inputs
        { name: 'company_logo_upload', maxCount: 1 },
        { name: 'ceo_signature_upload', maxCount: 1 },
        { name: 'company_stamp_upload', maxCount: 1 }
    ]),
    idCardController.updateCompanySettings
);

 
// Post Category Routes
//router.get('/post-categories/create', authorizeAdminOnly, adminPostCategoryController.showCreateCategoryForm);
//router.post('/post-categories/create', authorizeAdminOnly, adminPostCategoryController.handleCreateCategory);

// Add other category routes here (list, edit, update, delete)
// router.get('/post-categories', authorizeAdminOnly, adminPostCategoryController.listCategories);
// router.get('/post-categories/:id/edit', authorizeAdminOnly, adminPostCategoryController.showEditCategoryForm);
// router.post('/post-categories/:id/edit', authorizeAdminOnly, adminPostCategoryController.handleUpdateCategory);
// router.post('/post-categories/:id/delete', authorizeAdminOnly, isAdmin, adminPostCategoryController.handleDeleteCategory);
// router.post('/post-categories/:id/delete', authorizeAdminOnly, adminPostCategoryController.handleDeleteCategory);

router.get('/post-categories', adminPostCategoryController.listCategories);
router.get('/post-categories/create', adminPostCategoryController.showCreateCategoryForm);
router.post('/post-categories/create', adminPostCategoryController.handleCreateCategory);
router.get('/post-categories/:id/edit', adminPostCategoryController.showEditCategoryForm);
router.post('/post-categories/:id/edit', adminPostCategoryController.handleUpdateCategory);
router.post('/post-categories/:id/delete', adminPostCategoryController.handleDeleteCategory); // Using POST for deletion


module.exports = router;


/*
router.get('/project-templates', projectTemplateController.listSystemTemplates);
router.get('/project-templates/create', projectTemplateController.showCreateSystemTemplateForm);
router.post('/project-templates/create', projectTemplateController.handleCreateSystemTemplate);
router.get('/project-templates/:templateId/edit', projectTemplateController.showEditSystemTemplateForm);
router.post('/project-templates/:templateId/edit', projectTemplateController.handleUpdateSystemTemplate);
router.post('/project-templates/:templateId/delete', projectTemplateController.handleDeleteSystemTemplate);

*/


/*
// Avenircon/routes/admin.js
const express = require('express');
const router = express.Router();

const adminPostController = require('../controllers/adminPostController');
const { isAuthenticated, hasRole } = require('../middleware/authMiddleware');
// Import both upload middleware from multerConfig
const { uploadFeatureImage, uploadDocument } = require('../config/multerConfig');

const authorizeAdminOrEditor = [isAuthenticated, hasRole(['Admin', 'Editor'])];
const authorizeAdminOnly = [isAuthenticated, hasRole('Admin')];

// Admin Dashboard / Landing Page
router.get('/', authorizeAdminOnly, (req, res) => {
  res.render('admin/index', {
    title: 'Admin Dashboard',
    layout: './layouts/admin_layout'
  });
});

// --- Post Management Routes ---
router.get('/posts', authorizeAdminOrEditor, adminPostController.listPosts);
router.get('/posts/create', authorizeAdminOrEditor, adminPostController.showCreatePostForm);
router.post(
  '/posts/create',
  authorizeAdminOrEditor,
  uploadFeatureImage.single('feature_image'), // Handles feature image
  adminPostController.handleCreatePost
);
router.get('/posts/:id/edit', authorizeAdminOrEditor, adminPostController.showEditPostForm);
router.post(
  '/posts/:id/edit',
  authorizeAdminOrEditor,
  uploadFeatureImage.single('feature_image'), // Handles feature image
  adminPostController.handleUpdatePost
);
router.post('/posts/:id/delete', authorizeAdminOrEditor, adminPostController.handleDeletePost);

// --- Comment Moderation Routes for a Specific Post ---
router.get('/posts/:postId/comments', authorizeAdminOrEditor, adminPostController.listPostCommentsAdmin);
router.post('/posts/:postId/comments/:commentId/approve', authorizeAdminOrEditor, adminPostController.approveComment);
router.post('/posts/:postId/comments/:commentId/unapprove', authorizeAdminOrEditor, adminPostController.unapproveComment);
router.post('/posts/:postId/comments/:commentId/delete', authorizeAdminOrEditor, adminPostController.deleteCommentAdmin);

// --- Document Management Routes for a Specific Post ---
router.post(
  '/posts/:postId/documents/upload',
  authorizeAdminOrEditor,
  uploadDocument.array('post_documents', 5), // Handles document uploads, max 5 files, field name 'post_documents'
  adminPostController.handleDocumentUpload
);
router.post(
  '/posts/:postId/documents/:documentId/delete',
  authorizeAdminOrEditor,
  adminPostController.deletePostDocument
);
// Optional: Route for updating document metadata (title/description)
// router.post('/posts/:postId/documents/:documentId/update-meta', authorizeAdminOrEditor, adminPostController.updateDocumentMetadata);


// --- Other Admin Routes (Placeholders) ---

router.get('/posts/:id/preview', authorizeAdminOrEditor, adminPostController.previewPost);

// router.get('/posts/:id/preview', authorizeAdminOrEditor, adminPostController.previewPost);
 router.get('/posts/:id/statistics', authorizeAdminOrEditor, adminPostController.showPostStatistics);
// router.get('/traffic', authorizeAdminOnly, adminPostController.showTrafficStatistics); // Assuming 'Admin' only


module.exports = router;


*/