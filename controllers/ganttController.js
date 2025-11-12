// Avenircon/controllers/ganttController.js
const db = require('../config/db');

exports.showGanttChart = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const project = req.projectContext; // Attached by checkProjectAccess middleware

        if (!project) {
            req.flash('error_msg', 'Project context not found for Gantt chart.');
            return res.redirect('/dashboard');
        }

        // Fetch tasks for the project
        const [tasks] = await db.query(
            `SELECT id, name, description, project_id,
                    DATE_FORMAT(start_date, '%Y-%m-%d') as start, 
                    DATE_FORMAT(end_date, '%Y-%m-%d') as end, 
                    planned_duration_days, progress_percentage, status, is_milestone
             FROM tasks 
             WHERE project_id = ? 
             ORDER BY start_date ASC, task_order ASC`,
            [projectId]
        );

        // Fetch dependencies for the project (now using project_id from task_dependencies table)
        const [dependencies] = await db.query(
            `SELECT id, task_id, depends_on_task_id, dependency_type, lag_days 
             FROM task_dependencies 
             WHERE project_id = ?`,
            [projectId]
        );
        
        // --- Frappe Gantt Data Transformation ---
        const ganttTasksData = tasks.map(task => {
            let custom_class = '';
            if (task.is_milestone) {
                custom_class = 'gantt-milestone';
            } else if (task.status === 'Completed') {
                custom_class = 'gantt-completed';
            } else if (task.status === 'InProgress') {
                custom_class = 'gantt-inprogress';
            }

            // Frappe Gantt uses 'id', 'name', 'start', 'end', 'progress', 'dependencies'
            return {
                id: String(task.id), // Frappe expects string IDs
                name: task.name,
                start: task.start, // Already formatted YYYY-MM-DD
                end: task.end,     // Already formatted YYYY-MM-DD
                progress: task.progress_percentage || 0,
                // Map dependencies for this task
                dependencies: dependencies
                                .filter(dep => dep.task_id === task.id)
                                .map(dep => String(dep.depends_on_task_id)),
                custom_class: custom_class
            };
        });

        // Filter out tasks that don't have a start or end date as Frappe Gantt requires them
        const validGanttTasks = ganttTasksData.filter(t => t.start && t.end);

        res.render('projects/gantt', { // New view: views/projects/gantt.ejs
            title: `Gantt Chart - ${project.name}`,
            pageTitle: `Gantt Chart: ${project.name}`,
            project: project,
            ganttTasksData: validGanttTasks,
            layout: './layouts/main_layout'
        });

    } catch (error) {
        console.error("Error in showGanttChart:", error);
        next(error);
    }
};

/*
// @desc    Handle creation of a new task dependency
// @route   POST /projects/:projectId/dependencies/create
// @access  Private (Requires project access with specific roles)
exports.handleCreateDependency = async (req, res, next) => {
    const projectId = req.params.projectId;
    const { successor_task_id, predecessor_task_id, dependency_type, lag_days } = req.body;
    // checkProjectAccess middleware should have already run and set req.projectContext

    let errors = [];
    if (!successor_task_id) errors.push("Successor task is required.");
    if (!predecessor_task_id) errors.push("Predecessor task is required.");
    if (successor_task_id === predecessor_task_id) errors.push("A task cannot depend on itself.");

    // TODO: Add validation to check if both tasks belong to the projectId
    // TODO: Add validation for circular dependencies (more complex)

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        return res.redirect(`/projects/${projectId}/gantt`); // Or back to wherever the form was
    }

    try {
        const newDependency = {
            project_id: projectId, // Now we have project_id in task_dependencies
            task_id: parseInt(successor_task_id),
            depends_on_task_id: parseInt(predecessor_task_id),
            dependency_type: dependency_type || 'FS',
            lag_days: parseInt(lag_days) || 0
        };

        await db.query("INSERT INTO task_dependencies SET ?", newDependency);
        req.flash('success_msg', 'Task dependency created successfully.');
        res.redirect(`/projects/${projectId}/gantt`);

    } catch (error) {
        console.error("Error creating task dependency:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            req.flash('error_msg', 'This dependency already exists.');
        } else {
            req.flash('error_msg', 'Server error creating dependency.');
        }
        res.redirect(`/projects/${projectId}/gantt`);
    }
};
*/

