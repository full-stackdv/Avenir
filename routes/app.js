// ContructPro/routes/app.js
const express = require('express');
const router = express.Router();
 
// --- Import Controllers ---
const projectController = require('../controllers/projectController');
const taskController = require('../controllers/taskController');
const userProfileController = require('../controllers/userProfileController');
const dailyLogController = require('../controllers/dailyLogController');
const projectMemberController = require('../controllers/projectMemberController'); // <<< NEW IMPORT
const projectDocumentController = require('../controllers/projectDocumentController'); // <<< NEW IMPORT
const ganttController = require('../controllers/ganttController');
const projectTemplateController = require('../controllers/projectTemplateController'); // Add this
const dashboardController = require('../controllers/dashboardController'); // <<< ADD THIS
const reportingController = require('../controllers/reportingController'); // <<< ADD THIS
const budgetController = require('../controllers/budgetController'); // Make sure to import

//const { projectDocumentUpload } = require('../config/projectMulterConfig'); // Assuming you have this for uploads


// --- Import Middleware ---
const { isAuthenticated } = require('../middleware/authMiddleware');
const { checkProjectAccess } = require('../middleware/projectAccessMiddleware'); // <<< USE THE NEW MIDDLEWARE
const { uploadProjectDocument } = require('../config/projectMulterConfig'); // <<< NEW IMPORT for project docs
const { uploadCsv } = require('../config/csvMulterConfig'); // Import CSV multer config
//const { isAuthenticated, checkProjectAccess } = require('../middleware/taskAccessMiddleware'); // << UPDATED IMPORT

// --- Route Definitions ---


/*
// routes/app.js
router.get('/', (req, res, next) => {
    try {
        res.render('index', {
            title: 'Avenircon - Home',
            layout: './layouts/public_layout',
            // Pass session data for PRG
            formData: req.session.contactFormData || {}, 
            errors: req.session.contactFormErrors || [],
            // currentUser: req.session.user // If you want to prefill for logged-in users
        });
        // Clear session data after displaying
        if (req.session.contactFormData && req.session.contactFormData.source_page === 'homepage') {
            delete req.session.contactFormData;
            delete req.session.contactFormErrors;
        }
    } catch (error) {
        console.error("Error rendering public homepage (index.ejs):", error);
        next(error);
    }
});
*/

// --- Dashboard Route (Protected - User Dashboard) ---
router.get('/dashboard', isAuthenticated, dashboardController.showUserDashboard); // <<< MODIFIED

/*
// --- Dashboard Route (Protected - User Dashboard) ---
router.get('/dashboard', isAuthenticated, async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const projects = await projectController.listUserProjects(userId);

        res.render('dashboard', {
            title: 'Dashboard - Avenircon',
            pageTitle: 'My Dashboard',
            user: req.session.user,
            projects: projects || [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error in dashboard route (fetching projects):", error);
        req.flash('error_msg', error.message || 'Failed to load dashboard data.');
        // Render the dashboard even on error, but with an empty project list or specific error message
        res.render('dashboard', {
            title: 'Dashboard - Avenircon',
            pageTitle: 'My Dashboard',
            user: req.session.user,
            projects: [], // Or pass an error object to the view
            layout: './layouts/main_layout',
        });
    }
});
*/

// --- Project Routes ---
// `id` is used for project-specific routes, `projectId` for nested resources under a project

// Define roles for project operations
const projectViewRoles = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client'];
const projectEditRoles = ['Project Manager']; // Only PMs can edit core project details
const projectDeleteRoles = ['Project Manager']; // Only PMs can delete projects (Admin also implicitly)
const projectManageMembersRoles = ['Project Manager']; // Roles that can add/remove members

// General project list (accessible to authenticated users, controller should filter by involvement)
// --- Project Routes ---
router.get('/projects', isAuthenticated, projectController.showProjectsList);
router.get('/projects/create', isAuthenticated, projectController.showCreateProjectForm);
router.post('/projects/create', isAuthenticated, projectController.handleCreateProject);


router.get('/projects/:id/details', isAuthenticated, checkProjectAccess(projectViewRoles), projectController.showProjectDetails);
router.get('/projects/:id/edit', isAuthenticated, checkProjectAccess(projectEditRoles), projectController.showEditProjectForm);
router.post('/projects/:id/edit', isAuthenticated, checkProjectAccess(projectEditRoles), projectController.handleUpdateProject);
router.post('/projects/:id/delete', isAuthenticated, checkProjectAccess(projectDeleteRoles), projectController.handleDeleteProject);




