
// Avenircon/controllers/projectController.js
const db = require('../config/db');
const dateFns = require('date-fns'); // For date calculations
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const { parse, isValid, format } = require('date-fns'); // Import parse and isValid

const taskController = require('./taskController');
const projectMemberController = require('./projectMemberController'); // <<< NEW IMPORT
const projectDocumentController = require('./projectDocumentController'); // <<< NEW IMPORT
const budgetCtrl = require('./budgetController'); // Import at the top of projectController.js 
//const adminAuditLogController = require('./adminAuditLogController'); // <<< NEW IMPORT
const projectTemplateController = require('./projectTemplateController'); // <<< NEW IMPORT

/*
// Show page to create a new project
exports.showCreateProjectForm = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        let potentialManagers = [];
        let projectTemplates = [];
        const queryTemplateId = req.query.templateId || null; // Get templateId from query params

        try {
            const [users] = await db.query(
                "SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Admin') AND is_active = TRUE ORDER BY first_name ASC, last_name ASC, username ASC"
            );
            potentialManagers = users.map(u => ({
                id: u.id,
                display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
            }));
        } catch (err) {
            console.warn("Could not fetch potential project managers:", err);
        }

        try {
            // Fetch user-created templates AND system templates
            const [templates] = await db.query(
                `SELECT id, name, is_system_template 
                 FROM project_templates 
                 WHERE (created_by_id = ? AND is_system_template = FALSE) OR is_system_template = TRUE
                 ORDER BY is_system_template DESC, name ASC`, // Show system templates first, then user's
                [userId]
            );
            projectTemplates = templates;
        } catch (err) {
            console.warn("Could not fetch project templates:", err);
        }

          // Fetch system templates
            let systemTemplates = [];
            try {
              const [stResult] = await db.query(
                "SELECT id, name FROM project_templates WHERE is_system_template = TRUE ORDER BY name ASC"
              );
              systemTemplates = stResult;
            } catch (err) {
              console.warn("Could not fetch system project templates:", err);
            }
            
            //const queryTemplateId = req.query.templateId || null; // For pre-selecting if "Use this template" link is clicked
            

        res.render('projects/create', {
            title: 'Create New Project - Avenircon',
            pageTitle: 'Create New Project',
            layout: './layouts/main_layout',
            potentialManagers: potentialManagers,
            projectTemplates: projectTemplates, // Pass templates to the view
            systemTemplates: systemTemplates, // Pass to view
            queryTemplateId: queryTemplateId,   // Pass query template ID for pre-selection
            formData: req.session.createProjectFormData || {},
            errors: req.session.createProjectErrors || []
        });
        delete req.session.createProjectFormData;
        delete req.session.createProjectErrors;
    } catch (error) {
        console.error("Error rendering create project page:", error);
        next(error);
    }
};

*/
// Show page to create a new project

exports.showCreateProjectForm = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        let potentialManagers = [];
        let userCreatedTemplates = []; // Specifically for templates created by the current user
        let systemTemplates = [];      // Specifically for system-wide templates
        const queryTemplateId = req.query.templateId || null;

        // Fetch Potential Managers
        try {
            const [users] = await db.query(
                "SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Admin') AND is_active = TRUE ORDER BY first_name ASC, last_name ASC, username ASC"
            );
            potentialManagers = users.map(u => ({
                id: u.id,
                display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
            }));
        } catch (err) {
            console.warn("Could not fetch potential project managers:", err);
        }

        // Fetch User-Created Templates
        try {
            const [userTemplatesResult] = await db.query(
                `SELECT id, name 
                 FROM project_templates 
                 WHERE created_by_id = ? AND is_system_template = FALSE
                 ORDER BY name ASC`,
                [userId]
            );
            userCreatedTemplates = userTemplatesResult;
        } catch (err) {
            console.warn("Could not fetch user-created project templates:", err);
        }

        // Fetch System Templates
        try {
            const [systemTemplatesResult] = await db.query(
                `SELECT id, name 
                 FROM project_templates 
                 WHERE is_system_template = TRUE
                 ORDER BY name ASC`
            );
            systemTemplates = systemTemplatesResult;
        } catch (err) {
            console.warn("Could not fetch system project templates:", err);
        }

        res.render('projects/create', {
            title: 'Create New Project - Avenircon',
            pageTitle: 'Create New Project',
            layout: './layouts/main_layout',
            potentialManagers: potentialManagers,
            userTemplates: userCreatedTemplates, // Pass distinct list for user templates
            systemTemplates: systemTemplates,    // Pass distinct list for system templates
            queryTemplateId: queryTemplateId,
            formData: req.session.createProjectFormData || {},
            errors: req.session.createProjectErrors || []
        });
        delete req.session.createProjectFormData;
        delete req.session.createProjectErrors;
    } catch (error) {
        console.error("Error rendering create project page:", error);
        next(error);
    }
};

// `handleCreateProject`  uses `numTemplateId` which would come
// from the selection of either a user or system template.

