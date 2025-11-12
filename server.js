// constructpro/server.js
// 0. Load Environment Variables FIRST
require('dotenv').config();

// 1. Import Core Modules
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
//const settingsService = require('./services/settingsService'); // Correct

// 2. Import Custom Modules
// --- Route Imports ---
const publicSiteRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const appRoutes = require('./routes/app');
const staffRoutes = require('./routes/staff');
const settingsService = require('./services/settingsService')

// --- Middleware Imports ---
const { checkMaintenanceMode } = require('./middleware/settingsMiddleware');
const announcementMiddleware = require('./middleware/announcementMiddleware');
const { isAuthenticated, hasRole, loadAdminData } = require('./middleware/authMiddleware'); // Ensure loadAdminData is here

// 3. Initialize Express App
const app = express();

// 4. Application Settings & Configuration
const PORT = process.env.PORT || 3000;

// ASYNCHRONOUS SERVER START FUNCTION
async function startServer() {
  // Initialize settings cache when the application starts
  // This MUST complete before the app starts listening or using settings.
  try {
    await settingsService.initializeSettingsCache();
  } catch (error) {
    console.error("CRITICAL: Failed to initialize settings cache on startup. Application might not function correctly.", error);
    // process.exit(1); // Optionally exit if settings are critical for startup
  }
  
  // 5. Middleware Configuration (Order is important)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
  
  app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_default_session_secret_key_please_change_me', // Added a default
    resave: false,
    saveUninitialized: false, // Good practice
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  }));
  
  app.use(flash());
    //app.use(checkMaintenanceMode);

  
  // Global variables for views (must be after session and flash)
  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.info_msg = req.flash('info_msg');
    res.locals.error = req.flash('error'); // General error
    // Keep specific flash messages if your controllers use them directly e.g. req.flash('success', ...)
    res.locals.flash_success = req.flash('success');
    res.locals.flash_error = req.flash('error');
    res.locals.flash_info = req.flash('info');
    res.locals.flash_warning = req.flash('warning');
    
    res.locals.currentUser = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.currentPath = req.path;
    
    // Make getSetting available globally to all views
    res.locals.getSetting = settingsService.getSetting;
    
    // Determine active section for layout purposes (optional, but you had it)
    if (req.path.startsWith('/admin')) {
      res.locals.activeSection = 'admin';
    } else if (
      req.path.startsWith('/dashboard') ||
      req.path.startsWith('/projects') ||
      req.path.startsWith('/profile') ||
      req.path.startsWith('/staff')
    ) {
      res.locals.activeSection = 'app';
    } else {
      res.locals.activeSection = 'public';
    }
    next();
  });
  
  // Custom Middleware (checkMaintenanceMode depends on settings being loaded)
  app.use(checkMaintenanceMode);
  app.use(announcementMiddleware);
  
  // 6. View Engine Setup (EJS)
  app.use(expressLayouts);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // app.set('layout', './layouts/main_layout'); // Set default layout if applicable
  
  // 7. Route Handling
  app.use('/staff', isAuthenticated, staffRoutes); // Assuming staff routes require authentication
  app.use('/admin', isAuthenticated, hasRole('Admin'), loadAdminData, adminRoutes); // loadAdminData after auth/role checks
  app.use('/', authRoutes);
  app.use('/', publicSiteRoutes);
  app.use('/', isAuthenticated, appRoutes); // Assuming general app routes also require authentication
  
  
  // 8. Basic 404 Error Handler (should be after all normal routes)
  app.use((req, res, next) => {
    console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    const layout = req.path.startsWith('/admin') ? './layouts/admin_layout' : './layouts/public_layout';
    res.status(404).render('error/404', {
      title: 'Page Not Found',
      layout: layout
    });
  });
  
  // 9. General Error Handler (last middleware)
  app.use((err, req, res, next) => {
    console.error("Global Error Handler Caught an Error:");
    console.error(`Path: ${req.method} ${req.originalUrl}`);
    if (err.status) console.error(`Error status: ${err.status}`);
    console.error(err.stack);
    
    const statusCode = err.status || 500;
    const layout = req.path.startsWith('/admin') ? './layouts/admin_layout' : './layouts/public_layout';
    res.status(statusCode).render('error/500', {
      title: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err : { message: "An unexpected error occurred on our end." },
      layout: layout
    });
  });
  
  // 10. Start Listening
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
    // Test if getSetting works after initialization
    console.log(`Site Name from settings (server.js): ${settingsService.getSetting('site_name', 'ConstructPro (Default)')}`);
  });
}

