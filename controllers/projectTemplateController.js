// Avenircon/controllers/projectTemplateController.js
const db = require('../config/db');


// At the top of projectTemplateController.js, or as a local helper
function buildTaskTree(tasks, parentId = null) {
  const tree = [];
  // Filter tasks that are children of the current parentId
  const childrenOfParent = tasks.filter(task => {
    // Handle both NULL and explicit parentId for top-level tasks
    if (parentId === null) {
      return task.parent_template_task_id === null || task.parent_template_task_id === undefined;
    }
    return task.parent_template_task_id === parentId;
  });
  
  // Sort children by task_order
  childrenOfParent.sort((a, b) => a.task_order - b.task_order);
  
  for (const task of childrenOfParent) {
    // Recursively find children for the current task
    const children = buildTaskTree(tasks, task.id);
    if (children.length) {
      task.children = children; // Attach children to the task object
    }
    tree.push(task); // Add the task (with its children) to the tree
  }
  return tree;
}


// @desc    List templates created by the logged-in user
// @route   GET /projects/templates
// @access  Private (User must be authenticated)
exports.listUserTemplates = async (req, res, next) => {
  // Placeholder - To be implemented in Step 1.7
  try {
    // TODO: Fetch templates for req.session.user.id where is_system_template = false
    const templates = []; // Placeholder
    res.render('projects/templates/list', { // Assumes this view will be created
      title: 'My Project Templates',
      pageTitle: 'My Project Templates',
      templates: templates,
      layout: './layouts/main_layout'
    });
  } catch (error) {
    console.error('Error in listUserTemplates:', error);
    next(error);
  }
};

// @desc    Show the form/modal to save an existing project as a template
// @route   GET /projects/:projectId/save-as-template-form (or handled by modal on project details)
// @access  Private (User must have access to the project)
exports.showSaveAsTemplateForm = async (req, res, next) => {
  // This might not be a dedicated page if using a modal.
  // If it were a page, you'd fetch project details.
  // For now, this logic will likely be part of the project details page triggering a modal.
  // We'll focus on handleSaveProjectAsTemplate first.
  res.send('Placeholder for showing save as template form/modal trigger info.');
};

/*
// @desc    Handle saving an existing project as a new template
// @route   POST /projects/:projectId/save-as-template
// @access  Private (User must have access to the project)
exports.handleSaveProjectAsTemplate = async (req, res, next) => {
  // Placeholder - To be implemented in Step 1.5
  const { projectId } = req.params;
  const { templateName, templateDescription } = req.body;
  const userId = req.session.user.id;
  
  // Basic validation
  if (!templateName || templateName.trim() === '') {
    req.flash('error_msg', 'Template name is required.');
    return res.redirect(req.headers.referer || `/projects/${projectId}/details`);
  }
  
  try {
    // TODO: Full implementation (DB transaction, fetch tasks, insert into template tables)
    req.flash('info_msg', `Placeholder: Save project ${projectId} as template "${templateName}" for user ${userId}. Description: ${templateDescription}`);
    res.redirect(`/projects/${projectId}/details`); // Or to template list page later
  } catch (error) {
    console.error('Error in handleSaveProjectAsTemplate:', error);
    if (error.code === 'ER_DUP_ENTRY') { // Example for unique constraint on template name
      req.flash('error_msg', 'A template with this name already exists.');
    } else {
      req.flash('error_msg', 'Could not save project as template.');
    }
    res.redirect(req.headers.referer || `/projects/${projectId}/details`);
  }
};
*/

