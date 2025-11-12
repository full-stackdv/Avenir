// Avenircon/middleware/projectAccessMiddleware.js
const db = require('../config/db');

/**
 * Middleware to check project-specific access.
 *
 * It verifies if the authenticated user:
 * 1. Is an application 'Admin'.
 * 2. Is the designated 'Project Manager' of the project (from `projects.project_manager_id`).
 * 3. Is the 'Creator' of the project (from `projects.created_by_id`).
 * 4. Is listed in `project_members` with a specific `role_in_project`.
 *
 * Access is granted if the user meets one of these criteria AND their identified project role
 * is included in the `allowedProjectRoles` array.
 *
 * If `allowedProjectRoles` is empty or not provided, any valid project association (Admin, PM, Creator, Member) grants access.
 *
 * Attaches `req.projectContext` (project details) and `req.projectUserRole` (the role granting access in project context).
 *
 * Assumes `isAuthenticated` middleware has run.
 * Assumes `project_members` table has `project_id`, `user_id`, `role_in_project`.
 * Assumes `projects` table has `id`, `project_manager_id`, `created_by_id`.
 */

const checkProjectAccess = (allowedProjectRoles = []) => {
  return async (req, res, next) => {
    // ... (your existing logging and initial checks) ...
    
    if (!req.session || !req.session.user) {
      req.flash('error_msg', 'Please log in to access this resource.');
      return res.status(401).redirect('/login');
    }
    
    const userId = req.session.user.id;
    const userAppRole = req.session.user.role;
    
    const projectIdFromParams = req.params.projectId || req.params.id;
    const projectIdFromBody = req.body && req.body.projectId;
    const projectId = projectIdFromParams || projectIdFromBody;
    
    if (!projectId || isNaN(parseInt(projectId))) {
      req.flash('error_msg', 'Project context is missing or invalid.');
      const referer = req.headers.referer;
      const redirectUrl = (referer && !referer.includes('/login') && !referer.includes('/register')) ? referer : '/dashboard';
      return res.status(400).redirect(redirectUrl);
    }
    
    req.accessCheckedProjectId = projectId;
    
    try {
      // Fetch project details
      // MODIFIED QUERY: Added 'budget' and other potentially useful fields
      const [projectRows] = await db.query(
          `SELECT 
              id, 
              name, 
              project_code,  -- Added project_code
              description,   -- Added description
              client_name,   -- Added client_name
              start_date,    -- Added start_date
              end_date,      -- Added end_date
              budget,        -- <<< CRITICAL: Added budget
              actual_cost,   -- Added actual_cost (if middleware needs it, or for consistency)
              status,        -- Added status
              project_manager_id, 
              created_by_id 
           FROM projects 
           WHERE id = ?`, 
          [projectId]
      );
      
      if (projectRows.length === 0) {
        req.flash('error_msg', 'Project not found.');
        return res.status(404).redirect('/dashboard');
      }
      const project = projectRows[0];
      req.projectContext = project; 
      
      // ... (rest of your access checking logic: Admin, PM, Creator, Member) ...
      // 1. App-level Admin Override
      if (userAppRole === 'Admin') {
        req.projectUserRole = 'Admin'; 
        return next();
      }
      
      // 2. Check if user is the designated Project Manager
      if (project.project_manager_id === userId) {
        if (allowedProjectRoles.length === 0 || allowedProjectRoles.includes('Project Manager')) {
          req.projectUserRole = 'Project Manager';
          return next();
        }
      }
      
      // 3. Check if user is the Creator of the project
      if (project.created_by_id === userId) {
        if (allowedProjectRoles.length === 0 || allowedProjectRoles.includes('Creator') || allowedProjectRoles.includes('Project Manager')) {
          req.projectUserRole = 'Creator';
          return next();
        }
      }
      
      // 4. Check project_members table
      const [memberRows] = await db.query(
        "SELECT role_in_project FROM project_members WHERE project_id = ? AND user_id = ?",
        [projectId, userId]
      );
      
      if (memberRows.length > 0) {
        const userRoleInProject = memberRows[0].role_in_project;
        req.projectUserRole = userRoleInProject;
        if (allowedProjectRoles.length === 0 || allowedProjectRoles.includes(userRoleInProject)) {
          return next();
        }
      }
      
      // If none of the above grant access
      req.flash('error_msg', 'You do not have sufficient permissions to access this project resource.');
      const projectDetailsPath = `/projects/${projectId}/details`;
      const refererPath = req.headers.referer ? new URL(req.headers.referer).pathname : '';
      if (refererPath === projectDetailsPath || req.originalUrl === projectDetailsPath) {
        return res.status(403).redirect('/dashboard');
      }
      return res.status(403).redirect(projectDetailsPath);
      
    } catch (error) {
      console.error("--- [MIDDLEWARE] ERROR in checkProjectAccess middleware:", error);
      next(error);
    }
  };
};