// Handle the submission of the new project form
exports.handleCreateProject = async (req, res, next) => {
    const { 
        name, project_code, description, client_name, start_date, end_date, budget, 
        project_manager_id_select, 
        templateId // New field from the form
    } = req.body;
    const created_by_id = req.session.user.id;
    const creator_app_role = req.session.user.role;
    let errors = [];

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Project Name is required.' });
    if (!start_date) errors.push({ param: 'start_date', msg: 'Project Start Date is required.'}); // Start date is crucial for templates
    // ... (other existing validations for name length, project_code, date order, PM selection) ...
     if (name && name.length > 255) errors.push({ param: 'name', msg: 'Project name cannot exceed 255 characters.' });
    if (project_code && project_code.length > 50) errors.push({ param: 'project_code', msg: 'Project code cannot exceed 50 characters.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });


    let selectedProjectManagerId = project_manager_id_select ? parseInt(project_manager_id_select) : null;
    if (selectedProjectManagerId && isNaN(selectedProjectManagerId)) {
        errors.push({ param: 'project_manager_id_select', msg: 'Invalid Project Manager selected.'});
        selectedProjectManagerId = null; 
    } else if (selectedProjectManagerId) {
        const [pmUser] = await db.query("SELECT id, role FROM users WHERE id = ?", [selectedProjectManagerId]);
        if (pmUser.length === 0 || !['Project Manager', 'Admin'].includes(pmUser[0].role)) {
            errors.push({ param: 'project_manager_id_select', msg: 'Selected Project Manager is not valid or does not have the required app role.'});
            selectedProjectManagerId = null; 
        }
    }
    if (!selectedProjectManagerId && creator_app_role === 'Project Manager') {
        selectedProjectManagerId = created_by_id;
    }
    
    const numTemplateId = templateId ? parseInt(templateId) : null;
    if (templateId && (isNaN(numTemplateId) || numTemplateId <=0) ) { // Check if templateId is a positive number if provided
        errors.push({ param: 'templateId', msg: 'Invalid project template selected.' });
    }


    if (errors.length > 0) {
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = errors;
        return res.redirect('/projects/create');
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const newProjectData = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null,
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date, // Should be validated to exist
            end_date: end_date || null,
            budget: budget || null,
            created_by_id,
            status: 'Planning', // Default status
            project_manager_id: selectedProjectManagerId,
            source_template_id: numTemplateId // Optional: store which template was used
        };

        const [projectResult] = await connection.query('INSERT INTO projects SET ?', newProjectData);
        const newProjectId = projectResult.insertId;

        // Add creator and selected PM to project_members (your existing logic for this)
        let finalCreatorRoleInProject = 'Team Member'; 
        if (selectedProjectManagerId === created_by_id) {
            finalCreatorRoleInProject = 'Project Manager';
        } else if (['Admin', 'Project Manager'].includes(creator_app_role)) {
            finalCreatorRoleInProject = 'Project Manager';
        }
        await connection.query(
            'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
            [newProjectId, created_by_id, finalCreatorRoleInProject]
        );
        if (selectedProjectManagerId && selectedProjectManagerId !== created_by_id) {
            await connection.query(
                'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
                [newProjectId, selectedProjectManagerId, 'Project Manager']
            );
        }
        // ---- APPLY TEMPLATE IF SELECTED ----
        if (numTemplateId) {
            const [templateTasks] = await connection.query(
                `SELECT * FROM project_template_tasks 
                 WHERE project_template_id = ? 
                 ORDER BY parent_template_task_id ASC, task_order ASC`, // Process parents first
                [numTemplateId]
            );

            if (templateTasks.length > 0) {
                const projectStartDate = dateFns.parseISO(start_date); // Parse project start date
                const templateTaskToNewTaskMap = {}; // Map: original_source_task_id -> new_task_id

                // First pass: Create all tasks from template, calculate dates
                for (const tt of templateTasks) {
                    let actualStartDate, actualEndDate;
                    // For date calculation, we'll assume a simple offset from project start date initially.
                    // A more complex template might store relative offsets from parent task's end or project start.
                    // For now, let's assume template tasks are defined in a way that their order and duration are key.
                    // If depends_on_original_id is used, dates will be more dynamic.
                    // For simplicity here, we'll just copy duration. Actual dates would be set by scheduler or dependencies.
                    // OR, if `relative_start_day` was stored in `project_template_tasks`:
                    // actualStartDate = dateFns.addDays(projectStartDate, tt.relative_start_day || 0);
                    // actualEndDate = dateFns.addDays(actualStartDate, (tt.planned_duration_days || 1) - 1);

                    // For now, leave start/end dates null for template tasks, to be set later or via Gantt.
                    // Or set a placeholder start date based on project start if no other logic.
                    // Let's assume for now, template just gives structure and duration.
                    // Dates will need a more robust calculation if strict adherence to template schedule is needed from day 1.

                    const newTaskFromTemplate = {
                        project_id: newProjectId,
                        name: tt.name,
                        description: tt.description,
                        // start_date: actualStartDate ? dateFns.format(actualStartDate, 'yyyy-MM-dd') : null,
                        // end_date: actualEndDate ? dateFns.format(actualEndDate, 'yyyy-MM-dd') : null,
                        // For now, let tasks created from template not have preset dates unless specifically calculated
                        start_date: null,
                        end_date: null,
                        planned_duration_days: tt.planned_duration_days,
                        status: 'ToDo', // Default status for new tasks from template
                        priority: 'Medium', // Default priority
                        is_milestone: tt.is_milestone,
                        created_by_id: created_by_id,
                        // parent_task_id will be set in the second pass
                    };
                    const [taskInsertResult] = await connection.query('INSERT INTO tasks SET ?', newTaskFromTemplate);
                    templateTaskToNewTaskMap[tt.original_source_task_id] = taskInsertResult.insertId;
                     // Store mapping from project_template_task.id to new task.id as well for parent linking
                    templateTaskToNewTaskMap[`template_${tt.id}`] = taskInsertResult.insertId;
                }

                // Second pass: Update parent_task_id
                for (const tt of templateTasks) {
                    if (tt.parent_template_task_id) {
                        const newParentTaskId = templateTaskToNewTaskMap[`template_${tt.parent_template_task_id}`];
                        const newChildTaskId = templateTaskToNewTaskMap[`template_${tt.id}`];
                        if (newParentTaskId && newChildTaskId) {
                            await connection.query(
                                'UPDATE tasks SET parent_task_id = ? WHERE id = ?',
                                [newParentTaskId, newChildTaskId]
                            );
                        }
                    }
                }
                
                // Third pass: Create dependencies based on template's dependency info
                for (const tt of templateTasks) {
                    if (tt.depends_on_original_id && tt.dependency_type) {
                        const newSuccessorTaskId = templateTaskToNewTaskMap[tt.original_source_task_id]; // This task is the successor
                        const newPredecessorTaskId = templateTaskToNewTaskMap[tt.depends_on_original_id]; // Map original predecessor ID to its new task ID

                        if (newSuccessorTaskId && newPredecessorTaskId) {
                            await connection.query(
                                'INSERT INTO task_dependencies (project_id, task_id, depends_on_task_id, dependency_type, lag_days) VALUES (?, ?, ?, ?, ?)',
                                [newProjectId, newSuccessorTaskId, newPredecessorTaskId, tt.dependency_type, tt.dependency_lag_days || 0]
                            );
                        }
                    }
                }
            }
        }
        // ---- END APPLY TEMPLATE ----

        await connection.commit();
        req.flash('success_msg', `Project "${name.trim()}" created successfully!`);
        res.redirect(`/projects/${newProjectId}/details`);

    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error creating project:", err);
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = errors.length > 0 ? errors : [{ msg: 'Error creating project. ' + err.message }];
        res.redirect('/projects/create');
    } finally {
        if (connection) connection.release();
    }
};

// Service function to list projects for a user
exports.listUserProjects = async (userId) => {
    if (!userId) {
        console.error('listUserProjects called without userId');
        throw new Error('User ID is required to list projects.');
    }
    try {
        // Fetch projects where user is creator, PM, or a member
        const query = `
            SELECT DISTINCT
                p.id, p.name, p.project_code, p.description, p.status, p.client_name,
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted,
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as end_date_formatted,
                u_creator.username AS creator_username
            FROM projects p
            JOIN users u_creator ON p.created_by_id = u_creator.id
            LEFT JOIN project_members pm ON p.id = pm.project_id
            WHERE p.created_by_id = ? OR p.project_manager_id = ? OR pm.user_id = ?
            ORDER BY p.created_at DESC
        `;
        const [projects] = await db.query(query, [userId, userId, userId]);
        return projects;
    } catch (error) {
        console.error('Error fetching user projects in listUserProjects service:', error);
        throw new Error('Could not load projects due to a server issue.');
    }
};


// Show project details 
exports.showProjectDetails = async (req, res, next) => {
    try {
        const projectId = req.params.id;
        const projectFromMiddleware = req.projectContext; // Project context from checkProjectAccess middleware

        // Initial validation of project context from middleware
        if (!projectFromMiddleware || !projectFromMiddleware.id || projectFromMiddleware.id.toString() !== projectId.toString()) {
            // This first console.error is useful to keep if this specific state occurs, as it indicates a middleware/logic issue
            console.error("ProjectDetails Critical Error: projectFromMiddleware is MISSING or MISMATCHED with route projectId.", 
                          { middlewareContextId: projectFromMiddleware ? projectFromMiddleware.id : 'N/A', routeProjectId: projectId });
            req.flash('error_msg', 'Project context error. Unable to verify project details.');
            return res.status(403).redirect(projectId ? `/projects/${projectId}/details` : '/dashboard');
        }

        // Fetch the full project object to ensure all necessary JOINed fields are present for the view
        const projectQueryDetailed = `
            SELECT 
                p.*, 
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted, 
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as end_date_formatted,
                DATE_FORMAT(p.created_at, '%M %d, %Y at %H:%i') as created_at_formatted,
                DATE_FORMAT(p.updated_at, '%M %d, %Y at %H:%i') as updated_at_formatted,
                creator.username AS creator_username,
                manager.username AS project_manager_username
            FROM projects p
            LEFT JOIN users creator ON p.created_by_id = creator.id
            LEFT JOIN users manager ON p.project_manager_id = manager.id
            WHERE p.id = ?
        `;
        
        const [projectRowsDetailed] = await db.query(projectQueryDetailed, [projectId]);

        if (projectRowsDetailed.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const finalProjectObjectForView = projectRowsDetailed[0];

        
        // In projectController.js, showProjectDetails method:
const budgetSummary = await budgetCtrl.getProjectBudgetSummary(finalProjectObjectForView.id);
//finalProjectObjectForView.planned_budget = budgetSummary.budget; // Already on project, but ensure consistency
finalProjectObjectForView.planned_budget_summary = budgetSummary.planned_budget; // Use different key to avoid confusion with raw DB field if needed
finalProjectObjectForView.actual_cost_summary = budgetSummary.actual_cost;
finalProjectObjectForView.total_income_summary = budgetSummary.total_income;
finalProjectObjectForView.variance_summary = budgetSummary.variance;
// Then pass finalProjectObjectForView to the render function
 
        // Fetch tasks
        let fetchedTasks = [];
        try {
            fetchedTasks = await taskController.listTasksForProject(projectId, (req.session && req.session.user) ? req.session.user.id : null);
        } catch (taskError) {
            console.error(`Error fetching tasks for project ${projectId}:`, taskError.message); // Log only message for brevity
            req.flash('info_msg', 'Could not load tasks for this project.');
        }

        // Fetch members
        let fetchedMembers = [];
        try {
            fetchedMembers = await projectMemberController.getProjectMembers(projectId);
        } catch (memberError) {
            console.error(`Error fetching members for project ${projectId}:`, memberError.message); // Log only message
            req.flash('info_msg', 'Could not load project members list.');
        }

        // --- Determine Permission Flags ---
        let canEditOrDeleteProjectFlag = false;
        let canManageProjectMembersFlag = false;
        let canManageTasksFlag = false;

        if (req.session && req.session.user) {
            const currentUserId = req.session.user.id;
            const currentUserAppRole = req.session.user.role;

            if (currentUserAppRole === 'Admin') {
                canEditOrDeleteProjectFlag = true;
                canManageProjectMembersFlag = true;
                canManageTasksFlag = true;
            } else {
                if (finalProjectObjectForView.project_manager_id === currentUserId) {
                    canEditOrDeleteProjectFlag = true;
                    canManageProjectMembersFlag = true;
                    canManageTasksFlag = true;
                }
                if (fetchedMembers && fetchedMembers.length > 0) {
                    const memberInfo = fetchedMembers.find(m => m.user_id === currentUserId);
                    if (memberInfo) {
                        if (memberInfo.role_in_project === 'Project Manager') {
                            canEditOrDeleteProjectFlag = true;
                            canManageProjectMembersFlag = true;
                            canManageTasksFlag = true;
                        }
                        if (['Project Manager', 'Site Supervisor'].includes(memberInfo.role_in_project)) {
                            canManageTasksFlag = true;
                        }
                    }
                }
            }
        }

              // Fetch project documents
        const [projectDocuments] = await db.query(
            `SELECT pd.*, u.username as uploader_username 
             FROM project_documents pd 
             JOIN users u ON pd.uploaded_by_id = u.id 
             WHERE pd.project_id = ? 
             ORDER BY pd.created_at DESC`,
            [projectId]
        );


        res.render('projects/details', {
            title: `${finalProjectObjectForView.name || 'Project'} - Project Details`,
            pageTitle: finalProjectObjectForView.name || 'Project Details',
            subTitle: finalProjectObjectForView.project_code ? `Project Code: ${finalProjectObjectForView.project_code}` : 'Project Details',
            project: finalProjectObjectForView,
            tasks: fetchedTasks || [],
            projectMembers: fetchedMembers || [],
            currentUser: (req.session && req.session.user) ? req.session.user : null,
            canEditOrDeleteProject: canEditOrDeleteProjectFlag,
            canManageProjectMembers: canManageProjectMembersFlag,
            canManageTasks: canManageTasksFlag,
            projectDocuments: projectDocuments, // <<< PASS DOCUMENTS
            layout: './layouts/main_layout'
        });

    } catch (error) {
        // This console.error is important for unhandled errors in this function
        console.error('Critical error in showProjectDetails controller:', error);
        next(error); // Pass to global error handler
    }
};

// .... (other methods like showEditProjectForm, handleUpdateProject, handleDeleteProject, showProjectsList )......

// Show form to edit an existing project
exports.showEditProjectForm = async (req, res, next) => {
    try {
        const projectId = req.params.id;

        const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        const formDataForRender = { ...project };
        if (formDataForRender.start_date) formDataForRender.start_date = new Date(formDataForRender.start_date).toISOString().split('T')[0];
        if (formDataForRender.end_date) formDataForRender.end_date = new Date(formDataForRender.end_date).toISOString().split('T')[0];
        
        // Fetch users who can be project managers
        let potentialManagers = [];
        try {
            const [users] = await db.query(
                "SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Admin') AND is_active = TRUE ORDER BY first_name ASC, last_name ASC, username ASC"
            );
            potentialManagers = users.map(u => ({
                id: u.id,
                display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
            }));
        } catch (err) {
            console.warn("Could not fetch potential project managers for edit form:", err);
        }

        res.render('projects/edit', {
            title: `Edit Project: ${project.name}`,
            pageTitle: `Edit Project: ${project.name}`,
            project: project,
            potentialManagers: potentialManagers, // Pass to the view
            // Use session data for formData if it exists (PRG), otherwise use formatted DB data
            formData: req.session.editProjectFormData || formDataForRender, 
            errors: req.session.editProjectErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editProjectFormData;
        delete req.session.editProjectErrors;
    } catch (error) {
        console.error('Error showing edit project form:', error);
        next(error);
    }
};


// Handle the submission of the project edit form
exports.handleUpdateProject = async (req, res, next) => {
    const projectId = parseInt(req.params.id); // Ensure projectId is an integer
    const { name, project_code, description, client_name, start_date, end_date, budget, status, project_manager_id_select } = req.body;
    let errors = [];

    let originalProject;
    try {
        const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        originalProject = projectRows[0];
    } catch(dbError) {
        console.error("DB error fetching original project for update:", dbError);
        return next(dbError);
    }

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Project Name is required.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    const validStatuses = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid project status selected.' });
    
    let newSelectedPmId = project_manager_id_select ? parseInt(project_manager_id_select) : null;
    // Validate the newly selected Project Manager
    if (newSelectedPmId && isNaN(newSelectedPmId)) {
        errors.push({ param: 'project_manager_id_select', msg: 'Invalid Project Manager ID format.'});
        newSelectedPmId = null;
    } else if (newSelectedPmId) {
        const [pmUser] = await db.query("SELECT id, role FROM users WHERE id = ?", [newSelectedPmId]);
        if (pmUser.length === 0 || !['Project Manager', 'Admin'].includes(pmUser[0].role)) {
            errors.push({ param: 'project_manager_id_select', msg: 'Selected Project Manager is not valid or does not have the required app role.'});
            newSelectedPmId = null; // Reset if invalid
        }
    }

    if (errors.length > 0) {
        // Repopulate form data correctly for PRG
        const formDataError = { ...originalProject, ...req.body, project_manager_id: originalProject.project_manager_id }; // Use original PM if selection was invalid
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        // Ensure project_manager_id_select is correctly repopulated if it was valid or keep original
        formDataError.project_manager_id_select = project_manager_id_select;


        req.session.editProjectFormData = formDataError;
        req.session.editProjectErrors = errors;
        return res.redirect(`/projects/${projectId}/edit`);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const updatedProjectData = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null,
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            budget: budget || null,
            status: status || 'Planning',
            project_manager_id: newSelectedPmId, // Assign the validated new PM ID
            updated_at: new Date()
        };

        await connection.query('UPDATE projects SET ? WHERE id = ?', [updatedProjectData, projectId]);
        
        const oldPmId = originalProject.project_manager_id;

        // Manage project_members if PM changed
        if (newSelectedPmId !== oldPmId) {
            // If there was an old PM, and they are different from new PM,
            // remove their 'Project Manager' role from project_members.
            // This doesn't remove them if they have other roles.
            if (oldPmId) {
                await connection.query(
                    "DELETE FROM project_members WHERE project_id = ? AND user_id = ? AND role_in_project = 'Project Manager'", 
                    [projectId, oldPmId]
                );
            }
            // If a new PM is assigned, add/update them in project_members as 'Project Manager'
            if (newSelectedPmId) {
                await connection.query(
                    'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
                    [projectId, newSelectedPmId, 'Project Manager']
                );
            }
        }
        
        await connection.commit();
        req.flash('success_msg', 'Project updated successfully and members managed!');
        res.redirect(`/projects/${projectId}/details`);

    } catch (err) {
        await connection.rollback();
        console.error("Error updating project:", err);
        // Repopulate form for retry, ensuring originalProject values are used as base
        const formDataErrorRetry = { ...originalProject, ...req.body, project_manager_id: originalProject.project_manager_id };
        if (formDataErrorRetry.start_date) formDataErrorRetry.start_date = new Date(formDataErrorRetry.start_date).toISOString().split('T')[0];
        if (formDataErrorRetry.end_date) formDataErrorRetry.end_date = new Date(formDataErrorRetry.end_date).toISOString().split('T')[0];
        formDataErrorRetry.project_manager_id_select = project_manager_id_select;


        req.session.editProjectFormData = formDataErrorRetry;
        req.session.editProjectErrors = errors.length > 0 ? errors : [{msg: 'Server error updating project. Please try again.'}];
        res.redirect(`/projects/${projectId}/edit`);
    } finally {
        if (connection) connection.release();
    }
};


// Handle project deletion
exports.handleDeleteProject = async (req, res, next) => {
    const projectId = req.params.id; // Already checked by middleware
    // const userId = req.session.user.id; // Not needed for permission here

    try {
        // Foreign key constraints with ON DELETE CASCADE for tasks, daily_logs, project_members, documents should handle deletion of related records.
        // If not, manual deletion or checks would be needed here.
        // For example, task_dependencies might need manual cleanup if tasks are deleted and dependencies are not ON DELETE CASCADE from both ends.

        const [deleteResult] = await db.query('DELETE FROM projects WHERE id = ?', [projectId]);

        if (deleteResult.affectedRows > 0) {
            req.flash('success_msg', 'Project deleted successfully. Associated items have also been removed.');
        } else {
            req.flash('error_msg', 'Could not delete the project. It might have been deleted already.');
        }
        res.redirect('/projects'); // Redirect to project list

    } catch (err) {
        console.error("Error deleting project:", err);
        if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.sqlState === '23000') {
            req.flash('error_msg', 'Cannot delete project: It is referenced by other records that could not be automatically removed. Please check for linked items or contact support.');
        } else {
            req.flash('error_msg', 'An error occurred while trying to delete the project.');
        }
        // It's better to redirect to a list page if the project might no longer exist or be accessible
        res.redirect(`/projects`);
    }
};

// Show list of projects (e.g., /projects page)
exports.showProjectsList = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const userAppRole = req.session.user.role;

        let query;
        let queryParams;

        if (userAppRole === 'Admin') {
            // Admin sees all projects
            query = `
                SELECT
                    p.id, p.name, p.project_code, p.status, p.client_name,
                    DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted,
                    u_creator.username AS creator_username,
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
                    (SELECT COUNT(CASE WHEN t.status = 'Completed' THEN 1 ELSE NULL END) FROM tasks t WHERE t.project_id = p.id) as completed_task_count
                FROM projects p
                LEFT JOIN users u_creator ON p.created_by_id = u_creator.id
                ORDER BY p.status ASC, p.created_at DESC
            `;
            queryParams = [];
        } else {
            // Non-admins see projects they created, manage, or are members of
            query = `
                SELECT DISTINCT
                    p.id, p.name, p.project_code, p.status, p.client_name,
                    DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted,
                    u_creator.username AS creator_username,
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
                    (SELECT COUNT(CASE WHEN t.status = 'Completed' THEN 1 ELSE NULL END) FROM tasks t WHERE t.project_id = p.id) as completed_task_count
                FROM projects p
                LEFT JOIN users u_creator ON p.created_by_id = u_creator.id
                LEFT JOIN project_members pm ON p.id = pm.project_id
                WHERE p.created_by_id = ? OR p.project_manager_id = ? OR pm.user_id = ?
                ORDER BY p.status ASC, p.created_at DESC
            `;
            queryParams = [userId, userId, userId];
        }
        const [projects] = await db.query(query, queryParams);

        res.render('projects/lists', {
            title: 'Projects - Avenircon',
            pageTitle: userAppRole === 'Admin' ? 'All Projects' : 'My Projects',
            projects: projects,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error('Error fetching projects list:', error);
        next(error);
    }
};



// Show form to upload projects via CSV
exports.showUploadProjectsCsvForm = async (req, res, next) => {
    try {
        res.render('projects/upload_csv', {
            title: 'Upload Projects via CSV - Avenircon',
            pageTitle: 'Bulk Upload Projects',
            layout: './layouts/main_layout',
            errors: req.session.uploadCsvErrors || [],
            successCount: req.session.uploadCsvSuccessCount,
            failureCount: req.session.uploadCsvFailureCount,
            detailedErrors: req.session.uploadCsvDetailedErrors || []
        });
        delete req.session.uploadCsvErrors;
        delete req.session.uploadCsvSuccessCount;
        delete req.session.uploadCsvFailureCount;
        delete req.session.uploadCsvDetailedErrors;
    } catch (error) {
        next(error);
    }
};



// Handle CSV upload for creating multiple projects
exports.handleUploadProjectsCsv = async (req, res, next) => {
    if (!req.file) {
        req.flash('error_msg', 'No CSV file uploaded.');
        return res.redirect('/projects/upload-csv');
    }

    const created_by_id = req.session.user.id;
    const creator_app_role = req.session.user.role;
    const results = [];
    const errors = [];
    const detailedErrors = [];
    let successCount = 0;
    let failureCount = 0;

    const stream = Readable.from(req.file.buffer.toString());

    stream.pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            if (results.length === 0) {
                req.flash('error_msg', 'CSV file is empty or invalid.');
                return res.redirect('/projects/upload-csv');
            }

            const connection = await db.getConnection();
            try {
                for (let i = 0; i < results.length; i++) {
                    const row = results[i];
                    const rowIndex = i + 2; // CSV row number (1-based, +1 for header)
                    let rowErrors = [];

                    // --- Map CSV columns to project fields ---
                    // Expected headers: name, project_code, description, client_name, start_date, end_date, budget, project_manager_username
                    const name = row.name ? row.name.trim() : '';
                    const project_code = row.project_code ? row.project_code.trim() : null;
                    const description = row.description ? row.description.trim() : null;
                    const client_name = row.client_name ? row.client_name.trim() : null;
                    const start_date_str = row.start_date ? row.start_date.trim() : '';
                    const end_date_str = row.end_date ? row.end_date.trim() : null;
                    const budget_str = row.budget ? row.budget.trim() : null;
                    const pm_username = row.project_manager_username ? row.project_manager_username.trim() : null;

                    // --- Basic Validations (similar to handleCreateProject) ---
                    if (!name) rowErrors.push('Project Name is required.');
                    if (name && name.length > 255) rowErrors.push('Project name too long.');
                    if (project_code && project_code.length > 50) rowErrors.push('Project code too long.');
                    if (!start_date_str) rowErrors.push('Start Date is required.');

                    /* let start_date = null;
                    if (start_date_str) {
                        try {
                            start_date = dateFns.isValid(new Date(start_date_str)) ? dateFns.format(new Date(start_date_str), 'yyyy-MM-dd') : null;
                            if (!start_date) rowErrors.push('Invalid Start Date format (use YYYY-MM-DD).');
                        } catch (e) { rowErrors.push('Invalid Start Date.'); }
                    }

                    let end_date = null;
                    if (end_date_str) {
                        try {
                            end_date = dateFns.isValid(new Date(end_date_str)) ? dateFns.format(new Date(end_date_str), 'yyyy-MM-dd') : null;
                            if (!end_date && end_date_str) rowErrors.push('Invalid End Date format (use YYYY-MM-DD).');
                        } catch (e) { rowErrors.push('Invalid End Date.'); }
                    }

                    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
                        rowErrors.push('Start Date cannot be after End Date.');
                    }
                        */
//corrected date
 let start_date = null;
if (start_date_str) {
    const parsedDate = parse(start_date_str, 'yyyy-MM-dd', new Date());
    if (isValid(parsedDate)) {
        start_date = format(parsedDate, 'yyyy-MM-dd');
    } else {
        // Try other common formats as a fallback if desired, or just error out
        const parsedAlt = parse(start_date_str, 'MM/dd/yyyy', new Date());
        if (isValid(parsedAlt)) {
            start_date = format(parsedAlt, 'yyyy-MM-dd');
        } else {
            const parsedAlt2 = parse(start_date_str, 'dd/MM/yyyy', new Date());
            if(isValid(parsedAlt2)) {
                start_date = format(parsedAlt2, 'yyyy-MM-dd');
            } else {
                rowErrors.push(`Invalid Start Date: '${start_date_str}'. Expected YYYY-MM-DD, MM/DD/YYYY, or DD/MM/YYYY.`);
            }
        }
    }
}

let end_date = null;
if (end_date_str) {
    const parsedDate = parse(end_date_str, 'yyyy-MM-dd', new Date());
    if (isValid(parsedDate)) {
        end_date = format(parsedDate, 'yyyy-MM-dd');
    } else {
        const parsedAlt = parse(end_date_str, 'MM/dd/yyyy', new Date());
        if (isValid(parsedAlt)) {
            end_date = format(parsedAlt, 'yyyy-MM-dd');
        } else {
             const parsedAlt2 = parse(end_date_str, 'dd/MM/yyyy', new Date());
            if(isValid(parsedAlt2)) {
                end_date = format(parsedAlt2, 'yyyy-MM-dd');
            } else {
                rowErrors.push(`Invalid End Date: '${end_date_str}'. Expected YYYY-MM-DD, MM/DD/YYYY, or DD/MM/YYYY.`);
            }
        }
    }
}



                    let budget = null;
                    if (budget_str) {
                        budget = parseFloat(budget_str);
                        if (isNaN(budget) || budget < 0) rowErrors.push('Budget must be a non-negative number.');
                    }

                    let selectedProjectManagerId = null;
                    if (pm_username) {
                        const [pmUserRows] = await connection.query("SELECT id, role FROM users WHERE username = ? AND role IN ('Project Manager', 'Admin')", [pm_username]);
                        if (pmUserRows.length > 0) {
                            selectedProjectManagerId = pmUserRows[0].id;
                        } else {
                            rowErrors.push(`Project Manager with username '${pm_username}' not found or not a valid PM/Admin.`);
                        }
                    }
                    if (!selectedProjectManagerId && creator_app_role === 'Project Manager') {
                        selectedProjectManagerId = created_by_id;
                    }

                    if (rowErrors.length > 0) {
                        failureCount++;
                        detailedErrors.push({ row: rowIndex, errors: rowErrors, data: row });
                        continue; // Skip to next row
                    }

                    // --- Create Project (within a transaction for each project if desired, or one big transaction) ---
                    // For simplicity, we'll do one project at a time. For bulk, a single transaction might be better.
                    await connection.beginTransaction();
                    try {
                        const newProjectData = {
                            name: name,
                            project_code: project_code,
                            description: description,
                            client_name: client_name,
                            start_date: start_date,
                            end_date: end_date,
                            budget: budget,
                            created_by_id,
                            status: 'Planning',
                            project_manager_id: selectedProjectManagerId,
                        };
                        const [projectResult] = await connection.query('INSERT INTO projects SET ?', newProjectData);
                        const newProjectId = projectResult.insertId;

                        // Add members (creator and PM)
                        let finalCreatorRoleInProject = 'Team Member';
                        if (selectedProjectManagerId === created_by_id) finalCreatorRoleInProject = 'Project Manager';
                        else if (['Admin', 'Project Manager'].includes(creator_app_role)) finalCreatorRoleInProject = 'Project Manager';
                        
                        await connection.query(
                            'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
                            [newProjectId, created_by_id, finalCreatorRoleInProject]
                        );
                        if (selectedProjectManagerId && selectedProjectManagerId !== created_by_id) {
                            await connection.query(
                                'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
                                [newProjectId, selectedProjectManagerId, 'Project Manager']
                            );
                        }
                        await connection.commit();
                        successCount++;
                    } catch (dbErr) {
                        await connection.rollback();
                        failureCount++;
                        detailedErrors.push({ row: rowIndex, errors: ['Database error: ' + dbErr.message], data: row });
                        console.error(`Error processing CSV row ${rowIndex} for project:`, dbErr);
                    }
                }
            } catch (err) { // Catch errors from outer loop (like DB connection)
                console.error("Error processing CSV projects:", err);
                errors.push({ msg: 'An unexpected error occurred during processing. ' + err.message });
            } finally {
                if (connection) connection.release();
            }

            req.session.uploadCsvSuccessCount = successCount;
            req.session.uploadCsvFailureCount = failureCount;
            if (detailedErrors.length > 0) {
                 req.session.uploadCsvDetailedErrors = detailedErrors;
            }
            if (failureCount > 0) {
                req.flash('error_msg', `${failureCount} project(s) failed to import. See details below.`);
            }
            if (successCount > 0) {
                req.flash('success_msg', `${successCount} project(s) imported successfully.`);
            }
            if (successCount === 0 && failureCount === 0 && errors.length === 0) { // e.g. if CSV was empty after headers
                 req.flash('info_msg', 'No projects were processed from the CSV.');
            }
            res.redirect('/projects/upload-csv');
        });

    stream.on('error', (err) => {
        console.error('Error parsing CSV:', err);
        req.flash('error_msg', 'Error parsing CSV file: ' + err.message);
        res.redirect('/projects/upload-csv');
    });
};