exports.handleSaveProjectAsTemplate = async (req, res, next) => {
  const { projectId } = req.params; // This is source_project_id
  const { templateName, templateDescription } = req.body;
  const userId = req.session.user.id;
  
  if (!templateName || templateName.trim() === '') {
    req.flash('error_msg', 'Template name is required.');
    return res.redirect(req.headers.referer || `/projects/${projectId}/details`);
  }
  
  let connection; // For transaction management
  try {
    connection = await db.getConnection(); // Get a connection from the pool
    await connection.beginTransaction();
    
    // 1. Check if a template with this name already exists for the user
    const [existingTemplates] = await connection.query(
      "SELECT id FROM project_templates WHERE name = ? AND created_by_id = ? AND is_system_template = FALSE",
      [templateName.trim(), userId]
    );
    if (existingTemplates.length > 0) {
      await connection.rollback(); // Rollback before redirecting
      connection.release();
      req.flash('error_msg', 'You already have a template with this name. Please choose a different name.');
      return res.redirect(req.headers.referer || `/projects/${projectId}/details`);
    }
    
    // 2. Insert into project_templates table
    const newTemplate = {
      name: templateName.trim(),
      description: templateDescription ? templateDescription.trim() : null,
      created_by_id: userId,
      is_system_template: false, // User-created templates are not system templates by default
      source_project_id: projectId
    };
    const [templateResult] = await connection.query('INSERT INTO project_templates SET ?', newTemplate);
    const newProjectTemplateId = templateResult.insertId;
    
    // 3. Fetch all tasks from the source project
    const [sourceTasks] = await connection.query(
      `SELECT id, parent_task_id, name, description, planned_duration_days, task_order, is_milestone 
             FROM tasks 
             WHERE project_id = ? 
             ORDER BY parent_task_id ASC, task_order ASC`, // Order matters for easier hierarchy processing
      [projectId]
    );
    
    if (sourceTasks.length === 0) {
      // Project has no tasks, still create the template shell but warn user? Or disallow?
      // For now, allow empty template.
      await connection.commit();
      connection.release();
      req.flash('success_msg', `Template "${templateName.trim()}" created successfully (it has no tasks as the source project was empty).`);
      return res.redirect('/projects/templates'); // Redirect to template list
    }
    
    // 4. Fetch dependencies for the source project
    const [sourceDependencies] = await connection.query(
      `SELECT task_id, depends_on_task_id, dependency_type, lag_days
             FROM task_dependencies
             WHERE project_id = ?`,
      [projectId]
    );
    
    // Map: original_source_task_id -> new_project_template_task_id
    const taskMap = {};
    
    // 5. Insert tasks into project_template_tasks (handling hierarchy)
    // We need to insert parent tasks first, or handle parent_template_task_id updates later.
    // A common way is to iterate, insert, and then update parent IDs, or use recursion.
    // For simplicity with ORDER BY, we can try a multi-pass approach if tasks are ordered correctly.
    // Simpler first pass: insert all, then update parent IDs.
    
    const templateTasksToInsert = [];
    for (const task of sourceTasks) {
      templateTasksToInsert.push({
        project_template_id: newProjectTemplateId,
        original_source_task_id: task.id, // Store the original ID
        parent_template_task_id: null, // Will be updated later if parent_task_id exists
        name: task.name,
        description: task.description,
        planned_duration_days: task.planned_duration_days,
        task_order: task.task_order,
        is_milestone: task.is_milestone,
        // Dependency fields will be set after all template tasks are created and mapped
        depends_on_original_id: null,
        dependency_type: 'FS', // Default, will be updated
        dependency_lag_days: 0 // Default, will be updated
      });
    }
    
    // Insert all template tasks and build the map
    for (const tt of templateTasksToInsert) {
      const [taskInsertResult] = await connection.query('INSERT INTO project_template_tasks SET ?', {
        project_template_id: tt.project_template_id,
        original_source_task_id: tt.original_source_task_id,
        parent_template_task_id: tt.parent_template_task_id, // still null here
        name: tt.name,
        description: tt.description,
        planned_duration_days: tt.planned_duration_days,
        task_order: tt.task_order,
        is_milestone: tt.is_milestone
        // Dependency fields are not set in this initial insert
      });
      taskMap[tt.original_source_task_id] = taskInsertResult.insertId; // Map: original_task_id -> new_template_task_id
    }
    
    // Update parent_template_task_id for hierarchical tasks
    for (const task of sourceTasks) {
      if (task.parent_task_id && taskMap[task.parent_task_id] && taskMap[task.id]) {
        await connection.query(
          'UPDATE project_template_tasks SET parent_template_task_id = ? WHERE id = ?',
          [taskMap[task.parent_task_id], taskMap[task.id]]
        );
      }
    }
    
    // Update dependency information in project_template_tasks
    for (const dep of sourceDependencies) {
      const successorTemplateTaskId = taskMap[dep.task_id]; // New ID of the task that depends
      const predecessorOriginalId = dep.depends_on_task_id; // Original ID of the task it depended on
      
      if (successorTemplateTaskId && predecessorOriginalId) { // Check if both parts of the dependency were mapped
        await connection.query(
          `UPDATE project_template_tasks 
                     SET depends_on_original_id = ?, dependency_type = ?, dependency_lag_days = ? 
                     WHERE id = ?`,
          [predecessorOriginalId, dep.dependency_type, dep.lag_days, successorTemplateTaskId]
        );
      }
    }
    
    await connection.commit();
    req.flash('success_msg', `Project structure saved as template: "${templateName.trim()}"`);
    res.redirect('/projects/templates'); // Redirect to the list of templates
    
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error in handleSaveProjectAsTemplate:', error);
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uk_user_template_name')) {
      req.flash('error_msg', 'A template with this name already exists for your account.');
    } else {
      req.flash('error_msg', 'Could not save project as template. ' + error.message);
    }
    res.redirect(req.headers.referer || `/projects/${projectId}/details`);
  } finally {
    if (connection) {
      connection.release(); // Release connection back to the pool
    }
  }
};

// Avenircon/controllers/projectTemplateController.js
//const db = require('../config/db');

// ... (showSaveAsTemplateForm placeholder, handleSaveProjectAsTemplate implemented above) ...

exports.listUserTemplates = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    // Fetch user-created templates. Optionally join with projects to get source_project_name
    const [templates] = await db.query(
      `SELECT pt.*, p.name as source_project_name 
             FROM project_templates pt
             LEFT JOIN projects p ON pt.source_project_id = p.id
             WHERE pt.created_by_id = ? AND pt.is_system_template = FALSE 
             ORDER BY pt.name ASC`,
      [userId]
    );
    
    res.render('projects/templates/list', {
      title: 'My Project Templates',
      pageTitle: 'My Project Templates',
      templates: templates,
      layout: './layouts/main_layout'
    });
  } catch (error) {
    console.error('Error in listUserTemplates:', error);
    next(error);
  }
};


exports.handleDeleteUserTemplate = async (req, res, next) => {
  const { templateId } = req.params;
  const userId = req.session.user.id;
  try {
    // Verify ownership before deleting and ensure it's not a system template
    const [result] = await db.query(
      "DELETE FROM project_templates WHERE id = ? AND created_by_id = ? AND is_system_template = FALSE",
      [templateId, userId]
    );
    
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'Project template deleted successfully.');
    } else {
      req.flash('error_msg', 'Template not found or you do not have permission to delete it.');
    }
    res.redirect('/projects/templates');
  } catch (error) {
    console.error('Error in handleDeleteUserTemplate:', error);
    req.flash('error_msg', 'Could not delete template. ' + error.message);
    res.redirect('/projects/templates');
  }
};




// --- ADMIN SPECIFIC METHODS (for System Templates) ---




// @desc    List all system project templates for Admin
// @route   GET /admin/project-templates
// @access  Admin
exports.listSystemTemplates = async (req, res, next) => {
  try {
    const [templates] = await db.query(
      `SELECT pt.*, u.username as creator_username 
             FROM project_templates pt
             LEFT JOIN users u ON pt.created_by_id = u.id 
             WHERE pt.is_system_template = TRUE 
             ORDER BY pt.name ASC`
    );
    res.render('admin/project_templates/list', {
      title: 'System Project Templates',
      pageTitle: 'Manage System Project Templates',
      templates: templates,
      user: req.session.user,
      layout: './layouts/admin_layout'
    });
  } catch (error) {
    console.error('Error in listSystemTemplates:', error);
    next(error);
  }
};




// @desc    Show form to create a new system project template for Admin
// @route   GET /admin/project-templates/create
// @access  Admin
exports.showCreateSystemTemplateForm = (req, res, next) => {
  res.render('admin/project_templates/create', {
    title: 'Create System Template',
    pageTitle: 'Create New System Project Template',
    formData: {},
    errors: [],
    user: req.session.user,
    layout: './layouts/admin_layout'
  });
};



