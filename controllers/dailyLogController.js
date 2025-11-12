

// =========== existing methods =========== 
// showCreateLogForm, 
// handleCreateLog,
// listProjectDailyLogs
// showDailyLogDetails

// =========== newly addedd methods =========== 
// showEditLogForm 
// handleUpdateLog
// handleDeleteLog 


// =========== existing methods =========== //


// need revision for newly added methods! 
// constructpro/controllers/dailyLogController.js
const db = require('../config/db');

// =========== showCreateLogForm, ===========

// @desc    Show form to create a new daily log for a project
// @route   GET /projects/:projectId/logs/create
// @access  Private (Requires project access - checked by middleware)
exports.showCreateLogForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId; // Permission already checked by middleware

        const [projectRows] = await db.query('SELECT id, name FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) { // Should be caught by middleware
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        res.render('projects/logs/create', {
            title: `New Daily Log for ${project.name}`,
            pageTitle: `Create Daily Log`,
            subTitle: `For Project: ${project.name}`,
            project: project,
            formData: req.session.logFormData || { log_date: new Date().toISOString().split('T')[0] },
            errors: req.session.logFormErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.logFormData;
        delete req.session.logFormErrors;
    } catch (error) {
        console.error("Error showing create daily log form:", error);
        next(error);
    }
};


// =========== handleCreateLog,===========

// @desc    Handle creation of a new daily log
// @route   POST /projects/:projectId/logs/create
// @access  Private (Requires project access - checked by middleware)
exports.handleCreateLog = async (req, res, next) => {
    const projectId = req.params.projectId; // Permission already checked
    const loggedById = req.session.user.id;
    const { log_date, weather_conditions, site_conditions, work_performed, delays_or_issues } = req.body;
    let errors = [];

    if (!log_date) errors.push({ param: 'log_date', msg: 'Log date is required.' });
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date) || isNaN(new Date(log_date).getTime())) {
         errors.push({ param: 'log_date', msg: 'Invalid log date format. Use YYYY-MM-DD.' });
    }
    if (!work_performed || work_performed.trim() === '') errors.push({ param: 'work_performed', msg: 'Work performed details are required.' });
    if (work_performed && work_performed.length > 5000) errors.push({ param: 'work_performed', msg: 'Work performed is too long (max 5000 chars).' });
    // Add other length validations as before

    if (errors.length > 0) {
        req.session.logFormData = req.body;
        req.session.logFormErrors = errors;
        return res.redirect(`/projects/${projectId}/logs/create`);
    }

    try {
        const newLog = {
            project_id: projectId,
            log_date,
            weather_conditions: weather_conditions ? weather_conditions.trim() : null,
            site_conditions: site_conditions ? site_conditions.trim() : null,
            work_performed: work_performed.trim(),
            delays_or_issues: delays_or_issues ? delays_or_issues.trim() : null,
            logged_by_id: loggedById
        };

        const [result] = await db.query("INSERT INTO daily_logs SET ?", newLog);
        req.flash('success_msg', 'Daily log created successfully.');
        res.redirect(`/projects/${projectId}/logs/${result.insertId}`); // Redirect to new log's details
    } catch (error) {
        console.error("Error creating daily log:", error);
        req.session.logFormData = req.body;
        req.session.logFormErrors = [{ msg: 'Server error while creating daily log. Please try again.' }];
        res.redirect(`/projects/${projectId}/logs/create`);
    }
};

// =========== listProjectDailyLogs ===========
// @desc    List all daily logs for a specific project
// @route   GET /projects/:projectId/logs
// @access  Private (Requires project access - checked by middleware)
exports.listProjectDailyLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId; // Permission already checked

        const [projectRows] = await db.query('SELECT id, name FROM projects WHERE id = ?', [projectId]);
        if (projectRows.length === 0) { // Should be caught by middleware
            req.flash('error_msg', 'Project not found.');
            return res.status(404).redirect('/dashboard');
        }
        const project = projectRows[0];

        const [logs] = await db.query(
            "SELECT dl.id, DATE_FORMAT(dl.log_date, '%Y-%m-%d') as log_date_formatted, dl.log_date, " +
            "SUBSTRING(dl.work_performed, 1, 150) as work_performed_summary, u.username as logger_username " +
            "FROM daily_logs dl JOIN users u ON dl.logged_by_id = u.id " +
            "WHERE dl.project_id = ? ORDER BY dl.log_date DESC, dl.created_at DESC",
            [projectId]
        );

        res.render('projects/logs/list', {
            title: `Daily Logs for ${project.name}`,
            pageTitle: `Daily Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project daily logs:", error);
        next(error);
    }
};


// =========== showDailyLogDetails ===========


// @desc    Show details of a specific daily log
// @route   GET /projects/:projectId/logs/:logId
// @access  Private (Requires project access - checked by middleware)
exports.showDailyLogDetails = async (req, res, next) => {
    try {
        const { projectId, logId } = req.params; // Permission already checked

        const [logRows] = await db.query(
            "SELECT dl.*, p.name as project_name, u.username as logger_username, " +
            "DATE_FORMAT(dl.log_date, '%M %d, %Y') as log_date_formatted, " + // More readable format
            "DATE_FORMAT(dl.created_at, '%M %d, %Y %H:%i') as created_at_formatted " +
            "FROM daily_logs dl " +
            "JOIN projects p ON dl.project_id = p.id " +
            "JOIN users u ON dl.logged_by_id = u.id " +
            "WHERE dl.id = ? AND dl.project_id = ?",
            [logId, projectId]
        );

        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/logs`);
        }
        const log = logRows[0];

        res.render('projects/logs/details', {
            title: `Daily Log: ${log.log_date_formatted} - ${log.project_name}`,
            pageTitle: `Daily Log Details`,
            subTitle: `(${log.log_date_formatted}) for Project: ${log.project_name}`,
            log: log,
            project: { id: log.project_id, name: log.project_name },
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing daily log details:", error);
        next(error);
    }
};