// ... existing project routes ...
router.get('/projects/upload-csv', isAuthenticated, projectController.showUploadProjectsCsvForm);
router.post(
    '/projects/upload-csv',
    isAuthenticated,
    uploadCsv.single('projects_csv_file'), // 'projects_csv_file' is the name of the input field in the form
    projectController.handleUploadProjectsCsv
);


// --- Task Routes (Nested under Projects) ---
// Here, the parameter for project ID is named `projectId`
const taskManageRoles = ['Project Manager', 'Site Supervisor', 'Team Member']; // Create, Edit, Delete tasks
// Viewing tasks is often part of viewing project details, permissions handled by projectViewRoles at project level.
// If there were a dedicated "list tasks for project" page, it would use similar roles to projectViewRoles.

router.get('/projects/:projectId/tasks/create', isAuthenticated, checkProjectAccess(taskManageRoles), taskController.showCreateTaskForm);
router.post('/projects/:projectId/tasks/create', isAuthenticated, checkProjectAccess(taskManageRoles), taskController.handleCreateTask);
// Add new route for task details BEFORE the edit route for :taskId
// CORRECTED: Use roles appropriate for VIEWING task details
router.get(
    '/projects/:projectId/tasks/:taskId/details',
    isAuthenticated,
    checkProjectAccess(projectViewRoles), // <<< CHANGED TO projectViewRoles
    taskController.showTaskDetails
);
//router.get('/projects/:projectId/tasks/:taskId/details', isAuthenticated, checkProjectAccess(taskManageRoles), taskController.showTaskDetails); // << NEW ROUTE

router.get('/projects/:projectId/tasks/:taskId/edit', isAuthenticated, checkProjectAccess(taskManageRoles), taskController.showEditTaskForm);
router.post('/projects/:projectId/tasks/:taskId/edit', isAuthenticated, checkProjectAccess(taskManageRoles), taskController.handleUpdateTask);
router.post('/projects/:projectId/tasks/:taskId/delete', isAuthenticated, checkProjectAccess(taskManageRoles), taskController.handleDeleteTask);


// --- Task Routes (Nested under Projects) ---
// ... existing task routes ...
router.get(
    '/projects/:projectId/tasks/upload-csv',
    isAuthenticated,
    checkProjectAccess(['Project Manager', 'Site Supervisor']), // Define appropriate roles
    taskController.showUploadTasksCsvForm
);

router.post(
    '/projects/:projectId/tasks/upload-csv',
    isAuthenticated,
    checkProjectAccess(['Project Manager', 'Site Supervisor']), // Define appropriate roles
    uploadCsv.single('tasks_csv_file'), // 'tasks_csv_file' is the name of the input field
    taskController.handleUploadTasksCsv
);

router.post(
    '/projects/:projectId/tasks/upload-csv',
    isAuthenticated,
    checkProjectAccess(['Project Manager', 'Site Supervisor']),
    taskController.showUploadTasksCsvForm
);

// --- Project Member Management Routes (Nested under Projects) ---
router.get(
    '/projects/:projectId/members/add',
    isAuthenticated,
    checkProjectAccess(projectManageMembersRoles), // Only PMs/Admins can access add member form
    projectMemberController.showAddMemberForm
);
router.post(
    '/projects/:projectId/members/add',
    isAuthenticated,
    checkProjectAccess(projectManageMembersRoles), // Only PMs/Admins can add members
    projectMemberController.handleAddMemberToProject
);
// VVVVVV THIS IS THE ROUTE FOR THE EDIT FORM VVVVVV
router.get(
    '/projects/:projectId/members/:projectMemberId/edit-role',
    isAuthenticated,
    checkProjectAccess(projectManageMembersRoles),
    projectMemberController.showEditMemberRoleForm // Ensure this controller method exists and is exported
);
// ^^^^^^ THIS IS THE ROUTE FOR THE EDIT FORM ^^^^^^

router.post(
    '/projects/:projectId/members/:projectMemberId/edit-role',
    isAuthenticated,
    checkProjectAccess(projectManageMembersRoles),
    projectMemberController.handleUpdateMemberRole // Ensure this controller method exists
); 


router.post(
    '/projects/:projectId/members/:projectMemberId/remove', // Using project_member_id (PK of project_members table)
    isAuthenticated,
    checkProjectAccess(projectManageMembersRoles), // Only PMs/Admins can remove members
    projectMemberController.handleRemoveMemberFromProject
);