// @desc    Handle creation of a new system project template by Admin
// @route   POST /admin/project-templates/create
// @access  Admin
exports.handleCreateSystemTemplate = async (req, res, next) => {
  const { name, description } = req.body;
  let errors = [];
  if (!name || name.trim() === '') {
    errors.push({ msg: 'Template name is required.' });
  }

  if (errors.length > 0) {
    return res.render('admin/project_templates/create', {
      title: 'Create System Template',
      pageTitle: 'Create New System Project Template',
      formData: req.body,
      errors: errors,
      user: req.session.user,
      layout: './layouts/admin_layout'
    });
  }

  try {
    // Check if a system template with this name already exists
    const [existing] = await db.query(
        "SELECT id FROM project_templates WHERE name = ? AND is_system_template = TRUE",
        [name.trim()]
    );
    if (existing.length > 0) {
        errors.push({ msg: 'A system template with this name already exists.' });
        return res.render('admin/project_templates/create', {
            title: 'Create System Template',
            pageTitle: 'Create New System Project Template',
            formData: req.body,
            errors: errors,
            user: req.session.user,
            layout: './layouts/admin_layout'
        });
    }

    const newTemplate = {
      name: name.trim(),
      description: description ? description.trim() : null,
      is_system_template: true,
      created_by_id: req.session.user.id, // Admin user creating it, can also be NULL
      // template_data or tasks will be managed separately or in a more advanced form later
    };
    await db.query('INSERT INTO project_templates SET ?', newTemplate);
    req.flash('success_msg', 'System project template created successfully. You can add tasks to it via an editing interface (future feature).');
    res.redirect('/admin/project-templates');
  } catch (error) {
    console.error('Error in handleCreateSystemTemplate:', error);
    errors.push({ msg: 'Could not create system template. ' + (error.message || '') });
    res.render('admin/project_templates/create', {
        title: 'Create System Template',
        pageTitle: 'Create New System Project Template',
        formData: req.body,
        errors: errors,
        user: req.session.user,
        layout: './layouts/admin_layout'
    });
  }
};


// @desc    Show form to edit an existing system project template for Admin
// @route   GET /admin/project-templates/:templateId/edit
// @access  Admin
exports.showEditSystemTemplateForm = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const [templates] = await db.query(
      "SELECT * FROM project_templates WHERE id = ? AND is_system_template = TRUE",
      [templateId]
    );
    if (templates.length === 0) {
      req.flash('error_msg', 'System template not found.');
      return res.redirect('/admin/project-templates');
    }
    res.render('admin/project_templates/edit', {
      title: 'Edit System Template',
      pageTitle: 'Edit System Project Template',
      template: templates[0],
      errors: [],
      user: req.session.user,
      layout: './layouts/admin_layout'
    });
  } catch (error) {
    console.error('Error in showEditSystemTemplateForm:', error);
    next(error);
  }
};
/*
// @desc    Handle update of an existing system project template by Admin
// @route   POST /admin/project-templates/:templateId/edit
// @access  Admin
exports.handleUpdateSystemTemplate = async (req, res, next) => {
  const { templateId } = req.params;
  const { name, description } = req.body;
  let errors = [];

  if (!name || name.trim() === '') {
    errors.push({ msg: 'Template name is required.' });
  }

  if (errors.length > 0) {
    // Refetch template data for rendering the form with errors
    const [templates] = await db.query("SELECT * FROM project_templates WHERE id = ? AND is_system_template = TRUE", [templateId]);
    return res.render('admin/project_templates/edit', {
      title: 'Edit System Template',
      pageTitle: 'Edit System Project Template',
      template: templates.length > 0 ? { ...templates[0], ...req.body } : req.body, // Use fetched if exists, else just body
      errors: errors,
      user: req.session.user,
      layout: './layouts/admin_layout'
    });
  }

  try {
    // Check if another system template with this name already exists (excluding current one)
    const [existing] = await db.query(
        "SELECT id FROM project_templates WHERE name = ? AND is_system_template = TRUE AND id != ?",
        [name.trim(), templateId]
    );
    if (existing.length > 0) {
        errors.push({ msg: 'Another system template with this name already exists.' });
        const [currentTemplate] = await db.query("SELECT * FROM project_templates WHERE id = ? AND is_system_template = TRUE", [templateId]);
        return res.render('admin/project_templates/edit', {
            title: 'Edit System Template',
            pageTitle: 'Edit System Project Template',
            template: currentTemplate.length > 0 ? { ...currentTemplate[0], ...req.body } : req.body,
            errors: errors,
            user: req.session.user,
            layout: './layouts/admin_layout'
        });
    }

    const [result] = await db.query(
      "UPDATE project_templates SET name = ?, description = ? WHERE id = ? AND is_system_template = TRUE",
      [name.trim(), description ? description.trim() : null, templateId]
    );
    if (result.affectedRows === 0) {
      req.flash('error_msg', 'System template not found or no changes made.');
    } else {
      req.flash('success_msg', 'System project template updated successfully.');
    }
    res.redirect('/admin/project-templates');
  } catch (error) {
    console.error('Error in handleUpdateSystemTemplate:', error);
    errors.push({ msg: 'Could not update system template. ' + (error.message || '') });
    const [currentTemplate] = await db.query("SELECT * FROM project_templates WHERE id = ? AND is_system_template = TRUE", [templateId]);
    res.render('admin/project_templates/edit', {
        title: 'Edit System Template',
        pageTitle: 'Edit System Project Template',
        template: currentTemplate.length > 0 ? { ...currentTemplate[0], ...req.body } : req.body,
        errors: errors,
        user: req.session.user,
        layout: './layouts/admin_layout'
    });
  }
};
*/


// projectTemplateController.js

