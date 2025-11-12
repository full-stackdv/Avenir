

// controllers/budgetController.js
const db = require('../config/db');

const BUDGET_MANAGE_ROLES = ['Project Manager', 'Admin'];
const BUDGET_ADD_LOG_ROLES = ['Project Manager', 'Site Supervisor', 'Admin'];
 const BUDGET_VIEW_ROLES = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Admin']; // For use in routes

//const PROJECT_PLANNED_BUDGET_COL = 'budget'; // From projects table
//const TASK_PLANNED_BUDGET_COL = 'task_budget'; // From tasks table
//const BUDGET_MANAGE_ROLES = ['Project Manager', 'Admin'];
//const BUDGET_ADD_LOG_ROLES = ['Project Manager', 'Site Supervisor', 'Admin'];
// const BUDGET_VIEW_ROLES = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Admin']; // For use in routes


// =================== PROJECT BUDGET ===================

// Show form to edit project's planned budget
exports.showProjectBudgetForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // From checkProjectAccess middleware

        if (!project) {
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        res.render('projects/budget/edit_project_budget', {
            title: `Manage Budget for ${project.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Project: ${project.name}`,
            project: project,
            formData: { budget: project.budget || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing project budget form:", error);
        next(error);
    }
};

// Handle update project's planned budget
exports.handleUpdateProjectBudget = async (req, res, next) => {
    const projectId = req.params.projectId;
    const project = req.projectContext;
    const { budget } = req.body;
    const userId = req.session.user.id;

    let errors = [];
    const budgetValue = parseFloat(budget);
    if (isNaN(budgetValue) || budgetValue < 0) {
        errors.push({ msg: 'Planned budget must be a valid non-negative number.' });
    }

    if (errors.length > 0) {
        return res.render('projects/budget/edit_project_budget', {
            title: `Manage Budget for ${project.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Project: ${project.name}`,
            project: project,
            formData: { budget },
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        await db.query('UPDATE projects SET budget = ?, updated_at = NOW() WHERE id = ?', [budgetValue, projectId]);
        req.flash('success_msg', 'Project planned budget updated successfully.');
        res.redirect(`/projects/${projectId}/details`);
    } catch (error) {
        console.error("Error updating project budget:", error);
        req.flash('error_msg', 'Error updating project budget. Please try again.');
        res.redirect(`/projects/${projectId}/budget/edit`);
    }
};

 
exports.handleAddProjectBudgetLogEntry = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { description, amount, entry_type, log_date, category, task_id } = req.body; // task_id can be null
    const created_by_id = req.session.user.id;
    let errors = [];

    // ... (your existing validation code) ...
    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type.toLowerCase())) errors.push({ msg: 'Invalid entry type. Must be Income or Expense.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });


    if (errors.length > 0) {
        const project = req.projectContext;
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);
        return res.render('projects/budget/create_log_entry', {
            // ... (your existing render code for errors) ...
            formData: req.body, // ensure all form data is passed back
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    const connection = await db.getConnection(); // Use connection for transaction
    try {
        await connection.beginTransaction();

        const newLogEntry = {
            project_id: projectId,
            task_id: task_id ? parseInt(task_id) : null,
            description: description.trim(),
            amount: parsedAmount, // Use parsedAmount
            entry_type: entry_type.toLowerCase(), // Store consistently
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await connection.query('INSERT INTO budget_logs SET ?', newLogEntry);

        // ---- START: Update actual_cost if it's an expense ----
        if (newLogEntry.entry_type === 'expense') {
            if (newLogEntry.task_id) {
                // Expense is for a specific task
                const [taskExpenseSumRows] = await connection.query(
                    "SELECT SUM(amount) as total_task_expenses FROM budget_logs WHERE task_id = ? AND entry_type = 'expense'",
                    [newLogEntry.task_id]
                );
                const taskActualCost = taskExpenseSumRows[0]?.total_task_expenses || 0;
                await connection.query("UPDATE tasks SET actual_cost = ? WHERE id = ?", [taskActualCost, newLogEntry.task_id]);
            } else {
                // Expense is project-level (task_id is NULL)
                const [projectExpenseSumRows] = await connection.query(
                    "SELECT SUM(amount) as total_project_expenses FROM budget_logs WHERE project_id = ? AND task_id IS NULL AND entry_type = 'expense'",
                    [newLogEntry.project_id]
                );
                const projectActualCost = projectExpenseSumRows[0]?.total_project_expenses || 0;
                await connection.query("UPDATE projects SET actual_cost = ? WHERE id = ?", [projectActualCost, newLogEntry.project_id]);
            }
        }
        // ---- END: Update actual_cost if it's an expense ----

        await connection.commit();
        req.flash('success_msg', 'Budget log entry added successfully.');
        // Redirect to project budget logs page if it was a project-level log or task was assigned from project log form
        // Or redirect to task budget logs if task_id was explicitly part of the route (see handleAddTaxBudgetLogEntry)
        res.redirect(`/projects/${projectId}/budget/logs`); 

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error adding budget log entry:", error);
        req.flash('error_msg', 'Error adding budget log entry. ' + error.message);
        const project = req.projectContext;
        const [tasksForForm] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]).catch(() => [[]]);
         res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project?.name || 'Project'}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project?.name || 'Unknown'}`,
            project: project,
            tasks: tasksForForm,
            formData: req.body,
            errors: [{ msg: 'Server error processing request.' }], // Generic error for render
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } finally {
        if (connection) connection.release();
    }
};
// Ensure aliases point to the updated function
exports.handleAddBudgetLogEntry = exports.handleAddProjectBudgetLogEntry;
exports.handleAddLogEntry = exports.handleAddProjectBudgetLogEntry;


// =================== PROJECT BUDGET LOGS ===================

// Show form to add a budget log entry for a project
exports.showAddProjectBudgetLogForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext;

        if (!project) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }
        
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);

        res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks, // For optional task assignment on project-level form
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add project budget log form:", error);
        next(error);
    }
};


// Handle adding a new budget log entry (can be project-level or task-level via this form)
exports.handleAddProjectBudgetLogEntry = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { description, amount, entry_type, log_date, category, task_id } = req.body; // task_id can be null
    const created_by_id = req.session.user.id;
    let errors = [];

    // ... (your existing validation code) ...
    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type.toLowerCase())) errors.push({ msg: 'Invalid entry type. Must be Income or Expense.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });


    if (errors.length > 0) {
        const project = req.projectContext;
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);
        return res.render('projects/budget/create_log_entry', {
            // ... (your existing render code for errors) ...
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
         //   formData: req.body, // ensure all form data is passed back
           // errors: errors,
           // layout: './layouts/main_layout'
        });
    }

    const connection = await db.getConnection(); // Use connection for transaction
    try {
        await connection.beginTransaction();

        const newLogEntry = {
            project_id: projectId,
            task_id: task_id ? parseInt(task_id) : null,
            description: description.trim(),
            amount: parsedAmount, // Use parsedAmount
            entry_type: entry_type.toLowerCase(), // Store consistently
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await connection.query('INSERT INTO budget_logs SET ?', newLogEntry);

        // ---- START: Update actual_cost if it's an expense ----
        if (newLogEntry.entry_type === 'expense') {
            if (newLogEntry.task_id) {
                // Expense is for a specific task
                const [taskExpenseSumRows] = await connection.query(
                    "SELECT SUM(amount) as total_task_expenses FROM budget_logs WHERE task_id = ? AND entry_type = 'expense'",
                    [newLogEntry.task_id]
                );
                const taskActualCost = taskExpenseSumRows[0]?.total_task_expenses || 0;
                await connection.query("UPDATE tasks SET actual_cost = ? WHERE id = ?", [taskActualCost, newLogEntry.task_id]);
            } else {
                // Expense is project-level (task_id is NULL)
                const [projectExpenseSumRows] = await connection.query(
                    "SELECT SUM(amount) as total_project_expenses FROM budget_logs WHERE project_id = ? AND task_id IS NULL AND entry_type = 'expense'",
                    [newLogEntry.project_id]
                );
                const projectActualCost = projectExpenseSumRows[0]?.total_project_expenses || 0;
                await connection.query("UPDATE projects SET actual_cost = ? WHERE id = ?", [projectActualCost, newLogEntry.project_id]);
            }
        }
        // ---- END: Update actual_cost if it's an expense ----

        await connection.commit();
        req.flash('success_msg', 'Budget log entry added successfully.');
        // Redirect to project budget logs page if it was a project-level log or task was assigned from project log form
        // Or redirect to task budget logs if task_id was explicitly part of the route (see handleAddTaxBudgetLogEntry)
        res.redirect(`/projects/${projectId}/budget/logs`); 

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error adding budget log entry:", error);
        req.flash('error_msg', 'Error adding budget log entry. ' + error.message);
        const project = req.projectContext;
        const [tasksForForm] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]).catch(() => [[]]);
         res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project?.name || 'Project'}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project?.name || 'Unknown'}`,
            project: project,
            tasks: tasksForForm,
            formData: req.body,
            errors: [{ msg: 'Server error processing request.' }], // Generic error for render
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } finally {
        if (connection) connection.release();
    }
};
// Ensure aliases point to the updated function
exports.handleAddBudgetLogEntry = exports.handleAddProjectBudgetLogEntry;
exports.handleAddLogEntry = exports.handleAddProjectBudgetLogEntry;

/*
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // Assumes this is correctly populated by your middleware

        if (!project) {
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        // Fetch all budget logs for the project, including linked task name and creator username
        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);

        let totalIncome = 0;
        let totalExpensesFromLogs = 0; // Sum of all 'expense' type logs for the project
        
        logs.forEach(log => {
            const amount = parseFloat(log.amount);
            if (isNaN(amount)) return; // Skip if amount is not a valid number

            if (log.entry_type === 'income') {
                totalIncome += amount;
            } else if (log.entry_type === 'expense') {
                totalExpensesFromLogs += amount;
            }
        });

        // 1. Planned Budget: This comes directly from the project record.
        //    Your projects table should have a 'budget' column for the overall planned budget.
        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;

        // 2. Total Income: Sum of all 'income' log entries. (Already calculated as totalIncome)

        // 3. Total Expenses (Actual Cost): Sum of all 'expense' log entries.
        //    This is what you've calculated as `totalExpensesFromLogs`.
        //    The EJS uses `actualCost` for this field.
        const actualCost = totalExpensesFromLogs;

        // 4. Variance: Planned Budget - Actual Cost
        const variance = plannedBudget - actualCost;

        // (Optional) 5. Net Actual (if needed for other purposes, not directly in the summary card as per EJS)
        //    This could be defined in various ways, e.g., (Total Income - Total Expenses)
        //    or (Planned Budget + Total Income - Total Expenses)
        //    Let's calculate it as (Total Income - Total Expenses) for now if you need a "Net Cash Flow" type figure.
        const netActualFlow = totalIncome - actualCost;


        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            // Summary figures passed to the EJS:
            plannedBudget: plannedBudget,       // For "Planned Budget"
            totalIncome: totalIncome,           // For "Total Income"
            // totalExpenses: totalExpensesFromLogs, // You can pass this if you need it separately, but EJS uses actualCost
            actualCost: actualCost,             // For "Total Expenses (Actual Cost)"
            netActual: netActualFlow,           // (Optional) If you want to use netActual somewhere
            variance: variance,                 // For "Variance (Planned - Actual Cost)"
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project budget logs:", error);
        next(error);
    }
};
*/
// controllers/budgetController.js

// ... (other functions and imports) ...
/*
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        
        const projectId = req.params.projectId;
        // req.projectContext should be populated by a middleware (e.g., checkProjectAccess)
        // It should contain the full project object, including project.budget
        const project = req.projectContext; 

        // Debug: Check the project object being received
        // console.log('Project Context in listProjectBudgetLogs:', JSON.stringify(project, null, 2));

        if (!project || !project.id) { // Add a check for project.id as well
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        // Fetch ALL budget logs for this project_id.
        // This includes logs directly against the project (task_id IS NULL)
        // AND logs against specific tasks within this project (task_id IS NOT NULL).
        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);

        console.log('--- Project Data for Budget Summary ---');
console.log('Project ID:', projectId);
console.log('Project Object (from req.projectContext):', JSON.stringify(project, null, 2));

        let totalIncome = 0;
        let totalExpensesFromLogs = 0; 
        
        logs.forEach(log => {
            const amount = parseFloat(log.amount);
            if (isNaN(amount)) {
                console.warn(`Invalid amount found in budget log ID ${log.id}: ${log.amount}`);
                return; 
            }

            if (log.entry_type === 'income') {
                totalIncome += amount;
            } else if (log.entry_type === 'expense') {
                totalExpensesFromLogs += amount;
            }
        });

        // 1. Planned Budget FOR THE ENTIRE PROJECT
        // This value comes from the 'projects' table, specifically the 'budget' column.
        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;
        // console.log(`Project Planned Budget (from project.budget): ${plannedBudget}`); // Debug

        // 2. Total Income FOR THE ENTIRE PROJECT (sum of all income logs for this project_id)
        // console.log(`Total Income (sum of income logs): ${totalIncome}`); // Debug

        // 3. Actual Cost FOR THE ENTIRE PROJECT (sum of all expense logs for this project_id)
        const actualCost = totalExpensesFromLogs;
        // console.log(`Actual Cost (sum of expense logs): ${actualCost}`); // Debug

        // 4. Variance FOR THE ENTIRE PROJECT
        const variance = plannedBudget - actualCost;
        // console.log(`Variance: ${variance}`); // Debug
        
        // (Optional) Net Actual Flow
        const netActualFlow = totalIncome - actualCost;

        res.render('projects/budget/list_logs', { // This is views/projects/budget/list_logs.ejs
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project, // Pass the full project object
            logs: logs,       // Pass the detailed logs
            // Summary figures for the EJS:
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            actualCost: actualCost, 
            netActual: netActualFlow, // If you decide to use it
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error(`Error listing project budget logs for project ID ${req.params.projectId}:`, error);
        next(error);
    }
};

*/

// controllers/budgetController.js

exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; 

        // --- Existing Debug from your output ---
        //console.log('--- Project Data for Budget Summary (Start of Function) ---');
        //console.log('Project ID:', projectId);
        //console.log('Project Object (from req.projectContext):', JSON.stringify(project, null, 2));
        // --- End of Existing Debug ---

        if (!project || !project.id) {
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);

        // --- NEW DEBUG: Inspect the raw logs fetched ---
        // ...
        //console.log(`--- Raw Budget Logs Fetched for Project ID ${projectId} ---`);
        //console.log('Number of logs found:', logs.length);
        // console.log(JSON.stringify(logs, null, 2)); // You can still use this for a full dump if needed

        let totalIncome = 0;
        let totalExpensesFromLogs = 0; 
        
        logs.forEach((log, index) => {
            const amount = parseFloat(log.amount);

            if (isNaN(amount)) {
                console.warn(`Invalid amount in log ID ${log.id} (Project ${projectId}): '${log.amount}'. Skipping.`);
                return; 
            }

            // Clean the entry_type for robust comparison
            const entryTypeCleaned = log.entry_type ? log.entry_type.toLowerCase().trim() : '';

            if (entryTypeCleaned === 'income') {
                totalIncome += amount;
            } else if (entryTypeCleaned === 'expense') {
                totalExpensesFromLogs += amount;
            } 
            // else: Other entry_types are ignored for these sums
        });

        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;
        const actualCost = totalExpensesFromLogs; // This is the sum of 'expense' logs
        const variance = plannedBudget - actualCost;
        const netActualFlow = totalIncome - actualCost; // Optional

        
        /*
        let totalIncome = 0;
        let totalExpensesFromLogs = 0; 
        
        logs.forEach((log, index) => {
            // --- UNCOMMENT AND EXPAND THIS DEBUG LINE ---
            console.log(`Log[${index}]: ID=${log.id}, Type='${log.entry_type}', Raw Amount='${log.amount}'`); 

            const amount = parseFloat(log.amount);
            // console.log(`Log[${index}]: Parsed Amount=${amount}`); // Also useful to see the parsed result

            if (isNaN(amount)) {
                console.warn(`Invalid amount in log ID ${log.id} (Project ${projectId}): '${log.amount}'. Skipping.`);
                return; 
            }

            // --- OPTIONAL: Check entry_type before comparison ---
            // console.log(`Log[${index}]: Comparing '${log.entry_type ? log.entry_type.toLowerCase().trim() : null}' with 'income' and 'expense'`);

            // Make the comparison more robust to whitespace and case for existing data:
            const entryTypeCleaned = log.entry_type ? log.entry_type.toLowerCase().trim() : '';

            if (entryTypeCleaned === 'income') {
                totalIncome += amount;
                // console.log(`Log[${index}]: Added to income. Current totalIncome: ${totalIncome}`);
            } else if (entryTypeCleaned === 'expense') {
                totalExpensesFromLogs += amount;
                // console.log(`Log[${index}]: Added to expenses. Current totalExpensesFromLogs: ${totalExpensesFromLogs}`);
            } else {
                // console.log(`Log[${index}]: Type '${log.entry_type}' not 'income' or 'expense'. Ignored for sum.`);
            }
        });

  /*      
        console.log(`--- Raw Budget Logs Fetched for Project ID ${projectId} ---`);
        console.log('Number of logs found:', logs.length);
        // console.log(JSON.stringify(logs, null, 2)); // Uncomment this if you want to see all log data

        let totalIncome = 0;
        let totalExpensesFromLogs = 0; 
        
        logs.forEach((log, index) => {
            const amount = parseFloat(log.amount);
            // --- NEW DEBUG: Inside the loop ---
            // console.log(`Log[${index}]: ID=${log.id}, Type=${log.entry_type}, Raw Amount=${log.amount}, Parsed Amount=${amount}`);

            if (isNaN(amount)) {
                console.warn(`Invalid amount in log ID ${log.id} (Project ${projectId}): '${log.amount}'. Skipping.`);
                return; 
            }

            if (log.entry_type === 'income') {
                totalIncome += amount;
            } else if (log.entry_type === 'expense') {
                totalExpensesFromLogs += amount;
            }
        });

        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;
        const actualCost = totalExpensesFromLogs;
        const variance = plannedBudget - actualCost;
        const netActualFlow = totalIncome - actualCost;
*/
        // --- NEW DEBUG: Calculated Summary Values ---
        //console.log('--- Calculated Summary Values ---');
        //console.log(`Project Planned Budget (from project.budget): ${plannedBudget}`);
        //console.log(`Total Income (sum of income logs): ${totalIncome}`);
        //console.log(`Actual Cost (sum of expense logs - totalExpensesFromLogs): ${actualCost}`);
        //console.log(`Variance (Planned - Actual): ${variance}`);
        //console.log(`Net Actual Flow (Income - Actual Cost): ${netActualFlow}`);
        // --- End of New Debug ---

        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,       
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            actualCost: actualCost, 
            netActual: netActualFlow,
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error(`Error listing project budget logs for project ID ${req.params.projectId}:`, error);
        next(error);
    }
};

