//controllers/projectMemberController.js

const db = require('../config/db');

// ... (added methods: getProjectMembers, showAddMemberForm, handleAddMemberToProject, handleRemoveMemberFromProject, showEditMemberRoleForm, and handleUpdateMemberRole) ...

// Service function to list members of a specific project
exports.getProjectMembers = async (projectId) => {
    if (!projectId) {
        throw new Error('Project ID is required to fetch members.');
    }
    try {
        const query = `
            SELECT 
                pm.id as project_member_id, 
                pm.role_in_project, 
                pm.added_at,
                u.id as user_id, 
                u.username, 
                u.email, 
                u.first_name, 
                u.last_name,
                COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), u.username) AS display_name
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
            ORDER BY u.first_name ASC, u.last_name ASC, u.username ASC;
        `;
        const [members] = await db.query(query, [projectId]);
        return members;
    } catch (error) {
        console.error(`Error fetching members for project ${projectId}:`, error);
        throw new Error('Failed to retrieve project members.');
    }
};

// @desc    Show form to add a new member to a project
// @route   GET /projects/:projectId/members/add
// @access  Private (Requires project access with roles like 'Project Manager')
exports.showAddMemberForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        // projectForContext is set by checkProjectAccess middleware
        const projectForContext = req.projectContext;

        if (!projectForContext) {
            req.flash('error_msg', 'Project context is missing.');
            return res.redirect('/dashboard');
        }

        // Fetch users who are NOT already members of this project
        // And are active, and potentially filter by app-level roles if needed
        const query = `
            SELECT u.id, u.username, u.first_name, u.last_name, u.role as app_role,
                   COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), u.username) AS display_name
            FROM users u
            LEFT JOIN project_members pm ON u.id = pm.user_id AND pm.project_id = ?
            WHERE u.is_active = TRUE AND pm.id IS NULL  /* pm.id IS NULL means they are not a member */
            ORDER BY u.first_name ASC, u.last_name ASC, u.username ASC;
        `;
        const [potentialNewMembers] = await db.query(query, [projectId]);

        // Define roles that can be assigned within a project (could be from a config or hardcoded)
        const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];
        // Note: Assigning 'Project Manager' here might also need to update projects.project_manager_id if this user
        // becomes the primary PM. For simplicity now, we allow assigning it as a role_in_project.

        res.render('projects/members/add_member', { // New EJS view
            title: `Add Member to ${projectForContext.name}`,
            pageTitle: 'Add New Project Member',
            subTitle: `For Project: ${projectForContext.name}`,
            project: projectForContext,
            potentialNewMembers: potentialNewMembers,
            projectRolesAssignable: projectRolesAssignable,
            formData: req.session.addMemberFormData || {},
            errors: req.session.addMemberErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.addMemberFormData;
        delete req.session.addMemberErrors;

    } catch (error) {
        console.error("Error showing add member form:", error);
        next(error);
    }
};