// @desc    Handle update of an existing system project template by Admin
// @route   POST /admin/project-templates/:templateId/edit
// @access  Admin
exports.handleUpdateSystemTemplate = async (req, res, next) => {
  const templateIdParam = req.params.templateId; // Get as string from params
  const { name, description } = req.body;
  let errors = [];

  if (!name || name.trim() === '') {
    errors.push({ msg: 'Template name is required.' });
  }

  // Ensure templateId is a valid integer
  const templateId = parseInt(templateIdParam);
  if (isNaN(templateId)) {
    req.flash('error_msg', 'Invalid template ID.');
    return res.redirect('/admin/project-templates'); // Or handle more gracefully
  }

  // Helper function to re-render edit form with errors
  const renderEditFormWithErrors = async (currentErrors) => {
    try {
        const [templates] = await db.query("SELECT * FROM project_templates WHERE id = ? AND is_system_template = TRUE", [templateId]);
        const templateDataForForm = templates.length > 0 ? { ...templates[0], ...req.body } : { id: templateId, ...req.body };
        return res.render('admin/project_templates/edit', {
            title: 'Edit System Template',
            pageTitle: 'Edit System Project Template',
            template: templateDataForForm,
            errors: currentErrors,
            // user: req.session.user, // Assuming user is available via res.locals
            layout: './layouts/admin_layout'
        });
    } catch (fetchError) {
        console.error("Error fetching template for error re-render:", fetchError);
        req.flash('error_msg', 'An error occurred. Please try again.');
        return res.redirect('/admin/project-templates');
    }
  };

  if (errors.length > 0) {
    return await renderEditFormWithErrors(errors);
  }

  try {
    // Check if another system template with this name already exists (excluding current one)
    const [existing] = await db.query(
        "SELECT id FROM project_templates WHERE name = ? AND is_system_template = TRUE AND id != ?",
        [name.trim(), templateId] // templateId is now guaranteed to be an integer
    );

    if (existing.length > 0) {
        errors.push({ msg: 'Another system template with this name already exists.' });
        return await renderEditFormWithErrors(errors);
    }

    const [result] = await db.query(
      "UPDATE project_templates SET name = ?, description = ?, updated_at = NOW() WHERE id = ? AND is_system_template = TRUE", // Added updated_at
      [name.trim(), description ? description.trim() : null, templateId]
    );

    if (result.affectedRows === 0) {
      req.flash('error_msg', 'System template not found or no changes made.');
    } else {
      req.flash('success_msg', 'System project template updated successfully.');
    }
    res.redirect('/admin/project-templates');

  } catch (error) {
    console.error('Error in handleUpdateSystemTemplate:', error); // Log the actual error
    errors.push({ msg: 'Could not update system template. ' + (error.sqlMessage || error.message || '') });
    return await renderEditFormWithErrors(errors);
  }
};



// @desc    Handle deletion of a system project template by Admin
// @route   POST /admin/project-templates/:templateId/delete
// @access  Admin
exports.handleDeleteSystemTemplate = async (req, res, next) => {
  const { templateId } = req.params;
  try {
    // Also delete associated tasks from project_template_tasks
    await db.query("DELETE FROM project_template_tasks WHERE project_template_id = ?", [templateId]);
    const [result] = await db.query(
      "DELETE FROM project_templates WHERE id = ? AND is_system_template = TRUE",
      [templateId]
    );
    if (result.affectedRows > 0) {
      req.flash('success_msg', 'System project template and its tasks deleted successfully.');
    } else {
      req.flash('error_msg', 'System template not found.');
    }
    res.redirect('/admin/project-templates');
  } catch (error) {
    console.error('Error in handleDeleteSystemTemplate:', error);
    req.flash('error_msg', 'Could not delete system template. ' + (error.message || ''));
    res.redirect('/admin/project-templates');
  }
};




// --- TEMPLATE TASK MANAGEMENT (ADMIN) ---

// @desc    List tasks for a specific system project template
// @route   GET /admin/project-templates/:templateId/tasks
// @access  Admin
exports.listTemplateTasks = async (req, res, next) => {
    try {
        const templateId = parseInt(req.params.templateId);
        if (isNaN(templateId)) {
            req.flash('error_msg', 'Invalid template ID.');
            return res.redirect('/admin/project-templates');
        }

        const [templateRows] = await db.query(
            "SELECT id, name FROM project_templates WHERE id = ? AND is_system_template = TRUE",
            [templateId]
        );
        if (templateRows.length === 0) {
            req.flash('error_msg', 'System template not found.');
            return res.redirect('/admin/project-templates');
        }
        const template = templateRows[0];

        const [tasksRaw] = await db.query(
            `SELECT * FROM project_template_tasks 
             WHERE project_template_id = ? 
             ORDER BY COALESCE(parent_template_task_id, id), task_order ASC, name ASC`, // Sort for hierarchy
            [templateId]
        );

        // Function to build task hierarchy (similar to project tasks)
        const buildTemplateTaskHierarchy = (taskList) => {
            const taskMap = {};
            const roots = [];
            taskList.forEach(task => {
                taskMap[task.id] = { ...task, children: [] };
            });
            taskList.forEach(task => {
                if (task.parent_template_task_id && taskMap[task.parent_template_task_id]) {
                    taskMap[task.parent_template_task_id].children.push(taskMap[task.id]);
                } else {
                    roots.push(taskMap[task.id]);
                }
            });
            // Optional: Recursively sort children if task_order needs more granular control within each level
            // const sortChildrenRecursive = (nodes) => { ... };
            // sortChildrenRecursive(roots);
            return roots;
        };

        const tasksHierarchy = buildTemplateTaskHierarchy(tasksRaw);

        res.render('admin/project_templates/tasks/list', {
            title: `Tasks for Template: ${template.name}`,
            pageTitle: `Manage Tasks for Template: "${template.name}"`,
            template: template,
            tasks: tasksHierarchy, // Hierarchical tasks
            // user: req.session.user, // Assumed available via res.locals
            layout: './layouts/admin_layout'
        });

    } catch (error) {
        console.error('Error listing template tasks:', error);
        next(error);
    }
};

