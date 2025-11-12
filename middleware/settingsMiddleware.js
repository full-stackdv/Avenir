//middleware/settingsMiddleware.js 
const settingsService = require('../services/settingsService');


exports.loadSettings = async (req, res, next) => {
    try {
        const allSettings = await settingsService.getAllSettings(); // Fetch all settings as an object
        const settings = {};
        allSettings.forEach(setting => {
            settings[setting.setting_key] = setting.setting_value;
        });
        res.locals.settings = settings; // Make settings available to all views
        res.locals.getSetting = (key, defaultValue = '') => settingsService.getSetting(key, defaultValue, settings); // Helper
        next();
    } catch (error) {
        console.error("Error loading settings:", error);
        // Potentially render a critical error page or proceed with defaults
        res.locals.settings = {}; 
        res.locals.getSetting = (key, defaultValue = '') => defaultValue;
        next(); // Or next(error) if this is critical
    }
};
/*
exports.checkMaintenanceMode = (req, res, next) => {
    // Access settings from res.locals if loadSettings middleware runs before this
    const maintenanceModeEnabled = res.locals.getSetting('maintenance_mode_enabled', 'false') === 'true';
    const maintenanceMessage = res.locals.getSetting('maintenance_mode_message', 'The site is currently undergoing scheduled maintenance. Please check back soon.');

    // Allow access to admin panel even in maintenance mode
    if (req.originalUrl.startsWith('/admin')) {
        return next();
    }

    // Allow access to specific essential routes if needed (e.g., login for admins to turn it off)
    // const allowedPaths = ['/login', '/some-status-api'];
    // if (allowedPaths.includes(req.path)) {
    //    return next();
    // }


    if (maintenanceModeEnabled) {
        // Correct path to your maintenance view
        return res.status(503).render('public/maintenance/index', { // Ensure this path is correct
            title: `${res.locals.getSetting('site_name', 'Our Site')} - Under Maintenance`,
            maintenanceMessage: maintenanceMessage,
            settings: res.locals.settings, // Pass all settings if your maintenance page uses them
            layout: false // Typically, maintenance pages don't use the main layout
        });
    }
    next();
};
*/



exports.checkMaintenanceMode = (req, res, next) => {
  const maintenanceMode = settingsService.getSetting('maintenance_mode', false);
  const maintenanceMessage = settingsService.getSetting('maintenance_mode_message', 'Site under maintenance.');
  
  // Allow access to admin panel and specific routes (like login for admin)
  if (maintenanceMode && !req.originalUrl.startsWith('/admin') && req.originalUrl !== '/login' && req.originalUrl !== '/logout') {
    // Also check if user is admin if they are trying to access non-admin pages
    if (!req.session.user || req.session.user.role !== 'admin') {
      res.status(503).render('public/maintenance', { // Create this view
        layout: 'layout/public_layout', // Or a minimal layout
        title: 'Site Maintenance',
        message: maintenanceMessage,
        getSetting: settingsService.getSetting // Pass getSetting if maintenance page needs it
      });
      return; // Important to stop further processing
    }
  }
  next();
};