// Show form to edit task's planned budget
exports.showTaskBudgetForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            // Ensure formData uses the correct key for the EJS template
            formData: req.session.editTaskBudgetFormData || { task_budget: task.task_budget || '' }, // Use task_budget
            errors: req.session.editTaskBudgetErrors || [], // Assuming you store errors under these session keys
            layout: './layouts/main_layout'
        });
        // Clear session data after use
        delete req.session.editTaskBudgetFormData;
        delete req.session.editTaskBudgetErrors;

    } catch (error) {
        console.error("Error showing task budget form:", error);
        next(error);
    }
};


// Handle update task's planned budget
exports.handleUpdateTaskBudget = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const project = req.projectContext;
    const { task_budget } = req.body;
    
    let errors = [];
    const budgetValue = parseFloat(task_budget);
    if (isNaN(budgetValue) || budgetValue < 0) {
        errors.push({ msg: 'Planned budget must be a valid non-negative number.' });
    }
    
    if (errors.length > 0) {
    const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]); // THIS IS THE LIKELY LINE 632
    const task = taskRows[0] || {id: taskId, name: "Unknown Task", project_id: projectId}; 
    req.session.editTaskBudgetFormData = { task_budget }; 
    req.session.editTaskBudgetErrors = errors;
    return res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/edit`); 


    //if (errors.length > 0) {
      //  const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        //const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        /*return res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: { task_budget },
            errors: errors,
            layout: './layouts/main_layout'
        });*/
    }

    try {
        await db.query('UPDATE tasks SET task_budget = ?, updated_at = NOW() WHERE id = ? AND project_id = ?', [budgetValue, taskId, projectId]);
        req.flash('success_msg', 'Task planned budget updated successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`);
    } catch (error) {
        console.error("Error updating task budget:", error);
        req.flash('error_msg', 'Error updating task budget. Please try again.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/edit`);
    }
};