// @desc    Show form to create a new task for a system template
// @route   GET /admin/project-templates/:templateId/tasks/create
// @access  Admin
exports.showCreateTemplateTaskForm = async (req, res, next) => {
    try {
        const templateId = parseInt(req.params.templateId);
        const parentTemplateTaskIdQuery = req.query.parent_task_id ? parseInt(req.query.parent_task_id) : null;

        if (isNaN(templateId)) {
            req.flash('error_msg', 'Invalid template ID.');
            return res.redirect('/admin/project-templates');
        }

        const [templateRows] = await db.query("SELECT id, name FROM project_templates WHERE id = ? AND is_system_template = TRUE", [templateId]);
        if (templateRows.length === 0) {
            req.flash('error_msg', 'System template not found.');
            return res.redirect('/admin/project-templates');
        }
        const template = templateRows[0];

        const [potentialParentTasks] = await db.query(
            "SELECT id, name FROM project_template_tasks WHERE project_template_id = ? ORDER BY name ASC",
            [templateId]
        );

        res.render('admin/project_templates/tasks/create', {
            title: `Add Task to Template: ${template.name}`,
            pageTitle: 'Add New Template Task',
            subTitle: `For Template: ${template.name}`,
            template: template,
            potentialParentTasks: potentialParentTasks,
            parent_template_task_id_query: parentTemplateTaskIdQuery,
            formData: req.session.createTemplateTaskFormData || {},
            errors: req.session.createTemplateTaskErrors || [],
            layout: './layouts/admin_layout'
        });
        delete req.session.createTemplateTaskFormData;
        delete req.session.createTemplateTaskErrors;
    } catch (error) {
        console.error('Error showing create template task form:', error);
        next(error);
    }
};

// @desc    Handle creation of a new task for a system template
// @route   POST /admin/project-templates/:templateId/tasks/create
// @access  Admin
exports.handleCreateTemplateTask = async (req, res, next) => {
    const templateId = parseInt(req.params.templateId);
    const { name, description, planned_duration_days, task_order, parent_template_task_id, is_milestone } = req.body;
    let errors = [];

    if (isNaN(templateId)) {
        req.flash('error_msg', 'Invalid template ID.');
        return res.redirect('/admin/project-templates'); // Or a more specific error page
    }

    if (!name || name.trim() === '') errors.push({ msg: 'Task name is required.' });
    if (name && name.length > 255) errors.push({ msg: 'Task name is too long.' });

    let numDuration = null;
    if (planned_duration_days && planned_duration_days.trim() !== '') {
        numDuration = parseInt(planned_duration_days);
        if (isNaN(numDuration) || numDuration < 0) errors.push({ msg: 'Planned duration must be a non-negative integer.' });
    }

    let numTaskOrder = null;
    if (task_order && task_order.trim() !== '') {
        numTaskOrder = parseInt(task_order);
        if (isNaN(numTaskOrder)) errors.push({ msg: 'Task order must be an integer.' });
    }
    
    let numParentId = null;
    if (parent_template_task_id && parent_template_task_id.trim() !== '') {
        numParentId = parseInt(parent_template_task_id);
        if (isNaN(numParentId)) {
            errors.push({ msg: 'Invalid parent task ID.' });
        } else {
            // Verify parent task belongs to the same template
            const [parentCheck] = await db.query(
                "SELECT id FROM project_template_tasks WHERE id = ? AND project_template_id = ?",
                [numParentId, templateId]
            );
            if (parentCheck.length === 0) errors.push({ msg: 'Selected parent task is invalid or does not belong to this template.' });
        }
    }


    if (errors.length > 0) {
        req.session.createTemplateTaskFormData = req.body;
        req.session.createTemplateTaskErrors = errors;
        return res.redirect(`/admin/project-templates/${templateId}/tasks/create${parent_template_task_id ? '?parent_task_id=' + parent_template_task_id : ''}`);
    }

    try {
        const newTemplateTask = {
            project_template_id: templateId,
            name: name.trim(),
            description: description ? description.trim() : null,
            planned_duration_days: numDuration,
            task_order: numTaskOrder,
            parent_template_task_id: numParentId,
            is_milestone: is_milestone === 'on' || is_milestone === 'true' ? true : false
        };

        await db.query('INSERT INTO project_template_tasks SET ?', newTemplateTask);
        req.flash('success_msg', 'Template task created successfully.');
        res.redirect(`/admin/project-templates/${templateId}/tasks`);
    } catch (error) {
        console.error('Error creating template task:', error);
        req.session.createTemplateTaskFormData = req.body;
        req.session.createTemplateTaskErrors = [{ msg: 'Server error: ' + error.message }];
        res.redirect(`/admin/project-templates/${templateId}/tasks/create${parent_template_task_id ? '?parent_task_id=' + parent_template_task_id : ''}`);
    }
};

// @desc    Show form to edit an existing task for a system template
// @route   GET /admin/project-templates/:templateId/tasks/:taskId/edit
// @access  Admin
exports.showEditTemplateTaskForm = async (req, res, next) => {
    try {
        const templateId = parseInt(req.params.templateId);
        const taskId = parseInt(req.params.taskId); // This is project_template_tasks.id

        if (isNaN(templateId) || isNaN(taskId)) {
            req.flash('error_msg', 'Invalid template or task ID.');
            return res.redirect('/admin/project-templates');
        }

        const [templateRows] = await db.query("SELECT id, name FROM project_templates WHERE id = ? AND is_system_template = TRUE", [templateId]);
        if (templateRows.length === 0) {
            req.flash('error_msg', 'System template not found.');
            return res.redirect('/admin/project-templates');
        }
        const template = templateRows[0];

        const [taskRows] = await db.query(
            "SELECT * FROM project_template_tasks WHERE id = ? AND project_template_id = ?",
            [taskId, templateId]
        );
        if (taskRows.length === 0) {
            req.flash('error_msg', 'Template task not found.');
            return res.redirect(`/admin/project-templates/${templateId}/tasks`);
        }
        const taskToEdit = taskRows[0];

        // Fetch potential parent tasks (excluding current task and its descendants to prevent loops)
        // This query is a simplification; a recursive CTE would be more robust for descendants.
        const [potentialParentTasks] = await db.query(
            "SELECT id, name FROM project_template_tasks WHERE project_template_id = ? AND id != ? ORDER BY name ASC",
            [templateId, taskId]
        );

        res.render('admin/project_templates/tasks/edit', {
            title: `Edit Task in Template: ${template.name}`,
            pageTitle: `Edit Template Task: "${taskToEdit.name}"`,
            subTitle: `For Template: ${template.name}`,
            template: template,
            taskToEdit: taskToEdit,
            potentialParentTasks: potentialParentTasks,
            formData: req.session.editTemplateTaskFormData || taskToEdit,
            errors: req.session.editTemplateTaskErrors || [],
            layout: './layouts/admin_layout'
        });
        delete req.session.editTemplateTaskFormData;
        delete req.session.editTemplateTaskErrors;

    } catch (error) {
        console.error('Error showing edit template task form:', error);
        next(error);
    }
};