// ... (showCreateProjectForm, showEditProjectForm,  showEditProjectForm, showProjectsList,  listUserProjects, showProjectDetails,
// Handle show ProjectDetails method:
// ... (other methods like handleUpdateProject handleDeleteProject, showProjectsList) ...

// ... (handleCreateProject and handleUpdateProject should already expect 'project_manager_id_select' from your previous update) ...

// ... (showCreateProjectForm, showEditProjectForm,  showEditProjectForm, showProjectsList,  listUserProjects, showProjectDetails,handleDeleteProject, showProjectsList) ...


// Avenircon/controllers/projectController.js
// In showProjectDetails method:
/*
exports.showProjectDetails = async (req, res, next) => {
    try {
        // ... existing logic to fetch project, tasks, members ...

        // Fetch project documents
        const [projectDocuments] = await db.query(
            `SELECT pd.*, u.username as uploader_username 
             FROM project_documents pd 
             JOIN users u ON pd.uploaded_by_id = u.id 
             WHERE pd.project_id = ? 
             ORDER BY pd.created_at DESC`,
            [projectId]
        );

        res.render('projects/details', {
            // ... other data passed to the view ...
            projectDocuments: projectDocuments, // <<< PASS DOCUMENTS
        });
    } catch (error) {
        // ... error handling ...
    }
};
*/