// @desc    Handle creation of a new task dependency
// @route   POST /projects/:projectId/dependencies/create
// @access  Private (Requires project access with specific roles)
exports.handleCreateDependency = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId); // Ensure projectId is number for comparisons
    const { successor_task_id, predecessor_task_id, dependency_type, lag_days } = req.body;
    const userId = req.session.user.id; // For audit or further checks if needed

    let errors = [];
    const numSuccessorId = parseInt(successor_task_id);
    const numPredecessorId = parseInt(predecessor_task_id);

    if (!numSuccessorId || isNaN(numSuccessorId)) errors.push("Successor task ID is invalid.");
    if (!numPredecessorId || isNaN(numPredecessorId)) errors.push("Predecessor task ID is invalid.");
    if (numSuccessorId === numPredecessorId) errors.push("A task cannot depend on itself.");

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(' '));
        return res.redirect(`/projects/${projectId}/gantt`);
    }

    try {
        // Validation 1: Check if both tasks belong to the projectId
        const [tasksExist] = await db.query(
            'SELECT id, project_id FROM tasks WHERE id IN (?, ?) AND project_id = ?',
            [numSuccessorId, numPredecessorId, projectId]
        );

        let successorTaskBelongs = false;
        let predecessorTaskBelongs = false;
        tasksExist.forEach(task => {
            if (task.id === numSuccessorId && task.project_id === projectId) successorTaskBelongs = true;
            if (task.id === numPredecessorId && task.project_id === projectId) predecessorTaskBelongs = true;
        });

        if (tasksExist.length < 2 || !successorTaskBelongs || !predecessorTaskBelongs) {
             // Check if exactly two distinct tasks were found for this project
            let missingTasks = [];
            if (!tasksExist.find(t => t.id === numSuccessorId && t.project_id === projectId)) missingTasks.push(`Successor task (ID: ${numSuccessorId})`);
            if (!tasksExist.find(t => t.id === numPredecessorId && t.project_id === projectId)) missingTasks.push(`Predecessor task (ID: ${numPredecessorId})`);
            
            if(missingTasks.length > 0) {
                 req.flash('error_msg', `${missingTasks.join(' and ')} not found in this project.`);
                 return res.redirect(`/projects/${projectId}/gantt`);
            }
        }
        
        // Validation 2: Basic circular dependency check (A->B then B->A for FS type)
        // For now, checking if the reverse dependency already exists.
        // A full cycle detection is much more complex (A->B->C->A) and deferred.
        if (dependency_type === 'FS' || !dependency_type) { // Assuming FS is default
            const [reverseDependency] = await db.query(
                'SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ? AND project_id = ? AND dependency_type = ?',
                [numPredecessorId, numSuccessorId, projectId, 'FS']
            );
            if (reverseDependency.length > 0) {
                req.flash('error_msg', 'This would create a circular dependency (B cannot depend on A if A already depends on B).');
                return res.redirect(`/projects/${projectId}/gantt`);
            }
        }
        
        // Validation 3: Check if dependency already exists (covered by unique key, but good to check)
        const [existingDependency] = await db.query(
            'SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ? AND project_id = ? AND dependency_type = ?',
            [numSuccessorId, numPredecessorId, projectId, dependency_type || 'FS']
        );
        if(existingDependency.length > 0){
            req.flash('info_msg', 'This task dependency already exists.');
            return res.redirect(`/projects/${projectId}/gantt`);
        }


        const newDependency = {
            project_id: projectId,
            task_id: numSuccessorId,
            depends_on_task_id: numPredecessorId,
            dependency_type: dependency_type || 'FS',
            lag_days: parseInt(lag_days) || 0
        };

        await db.query("INSERT INTO task_dependencies SET ?", newDependency);
        req.flash('success_msg', 'Task dependency created successfully.');
        res.redirect(`/projects/${projectId}/gantt`);

    } catch (error) {
        console.error("Error creating task dependency:", error);
        if (error.code === 'ER_DUP_ENTRY') { // Should be caught by validation 3 now
            req.flash('error_msg', 'This dependency already exists.');
        } else {
            req.flash('error_msg', 'Server error creating dependency. ' + error.message);
        }
        res.redirect(`/projects/${projectId}/gantt`);
    }
};

/*
// @desc    Handle deletion of a task dependency
// @route   POST /projects/:projectId/dependencies/:dependencyId/delete
// @access  Private (Requires project access with specific roles)
exports.handleDeleteDependency = async (req, res, next) => {
    const projectId = req.params.projectId;
    const dependencyId = req.params.dependencyId;
    // checkProjectAccess middleware should have already run

    try {
        const [result] = await db.query("DELETE FROM task_dependencies WHERE id = ? AND project_id = ?", [dependencyId, projectId]);
        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Task dependency deleted successfully.');
        } else {
            req.flash('error_msg', 'Dependency not found or could not be deleted.');
        }
        res.redirect(`/projects/${projectId}/gantt`);
    } catch (error) {
        console.error("Error deleting task dependency:", error);
        req.flash('error_msg', 'Server error deleting dependency.');
        res.redirect(`/projects/${projectId}/gantt`);
    }
};


*/

// ... (handleDeleteDependency remains largely the same, ensure it checks projectId)
// @desc    Handle deletion of a task dependency
// @route   POST /projects/:projectId/dependencies/:dependencyId/delete
// @access  Private (Requires project access with specific roles)
exports.handleDeleteDependency = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId); // Ensure projectId is number
    const dependencyId = parseInt(req.params.dependencyId);

    if (isNaN(dependencyId)) {
        req.flash('error_msg', 'Invalid dependency ID.');
        return res.redirect(`/projects/${projectId}/gantt`);
    }

    try {
        // Ensure the dependency belongs to the project before deleting
        const [result] = await db.query("DELETE FROM task_dependencies WHERE id = ? AND project_id = ?", [dependencyId, projectId]);
        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Task dependency deleted successfully.');
        } else {
            req.flash('error_msg', 'Dependency not found for this project or could not be deleted.');
        }
        res.redirect(`/projects/${projectId}/gantt`);
    } catch (error) {
        console.error("Error deleting task dependency:", error);
        req.flash('error_msg', 'Server error deleting dependency.');
        res.redirect(`/projects/${projectId}/gantt`);
    }
};