// @desc    Handle update of an existing task for a system template
// @route   POST /admin/project-templates/:templateId/tasks/:taskId/edit
// @access  Admin
exports.handleUpdateTemplateTask = async (req, res, next) => {
    const templateId = parseInt(req.params.templateId);
    const taskId = parseInt(req.params.taskId); // project_template_tasks.id
    const { name, description, planned_duration_days, task_order, parent_template_task_id, is_milestone } = req.body;
    let errors = [];

    if (isNaN(templateId) || isNaN(taskId)) {
        req.flash('error_msg', 'Invalid template or task ID.');
        return res.redirect('/admin/project-templates');
    }

    // Basic Validations (similar to create)
    if (!name || name.trim() === '') errors.push({ msg: 'Task name is required.' });
    // ... Add other validations as in create ...
    let numDuration = null;
    if (planned_duration_days && planned_duration_days.trim() !== '') {
        numDuration = parseInt(planned_duration_days);
        if (isNaN(numDuration) || numDuration < 0) errors.push({ msg: 'Planned duration must be a non-negative integer.' });
    }
    let numTaskOrder = null;
    if (task_order && task_order.trim() !== '') {
        numTaskOrder = parseInt(task_order);
        if (isNaN(numTaskOrder)) errors.push({ msg: 'Task order must be an integer.' });
    }
    let numParentId = null;
    if (parent_template_task_id && parent_template_task_id.trim() !== '') {
        numParentId = parseInt(parent_template_task_id);
        if (isNaN(numParentId)) {
            errors.push({ msg: 'Invalid parent task ID.' });
        } else if (numParentId === taskId) {
            errors.push({ msg: 'A task cannot be its own parent.' });
        } else {
            const [parentCheck] = await db.query(
                "SELECT id FROM project_template_tasks WHERE id = ? AND project_template_id = ?",
                [numParentId, templateId]
            );
            if (parentCheck.length === 0) errors.push({ msg: 'Selected parent task is invalid.' });
            // More complex check: prevent making a task a child of its own descendant (circular dependency) - harder to do without recursive query
        }
    }


    if (errors.length > 0) {
        req.session.editTemplateTaskFormData = { ...req.body, id: taskId }; // Add id for form action if needed
        req.session.editTemplateTaskErrors = errors;
        return res.redirect(`/admin/project-templates/${templateId}/tasks/${taskId}/edit`);
    }

    try {
        const updatedTemplateTask = {
            name: name.trim(),
            description: description ? description.trim() : null,
            planned_duration_days: numDuration,
            task_order: numTaskOrder,
            parent_template_task_id: numParentId,
            is_milestone: is_milestone === 'on' || is_milestone === 'true' ? true : false
        };

        const [result] = await db.query(
            'UPDATE project_template_tasks SET ? WHERE id = ? AND project_template_id = ?',
            [updatedTemplateTask, taskId, templateId]
        );

        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Template task updated successfully.');
        } else {
            req.flash('error_msg', 'Template task not found or no changes made.');
        }
        res.redirect(`/admin/project-templates/${templateId}/tasks`);

    } catch (error) {
        console.error('Error updating template task:', error);
        req.session.editTemplateTaskFormData = { ...req.body, id: taskId };
        req.session.editTemplateTaskErrors = [{ msg: 'Server error: ' + error.message }];
        res.redirect(`/admin/project-templates/${templateId}/tasks/${taskId}/edit`);
    }
};

// @desc    Handle deletion of a task from a system template
// @route   POST /admin/project-templates/:templateId/tasks/:taskId/delete
// @access  Admin
exports.handleDeleteTemplateTask = async (req, res, next) => {
    const templateId = parseInt(req.params.templateId);
    const taskId = parseInt(req.params.taskId); // project_template_tasks.id

    if (isNaN(templateId) || isNaN(taskId)) {
        req.flash('error_msg', 'Invalid template or task ID.');
        return res.redirect('/admin/project-templates');
    }

    try {
        // If parent_template_task_id has ON DELETE CASCADE, children will be deleted automatically.
        // Otherwise, check for children and prevent deletion or delete them recursively.
        const [children] = await db.query(
            "SELECT id FROM project_template_tasks WHERE parent_template_task_id = ?", [taskId]
        );
        if (children.length > 0) {
            // For simplicity, let's assume ON DELETE CASCADE is NOT set and prevent deletion.
            // A more robust solution would recursively delete or re-parent.
            // OR, if you want to allow it and have ON DELETE CASCADE in DB, this check isn't strictly needed
            // but good for user feedback.
            req.flash('error_msg', 'Cannot delete task: it has sub-tasks. Please delete sub-tasks first.');
            return res.redirect(`/admin/project-templates/${templateId}/tasks`);
        }

        // Also, consider dependencies if Phase 2 (template task dependencies) is implemented.

        const [result] = await db.query(
            "DELETE FROM project_template_tasks WHERE id = ? AND project_template_id = ?",
            [taskId, templateId]
        );

        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Template task deleted successfully.');
        } else {
            req.flash('error_msg', 'Template task not found or already deleted.');
        }
        res.redirect(`/admin/project-templates/${templateId}/tasks`);
    } catch (error) {
        console.error('Error deleting template task:', error);
        req.flash('error_msg', 'Server error deleting template task: ' + error.message);
        res.redirect(`/admin/project-templates/${templateId}/tasks`);
    }
};



