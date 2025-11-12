//middleware//authMiddleware.js
// Middleware to check if the user is authenticated
exports.isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next(); //pointing to this line. 
  }
  req.flash('error_msg', 'Please log in to view that resource.');
  res.redirect('/login');
};

// Middleware to check if the user is a guest (not authenticated)
exports.isGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
};


// Role-based access control
exports.hasRole = (requiredRoleOrRoles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error_msg', 'Authentication required for this action.');
      return res.status(401).redirect('/login');
    }
    
    const userRole = req.session.user.role; // Make sure 'role' exists on req.session.user
    const rolesToCheck = Array.isArray(requiredRoleOrRoles) ? requiredRoleOrRoles : [requiredRoleOrRoles];
    
    if (userRole && rolesToCheck.includes(userRole)) { // Added check for userRole existence
      return next();
    } else {
      req.flash('error_msg', 'You do not have permission to access this page.');
      res.status(403).redirect(req.headers.referer || (req.session.user.role === 'Admin' ? '/admin' : '/dashboard')); // Intelligent redirect
    }
  };
};


 
// This middleware checks if the authenticated user has permission to access
// resources related to a specific project.
exports.checkProjectAccess = (requiredProjectRole = null) => { // Optional: allow specifying required role_in_project
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error_msg', 'Authentication required to access project resources.');
      return res.status(401).redirect('/login');
    }
    
    const userId = req.session.user.id;
    const userAppRole = req.session.user.role; // Overall application role
    
    // Extract projectId from various possible locations
    const projectId = req.params.id || req.params.projectId || req.body.projectId;
    
    if (!projectId) {
      req.flash('error_msg', 'Project identifier is missing.');
      return res.status(400).redirect('/dashboard'); // Or a more generic error page
    }
    
    try {
      // 1. Admin Override
      if (userAppRole === 'Admin') {
        // Admins might still need the project context, so fetch it.
        const [adminProjectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (adminProjectRows.length === 0) {
          req.flash('error_msg', 'Project not found.');
          return res.status(404).redirect('/dashboard');
        }
        req.project = adminProjectRows[0]; // Attach project for admin convenience
        return next();
      }
      
      // 2. Fetch the project
      const [projectRows] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
      if (projectRows.length === 0) {
        req.flash('error_msg', 'Project not found.');
        return res.status(404).redirect('/dashboard');
      }
      const project = projectRows[0];
      req.project = project; // Attach project to request for downstream use
      
      // 3. Check direct ownership/management
      if (project.created_by_id === userId || project.project_manager_id === userId) {
        return next();
      }
      
      // 4. Check project_members table
      const [memberRows] = await db.query(
        'SELECT role_in_project FROM project_members WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );
      
      if (memberRows.length > 0) {
        const userRoleInProject = memberRows[0].role_in_project;
        req.roleInProject = userRoleInProject; // Attach role in project
        
        // Optional: Check if user's role_in_project meets a minimum requirement passed to middleware
        if (requiredProjectRole) {
          const rolesToCheck = Array.isArray(requiredProjectRole) ? requiredProjectRole : [requiredProjectRole];
          if (rolesToCheck.includes(userRoleInProject)) {
            return next();
          } else {
            req.flash('error_msg', `Your role ('${userRoleInProject}') in this project does not grant permission for this action.`);
            return res.status(403).redirect(`/projects/${projectId}/details`); // Or dashboard
          }
        }
        return next(); // If no specific requiredProjectRole, being a member is enough
      }
      
      // 5. If none of the above, deny access
      req.flash('error_msg', 'You do not have permission to access this project or its resources.');
      return res.status(403).redirect('/dashboard'); // Or a more specific "unauthorized" page
      
    } catch (error) {
      console.error("Error in checkProjectAccess middleware:", error);
      next(error); // Pass to global error handler
    }
  };
};
