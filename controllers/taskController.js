// Avenircon/controllers/taskController.js
const db = require('../config/db');
const budgetCtrl = require('./budgetController'); // Import at the top of taskController.js
const csvParser = require('csv-parser'); // If not already imported
const { Readable } = require('stream'); // If not already 
const { parse, isValid, format } = require('date-fns'); // Import parse and isValid

// Show form to create a new task for a specific project
exports.showCreateTaskForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId; // Permission checked by middleware
        // const userId = req.session.user.id; // Not needed for permission check here

        const [projectRows] = await db.query('SELECT id, name FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) { // Should be caught by middleware
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        let potentialParentTasks = [];
        try {
            const [tasksForProject] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name ASC', [projectId]);
            potentialParentTasks = tasksForProject;
        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown:", fetchErr);
        }
        
        // Fetch assignable users (e.g., members of this project or users with specific app roles)
        let assignableUsers = [];
        try {
            // Option 1: Fetch project members
            const [members] = await db.query(
                `SELECT u.id, u.username, u.first_name, u.last_name 
                 FROM users u
                 JOIN project_members pm ON u.id = pm.user_id
                 WHERE pm.project_id = ? AND u.is_active = TRUE 
                 ORDER BY u.username ASC`, [projectId]
            );
            // Option 2: Fetch users with relevant app roles (if assignment is not restricted to project members)
            // const [usersWithRoles] = await db.query("SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Site Supervisor', 'Team Member', 'Subcontractor') AND is_active = TRUE ORDER BY username");
            
            assignableUsers = members.map(u => ({ 
                id: u.id, 
                display_name: `${u.first_name || ''} ${u.last_name || ''} (${u.username})`.replace('()','').trim() 
            }));

            if (assignableUsers.length === 0) { // Fallback if no project members, allow assigning any active user with relevant roles
                const [allRelevantUsers] = await db.query("SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Site Supervisor', 'Team Member', 'Subcontractor', 'Admin') AND is_active = TRUE ORDER BY username ASC");
                assignableUsers = allRelevantUsers.map(u => ({ 
                    id: u.id, 
                    display_name: `${u.first_name || ''} ${u.last_name || ''} (${u.username})`.replace('()','').trim() 
                }));
            }


        } catch (userFetchErr) {
            console.warn("Error fetching assignable users for task form:", userFetchErr);
        }


        res.render('tasks/create', {
            title: `Add Task to: ${project.name}`,
            pageTitle: `Add New Task`,
            subTitle: `For Project: ${project.name}`,
            project: project,
            potentialParentTasks: potentialParentTasks,
            assignableUsers: assignableUsers,
        
            formData: req.session.createTaskFormData || {},
            errors: req.session.createTaskErrors || [],
            layout: './layouts/main_layout',
            parent_task_id_query: req.query.parent_task_id
        });
        delete req.session.createTaskFormData;
        delete req.session.createTaskErrors;
    } catch (error) {
        console.error('Error showing create task form:', error);
        next(error);
    }
};

/*
// Handle the submission of the new task form (after modified for gantt chart)
exports.handleCreateTask = async (req, res, next) => {
    const projectId = req.params.projectId;
    const userId = req.session.user.id;
    // Destructure is_milestone as well
    const { name, task_code, description, start_date, end_date, progress_percentage,task_budget, status, priority, parent_task_id, assigned_to_id, is_milestone } = req.body;
    let errors = [];

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Task name is too long.'});
    if (task_code && task_code.length > 50) errors.push({ param: 'task_code', msg: 'Task code is too long.'});
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Task Start Date cannot be after End Date.' });
    
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }

    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        if (isNaN(parseInt(parent_task_id))) errors.push({ param: 'parent_task_id', msg: 'Invalid Parent Task ID format.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parseInt(parent_task_id), projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or does not belong to this project.' });
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }

    try {
        const newTask = {
            project_id: projectId,
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : 0,
            task_budget: task_budget || null,
            status: status || 'ToDo',
            priority: priority || 'Medium',
            is_milestone: is_milestone === 'true' ? true : false, // Correctly handle checkbox value
            created_by_id: userId,
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null
        };

        await db.query('INSERT INTO tasks SET ?', newTask);
        req.flash('success_msg', 'Task created successfully!');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error('Error creating task:', error);
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = [{ msg: 'Server error creating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }
};
*/

/*
// Handle the submission of the new task form
exports.handleCreateTask = async (req, res, next) => {
    const projectId = req.params.projectId;
    const userId = req.session.user.id;
    const { name, task_code, description, start_date, end_date, progress_percentage, task_budget, status, priority, parent_task_id, assigned_to_id, is_milestone } = req.body;
    let errors = [];

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Task name is too long.'});
    if (task_code && task_code.length > 50) errors.push({ param: 'task_code', msg: 'Task code is too long.'});
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Task Start Date cannot be after End Date.' });
    
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }

    // Validate task_budgett (Estimated Cost)
    let numPlannedBudget = null; // Default to null if not provided or invalid
    if (task_budgett && task_budgett.trim() !== '') {
        const parsedBudget = parseFloat(task_budget);
        if (isNaN(parsedBudget) || parsedBudget < 0) {
            errors.push({ param: 'task_budget', msg: 'Estimated Cost must be a valid non-negative number.' });
        } else {
            numPlannedBudget = parsedBudget;
        }
    }

    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        if (isNaN(parseInt(parent_task_id))) errors.push({ param: 'parent_task_id', msg: 'Invalid Parent Task ID format.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parseInt(parent_task_id), projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or does not belong to this project.' });
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        req.session.createTaskFormData = req.body; // req.body contains task_budget as string for PRG
        req.session.createTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }

    try {
        const newTask = {
            project_id: projectId,
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : 0,
            task_budget: numPlannedBudget, // Use the validated numeric value or null
            status: status || 'ToDo',
            priority: priority || 'Medium',
            is_milestone: is_milestone === 'true' ? true : false,
            created_by_id: userId,
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null
        };

        await db.query('INSERT INTO tasks SET ?', newTask);
        req.flash('success_msg', 'Task created successfully!');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error('Error creating task:', error);
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = [{ msg: 'Server error creating task. Please try again. ' + error.message }];
        res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }
};
*/


// Handle the submission of the new task form
exports.handleCreateTask = async (req, res, next) => {
    const projectId = req.params.projectId;
    const userId = req.session.user.id;
    // Destructure task_budget
    const { name, task_code, description, start_date, end_date, progress_percentage, task_budget, status, priority, parent_task_id, assigned_to_id, is_milestone } = req.body;
    let errors = [];

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Task name is too long.'});
    if (task_code && task_code.length > 50) errors.push({ param: 'task_code', msg: 'Task code is too long.'});
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Task Start Date cannot be after End Date.' });
    
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }

    // Validate task_budget (Estimated Cost)
    let numTaskBudget = null; // Renamed from numPlannedBudget
    if (task_budget && task_budget.trim() !== '') { // Corrected typo: task_budgett to task_budget
        const parsedBudget = parseFloat(task_budget);
        if (isNaN(parsedBudget) || parsedBudget < 0) {
            errors.push({ param: 'task_budget', msg: 'Estimated Cost must be a valid non-negative number.' });
        } else {
            numTaskBudget = parsedBudget;
        }
    }

    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        if (isNaN(parseInt(parent_task_id))) errors.push({ param: 'parent_task_id', msg: 'Invalid Parent Task ID format.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parseInt(parent_task_id), projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or does not belong to this project.' });
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }

    try {
        const newTask = {
            project_id: projectId,
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : 0,
            task_budget: numTaskBudget, // Use the validated numeric value or null
            status: status || 'ToDo',
            priority: priority || 'Medium',
            is_milestone: is_milestone === 'true' ? true : false,
            created_by_id: userId,
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null
        };

        await db.query('INSERT INTO tasks SET ?', newTask);
        req.flash('success_msg', 'Task created successfully!');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error('Error creating task:', error);
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = [{ msg: 'Server error creating task. Please try again. ' + error.message }];
        res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }
};


// Service function: List tasks for a specific project
exports.listTasksForProject = async (projectId, userIdPerformingAction) => {
    try {
        const query = `
            SELECT
                t.id, t.name, t.task_code, t.description, t.status, t.priority,
                DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted,
                DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted, 
                t.progress_percentage, t.parent_task_id, t.task_order,
                t.created_by_id, t.assigned_to_id,
                u_creator.username AS task_creator_username,
                COALESCE(u_assignee.first_name, u_assignee.username) AS assignee_display_name
            FROM tasks t
            LEFT JOIN users u_creator ON t.created_by_id = u_creator.id
            LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
            WHERE t.project_id = ?
            ORDER BY COALESCE(t.parent_task_id, t.id), t.task_order ASC, t.created_at ASC
        `;
        const [tasks] = await db.query(query, [projectId]);

        const buildHierarchy = (taskList) => {
            const taskMap = {};
            const roots = [];
            taskList.forEach(task => {
                taskMap[task.id] = { ...task, children: [] };
            });
            taskList.forEach(task => {
                if (task.parent_task_id && taskMap[task.parent_task_id]) {
                    taskMap[task.parent_task_id].children.push(taskMap[task.id]);
                } else {
                    roots.push(taskMap[task.id]);
                }
            });
            const sortChildrenRecursive = (nodes) => {
                nodes.sort((a, b) => (a.task_order || 0) - (b.task_order || 0) || (a.id - b.id)); // Fallback sort by id
                nodes.forEach(node => {
                    if (node.children.length > 0) sortChildrenRecursive(node.children);
                });
            };
            sortChildrenRecursive(roots);
            return roots;
        };
        return buildHierarchy(tasks);
    } catch (error) {
        console.error(`Error fetching tasks for project ${projectId}:`, error);
        throw new Error('Failed to retrieve tasks for the project.');
    }
};