exports.showEditTemplateStructureForm = async (req, res, next) => {
  const { templateId } = req.params;
  const adminUser = req.session.user; // Assuming user session has admin info
  
  try {
    // 1. Fetch the system template details
    const [templateRows] = await db.query(
      'SELECT * FROM project_templates WHERE id = ? AND is_system_template = TRUE',
      [templateId]
    );
    
    if (templateRows.length === 0) {
      req.flash('error', 'System template not found or access denied.');
      return res.redirect('/admin/project-templates'); // Or to a 404 page
    }
    const template = templateRows[0];
    
    // 2. Fetch all project_template_tasks for this templateId
    const [allTemplateTasks] = await db.query(
      'SELECT * FROM project_template_tasks WHERE project_template_id = ? ORDER BY task_order ASC, name ASC', // Added default sort
      [templateId]
    );
    
    // 3. Build the hierarchical task structure
    const hierarchicalTasks = buildTaskTree(allTemplateTasks); // Uses the helper function
    
    // 4. Fetch dependencies (we'll use this later, but good to fetch now)
    const [dependencies] = await db.query(
      'SELECT * FROM project_template_task_dependencies WHERE project_template_id = ?',
      [templateId]
    );
    
    res.render('admin/project_templates/edit_structure', {
      title: `Edit Structure: ${template.name}`,
      layout: 'layout/admin_layout',
      user: adminUser,
      template: template,
      tasks: hierarchicalTasks, // Pass the structured tasks
      dependencies: dependencies, // Pass dependencies
      currentMenu: 'project_templates', // For sidebar active state
      messages: req.flash() // For displaying flash messages
    });
    
  } catch (error) {
    console.error("Error in showEditTemplateStructureForm:", error);
    req.flash('error', 'Failed to load template structure. Please try again.');
    // Redirect back to the list or an error page
    // Consider passing to next(error) for a centralized error handler
    return res.redirect('/admin/project-templates');
  }
};



exports.handleAddTemplateTask = async (req, res, next) => {
  const { templateId } = req.params; // templateId from URL
  const {
    name,
    description,
    planned_duration_days,
    parent_template_task_id, // This will come from the modal form for sub-tasks
    is_milestone
    // Note: req.body might also contain templateId if we sent it from the modal form body.
    // It's good practice to rely on the URL param for the main resource ID (templateId).
  } = req.body;
  
  // Basic Validation
  if (!name || name.trim() === '') {
    req.flash('error', 'Task name is required.');
    return res.redirect(`/admin/project-templates/${templateId}/structure`);
  }
  
  const duration = planned_duration_days ? parseInt(planned_duration_days, 10) : 1;
  if (isNaN(duration) || duration < 0) {
    req.flash('error', 'Invalid planned duration.');
    return res.redirect(`/admin/project-templates/${templateId}/structure`);
  }
  
  const milestoneFlag = is_milestone === 'true' || is_milestone === true;
  const parentId = parent_template_task_id && parent_template_task_id.trim() !== '' ? parseInt(parent_template_task_id, 10) : null;
  
  try {
    let task_order;
    
    if (parentId) {
      // This is a sub-task. Calculate task_order relative to siblings.
      // First, verify the parent task exists within the same template.
      const [parentCheck] = await db.query(
        'SELECT id FROM project_template_tasks WHERE id = ? AND project_template_id = ?',
        [parentId, templateId]
      );
      if (parentCheck.length === 0) {
        req.flash('error', 'Invalid parent task specified.');
        return res.redirect(`/admin/project-templates/${templateId}/structure`);
      }
      
      const [orderResult] = await db.query(
        'SELECT COALESCE(MAX(task_order), -1) + 1 AS next_order FROM project_template_tasks WHERE project_template_id = ? AND parent_template_task_id = ?',
        [templateId, parentId]
      );
      task_order = orderResult[0].next_order;
    } else {
      // This is a top-level task.
      const [orderResult] = await db.query(
        'SELECT COALESCE(MAX(task_order), -1) + 1 AS next_order FROM project_template_tasks WHERE project_template_id = ? AND parent_template_task_id IS NULL',
        [templateId]
      );
      task_order = orderResult[0].next_order;
    }
    
    // Construct SQL INSERT statement
    const sql = `
            INSERT INTO project_template_tasks 
            (project_template_id, name, description, planned_duration_days, is_milestone, task_order, parent_template_task_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?) 
        `;
    
    const [result] = await db.query(sql, [
      templateId,
      name.trim(),
      description ? description.trim() : null,
      duration,
      milestoneFlag,
      task_order,
      parentId // Use the parsed parentId (can be NULL)
    ]);
    
    if (result.affectedRows > 0) {
      req.flash('success', `Template ${parentId ? 'sub-task' : 'task'} added successfully.`);
    } else {
      req.flash('error', 'Failed to add template task.');
    }
    res.redirect(`/admin/project-templates/${templateId}/structure`);
    
  } catch (error) {
    console.error("Error in handleAddTemplateTask:", error);
    req.flash('error', 'An error occurred while adding the task. Please try again.');
    res.redirect(`/admin/project-templates/${templateId}/structure`);
  }
};


// ... (other methods like handleAddTemplateTask)

exports.getTemplateTaskDetails = async (req, res, next) => {
  const { templateId, taskId } = req.params; // templateId to ensure task belongs to the template
  
  try {
    const [taskRows] = await db.query(
      'SELECT * FROM project_template_tasks WHERE id = ? AND project_template_id = ?',
      [taskId, templateId]
    );
    
    if (taskRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Template task not found.' });
    }
    
    res.json({ success: true, task: taskRows[0] });
    
  } catch (error) {
    console.error("Error in getTemplateTaskDetails:", error);
    res.status(500).json({ success: false, message: 'Failed to fetch task details.' });
  }
};

// ... (exports.getTemplateTaskDetails, etc.)