module.exports = {
  checkProjectAccess
};


/*
//middleware/projectAccessMiddleware.js
//const db = require('../config/db');

const checkProjectAccess = (allowedProjectRoles = []) => {
  return async (req, res, next) => {
    // console.log('-----------------------------------------------------');
    // console.log('--- [MIDDLEWARE] checkProjectAccess ENTERED ---');
    // console.log('--- [MIDDLEWARE] Timestamp:', new Date().toISOString());
    // console.log('--- [MIDDLEWARE] Request URL:', req.originalUrl);
    // console.log('--- [MIDDLEWARE] req.params:', JSON.stringify(req.params, null, 2));
    // console.log('--- [MIDDLEWARE] req.body:', JSON.stringify(req.body, null, 2));
    // console.log('--- [MIDDLEWARE] Allowed Project Roles for this route:', JSON.stringify(allowedProjectRoles));
    
    if (!req.session || !req.session.user) {
      // console.log('--- [MIDDLEWARE] DENYING: No session or user in session.');
      req.flash('error_msg', 'Please log in to access this resource.');
      return res.status(401).redirect('/login');
    }
    
    const userId = req.session.user.id;
    const userAppRole = req.session.user.role; // User's global application role
    
    // console.log('--- [MIDDLEWARE] Session User ID:', userId);
    // console.log('--- [MIDDLEWARE] Session User App Role:', userAppRole);
    
    const projectIdFromParams = req.params.projectId || req.params.id;
    const projectIdFromBody = req.body && req.body.projectId;
    const projectId = projectIdFromParams || projectIdFromBody;
    
    // console.log('--- [MIDDLEWARE] Extracted projectIdFromParams:', projectIdFromParams);
    // console.log('--- [MIDDLEWARE] Extracted projectIdFromBody:', projectIdFromBody);
    // console.log('--- [MIDDLEWARE] Final projectId to use:', projectId);
    
    if (!projectId || isNaN(parseInt(projectId))) {
      // console.error('--- [MIDDLEWARE] DENYING: Project ID is missing or invalid.');
      req.flash('error_msg', 'Project context is missing or invalid.');
      const referer = req.headers.referer;
      const redirectUrl = (referer && !referer.includes('/login') && !referer.includes('/register')) ? referer : '/dashboard';
      return res.status(400).redirect(redirectUrl);
    }
    
    req.accessCheckedProjectId = projectId; // For potential downstream logging
    // console.log('--- [MIDDLEWARE] req.accessCheckedProjectId SET to:', req.accessCheckedProjectId);
    
    try {
      // Fetch project details
      // console.log('--- [MIDDLEWARE] Attempting to fetch project with ID:', projectId);
      const [projectRows] = await db.query("SELECT id, name, project_manager_id, created_by_id FROM projects WHERE id = ?", [projectId]);
      // console.log('--- [MIDDLEWARE] Fetched projectRows from DB:', JSON.stringify(projectRows, null, 2));
      
      if (projectRows.length === 0) {
        // console.log('--- [MIDDLEWARE] DENYING: Project not found in DB for ID:', projectId);
        req.flash('error_msg', 'Project not found.');
        return res.status(404).redirect('/dashboard');
      }
      const project = projectRows[0];
      req.projectContext = project; // Attach project details to request
      // console.log('--- [MIDDLEWARE] SUCCESS: req.projectContext SET to:', JSON.stringify(req.projectContext, null, 2));
      
      // 1. App-level Admin Override
      if (userAppRole === 'Admin') {
        // console.log('--- [MIDDLEWARE] GRANTING ACCESS: User is App Admin.');
        req.projectUserRole = 'Admin'; // Conceptual project role for app admin
        // console.log('--- [MIDDLEWARE] Calling next() for Admin.');
        // console.log('-----------------------------------------------------');
        return next();
      }
      
      // For non-Admins, check project-specific roles:
      // console.log('--- [MIDDLEWARE] User is NOT App Admin. Proceeding with project-specific role checks.');
      
      // 2. Check if user is the designated Project Manager
      if (project.project_manager_id === userId) {
        // console.log(`--- [MIDDLEWARE] User IS Project Manager (project.project_manager_id: ${project.project_manager_id}).`);
        if (allowedProjectRoles.length === 0 || allowedProjectRoles.includes('Project Manager')) {
          // console.log('--- [MIDDLEWARE] GRANTING ACCESS: User is Project Manager AND PM role is allowed (or all roles allowed).');
          req.projectUserRole = 'Project Manager';
          // console.log('--- [MIDDLEWARE] Calling next() for Project Manager.');
          // console.log('-----------------------------------------------------');
          return next();
        }
      }
      
      // 3. Check if user is the Creator of the project (if not already covered by PM)
      // It's recommended to add creators to project_members or as PM explicitly. This is a fallback.
      if (project.created_by_id === userId) {
        // console.log(`--- [MIDDLEWARE] User IS Project Creator (project.created_by_id: ${project.created_by_id}).`);
        // Assuming 'Creator' implies significant project rights, similar to a PM for this check.
        // Or use a specific 'Creator' role if you define it in allowedProjectRoles.
        if (allowedProjectRoles.length === 0 || allowedProjectRoles.includes('Creator') || allowedProjectRoles.includes('Project Manager')) {
          // console.log('--- [MIDDLEWARE] GRANTING ACCESS: User is Project Creator AND Creator/PM role is allowed (or all roles allowed).');
          req.projectUserRole = 'Creator';
          // console.log('--- [MIDDLEWARE] Calling next() for Project Creator.');
          // console.log('-----------------------------------------------------');
          return next();
        }
      }
      
      // 4. Check project_members table for a specific role in this project
      // console.log('--- [MIDDLEWARE] Attempting to fetch project_members for projectID:', projectId, 'and userID:', userId);
      const [memberRows] = await db.query(
        "SELECT role_in_project FROM project_members WHERE project_id = ? AND user_id = ?",
        [projectId, userId]
      );
      // console.log('--- [MIDDLEWARE] Fetched memberRows from DB:', JSON.stringify(memberRows, null, 2));
      
      if (memberRows.length > 0) {
        const userRoleInProject = memberRows[0].role_in_project;
        req.projectUserRole = userRoleInProject; // Set the actual role from project_members
        // console.log('--- [MIDDLEWARE] User role in project_members:', userRoleInProject);
        if (allowedProjectRoles.length === 0 || allowedProjectRoles.includes(userRoleInProject)) {
          // console.log(`--- [MIDDLEWARE] GRANTING ACCESS: User is a member with role '${userRoleInProject}' AND this role is allowed (or all roles allowed).`);
          // console.log('--- [MIDDLEWARE] Calling next() for Project Member.');
          // console.log('-----------------------------------------------------');
          return next();
        }
      } else {
        // console.log('--- [MIDDLEWARE] User is not found in project_members for this project.');
      }
      
      // If none of the above grant access
      // console.log('--- [MIDDLEWARE] DENYING ACCESS: No applicable grant conditions met for non-Admin.');
      req.flash('error_msg', 'You do not have sufficient permissions to access this project resource.');
      // console.log('-----------------------------------------------------');
      // Redirect to project details if they could potentially see that, or dashboard otherwise.
      const projectDetailsPath = `/projects/${projectId}/details`;
      // A simple check if they were trying to access something other than details itself.
      // This redirect logic can be refined based on how you want UX to be.
      const refererPath = req.headers.referer ? new URL(req.headers.referer).pathname : '';
      if (refererPath === projectDetailsPath || req.originalUrl === projectDetailsPath) {
        return res.status(403).redirect('/dashboard'); // Avoid redirect loop if already on details
      }
      return res.status(403).redirect(projectDetailsPath);
      
      
    } catch (error) {
      console.error("--- [MIDDLEWARE] ERROR in checkProjectAccess middleware:", error);
      // console.log('-----------------------------------------------------');
      // Pass the error to the global error handler
      next(error);
    }
  };
};

// Exporting checkProjectAccess directly from this file now.
// Your authMiddleware.js can remain separate for isAuthenticated, isGuest, hasRole.
module.exports = {
  checkProjectAccess
};
*/