// =========== newly addedd methods =========== 


// constructpro/controllers/dailyLogController.js
//const db = require('../config/db');

// ... (existing methods: showCreateLogForm, handleCreateLog, listProjectDailyLogs, showDailyLogDetails) ...

// =========== newly addedd methods ===========

// @desc    Show form to edit an existing daily log
// @route   GET /projects/:projectId/logs/:logId/edit
// @access  Private (Requires project access with dailyLogManageRoles)
exports.showEditLogForm = async (req, res, next) => {
    try {
        const { projectId, logId } = req.params; // Permissions checked by middleware

        // Failsafe, though middleware should provide this
        const projectForContext = req.projectContext || (await db.query('SELECT id, name FROM projects WHERE id = ?', [projectId]))[0][0];
        if (!projectForContext) {
            req.flash('error_msg', 'Project context not found.');
            return res.status(404).redirect('/dashboard');
        }

        const [logRows] = await db.query("SELECT * FROM daily_logs WHERE id = ? AND project_id = ?", [logId, projectId]);
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/logs`);
        }
        const log = logRows[0];

        // Format date for the input field
        const formData = {
            ...log,
            log_date: log.log_date ? new Date(log.log_date).toISOString().split('T')[0] : ''
        };

        res.render('projects/logs/edit', { // Ensure views/projects/logs/edit.ejs exists
            title: `Edit Daily Log for ${projectForContext.name}`,
            pageTitle: `Edit Daily Log`,
            subTitle: `Log Date: ${formData.log_date}, Project: ${projectForContext.name}`,
            project: projectForContext,
            log: log, // Pass original log for context in view (e.g., breadcrumbs)
            formData: req.session.editLogFormData || formData, // Use session data on error or DB data
            errors: req.session.editLogErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editLogFormData;
        delete req.session.editLogErrors;

    } catch (error) {
        console.error("Error showing edit daily log form:", error);
        next(error);
    }
};

// @desc    Handle updating an existing daily log
// @route   POST /projects/:projectId/logs/:logId/edit
// @access  Private (Requires project access with dailyLogManageRoles)
exports.handleUpdateLog = async (req, res, next) => {
    const { projectId, logId } = req.params; // Permissions checked by middleware
    const { log_date, weather_conditions, site_conditions, work_performed, delays_or_issues } = req.body;
    let errors = [];

    // Fetch original log for repopulation on error and ensuring it exists
    let originalLog;
    try {
        const [logRows] = await db.query("SELECT * FROM daily_logs WHERE id = ? AND project_id = ?", [logId, projectId]);
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found for update.');
            return res.redirect(`/projects/${projectId}/logs`);
        }
        originalLog = logRows[0];
    } catch (dbError) {
        console.error("Error fetching log for update:", dbError);
        return next(dbError);
    }

    // Validation (same as create)
    if (!log_date) errors.push({ param: 'log_date', msg: 'Log date is required.' });
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date) || isNaN(new Date(log_date).getTime())) {
         errors.push({ param: 'log_date', msg: 'Invalid log date format. Use YYYY-MM-DD.' });
    }
    if (!work_performed || work_performed.trim() === '') errors.push({ param: 'work_performed', msg: 'Work performed details are required.' });
    if (work_performed && work_performed.length > 5000) errors.push({ param: 'work_performed', msg: 'Work performed is too long (max 5000 chars).' });
    // Add other length validations for weather_conditions, site_conditions, delays_or_issues

    if (errors.length > 0) {
        req.session.editLogFormData = { ...originalLog, ...req.body }; // Repopulate with submitted values
        req.session.editLogErrors = errors;
        return res.redirect(`/projects/${projectId}/logs/${logId}/edit`);
    }

    try {
        const updatedLogData = {
            log_date,
            weather_conditions: weather_conditions ? weather_conditions.trim() : null,
            site_conditions: site_conditions ? site_conditions.trim() : null,
            work_performed: work_performed.trim(),
            delays_or_issues: delays_or_issues ? delays_or_issues.trim() : null,
            // logged_by_id is not updated, updated_at will be handled by DB
        };

        await db.query("UPDATE daily_logs SET ? WHERE id = ? AND project_id = ?", [updatedLogData, logId, projectId]);
        req.flash('success_msg', 'Daily log updated successfully.');
        res.redirect(`/projects/${projectId}/logs/${logId}`); // Redirect to updated log's details

    } catch (error) {
        console.error("Error updating daily log:", error);
        req.session.editLogFormData = { ...originalLog, ...req.body };
        req.session.editLogErrors = [{ msg: 'Server error while updating daily log. Please try again.' }];
        res.redirect(`/projects/${projectId}/logs/${logId}/edit`);
    }
};

// @desc    Handle deleting a daily log
// @route   POST /projects/:projectId/logs/:logId/delete
// @access  Private (Requires project access with dailyLogManageRoles)
exports.handleDeleteLog = async (req, res, next) => {
    const { projectId, logId } = req.params; // Permissions checked by middleware

    try {
        const [result] = await db.query("DELETE FROM daily_logs WHERE id = ? AND project_id = ?", [logId, projectId]);

        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Daily log deleted successfully.');
        } else {
            req.flash('error_msg', 'Daily log not found or could not be deleted.');
        }
        res.redirect(`/projects/${projectId}/logs`); // Redirect to the list of logs

    } catch (error) {
        console.error("Error deleting daily log:", error);
        req.flash('error_msg', 'An error occurred while deleting the daily log.');
        // Redirect back to the logs list or specific log details page if deletion failed unexpectedly
        res.redirect(`/projects/${projectId}/logs`);
    }
};


/*
//=========== showEditLogForm =========== 


// @desc    Show form to edit an existing daily log
// @route   GET /projects/:projectId/logs/:logId/edit
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.showEditLogForm = async (req, res, next) => {
    try {
        // req.project is attached by checkProjectAccess middleware
        if (!req.project) {
            req.flash('error_msg', 'Project context not available or access denied.');
            return res.redirect('/dashboard');
        }
        const project = req.project;
        const { logId } = req.params;
        
        const [logRows] = await db.query(
            "SELECT * FROM daily_logs WHERE id = ? AND project_id = ?",
            [logId, project.id]
        );
        
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        const log = logRows[0];
        
        // Format date for input type="date"
        const formData = { ...log };
        if (formData.log_date) {
            formData.log_date = new Date(formData.log_date).toISOString().split('T')[0];
        }
        
        res.render('projects/logs/edit', { // New EJS view: projects/logs/edit.ejs
            title: `Edit Daily Log - ${new Date(log.log_date).toLocaleDateString()}`,
            pageTitle: `Edit Daily Log`,
            subTitle: `For Project: ${project.name} | Log Date: ${new Date(log.log_date).toLocaleDateString()}`,
            project: project,
            log: log, // Pass original log for context if needed
            formData: req.session.editLogFormData || formData, // For PRG pattern
            errors: req.session.editLogErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editLogFormData;
        delete req.session.editLogErrors;
        
    } catch (error) {
        console.error("Error showing edit daily log form:", error);
        next(error);
    }
};


//=========== handleUpdateLog ===========


// @desc    Handle updating an existing daily log
// @route   POST /projects/:projectId/logs/:logId/edit
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.handleUpdateLog = async (req, res, next) => {
    // req.project is attached by checkProjectAccess middleware
    if (!req.project) {
        req.flash('error_msg', 'Project context not available or access denied.');
        return res.redirect('/dashboard');
    }
    const project = req.project;
    const { logId } = req.params;
    // const loggedById = req.session.user.id; // User performing the update, can be logged in audit_log
    
    const { log_date, weather_conditions, site_conditions, work_performed, delays_or_issues } = req.body;
    let errors = [];
    
    // Permission check already done by middleware.
    
    // Validate original log existence
    let originalLog;
    try {
        const [logRows] = await db.query('SELECT * FROM daily_logs WHERE id = ? AND project_id = ?', [logId, project.id]);
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        originalLog = logRows[0];
    } catch (dbError) {
        console.error("DB error fetching original log for update:", dbError);
        return next(dbError);
    }
    
    if (!log_date) errors.push({ param: 'log_date', msg: 'Log date is required.' });
    else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date) || isNaN(new Date(log_date).getTime())) {
            errors.push({ param: 'log_date', msg: 'Invalid log date format. Use YYYY-MM-DD.' });
        }
    }
    if (!work_performed || work_performed.trim() === '') errors.push({ param: 'work_performed', msg: 'Work performed details are required.' });
    // Length validations (same as create)
    if (work_performed && work_performed.length > 5000) errors.push({ param: 'work_performed', msg: 'Work performed is too long (max 5000 chars).' });
    if (weather_conditions && weather_conditions.length > 1000) errors.push({ param: 'weather_conditions', msg: 'Weather conditions are too long (max 1000 chars).' });
    if (site_conditions && site_conditions.length > 1000) errors.push({ param: 'site_conditions', msg: 'Site conditions are too long (max 1000 chars).' });
    if (delays_or_issues && delays_or_issues.length > 2000) errors.push({ param: 'delays_or_issues', msg: 'Delays/issues are too long (max 2000 chars).' });
    
    
    if (errors.length > 0) {
        req.session.editLogFormData = { ...originalLog, ...req.body }; // Merge for repopulation
        if (req.session.editLogFormData.log_date) { // Re-format date for input field
            req.session.editLogFormData.log_date = new Date(req.session.editLogFormData.log_date).toISOString().split('T')[0];
        }
        req.session.editLogErrors = errors;
        return res.redirect(`/projects/${project.id}/logs/${logId}/edit`);
    }
    
    try {
        const updatedLogData = {
            log_date,
            weather_conditions: weather_conditions ? weather_conditions.trim() : null,
            site_conditions: site_conditions ? site_conditions.trim() : null,
            work_performed: work_performed.trim(),
            delays_or_issues: delays_or_issues ? delays_or_issues.trim() : null,
            updated_at: new Date() // Explicitly set updated_at
        };
        
        await db.query("UPDATE daily_logs SET ? WHERE id = ? AND project_id = ?", [updatedLogData, logId, project.id]);
        req.flash('success_msg', 'Daily log updated successfully.');
        res.redirect(`/projects/${project.id}/logs/${logId}`); // Redirect to the log's details page
        
    } catch (error) {
        console.error("Error updating daily log:", error);
        req.session.editLogFormData = { ...originalLog, ...req.body };
        if (req.session.editLogFormData.log_date) {
            req.session.editLogFormData.log_date = new Date(req.session.editLogFormData.log_date).toISOString().split('T')[0];
        }
        req.session.editLogErrors = [{ msg: 'Server error while updating daily log. Please try again.' }];
        res.redirect(`/projects/${project.id}/logs/${logId}/edit`);
    }
};




//=========== handleDeleteLog =========== 

// @desc    Handle deleting an existing daily log
// @route   POST /projects/:projectId/logs/:logId/delete
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.handleDeleteLog = async (req, res, next) => {
    // req.project is attached by checkProjectAccess middleware
    if (!req.project) {
        req.flash('error_msg', 'Project context not available or access denied.');
        return res.redirect('/dashboard');
    }
    const project = req.project;
    const { logId } = req.params;
    // const userId = req.session.user.id; // User performing delete
    
    // Permission check done by middleware.
    // For deletion, you might want a stricter role check within the middleware or here.
    // e.g., if (req.roleInProject !== 'Project Manager' && req.session.user.role !== 'Admin') { ... deny ... }
    
    try {
        // Ensure log exists and belongs to project before deleting (double check)
        const [logRows] = await db.query('SELECT id FROM daily_logs WHERE id = ? AND project_id = ?', [logId, project.id]);
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        
        // ON DELETE CASCADE in daily_log_personnel, etc., will handle related records.
        const [result] = await db.query("DELETE FROM daily_logs WHERE id = ? AND project_id = ?", [logId, project.id]);
        
        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Daily log deleted successfully.');
        } else {
            req.flash('error_msg', 'Could not delete the daily log. It might have been deleted already.');
        }
        res.redirect(`/projects/${project.id}/logs`); // Redirect to the logs list
        
    } catch (error) {
        console.error("Error deleting daily log:", error);
        req.flash('error_msg', 'An error occurred while trying to delete the daily log.');
        res.redirect(`/projects/${project.id}/logs`);
    }
};







*/



/*
//1. constructpro/controllers/dailyLogController.js (Revised)

// constructpro/controllers/dailyLogController.js
const db = require('../config/db');

// The helper function checkProjectAccessForLogs is REMOVED.
// We will rely on the checkProjectAccess middleware from authMiddleware.js
// which should attach req.project if access is granted.

// @desc    Show form to create a new daily log for a project
// @route   GET /projects/:projectId/logs/create
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.showCreateLogForm = async (req, res, next) => {
    try {
        // req.project is attached by the checkProjectAccess middleware
        if (!req.project) {
            // This case should ideally be caught by the middleware itself,
            // but as a fallback:
            req.flash('error_msg', 'Project context not available or access denied.');
            return res.redirect('/dashboard');
        }
        const project = req.project;

        res.render('projects/logs/create', {
            title: `New Daily Log for ${project.name}`,
            pageTitle: `Create Daily Log`,
            subTitle: `For Project: ${project.name}`,
            project: project, // Pass project from middleware
            formData: req.session.logFormData || { log_date: new Date().toISOString().split('T')[0] },
            errors: req.session.logFormErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.logFormData;
        delete req.session.logFormErrors;
    } catch (error) {
        console.error("Error showing create daily log form:", error);
        next(error);
    }
};

// @desc    Handle creation of a new daily log
// @route   POST /projects/:projectId/logs/create
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.handleCreateLog = async (req, res, next) => {
    // req.project is attached by the checkProjectAccess middleware
    if (!req.project) {
        req.flash('error_msg', 'Project context not available or access denied.');
        return res.redirect('/dashboard');
    }
    const projectId = req.project.id;
    const loggedById = req.session.user.id;
    const { log_date, weather_conditions, site_conditions, work_performed, delays_or_issues } = req.body;
    let errors = [];

    // Permission check already done by middleware.

    if (!log_date) errors.push({ param: 'log_date', msg: 'Log date is required.' });
    else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date) || isNaN(new Date(log_date).getTime())) { // Check if date is valid
            errors.push({ param: 'log_date', msg: 'Invalid log date format. Use YYYY-MM-DD.' });
        }
    }
    if (!work_performed || work_performed.trim() === '') errors.push({ param: 'work_performed', msg: 'Work performed details are required.' });
    if (work_performed && work_performed.length > 5000) errors.push({ param: 'work_performed', msg: 'Work performed is too long (max 5000 chars).' });
    if (weather_conditions && weather_conditions.length > 1000) errors.push({ param: 'weather_conditions', msg: 'Weather conditions are too long (max 1000 chars).' });
    if (site_conditions && site_conditions.length > 1000) errors.push({ param: 'site_conditions', msg: 'Site conditions are too long (max 1000 chars).' });
    if (delays_or_issues && delays_or_issues.length > 2000) errors.push({ param: 'delays_or_issues', msg: 'Delays/issues are too long (max 2000 chars).' });

    if (errors.length > 0) {
        req.session.logFormData = req.body;
        req.session.logFormErrors = errors;
        return res.redirect(`/projects/${projectId}/logs/create`);
    }

    try {
        const newLog = {
            project_id: projectId,
            log_date,
            weather_conditions: weather_conditions ? weather_conditions.trim() : null,
            site_conditions: site_conditions ? site_conditions.trim() : null,
            work_performed: work_performed.trim(),
            delays_or_issues: delays_or_issues ? delays_or_issues.trim() : null,
            logged_by_id: loggedById
        };

        const [result] = await db.query("INSERT INTO daily_logs SET ?", newLog);
        req.flash('success_msg', 'Daily log created successfully.');
        res.redirect(`/projects/${projectId}/logs/${result.insertId}`); // Redirect to the new log's details page

    } catch (error) {
        console.error("Error creating daily log:", error);
        req.session.logFormData = req.body;
        req.session.logFormErrors = [{ msg: 'Server error while creating daily log. Please try again.' }];
        res.redirect(`/projects/${projectId}/logs/create`);
    }
};

// @desc    List all daily logs for a specific project
// @route   GET /projects/:projectId/logs
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.listProjectDailyLogs = async (req, res, next) => {
    try {
        // req.project is attached by the checkProjectAccess middleware
        if (!req.project) {
            req.flash('error_msg', 'Project context not available or access denied.');
            return res.redirect('/dashboard');
        }
        const project = req.project;

        const [logs] = await db.query(
            "SELECT dl.id, DATE_FORMAT(dl.log_date, '%Y-%m-%d') as log_date_formatted, dl.log_date, " +
            "SUBSTRING(dl.work_performed, 1, 150) as work_performed_summary, u.username as logger_username " +
            "FROM daily_logs dl JOIN users u ON dl.logged_by_id = u.id " +
            "WHERE dl.project_id = ? ORDER BY dl.log_date DESC, dl.created_at DESC",
            [project.id]
        );

        res.render('projects/logs/list', {
            title: `Daily Logs for ${project.name}`,
            pageTitle: `Daily Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project daily logs:", error);
        next(error);
    }
};