// =================== TASK BUDGET LOGS ===================

// Show form to add a budget log entry specifically for a task
exports.showAddTaskBudgetLogForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT id, name FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add task budget log form:", error);
        next(error);
    }
};

// Corrected name: handleAddTaskBudgetLogEntry
exports.handleAddTaxBudgetLogEntry = async (req, res, next) => { // Keep your original name if routes depend on it, but consider renaming
    const { projectId, taskId } = req.params; // projectId available from route
    const { description, amount, entry_type, log_date, category } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    // ... (your existing validation code, similar to handleAddProjectBudgetLogEntry) ...
    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type.toLowerCase())) errors.push({ msg: 'Invalid entry type. Must be Income or Expense.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });


    if (errors.length > 0) {
        const project = req.projectContext; // Assumes projectContext is available or fetched
        const [taskRows] = await db.query('SELECT id, name FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
            // ... (your existing render code for errors) ...
             //formData: req.body,
             //errors: errors,
        });
    }
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const newLogEntry = {
            project_id: parseInt(projectId), // Ensure projectId is number
            task_id: parseInt(taskId),       // Task-specific log
            description: description.trim(),
            amount: parsedAmount,
            entry_type: entry_type.toLowerCase(),
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await connection.query('INSERT INTO budget_logs SET ?', newLogEntry);

        // ---- START: Update task's actual_cost if it's an expense ----
        if (newLogEntry.entry_type === 'expense') {
            const [taskExpenseSumRows] = await connection.query(
                "SELECT SUM(amount) as total_task_expenses FROM budget_logs WHERE task_id = ? AND entry_type = 'expense'",
                [newLogEntry.task_id]
            );
            const taskActualCost = taskExpenseSumRows[0]?.total_task_expenses || 0;
            await connection.query("UPDATE tasks SET actual_cost = ? WHERE id = ?", [taskActualCost, newLogEntry.task_id]);
        }
        // ---- END: Update task's actual_cost if it's an expense ----
        
        await connection.commit();
        req.flash('success_msg', 'Task budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/logs`); // Redirect to task's budget log
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error adding task budget log entry:", error);
        req.flash('error_msg', 'Error adding task budget log entry. ' + error.message);
        // Repopulate form on error
        const project = req.projectContext;
        const [taskRows] = await db.query('SELECT id, name FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]).catch(() => [[{id: taskId, name: "Unknown Task"}]]);
        const task = taskRows[0];
         res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task?.name || 'Task'}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task?.name || 'Unknown'} (Project: ${project?.name || 'Unknown'})`,
            project: project,
            task: task,
            formData: req.body,
            errors: [{ msg: 'Server error processing request.' }],
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } finally {
        if (connection) connection.release();
    }
};


// List all budget logs for a specific task
exports.listTaskBudgetLogs = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const [logs] = await db.query(`
            SELECT bl.*, u.username as creator_username
            FROM budget_logs bl
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? AND bl.task_id = ?
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId, taskId]);

        let totalIncome = 0;
        let totalExpenses = 0;
        logs.forEach(log => {
            const amount = parseFloat(log.amount);
            if (isNaN(amount)) return; // Skip invalid amounts

            const entryTypeCleaned = log.entry_type ? log.entry_type.toLowerCase() : ''; // Convert to lowercase for comparison

            if (entryTypeCleaned === 'income') {
                totalIncome += amount;
            } else if (entryTypeCleaned === 'expense') { // Be explicit for expenses
                totalExpenses += amount;
            }
            // Other types like 'budget allocation' would be ignored here
        });

        const plannedBudget = task.task_budget ? parseFloat(task.task_budget) : 0;
        const actualCost = totalExpenses;
        const variance = plannedBudget - actualCost;

        res.render('tasks/budget/list_logs', {
            title: `Budget Logs for Task: ${task.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            logs: logs,
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses, // This is actualCost for display
            actualCost: actualCost,       // Pass it explicitly
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing task budget logs:", error);
        next(error);
    }
};


// Helper function to get project budget summary  
exports.getProjectBudgetSummary = async (projectId) => {
    const [projectRows] = await db.query('SELECT budget FROM projects WHERE id = ?', [projectId]);
    const budget = projectRows.length > 0 && projectRows[0].budget ? parseFloat(projectRows[0].budget) : 0;

    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE project_id = ?`,
        [projectId]
    );
    
    const total_income = logSummary.length > 0 && logSummary[0].total_income ? parseFloat(logSummary[0].total_income) : 0;
    const actual_cost = logSummary.length > 0 && logSummary[0].total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const variance = budget - actual_cost;

    return {
        budget,
        total_income,
        actual_cost,
        variance
    };
};