/*
// Avenircon/middleware/projectAccessMiddleware.js
const db = require('../config/db');

const checkProjectAccess = (allowedProjectRolesForMembers = []) => {
    return async (req, res, next) => {
        //console.log('-----------------------------------------------------');
        //console.log('--- [MIDDLEWARE] checkProjectAccess ENTERED ---');
        //console.log('--- [MIDDLEWARE] Timestamp:', new Date().toISOString());
        //console.log('--- [MIDDLEWARE] Request URL:', req.originalUrl);
        //console.log('--- [MIDDLEWARE] req.params:', JSON.stringify(req.params, null, 2));
        //console.log('--- [MIDDLEWARE] req.body:', JSON.stringify(req.body, null, 2)); // Be careful if body contains sensitive data

        try {
            if (!req.session || !req.session.user) {
              //  console.log('--- [MIDDLEWARE] DENYING: No session or user in session.');
                req.flash('error_msg', 'Please log in to access this resource.');
                return res.status(401).redirect('/login');
            }
            //console.log('--- [MIDDLEWARE] Session User ID:', req.session.user.id);
           // console.log('--- [MIDDLEWARE] Session User App Role:', req.session.user.role);

            const userId = req.session.user.id;
            const userAppRole = req.session.user.role;

            const projectIdFromParams = req.params.projectId || req.params.id;
            const projectIdFromBody = req.body && req.body.projectId;
            const projectId = projectIdFromParams || projectIdFromBody;

            //console.log('--- [MIDDLEWARE] Extracted projectIdFromParams:', projectIdFromParams);
            //console.log('--- [MIDDLEWARE] Extracted projectIdFromBody:', projectIdFromBody);
            //console.log('--- [MIDDLEWARE] Final projectId to use:', projectId);
            //console.log('--- [MIDDLEWARE] Allowed Project Roles for this route:', JSON.stringify(allowedProjectRolesForMembers));


            if (!projectId) {
              //  console.error('--- [MIDDLEWARE] DENYING: Project ID is missing from request.');
                req.flash('error_msg', 'Project context is missing.');
                const referer = req.headers.referer;
                const redirectUrl = (referer && !referer.includes('/login') && !referer.includes('/register')) ? referer : '/dashboard';
                return res.status(400).redirect(redirectUrl);
            }
            
            req.accessCheckedProjectId = projectId; // For potential downstream logging or checks
            console.log('--- [MIDDLEWARE] req.accessCheckedProjectId SET to:', req.accessCheckedProjectId);

            // Fetch project details first, as it's needed for context setting and some checks.
            //console.log('--- [MIDDLEWARE] Attempting to fetch project with ID:', projectId);
            const [projectRows] = await db.query("SELECT id, name, project_manager_id, created_by_id FROM projects WHERE id = ?", [projectId]);
            //console.log('--- [MIDDLEWARE] Fetched projectRows from DB:', JSON.stringify(projectRows, null, 2));

            if (projectRows.length === 0) {
              //  console.log('--- [MIDDLEWARE] DENYING: Project not found in DB for ID:', projectId);
                req.flash('error_msg', 'Project not found.');
                return res.status(404).redirect('/dashboard');
            }
            const project = projectRows[0];
            req.projectContext = project; 
            //console.log('--- [MIDDLEWARE] SUCCESS: req.projectContext SET to:', JSON.stringify(req.projectContext, null, 2));

            // 1. App-level Admin Override
            if (userAppRole === 'Admin') {
                //console.log('--- [MIDDLEWARE] GRANTING ACCESS: User is Admin.');
                console.log('--- [MIDDLEWARE] Calling next() for Admin.');
                //console.log('-----------------------------------------------------');
                return next();
            }

            // For non-Admins, proceed with role checks:
            //console.log('--- [MIDDLEWARE] User is NOT Admin. Proceeding with PM/Member checks.');

            // 2. Check if user is the designated Project Manager for this project
            //console.log(`--- [MIDDLEWARE] Checking PM: project.project_manager_id (${project.project_manager_id}) === userId (${userId})?`);
            //console.log(`--- [MIDDLEWARE] Checking PM: allowedProjectRolesForMembers includes 'Project Manager'?`, allowedProjectRolesForMembers.includes('Project Manager'));
            if (project.project_manager_id === userId && allowedProjectRolesForMembers.includes('Project Manager')) {
               // console.log('--- [MIDDLEWARE] GRANTING ACCESS: User is Project Manager for this project AND PM role is allowed.');
                console.log('--- [MIDDLEWARE] Calling next() for Project Manager.');
              //  console.log('-----------------------------------------------------');
                return next();
            }
            
            // 3. Check project_members table for specific role in this project
            //console.log('--- [MIDDLEWARE] Attempting to fetch project_members for projectID:', projectId, 'and userID:', userId);
            const [memberRows] = await db.query(
                "SELECT role_in_project FROM project_members WHERE project_id = ? AND user_id = ?",
                [projectId, userId]
            );
            //console.log('--- [MIDDLEWARE] Fetched memberRows from DB:', JSON.stringify(memberRows, null, 2));

            if (memberRows.length > 0) {
                const userRoleInProject = memberRows[0].role_in_project;
              //  console.log('--- [MIDDLEWARE] User role in project_members:', userRoleInProject);
               // console.log(`--- [MIDDLEWARE] Checking Member: allowedProjectRolesForMembers includes '${userRoleInProject}'?`, allowedProjectRolesForMembers.includes(userRoleInProject));
                if (allowedProjectRolesForMembers.includes(userRoleInProject)) {
             //       console.log('--- [MIDDLEWARE] GRANTING ACCESS: User is a member with an allowed role_in_project.');
                    console.log('--- [MIDDLEWARE] Calling next() for Project Member.');
                   // console.log('-----------------------------------------------------');
                    return next();
                }
            } else {
                console.log('--- [MIDDLEWARE] User is not found in project_members for this project.');
            }
            
            // If none of the above grant access for non-Admins
           // console.log('--- [MIDDLEWARE] DENYING ACCESS: No applicable grant conditions met for non-Admin.');
            req.flash('error_msg', 'You do not have sufficient permissions to access this project resource.');
            //console.log('-----------------------------------------------------');
            return res.status(403).redirect(`/dashboard`); 

        } catch (error) {
            console.error("--- [MIDDLEWARE] ERROR in checkProjectAccess middleware:", error);
           // console.log('-----------------------------------------------------');
            next(error);
        }
    };
};

module.exports = {
    checkProjectAccess
};*/