// @desc    Show details of a specific task, including its direct sub-tasks
// @route   GET /projects/:projectId/tasks/:taskId/details
// @access  Private (Access is validated by checkProjectAccess middleware before this controller is called)
exports.showTaskDetails = async (req, res, next) => {
  try {
    const { projectId, taskId } = req.params;

    // **Critical Check 1: Verify req.projectContext from middleware**
    // The checkProjectAccess middleware is responsible for:
    // 1. Validating user's permission to access projectId.
    // 2. Fetching the project document for projectId.
    // 3. Attaching this project document to req.projectContext.
    // If req.projectContext is not here, the middleware failed or was bypassed.
    if (!req.projectContext || !req.projectContext.id || req.projectContext.id.toString() !== projectId.toString()) {
        console.error(`TaskDetails Error: req.projectContext is missing or mismatched.`);
        console.error(`req.projectContext:`, req.projectContext);
        console.error(`Route projectId:`, projectId);
        req.flash('error_msg', 'Project context error. Unable to verify project details.');
        // If projectId is known, try redirecting to project details, otherwise dashboard
        return res.status(403).redirect(projectId ? `/projects/${projectId}/details` : '/dashboard');
    }
    const projectForContext = req.projectContext; // We trust this project object

    // **Critical Check 2: Verify taskId parameter**
    if (!taskId || isNaN(parseInt(taskId))) {
        req.flash('error_msg', 'Invalid Task ID provided.');
        return res.status(400).redirect(`/projects/${projectId}/details`);
    }
    const numericTaskId = parseInt(taskId);

    // 1. Fetch the main task, ensuring it belongs to the already validated project
    const mainTaskQuery = `
        SELECT
            t.*,
            DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted,
            DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted,
            DATE_FORMAT(t.created_at, '%M %d, %Y at %H:%i') as created_at_formatted,
            DATE_FORMAT(t.updated_at, '%M %d, %Y at %H:%i') as updated_at_formatted,
            COALESCE(u_creator.username, 'N/A') AS creator_username,
            COALESCE(TRIM(CONCAT(u_assignee.first_name, ' ', u_assignee.last_name)), u_assignee.username, 'Unassigned') AS assignee_display_name,
            parent.name as parent_task_name,
            parent.id as parent_task_id_val
        FROM tasks t
        LEFT JOIN users u_creator ON t.created_by_id = u_creator.id
        LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
        LEFT JOIN tasks parent ON t.parent_task_id = parent.id
        WHERE t.id = ? AND t.project_id = ?   
    `;
    const [taskRows] = await db.query(mainTaskQuery, [numericTaskId, projectForContext.id]); // Use projectForContext.id

    if (taskRows.length === 0) {
      req.flash('error_msg', 'Task not found within this project.');
      return res.redirect(`/projects/${projectForContext.id}/details`);
    }
    const mainTask = taskRows[0];

    // In taskController.js, showTaskDetails method:
const budgetSummary = await budgetCtrl.getTaskBudgetSummary(mainTask.id);
mainTask.planned_budget_summary = budgetSummary.planned_budget;
mainTask.actual_cost_summary = budgetSummary.actual_cost;
mainTask.total_income_summary = budgetSummary.total_income;
mainTask.variance_summary = budgetSummary.variance;
// Then pass mainTask to the render function

    /*
    // Inside showTaskDetails, after fetching the mainTask:
const budgetSummary = await budgetCtrl.getTaskBudgetSummary(mainTask.id);
mainTask.cost = budgetSummary.cost; // Already on task, but ensure consistency
mainTask.actual_cost = budgetSummary.actual_cost;
mainTask.total_income = budgetSummary.total_income; // If you want to display income

*/
    // 2. Fetch direct children (sub-tasks) of the main task
    const subTasksQuery = `
        SELECT
            t.id, t.name, t.task_code, t.description, t.status, t.priority,
            DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted,
            DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted,
            t.progress_percentage, t.parent_task_id, t.task_order,
            COALESCE(TRIM(CONCAT(u_assignee.first_name, ' ', u_assignee.last_name)), u_assignee.username, 'Unassigned') AS assignee_display_name
        FROM tasks t
        LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
        WHERE t.project_id = ? AND t.parent_task_id = ?
        ORDER BY t.task_order ASC, t.created_at ASC
    `;
    const [subTaskRows] = await db.query(subTasksQuery, [projectForContext.id, numericTaskId]);
    mainTask.children = subTaskRows;

    res.render('tasks/details', {
      title: `Task: ${mainTask.name} - Avenircon`,
      pageTitle: `Task Details: ${mainTask.name}`,
      subTitle: `Project: ${projectForContext.name}`,
      project: projectForContext,
      task: mainTask,
      layout: './layouts/main_layout'
    });

  } catch (error) {
    console.error("Error in showTaskDetails controller:", error);
    // Generic error, but attempt to use projectId if available for redirect
    const routeProjectId = req.params.projectId || (req.projectContext ? req.projectContext.id : null);
    req.flash('error_msg', 'An unexpected error occurred while loading task details.');
    next(error); // Let global error handler deal with it, but flash message might not show if it renders a page.
                 // Or redirect: res.redirect(routeProjectId ? `/projects/${routeProjectId}/details` : '/dashboard');
  }
};





// Show page to edit an existing task
// Ensure showCreateTaskForm and showEditTaskForm pass is_milestone to formData if it exists.
// const formData = { ...task };
// if (formData.start_date) formData.start_date = new Date(formData.start_date).toISOString().split('T')[0];
// if (formData.end_date) formData.end_date = new Date(formData.end_date).toISOString().split('T')[0];
// formData.is_milestone = task.is_milestone; // Ensure this is passed
// req.session.editTaskFormData || formData,