// --- Gantt Chart & Dependencies Routes (Nested under Projects) ---
const ganttViewRoles = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client']; // Roles that can VIEW Gantt
const ganttEditRoles = ['Project Manager', 'Site Supervisor']; // Roles that can ADD/DELETE dependencies

router.get(
    '/projects/:projectId/gantt',
    isAuthenticated,
    checkProjectAccess(ganttViewRoles), 
    ganttController.showGanttChart
);

router.post(
    '/projects/:projectId/dependencies/create',
    isAuthenticated,
    checkProjectAccess(ganttEditRoles),
    ganttController.handleCreateDependency
);

// Routes for Gantt Interactivity
router.post(
    '/projects/:projectId/tasks/:taskId/update-gantt-dates',
    isAuthenticated,
    checkProjectAccess(ganttEditRoles), // Use appropriate roles for editing task dates
    taskController.handleUpdateTaskDatesFromGantt
);

router.post(
    '/projects/:projectId/tasks/:taskId/update-gantt-progress',
    isAuthenticated,
    checkProjectAccess(ganttEditRoles), // Use appropriate roles for editing task progress
    taskController.handleUpdateTaskProgressFromGantt
);

router.post(
    '/projects/:projectId/dependencies/:dependencyId/delete', // :dependencyId is the ID from task_dependencies table
    isAuthenticated,
    checkProjectAccess(ganttEditRoles),
    ganttController.handleDeleteDependency
);


// --- Project Document Routes (Nested under Projects) ---

const projectDocumentManageRoles = ['Project Manager', 'Site Supervisor', 'Team Member']; // Define who can manage project docs

router.post(
    '/projects/:projectId/documents/upload',
    isAuthenticated,
    checkProjectAccess(projectDocumentManageRoles),
    uploadProjectDocument.array('project_files', 10), // Allow up to 10 files at once, named 'project_files' in form
    projectDocumentController.handleProjectDocumentUpload
);
/*router.get(
    '/projects/:projectId/documents/:documentId/download', 
    isAuthenticated, checkProjectAccess(['Project Manager', 'Site Supervisor', 'Team Member', 'Client']), projectDocumentController.downloadDocument); // NEW ROUTE

*/
//router.get(
  //  '/projects/:projectId/documents/:documentId/download', 
    //isAuthenticated, checkProjectAccess(projectDocumentManageRoles), projectDocumentController.downloadDocument); // NEW ROUTE

router.post( // Use POST for deletion to prevent CSRF if not using AJAX with proper headers
    '/projects/:projectId/documents/:documentId/delete',
    isAuthenticated,
    checkProjectAccess(projectDocumentManageRoles), // Or perhaps more restrictive delete roles
    projectDocumentController.deleteProjectDocument
);


// ... other project routes

// Project Documents
//router.get('/projects/:projectId/documents', isAuthenticated, checkProjectAccess(['Project Manager', 'Site Supervisor', 'Team Member']), projectDocumentController.listDocuments);
//router.post('/projects/:projectId/documents/upload', isAuthenticated, checkProjectAccess(['Project Manager', 'Site Supervisor', 'Team Member']), projectDocumentUpload.single('documentFile'), projectDocumentController.uploadDocument);
//router.get('/projects/:projectId/documents/:documentId/download', isAuthenticated, checkProjectAccess(['Project Manager', 'Site Supervisor', 'Team Member', 'Client']), projectDocumentController.downloadDocument); // NEW ROUTE
//router.post('/projects/:projectId/documents/:documentId/delete', isAuthenticated, checkProjectAccess(['Project Manager', 'Site Supervisor']), projectDocumentController.deleteDocument); // Assuming delete might be needed


// --- Project Template Routes (User-specific) ---

// List user's own project templates
router.get(
  '/projects/templates',
  isAuthenticated,
  projectTemplateController.listUserTemplates
);

// Route to display a form/modal trigger page (if not handled purely by client-side modal on another page)
// For now, the "Save as Template" button on project details will likely trigger a modal that POSTs directly.
// So, a GET route for a dedicated form might not be immediately necessary if using a modal.
// router.get(
//     '/projects/:projectId/save-as-template-form', // projectId of the project to be templated
//     isAuthenticated,
//     checkProjectAccess(['Project Manager', 'Creator']), // Or roles that can manage/own the project
//     projectTemplateController.showSaveAsTemplateForm
// );