/*
// Show page to create a new project
exports.showCreateProjectForm = async (req, res, next) => { // Added async
    try {
        // Fetch users who can be project managers
        let potentialManagers = [];
        try {
            const [users] = await db.query(
                "SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Admin') AND is_active = TRUE ORDER BY first_name ASC, last_name ASC, username ASC"
            );
            potentialManagers = users.map(u => ({
                id: u.id,
                display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
            }));
        } catch (err) {
            console.warn("Could not fetch potential project managers for create form:", err);
            // Continue without managers list if there's an error, or handle more gracefully
        }

        res.render('projects/create', {
            title: 'Create New Project - Avenircon',
            pageTitle: 'Create New Project',
            layout: './layouts/main_layout',
            potentialManagers: potentialManagers, // Pass to the view
            formData: req.session.createProjectFormData || {},
            errors: req.session.createProjectErrors || []
        });
        delete req.session.createProjectFormData;
        delete req.session.createProjectErrors;
    } catch (error) {
        console.error("Error rendering create project page:", error);
        next(error);
    }
};


// Handle the submission of the new project form
exports.handleCreateProject = async (req, res, next) => {
    // Assuming project_manager_id_select might come from the form if you allow selecting PM at creation
    const { name, project_code, description, client_name, start_date, end_date, budget, project_manager_id_select } = req.body;
    const created_by_id = req.session.user.id;
    const creator_app_role = req.session.user.role;
    let errors = [];

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Project Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Project name cannot exceed 255 characters.' });
    if (project_code && project_code.length > 50) errors.push({ param: 'project_code', msg: 'Project code cannot exceed 50 characters.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });

    let selectedProjectManagerId = project_manager_id_select ? parseInt(project_manager_id_select) : null;
    if (selectedProjectManagerId && isNaN(selectedProjectManagerId)) {
        errors.push({ param: 'project_manager_id_select', msg: 'Invalid Project Manager selected.'});
        selectedProjectManagerId = null; // Reset if invalid format
    } else if (selectedProjectManagerId) {
        const [pmUser] = await db.query("SELECT id, role FROM users WHERE id = ?", [selectedProjectManagerId]);
        if (pmUser.length === 0 || !['Project Manager', 'Admin'].includes(pmUser[0].role)) {
            errors.push({ param: 'project_manager_id_select', msg: 'Selected Project Manager is not valid or does not have the required app role.'});
            selectedProjectManagerId = null; // Reset if user not found or wrong app role
        }
    }
    
    // If no PM selected via form, and creator is an app-level PM, auto-assign creator as PM
    if (!selectedProjectManagerId && creator_app_role === 'Project Manager') {
        selectedProjectManagerId = created_by_id;
    }


    if (errors.length > 0) {
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = errors;
        return res.redirect('/projects/create');
    }

    const connection = await db.getConnection(); // Get a connection for potential transaction
    try {
        await connection.beginTransaction();

        const newProjectData = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null,
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            budget: budget || null,
            created_by_id,
            status: 'Planning',
            project_manager_id: selectedProjectManagerId // Use the validated/determined PM ID
        };

        const [result] = await connection.query('INSERT INTO projects SET ?', newProjectData);
        const newProjectId = result.insertId;

        // Add creator to project_members
        // Determine creator's role in this specific project
        let creatorRoleInProject = 'Team Member'; // Default role for creator
        if (creator_app_role === 'Admin') {
            creatorRoleInProject = 'Project Manager'; // Admins often act as PMs by default
        } else if (creator_app_role === 'Project Manager') {
            creatorRoleInProject = 'Project Manager';
        }
        // If creator is also the selected PM, this ensures they get PM role.
        // If creator is NOT the selected PM but is an app-level PM/Admin, they still get PM role.
        // If creator is just a regular user, they get 'Team Member' or a 'Creator' role.
        if (selectedProjectManagerId === created_by_id) {
            creatorRoleInProject = 'Project Manager';
        }

        await connection.query(
            'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = GREATEST(VALUES(role_in_project), role_in_project)', 
            [newProjectId, created_by_id, creatorRoleInProject]
            // Using GREATEST for role_in_project might be tricky if roles aren't easily comparable.
            // Simpler: ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project) -- this overwrites.
            // Or check if exists first. For simplicity, let's use overwrite or ensure it's the desired role.
            // Best approach: ON DUPLICATE KEY UPDATE role_in_project = IF(VALUES(role_in_project) = 'Project Manager', 'Project Manager', role_in_project)
            // This ensures if they are being added as PM, they become PM. If PM and being added as Team Member, they stay PM.
            // For now, simple overwrite or specific logic:
        );
         // Re-evaluating the insert for creator:
        // If creator is the selected PM, their role_in_project is 'Project Manager'
        // Otherwise, if creator is Admin or PM app role, also 'Project Manager' in project
        // Otherwise, a default like 'Team Member' or 'Creator'
        let finalCreatorRoleInProject = 'Team Member'; // Default
        if (selectedProjectManagerId === created_by_id) {
            finalCreatorRoleInProject = 'Project Manager';
        } else if (['Admin', 'Project Manager'].includes(creator_app_role)) {
            finalCreatorRoleInProject = 'Project Manager'; // Or another high-level default
        }
        await connection.query(
            'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
            [newProjectId, created_by_id, finalCreatorRoleInProject]
        );


        // If a specific Project Manager was selected and is different from the creator, add them as PM
        if (selectedProjectManagerId && selectedProjectManagerId !== created_by_id) {
            await connection.query(
                'INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
                [newProjectId, selectedProjectManagerId, 'Project Manager']
            );
        }
        
        await connection.commit();
        req.flash('success_msg', 'Project created successfully and members updated!');
        res.redirect(`/projects/${newProjectId}/details`);

    } catch (err) {
        await connection.rollback();
        console.error("Error creating project:", err);
        req.session.createProjectFormData = req.body;
        // Ensure errors array is populated for the view even on DB error
        req.session.createProjectErrors = errors.length > 0 ? errors : [{ msg: 'Something went wrong while creating the project. Please try again.' }];
        res.redirect('/projects/create');
    } finally {
        if (connection) connection.release();
    }
};

*///