// Show page to edit an existing task
exports.showEditTaskForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params; // Permission checked by middleware

        const [projectRows] = await db.query('SELECT id, name FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) { // Should be caught by middleware
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const formData = { ...task };
        if (formData.start_date) formData.start_date = new Date(formData.start_date).toISOString().split('T')[0];
        if (formData.end_date) formData.end_date = new Date(formData.end_date).toISOString().split('T')[0];
        formData.is_milestone = task.is_milestone; // Ensure this is passed
        //req.session.editTaskFormData || formData, 
        //is_milestone = req.session.editTaskFormData || formData, 

        let potentialParentTasks = [];
        try { // Exclude current task and its children from parent selection
            const [tasksForProject] = await db.query(
                'SELECT id, name FROM tasks WHERE project_id = ? AND id != ? AND (parent_task_id != ? OR parent_task_id IS NULL) ORDER BY name ASC',
                [projectId, taskId, taskId]
            );
            potentialParentTasks = tasksForProject;
        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown in edit form:", fetchErr);
        }
        
        let assignableUsers = [];
        try { // Same logic as create form for fetching assignable users
            const [members] = await db.query(
                `SELECT u.id, u.username, u.first_name, u.last_name 
                 FROM users u
                 JOIN project_members pm ON u.id = pm.user_id
                 WHERE pm.project_id = ? AND u.is_active = TRUE 
                 ORDER BY u.username ASC`, [projectId]
            );
            assignableUsers = members.map(u => ({ 
                id: u.id, 
                display_name: `${u.first_name || ''} ${u.last_name || ''} (${u.username})`.replace('()','').trim() 
            }));
             if (assignableUsers.length === 0) {
                const [allRelevantUsers] = await db.query("SELECT id, username, first_name, last_name FROM users WHERE role IN ('Project Manager', 'Site Supervisor', 'Team Member', 'Subcontractor', 'Admin') AND is_active = TRUE ORDER BY username ASC");
                assignableUsers = allRelevantUsers.map(u => ({ 
                    id: u.id, 
                    display_name: `${u.first_name || ''} ${u.last_name || ''} (${u.username})`.replace('()','').trim() 
                }));
            }
        } catch (userFetchErr) {
            console.warn("Error fetching assignable users for task edit form:", userFetchErr);
        }


        res.render('tasks/edit', {
            title: `Edit Task: ${task.name}`,
            pageTitle: `Edit Task: ${task.name}`,
            subTitle: `For Project: ${project.name}`,
            project: project,
            task: task,
            potentialParentTasks: potentialParentTasks,
            assignableUsers: assignableUsers,
            formData: req.session.editTaskFormData || formData,
            //is_milestone = req.session.editTaskFormData || formData, 
            errors: req.session.editTaskErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editTaskFormData;
        delete req.session.editTaskErrors;
    } catch (error) {
        console.error("Error showing edit task form:", error);
        next(error);
    }
};

/*
// Handle the submission of the task edit form
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    // Correctly destructure is_milestone from req.body
    const { name, task_code, description, start_date, end_date, progress_percentage, task_budget, status, priority, parent_task_id, assigned_to_id, is_milestone } = req.body; 
    let errors = [];

    let originalTask;
    try {
        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }
    
    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }
    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status selected.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority selected.' });

    const numParentId = (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null;
    if (numParentId) {
        if (numParentId === parseInt(taskId)) errors.push({ param: 'parent_task_id', msg: 'A task cannot be its own parent.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numParentId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }
     if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        const formDataError = { ...originalTask, ...req.body };
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : (originalTask.progress_percentage || 0),
            task_budget: task_budget || null, 
            status: status || originalTask.status,
            priority: priority || originalTask.priority,
            is_milestone: is_milestone === 'true' ? true : false, // Correctly handle checkbox value
            parent_task_id: numParentId,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null,
            updated_at: new Date()
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/details#task-${taskId}`);
    } catch (err) {
        console.error("Error updating task:", err);
        req.session.editTaskFormData = { ...originalTask, ...req.body }; // Use originalTask as base
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};

*/


// Handle the submission of the task edit form
// @desc    Handle task date updates from Gantt chart drag/resize
// @route   POST /projects/:projectId/tasks/:taskId/update-gantt-dates
// @access  Private (Requires project access with specific roles)
// Handle the submission of the task edit form
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    // Destructure task_budget
    const { name, task_code, description, start_date, end_date, progress_percentage, task_budget, status, priority, parent_task_id, assigned_to_id, is_milestone } = req.body; 
    let errors = [];

    let originalTask;
    try {
        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }
    
    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }

    // Validate task_budget (Estimated Cost)
    let numTaskBudgetUpdate = originalTask.task_budget; // Renamed from numPlannedBudgetUpdate
    if (typeof task_budget !== 'undefined') { // Check if task_budget was submitted
        if (task_budget.trim() !== '') {
            const parsedBudget = parseFloat(task_budget);
            if (isNaN(parsedBudget) || parsedBudget < 0) {
                errors.push({ param: 'task_budget', msg: 'Estimated Cost must be a valid non-negative number.' });
            } else {
                numTaskBudgetUpdate = parsedBudget;
            }
        } else { // Submitted as empty string, so set to null
             numTaskBudgetUpdate = null;
        }
    } // If task_budget is not in req.body at all, numTaskBudgetUpdate remains originalTask.task_budget

    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status selected.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority selected.' });

    const numParentId = (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null;
    if (numParentId) {
        if (numParentId === parseInt(taskId)) errors.push({ param: 'parent_task_id', msg: 'A task cannot be its own parent.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numParentId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }
     if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        const formDataError = { ...originalTask, ...req.body }; 
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : (originalTask.progress_percentage || 0),
            task_budget: numTaskBudgetUpdate, // Use the validated/processed numeric value
            status: status || originalTask.status,
            priority: priority || originalTask.priority,
            is_milestone: is_milestone === 'true' ? true : false,
            parent_task_id: numParentId,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null,
            updated_at: new Date()
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`);
    } catch (err) {
        console.error("Error updating task:", err);
        const formDataErrorRetry = { ...originalTask, ...req.body };
        req.session.editTaskFormData = formDataErrorRetry;
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again. ' + err.message }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};

/*
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { name, task_code, description, start_date, end_date, progress_percentage, task_budget, status, priority, parent_task_id, assigned_to_id, is_milestone } = req.body; 
    let errors = [];

    let originalTask;
    try {
        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }
    
    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }

    // Validate task_budget (Estimated Cost)
    let numPlannedBudgetUpdate = originalTask.task_budget; // Default to original task's budget
    if (task_budget && task_budget.trim() !== '') { // If a value is submitted
        const parsedBudget = parseFloat(task_budget);
        if (isNaN(parsedBudget) || parsedBudget < 0) {
            errors.push({ param: 'task_budget', msg: 'Estimated Cost must be a valid non-negative number.' });
            // numPlannedBudgetUpdate remains originalTask.task_budget if error, for PRG form repopulation from req.body is fine.
        } else {
            numPlannedBudgetUpdate = parsedBudget;
        }
    } else if (task_budget === '' || task_budget === null || typeof task_budget === 'undefined') {
        // If the field is submitted as empty string, or explicitly null/undefined, set budget to null
        numPlannedBudgetUpdate = null;
    }


    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status selected.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority selected.' });

    const numParentId = (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null;
    if (numParentId) {
        if (numParentId === parseInt(taskId)) errors.push({ param: 'parent_task_id', msg: 'A task cannot be its own parent.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numParentId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }
     if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        // For PRG, merge originalTask with req.body to ensure all fields are present,
        // and req.body values (like the string task_budget) take precedence for display.
        const formDataError = { ...originalTask, ...req.body }; 
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : (originalTask.progress_percentage || 0),
            task_budget: numPlannedBudgetUpdate, // Use the validated/processed numeric value
            status: status || originalTask.status,
            priority: priority || originalTask.priority,
            is_milestone: is_milestone === 'true' ? true : false,
            parent_task_id: numParentId,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null,
            updated_at: new Date()
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`); // Redirect to task details page
    } catch (err) {
        console.error("Error updating task:", err);
        const formDataErrorRetry = { ...originalTask, ...req.body };
        req.session.editTaskFormData = formDataErrorRetry;
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again. ' + err.message }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};
*/

// @desc    Handle task date updates from Gantt chart drag/resize
// @route   POST /projects/:projectId/tasks/:taskId/update-gantt-dates
// @access  Private (Requires project access with specific roles)
exports.handleUpdateTaskDatesFromGantt = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { start, end } = req.body; // Frappe Gantt sends 'start' and 'end'

    // Basic Validation
    if (!start || !end) {
        return res.status(400).json({ success: false, message: 'Start and end dates are required.' });
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format.' });
    }
    if (startDate > endDate) {
        return res.status(400).json({ success: false, message: 'Start date cannot be after end date.' });
    }

    try {
        // Verify task belongs to project (optional, as checkProjectAccess should cover project-level access)
        const [taskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Task not found in this project.' });
        }

        await db.query(
            'UPDATE tasks SET start_date = ?, end_date = ?, updated_at = NOW() WHERE id = ?',
            [startDate, endDate, taskId]
        );
        res.json({ success: true, message: 'Task dates updated successfully.' });
    } catch (error) {
        console.error('Error updating task dates from Gantt:', error);
        res.status(500).json({ success: false, message: 'Server error updating task dates.' });
    }
};



// @desc    Handle task progress updates from Gantt chart
// @route   POST /projects/:projectId/tasks/:taskId/update-gantt-progress
// @access  Private (Requires project access with specific roles)
exports.handleUpdateTaskProgressFromGantt = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { progress } = req.body; // Frappe Gantt sends 'progress'

    const numProgress = parseInt(progress);
    if (isNaN(numProgress) || numProgress < 0 || numProgress > 100) {
        return res.status(400).json({ success: false, message: 'Progress must be a number between 0 and 100.' });
    }

    try {
        // Verify task belongs to project (optional)
        const [taskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Task not found in this project.' });
        }

        await db.query(
            'UPDATE tasks SET progress_percentage = ?, updated_at = NOW() WHERE id = ?',
            [numProgress, taskId]
        );
        res.json({ success: true, message: 'Task progress updated successfully.' });
    } catch (error) {
        console.error('Error updating task progress from Gantt:', error);
        res.status(500).json({ success: false, message: 'Server error updating task progress.' });
    }
};



// Handle the deletion of a task
exports.handleDeleteTask = async (req, res, next) => {
    const { projectId, taskId } = req.params; // Permission checked by middleware

    try {
        // Check for sub-tasks: A task with children cannot be deleted directly.
        // ON DELETE CASCADE on parent_task_id will auto-delete children, but it's often better UX to prevent.
        const [subTasks] = await db.query('SELECT id FROM tasks WHERE parent_task_id = ?', [taskId]);
        if (subTasks.length > 0) {
            req.flash('error_msg', 'Cannot delete this task: it has sub-tasks. Please delete or reassign sub-tasks first.');
            return res.redirect(`/projects/${projectId}/details#task-${taskId}`);
        }
        
        // Check for dependencies if `task_dependencies` table is in use and ON DELETE CASCADE is not sufficient
        const [dependenciesExist] = await db.query(
            'SELECT id FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?', [taskId, taskId]
        );
        if (dependenciesExist.length > 0) {
            req.flash('error_msg', 'Cannot delete task: It is part of a dependency relationship. Please remove dependencies first.');
            return res.redirect(`/projects/${projectId}/details#task-${taskId}`);
        }


        const [result] = await db.query('DELETE FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);

        if (result.affectedRows === 0) {
            req.flash('error_msg', 'Task not found or could not be deleted.');
        } else {
            req.flash('success_msg', 'Task deleted successfully!');
        }
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error("Error deleting task:", error);
        req.flash('error_msg', 'An error occurred while deleting the task.');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    }
};



// Show form to upload tasks via CSV for a specific project
exports.showUploadTasksCsvForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // From checkProjectAccess

        if (!project) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }

        res.render('tasks/upload_csv', {
            title: `Upload Tasks for ${project.name} - Avenircon`,
            pageTitle: `Bulk Upload Tasks`,
            subTitle: `Project: ${project.name}`,
            project: project,
            layout: './layouts/main_layout',
            errors: req.session.uploadTasksCsvErrors || [],
            successCount: req.session.uploadTasksCsvSuccessCount,
            failureCount: req.session.uploadTasksCsvFailureCount,
            detailedErrors: req.session.uploadTasksCsvDetailedErrors || []
        });
        delete req.session.uploadTasksCsvErrors;
        delete req.session.uploadTasksCsvSuccessCount;
        delete req.session.uploadTasksCsvFailureCount;
        delete req.session.uploadTasksCsvDetailedErrors;
    } catch (error) {
        next(error);
    }
};