exports.handleUpdateTemplateTask = async (req, res, next) => {
  const { templateId, taskId } = req.params; // From URL
  const {
    name,
    description,
    planned_duration_days,
    is_milestone
    // Note: We are NOT handling parent_template_task_id or task_order changes here.
    // That would be a more complex "move" operation.
  } = req.body;
  
  // Basic Validation
  if (!name || name.trim() === '') {
    req.flash('error', 'Task name is required.');
    return res.redirect(`/admin/project-templates/${templateId}/structure`);
  }
  
  const duration = planned_duration_days ? parseInt(planned_duration_days, 10) : 1;
  if (isNaN(duration) || duration < 0) {
    req.flash('error', 'Invalid planned duration.');
    return res.redirect(`/admin/project-templates/${templateId}/structure`);
  }
  
  const milestoneFlag = is_milestone === 'true' || is_milestone === true;
  
  try {
    // Verify the task exists and belongs to the template before updating
    const [taskCheck] = await db.query(
      'SELECT id FROM project_template_tasks WHERE id = ? AND project_template_id = ?',
      [taskId, templateId]
    );
    
    if (taskCheck.length === 0) {
      req.flash('error', 'Template task not found or access denied.');
      return res.redirect(`/admin/project-templates/${templateId}/structure`);
    }
    
    // Construct SQL UPDATE statement
    const sql = `
            UPDATE project_template_tasks 
            SET name = ?, 
                description = ?, 
                planned_duration_days = ?, 
                is_milestone = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND project_template_id = ?
        `;
    
    const [result] = await db.query(sql, [
      name.trim(),
      description ? description.trim() : null,
      duration,
      milestoneFlag,
      taskId,
      templateId
    ]);
    
    if (result.affectedRows > 0) {
      req.flash('success', 'Template task updated successfully.');
    } else {
      // This case might occur if the data submitted was identical to what's in the DB,
      // or if the task was deleted by another process just before update.
      // For simplicity, we can treat it as success if no error, or add specific message.
      req.flash('info', 'Template task data was unchanged or update was not required.');
    }
    res.redirect(`/admin/project-templates/${templateId}/structure`);
    
  } catch (error) {
    console.error("Error in handleUpdateTemplateTask:", error);
    req.flash('error', 'An error occurred while updating the task. Please try again.');
    res.redirect(`/admin/project-templates/${templateId}/structure`);
  }
};

// Inside exports or module.exports object in projectTemplateController.js

// ... (exports.handleUpdateTemplateTask, etc.)


exports.handleRemoveTemplateTask = async (req, res, next) => {
  const { templateId, taskId } = req.params;
  const adminUser = req.session.user; // For audit logging later, if needed
  
  try {
    // Step 1: Verify the task exists and belongs to the template
    const [taskCheck] = await db.query(
      'SELECT id FROM project_template_tasks WHERE id = ? AND project_template_id = ?',
      [taskId, templateId]
    );
    
    if (taskCheck.length === 0) {
      // Send JSON response as this will likely be called via AJAX
      return res.status(404).json({ success: false, message: 'Template task not found or access denied.' });
    }
    
    // Step 2: Delete the task.
    // The ON DELETE CASCADE constraints on `parent_template_task_id` in `project_template_tasks`
    // and on `pt_task_id`/`depends_on_pt_task_id` in `project_template_task_dependencies`
    // should handle deletion of children and associated dependencies automatically.
    
    const [result] = await db.query(
      'DELETE FROM project_template_tasks WHERE id = ? AND project_template_id = ?',
      [taskId, templateId]
    );
    
    if (result.affectedRows > 0) {
      // If we need to log this action:
      // await auditLogController.logAction(adminUser.id, 'TEMPLATE_TASK_DELETED', 'project_template_tasks', taskId, { templateId: templateId });
      return res.json({ success: true, message: 'Template task and its sub-tasks (if any) deleted successfully.' });
    } else {
      // Should not happen if taskCheck passed, but as a safeguard
      return res.status(400).json({ success: false, message: 'Failed to delete template task. It might have been already deleted.' });
    }
    
  } catch (error) {
    console.error("Error in handleDeleteTemplateTask:", error);
    // Sentry.captureException(error); // If using error tracking
    res.status(500).json({ success: false, message: 'An error occurred while deleting the template task.' });
  }
};



// Inside exports or module.exports object

exports.handleReorderTemplateTasks = async (req, res, next) => {
  const { templateId } = req.params;
  const { movedTaskId, newParentId, orderedTaskIds } = req.body; // orderedTaskIds is an array of task IDs in their new order
  
  if (!orderedTaskIds || !Array.isArray(orderedTaskIds)) {
    return res.status(400).json({ success: false, message: 'Invalid task order data.' });
  }
  
  // Use a transaction to ensure all updates are atomic
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    // Step 1: Update the parent_id of the moved task IF it actually changed parent
    // We also need to get its old parent to correctly re-order the source list if needed,
    // but for this simplified approach, we're re-ordering the entire target list.
    // The movedTaskId will be part of orderedTaskIds, its parent will be set along with its order.
    
    // Step 2: Update the task_order for all tasks in the target list (orderedTaskIds)
    // and set their parent_id to newParentId.
    for (let i = 0; i < orderedTaskIds.length; i++) {
      const currentTaskId = orderedTaskIds[i];
      const newOrder = i;
      
      await connection.query(
        `UPDATE project_template_tasks 
                 SET task_order = ?, parent_template_task_id = ? 
                 WHERE id = ? AND project_template_id = ?`,
        [newOrder, newParentId ? parseInt(newParentId) : null, parseInt(currentTaskId), parseInt(templateId)]
      );
    }
    
    await connection.commit();
    res.json({ success: true, message: 'Task order updated successfully.' });
    
  } catch (error) {
    await connection.rollback();
    console.error("Error in handleReorderTemplateTasks:", error);
    res.status(500).json({ success: false, message: 'Failed to update task order.' });
  } finally {
    if (connection) connection.release();
  }
};


/*
// @desc    Handle deleting a user-created project template
// @route   POST /projects/templates/:templateId/delete
// @access  Private (User must own the template)
exports.handleDeleteUserTemplate = async (req, res, next) => {
  // Placeholder - To be implemented in Step 1.7
  const { templateId } = req.params;
  const userId = req.session.user.id;
  try {
    // TODO: Verify ownership and delete
    req.flash('info_msg', `Placeholder: Delete template ${templateId} for user ${userId}.`);
    res.redirect('/projects/templates');
  } catch (error) {
    console.error('Error in handleDeleteUserTemplate:', error);
    req.flash('error_msg', 'Could not delete template.');
    res.redirect('/projects/templates');
  }
};
*/
// --- Admin specific methods (for System Templates - Future Phase) ---
// exports.listAllTemplatesForAdmin = async (req, res, next) => {};
// exports.showCreateSystemTemplateForm = async (req, res, next) => {};
// exports.handleCreateSystemTemplate = async (req, res, next) => {};
// exports.handleToggleSystemTemplateStatus = async (req, res, next) => {};
// exports.handleDeleteSystemTemplate = async (req, res, next) => {};





// ... (handleDeleteUserTemplate placeholder) ...