// CALL THE ASYNC START FUNCTION
startServer().catch(err => {
  console.error("CRITICAL: Failed to start server due to initialization error:", err);
  process.exit(1); // Exit if essential initialization (like settings cache) fails
});


/*INSERT INTO `system_settings` (`setting_key`, `setting_value`, `setting_group`, `label`, `description`, `input_type`, `sort_order`) VALUES 
('backup_enabled', 'false', 'maintenance', 'Enable Backups', 'Enable or disable the backup functionality.', 'boolean', 0), 
('backup_directory', './backups', 'maintenance', 'Backup Storage Directory', 'Path to store backup files (relative to project root or absolute). Ensure this directory is writable by the server process and ideally outside the public web root.', 'text', 10), 
('max_local_backups_to_keep', '5', 'maintenance', 'Max Local Backups', 'Maximum number of local backup files to retain. Older backups will be deleted (0 for unlimited).', 'number', 20);*/

/*
// constructpro/server.js
// 0. Load Environment Variables FIRST
require('dotenv').config();

// 1. Import Core Modules
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const settingsService = require('./services/settingsService'); // Correct
//const adminRoutes = require('./routes/admin'); // you should already have this


// 2. Import Custom Modules
// --- Route Imports ---
const authRoutes = require('./routes/auth');
const publicSiteRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const appRoutes = require('./routes/app');
const staffRoutes = require('./routes/staff');
// const projectFeatureRoutes = require('./routes/projectFeatures'); // Keep commented if not active

// --- Middleware Imports ---
const { checkMaintenanceMode } = require('./middleware/settingsMiddleware'); // Correct
const announcementMiddleware = require('./middleware/announcementMiddleware'); // Add this

//
// 3. Initialize Express App
const app = express();

// 4. Application Settings & Configuration
const PORT = process.env.PORT || 3000;

// ASYNCHRONOUS SERVER START FUNCTION
// This function will handle operations that need to complete before the server starts listening
async function startServer() {
  // Initialize settings cache when the application starts
  await settingsService.initializeSettingsCache();
  
  // Make settingsService.getSetting available globally in templates via app.locals
  // This is the simplest and most direct way.
  app.locals.getSetting = settingsService.getSetting;
  
  // You could also expose all settings if needed, but getSetting is usually sufficient and safer.
  // Object.defineProperty(app.locals, 'allAppSettings', {
  //     get: function() {
  //         const settings = {};
  //         const cache = settingsService.getCachedSettings(); // Assuming you add such a method to settingsService
  //         for (const [key, value] of cache.entries()) {
  //             settings[key] = value;
  //         }
  //         return settings;
  //     }
  // });
  
  // 5. Middleware Configuration (Order is important)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Serve static files from 'public' directory
  app.use(express.static(path.join(__dirname, 'public')));
  // Example for specific upload paths if needed, otherwise a general /uploads might be better
  // app.use('/uploads/feature_images', express.static(path.join(__dirname, 'public/uploads/feature_images')));
  // app.use('/uploads/documents', express.static(path.join(__dirname, 'public/uploads/documents')));
  // A general one:
  app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
  
  
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  }));
  
  app.use(flash());
  
  // Custom Middleware
  app.use(checkMaintenanceMode); // Check maintenance mode after static files and session, before routes
  app.use(announcementMiddleware); // Add this before your main routes
  
  // Global variables for views (must be after session and flash)
  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg'); // Standard success messages
    res.locals.error_msg = req.flash('error_msg'); // Standard error messages
    res.locals.info_msg = req.flash('info_msg'); // Standard info messages
    res.locals.error = req.flash('error'); // Compatibility for passport or other 'error' flashes
    // More specific flash messages from connect-flash if used directly
    res.locals.flash_success = req.flash('success');
    res.locals.flash_error = req.flash('error'); // This will overwrite the one above if both used
    res.locals.flash_info = req.flash('info');
    res.locals.flash_warning = req.flash('warning');
    
    res.locals.currentUser = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.currentPath = req.path;
    
    if (req.path.startsWith('/admin')) {
      res.locals.activeSection = 'admin';
    } else if (
      req.path.startsWith('/dashboard') ||
      req.path.startsWith('/projects') ||
      req.path.startsWith('/profile') ||
      req.path.startsWith('/staff') // <<<< ADDED FOR STAFF SECTION

    ) {
      res.locals.activeSection = 'app';
    } else {
      res.locals.activeSection = 'public';
    }
    next();
  });
  
  // 6. View Engine Setup (EJS)
  app.use(expressLayouts);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // Optional: Set a default layout if most routes use the same one
  // app.set('layout', './layouts/main_layout'); // Example
  
  // 7. Route Handling
  app.use('/staff', staffRoutes);         // <<<< NEW: Handles all /staff/*
  app.use('/admin', adminRoutes);
  app.use('/', authRoutes);
  // app.use('/', projectFeatureRoutes); // Uncomment if using
  app.use('/', publicSiteRoutes);
  app.use('/', appRoutes); // This should generally be last among the main functional routes

  
  
  // 8. Basic 404 Error Handler
  app.use((req, res, next) => {
    console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).render('error/404', {
      title: 'Page Not Found',
      layout: './layouts/public_layout' // Ensure this layout exists or use another
    });
  });
  
  // 9. General Error Handler
  app.use((err, req, res, next) => {
    console.error("Global Error Handler Caught an Error:");
    console.error(`Path: ${req.method} ${req.originalUrl}`);
    if (err.status) console.error(`Error status: ${err.status}`);
    console.error(err.stack);
    
    const statusCode = err.status || 500;
    res.status(statusCode).render('error/500', {
      title: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err : { message: "An unexpected error occurred." },
      layout: './layouts/public_layout' // Ensure this layout exists
    });
  });
  
  // 10. Start Listening
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// CALL THE ASYNC START FUNCTION
startServer().catch(err => {
  console.error("Failed to start server due to initialization error:", err);
  process.exit(1); // Exit if essential initialization fails
});


/*

// avenircon/server.js
// 0. Load Environment Variables FIRST
//require('dotenv').config();

// 1. Import Core Modules
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const settingsService = require('./services/settingsService');

// 2. Import Custom Modules
// --- Route Imports ---
const authRoutes = require('./routes/auth');
const publicSiteRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const appRoutes = require('./routes/app');
const staffRoutes = require('./routes/staff'); // <<<< NEWLY ADDED
// const projectFeatureRoutes = require('./routes/projectFeatures');

// --- Middleware Imports ---
const { checkMaintenanceMode } = require('./middleware/settingsMiddleware');

// 3. Initialize Express App
const app = express();

// 4. Application Settings & Configuration
const PORT = process.env.PORT || 3000;

async function startServer() {
  await settingsService.initializeSettingsCache();
  app.locals.getSetting = settingsService.getSetting;

  // 5. Middleware Configuration
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Set to true if using HTTPS in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  }));

  app.use(flash());
  app.use(checkMaintenanceMode);

  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.info_msg = req.flash('info_msg');
    // Keep 'error' flash for compatibility, but prefer specific types
    let errorFlash = req.flash('error'); 
    res.locals.error = errorFlash.length > 0 ? errorFlash : req.flash('flash_error');

    res.locals.flash_success = req.flash('success');
    // res.locals.flash_error = req.flash('flash_error'); // Already handled by res.locals.error
    res.locals.flash_info = req.flash('info');
    res.locals.flash_warning = req.flash('warning');
   
    res.locals.currentUser = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.currentPath = req.path; // req.path is cleaner than req.originalUrl for this
   
    // Determine active section for layout purposes
    if (req.path.startsWith('/admin')) {
      res.locals.activeSection = 'admin';
    } else if (
      req.path.startsWith('/dashboard') ||
      req.path.startsWith('/projects') ||
      req.path.startsWith('/profile') ||
      req.path.startsWith('/staff') // <<<< ADDED FOR STAFF SECTION
    ) {
      res.locals.activeSection = 'app';
    } else {
      res.locals.activeSection = 'public';
    }
    next();
  });

  // 6. View Engine Setup (EJS)
  app.use(expressLayouts);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // app.set('layout', './layouts/main_layout'); // Example, if you have a global default

  // 7. Route Handling (Order can be important for specificity)
  app.use('/admin', adminRoutes);         // Handles all /admin/*
  app.use('/staff', staffRoutes);         // <<<< NEW: Handles all /staff/*
  app.use('/', authRoutes);               // Handles /login, /register, etc.
  // app.use('/', projectFeatureRoutes);  // If active
  app.use('/', publicSiteRoutes);         // Handles /about, /blog, /contact
  app.use('/', appRoutes);                // Handles /, /dashboard, /projects, etc. (often more general)

  // 8. Basic 404 Error Handler
  app.use((req, res, next) => {
    console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    const layout = res.locals.activeSection === 'admin' ? './layouts/admin_layout' : 
                   res.locals.activeSection === 'app' ? './layouts/main_layout' : 
                   './layouts/public_layout';
    res.status(404).render('error/404', {
      title: 'Page Not Found',
      layout: layout
    });
  });

  // 9. General Error Handler
  app.use((err, req, res, next) => {
    console.error("Global Error Handler Caught an Error:");
    console.error(`Path: ${req.method} ${req.originalUrl}`);
    if (err.status) console.error(`Error status: ${err.status}`);
    console.error(err.stack);
   
    const statusCode = err.status || 500;
    const layout = res.locals.activeSection === 'admin' ? './layouts/admin_layout' : 
                   res.locals.activeSection === 'app' ? './layouts/main_layout' : 
                   './layouts/public_layout';
    res.status(statusCode).render('error/500', {
      title: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err : { message: "An unexpected error occurred." },
      layout: layout
    });
  });

  // 10. Start Listening
  app.listen(PORT, () => {
    console.log(`AvenirCon Server running on http://localhost:${PORT}`);
    console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server due to initialization error:", err);
  process.exit(1);
});


/*
// server.js (snippet)
// ... other requires

const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin'); // you should already have this
// ...

// Mount routes
// ... other app.use() for routes
app.use('/staff', staffRoutes);
app.use('/admin', adminRoutes); // if you haven't used /admin prefix for admin.js before
// ...

// server.js
app.use(express.static(path.join(__dirname, 'public')));
// This will allow URLs like /uploads/staff_photos/someimage.jpg

*/


