//adminBackupController.js 
const backupService = require('../services/backupService');
const settingsService = require('../services/settingsService'); // To display settings

exports.showBackupPage = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(settingsService.getSetting('default_items_per_page', 10));
    
    const { backups, totalBackups, currentPage, totalPages } = await backupService.listBackups(page, limit);
    
    const backupSettings = {
      enabled: settingsService.getSetting('backup_enabled', false),
      directory: settingsService.getSetting('backup_directory', './backups'),
      maxToKeep: settingsService.getSetting('max_local_backups_to_keep', '5')
    };
    
    res.render('admin/system/backups/index', {
      title: 'System Backups',
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'system_backups', // For sidebar active state
      backupSettings,
      backups,
      totalBackups,
      currentPage,
      totalPages,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Error showing backup page:', error);
    req.flash('error', 'Failed to load backup information.');
    res.redirect('/admin/dashboard'); // Or an appropriate error page
  }
};

exports.handleTriggerManualBackup = async (req, res, next) => {
  try {
    const result = await backupService.createManualBackup(req.session.user.id);
    if (result.success) {
      req.flash('success', result.message);
    } else {
      req.flash('error', result.message || 'Manual backup failed. Check logs.');
    }
  } catch (error) {
    console.error('Error triggering manual backup:', error);
    req.flash('error', `Failed to trigger manual backup: ${error.message}`);
  }
  res.redirect('/admin/system/backups');
};

exports.handleDeleteBackup = async (req, res, next) => {
  const backupId = req.params.backupId;
  try {
    const result = await backupService.deleteBackup(backupId);
    if (result.success) {
      req.flash('success', result.message);
    } else {
      req.flash('error', result.message || 'Failed to delete backup.');
    }
  } catch (error) {
    console.error(`Error deleting backup ${backupId}:`, error);
    req.flash('error', `Failed to delete backup: ${error.message}`);
  }
  res.redirect('/admin/system/backups');
};

// Optional: Download backup - Implement with caution
// exports.handleDownloadBackup = async (req, res, next) => {
//     const backupId = req.params.backupId;
//     try {
//         const backupDetails = await backupService.getBackupDetails(backupId);
//         if (!backupDetails || !backupDetails.file_path || backupDetails.status !== 'success') {
//             req.flash('error', 'Backup not found or not available for download.');
//             return res.redirect('/admin/system/backups');
//         }
//         // Security: Ensure the file_path is safe and within the designated backup directory
//         const backupDir = path.resolve(settingsService.getSetting('backup_directory', './backups'));
//         const requestedPath = path.resolve(backupDetails.file_path);
//         if (!requestedPath.startsWith(backupDir)) {
//              req.flash('error', 'Invalid backup file path.');
//              return res.redirect('/admin/system/backups');
//         }

//         res.download(backupDetails.file_path, path.basename(backupDetails.file_path), (err) => {
//             if (err) {
//                 console.error('Error downloading backup file:', err);
//                 if (!res.headersSent) {
//                    req.flash('error', 'Could not download backup file.');
//                    res.redirect('/admin/system/backups');
//                 }
//             }
//         });
//     } catch (error) {
//         console.error(`Error preparing backup download for ${backupId}:`, error);
//         req.flash('error', 'Failed to download backup.');
//         res.redirect('/admin/system/backups');
//     }
// };