// ... (other methods like listUserProjects, showProjectDetails, handleDeleteProject, showProjectsList) ...



// ... (handleCreateProject and handleUpdateProject should already expect 'project_manager_id_select' from your previous update) ...


// ... (showCreateProjectForm, listUserProjects, showProjectDetails, showEditProjectForm, handleDeleteProject, showProjectsList) ...


/*

exports.showProjectDetails = async (req, res, next) => {
    try {
        const projectId = req.params.id;
        const projectFromMiddleware = req.projectContext; // Project context from checkProjectAccess middleware

        // Initial validation of project context from middleware
        if (!projectFromMiddleware || !projectFromMiddleware.id || projectFromMiddleware.id.toString() !== projectId.toString()) {
            console.error("[DEBUG] showProjectDetails: projectFromMiddleware is MISSING or MISMATCHED!");
            console.error("[DEBUG] showProjectDetails: projectFromMiddleware:", JSON.stringify(projectFromMiddleware, null, 2));
            console.error("[DEBUG] showProjectDetails: Route projectId:", projectId);
            req.flash('error_msg', 'Project context error. Unable to verify project details.');
            return res.status(403).redirect(projectId ? `/projects/${projectId}/details` : '/dashboard'); // Or just /dashboard
        }
        console.log("[DEBUG] showProjectDetails: projectFromMiddleware (initial):", JSON.stringify(projectFromMiddleware, null, 2));

        // Fetch the full project object again to ensure all necessary JOINed fields are present for the view
        const projectQueryDetailed = `
            SELECT 
                p.*, 
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted, 
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as end_date_formatted,
                DATE_FORMAT(p.created_at, '%M %d, %Y at %H:%i') as created_at_formatted,
                DATE_FORMAT(p.updated_at, '%M %d, %Y at %H:%i') as updated_at_formatted,
                creator.username AS creator_username,
                manager.username AS project_manager_username
            FROM projects p
            LEFT JOIN users creator ON p.created_by_id = creator.id
            LEFT JOIN users manager ON p.project_manager_id = manager.id
            WHERE p.id = ?
        `;
        const [projectRowsDetailed] = await db.query(projectQueryDetailed, [projectId]);

        if (projectRowsDetailed.length === 0) {
            console.error("[DEBUG] showProjectDetails: Detailed project fetch found no project with ID:", projectId);
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const finalProjectObjectForView = projectRowsDetailed[0];
        console.log("[DEBUG] showProjectDetails: finalProjectObjectForView (detailed fetch):", JSON.stringify(finalProjectObjectForView, null, 2));

        // Fetch tasks
        let fetchedTasks = [];
        try {
            fetchedTasks = await taskController.listTasksForProject(projectId, (req.session && req.session.user) ? req.session.user.id : null);
        } catch (taskError) {
            console.error(`[DEBUG] showProjectDetails: Error fetching tasks for project ${projectId}:`, taskError);
            req.flash('info_msg', 'Could not load tasks for this project.');
        }
        console.log("[DEBUG] showProjectDetails: fetchedTasks:", JSON.stringify(fetchedTasks, null, 2));

        // Fetch members
        let fetchedMembers = [];
        try {
            fetchedMembers = await projectMemberController.getProjectMembers(projectId);
        } catch (memberError) {
            console.error(`[DEBUG] showProjectDetails: Error fetching members for project ${projectId}:`, memberError);
            req.flash('info_msg', 'Could not load project members list.');
        }
        console.log("[DEBUG] showProjectDetails: fetchedMembers:", JSON.stringify(fetchedMembers, null, 2));
        console.log("[DEBUG] showProjectDetails: session.user (for permission checks):", JSON.stringify(req.session.user, null, 2));


        // --- Determine Permission Flags ---
        let canEditOrDeleteProjectFlag = false;
        let canManageProjectMembersFlag = false;
        let canManageTasksFlag = false;

        if (req.session && req.session.user) {
            const currentUserId = req.session.user.id;
            const currentUserAppRole = req.session.user.role;

            if (currentUserAppRole === 'Admin') {
                canEditOrDeleteProjectFlag = true;
                canManageProjectMembersFlag = true;
                canManageTasksFlag = true;
            } else {
                // Check if user is the designated Project Manager for this project
                if (finalProjectObjectForView.project_manager_id === currentUserId) {
                    canEditOrDeleteProjectFlag = true;
                    canManageProjectMembersFlag = true;
                    canManageTasksFlag = true; // Designated PM can manage tasks
                }

                // Check their role_in_project from project_members
                // This can grant additional permissions or override if already PM
                if (fetchedMembers && fetchedMembers.length > 0) {
                    const memberInfo = fetchedMembers.find(m => m.user_id === currentUserId);
                    if (memberInfo) {
                        if (memberInfo.role_in_project === 'Project Manager') {
                            canEditOrDeleteProjectFlag = true;    // If member as PM, can edit/delete project
                            canManageProjectMembersFlag = true; // If member as PM, can manage other members
                            canManageTasksFlag = true;          // If member as PM, can manage tasks
                        }
                        // Example: Site Supervisors can also manage tasks
                        if (['Project Manager', 'Site Supervisor'].includes(memberInfo.role_in_project)) {
                            canManageTasksFlag = true;
                        }
                        // Add more specific role-based conditions if needed
                        // For example, if only designated PM can manage members, not just any member with PM role:
                        // canManageProjectMembersFlag would only be set if finalProjectObjectForView.project_manager_id === currentUserId
                    }
                }
            }
        }

        console.log("[DEBUG] showProjectDetails Flags: canEditOrDeleteProject:", canEditOrDeleteProjectFlag, 
                    "canManageProjectMembers:", canManageProjectMembersFlag, 
                    "canManageTasks:", canManageTasksFlag);

        res.render('projects/details', {
            title: `${finalProjectObjectForView.name || 'Project'} - Project Details`,
            pageTitle: finalProjectObjectForView.name || 'Project Details',
            subTitle: finalProjectObjectForView.project_code ? `Project Code: ${finalProjectObjectForView.project_code}` : 'Project Details',
            project: finalProjectObjectForView,
            tasks: fetchedTasks || [],
            projectMembers: fetchedMembers || [],
            currentUser: (req.session && req.session.user) ? req.session.user : null, // Pass for EJS, if needed
            canEditOrDeleteProject: canEditOrDeleteProjectFlag,
            canManageProjectMembers: canManageProjectMembersFlag,
            canManageTasks: canManageTasksFlag,
            layout: './layouts/main_layout'
        });

    } catch (error) {
        console.error('[DEBUG] showProjectDetails: CATCH BLOCK ERROR:', error);
        // It's crucial that this `next(error)` is called to pass to your global error handler
        next(error);
    }
};
*/


