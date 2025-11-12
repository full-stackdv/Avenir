// Avenircon/routes/document.js
const express = require('express');
const router = express.Router();
const projectDocumentController = require('../controllers/projectDocumentController'); // <<< NEW IMPORT

//console.log('projectDocumentController:', projectDocumentController); // <<< ADD THIS

// --- Import Controllers ---
//const projectController = require('../controllers/projectController');
//const taskController = require('../controllers/taskController');
//const userProfileController = require('../controllers/userProfileController');
//const dailyLogController = require('../controllers/dailyLogController');
//const projectMemberController = require('../controllers/projectMemberController'); // <<< NEW IMPORT

// --- Import Middleware ---
const { isAuthenticated } = require('../middleware/authMiddleware');
const { checkProjectAccess } = require('../middleware/projectAccessMiddleware'); // <<< USE THE NEW MIDDLEWARE
//const { isAuthenticated, checkProjectAccess } = require('../middleware/taskAccessMiddleware'); // << UPDATED IMPORT
//const { uploadDocument } = require('../config/multerConfig'); // <<< NEW IMPORT for previus uploadFeatureImage and uploadDocument
const { uploadProjectDocument } = require('../config/projectMulterConfig'); // <<< NEW IMPORT for project docs

// --- Route Definitions ---


// --- Project Document Routes (Nested under Projects) ---

const projectDocumentManageRoles = ['Project Manager', 'Site Supervisor', 'Team Member']; // Define who can manage project docs

router.post(
    '/projects/:projectId/documents/upload',
    isAuthenticated,
    checkProjectAccess(projectDocumentManageRoles),
    uploadProjectDocument.array('project_files', 10), // Allow up to 10 files at once, named 'project_files' in form
    projectDocumentController.handleProjectDocumentUpload
);

router.post( // Use POST for deletion to prevent CSRF if not using AJAX with proper headers
    '/projects/:projectId/documents/:documentId/delete',
    isAuthenticated,
    checkProjectAccess(projectDocumentManageRoles), // Or perhaps more restrictive delete roles
    projectDocumentController.deleteProjectDocument
);


// --- Document Management Routes for a Specific Post ---
router.post(
  '/projects/:projectId/documents/upload',
  authorizeAdminOrEditor,
  uploadDocument.array('post_documents', 5), // Handles document uploads, max 5 files, field name 'post_documents'
  adminPostController.handleDocumentUpload
);
router.post(
  '/projects/:projectId/documents/:documentId/delete',
  authorizeAdminOrEditor,
  adminPostController.deletePostDocument
);
// Optional: Route for updating document metadata (title/description)
// router.post('/projects/:projectId/documents/:documentId/update-meta', authorizeAdminOrEditor, adminPostController.updateDocumentMetadata);


module.exports = router;
