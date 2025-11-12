//middleware//authMiddleware.js
// Middleware to check if the user is authenticated
exports.isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next(); //the line to which the browser error message is pointing to 
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


exports.loadAdminData = (req, res, next) => {
    // This is a placeholder. Implement your actual logic.
    // For example, you might want to attach some admin-specific data to res.locals
    // or perform some checks.
    // For now, just making it a valid middleware:
    console.log('loadAdminData middleware executed for user:', req.session.user ? req.session.user.username : 'Guest');
    // Example: Set a flag or data specific to admin layout
    if (req.session.user && req.session.user.role === 'admin') {
        res.locals.isAdminSection = true;
        // You could fetch additional admin-specific dashboard data here if needed
    }
    next();
};


/*
// Middleware to check if the user is authenticated
exports.isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error_msg', 'Please log in to view that resource.');
  res.redirect('/login');
};

// Middleware to check if the user is a guest (not authenticated)
exports.isGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard'); // Or wherever logged-in users should go from guest pages
  }
  next();
};

// Role-based access control
exports.hasRole = (requiredRoleOrRoles) => {
  return (req, res, next) => {
    // Assumes isAuthenticated has already been checked if this middleware is chained after it.
    // If not, or for standalone use, add user existence check:
    if (!req.session || !req.session.user) {
      req.flash('error_msg', 'Authentication required for this action.');
      return res.status(401).redirect('/login');
    }
    
    const userRole = req.session.user.role;
    const rolesToCheck = Array.isArray(requiredRoleOrRoles) ? requiredRoleOrRoles : [requiredRoleOrRoles];
    
    if (rolesToCheck.includes(userRole)) {
      return next(); // User has one of the required roles
    } else {
      req.flash('error_msg', 'You do not have permission to access this page.');
      // Consider rendering a 403 page: res.status(403).render('error/403', { title: 'Access Denied' });
      res.status(403).redirect(req.headers.referer || '/dashboard'); // Redirect back or to a safe page
    }
  };
};*/