// Handle CSV upload for creating multiple tasks for a project
exports.handleUploadTasksCsv = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    const userId = req.session.user.id; // User performing the upload

    if (!req.file) {
        req.flash('error_msg', 'No CSV file uploaded.');
        return res.redirect(`/projects/${projectId}/tasks/upload-csv`);
    }

    const results = [];
    const detailedErrors = [];
    let successCount = 0;
    let failureCount = 0;

    const stream = Readable.from(req.file.buffer.toString());

    stream.pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            if (results.length === 0) {
                req.flash('error_msg', 'CSV file is empty or invalid.');
                return res.redirect(`/projects/${projectId}/tasks/upload-csv`);
            }

            const connection = await db.getConnection();
            try {
                // For resolving parent_task_code to parent_task_id, we might need two passes
                // or fetch all existing task codes for the project first.
                // For simplicity in this example, we'll assume parent_task_code refers to tasks
                // being created *within the same CSV* and processed in order, or pre-existing tasks.
                // A more robust solution would map all task_codes from CSV first.

                // Let's fetch existing task codes for this project to map parent_task_code
                const [existingTasksForProject] = await connection.query(
                    "SELECT id, task_code FROM tasks WHERE project_id = ? AND task_code IS NOT NULL AND task_code != ''",
                    [projectId]
                );
                const taskCodeToIdMap = {};
                existingTasksForProject.forEach(t => {
                    taskCodeToIdMap[t.task_code.toLowerCase()] = t.id;
                });
                // This map will be updated as new tasks from CSV are created IF they have a task_code

                for (let i = 0; i < results.length; i++) {
                    const row = results[i];
                    const rowIndex = i + 2; // CSV row number
                    let rowErrors = [];

                    // --- Map CSV columns to task fields ---
                    // Headers: name, task_code, description, start_date, end_date, progress_percentage, task_budget, status, priority, parent_task_code, assigned_to_username, is_milestone
                    const name = row.name ? row.name.trim() : '';
                    const task_code = row.task_code ? row.task_code.trim() : null;
                    const description = row.description ? row.description.trim() : null;
                    const start_date_str = row.start_date ? row.start_date.trim() : null;
                    const end_date_str = row.end_date ? row.end_date.trim() : null;
                    const progress_str = row.progress_percentage ? row.progress_percentage.trim() : '0';
                    const task_budget_str = row.task_budget ? row.task_budget.trim() : null;
                    const status = row.status ? row.status.trim() : 'ToDo';
                    const priority = row.priority ? row.priority.trim() : 'Medium';
                    const parent_task_code = row.parent_task_code ? row.parent_task_code.trim().toLowerCase() : null;
                    const assignee_username = row.assigned_to_username ? row.assigned_to_username.trim() : null;
                    const is_milestone_str = row.is_milestone ? row.is_milestone.trim().toUpperCase() : 'FALSE';

                    // --- Validations (similar to handleCreateTask) ---
                    if (!name) rowErrors.push('Task Name is required.');
                    // ... (add more validations for length, formats as in your handleCreateTask) ...
/*
                    let start_date = null;
                    if (start_date_str) { /* ... date validation ... *//*
                        try { start_date = dateFns.format(new Date(start_date_str), 'yyyy-MM-dd'); }
                        catch(e) { rowErrors.push('Invalid Start Date.');}
                    }
                    let end_date = null;
                    if (end_date_str) { /* ... date validation ... *//*
                        try { end_date = dateFns.format(new Date(end_date_str), 'yyyy-MM-dd'); }
                        catch(e) { rowErrors.push('Invalid End Date.');}
                    }
                    if (start_date && end_date && new Date(start_date) > new Date(end_date)) rowErrors.push('Start Date after End Date.');
                    */
// ...
// ...

// Inside handleUploadTasksCsv loop:
// ...
let start_date = null;
if (start_date_str) {
    const parsedDate = parse(start_date_str, 'yyyy-MM-dd', new Date());
    if (isValid(parsedDate)) {
        start_date = format(parsedDate, 'yyyy-MM-dd');
    } else {
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
// ...


                    let numProgress = parseInt(progress_str);
                    if (isNaN(numProgress) || numProgress < 0 || numProgress > 100) rowErrors.push('Progress must be 0-100.');
                    
                    let numTaskBudget = null;
                    if (task_budget_str) { /* ... budget validation ... */
                        numTaskBudget = parseFloat(task_budget_str);
                        if (isNaN(numTaskBudget) || numTaskBudget < 0) rowErrors.push('Invalid Task Budget.');
                    }

                    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
                    if (!validStatuses.includes(status)) rowErrors.push(`Invalid Status: ${status}.`);
                    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
                    if (!validPriorities.includes(priority)) rowErrors.push(`Invalid Priority: ${priority}.`);

                    let parent_task_id = null;
                    if (parent_task_code) {
                        if (taskCodeToIdMap[parent_task_code]) {
                            parent_task_id = taskCodeToIdMap[parent_task_code];
                        } else {
                            rowErrors.push(`Parent Task with code '${row.parent_task_code}' not found in this project or previously in CSV.`);
                        }
                    }

                    let assigned_to_id = null;
                    if (assignee_username) {
                        const [userRows] = await connection.query("SELECT id FROM users WHERE username = ?", [assignee_username]);
                        if (userRows.length > 0) assigned_to_id = userRows[0].id;
                        else rowErrors.push(`Assignee with username '${assignee_username}' not found.`);
                    }

                    const is_milestone = is_milestone_str === 'TRUE';

                    if (rowErrors.length > 0) {
                        failureCount++;
                        detailedErrors.push({ row: rowIndex, errors: rowErrors, data: row });
                        continue;
                    }

                    // --- Create Task ---
                    // No transaction per task here for simplicity, but can be added
                    try {
                        const newTaskData = {
                            project_id: projectId, name, task_code, description, start_date, end_date,
                            progress_percentage: numProgress, task_budget: numTaskBudget, status, priority,
                            parent_task_id, assigned_to_id, is_milestone, created_by_id: userId
                        };
                        const [taskResult] = await connection.query('INSERT INTO tasks SET ?', newTaskData);
                        const newTaskId = taskResult.insertId;

                        // If this new task has a code, add it to our map for subsequent rows in *this* CSV
                        if (task_code) {
                            taskCodeToIdMap[task_code.toLowerCase()] = newTaskId;
                        }
                        successCount++;
                    } catch (dbErr) {
                        failureCount++;
                        detailedErrors.push({ row: rowIndex, errors: ['Database error: ' + dbErr.message], data: row });
                        console.error(`Error processing CSV row ${rowIndex} for task:`, dbErr);
                    }
                }
            } catch (err) {
                console.error("Error processing CSV tasks:", err);
                // req.session.uploadTasksCsvErrors = [{ msg: 'An unexpected error occurred. ' + err.message }];
                 req.flash('error_msg', `An error occurred: ${err.message}`);
            } finally {
                if (connection) connection.release();
            }

            req.session.uploadTasksCsvSuccessCount = successCount;
            req.session.uploadTasksCsvFailureCount = failureCount;
            if (detailedErrors.length > 0) {
                req.session.uploadTasksCsvDetailedErrors = detailedErrors;
            }
            if (failureCount > 0) {
                req.flash('error_msg', `${failureCount} task(s) failed to import. See details below.`);
            }
            if (successCount > 0) {
                req.flash('success_msg', `${successCount} task(s) imported successfully for project.`);
            }
             if (successCount === 0 && failureCount === 0 && (!req.session.uploadTasksCsvErrors || req.session.uploadTasksCsvErrors.length === 0) ) {
                 req.flash('info_msg', 'No tasks were processed from the CSV.');
            }
            res.redirect(`/projects/${projectId}/tasks/upload-csv`);
        });
    stream.on('error', (err) => {
        console.error('Error parsing CSV for tasks:', err);
        req.flash('error_msg', 'Error parsing CSV file: ' + err.message);
        res.redirect(`/projects/${projectId}/tasks/upload-csv`);
    });
};


// ... (other existing functions like showCreateTaskForm, listTasksForProject, showTaskDetails, showEditTaskForm) ...




// Ensure showCreateTaskForm and showEditTaskForm pass `task_budget` correctly if present in `formData` or `task` object.
// Your existing logic for `formData: req.session.createTaskFormData || {}` and
// `formData: req.session.editTaskFormData || formDataForRender` (where `formDataForRender = { ...task }`)
// should correctly handle passing `task_budget` to the views for repopulation.

// ... (other existing functions like showCreateTaskForm, listTasksForProject, showTaskDetails, showEditTaskForm) ...


// Make sure showCreateTaskForm and showEditTaskForm pass `planned_budget` correctly
// (Your existing logic using spread for formData should handle this if task object has planned_budget)

// exports.showCreateTaskForm = async (req, res, next) => { ... }
// The formData for create is `req.session.createTaskFormData || {}`. If `createTaskFormData` exists (after an error),
// it will contain `req.body.planned_budget` as a string, which is fine for repopulating the form.

// exports.showEditTaskForm = async (req, res, next) => {
//     // ...
//     const task = taskRows[0];
//     const formDataForRender = { ...task }; // This will include task.planned_budget
//     if (formDataForRender.start_date) formDataForRender.start_date = new Date(formDataForRender.start_date).toISOString().split('T')[0];
//     if (formDataForRender.end_date) formDataForRender.end_date = new Date(formDataForRender.end_date).toISOString().split('T')[0];
//     // formDataForRender.is_milestone = task.is_milestone; // Already handled by spread

//     res.render('tasks/edit', {
//         // ...
//         formData: req.session.editTaskFormData || formDataForRender, // This is correct
//         // ...
//     });
//     // ...
// };
// The existing `formData` logic in `showEditTaskForm` seems correct.

/*
Validation (Basic): The basic validation to check if assigned_to_id is a number and if the user exists is in place. The more robust check against project_members (or Admins) in handleCreateTask and handleUpdateTask (which I added in my suggested revision of your code for M2.1.B) would be the next layer of validation to ensure only appropriate users are assigned. If you haven't implemented that specific validation part yet, that's okay, but it's a good refinement for later.
Displaying Assignee: Your listTasksForProject and showTaskDetails methods (and subsequently your EJS views) are correctly displaying the assignee_display_name.
Recommended Refinement: Ensure that the assigned_to_id user is actually a member of the current project (from project_members) OR has an app-level 'Admin' role. This prevents arbitrary assignment to users not involved in the project. My previous detailed suggestion for taskController.js included this validation logic:

// Inside handleCreateTask / handleUpdateTask
if (numericAssignedToId) { // numericAssignedToId is the parsed assigned_to_id
    const [memberCheck] = await db.query(
        "SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?",
        [projectId, numericAssignedToId]
    );
    if (memberCheck.length === 0) {
        const [userRoleCheck] = await db.query("SELECT role FROM users WHERE id = ?", [numericAssignedToId]);
        if (userRoleCheck.length === 0 || userRoleCheck[0].role !== 'Admin') {
             errors.push({ param: 'assigned_to_id', msg: 'Assigned user is not a member of this project or an Admin.' });
        }
    }
}
*/