// @desc    Handle adding a new member to a project
// @route   POST /projects/:projectId/members/add
// @access  Private (Requires project access with roles like 'Project Manager')
exports.handleAddMemberToProject = async (req, res, next) => {
    const projectId = req.params.projectId;
    // projectForContext set by middleware
    const projectForContext = req.projectContext; 
    const { user_id_select, role_in_project_select } = req.body;
    let errors = [];

    if (!projectForContext) { // Failsafe
        req.flash('error_msg', 'Project context error.');
        return res.redirect('/dashboard');
    }
    
    const userIdToAdd = parseInt(user_id_select);
    if (!userIdToAdd || isNaN(userIdToAdd)) {
        errors.push({ param: 'user_id_select', msg: 'Please select a user to add.' });
    }

    const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];
    if (!role_in_project_select || !projectRolesAssignable.includes(role_in_project_select)) {
        errors.push({ param: 'role_in_project_select', msg: 'Please select a valid role for the user in this project.' });
    }

    // Check if user is already a member (should be filtered by form, but good backend check)
    if (userIdToAdd) {
        const [existingMember] = await db.query(
            "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
            [projectId, userIdToAdd]
        );
        if (existingMember.length > 0) {
            errors.push({ param: 'user_id_select', msg: 'This user is already a member of the project.' });
        }
        // Also check if the user exists in the main users table
        const [userExists] = await db.query("SELECT id FROM users WHERE id = ?", [userIdToAdd]);
        if (userExists.length === 0) {
            errors.push({ param: 'user_id_select', msg: 'Selected user does not exist.' });
        }
    }


    if (errors.length > 0) {
        req.session.addMemberFormData = req.body;
        req.session.addMemberErrors = errors;
        return res.redirect(`/projects/${projectId}/members/add`);
    }

    try {
        await db.query(
            "INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)",
            [projectId, userIdToAdd, role_in_project_select]
        );

        // If assigning 'Project Manager' role here, and this user is not the current projects.project_manager_id,
        // consider if projects.project_manager_id should also be updated. This can be complex.
        // For now, this just adds them to project_members with that role.
        // The main projects.project_manager_id is still managed via the project edit form.

        req.flash('success_msg', 'User successfully added to the project.');
        res.redirect(`/projects/${projectId}/details#project-members-section`);

    } catch (error) {
        console.error("Error adding member to project:", error);
        if (error.code === 'ER_DUP_ENTRY') { // Or check for unique constraint violation specifically
            req.flash('error_msg', 'This user is already a member of the project.');
        } else {
            req.flash('error_msg', 'Server error while adding member. Please try again.');
        }
        req.session.addMemberFormData = req.body;
        req.session.addMemberErrors = errors.length > 0 ? errors : [{msg: 'Failed to add member due to a server issue.'}];
        res.redirect(`/projects/${projectId}/members/add`);
    }
};