/*
// Show page to create a new project
exports.showCreateProjectForm = (req, res, next) => {
    try {
        res.render('projects/create', {
            title: 'Create New Project - Avenircon',
            pageTitle: 'Create New Project',
            layout: './layouts/main_layout',
            formData: req.session.createProjectFormData || {},
            errors: req.session.createProjectErrors || []
        });
        delete req.session.createProjectFormData;
        delete req.session.createProjectErrors;
    } catch (error) {
        console.error("Error rendering create project page:", error);
        next(error);
    }
};

*/
/*
// Handle the submission of the new project form
exports.handleCreateProject = async (req, res, next) => {
    const { name, project_code, description, client_name, start_date, end_date, budget } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Project Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Project name cannot exceed 255 characters.' });
    if (project_code && project_code.length > 50) errors.push({ param: 'project_code', msg: 'Project code cannot exceed 50 characters.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    // Add more validation as needed

    if (errors.length > 0) {
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = errors;
        return res.redirect('/projects/create');
    }

    try {
        const newProject = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null,
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            budget: budget || null,
            created_by_id,
            status: 'Planning',
            project_manager_id: req.session.user.role === 'Project Manager' ? created_by_id : null // Auto-assign PM if creator is PM
        };

        const [result] = await db.query('INSERT INTO projects SET ?', newProject);
        
        // If creator is a PM or Admin, automatically add them to project_members as Project Manager
        if (req.session.user.role === 'Project Manager' || req.session.user.role === 'Admin') {
            await db.query('INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)', 
                           [result.insertId, created_by_id, 'Project Manager']);
        }

        req.flash('success_msg', 'Project created successfully!');
        res.redirect(`/projects/${result.insertId}/details`);

    } catch (err) {
        console.error("Error creating project:", err);
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = [{ msg: 'Something went wrong. Please try again.' }];
        res.redirect('/projects/create');
    }
};
*/