// Handle saving a project as a template
router.post(
  '/projects/:projectId/save-as-template', // projectId of the project to be templated
  isAuthenticated,
  checkProjectAccess(['Project Manager', 'Creator']), // Roles that can manage/own the source project
  projectTemplateController.handleSaveProjectAsTemplate
);

// Handle deleting a user-created template
// :templateId refers to the ID from the project_templates table
router.post(
  '/projects/templates/:templateId/delete',
  isAuthenticated,
  // Ownership/permission check will be done inside the controller for this one
  projectTemplateController.handleDeleteUserTemplate
);

//admin.js
// System Project Template Management (Admin)  <<<< NEW ROUTES >>>>
//router.get('/project-templates/create', projectTemplateController.showCreateSystemTemplateForm);
//router.post('/project-templates/create', projectTemplateController.handleCreateSystemTemplate);
//router.get('/project-templates/:templateId/edit', projectTemplateController.showEditSystemTemplateForm);
//router.post('/project-templates/:templateId/edit', projectTemplateController.handleUpdateSystemTemplate);
 

 /*
router.get(
  '/projects/:projectId/report',
  isAuthenticated,
  checkProjectAccess(projectReportViewRoles), // Use appropriate roles
  reportingController.showProjectReport
);
 */
// --- Define Budget Roles ---
const BUDGET_MANAGE_ROLES = ['Project Manager', 'Admin'];
const BUDGET_ADD_LOG_ROLES = ['Project Manager', 'Site Supervisor', 'Admin'];
const BUDGET_VIEW_ROLES = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Admin'];

// --- Project Budget Management Routes ---
router.get(
    '/projects/:projectId/budget/edit',
    isAuthenticated,
    checkProjectAccess(BUDGET_MANAGE_ROLES),
    budgetController.showProjectBudgetForm
);
router.post(
    '/projects/:projectId/budget/edit',
    isAuthenticated,
    checkProjectAccess(BUDGET_MANAGE_ROLES),
    budgetController.handleUpdateProjectBudget
);
router.get(
    '/projects/:projectId/budget/log/add',
    isAuthenticated,
    checkProjectAccess(BUDGET_ADD_LOG_ROLES),
    budgetController.showAddProjectBudgetLogForm
);
router.post(
    '/projects/:projectId/budget/log/add',
    isAuthenticated,
    checkProjectAccess(BUDGET_ADD_LOG_ROLES),
    budgetController.handleAddProjectBudgetLogEntry // Handles project-level and task-level if task_id is in form
);
router.get(
    '/projects/:projectId/budget/logs',
    isAuthenticated,
    checkProjectAccess(BUDGET_VIEW_ROLES),
    budgetController.listProjectBudgetLogs
);

// --- Task Budget Management Routes ---
router.get(
    '/projects/:projectId/tasks/:taskId/budget/edit',
    isAuthenticated,
    checkProjectAccess(BUDGET_MANAGE_ROLES),
    budgetController.showTaskBudgetForm
);
router.post(
    '/projects/:projectId/tasks/:taskId/budget/edit',
    isAuthenticated,
    checkProjectAccess(BUDGET_MANAGE_ROLES),
    budgetController.handleUpdateTaskBudget
);
router.get(
    '/projects/:projectId/tasks/:taskId/budget/log/add',
    isAuthenticated,
    checkProjectAccess(BUDGET_ADD_LOG_ROLES),
    budgetController.showAddTaskBudgetLogForm
);
router.post(
    '/projects/:projectId/tasks/:taskId/budget/log/add',
    isAuthenticated,
    checkProjectAccess(BUDGET_ADD_LOG_ROLES),
    budgetController.handleAddTaxBudgetLogEntry // Controller method specific to task log addition
);
router.get(
    '/projects/:projectId/tasks/:taskId/budget/logs',
    isAuthenticated,
    checkProjectAccess(BUDGET_VIEW_ROLES),
    budgetController.listTaskBudgetLogs
);