// @desc    Show details of a specific daily log
// @route   GET /projects/:projectId/logs/:logId
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.showDailyLogDetails = async (req, res, next) => {
    try {
        // req.project is attached by the checkProjectAccess middleware
        if (!req.project) {
            req.flash('error_msg', 'Project context not available or access denied.');
            return res.redirect('/dashboard');
        }
        const project = req.project;
        const { logId } = req.params;

        const [logRows] = await db.query(
            "SELECT dl.*, p.name as project_name, u.username as logger_username, " +
            "DATE_FORMAT(dl.log_date, '%M %d, %Y') as log_date_formatted_display, " + // Renamed for clarity
            "DATE_FORMAT(dl.created_at, '%M %d, %Y %H:%i') as created_at_formatted " +
            "FROM daily_logs dl " +
            "JOIN projects p ON dl.project_id = p.id " +
            "JOIN users u ON dl.logged_by_id = u.id " +
            "WHERE dl.id = ? AND dl.project_id = ?",
            [logId, project.id] // Ensure log belongs to project from URL (middleware project.id)
        );

        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        const log = logRows[0];

        res.render('projects/logs/details', {
            title: `Daily Log: ${log.log_date_formatted_display} - ${log.project_name}`,
            pageTitle: `Daily Log Details`,
            subTitle: `(${log.log_date_formatted_display}) for Project: ${log.project_name}`,
            log: log,
            project: { id: log.project_id, name: log.project_name }, // Or pass req.project
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing daily log details:", error);
        next(error);
    }
};

// TODO: Implement showEditLogForm, handleUpdateLog, handleDeleteLog later
// These would follow similar patterns:
// - Rely on req.project from middleware
// - Use PRG pattern for edit form
// - Use main_layout
// - Perform validation
// - Redirect appropriately


// constructpro/controllers/dailyLogController.js
//const db = require('../config/db');

// ... (existing showCreateLogForm, handleCreateLog, listProjectDailyLogs, showDailyLogDetails methods remain the same) ...

// @desc    Show form to edit an existing daily log
// @route   GET /projects/:projectId/logs/:logId/edit
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.showEditLogForm = async (req, res, next) => {
    try {
        // req.project is attached by checkProjectAccess middleware
        if (!req.project) {
            req.flash('error_msg', 'Project context not available or access denied.');
            return res.redirect('/dashboard');
        }
        const project = req.project;
        const { logId } = req.params;
        
        const [logRows] = await db.query(
            "SELECT * FROM daily_logs WHERE id = ? AND project_id = ?",
            [logId, project.id]
        );
        
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        const log = logRows[0];
        
        // Format date for input type="date"
        const formData = { ...log };
        if (formData.log_date) {
            formData.log_date = new Date(formData.log_date).toISOString().split('T')[0];
        }
        
        res.render('projects/logs/edit', { // New EJS view: projects/logs/edit.ejs
            title: `Edit Daily Log - ${new Date(log.log_date).toLocaleDateString()}`,
            pageTitle: `Edit Daily Log`,
            subTitle: `For Project: ${project.name} | Log Date: ${new Date(log.log_date).toLocaleDateString()}`,
            project: project,
            log: log, // Pass original log for context if needed
            formData: req.session.editLogFormData || formData, // For PRG pattern
            errors: req.session.editLogErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editLogFormData;
        delete req.session.editLogErrors;
        
    } catch (error) {
        console.error("Error showing edit daily log form:", error);
        next(error);
    }
};

// @desc    Handle updating an existing daily log
// @route   POST /projects/:projectId/logs/:logId/edit
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.handleUpdateLog = async (req, res, next) => {
    // req.project is attached by checkProjectAccess middleware
    if (!req.project) {
        req.flash('error_msg', 'Project context not available or access denied.');
        return res.redirect('/dashboard');
    }
    const project = req.project;
    const { logId } = req.params;
    // const loggedById = req.session.user.id; // User performing the update, can be logged in audit_log
    
    const { log_date, weather_conditions, site_conditions, work_performed, delays_or_issues } = req.body;
    let errors = [];
    
    // Permission check already done by middleware.
    
    // Validate original log existence
    let originalLog;
    try {
        const [logRows] = await db.query('SELECT * FROM daily_logs WHERE id = ? AND project_id = ?', [logId, project.id]);
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        originalLog = logRows[0];
    } catch (dbError) {
        console.error("DB error fetching original log for update:", dbError);
        return next(dbError);
    }
    
    if (!log_date) errors.push({ param: 'log_date', msg: 'Log date is required.' });
    else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date) || isNaN(new Date(log_date).getTime())) {
            errors.push({ param: 'log_date', msg: 'Invalid log date format. Use YYYY-MM-DD.' });
        }
    }
    if (!work_performed || work_performed.trim() === '') errors.push({ param: 'work_performed', msg: 'Work performed details are required.' });
    // Length validations (same as create)
    if (work_performed && work_performed.length > 5000) errors.push({ param: 'work_performed', msg: 'Work performed is too long (max 5000 chars).' });
    if (weather_conditions && weather_conditions.length > 1000) errors.push({ param: 'weather_conditions', msg: 'Weather conditions are too long (max 1000 chars).' });
    if (site_conditions && site_conditions.length > 1000) errors.push({ param: 'site_conditions', msg: 'Site conditions are too long (max 1000 chars).' });
    if (delays_or_issues && delays_or_issues.length > 2000) errors.push({ param: 'delays_or_issues', msg: 'Delays/issues are too long (max 2000 chars).' });
    
    
    if (errors.length > 0) {
        req.session.editLogFormData = { ...originalLog, ...req.body }; // Merge for repopulation
        if (req.session.editLogFormData.log_date) { // Re-format date for input field
            req.session.editLogFormData.log_date = new Date(req.session.editLogFormData.log_date).toISOString().split('T')[0];
        }
        req.session.editLogErrors = errors;
        return res.redirect(`/projects/${project.id}/logs/${logId}/edit`);
    }
    
    try {
        const updatedLogData = {
            log_date,
            weather_conditions: weather_conditions ? weather_conditions.trim() : null,
            site_conditions: site_conditions ? site_conditions.trim() : null,
            work_performed: work_performed.trim(),
            delays_or_issues: delays_or_issues ? delays_or_issues.trim() : null,
            updated_at: new Date() // Explicitly set updated_at
        };
        
        await db.query("UPDATE daily_logs SET ? WHERE id = ? AND project_id = ?", [updatedLogData, logId, project.id]);
        req.flash('success_msg', 'Daily log updated successfully.');
        res.redirect(`/projects/${project.id}/logs/${logId}`); // Redirect to the log's details page
        
    } catch (error) {
        console.error("Error updating daily log:", error);
        req.session.editLogFormData = { ...originalLog, ...req.body };
        if (req.session.editLogFormData.log_date) {
            req.session.editLogFormData.log_date = new Date(req.session.editLogFormData.log_date).toISOString().split('T')[0];
        }
        req.session.editLogErrors = [{ msg: 'Server error while updating daily log. Please try again.' }];
        res.redirect(`/projects/${project.id}/logs/${logId}/edit`);
    }
};

// @desc    Handle deleting an existing daily log
// @route   POST /projects/:projectId/logs/:logId/delete
// @access  Private (Access controlled by checkProjectAccess middleware)
exports.handleDeleteLog = async (req, res, next) => {
    // req.project is attached by checkProjectAccess middleware
    if (!req.project) {
        req.flash('error_msg', 'Project context not available or access denied.');
        return res.redirect('/dashboard');
    }
    const project = req.project;
    const { logId } = req.params;
    // const userId = req.session.user.id; // User performing delete
    
    // Permission check done by middleware.
    // For deletion, you might want a stricter role check within the middleware or here.
    // e.g., if (req.roleInProject !== 'Project Manager' && req.session.user.role !== 'Admin') { ... deny ... }
    
    try {
        // Ensure log exists and belongs to project before deleting (double check)
        const [logRows] = await db.query('SELECT id FROM daily_logs WHERE id = ? AND project_id = ?', [logId, project.id]);
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${project.id}/logs`);
        }
        
        // ON DELETE CASCADE in daily_log_personnel, etc., will handle related records.
        const [result] = await db.query("DELETE FROM daily_logs WHERE id = ? AND project_id = ?", [logId, project.id]);
        
        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Daily log deleted successfully.');
        } else {
            req.flash('error_msg', 'Could not delete the daily log. It might have been deleted already.');
        }
        res.redirect(`/projects/${project.id}/logs`); // Redirect to the logs list
        
    } catch (error) {
        console.error("Error deleting daily log:", error);
        req.flash('error_msg', 'An error occurred while trying to delete the daily log.');
        res.redirect(`/projects/${project.id}/logs`);
    }
};



*/



/*
// constructpro/controllers/dailyLogController.js
const db = require('../config/db');

// Helper function to check project access for daily log operations
async function checkProjectAccessForLogs(projectId, userId, userRole) {
    if (!projectId || !userId) {
        return { error: 'Project ID and User ID are required.', status: 400, project: null };
    }
    const [projectRows] = await db.query('SELECT id, name, created_by_id, project_manager_id FROM projects WHERE id = ?', [projectId]);
    if (projectRows.length === 0) {
        return { error: 'Project not found.', status: 404, project: null };
    }
    const project = projectRows[0];
    
    // Permission logic: Creator, PM, or Admin. Extend with project members + specific roles (e.g., 'Site Supervisor')
    const isCreator = project.created_by_id === userId;
    const isManager = project.project_manager_id === userId;
    const isAdmin = userRole === 'Admin';
    // TODO: Add check for project_members if relevant:
    // const [memberRows] = await db.query("SELECT role_in_project FROM project_members WHERE project_id = ? AND user_id = ?", [projectId, userId]);
    // const isSiteSupervisor = memberRows.length > 0 && memberRows[0].role_in_project === 'Site Supervisor';
    
    if (!isCreator && !isManager && !isAdmin /* && !isSiteSupervisor *//* ) {
        return { error: 'Permission denied to manage daily logs for this project.', status: 403, project };
    }
    return { project };
}

/*
// @desc    Show form to create a new daily log for a project
// @route   GET /projects/:projectId/logs/create
// @access  Private (Requires project access)
exports.showCreateLogForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        const permissionResult = await checkProjectAccessForLogs(projectId, userId, userRole);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        const project = permissionResult.project;
        
        res.render('projects/logs/create', { // Ensure views/projects/logs/create.ejs exists
            title: `New Daily Log for ${project.name}`,
            pageTitle: `Create Daily Log`,
            subTitle: `For Project: ${project.name}`,
            project: project,
            formData: req.session.logFormData || { log_date: new Date().toISOString().split('T')[0] },
            errors: req.session.logFormErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.logFormData;
        delete req.session.logFormErrors;
    } catch (error) {
        console.error("Error showing create daily log form:", error);
        next(error);
    }
};

// @desc    Handle creation of a new daily log
// @route   POST /projects/:projectId/logs/create
// @access  Private (Requires project access)
exports.handleCreateLog = async (req, res, next) => {
    const projectId = req.params.projectId;
    const loggedById = req.session.user.id;
    const userRole = req.session.user.role;
    const { log_date, weather_conditions, site_conditions, work_performed, delays_or_issues } = req.body;
    let errors = [];
    
    try { // Wrap permission check in try-catch as well
        const permissionResult = await checkProjectAccessForLogs(projectId, loggedById, userRole);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
    } catch (permError) {
        return next(permError);
    }
    
    if (!log_date) errors.push({ param: 'log_date', msg: 'Log date is required.' });
    else { // Validate date format roughly
        if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date) || isNaN(new Date(log_date))) {
            errors.push({ param: 'log_date', msg: 'Invalid log date format. Use YYYY-MM-DD.' });
        }
    }
    if (!work_performed || work_performed.trim() === '') errors.push({ param: 'work_performed', msg: 'Work performed details are required.' });
    if (work_performed && work_performed.length > 5000) errors.push({ param: 'work_performed', msg: 'Work performed is too long (max 5000 chars).' });
    if (weather_conditions && weather_conditions.length > 1000) errors.push({ param: 'weather_conditions', msg: 'Weather conditions are too long (max 1000 chars).' });
    if (site_conditions && site_conditions.length > 1000) errors.push({ param: 'site_conditions', msg: 'Site conditions are too long (max 1000 chars).' });
    if (delays_or_issues && delays_or_issues.length > 2000) errors.push({ param: 'delays_or_issues', msg: 'Delays/issues are too long (max 2000 chars).' });
    
    if (errors.length > 0) {
        req.session.logFormData = req.body;
        req.session.logFormErrors = errors;
        return res.redirect(`/projects/${projectId}/logs/create`);
    }
    
    try {
        const newLog = {
            project_id: projectId,
            log_date,
            weather_conditions: weather_conditions ? weather_conditions.trim() : null,
            site_conditions: site_conditions ? site_conditions.trim() : null,
            work_performed: work_performed.trim(),
            delays_or_issues: delays_or_issues ? delays_or_issues.trim() : null,
            logged_by_id: loggedById
        };
        
        const [result] = await db.query("INSERT INTO daily_logs SET ?", newLog);
        req.flash('success_msg', 'Daily log created successfully.');
        res.redirect(`/projects/${projectId}/logs/${result.insertId}`); // Redirect to the new log's details page
        
    } catch (error) {
        console.error("Error creating daily log:", error);
        req.session.logFormData = req.body;
        req.session.logFormErrors = [{ msg: 'Server error while creating daily log. Please try again.' }];
        res.redirect(`/projects/${projectId}/logs/create`);
    }
};

// @desc    List all daily logs for a specific project
// @route   GET /projects/:projectId/logs
// @access  Private (Requires project access)
exports.listProjectDailyLogs = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        const permissionResult = await checkProjectAccessForLogs(projectId, userId, userRole);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            return res.status(permissionResult.status).redirect(permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/details`);
        }
        const project = permissionResult.project;
        
        const [logs] = await db.query(
            "SELECT dl.id, DATE_FORMAT(dl.log_date, '%Y-%m-%d') as log_date_formatted, dl.log_date, " +
            "SUBSTRING(dl.work_performed, 1, 150) as work_performed_summary, u.username as logger_username " +
            "FROM daily_logs dl JOIN users u ON dl.logged_by_id = u.id " +
            "WHERE dl.project_id = ? ORDER BY dl.log_date DESC, dl.created_at DESC",
            [projectId]
        );
        
        res.render('projects/logs/list', { // Ensure views/projects/logs/list.ejs exists
            title: `Daily Logs for ${project.name}`,
            pageTitle: `Daily Logs`,
            subTitle: `Project: ${project.name}`,
            project: project,
            logs: logs,
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error listing project daily logs:", error);
        next(error);
    }
};

// @desc    Show details of a specific daily log
// @route   GET /projects/:projectId/logs/:logId
// @access  Private (Requires project access)
exports.showDailyLogDetails = async (req, res, next) => {
    try {
        const { projectId, logId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        const permissionResult = await checkProjectAccessForLogs(projectId, userId, userRole);
        if (permissionResult.error) {
            req.flash('error_msg', permissionResult.error);
            // If project not found (404), redirect to dashboard or project list
            // If permission denied (403), redirect to the project's main logs page or details
            return res.status(permissionResult.status).redirect(
                permissionResult.status === 404 ? '/dashboard' : `/projects/${projectId}/logs`
            );
        }
        // const project = permissionResult.project; // Not strictly needed if log query includes project name
        
        const [logRows] = await db.query(
            "SELECT dl.*, p.name as project_name, u.username as logger_username, " +
            "DATE_FORMAT(dl.log_date, '%M %d, %Y') as log_date_formatted, " +
            "DATE_FORMAT(dl.created_at, '%M %d, %Y %H:%i') as created_at_formatted " +
            "FROM daily_logs dl " +
            "JOIN projects p ON dl.project_id = p.id " +
            "JOIN users u ON dl.logged_by_id = u.id " +
            "WHERE dl.id = ? AND dl.project_id = ?", // Ensure log belongs to project from URL
            [logId, projectId]
        );
        
        if (logRows.length === 0) {
            req.flash('error_msg', 'Daily log not found or does not belong to this project.');
            return res.redirect(`/projects/${projectId}/logs`);
        }
        const log = logRows[0];
        
        res.render('projects/logs/details', { // Ensure views/projects/logs/details.ejs exists
            title: `Daily Log: ${log.log_date_formatted} - ${log.project_name}`,
            pageTitle: `Daily Log Details`,
            subTitle: `(${log.log_date_formatted}) for Project: ${log.project_name}`,
            log: log,
            project: { id: log.project_id, name: log.project_name },
            layout: './layouts/main_layout'
        });
    } catch (error) {
        console.error("Error showing daily log details:", error);
        next(error);
    }
};

// TODO: Implement showEditLogForm, handleUpdateLog, handleDeleteLog later
// These would follow similar patterns:
// - Use checkProjectAccessForLogs
// - Use PRG pattern for edit form
// - Use main_layout
// - Perform validation
// - Redirect appropriately

*/