/*
// Show form to edit an existing project
exports.showEditProjectForm = async (req, res, next) => {
    try {
        const projectId = req.params.id; // Already checked by middleware
        // const userId = req.session.user.id; // Not needed for permission here

        const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);

        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        const formDataForRender = { ...project };
        if (formDataForRender.start_date) formDataForRender.start_date = new Date(formDataForRender.start_date).toISOString().split('T')[0];
        if (formDataForRender.end_date) formDataForRender.end_date = new Date(formDataForRender.end_date).toISOString().split('T')[0];
        
        // Fetch users who can be project managers (e.g., 'Project Manager' or 'Admin' app role)
        const [potentialManagers] = await db.query("SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Admin') AND is_active = TRUE ORDER BY username");


        res.render('projects/edit', {
            title: `Edit Project: ${project.name}`,
            pageTitle: `Edit Project: ${project.name}`,
            project: project,
            potentialManagers: potentialManagers,
            formData: req.session.editProjectFormData || formDataForRender,
            errors: req.session.editProjectErrors || [],
            layout: './layouts/main_layout' // Corrected
        });
        delete req.session.editProjectFormData;
        delete req.session.editProjectErrors;
    } catch (error) {
        console.error('Error showing edit project form:', error);
        next(error);
    }
};
*/

/*
// Handle the submission of the project edit form
exports.handleUpdateProject = async (req, res, next) => {
    const projectId = req.params.id; // Already checked by middleware
    // const userId = req.session.user.id; // Not needed for permission here
    const { name, project_code, description, client_name, start_date, end_date, budget, status, project_manager_id_select } = req.body;
    let errors = [];

    // Fetch original project to have its data if needed for form repopulation on error
    let originalProject;
    try {
        const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.'); // Should be caught by middleware
            return res.status(404).redirect('/dashboard');
        }
        originalProject = projectRows[0];
    } catch(dbError) {
        console.error("DB error fetching original project for update:", dbError);
        return next(dbError);
    }

    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Project Name is required.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    const validStatuses = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid project status selected.' });
    
    let newProjectManagerId = project_manager_id_select ? parseInt(project_manager_id_select) : null;
    if (newProjectManagerId && isNaN(newProjectManagerId)) {
        errors.push({ param: 'project_manager_id_select', msg: 'Invalid Project Manager selected.'});
    } else if (newProjectManagerId) {
        const [pmUser] = await db.query("SELECT id FROM users WHERE id = ? AND role IN ('Project Manager', 'Admin')", [newProjectManagerId]);
        if (pmUser.length === 0) {
            errors.push({ param: 'project_manager_id_select', msg: 'Selected Project Manager is not valid or does not have the required role.'});
            newProjectManagerId = null; // Reset if invalid
        }
    }


    if (errors.length > 0) {
        const formDataError = { ...originalProject, ...req.body, id: projectId };
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        
        req.session.editProjectFormData = formDataError;
        req.session.editProjectErrors = errors;
        return res.redirect(`/projects/${projectId}/edit`);
    }

    try {
        const updatedProjectData = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null,
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            budget: budget || null,
            status: status || 'Planning',
            project_manager_id: newProjectManagerId,
            updated_at: new Date()
        };

        await db.query('UPDATE projects SET ? WHERE id = ?', [updatedProjectData, projectId]);
        
        // Update project_members table if PM changed
        if (newProjectManagerId && newProjectManagerId !== originalProject.project_manager_id) {
            // Remove old PM if they were only there as PM and not via other role
            // Add new PM to project_members with 'Project Manager' role
            await db.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ? AND role_in_project = ?', 
                           [projectId, originalProject.project_manager_id, 'Project Manager']);
            await db.query('INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)',
                           [projectId, newProjectManagerId, 'Project Manager']);
        }


        req.flash('success_msg', 'Project updated successfully!');
        res.redirect(`/projects/${projectId}/details`);

    } catch (err) {
        console.error("Error updating project:", err);
        const formDataErrorRetry = { ...originalProject, ...req.body, id: projectId }; // Use original project for repopulation base
        req.session.editProjectFormData = formDataErrorRetry;
        req.session.editProjectErrors = [{msg: 'Server error updating project. Please try again.'}];
        res.redirect(`/projects/${projectId}/edit`);
    }
};
*/