// ... rest of your app.js routes
/*
router.get('/projects/:projectId/report/download/excel', isAuthenticated, checkProjectAccess(['Project Manager', 'Client', 'Admin']), reportingController.downloadProjectReportExcel);
router.get('/projects/:projectId/report/download/csv', isAuthenticated, checkProjectAccess(['Project Manager', 'Client', 'Admin']), reportingController.downloadProjectReportCSV);
// ...
*/
//const projectBudgetViewRoles = ['Project Manager', 'Site Supervisor', 'Client', 'Creator', 'Admin']; // Define roles that can VIEW reports
/*
// Project Budget Management
router.get('/projects/:projectId/budget/edit', isAuthenticated, checkProjectAccess(projectBudgetViewRoles), budgetController.showProjectBudgetForm);
router.post('/projects/:projectId/budget/update', isAuthenticated, checkProjectAccess(projectBudgetViewRoles), budgetController.handleUpdateProjectBudget);

router.get('/projects/:projectId/budget/log/add', isAuthenticated, checkProjectAccess(projectBudgetViewRoles), budgetController.showAddBudgetLogForm);
router.post('/projects/:projectId/budget/log/add', isAuthenticated, checkProjectAccess(projectBudgetViewRoles), budgetController.handleAddBudgetLogEntry);
router.get('/projects/:projectId/budget/logs', isAuthenticated, checkProjectAccess(projectBudgetViewRoles), budgetController.listProjectBudgetLogs);
*/



// --- Project Report Routes ---
const projectReportViewRoles = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Creator', 'Admin']; // Define roles that can VIEW reports

router.get(
  '/projects/:projectId/report',
  isAuthenticated,
  checkProjectAccess(projectReportViewRoles),
  reportingController.showProjectReport
);

// --- ADD THE DOWNLOAD ROUTES HERE ---
router.get(
  '/projects/:projectId/report/download/pdf',
  isAuthenticated,
  checkProjectAccess(projectReportViewRoles), // Or more specific roles if needed
  reportingController.downloadProjectReportPDF
);

router.get(
  '/projects/:projectId/report/download/excel',
  isAuthenticated,
  checkProjectAccess(projectReportViewRoles), // Or more specific roles if needed
  reportingController.downloadProjectReportExcel
);

router.get(
  '/projects/:projectId/report/download/csv',
  isAuthenticated,
  checkProjectAccess(projectReportViewRoles), // Or more specific roles if needed
  reportingController.downloadProjectReportCSV
);
// --- END OF DOWNLOAD ROUTES ---

// --- User Profile Routes ---

//Update route to get /profile/create showCreateProfileForm
// @desc    Show form to create user profile
// @route   GET /profile/create

//Update route to show create profile using get and post /profile/create handleCreateProfile Handle creating user profile information
router.get('/profile', isAuthenticated, userProfileController.showProfilePage);
router.get('/profile/create', isAuthenticated, userProfileController.showCreateProfileForm);
router.post('/profile/create', isAuthenticated, userProfileController.handleCreateProfile);
router.get('/profile/edit', isAuthenticated, userProfileController.showEditProfileForm);
router.post('/profile/edit', isAuthenticated, userProfileController.handleUpdateProfile);
router.get('/profile/change-password', isAuthenticated, userProfileController.showChangePasswordForm);
router.post('/profile/change-password', isAuthenticated, userProfileController.handlePasswordChange);


// --- Daily Log Routes (Nested under projects) ---
// Here, the parameter for project ID is named `projectId`
const dailyLogCreateRoles = ['Project Manager', 'Site Supervisor', 'Team Member'];
const dailyLogViewRoles = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client'];
const dailyLogManageRoles = ['Project Manager', 'Site Supervisor'];

router.get('/projects/:projectId/logs', isAuthenticated, checkProjectAccess(dailyLogViewRoles), dailyLogController.listProjectDailyLogs);
router.get('/projects/:projectId/logs/create', isAuthenticated, checkProjectAccess(dailyLogCreateRoles), dailyLogController.showCreateLogForm);
router.post('/projects/:projectId/logs/create', isAuthenticated, checkProjectAccess(dailyLogCreateRoles), dailyLogController.handleCreateLog);
router.get('/projects/:projectId/logs/:logId', isAuthenticated, checkProjectAccess(dailyLogViewRoles), dailyLogController.showDailyLogDetails);
// TODO: Add routes for edit/delete daily logs later with dailyLogManageRoles

router.get(
    '/projects/:projectId/logs/:logId/edit',
    isAuthenticated,
    checkProjectAccess(dailyLogManageRoles), // Use manage roles
    dailyLogController.showEditLogForm
);
router.post(
    '/projects/:projectId/logs/:logId/edit',
    isAuthenticated,
    checkProjectAccess(dailyLogManageRoles), // Use manage roles
    dailyLogController.handleUpdateLog
);
router.post(
    '/projects/:projectId/logs/:logId/delete',
    isAuthenticated,
    checkProjectAccess(dailyLogManageRoles), // Use manage roles
    dailyLogController.handleDeleteLog
);
// Add routes for visualization


module.exports = router;