/*
// Handle the submission of the task edit form
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params; // Permission checked by middleware
    const { name, task_code, description, start_date, end_date, progress_percentage, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    let originalTask;
    try { // Fetch original task for repopulation base
        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.'); // Should be caught by middleware
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }

    // Validations (similar to create)
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Start Date cannot be after End Date.' });
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }
    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status selected.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority selected.' });

    const numParentId = (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null;
    if (numParentId) {
        if (numParentId === parseInt(taskId)) errors.push({ param: 'parent_task_id', msg: 'A task cannot be its own parent.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numParentId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }
     if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }


    if (errors.length > 0) {
        const formDataError = { ...originalTask, ...req.body };
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : (originalTask.progress_percentage || 0), // Keep original if not provided
            status: status || originalTask.status,
            priority: priority || originalTask.priority,
            parent_task_id: numParentId,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null,
            updated_at: new Date()
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/details#task-${taskId}`);
    } catch (err) {
        console.error("Error updating task:", err);
        req.session.editTaskFormData = { ...originalTask, ...req.body };
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};
*/


/*
// Handle the submission of the new task form
exports.handleCreateTask = async (req, res, next) => {
    const projectId = req.params.projectId; // Permission checked by middleware
    const userId = req.session.user.id; // User creating the task
    const { name, task_code, description, start_date, end_date, progress_percentage, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    // Validations
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Task name is too long.'});
    if (task_code && task_code.length > 50) errors.push({ param: 'task_code', msg: 'Task code is too long.'});
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ param: 'start_date', msg: 'Task Start Date cannot be after End Date.' });
    
    const numProgress = parseInt(progress_percentage);
    if (progress_percentage && (isNaN(numProgress) || numProgress < 0 || numProgress > 100)) {
        errors.push({ param: 'progress_percentage', msg: 'Progress must be a number between 0 and 100.' });
    }

    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ param: 'status', msg: 'Invalid task status.' });
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ param: 'priority', msg: 'Invalid task priority.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        if (isNaN(parseInt(parent_task_id))) errors.push({ param: 'parent_task_id', msg: 'Invalid Parent Task ID format.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parseInt(parent_task_id), projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or does not belong to this project.' });
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user ID.'});
        else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({ param: 'assigned_to_id', msg: 'Assigned user does not exist.'});
        }
    }

    if (errors.length > 0) {
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }

    try {
        const newTask = {
            project_id: projectId,
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: progress_percentage ? numProgress : 0,
            status: status || 'ToDo',
            priority: priority || 'Medium',
            created_by_id: userId,
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null
        };

        await db.query('INSERT INTO tasks SET ?', newTask);
        req.flash('success_msg', 'Task created successfully!');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error('Error creating task:', error);
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = [{ msg: 'Server error creating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }
};
*/