// @desc    Handle removing a member from a project
// @route   POST /projects/:projectId/members/:projectMemberId/remove  (Using project_member_id from the table)
// @access  Private (Requires project access with roles like 'Project Manager')
exports.handleRemoveMemberFromProject = async (req, res, next) => {
    const projectId = req.params.projectId; // Validated by middleware
    const projectMemberIdToRemove = parseInt(req.params.projectMemberId); // This is the ID from project_members table

    if (isNaN(projectMemberIdToRemove)) {
        req.flash('error_msg', 'Invalid member identifier.');
        return res.redirect(`/projects/${projectId}/details#project-members-section`);
    }

    try {
        // Fetch the member details to check if they are the project_manager_id
        const [memberDetails] = await db.query(
            `SELECT pm.user_id, p.project_manager_id 
             FROM project_members pm
             JOIN projects p ON pm.project_id = p.id
             WHERE pm.id = ? AND pm.project_id = ?`,
            [projectMemberIdToRemove, projectId]
        );

        if (memberDetails.length === 0) {
            req.flash('error_msg', 'Member not found in this project.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }

        // Business Rule: Cannot remove the designated project_manager_id from the project via this simple action.
        // They must be unassigned as PM from the main project edit form first.
        if (memberDetails[0].user_id === memberDetails[0].project_manager_id) {
            req.flash('error_msg', 'This user is the designated Project Manager. To remove them, first assign a different Project Manager or unassign them via the project edit page.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }
        
        // Business Rule: Prevent user from removing themselves if they are an Admin or PM for this project (unless more complex logic is added)
        // For simplicity, let's assume checkProjectAccess already ensures the current user has rights to manage.
        // An additional check might be: if req.session.user.id === memberDetails[0].user_id, prevent self-removal if it impacts their ability to manage.


        const [result] = await db.query(
            "DELETE FROM project_members WHERE id = ? AND project_id = ?",
            [projectMemberIdToRemove, projectId]
        );

        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Member removed from project successfully.');
        } else {
            req.flash('error_msg', 'Could not remove member. They might have already been removed.');
        }
        res.redirect(`/projects/${projectId}/details#project-members-section`);

    } catch (error) {
        console.error("Error removing member from project:", error);
        req.flash('error_msg', 'Server error while removing member. Please try again.');
        res.redirect(`/projects/${projectId}/details#project-members-section`);
    }
};



// @desc    Show form to edit a project member's role
// @route   GET /projects/:projectId/members/:projectMemberId/edit-role
// @access  Private (Requires project access with projectManageMembersRoles)
exports.showEditMemberRoleForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const projectMemberId = parseInt(req.params.projectMemberId);
        const projectForContext = req.projectContext; // From middleware

        if (!projectForContext) {
            req.flash('error_msg', 'Project context is missing.');
            return res.redirect('/dashboard');
        }
        if (isNaN(projectMemberId)) {
            req.flash('error_msg', 'Invalid member identifier.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }

        // Fetch the current member's details including user info
        const query = `
            SELECT 
                pm.id as project_member_id, 
                pm.role_in_project,
                u.id as user_id, 
                u.username,
                COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), u.username) AS display_name
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.id = ? AND pm.project_id = ?;
        `;
        const [memberRows] = await db.query(query, [projectMemberId, projectId]);

        if (memberRows.length === 0) {
            req.flash('error_msg', 'Project member not found.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }
        const memberToEdit = memberRows[0];

        // Prevent editing role of the designated project_manager_id via this simple form
        // Role changes for the designated PM should ideally be tied to changing the PM on the project edit page.
        const [projectDetails] = await db.query("SELECT project_manager_id FROM projects WHERE id = ?", [projectId]);
        if (projectDetails.length > 0 && memberToEdit.user_id === projectDetails[0].project_manager_id) {
             req.flash('info_msg', `The role for the designated Project Manager (${memberToEdit.display_name}) is managed via the main project edit page.`);
            // Optionally, you could disable the role dropdown in the EJS or just show info.
            // For now, we'll still show the form but the handleUpdate might prevent change.
        }


        const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];

        res.render('projects/members/edit_member_role', { // New EJS view
            title: `Edit Role for ${memberToEdit.display_name}`,
            pageTitle: `Edit Member Role: ${memberToEdit.display_name}`,
            subTitle: `In Project: ${projectForContext.name}`,
            project: projectForContext,
            member: memberToEdit,
            projectRolesAssignable: projectRolesAssignable,
            formData: req.session.editMemberRoleFormData || { role_in_project_select: memberToEdit.role_in_project },
            errors: req.session.editMemberRoleErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editMemberRoleFormData;
        delete req.session.editMemberRoleErrors;

    } catch (error) {
        console.error("Error showing edit member role form:", error);
        next(error);
    }
};

// @desc    Handle updating a project member's role
// @route   POST /projects/:projectId/members/:projectMemberId/edit-role
// @access  Private (Requires project access with projectManageMembersRoles)
exports.handleUpdateMemberRole = async (req, res, next) => {
    const projectId = req.params.projectId;
    const projectMemberId = parseInt(req.params.projectMemberId);
    const { role_in_project_select } = req.body;
    const projectForContext = req.projectContext; // From middleware
    let errors = [];

    if (!projectForContext) {
        req.flash('error_msg', 'Project context error.');
        return res.redirect('/dashboard');
    }
    if (isNaN(projectMemberId)) {
        req.flash('error_msg', 'Invalid member identifier.');
        return res.redirect(`/projects/${projectId}/details#project-members-section`);
    }
    
    const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];
    if (!role_in_project_select || !projectRolesAssignable.includes(role_in_project_select)) {
        errors.push({ param: 'role_in_project_select', msg: 'Please select a valid role.' });
    }

    // Fetch member to ensure they exist and to check if they are the designated PM
    let memberToUpdate;
    try {
        const [memberRows] = await db.query(
            `SELECT pm.user_id, p.project_manager_id 
             FROM project_members pm
             JOIN projects p ON pm.project_id = p.id
             WHERE pm.id = ? AND pm.project_id = ?`,
            [projectMemberId, projectId]
        );
        if (memberRows.length === 0) {
            req.flash('error_msg', 'Project member not found for update.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }
        memberToUpdate = memberRows[0];

        // Business Rule: If trying to change the role of the *designated* project_manager_id to something
        // other than 'Project Manager', prevent it or handle with care.
        // The projects.project_manager_id should be the source of truth for who the main PM is.
        if (memberToUpdate.user_id === memberToUpdate.project_manager_id && role_in_project_select !== 'Project Manager') {
            errors.push({ param: 'role_in_project_select', msg: `Cannot change the role of the designated Project Manager (${memberToUpdate.user_id === req.session.user.id ? 'yourself' : 'this user'}) from 'Project Manager' here. Use the main project edit page to change the designated Project Manager.` });
        }
        // Business Rule: Cannot assign 'Project Manager' role via this form if that user isn't the designated projects.project_manager_id
        // This is to avoid having multiple "acting" PMs unless specifically intended and handled.
        // The designated PM is set on the project edit page.
        // If you assign 'Project Manager' role here to someone else, they become a PM in project_members,
        // but projects.project_manager_id remains unchanged. This can be confusing.
        // A simpler rule: You can't make someone a 'Project Manager' via this form if they are not already the designated PM.
        // Or, if they become 'Project Manager', also update projects.project_manager_id.
        // For now, let's allow setting 'Project Manager' role here, but acknowledge it doesn't change the designated PM field on the project.

    } catch (dbError) {
        console.error("Error fetching member for role update check:", dbError);
        return next(dbError);
    }


    if (errors.length > 0) {
        req.session.editMemberRoleFormData = req.body; // Keep submitted value
        req.session.editMemberRoleErrors = errors;
        return res.redirect(`/projects/${projectId}/members/${projectMemberId}/edit-role`);
    }

    try {
        await db.query(
            "UPDATE project_members SET role_in_project = ? WHERE id = ? AND project_id = ?",
            [role_in_project_select, projectMemberId, projectId]
        );
        
        // If a user was made 'Project Manager' here AND they are NOT the current projects.project_manager_id
        // AND the current projects.project_manager_id is NULL or different,
        // a more advanced system might prompt to update projects.project_manager_id.
        // For now, we keep it simple: this form only changes the role in project_members.
        // The edit project page is the authority for projects.project_manager_id.
        if (role_in_project_select === 'Project Manager' && memberToUpdate.user_id !== memberToUpdate.project_manager_id) {
             req.flash('info_msg', `User's role in project set to 'Project Manager'. Note: This does not change the designated Project Manager for the project unless updated on the project edit page.`);
        }


        req.flash('success_msg', 'Member role updated successfully.');
        res.redirect(`/projects/${projectId}/details#project-members-section`);

    } catch (error) {
        console.error("Error updating member role:", error);
        req.session.editMemberRoleFormData = req.body;
        req.session.editMemberRoleErrors = errors.length > 0 ? errors : [{msg: 'Server error while updating member role.'}];
        res.redirect(`/projects/${projectId}/members/${projectMemberId}/edit-role`);
    }
};




/*
//controllers/projectMemberController.js
const db = require('../config/db');

// Service function to list members of a specific project
exports.getProjectMembers = async (projectId) => {
    if (!projectId) {
        throw new Error('Project ID is required to fetch members.');
    }
    try {
        const query = `
            SELECT 
                pm.id as project_member_id, 
                pm.role_in_project, 
                pm.added_at,
                u.id as user_id, 
                u.username, 
                u.email, 
                u.first_name, 
                u.last_name,
                COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), u.username) AS display_name
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
            ORDER BY u.first_name ASC, u.last_name ASC, u.username ASC;
        `;
        const [members] = await db.query(query, [projectId]);
        return members;
    } catch (error) {
        console.error(`Error fetching members for project ${projectId}:`, error);
        throw new Error('Failed to retrieve project members.');
    }
};

// We'll add more methods here later (add member, remove member, etc.)

// @desc    Show form to add a new member to a project
// @route   GET /projects/:projectId/members/add
// @access  Private (Requires project access with roles like 'Project Manager')
exports.showAddMemberForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        // projectForContext is set by checkProjectAccess middleware
        const projectForContext = req.projectContext;

        if (!projectForContext) {
            req.flash('error_msg', 'Project context is missing.');
            return res.redirect('/dashboard');
        }

        // Fetch users who are NOT already members of this project
        // And are active, and potentially filter by app-level roles if needed
        const query = `
            SELECT u.id, u.username, u.first_name, u.last_name, u.role as app_role,
                   COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), u.username) AS display_name
            FROM users u
            LEFT JOIN project_members pm ON u.id = pm.user_id AND pm.project_id = ?
            WHERE u.is_active = TRUE AND pm.id IS NULL   
            ORDER BY u.first_name ASC, u.last_name ASC, u.username ASC;
        `;
        const [potentialNewMembers] = await db.query(query, [projectId]);

        // Define roles that can be assigned within a project (could be from a config or hardcoded)
        const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];
        // Note: Assigning 'Project Manager' here might also need to update projects.project_manager_id if this user
        // becomes the primary PM. For simplicity now, we allow assigning it as a role_in_project.

        res.render('projects/members/add_member', { // New EJS view
            title: `Add Member to ${projectForContext.name}`,
            pageTitle: 'Add New Project Member',
            subTitle: `For Project: ${projectForContext.name}`,
            project: projectForContext,
            potentialNewMembers: potentialNewMembers,
            projectRolesAssignable: projectRolesAssignable,
            formData: req.session.addMemberFormData || {},
            errors: req.session.addMemberErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.addMemberFormData;
        delete req.session.addMemberErrors;

    } catch (error) {
        console.error("Error showing add member form:", error);
        next(error);
    }
};

// @desc    Handle adding a new member to a project
// @route   POST /projects/:projectId/members/add
// @access  Private (Requires project access with roles like 'Project Manager')
exports.handleAddMemberToProject = async (req, res, next) => {
    const projectId = req.params.projectId;
    // projectForContext set by middleware
    const projectForContext = req.projectContext; 
    const { user_id_select, role_in_project_select } = req.body;
    let errors = [];

    if (!projectForContext) { // Failsafe
        req.flash('error_msg', 'Project context error.');
        return res.redirect('/dashboard');
    }
    
    const userIdToAdd = parseInt(user_id_select);
    if (!userIdToAdd || isNaN(userIdToAdd)) {
        errors.push({ param: 'user_id_select', msg: 'Please select a user to add.' });
    }

    const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];
    if (!role_in_project_select || !projectRolesAssignable.includes(role_in_project_select)) {
        errors.push({ param: 'role_in_project_select', msg: 'Please select a valid role for the user in this project.' });
    }

    // Check if user is already a member (should be filtered by form, but good backend check)
    if (userIdToAdd) {
        const [existingMember] = await db.query(
            "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
            [projectId, userIdToAdd]
        );
        if (existingMember.length > 0) {
            errors.push({ param: 'user_id_select', msg: 'This user is already a member of the project.' });
        }
        // Also check if the user exists in the main users table
        const [userExists] = await db.query("SELECT id FROM users WHERE id = ?", [userIdToAdd]);
        if (userExists.length === 0) {
            errors.push({ param: 'user_id_select', msg: 'Selected user does not exist.' });
        }
    }


    if (errors.length > 0) {
        req.session.addMemberFormData = req.body;
        req.session.addMemberErrors = errors;
        return res.redirect(`/projects/${projectId}/members/add`);
    }

    try {
        await db.query(
            "INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_in_project = VALUES(role_in_project)",
            [projectId, userIdToAdd, role_in_project_select]
        );

        // If assigning 'Project Manager' role here, and this user is not the current projects.project_manager_id,
        // consider if projects.project_manager_id should also be updated. This can be complex.
        // For now, this just adds them to project_members with that role.
        // The main projects.project_manager_id is still managed via the project edit form.

        req.flash('success_msg', 'User successfully added to the project.');
        res.redirect(`/projects/${projectId}/details#project-members-section`);

    } catch (error) {
        console.error("Error adding member to project:", error);
        if (error.code === 'ER_DUP_ENTRY') { // Or check for unique constraint violation specifically
            req.flash('error_msg', 'This user is already a member of the project.');
        } else {
            req.flash('error_msg', 'Server error while adding member. Please try again.');
        }
        req.session.addMemberFormData = req.body;
        req.session.addMemberErrors = errors.length > 0 ? errors : [{msg: 'Failed to add member due to a server issue.'}];
        res.redirect(`/projects/${projectId}/members/add`);
    }
};


// @desc    Handle removing a member from a project
// @route   POST /projects/:projectId/members/:projectMemberId/remove  (Using project_member_id from the table)
// @access  Private (Requires project access with roles like 'Project Manager')
exports.handleRemoveMemberFromProject = async (req, res, next) => {
    const projectId = req.params.projectId; // Validated by middleware
    const projectMemberIdToRemove = parseInt(req.params.projectMemberId); // This is the ID from project_members table

    if (isNaN(projectMemberIdToRemove)) {
        req.flash('error_msg', 'Invalid member identifier.');
        return res.redirect(`/projects/${projectId}/details#project-members-section`);
    }

    try {
        // Fetch the member details to check if they are the project_manager_id
        const [memberDetails] = await db.query(
            `SELECT pm.user_id, p.project_manager_id 
             FROM project_members pm
             JOIN projects p ON pm.project_id = p.id
             WHERE pm.id = ? AND pm.project_id = ?`,
            [projectMemberIdToRemove, projectId]
        );

        if (memberDetails.length === 0) {
            req.flash('error_msg', 'Member not found in this project.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }

        // Business Rule: Cannot remove the designated project_manager_id from the project via this simple action.
        // They must be unassigned as PM from the main project edit form first.
        if (memberDetails[0].user_id === memberDetails[0].project_manager_id) {
            req.flash('error_msg', 'This user is the designated Project Manager. To remove them, first assign a different Project Manager or unassign them via the project edit page.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }
        
        // Business Rule: Prevent user from removing themselves if they are an Admin or PM for this project (unless more complex logic is added)
        // For simplicity, let's assume checkProjectAccess already ensures the current user has rights to manage.
        // An additional check might be: if req.session.user.id === memberDetails[0].user_id, prevent self-removal if it impacts their ability to manage.


        const [result] = await db.query(
            "DELETE FROM project_members WHERE id = ? AND project_id = ?",
            [projectMemberIdToRemove, projectId]
        );

        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Member removed from project successfully.');
        } else {
            req.flash('error_msg', 'Could not remove member. They might have already been removed.');
        }
        res.redirect(`/projects/${projectId}/details#project-members-section`);

    } catch (error) {
        console.error("Error removing member from project:", error);
        req.flash('error_msg', 'Server error while removing member. Please try again.');
        res.redirect(`/projects/${projectId}/details#project-members-section`);
    }
};



// @desc    Show form to edit a project member's role
// @route   GET /projects/:projectId/members/:projectMemberId/edit-role
// @access  Private (Requires project access with projectManageMembersRoles)
exports.showEditMemberRoleForm = async (req, res, next) => {
    try {
        const projectId = req.params.projectId;
        const projectMemberId = parseInt(req.params.projectMemberId);
        const projectForContext = req.projectContext; // From middleware

        if (!projectForContext) {
            req.flash('error_msg', 'Project context is missing.');
            return res.redirect('/dashboard');
        }
        if (isNaN(projectMemberId)) {
            req.flash('error_msg', 'Invalid member identifier.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }

        // Fetch the current member's details including user info
        const query = `
            SELECT 
                pm.id as project_member_id, 
                pm.role_in_project,
                u.id as user_id, 
                u.username,
                COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), u.username) AS display_name
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.id = ? AND pm.project_id = ?;
        `;
        const [memberRows] = await db.query(query, [projectMemberId, projectId]);

        if (memberRows.length === 0) {
            req.flash('error_msg', 'Project member not found.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }
        const memberToEdit = memberRows[0];

        // Prevent editing role of the designated project_manager_id via this simple form
        // Role changes for the designated PM should ideally be tied to changing the PM on the project edit page.
        const [projectDetails] = await db.query("SELECT project_manager_id FROM projects WHERE id = ?", [projectId]);
        if (projectDetails.length > 0 && memberToEdit.user_id === projectDetails[0].project_manager_id) {
             req.flash('info_msg', `The role for the designated Project Manager (${memberToEdit.display_name}) is managed via the main project edit page.`);
            // Optionally, you could disable the role dropdown in the EJS or just show info.
            // For now, we'll still show the form but the handleUpdate might prevent change.
        }


        const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];

        res.render('projects/members/edit_member_role', { // New EJS view
            title: `Edit Role for ${memberToEdit.display_name}`,
            pageTitle: `Edit Member Role: ${memberToEdit.display_name}`,
            subTitle: `In Project: ${projectForContext.name}`,
            project: projectForContext,
            member: memberToEdit,
            projectRolesAssignable: projectRolesAssignable,
            formData: req.session.editMemberRoleFormData || { role_in_project_select: memberToEdit.role_in_project },
            errors: req.session.editMemberRoleErrors || [],
            layout: './layouts/main_layout'
        });
        delete req.session.editMemberRoleFormData;
        delete req.session.editMemberRoleErrors;

    } catch (error) {
        console.error("Error showing edit member role form:", error);
        next(error);
    }
};

// @desc    Handle updating a project member's role
// @route   POST /projects/:projectId/members/:projectMemberId/edit-role
// @access  Private (Requires project access with projectManageMembersRoles)
exports.handleUpdateMemberRole = async (req, res, next) => {
    const projectId = req.params.projectId;
    const projectMemberId = parseInt(req.params.projectMemberId);
    const { role_in_project_select } = req.body;
    const projectForContext = req.projectContext; // From middleware
    let errors = [];

    if (!projectForContext) {
        req.flash('error_msg', 'Project context error.');
        return res.redirect('/dashboard');
    }
    if (isNaN(projectMemberId)) {
        req.flash('error_msg', 'Invalid member identifier.');
        return res.redirect(`/projects/${projectId}/details#project-members-section`);
    }
    
    const projectRolesAssignable = ['Team Member', 'Site Supervisor', 'Client', 'Subcontractor', 'Project Manager'];
    if (!role_in_project_select || !projectRolesAssignable.includes(role_in_project_select)) {
        errors.push({ param: 'role_in_project_select', msg: 'Please select a valid role.' });
    }

    // Fetch member to ensure they exist and to check if they are the designated PM
    let memberToUpdate;
    try {
        const [memberRows] = await db.query(
            `SELECT pm.user_id, p.project_manager_id 
             FROM project_members pm
             JOIN projects p ON pm.project_id = p.id
             WHERE pm.id = ? AND pm.project_id = ?`,
            [projectMemberId, projectId]
        );
        if (memberRows.length === 0) {
            req.flash('error_msg', 'Project member not found for update.');
            return res.redirect(`/projects/${projectId}/details#project-members-section`);
        }
        memberToUpdate = memberRows[0];

        // Business Rule: If trying to change the role of the *designated* project_manager_id to something
        // other than 'Project Manager', prevent it or handle with care.
        // The projects.project_manager_id should be the source of truth for who the main PM is.
        if (memberToUpdate.user_id === memberToUpdate.project_manager_id && role_in_project_select !== 'Project Manager') {
            errors.push({ param: 'role_in_project_select', msg: `Cannot change the role of the designated Project Manager (${memberToUpdate.user_id === req.session.user.id ? 'yourself' : 'this user'}) from 'Project Manager' here. Use the main project edit page to change the designated Project Manager.` });
        }
        // Business Rule: Cannot assign 'Project Manager' role via this form if that user isn't the designated projects.project_manager_id
        // This is to avoid having multiple "acting" PMs unless specifically intended and handled.
        // The designated PM is set on the project edit page.
        // If you assign 'Project Manager' role here to someone else, they become a PM in project_members,
        // but projects.project_manager_id remains unchanged. This can be confusing.
        // A simpler rule: You can't make someone a 'Project Manager' via this form if they are not already the designated PM.
        // Or, if they become 'Project Manager', also update projects.project_manager_id.
        // For now, let's allow setting 'Project Manager' role here, but acknowledge it doesn't change the designated PM field on the project.

    } catch (dbError) {
        console.error("Error fetching member for role update check:", dbError);
        return next(dbError);
    }


    if (errors.length > 0) {
        req.session.editMemberRoleFormData = req.body; // Keep submitted value
        req.session.editMemberRoleErrors = errors;
        return res.redirect(`/projects/${projectId}/members/${projectMemberId}/edit-role`);
    }

    try {
        await db.query(
            "UPDATE project_members SET role_in_project = ? WHERE id = ? AND project_id = ?",
            [role_in_project_select, projectMemberId, projectId]
        );
        
        // If a user was made 'Project Manager' here AND they are NOT the current projects.project_manager_id
        // AND the current projects.project_manager_id is NULL or different,
        // a more advanced system might prompt to update projects.project_manager_id.
        // For now, we keep it simple: this form only changes the role in project_members.
        // The edit project page is the authority for projects.project_manager_id.
        if (role_in_project_select === 'Project Manager' && memberToUpdate.user_id !== memberToUpdate.project_manager_id) {
             req.flash('info_msg', `User's role in project set to 'Project Manager'. Note: This does not change the designated Project Manager for the project unless updated on the project edit page.`);
        }


        req.flash('success_msg', 'Member role updated successfully.');
        res.redirect(`/projects/${projectId}/details#project-members-section`);

    } catch (error) {
        console.error("Error updating member role:", error);
        req.session.editMemberRoleFormData = req.body;
        req.session.editMemberRoleErrors = errors.length > 0 ? errors : [{msg: 'Server error while updating member role.'}];
        res.redirect(`/projects/${projectId}/members/${projectMemberId}/edit-role`);
    }
};




// ... (existing methods: getProjectMembers, showAddMemberForm, handleAddMemberToProject, handleRemoveMemberFromProject) ...
*/