// Helper function to get task budget summary (can be used by taskController)
exports.getTaskBudgetSummary = async (taskId) => {
    const [taskRows] = await db.query('SELECT task_budget FROM tasks WHERE id = ?', [taskId]);
    const task_budget = taskRows.length > 0 && taskRows[0].task_budget ? parseFloat(taskRows[0].task_budget) : 0;

    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE task_id = ?`,
        [taskId]
    );

    const total_income = logSummary.length > 0 && logSummary[0].total_income ? parseFloat(logSummary[0].total_income) : 0;
    const actual_cost = logSummary.length > 0 && logSummary[0].total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const variance = task_budget - actual_cost;
    
    return {
        task_budget,
        total_income,
        actual_cost,
        variance
    };
};



/*
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // From checkProjectAccess middleware

        if (!project) { // Should be caught by middleware, but good check
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);

        let totalIncome = 0;
        let totalExpenses = 0; // This will be the "Actual Cost" for display on this page
        
        logs.forEach(log => {
            // Ensure amounts are numbers
            const amount = parseFloat(log.amount);
            if (isNaN(amount)) return; // Skip if amount is not a valid number

            if (log.entry_type === 'income') {
                totalIncome += amount;
            } else if (log.entry_type === 'expense') { // Be explicit for expenses
                totalExpenses += amount;
            }
            // Logs with other entry_types (e.g., 'Budget Allocation') will be ignored in this summary
        });

        // Use project.budget (which is the planned budget from projects table)
        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;
        // actualCost for this summary page is the sum of all 'expense' logs for the project (incl. tasks)
        const actualCost = totalExpenses; 
        const variance = plannedBudget - actualCost;

        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses, // This is used for "Total Expenses (Actual Cost)" display
            actualCost: actualCost,       // Explicitly pass actualCost
            // netActual: netActual, // You had netActual, if needed, calculate as (plannedBudget + totalIncome) - totalExpenses;
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project budget logs:", error);
        next(error);
    }
};

*/

// ...


/*
// Handle adding a new budget log entry (can be project-level or task-level via this form)
exports.handleAddProjectBudgetLogEntry = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { description, amount, entry_type, log_date, category, task_id } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });
    // Add more validation as needed

    if (errors.length > 0) {
        const project = req.projectContext;
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);
        return res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: task_id ? parseInt(task_id) : null,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/budget/logs`);
    } catch (error) {
        console.error("Error adding budget log entry:", error);
        req.flash('error_msg', 'Error adding budget log entry.');
        // Consider repopulating form correctly on error
        res.redirect(`/projects/${projectId}/budget/log/add${task_id ? '?taskId=' + task_id : ''}`);
    }
};

*/
// controllers/budgetController.js
// ... (other code) ...

/*
// List all budget logs for a project (including task-specific ones)
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext;

        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);

        let totalIncome = 0;
        let totalExpenses = 0;
        logs.forEach(log => {
            if (log.entry_type === 'income') {
                totalIncome += parseFloat(log.amount);
            } else {
                totalExpenses += parseFloat(log.amount);
            }
        });

        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;
        const netActual = totalIncome - totalExpenses; // More like "Net Cash Flow from logs"
        const actualCost = totalExpenses; // Standard definition of actual cost
        const variance = plannedBudget - actualCost;

        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            actualCost: actualCost,
            netActual: netActual,
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project budget logs:", error);
        next(error);
    }
};
*/

// controllers/budgetController.js
// ...


// =================== TASK BUDGET ===================
/*
// Show form to edit task's planned budget
exports.showTaskBudgetForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: { task_budget: task.budget || '' },
            //formData: { taskbudget: task_budget || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing task budget form:", error);
        next(error);
    }
};

*/
// controllers/budgetController.js



/*
// Handle adding a new budget log entry for a task
exports.handleAddTaxBudgetLogEntry = async (req, res, next) => { // Renamed handleAddTaskBudgetLogEntry
    const { projectId, taskId } = req.params;
    const { description, amount, entry_type, log_date, category } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });

    if (errors.length > 0) {
        const project = req.projectContext;
        const [taskRows] = await db.query('SELECT id, name FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: taskId,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Task budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/logs`);
    } catch (error) {
        console.error("Error adding task budget log entry:", error);
        req.flash('error_msg', 'Error adding task budget log entry.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/log/add`);
    }
};
exports.handleAddBudgetLogEntry = exports.handleAddProjectBudgetLogEntry; // Alias for clarity if called from project context for a task
exports.handleAddLogEntry = exports.handleAddProjectBudgetLogEntry; // Generic alias


*/
// controllers/budgetController.js
// ...


/*
// List all budget logs for a specific task
exports.listTaskBudgetLogs = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const [logs] = await db.query(`
            SELECT bl.*, u.username as creator_username
            FROM budget_logs bl
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? AND bl.task_id = ?
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId, taskId]);

        let totalIncome = 0;
        let totalExpenses = 0;
        logs.forEach(log => {
            if (log.entry_type === 'income') {
                totalIncome += parseFloat(log.amount);
            } else {
                totalExpenses += parseFloat(log.amount);
            }
        });

        const plannedBudget = task.task_budget ? parseFloat(task.task_budget) : 0;
        const actualCost = totalExpenses;
        const variance = plannedBudget - actualCost;

        res.render('tasks/budget/list_logs', {
            title: `Budget Logs for Task: ${task.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            logs: logs,
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            actualCost: actualCost,
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing task budget logs:", error);
        next(error);
    }
};

*/

// controllers/budgetController.js