/*

// Avenircon/controllers/taskController.js
const db = require('../config/db');

// ... (listTasksForProject - assumed to be working and already fetching assignee_display_name)
// Service function: List tasks for a specific project
exports.listTasksForProject = async (projectId, userIdPerformingAction) => {
    try {
        const query = `
            SELECT
                t.id, t.name, t.task_code, t.description, t.status, t.priority,
                DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted,
                DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted,
                t.progress_percentage, t.parent_task_id, t.task_order,
                t.created_by_id, t.assigned_to_id,
                u_creator.username AS task_creator_username,
                COALESCE(u_assignee.first_name, u_assignee.username) AS assignee_display_name
            FROM tasks t
            LEFT JOIN users u_creator ON t.created_by_id = u_creator.id
            LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
            WHERE t.project_id = ?
            ORDER BY COALESCE(t.parent_task_id, t.id), t.task_order ASC, t.created_at ASC
        `;
        const [tasks] = await db.query(query, [projectId]);

        const buildHierarchy = (taskList) => {
            const taskMap = {};
            const roots = [];
            taskList.forEach(task => {
                taskMap[task.id] = { ...task, children: [] };
            });
            taskList.forEach(task => {
                if (task.parent_task_id && taskMap[task.parent_task_id]) {
                    taskMap[task.parent_task_id].children.push(taskMap[task.id]);
                } else {
                    roots.push(taskMap[task.id]);
                }
            });
            const sortChildrenRecursive = (nodes) => {
                nodes.sort((a, b) => (a.task_order || 0) - (b.task_order || 0) || (a.id - b.id)); // Fallback sort by id
                nodes.forEach(node => {
                    if (node.children.length > 0) sortChildrenRecursive(node.children);
                });
            };
            sortChildrenRecursive(roots);
            return roots;
        };
        return buildHierarchy(tasks);
    } catch (error) {
        console.error(`Error fetching tasks for project ${projectId}:`, error);
        throw new Error('Failed to retrieve tasks for the project.');
    }
};

// @desc    Show form to create a new task for a specific project
// @route   GET /projects/:projectId/tasks/create
// @access  Private (Controlled by checkProjectAccess with taskManageRoles)
exports.showCreateTaskForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        // projectForContext is expected to be set by checkProjectAccess middleware
        const projectForContext = req.projectContext;

        if (!projectForContext) {
            req.flash('error_msg', 'Project context is missing for creating a task.');
            return res.redirect('/dashboard');
        }

        let potentialParentTasks = [];
        try {
            const [tasksForProject] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name ASC', [projectId]);
            potentialParentTasks = tasksForProject;
        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown:", fetchErr);
        }
        
        let assignableUsers = [];
        try {
            // Fetch project members for the "Assign To" dropdown
            const [members] = await db.query(
                `SELECT u.id, u.username, u.first_name, u.last_name 
                 FROM users u
                 JOIN project_members pm ON u.id = pm.user_id
                 WHERE pm.project_id = ? AND u.is_active = TRUE 
                 ORDER BY u.first_name ASC, u.last_name ASC, u.username ASC`, 
                [projectId]
            );
            assignableUsers = members.map(u => ({ 
                id: u.id, 
                // Create a display name, handling cases where first/last might be null
                display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username 
            }));
            
            // Optional: If no project members, you might decide to allow assigning any user with relevant app roles
            // This was in your previous code, can be added back if desired as a fallback.
            // if (assignableUsers.length === 0) { ... fetch users by app role ... }

        } catch (userFetchErr) {
            console.warn("Error fetching assignable users for task form:", userFetchErr);
            req.flash('error_msg', 'Could not load list of users to assign tasks to.');
        }

        res.render('tasks/create', {
            title: `Add Task to: ${projectForContext.name}`,
            pageTitle: `Add New Task`,
            subTitle: `For Project: ${projectForContext.name}`,
            project: projectForContext,
            potentialParentTasks: potentialParentTasks,
            assignableUsers: assignableUsers, // Pass the fetched users
            formData: req.session.createTaskFormData || {},
            errors: req.session.createTaskErrors || [],
            layout: './layouts/main_layout',
            parent_task_id_query: req.query.parent_task_id
        });
        delete req.session.createTaskFormData;
        delete req.session.createTaskErrors;
    } catch (error) {
        console.error('Error showing create task form:', error);
        next(error);
    }
};

// @desc    Handle creation of a new task
// @route   POST /projects/:projectId/tasks/create
// @access  Private (Controlled by checkProjectAccess with taskManageRoles)
exports.handleCreateTask = async (req, res, next) => {
    const projectId = req.params.projectId;
    const userId = req.session.user.id; // User creating the task
    const { name, task_code, description, start_date, end_date, progress_percentage, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    // Validations (keep existing validations)
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    // ... other validations ...

    // Validate assigned_to_id (ensure it's a valid user ID and ideally a member of the project)
    let numericAssignedToId = null;
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        numericAssignedToId = parseInt(assigned_to_id);
        if (isNaN(numericAssignedToId)) {
            errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user format.'});
        } else {
            // Check if the assigned user is a member of this project
            const [memberCheck] = await db.query(
                "SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?",
                [projectId, numericAssignedToId]
            );
            if (memberCheck.length === 0) {
                // If not a member, check if they are an Admin (Admins can be assigned implicitly)
                const [userRoleCheck] = await db.query("SELECT role FROM users WHERE id = ?", [numericAssignedToId]);
                if (userRoleCheck.length === 0 || userRoleCheck[0].role !== 'Admin') {
                     errors.push({ param: 'assigned_to_id', msg: 'Assigned user is not a member of this project or an Admin.' });
                }
            }
        }
    }
    
    // Validate parent_task_id (similar existing logic)
    let numericParentTaskId = null;
    if (parent_task_id && parent_task_id.trim() !== '') {
        numericParentTaskId = parseInt(parent_task_id);
        if (isNaN(numericParentTaskId)) errors.push({ param: 'parent_task_id', msg: 'Invalid Parent Task ID format.' });
        else {
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numericParentTaskId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or does not belong to this project.' });
        }
    }


    if (errors.length > 0) {
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }

    try {
        const numProgress = progress_percentage ? parseInt(progress_percentage) : 0;
        const newTask = {
            project_id: projectId,
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: (numProgress >= 0 && numProgress <= 100) ? numProgress : 0,
            status: status || 'ToDo',
            priority: priority || 'Medium',
            created_by_id: userId,
            parent_task_id: numericParentTaskId,
            assigned_to_id: numericAssignedToId // Use the validated numeric ID
        };

        await db.query('INSERT INTO tasks SET ?', newTask);
        req.flash('success_msg', 'Task created successfully!');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error('Error creating task:', error);
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = [{ msg: 'Server error creating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }
};


// @desc    Show page to edit an existing task
// @route   GET /projects/:projectId/tasks/:taskId/edit
// @access  Private (Controlled by checkProjectAccess with taskManageRoles)
exports.showEditTaskForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const projectForContext = req.projectContext; // From middleware

        if (!projectForContext) {
            req.flash('error_msg', 'Project context is missing for editing a task.');
            return res.redirect('/dashboard');
        }

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const formData = { ...task };
        if (formData.start_date) formData.start_date = new Date(formData.start_date).toISOString().split('T')[0];
        if (formData.end_date) formData.end_date = new Date(formData.end_date).toISOString().split('T')[0];

        let potentialParentTasks = [];
        try {
            const [tasksForProject] = await db.query(
                'SELECT id, name FROM tasks WHERE project_id = ? AND id != ? ORDER BY name ASC', // Exclude current task
                [projectId, taskId]
            );
            // Further filter out children of current task to prevent circular dependency
            // This requires fetching all tasks and building a temporary hierarchy, or recursive DB query.
            // For simplicity here, we just exclude the task itself. A full check is more complex.
            potentialParentTasks = tasksForProject.filter(pt => pt.id !== parseInt(taskId));

        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown in edit form:", fetchErr);
        }
        
        let assignableUsers = [];
        try {
            // Fetch project members for the "Assign To" dropdown
            const [members] = await db.query(
                `SELECT u.id, u.username, u.first_name, u.last_name 
                 FROM users u
                 JOIN project_members pm ON u.id = pm.user_id
                 WHERE pm.project_id = ? AND u.is_active = TRUE 
                 ORDER BY u.first_name ASC, u.last_name ASC, u.username ASC`, 
                [projectId]
            );
            assignableUsers = members.map(u => ({ 
                id: u.id, 
                display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
            }));
            // Optional fallback as in showCreateTaskForm
        } catch (userFetchErr) {
            console.warn("Error fetching assignable users for task edit form:", userFetchErr);
        }

        res.render('tasks/edit', {
            title: `Edit Task: ${task.name}`,
            pageTitle: `Edit Task: ${task.name}`,
            subTitle: `For Project: ${projectForContext.name}`,
            project: projectForContext,
            task: task,
            potentialParentTasks: potentialParentTasks,
            assignableUsers: assignableUsers, // Pass the fetched users
            formData: req.session.editTaskFormData || formData,
            errors: req.session.editTaskErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editTaskFormData;
        delete req.session.editTaskErrors;
    } catch (error) {
        console.error("Error showing edit task form:", error);
        next(error);
    }
};

// @desc    Handle the submission of the task edit form
// @route   POST /projects/:projectId/tasks/:taskId/edit
// @access  Private (Controlled by checkProjectAccess with taskManageRoles)
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { name, task_code, description, start_date, end_date, progress_percentage, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    let originalTask;
    try {
        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found for update.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }

    // Validations (similar to create)
    if (!name || name.trim() === '') errors.push({ param: 'name', msg: 'Task Name is required.' });
    // ... other validations ...
    
    // Validate assigned_to_id (ensure it's a valid user ID and a member of the project or Admin)
    let numericAssignedToId = null;
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        numericAssignedToId = parseInt(assigned_to_id);
        if (isNaN(numericAssignedToId)) {
            errors.push({ param: 'assigned_to_id', msg: 'Invalid assigned user format.'});
        } else {
            const [memberCheck] = await db.query(
                "SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?",
                [projectId, numericAssignedToId]
            );
            if (memberCheck.length === 0) {
                const [userRoleCheck] = await db.query("SELECT role FROM users WHERE id = ?", [numericAssignedToId]);
                if (userRoleCheck.length === 0 || userRoleCheck[0].role !== 'Admin') {
                     errors.push({ param: 'assigned_to_id', msg: 'Assigned user is not a member of this project or an Admin.' });
                }
            }
        }
    }

    // Validate parent_task_id
    let numericParentTaskId = null;
    if (parent_task_id && parent_task_id.trim() !== '') {
        numericParentTaskId = parseInt(parent_task_id);
        if (isNaN(numericParentTaskId)) errors.push({ param: 'parent_task_id', msg: 'Invalid Parent Task ID format.' });
        else if (numericParentTaskId === parseInt(taskId)) errors.push({ param: 'parent_task_id', msg: 'A task cannot be its own parent.' });
        else {
            // Add check to prevent parent from being a child of current task (more complex, requires tree traversal)
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numericParentTaskId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ param: 'parent_task_id', msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }


    if (errors.length > 0) {
        const formDataError = { ...originalTask, ...req.body };
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const numProgress = progress_percentage ? parseInt(progress_percentage) : (originalTask.progress_percentage || 0);
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            progress_percentage: (numProgress >= 0 && numProgress <= 100) ? numProgress : (originalTask.progress_percentage || 0),
            status: status || originalTask.status,
            priority: priority || originalTask.priority,
            parent_task_id: numericParentTaskId,
            assigned_to_id: numericAssignedToId,
            updated_at: new Date()
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`); // Redirect to task details
    } catch (err) {
        console.error("Error updating task:", err);
        req.session.editTaskFormData = { ...originalTask, ...req.body };
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};

// ... (handleDeleteTask and showTaskDetails) ...


// Handle the deletion of a task
exports.handleDeleteTask = async (req, res, next) => {
    const { projectId, taskId } = req.params; // Permission checked by middleware

    try {
        // Check for sub-tasks: A task with children cannot be deleted directly.
        // ON DELETE CASCADE on parent_task_id will auto-delete children, but it's often better UX to prevent.
        const [subTasks] = await db.query('SELECT id FROM tasks WHERE parent_task_id = ?', [taskId]);
        if (subTasks.length > 0) {
            req.flash('error_msg', 'Cannot delete this task: it has sub-tasks. Please delete or reassign sub-tasks first.');
            return res.redirect(`/projects/${projectId}/details#task-${taskId}`);
        }
        
        // Check for dependencies if `task_dependencies` table is in use and ON DELETE CASCADE is not sufficient
        const [dependenciesExist] = await db.query(
            'SELECT id FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?', [taskId, taskId]
        );
        if (dependenciesExist.length > 0) {
            req.flash('error_msg', 'Cannot delete task: It is part of a dependency relationship. Please remove dependencies first.');
            return res.redirect(`/projects/${projectId}/details#task-${taskId}`);
        }


        const [result] = await db.query('DELETE FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);

        if (result.affectedRows === 0) {
            req.flash('error_msg', 'Task not found or could not be deleted.');
        } else {
            req.flash('success_msg', 'Task deleted successfully!');
        }
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    } catch (error) {
        console.error("Error deleting task:", error);
        req.flash('error_msg', 'An error occurred while deleting the task.');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    }
};

// @desc    Show details of a specific task, including its direct sub-tasks
// @route   GET /projects/:projectId/tasks/:taskId/details
// @access  Private (Access is validated by checkProjectAccess middleware before this controller is called)
exports.showTaskDetails = async (req, res, next) => {
  try {
    const { projectId, taskId } = req.params;

    // **Critical Check 1: Verify req.projectContext from middleware**
    // The checkProjectAccess middleware is responsible for:
    // 1. Validating user's permission to access projectId.
    // 2. Fetching the project document for projectId.
    // 3. Attaching this project document to req.projectContext.
    // If req.projectContext is not here, the middleware failed or was bypassed.
    if (!req.projectContext || !req.projectContext.id || req.projectContext.id.toString() !== projectId.toString()) {
        console.error(`TaskDetails Error: req.projectContext is missing or mismatched.`);
        console.error(`req.projectContext:`, req.projectContext);
        console.error(`Route projectId:`, projectId);
        req.flash('error_msg', 'Project context error. Unable to verify project details.');
        // If projectId is known, try redirecting to project details, otherwise dashboard
        return res.status(403).redirect(projectId ? `/projects/${projectId}/details` : '/dashboard');
    }
    const projectForContext = req.projectContext; // We trust this project object

    // **Critical Check 2: Verify taskId parameter**
    if (!taskId || isNaN(parseInt(taskId))) {
        req.flash('error_msg', 'Invalid Task ID provided.');
        return res.status(400).redirect(`/projects/${projectId}/details`);
    }
    const numericTaskId = parseInt(taskId);

    // 1. Fetch the main task, ensuring it belongs to the already validated project
    const mainTaskQuery = `
        SELECT
            t.*,
            DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted,
            DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted,
            DATE_FORMAT(t.created_at, '%M %d, %Y at %H:%i') as created_at_formatted,
            DATE_FORMAT(t.updated_at, '%M %d, %Y at %H:%i') as updated_at_formatted,
            COALESCE(u_creator.username, 'N/A') AS creator_username,
            COALESCE(TRIM(CONCAT(u_assignee.first_name, ' ', u_assignee.last_name)), u_assignee.username, 'Unassigned') AS assignee_display_name,
            parent.name as parent_task_name,
            parent.id as parent_task_id_val
        FROM tasks t
        LEFT JOIN users u_creator ON t.created_by_id = u_creator.id
        LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
        LEFT JOIN tasks parent ON t.parent_task_id = parent.id
        WHERE t.id = ? AND t.project_id = ?   
    `;
    const [taskRows] = await db.query(mainTaskQuery, [numericTaskId, projectForContext.id]); // Use projectForContext.id

    if (taskRows.length === 0) {
      req.flash('error_msg', 'Task not found within this project.');
      return res.redirect(`/projects/${projectForContext.id}/details`);
    }
    const mainTask = taskRows[0];

    // 2. Fetch direct children (sub-tasks) of the main task
    const subTasksQuery = `
        SELECT
            t.id, t.name, t.task_code, t.description, t.status, t.priority,
            DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted,
            DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted,
            t.progress_percentage, t.parent_task_id, t.task_order,
            COALESCE(TRIM(CONCAT(u_assignee.first_name, ' ', u_assignee.last_name)), u_assignee.username, 'Unassigned') AS assignee_display_name
        FROM tasks t
        LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
        WHERE t.project_id = ? AND t.parent_task_id = ?
        ORDER BY t.task_order ASC, t.created_at ASC
    `;
    const [subTaskRows] = await db.query(subTasksQuery, [projectForContext.id, numericTaskId]);
    mainTask.children = subTaskRows;

    res.render('tasks/details', {
      title: `Task: ${mainTask.name} - Avenircon`,
      pageTitle: `Task Details: ${mainTask.name}`,
      subTitle: `Project: ${projectForContext.name}`,
      project: projectForContext,
      task: mainTask,
      layout: './layouts/main_layout'
    });

  } catch (error) {
    console.error("Error in showTaskDetails controller:", error);
    // Generic error, but attempt to use projectId if available for redirect
    const routeProjectId = req.params.projectId || (req.projectContext ? req.projectContext.id : null);
    req.flash('error_msg', 'An unexpected error occurred while loading task details.');
    next(error); // Let global error handler deal with it, but flash message might not show if it renders a page.
                 // Or redirect: res.redirect(routeProjectId ? `/projects/${routeProjectId}/details` : '/dashboard');
  }
};

*/