/*
// Avenircon/server.js
// 0. Load Environment Variables FIRST
require('dotenv').config();

// 1. Import Core Modules
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const settingsService = require('./services/settingsService'); // Correct

// 2. Import Custom Modules
// --- Route Imports ---
const authRoutes = require('./routes/auth');
const publicSiteRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const appRoutes = require('./routes/app');
// const projectFeatureRoutes = require('./routes/projectFeatures'); // Keep commented if not active

// --- Middleware Imports ---
const { checkMaintenanceMode } = require('./middleware/settingsMiddleware'); // Correct

// 3. Initialize Express App
const app = express();

// 4. Application Settings & Configuration
const PORT = process.env.PORT || 3000;

// ASYNCHRONOUS SERVER START FUNCTION
// This function will handle operations that need to complete before the server starts listening
async function startServer() {
  // Initialize settings cache when the application starts
  await settingsService.initializeSettingsCache();
  
  // Make settingsService.getSetting available globally in templates via app.locals
  // This is the simplest and most direct way.
  app.locals.getSetting = settingsService.getSetting;
  
  // You could also expose all settings if needed, but getSetting is usually sufficient and safer.
  // Object.defineProperty(app.locals, 'allAppSettings', {
  //     get: function() {
  //         const settings = {};
  //         const cache = settingsService.getCachedSettings(); // Assuming you add such a method to settingsService
  //         for (const [key, value] of cache.entries()) {
  //             settings[key] = value;
  //         }
  //         return settings;
  //     }
  // });
  
  // 5. Middleware Configuration (Order is important)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Serve static files from 'public' directory
  app.use(express.static(path.join(__dirname, 'public')));
  // Example for specific upload paths if needed, otherwise a general /uploads might be better
  // app.use('/uploads/feature_images', express.static(path.join(__dirname, 'public/uploads/feature_images')));
  // app.use('/uploads/documents', express.static(path.join(__dirname, 'public/uploads/documents')));
  // A general one:
  app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
  
  
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  }));
  
  app.use(flash());
  
  // Custom Middleware
  app.use(checkMaintenanceMode); // Check maintenance mode after static files and session, before routes
  
  // Global variables for views (must be after session and flash)
  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg'); // Standard success messages
    res.locals.error_msg = req.flash('error_msg'); // Standard error messages
    res.locals.info_msg = req.flash('info_msg'); // Standard info messages
    res.locals.error = req.flash('error'); // Compatibility for passport or other 'error' flashes
    // More specific flash messages from connect-flash if used directly
    res.locals.flash_success = req.flash('success');
    res.locals.flash_error = req.flash('error'); // This will overwrite the one above if both used
    res.locals.flash_info = req.flash('info');
    res.locals.flash_warning = req.flash('warning');
    
    res.locals.currentUser = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.currentPath = req.path;
    
    if (req.path.startsWith('/admin')) {
      res.locals.activeSection = 'admin';
    } else if (
      req.path.startsWith('/dashboard') ||
      req.path.startsWith('/projects') ||
      req.path.startsWith('/profile')
    ) {
      res.locals.activeSection = 'app';
    } else {
      res.locals.activeSection = 'public';
    }
    next();
  });
  
  // 6. View Engine Setup (EJS)
  app.use(expressLayouts);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // Optional: Set a default layout if most routes use the same one
  // app.set('layout', './layouts/main_layout'); // Example
  
  // 7. Route Handling
  app.use('/admin', adminRoutes);
  app.use('/', authRoutes);
  // app.use('/', projectFeatureRoutes); // Uncomment if using
  app.use('/', publicSiteRoutes);
  app.use('/', appRoutes); // This should generally be last among the main functional routes
  
  // 8. Basic 404 Error Handler
  app.use((req, res, next) => {
    console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).render('error/404', {
      title: 'Page Not Found',
      layout: './layouts/public_layout' // Ensure this layout exists or use another
    });
  });
  
  // 9. General Error Handler
  app.use((err, req, res, next) => {
    console.error("Global Error Handler Caught an Error:");
    console.error(`Path: ${req.method} ${req.originalUrl}`);
    if (err.status) console.error(`Error status: ${err.status}`);
    console.error(err.stack);
    
    const statusCode = err.status || 500;
    res.status(statusCode).render('error/500', {
      title: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err : { message: "An unexpected error occurred." },
      layout: './layouts/public_layout' // Ensure this layout exists
    });
  });
  
  // 10. Start Listening
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// CALL THE ASYNC START FUNCTION
startServer().catch(err => {
  console.error("Failed to start server due to initialization error:", err);
  process.exit(1); // Exit if essential initialization fails
});
*/