/*
// Avenircon/controllers/projectController.js
const db = require('../config/db');
const taskController = require('./taskController'); // Assuming taskController is correctly set up

// Show page to create a new project
exports.showCreateProjectForm = (req, res, next) => { // Added next
    try {
        res.render('projects/create', {
            title: 'Create New Project - Avenircon',
            pageTitle: 'Create New Project', // Added pageTitle
            layout: './layouts/main_layout',   // << CORRECTED LAYOUT
            formData: req.session.createProjectFormData || {},
            errors: req.session.createProjectErrors || []
        });
        delete req.session.createProjectFormData;
        delete req.session.createProjectErrors;
    } catch (error) {
        console.error("Error rendering create project page:", error);
        next(error); // Pass to global error handler
    }
};

// Handle the submission of the new project form
exports.handleCreateProject = async (req, res, next) => { // Added next
    const { name, project_code, description, client_name, start_date, end_date, budget } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!name || name.trim() === '') {
        errors.push({ msg: 'Project Name is required.' });
    }
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Project name cannot exceed 255 characters.' });
    if (project_code && project_code.length > 50) errors.push({ param: 'project_code', msg: 'Project code cannot exceed 50 characters.' });

    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
        errors.push({ msg: 'Start Date cannot be after End Date.' });
    }
    // Add more validation as needed (e.g., budget format)

    if (errors.length > 0) {
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = errors;
        return res.redirect('/projects/create'); // PRG pattern
    }

    try {
        const newProject = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null, 
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            budget: budget || null,
            created_by_id,
            status: 'Planning' // Default status
        };

        const [result] = await db.query('INSERT INTO projects SET ?', newProject);
        req.flash('success_msg', 'Project created successfully!');
        // Redirect to the new project's details page or dashboard
        res.redirect(`/projects/${result.insertId}/details`); 

    } catch (err) {
        console.error("Error creating project:", err);
        req.session.createProjectFormData = req.body;
        req.session.createProjectErrors = [{ msg: 'Something went wrong while creating the project. Please try again.' }];
        res.redirect('/projects/create');
    }
};


// Service function to list projects for a user (called by dashboard route, for example)
// This function itself doesn't render, it returns data.
exports.listUserProjects = async (userId) => { // Takes userId as param
    if (!userId) {
        console.error('listUserProjects called without userId');
        throw new Error('User ID is required to list projects.');
    }
    try {
        const query = `
            SELECT 
                p.id, p.name, p.project_code, p.description, p.status, p.client_name, 
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted, 
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as end_date_formatted,
                u_creator.username AS creator_username
            FROM projects p
            JOIN users u_creator ON p.created_by_id = u_creator.id
            WHERE p.created_by_id = ? OR p.project_manager_id = ? 
            ORDER BY p.created_at DESC
        `;
        // Consider adding project members to this condition later
        const [projects] = await db.query(query, [userId, userId]);
        return projects;
        
    } catch (error) {
        console.error('Error fetching user projects in listUserProjects service:', error);
        throw new Error('Could not load projects due to a server issue.');
    }
};


// Show details for a single project
exports.showProjectDetails = async (req, res, next) => {
    try {
        const projectId = req.params.id;
        const userId = req.session.user.id;

        const query = `
            SELECT 
                p.*, 
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted, 
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as end_date_formatted,
                DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i') as created_at_formatted,
                DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i') as updated_at_formatted,
                u_creator.username AS creator_username,
                u_manager.username AS project_manager_username
            FROM projects p
            LEFT JOIN users u_creator ON p.created_by_id = u_creator.id
            LEFT JOIN users u_manager ON p.project_manager_id = u_manager.id
            WHERE p.id = ?
        `;
        const [projectRows] = await db.query(query, [projectId]);

        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard'); // Or /projects if you have a list page
        }
        const project = projectRows[0];

        // Basic Permission Check (creator or PM can view)
        // More granular permissions (e.g., team members) would be checked here later
        if (project.created_by_id !== userId && project.project_manager_id !== userId) {
            // TODO: Add check for project_members if that table exists and is populated
            req.flash('error_msg', 'You do not have permission to view this project.');
            return res.redirect('/dashboard');
        }

        let tasks = [];
        try {
            tasks = await taskController.listTasksForProject(projectId, userId); // userId for potential task-level perms
        } catch (taskError) {
            console.error(`Error fetching tasks for project ${projectId} in showProjectDetails:`, taskError);
            req.flash('error_msg', 'Could not load tasks for this project. They may still be editable individually.');
        }

        res.render('projects/details', {
            title: `${project.name} - Project Details`,
        //    title: (project.project_code ? '[' + project.project_code + '] ' : '') + project.name + ' - Details',
            pageTitle: project.name,
            subTitle: project.project_code ? `Project Code: ${project.project_code}` : 'Project Details',
            project: project,
            tasks: tasks || [], // Ensure tasks is an array
            layout: './layout/admin_layout'   // << CORRECTED LAYOUT
            
        });
    } catch (error) {
        console.error('Error fetching project details:', error);
        next(error);
    }
};





// Show form to edit an existing project
exports.showEditProjectForm = async (req, res, next) => {
    try {
        const projectId = req.params.id;
        const userId = req.session.user.id;

        const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);

        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        // Permission Check (Only creator or PM can edit - adjust as needed)
        if (project.created_by_id !== userId && project.project_manager_id !== userId) {
            req.flash('error_msg', 'You do not have permission to edit this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }

        // Format dates for <input type="date">
        const formDataForRender = { ...project };
        if (formDataForRender.start_date) {
            formDataForRender.start_date = new Date(formDataForRender.start_date).toISOString().split('T')[0];
        }
        if (formDataForRender.end_date) {
            formDataForRender.end_date = new Date(formDataForRender.end_date).toISOString().split('T')[0];
        }
        
        res.render('projects/edit', {
            title: `Edit Project: ${project.name}`,
            pageTitle: `Edit Project: ${project.name}`,
            project: project, // Original project for context
            formData: req.session.editProjectFormData || formDataForRender, // Use session data or formatted DB data
            errors: req.session.editProjectErrors || [],
            layout: './layouts/admin_layout'   // << CORRECTED LAYOUT
        });
        delete req.session.editProjectFormData;
        delete req.session.editProjectErrors;
    } catch (error) {
        console.error('Error showing edit project form:', error);
        next(error);
    }
};



// Handle the submission of the project edit form
exports.handleUpdateProject = async (req, res, next) => {
    const projectId = req.params.id; // Get from params for safety
    const userId = req.session.user.id;
    const { name, project_code, description, client_name, start_date, end_date, budget, status, project_manager_id } = req.body;
    let errors = [];

    let originalProject;
    try {
        const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        originalProject = projectRows[0];

        if (originalProject.created_by_id !== userId && originalProject.project_manager_id !== userId) {
            req.flash('error_msg', 'You do not have permission to update this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
    } catch(dbError) {
        console.error("DB error fetching original project for update:", dbError);
        return next(dbError);
    }

    if (!name || name.trim() === '') {
        errors.push({ msg: 'Project Name is required.' });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
        errors.push({ msg: 'Start Date cannot be after End Date.' });
    }
    const validStatuses = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled']; // Ensure these match DB enum/checks
    if (status && !validStatuses.includes(status)) {
        errors.push({ msg: 'Invalid project status selected.' });
    }
    // Validate project_manager_id if provided (e.g., ensure it's a valid user ID)
    if (project_manager_id && isNaN(parseInt(project_manager_id))) {
        errors.push({ msg: 'Invalid Project Manager selected.'});
    } else if (project_manager_id) {
        const [pmUser] = await db.query("SELECT id FROM users WHERE id = ? AND role IN ('Project Manager', 'Admin')", [parseInt(project_manager_id)]);
        if (pmUser.length === 0) {
            errors.push({ msg: 'Selected Project Manager is not valid or does not have the required role.'});
        }
    }


    if (errors.length > 0) {
        const formDataError = { ...originalProject, ...req.body, id: projectId };
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        
        req.session.editProjectFormData = formDataError;
        req.session.editProjectErrors = errors;
        return res.redirect(`/projects/${projectId}/edit`);
    }

    try {
        const updatedProjectData = {
            name: name.trim(),
            project_code: project_code ? project_code.trim() : null, 
            description: description ? description.trim() : null,
            client_name: client_name ? client_name.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            budget: budget || null,
            status: status || 'Planning', // Default if not provided
            project_manager_id: project_manager_id ? parseInt(project_manager_id) : null,
            updated_at: new Date()
        };

        await db.query('UPDATE projects SET ? WHERE id = ?', [updatedProjectData, projectId]);
        req.flash('success_msg', 'Project updated successfully!');
        res.redirect(`/projects/${projectId}/details`);

    } catch (err) {
        console.error("Error updating project:", err);
        const formDataErrorRetry = { ...originalProject, ...req.body, id: projectId };
        req.session.editProjectFormData = formDataErrorRetry;
        req.session.editProjectErrors = [{msg: 'Server error updating project. Please try again.'}];
        res.redirect(`/projects/${projectId}/edit`);
    }
};

// Handle project deletion
exports.handleDeleteProject = async (req, res, next) => {
    const projectId = req.params.id;
    const userId = req.session.user.id;

    try {
        const [projectRows] = await db.query('SELECT created_by_id, project_manager_id FROM projects WHERE id = ?', [projectId]);

        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found or already deleted.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        // Permission: Only creator or perhaps an Admin role should delete.
        // For now, sticking to creator or PM.
        if (project.created_by_id !== userId && project.project_manager_id !== userId && req.session.user.role !== 'Admin') {
            req.flash('error_msg', 'You do not have permission to delete this project.');
            return res.redirect(`/projects/${projectId}/details`); // Or to dashboard
        }
        
        // IMPORTANT: Check for ON DELETE CASCADE for tasks, daily_logs, project_documents etc.
        // If not set, these related records must be manually deleted or deletion prevented.
        // Example check for tasks (if no cascade):
        // const [tasksExist] = await db.query("SELECT id FROM tasks WHERE project_id = ? LIMIT 1", [projectId]);
        // if (tasksExist.length > 0) {
        //    req.flash('error_msg', 'Cannot delete project: It still has associated tasks. Please delete tasks first.');
        //    return res.redirect(`/projects/${projectId}/details`);
        // }

        const [deleteResult] = await db.query('DELETE FROM projects WHERE id = ?', [projectId]);

        if (deleteResult.affectedRows > 0) {
            req.flash('success_msg', 'Project deleted successfully. Associated items (tasks, logs) may also be deleted if database cascades are set.');
        } else {
            req.flash('error_msg', 'Could not delete the project. It might have been deleted already or an issue occurred.');
        }
        res.redirect('/dashboard'); // Or to a project list page

    } catch (err) {
        console.error("Error deleting project:", err);
        if (err.code === 'ER_ROW_IS_REFERENCED_2') { // MySQL specific error for FK constraint
            req.flash('error_msg', 'Cannot delete project: It is referenced by other records (e.g., tasks, logs). Ensure related items are removed or database uses ON DELETE CASCADE.');
        } else {
            req.flash('error_msg', 'An error occurred while trying to delete the project.');
        }
        res.redirect(`/projects/${projectId}/details`); // Redirect back to project if deletion failed
    }
};

// Show list of projects (e.g., /projects page)
exports.showProjectsList = async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        // Fetch projects created by, managed by, or where user is a member (future)
        const query = `
            SELECT 
                p.id, p.name, p.project_code, p.status, p.client_name,
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_date_formatted,
                u_creator.username AS creator_username,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') as completed_task_count
            FROM projects p
            LEFT JOIN users u_creator ON p.created_by_id = u_creator.id
            WHERE p.created_by_id = ? OR p.project_manager_id = ? 
            /* LATER: OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?) */
/*            ORDER BY p.status ASC, p.created_at DESC
        `;
        const [projects] = await db.query(query, [userId, userId /*, userId for members *//*]);
        
        res.render('projects/lists', { // Ensure views/projects/lists.ejs exists
            title: 'My Projects - Avenircon',
            pageTitle: 'My Projects',
            projects: projects,
            layout: './layouts/main_layout'   // << CORRECTED LAYOUT
        });
    } catch (error) {
        console.error('Error fetching projects list:', error);
        next(error);
    }
};


*/