/*

// Show page to edit an existing task
exports.showEditTaskForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const userId = req.session.user.id;

        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        const project = permissionResult.project;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        // Format dates for <input type="date">
        const formData = { ...task };
        if (formData.start_date) formData.start_date = new Date(formData.start_date).toISOString().split('T')[0];
        if (formData.end_date) formData.end_date = new Date(formData.end_date).toISOString().split('T')[0];
        
        let potentialParentTasks = [];
        try {
            const [tasksForProject] = await db.query( // Exclude current task and its children
                'SELECT id, name FROM tasks WHERE project_id = ? AND id != ? AND (parent_task_id != ? OR parent_task_id IS NULL) ORDER BY name ASC',
                [projectId, taskId, taskId]
            );
            potentialParentTasks = tasksForProject;
        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown in edit form:", fetchErr);
        }
        
        // Fetch users for assignee dropdown (e.g., all users, or project members)
        let assignableUsers = [];
        try {
            // TODO: Fetch project members or relevant users instead of all users
            const [users] = await db.query("SELECT id, username, first_name, last_name FROM users WHERE is_active = TRUE ORDER BY username ASC");
            assignableUsers = users.map(u => ({ id: u.id, display_name: `${u.first_name || ''} ${u.last_name || ''} (${u.username})`.trim() }));
        } catch (userFetchErr) {
            console.warn("Error fetching users for assignee dropdown:", userFetchErr);
        }


        res.render('tasks/edit', { // Ensure views/tasks/edit.ejs exists
            title: `Edit Task: ${task.name}`,
            pageTitle: `Edit Task: ${task.name}`,
            subTitle: `For Project: ${project.name}`,
            project: project,
            task: task, // Original task for context
            potentialParentTasks: potentialParentTasks,
            assignableUsers: assignableUsers,
            formData: req.session.editTaskFormData || formData, // PRG or formatted DB data
            errors: req.session.editTaskErrors || [],
            layout: './layouts/main_layout'   // << CORRECTED LAYOUT
        });
        delete req.session.editTaskFormData;
        delete req.session.editTaskErrors;
    } catch (error) {
        console.error("Error showing edit task form:", error);
        next(error);
    }
};

*/

/*
// Handle the submission of the task edit form
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const userId = req.session.user.id; // User performing the update
    const { name, task_code, description, start_date, end_date, cost, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    let project, originalTask;
    try {
        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        project = permissionResult.project;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }

    if (!name || name.trim() === '') errors.push({ msg: 'Task Name is required.' });
    // ... (other validations from handleCreateTask, adapted for update) ...
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ msg: 'Start Date cannot be after End Date.' });
    
    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ msg: 'Invalid task status selected.' });
    
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ msg: 'Invalid task priority selected.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        const numParentId = parseInt(parent_task_id);
        if (isNaN(numParentId)) {
            errors.push({ msg: 'Invalid Parent Task ID format.' });
        } else if (numParentId === parseInt(taskId)) {
            errors.push({ msg: 'A task cannot be its own parent.' });
        } else {
            // Further check: ensure parent_task_id is not a child of current taskId (prevent circular deps)
            // This requires a recursive check if deep nesting is allowed.
            // For simplicity, we'll assume a simple check is enough for now.
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numParentId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) {
            errors.push({msg: 'Invalid assigned user ID.'});
        } else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({msg: 'Assigned user does not exist.'});
        }
    }


    if (errors.length > 0) {
        const formDataError = { ...originalTask, ...req.body }; // Merge original with submitted
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null, 
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            cost: cost || null,
            status: status || 'ToDo',
            priority: priority || 'Medium',
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null,
            updated_at: new Date()
            // updated_by_id: userId // If you track who updated
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/details#task-${taskId}`); // Anchor to the task

    } catch (err) {
        console.error("Error updating task:", err);
        req.session.editTaskFormData = { ...originalTask, ...req.body };
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};

*/