/*
// controllers/budgetController.js
const db = require('../config/db');

// Database column names used for planned/estimated budgets
//const PROJECT_PLANNED_BUDGET_COL = 'budget'; // From projects table
//const TASK_PLANNED_BUDGET_COL = 'task_budget'; // From tasks table
//const BUDGET_MANAGE_ROLES = ['Project Manager', 'Admin'];
//const BUDGET_ADD_LOG_ROLES = ['Project Manager', 'Site Supervisor', 'Admin'];
// const BUDGET_VIEW_ROLES = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Admin']; // For use in routes

// =================== PROJECT BUDGET ===================

// Show form to edit project's budget (projects.budget)
exports.showProjectBudgetForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // From checkProjectAccess middleware

        if (!project) {
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        res.render('projects/budget/edit_project_budget', {
            title: `Manage Budget for ${project.name}`,
            pageTitle: `Manage Project Budget`,
            subTitle: `Project: ${project.name}`,
            project: project,
            // The form input will be named 'project_budget' for clarity in this specific form
            formData: { project_budget: project[PROJECT_PLANNED_BUDGET_COL] || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing project budget form:", error);
        next(error);
    }
};

// Handle update project's budget (projects.budget)
exports.handleUpdateProjectBudget = async (req, res, next) => {
    const projectId = req.params.projectId;
    // The form input is expected to be 'project_budget'
    const { project_budget } = req.body;

    let errors = [];
    let budgetValue = null; // Default to null if empty
    if (project_budget && project_budget.trim() !== '') {
        const parsedVal = parseFloat(project_budget);
        if (isNaN(parsedVal) || parsedVal < 0) {
            errors.push({ msg: 'Project budget must be a valid non-negative number.' });
        } else {
            budgetValue = parsedVal;
        }
    }

    if (errors.length > 0) {
        const project = req.projectContext; // Need project for re-rendering
        return res.render('projects/budget/edit_project_budget', {
            title: `Manage Budget for ${project.name}`,
            pageTitle: `Manage Project Budget`,
            subTitle: `Project: ${project.name}`,
            project: project,
            formData: { project_budget }, // Repopulate form with submitted value
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        // Update the PROJECT_PLANNED_BUDGET_COL ('budget') in 'projects' table
        await db.query(`UPDATE projects SET ${PROJECT_PLANNED_BUDGET_COL} = ?, updated_at = NOW() WHERE id = ?`, [budgetValue, projectId]);
        req.flash('success_msg', 'Project budget updated successfully.');
        res.redirect(`/projects/${projectId}/details`);
    } catch (error) {
        console.error("Error updating project budget:", error);
        req.flash('error_msg', 'Error updating project budget. Please try again.');
        res.redirect(`/projects/${projectId}/budget/edit`);
    }
};

// =================== PROJECT BUDGET LOGS ===================
// showAddProjectBudgetLogForm and handleAddProjectBudgetLogEntry remain the same.

exports.showAddProjectBudgetLogForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext;

        if (!project) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }
        
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);

        res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add project budget log form:", error);
        next(error);
    }
};

exports.handleAddProjectBudgetLogEntry = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { description, amount, entry_type, log_date, category, task_id } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });

    if (errors.length > 0) {
        const project = req.projectContext;
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);
        return res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: task_id ? parseInt(task_id) : null,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/budget/logs`);
    } catch (error) {
        console.error("Error adding budget log entry:", error);
        req.flash('error_msg', 'Error adding budget log entry.');
        res.redirect(`/projects/${projectId}/budget/log/add${task_id ? '?taskId=' + task_id : ''}`);
    }
};


// List all budget logs for a project
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        // Fetch project, ensuring 'budget' column is included
        const [projectRows] = await db.query(`SELECT id, name, ${PROJECT_PLANNED_BUDGET_COL} FROM projects WHERE id = ?`, [projectId]);
        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }
        const project = projectRows[0];

        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);
        
        const summary = await exports.getProjectBudgetSummary(projectId); // This uses projects.budget

        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project, // Pass the fetched project object
            logs: logs,
            plannedBudget: summary.planned_budget, // From summary, which uses projects.budget
            totalIncome: summary.total_income,
            totalExpenses: summary.actual_cost,
            actualCost: summary.actual_cost,
            variance: summary.variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project budget logs:", error);
        next(error);
    }
};


// =================== TASK BUDGET (Refers to tasks.task_budget) ===================

// Show form to edit task's budget (tasks.task_budget)
exports.showTaskBudgetForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Task Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            // Form input will be named 'task_budget'
            formData: { task_budget: task[TASK_PLANNED_BUDGET_COL] || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing task budget form:", error);
        next(error);
    }
};

// Handle update task's budget (tasks.task_budget)
exports.handleUpdateTaskBudget = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    // Form input is 'task_budget'
    const { task_budget } = req.body;
    
    let errors = [];
    let budgetValue = null; // Default to null if empty
    if (task_budget && task_budget.trim() !== '') {
        const parsedVal = parseFloat(task_budget);
        if (isNaN(parsedVal) || parsedVal < 0) {
            errors.push({ msg: 'Task budget must be a valid non-negative number.' });
        } else {
            budgetValue = parsedVal;
        }
    }

    if (errors.length > 0) {
        const project = req.projectContext;
        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Task Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: { task_budget }, // Repopulate with submitted 'task_budget'
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        // Update TASK_PLANNED_BUDGET_COL ('task_budget') in 'tasks' table
        await db.query(`UPDATE tasks SET ${TASK_PLANNED_BUDGET_COL} = ?, updated_at = NOW() WHERE id = ? AND project_id = ?`, [budgetValue, taskId, projectId]);
        req.flash('success_msg', 'Task budget updated successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`);
    } catch (error) {
        console.error("Error updating task budget:", error);
        req.flash('error_msg', 'Error updating task budget. Please try again.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/edit`);
    }
};


// =================== TASK BUDGET LOGS ===================
// showAddTaskBudgetLogForm remains the same.
// handleAddTaskBudgetLogEntry (previously handleAddTaxBudgetLogEntry) remains the same.

exports.showAddTaskBudgetLogForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add task budget log form:", error);
        next(error);
    }
};

exports.handleAddTaskBudgetLogEntry = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { description, amount, entry_type, log_date, category } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });

    if (errors.length > 0) {
        const project = req.projectContext;
        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: taskId,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Task budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/logs`);
    } catch (error) {
        console.error("Error adding task budget log entry:", error);
        req.flash('error_msg', 'Error adding task budget log entry.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/log/add`);
    }
};
// Aliases can be removed if not used
// exports.handleAddBudgetLogEntry = exports.handleAddProjectBudgetLogEntry;
// exports.handleAddLogEntry = exports.handleAddProjectBudgetLogEntry;


// List all budget logs for a specific task
exports.listTaskBudgetLogs = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const [logs] = await db.query(`
            SELECT bl.*, u.username as creator_username
            FROM budget_logs bl
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? AND bl.task_id = ?
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId, taskId]);

        const summary = await exports.getTaskBudgetSummary(taskId); // This uses tasks.task_budget

        res.render('tasks/budget/list_logs', {
            title: `Budget Logs for Task: ${task.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            logs: logs,
            plannedBudget: summary.planned_budget, // From tasks.task_budget via summary
            totalIncome: summary.total_income,
            totalExpenses: summary.actual_cost,
            actualCost: summary.actual_cost,
            variance: summary.variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing task budget logs:", error);
        next(error);
    }
};

// =================== HELPER FUNCTIONS FOR BUDGET SUMMARIES ===================

// Helper function to get project budget summary
exports.getProjectBudgetSummary = async (projectId) => {
    // 1. Get Project's Planned Budget (from projects.budget)
    const [projectRows] = await db.query(
        `SELECT ${PROJECT_PLANNED_BUDGET_COL} FROM projects WHERE id = ?`,
        [projectId]
    );
    const projectPlannedBudget = projectRows.length > 0 && projectRows[0][PROJECT_PLANNED_BUDGET_COL]
        ? parseFloat(projectRows[0][PROJECT_PLANNED_BUDGET_COL])
        : 0;

    // 2. Calculate Total Project Income and Total Project Actual Cost (Expenses)
    //    This includes ALL budget_logs for the project_id (both project-level and task-level).
    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE project_id = ?`, // All logs for this project
        [projectId]
    );
    
    const totalProjectIncome = logSummary[0]?.total_income ? parseFloat(logSummary[0].total_income) : 0;
    const totalProjectActualCost = logSummary[0]?.total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const projectVariance = projectPlannedBudget - totalProjectActualCost;

    return {
        planned_budget: projectPlannedBudget,
        total_income: totalProjectIncome,
        actual_cost: totalProjectActualCost,
        variance: projectVariance
    };
};

// Helper function to get task budget summary
exports.getTaskBudgetSummary = async (taskId) => {
    // 1. Get Task's Planned Budget (from tasks.task_budget)
    const [taskRows] = await db.query(
        `SELECT ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ?`,
        [taskId]
    );
    const taskPlannedBudget = taskRows.length > 0 && taskRows[0][TASK_PLANNED_BUDGET_COL]
        ? parseFloat(taskRows[0][TASK_PLANNED_BUDGET_COL])
        : 0;

    // 2. Get income and expenses specifically for this task from budget_logs
    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE task_id = ?`, // Only logs linked to this task_id
        [taskId]
    );

    const taskTotalIncome = logSummary[0]?.total_income ? parseFloat(logSummary[0].total_income) : 0;
    const taskActualCost = logSummary[0]?.total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const taskVariance = taskPlannedBudget - taskActualCost;
    
    return {
        planned_budget: taskPlannedBudget,
        total_income: taskTotalIncome,
        actual_cost: taskActualCost,
        variance: taskVariance
    };
};


/*
// controllers/budgetController.js
const db = require('../config/db');

const BUDGET_MANAGE_ROLES = ['Project Manager', 'Admin'];
const BUDGET_ADD_LOG_ROLES = ['Project Manager', 'Site Supervisor', 'Admin'];
// const BUDGET_VIEW_ROLES = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Admin']; // For use in routes


// =================== PROJECT BUDGET ===================

// Show form to edit project's planned budget
exports.showProjectBudgetForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // From checkProjectAccess middleware

        if (!project) {
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        res.render('projects/budget/edit_project_budget', {
            title: `Manage Budget for ${project.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Project: ${project.name}`,
            project: project,
            formData: { budget: project.budget || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing project budget form:", error);
        next(error);
    }
};

// Handle update project's planned budget
exports.handleUpdateProjectBudget = async (req, res, next) => {
    const projectId = req.params.projectId;
    const project = req.projectContext;
    const { budget } = req.body;
    const userId = req.session.user.id;

    let errors = [];
    const budgetValue = parseFloat(budget);
    if (isNaN(budgetValue) || budgetValue < 0) {
        errors.push({ msg: 'Planned budget must be a valid non-negative number.' });
    }

    if (errors.length > 0) {
        return res.render('projects/budget/edit_project_budget', {
            title: `Manage Budget for ${project.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Project: ${project.name}`,
            project: project,
            formData: { budget },
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        await db.query('UPDATE projects SET budget = ?, updated_at = NOW() WHERE id = ?', [budgetValue, projectId]);
        req.flash('success_msg', 'Project planned budget updated successfully.');
        res.redirect(`/projects/${projectId}/details`);
    } catch (error) {
        console.error("Error updating project budget:", error);
        req.flash('error_msg', 'Error updating project budget. Please try again.');
        res.redirect(`/projects/${projectId}/budget/edit`);
    }
};

// =================== PROJECT BUDGET LOGS ===================

// Show form to add a budget log entry for a project
exports.showAddProjectBudgetLogForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext;

        if (!project) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }
        
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);

        res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks, // For optional task assignment on project-level form
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add project budget log form:", error);
        next(error);
    }
};

// Handle adding a new budget log entry (can be project-level or task-level via this form)
exports.handleAddProjectBudgetLogEntry = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { description, amount, entry_type, log_date, category, task_id } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });
    // Add more validation as needed

    if (errors.length > 0) {
        const project = req.projectContext;
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);
        return res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: task_id ? parseInt(task_id) : null,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/budget/logs`);
    } catch (error) {
        console.error("Error adding budget log entry:", error);
        req.flash('error_msg', 'Error adding budget log entry.');
        // Consider repopulating form correctly on error
        res.redirect(`/projects/${projectId}/budget/log/add${task_id ? '?taskId=' + task_id : ''}`);
    }
};

// List all budget logs for a project (including task-specific ones)
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext;

        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);

        let totalIncome = 0;
        let totalExpenses = 0;
        logs.forEach(log => {
            if (log.entry_type === 'income') {
                totalIncome += parseFloat(log.amount);
            } else {
                totalExpenses += parseFloat(log.amount);
            }
        });

        const plannedBudget = project.budget ? parseFloat(project.budget) : 0;
        const netActual = totalIncome - totalExpenses; // More like "Net Cash Flow from logs"
        const actualCost = totalExpenses; // Standard definition of actual cost
        const variance = plannedBudget - actualCost;

        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            actualCost: actualCost,
            netActual: netActual,
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project budget logs:", error);
        next(error);
    }
};


// =================== TASK BUDGET ===================

// Show form to edit task's planned budget
exports.showTaskBudgetForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: { budget: task.budget || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing task budget form:", error);
        next(error);
    }
};

// Handle update task's planned budget
exports.handleUpdateTaskBudget = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const project = req.projectContext;
    const { task_budget } = req.body;
    
    let errors = [];
    const budgetValue = parseFloat(task_budget);
    if (isNaN(budgetValue) || budgetValue < 0) {
        errors.push({ msg: 'Planned budget must be a valid non-negative number.' });
    }

    if (errors.length > 0) {
        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/edit_task_budget', {
            title: `Manage Budget for Task: ${task.name}`,
            pageTitle: `Manage Planned Budget`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: { task_budget },
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        await db.query('UPDATE tasks SET task_budget = ?, updated_at = NOW() WHERE id = ? AND project_id = ?', [budgetValue, taskId, projectId]);
        req.flash('success_msg', 'Task planned budget updated successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`);
    } catch (error) {
        console.error("Error updating task budget:", error);
        req.flash('error_msg', 'Error updating task budget. Please try again.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/edit`);
    }
};


// =================== TASK BUDGET LOGS ===================

// Show form to add a budget log entry specifically for a task
exports.showAddTaskBudgetLogForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT id, name FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add task budget log form:", error);
        next(error);
    }
};

// Handle adding a new budget log entry for a task
exports.handleAddTaxBudgetLogEntry = async (req, res, next) => { // Renamed handleAddTaskBudgetLogEntry
    const { projectId, taskId } = req.params;
    const { description, amount, entry_type, log_date, category } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });

    if (errors.length > 0) {
        const project = req.projectContext;
        const [taskRows] = await db.query('SELECT id, name FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: taskId,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Task budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/logs`);
    } catch (error) {
        console.error("Error adding task budget log entry:", error);
        req.flash('error_msg', 'Error adding task budget log entry.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/log/add`);
    }
};
exports.handleAddBudgetLogEntry = exports.handleAddProjectBudgetLogEntry; // Alias for clarity if called from project context for a task
exports.handleAddLogEntry = exports.handleAddProjectBudgetLogEntry; // Generic alias


// List all budget logs for a specific task
exports.listTaskBudgetLogs = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const [logs] = await db.query(`
            SELECT bl.*, u.username as creator_username
            FROM budget_logs bl
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? AND bl.task_id = ?
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId, taskId]);

        let totalIncome = 0;
        let totalExpenses = 0;
        logs.forEach(log => {
            if (log.entry_type === 'income') {
                totalIncome += parseFloat(log.amount);
            } else {
                totalExpenses += parseFloat(log.amount);
            }
        });

        const plannedBudget = task.task_budget ? parseFloat(task.task_budget) : 0;
        const actualCost = totalExpenses;
        const variance = plannedBudget - actualCost;

        res.render('tasks/budget/list_logs', {
            title: `Budget Logs for Task: ${task.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            logs: logs,
            plannedBudget: plannedBudget,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            actualCost: actualCost,
            variance: variance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing task budget logs:", error);
        next(error);
    }
};

// Helper function to get project budget summary (can be used by projectController)
exports.getProjectBudgetSummary = async (projectId) => {
    const [projectRows] = await db.query('SELECT budget FROM projects WHERE id = ?', [projectId]);
    const budget = projectRows.length > 0 && projectRows[0].budget ? parseFloat(projectRows[0].budget) : 0;

    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE project_id = ?`,
        [projectId]
    );
    
    const total_income = logSummary.length > 0 && logSummary[0].total_income ? parseFloat(logSummary[0].total_income) : 0;
    const actual_cost = logSummary.length > 0 && logSummary[0].total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const variance = budget - actual_cost;

    return {
        budget,
        total_income,
        actual_cost,
        variance
    };
};

// Helper function to get task budget summary (can be used by taskController)
exports.getTaskBudgetSummary = async (taskId) => {
    const [taskRows] = await db.query('SELECT task_budget FROM tasks WHERE id = ?', [taskId]);
    const task_budget = taskRows.length > 0 && taskRows[0].task_budget ? parseFloat(taskRows[0].task_budget) : 0;

    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE task_id = ?`,
        [taskId]
    );

    const total_income = logSummary.length > 0 && logSummary[0].total_income ? parseFloat(logSummary[0].total_income) : 0;
    const actual_cost = logSummary.length > 0 && logSummary[0].total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const variance = task_budget - actual_cost;
    
    return {
        task_budget,
        total_income,
        actual_cost,
        variance
    };
};
*/
/*
// controllers/budgetController.js
const db = require('../config/db');

// Roles remain the same

//const BUDGET_MANAGE_ROLES = ['Project Manager', 'Admin'];
//const BUDGET_ADD_LOG_ROLES = ['Project Manager', 'Site Supervisor', 'Admin'];
// const BUDGET_VIEW_ROLES = ['Project Manager', 'Site Supervisor', 'Team Member', 'Client', 'Admin']; // For use in routes

// =================== DATABASE COLUMN ALIASES / MAPPINGS ===================
// These help clarify which database columns are being referred to.
const PROJECT_OVERALL_BUDGET_COL = 'budget'; // As per projectController
const PROJECT_TRACKING_PLANNED_BUDGET_COL = 'planned_budget'; // For specific budget tracking overrides
const TASK_PLANNED_BUDGET_COL = 'task_budget'; // As per taskController

// =================== PROJECT BUDGET ===================

// Show form to edit project's specific planned budget (for tracking)
exports.showProjectBudgetForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // From checkProjectAccess middleware

        if (!project) {
            req.flash('error_msg', 'Project not found or access denied.');
            return res.redirect('/dashboard');
        }

        // The form will edit 'projects.planned_budget'.
        // If 'projects.planned_budget' is null, it implies the 'projects.budget' (overall) is being used as the default planned.
        // The form can show 'projects.planned_budget' if set, or be empty/show 'projects.budget' as a hint.
        const displayPlannedBudget = project[PROJECT_TRACKING_PLANNED_BUDGET_COL] !== null
                                    ? project[PROJECT_TRACKING_PLANNED_BUDGET_COL]
                                    : (project[PROJECT_OVERALL_BUDGET_COL] || ''); // Default to overall budget if tracking one isn't set

        res.render('projects/budget/edit_project_budget', {
            title: `Manage Planned Budget for ${project.name}`,
            pageTitle: `Manage Planned Budget (for Tracking)`,
            subTitle: `Project: ${project.name}`,
            project: project, // pass full project object
            // formData uses 'planned_budget' as the key for the form field
            formData: { planned_budget: displayPlannedBudget },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing project budget form:", error);
        next(error);
    }
};

// Handle update to project's specific 'planned_budget' (for tracking)
exports.handleUpdateProjectBudget = async (req, res, next) => {
    const projectId = req.params.projectId;
    // const project = req.projectContext; // Not strictly needed here as we only update DB
    const { planned_budget } = req.body; // This is the value from the form, intended for 'projects.planned_budget'

    let errors = [];
    let budgetValue = null; // Default to null if input is empty
    if (planned_budget && planned_budget.trim() !== '') {
        const parsedVal = parseFloat(planned_budget);
        if (isNaN(parsedVal) || parsedVal < 0) {
            errors.push({ msg: 'Planned budget must be a valid non-negative number.' });
        } else {
            budgetValue = parsedVal;
        }
    } else { // If submitted empty, treat as wanting to clear the specific planned_budget override
        budgetValue = null;
    }


    if (errors.length > 0) {
        const project = req.projectContext; // Need project for re-rendering
        return res.render('projects/budget/edit_project_budget', {
            title: `Manage Planned Budget for ${project.name}`,
            pageTitle: `Manage Planned Budget (for Tracking)`,
            subTitle: `Project: ${project.name}`,
            project: project,
            formData: { planned_budget }, // Repopulate form with submitted value
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        // This updates the PROJECT_TRACKING_PLANNED_BUDGET_COL ('planned_budget') in the 'projects' table.
        await db.query(`UPDATE projects SET ${PROJECT_TRACKING_PLANNED_BUDGET_COL} = ?, updated_at = NOW() WHERE id = ?`, [budgetValue, projectId]);
        req.flash('success_msg', 'Project planned budget (for tracking) updated successfully.');
        res.redirect(`/projects/${projectId}/details`);
    } catch (error) {
        console.error("Error updating project planned budget:", error);
        req.flash('error_msg', 'Error updating project planned budget. Please try again.');
        res.redirect(`/projects/${projectId}/budget/edit`);
    }
};

// =================== PROJECT BUDGET LOGS ===================
// showAddProjectBudgetLogForm and handleAddProjectBudgetLogEntry remain largely the same
// as they deal with creating 'budget_logs' entries.

exports.showAddProjectBudgetLogForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext;

        if (!project) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }
        
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);

        res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add project budget log form:", error);
        next(error);
    }
};

exports.handleAddProjectBudgetLogEntry = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { description, amount, entry_type, log_date, category, task_id } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });

    if (errors.length > 0) {
        const project = req.projectContext;
        const [tasks] = await db.query('SELECT id, name FROM tasks WHERE project_id = ? ORDER BY name', [projectId]);
        return res.render('projects/budget/create_log_entry', {
            title: `Add Budget Log for ${project.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Project: ${project.name}`,
            project: project,
            tasks: tasks,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: task_id ? parseInt(task_id) : null,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/budget/logs`);
    } catch (error) {
        console.error("Error adding budget log entry:", error);
        req.flash('error_msg', 'Error adding budget log entry.');
        res.redirect(`/projects/${projectId}/budget/log/add${task_id ? '?taskId=' + task_id : ''}`);
    }
};


// List all budget logs for a project (including task-specific ones)
exports.listProjectBudgetLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        // Fetch project details including both 'budget' and 'planned_budget'
        const [projectRows] = await db.query(`SELECT id, name, ${PROJECT_OVERALL_BUDGET_COL}, ${PROJECT_TRACKING_PLANNED_BUDGET_COL} FROM projects WHERE id = ?`, [projectId]);
        if (projectRows.length === 0) {
            req.flash('error_msg', 'Project not found.');
            return res.redirect('/dashboard');
        }
        const project = projectRows[0];


        const [logs] = await db.query(`
            SELECT bl.*, t.name as task_name, u.username as creator_username
            FROM budget_logs bl
            LEFT JOIN tasks t ON bl.task_id = t.id
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? 
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId]);
        
        // Determine the Planned Budget to use for variance calculation
        // Priority: projects.planned_budget (tracking) > projects.budget (overall)
        const plannedBudgetForDisplay = project[PROJECT_TRACKING_PLANNED_BUDGET_COL] !== null
            ? parseFloat(project[PROJECT_TRACKING_PLANNED_BUDGET_COL])
            : (project[PROJECT_OVERALL_BUDGET_COL] ? parseFloat(project[PROJECT_OVERALL_BUDGET_COL]) : 0);

        // Calculate Project Actual Cost and Income from budget_logs
        // Project actual cost is sum of all task expenses + project-level expenses
        // Project total income is sum of all task incomes + project-level incomes

        const summary = await exports.getProjectBudgetSummary(projectId); // This helper will be updated

        res.render('projects/budget/list_logs', {
            title: `Budget Logs for ${project.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            plannedBudget: plannedBudgetForDisplay,
            totalIncome: summary.total_income,
            totalExpenses: summary.actual_cost, // actual_cost from summary is total expenses
            actualCost: summary.actual_cost, // For clarity
            variance: summary.variance, // Variance will be calculated against plannedBudgetForDisplay
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project budget logs:", error);
        next(error);
    }
};


// =================== TASK BUDGET (Refers to tasks.task_budget) ===================

// Show form to edit task's estimated cost (tasks.task_budget)
exports.showTaskBudgetForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        // Fetch task including its 'task_budget'
        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/edit_task_budget', {
            title: `Manage Estimated Cost for Task: ${task.name}`,
            pageTitle: `Manage Task Estimated Cost`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            // The form field should be named 'task_budget' to align with taskController
            formData: { task_budget: task[TASK_PLANNED_BUDGET_COL] || '' },
            errors: [],
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing task budget form:", error);
        next(error);
    }
};

// Handle update task's estimated cost (tasks.task_budget)
exports.handleUpdateTaskBudget = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { task_budget } = req.body; // Expecting 'task_budget' from the form
    
    let errors = [];
    let budgetValue = null; // Default to null if empty
    if (task_budget && task_budget.trim() !== '') {
        const parsedVal = parseFloat(task_budget);
        if (isNaN(parsedVal) || parsedVal < 0) {
            errors.push({ msg: 'Estimated cost must be a valid non-negative number.' });
        } else {
            budgetValue = parsedVal;
        }
    }

    if (errors.length > 0) {
        const project = req.projectContext;
        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/edit_task_budget', {
            title: `Manage Estimated Cost for Task: ${task.name}`,
            pageTitle: `Manage Task Estimated Cost`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: { task_budget }, // Repopulate with submitted 'task_budget'
            errors: errors,
            layout: './layouts/main_layout'
        });
    }

    try {
        // Updates the TASK_PLANNED_BUDGET_COL ('task_budget') in 'tasks' table
        await db.query(`UPDATE tasks SET ${TASK_PLANNED_BUDGET_COL} = ?, updated_at = NOW() WHERE id = ? AND project_id = ?`, [budgetValue, taskId, projectId]);
        req.flash('success_msg', 'Task estimated cost updated successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/details`);
    } catch (error) {
        console.error("Error updating task estimated cost:", error);
        req.flash('error_msg', 'Error updating task estimated cost. Please try again.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/edit`);
    }
};


// =================== TASK BUDGET LOGS ===================
// showAddTaskBudgetLogForm and handleAddTaxBudgetLogEntry remain largely the same.
// handleAddTaxBudgetLogEntry should be handleAddTaskBudgetLogEntry.

exports.showAddTaskBudgetLogForm = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: {},
            errors: [],
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing add task budget log form:", error);
        next(error);
    }
};

// Renaming handleAddTaxBudgetLogEntry to handleAddTaskBudgetLogEntry for clarity
exports.handleAddTaskBudgetLogEntry = async (req, res, next) => {
    const { projectId, taskId } = req.params;
    const { description, amount, entry_type, log_date, category } = req.body;
    const created_by_id = req.session.user.id;
    let errors = [];

    if (!description || description.trim() === '') errors.push({ msg: 'Description is required.' });
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) errors.push({ msg: 'Amount must be a positive number.' });
    if (!entry_type || !['income', 'expense'].includes(entry_type)) errors.push({ msg: 'Invalid entry type.' });
    if (!log_date) errors.push({ msg: 'Log date is required.' });

    if (errors.length > 0) {
        const project = req.projectContext;
        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        const task = taskRows[0] || {id: taskId, name: "Unknown Task"};
        return res.render('tasks/budget/create_log_entry', {
            title: `Add Budget Log for Task: ${task.name}`,
            pageTitle: `Add Budget Log Entry`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            formData: req.body,
            errors: errors,
            formAction: `/projects/${projectId}/tasks/${taskId}/budget/log/add`,
            layout: './layouts/main_layout'
        });
    }

    try {
        const newLogEntry = {
            project_id: projectId,
            task_id: taskId,
            description: description.trim(),
            amount: parseFloat(amount),
            entry_type,
            log_date,
            category: category ? category.trim() : null,
            created_by_id
        };
        await db.query('INSERT INTO budget_logs SET ?', newLogEntry);
        req.flash('success_msg', 'Task budget log entry added successfully.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/logs`);
    } catch (error) {
        console.error("Error adding task budget log entry:", error);
        req.flash('error_msg', 'Error adding task budget log entry.');
        res.redirect(`/projects/${projectId}/tasks/${taskId}/budget/log/add`);
    }
};
// Keep aliases if they are used elsewhere, or remove if handleAddTaskBudgetLogEntry is consistently used.
 exports.handleAddBudgetLogEntry = exports.handleAddProjectBudgetLogEntry;
 exports.handleAddLogEntry = exports.handleAddProjectBudgetLogEntry;


// List all budget logs for a specific task
exports.listTaskBudgetLogs = async (req, res, next) => {
    try {
        const { projectId, taskId } = req.params;
        const project = req.projectContext;

        // Fetch task including its 'task_budget'
        const [taskRows] = await db.query(`SELECT id, name, ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ? AND project_id = ?`, [taskId, projectId]);
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Task not found.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const task = taskRows[0];

        const [logs] = await db.query(`
            SELECT bl.*, u.username as creator_username
            FROM budget_logs bl
            JOIN users u ON bl.created_by_id = u.id
            WHERE bl.project_id = ? AND bl.task_id = ?
            ORDER BY bl.log_date DESC, bl.created_at DESC
        `, [projectId, taskId]);

        let totalIncome = 0;
        let totalExpenses = 0;
        logs.forEach(log => {
            if (log.entry_type === 'income') {
                totalIncome += parseFloat(log.amount);
            } else {
                totalExpenses += parseFloat(log.amount);
            }
        });

        // Task's own planned budget is from its 'task_budget' column
        const taskPlannedBudget = task[TASK_PLANNED_BUDGET_COL] ? parseFloat(task[TASK_PLANNED_BUDGET_COL]) : 0;
        const actualTaskCost = totalExpenses;
        const taskVariance = taskPlannedBudget - actualTaskCost;

        res.render('tasks/budget/list_logs', {
            title: `Budget Logs for Task: ${task.name}`,
            pageTitle: `Budget Logs`,
            subTitle: `Task: ${task.name} (Project: ${project.name})`,
            project: project,
            task: task,
            logs: logs,
            plannedBudget: taskPlannedBudget, // This is the task's own estimated cost
            totalIncome: totalIncome,
            totalExpenses: totalExpenses, // For display of task's specific expenses
            actualCost: actualTaskCost, // For display of task's specific actual cost
            variance: taskVariance,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing task budget logs:", error);
        next(error);
    }
};

// =================== HELPER FUNCTIONS FOR BUDGET SUMMARIES ===================

// Helper function to get project budget summary (Revised)
exports.getProjectBudgetSummary = async (projectId) => {
    // 1. Get Project's Planned Budget (Tracking > Overall)
    const [projectRows] = await db.query(
        `SELECT ${PROJECT_OVERALL_BUDGET_COL}, ${PROJECT_TRACKING_PLANNED_BUDGET_COL} FROM projects WHERE id = ?`,
        [projectId]
    );

    let projectPlannedBudget = 0;
    if (projectRows.length > 0) {
        projectPlannedBudget = projectRows[0][PROJECT_TRACKING_PLANNED_BUDGET_COL] !== null
            ? parseFloat(projectRows[0][PROJECT_TRACKING_PLANNED_BUDGET_COL])
            : (projectRows[0][PROJECT_OVERALL_BUDGET_COL] ? parseFloat(projectRows[0][PROJECT_OVERALL_BUDGET_COL]) : 0);
    }

    // 2. Calculate Total Project Income and Total Project Actual Cost (Expenses)
    // This includes project-level logs AND sums of task-level logs.

    // Get sums from project-level logs (task_id IS NULL)
    const [projectLevelLogSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as project_level_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as project_level_expenses
         FROM budget_logs 
         WHERE project_id = ? AND task_id IS NULL`,
        [projectId]
    );
    let totalProjectIncome = projectLevelLogSummary[0]?.project_level_income ? parseFloat(projectLevelLogSummary[0].project_level_income) : 0;
    let totalProjectActualCost = projectLevelLogSummary[0]?.project_level_expenses ? parseFloat(projectLevelLogSummary[0].project_level_expenses) : 0;

    // Get sums from task-level logs and add them
    const [taskLevelLogSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as task_level_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as task_level_expenses
         FROM budget_logs 
         WHERE project_id = ? AND task_id IS NOT NULL`,
        [projectId]
    );
    totalProjectIncome += taskLevelLogSummary[0]?.task_level_income ? parseFloat(taskLevelLogSummary[0].task_level_income) : 0;
    totalProjectActualCost += taskLevelLogSummary[0]?.task_level_expenses ? parseFloat(taskLevelLogSummary[0].task_level_expenses) : 0;

    const projectVariance = projectPlannedBudget - totalProjectActualCost;

    return {
        planned_budget: projectPlannedBudget, // The effective planned budget for the project
        total_income: totalProjectIncome,     // Sum of all income (project + tasks)
        actual_cost: totalProjectActualCost,  // Sum of all expenses (project + tasks)
        variance: projectVariance
    };
};

// Helper function to get task budget summary (Revised for clarity and column name)
exports.getTaskBudgetSummary = async (taskId) => {
    // 1. Get Task's Planned Budget (from tasks.task_budget)
    const [taskRows] = await db.query(
        `SELECT ${TASK_PLANNED_BUDGET_COL} FROM tasks WHERE id = ?`,
        [taskId]
    );
    const taskPlannedBudget = taskRows.length > 0 && taskRows[0][TASK_PLANNED_BUDGET_COL]
        ? parseFloat(taskRows[0][TASK_PLANNED_BUDGET_COL])
        : 0;

    // 2. Get income and expenses specifically for this task from budget_logs
    const [logSummary] = await db.query(
        `SELECT 
            SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) as total_expenses
         FROM budget_logs 
         WHERE task_id = ?`, // Only logs linked to this task_id
        [taskId]
    );

    const taskTotalIncome = logSummary[0]?.total_income ? parseFloat(logSummary[0].total_income) : 0;
    const taskActualCost = logSummary[0]?.total_expenses ? parseFloat(logSummary[0].total_expenses) : 0;
    const taskVariance = taskPlannedBudget - taskActualCost;
    
    return {
        planned_budget: taskPlannedBudget, // Task's own estimated cost
        total_income: taskTotalIncome,
        actual_cost: taskActualCost,
        variance: taskVariance
    };
};*/