/*
// Avenircon/controllers/taskController.js
const db = require('../config/db');

// Helper function to check project ownership/membership for task operations
// Ensures user has rights to the project before operating on its tasks
async function checkProjectAccessForTasks(projectId, userId) {
    if (!projectId || !userId) {
        return { error: 'Project ID and User ID are required for permission check.', status: 400, project: null };
    }
    const [projectRows] = await db.query('SELECT id, name, created_by_id, project_manager_id FROM projects WHERE id = ?', [projectId]);
    if (projectRows.length === 0) {
        return { error: 'Project not found.', status: 404, project: null };
    }
    const project = projectRows[0];
    // User has permission if they created the project, are the project manager, or an Admin.
    // TODO: Extend with project_members check later.
    if (project.created_by_id !== userId && project.project_manager_id !== userId && req.session.user.role !== 'Admin') {
        return { error: 'Permission denied to manage tasks for this project.', status: 403, project };
    }
    return { project }; // Return the project object on success
}

// Show form to create a new task for a specific project
exports.showCreateTaskForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const userId = req.session.user.id;

        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        const project = permissionResult.project;

        let potentialParentTasks = [];
        try {
            const [tasksForProject] = await db.query(
                'SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name ASC', [projectId]
            );
            potentialParentTasks = tasksForProject;
        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown:", fetchErr);
            // Non-critical, form can still be rendered
        }

        res.render('tasks/create', { // Ensure views/tasks/create.ejs exists
            title: `Add Task to: ${project.name}`,
            pageTitle: `Add New Task`,
            subTitle: `For Project: ${project.name}`,
            projectId: projectId,
            project_name: project.name, // Kept for compatibility if view uses it
            project: project, // Pass full project object
            potentialParentTasks: potentialParentTasks,
            formData: req.session.createTaskFormData || {},
            errors: req.session.createTaskErrors || [],
            layout: './layouts/main_layout',   // << CORRECTED LAYOUT
            parent_task_id_query: req.query.parent_task_id // For pre-selecting parent from query
        });
        delete req.session.createTaskFormData;
        delete req.session.createTaskErrors;
    } catch (error) {
        console.error('Error showing create task form:', error);
        next(error);
    }
};

// Handle the submission of the new task form
exports.handleCreateTask = async (req, res, next) => {
    const projectId = req.params.projectId;
    const userId = req.session.user.id;
    const { name, task_code, description, start_date, end_date, cost, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    let project;
    try {
        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            // Status 404 for project not found, 403 for permission denied
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        project = permissionResult.project;
    } catch(permError){
        return next(permError);
    }
    
    if (!name || name.trim() === '') errors.push({ msg: 'Task Name is required.' });
    if (name && name.length > 255) errors.push({ param: 'name', msg: 'Task name is too long.'});
    if (task_code && task_code.length > 50) errors.push({ param: 'task_code', msg: 'Task code is too long.'});

    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
        errors.push({ msg: 'Task Start Date cannot be after End Date.' });
    }
    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ msg: 'Invalid task status.' });
    
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ msg: 'Invalid task priority.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        if (isNaN(parseInt(parent_task_id))) {
            errors.push({ msg: 'Invalid Parent Task ID format.' });
        } else {
            const [parentTaskRows] = await db.query(
                'SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parseInt(parent_task_id), projectId]
            );
            if (parentTaskRows.length === 0) {
                errors.push({ msg: 'Selected Parent Task does not exist or does not belong to this project.' });
            }
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) {
            errors.push({msg: 'Invalid assigned user ID.'});
        } else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({msg: 'Assigned user does not exist.'});
        }
    }


    if (errors.length > 0) {
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }

    try {
        const newTask = {
            project_id: projectId,
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null,
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            cost: cost || null,
            status: status || 'ToDo',
            priority: priority || 'Medium',
            created_by_id: userId,
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null
        };

        await db.query('INSERT INTO tasks SET ?', newTask);
        req.flash('success_msg', 'Task created successfully!');
        res.redirect(`/projects/${projectId}/details#tasks-section`);

    } catch (error) {
        console.error('Error creating task:', error);
        req.session.createTaskFormData = req.body;
        req.session.createTaskErrors = [{ msg: 'Server error creating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/create${req.query.parent_task_id ? '?parent_task_id=' + req.query.parent_task_id : ''}`);
    }
};

// Service function: List tasks for a specific project (for project details page)
exports.listTasksForProject = async (projectId, userIdPerformingAction) => {
    // Permission to view tasks is tied to permission to view the project itself,
    // which should be checked by the calling controller (e.g., projectController.showProjectDetails).
    // userIdPerformingAction can be used for future task-specific visibility if needed.
    try {
        const query = `
            SELECT 
                t.id, t.name, t.description, t.status, t.priority, 
                DATE_FORMAT(t.start_date, '%Y-%m-%d') as start_date_formatted, 
                DATE_FORMAT(t.end_date, '%Y-%m-%d') as end_date_formatted,
                task_budget t.cost, t.parent_task_id, t.task_order,
                t.created_by_id, t.assigned_to_id,
                u_creator.username AS task_creator_username,
                u_assignee.username AS assignee_username,
                COALESCE(u_assignee.first_name, u_assignee.username) AS assignee_display_name 
            FROM tasks t
            LEFT JOIN users u_creator ON t.created_by_id = u_creator.id
            LEFT JOIN users u_assignee ON t.assigned_to_id = u_assignee.id
            WHERE t.project_id = ? 
            ORDER BY COALESCE(t.parent_task_id, t.id), t.task_order ASC, t.created_at ASC
        `; // Added assignee_display_name
        const [tasks] = await db.query(query, [projectId]);
        
        // Function to build task hierarchy
        const buildHierarchy = (taskList) => {
            const taskMap = {};
            const roots = [];
            taskList.forEach(task => {
                taskMap[task.id] = { ...task, children: [] };
            });
            taskList.forEach(task => {
                if (task.parent_task_id && taskMap[task.parent_task_id]) {
                    taskMap[task.parent_task_id].children.push(taskMap[task.id]);
                } else {
                    roots.push(taskMap[task.id]);
                }
            });
            // Sort children within each parent
            const sortChildrenRecursive = (nodes) => {
                nodes.sort((a, b) => (a.task_order || 0) - (b.task_order || 0) || a.name.localeCompare(b.name));
                nodes.forEach(node => {
                    if (node.children.length > 0) {
                        sortChildrenRecursive(node.children);
                    }
                });
            };
            sortChildrenRecursive(roots);
            return roots;
        };
        return buildHierarchy(tasks);
    } catch (error) {
        console.error(`Error fetching tasks for project ${projectId}:`, error);
        throw new Error('Failed to retrieve tasks for the project.');
    }
};
 

// Show page to edit an existing task
exports.showEditTaskForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const userId = req.session.user.id;

        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        const project = permissionResult.project;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        // Format dates for <input type="date">
        const formData = { ...task };
        if (formData.start_date) formData.start_date = new Date(formData.start_date).toISOString().split('T')[0];
        if (formData.end_date) formData.end_date = new Date(formData.end_date).toISOString().split('T')[0];
        
        let potentialParentTasks = [];
        try {
            const [tasksForProject] = await db.query( // Exclude current task and its children
                'SELECT id, name FROM tasks WHERE project_id = ? AND id != ? AND (parent_task_id != ? OR parent_task_id IS NULL) ORDER BY name ASC',
                [projectId, taskId, taskId]
            );
            potentialParentTasks = tasksForProject;
        } catch (fetchErr) {
            console.warn("Error fetching tasks for parent dropdown in edit form:", fetchErr);
        }
        
        // Fetch users for assignee dropdown (e.g., all users, or project members)
        let assignableUsers = [];
        try {
            // TODO: Fetch project members or relevant users instead of all users
            const [users] = await db.query("SELECT id, username, first_name, last_name FROM users WHERE is_active = TRUE ORDER BY username ASC");
            assignableUsers = users.map(u => ({ id: u.id, display_name: `${u.first_name || ''} ${u.last_name || ''} (${u.username})`.trim() }));
        } catch (userFetchErr) {
            console.warn("Error fetching users for assignee dropdown:", userFetchErr);
        }


        res.render('tasks/edit', { // Ensure views/tasks/edit.ejs exists
            title: `Edit Task: ${task.name}`,
            pageTitle: `Edit Task: ${task.name}`,
            subTitle: `For Project: ${project.name}`,
            project: project,
            task: task, // Original task for context
            potentialParentTasks: potentialParentTasks,
            assignableUsers: assignableUsers,
            formData: req.session.editTaskFormData || formData, // PRG or formatted DB data
            errors: req.session.editTaskErrors || [],
            layout: './layouts/main_layout'   // << CORRECTED LAYOUT
        });
        delete req.session.editTaskFormData;
        delete req.session.editTaskErrors;
    } catch (error) {
        console.error("Error showing edit task form:", error);
        next(error);
    }
};

// Handle the submission of the task edit form
exports.handleUpdateTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const userId = req.session.user.id; // User performing the update
    const { name, task_code, description, start_date, end_date, cost, status, priority, parent_task_id, assigned_to_id } = req.body;
    let errors = [];

    let project, originalTask;
    try {
        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        project = permissionResult.project;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        originalTask = taskRows[0];
    } catch (dbError) {
        return next(dbError);
    }

    if (!name || name.trim() === '') errors.push({ msg: 'Task Name is required.' });
    // ... (other validations from handleCreateTask, adapted for update) ...
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push({ msg: 'Start Date cannot be after End Date.' });
    
    const validStatuses = ['ToDo', 'InProgress', 'Completed', 'Blocked', 'Cancelled'];
    if (status && !validStatuses.includes(status)) errors.push({ msg: 'Invalid task status selected.' });
    
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) errors.push({ msg: 'Invalid task priority selected.' });

    if (parent_task_id && parent_task_id.trim() !== '') {
        const numParentId = parseInt(parent_task_id);
        if (isNaN(numParentId)) {
            errors.push({ msg: 'Invalid Parent Task ID format.' });
        } else if (numParentId === parseInt(taskId)) {
            errors.push({ msg: 'A task cannot be its own parent.' });
        } else {
            // Further check: ensure parent_task_id is not a child of current taskId (prevent circular deps)
            // This requires a recursive check if deep nesting is allowed.
            // For simplicity, we'll assume a simple check is enough for now.
            const [parentTaskRows] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [numParentId, projectId]);
            if (parentTaskRows.length === 0) errors.push({ msg: 'Selected Parent Task does not exist or belong to this project.' });
        }
    }
    if (assigned_to_id && assigned_to_id.trim() !== '') {
        if (isNaN(parseInt(assigned_to_id))) {
            errors.push({msg: 'Invalid assigned user ID.'});
        } else {
            const [userExist] = await db.query("SELECT id FROM users WHERE id = ?", [parseInt(assigned_to_id)]);
            if(userExist.length === 0) errors.push({msg: 'Assigned user does not exist.'});
        }
    }


    if (errors.length > 0) {
        const formDataError = { ...originalTask, ...req.body }; // Merge original with submitted
        if (formDataError.start_date) formDataError.start_date = new Date(formDataError.start_date).toISOString().split('T')[0];
        if (formDataError.end_date) formDataError.end_date = new Date(formDataError.end_date).toISOString().split('T')[0];
        
        req.session.editTaskFormData = formDataError;
        req.session.editTaskErrors = errors;
        return res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTaskData = {
            name: name.trim(),
            task_code: task_code ? task_code.trim() : null, 
            description: description ? description.trim() : null,
            start_date: start_date || null,
            end_date: end_date || null,
            cost: cost || null,
            status: status || 'ToDo',
            priority: priority || 'Medium',
            parent_task_id: (parent_task_id && parent_task_id.trim() !== '') ? parseInt(parent_task_id) : null,
            assigned_to_id: (assigned_to_id && assigned_to_id.trim() !== '') ? parseInt(assigned_to_id) : null,
            updated_at: new Date()
            // updated_by_id: userId // If you track who updated
        };

        await db.query('UPDATE tasks SET ? WHERE id = ? AND project_id = ?', [updatedTaskData, taskId, projectId]);
        req.flash('success_msg', 'Task updated successfully!');
        res.redirect(`/projects/${projectId}/details#task-${taskId}`); // Anchor to the task

    } catch (err) {
        console.error("Error updating task:", err);
        req.session.editTaskFormData = { ...originalTask, ...req.body };
        req.session.editTaskErrors = [{ msg: 'Server error updating task. Please try again.' }];
        res.redirect(`/projects/${projectId}/tasks/${taskId}/edit`);
    }
};

// Handle the deletion of a task
exports.handleDeleteTask = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const userId = req.session.user.id;

    try {
        const permissionResult = await checkProjectAccessForTasks(projectId, userId);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        
        const [subTasks] = await db.query('SELECT id FROM tasks WHERE parent_task_id = ?', [taskId]);
        if (subTasks.length > 0) {
            req.flash('error_msg', 'Cannot delete this task: it has sub-tasks. Please delete or reassign sub-tasks first.');
            return res.redirect(`/projects/${projectId}/details#task-${taskId}`);
        }

        // Also check for other dependencies if any (e.g., time entries, linked documents not via ON DELETE CASCADE)

        const [result] = await db.query('DELETE FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);

        if (result.affectedRows === 0) {
            req.flash('error_msg', 'Task not found or could not be deleted.');
        } else {
            req.flash('success_msg', 'Task deleted successfully!');
        }
        res.redirect(`/projects/${projectId}/details#tasks-section`);

    } catch (error) {
        console.error("Error deleting task:", error);
        req.flash('error_msg', 'An error occurred while deleting the task. It might be linked to other items or a server issue occurred.');
        res.redirect(`/projects/${projectId}/details#tasks-section`);
    }
};
*/