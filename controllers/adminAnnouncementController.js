// constructpro/controllers/adminAnnouncementController.js
const announcementService = require('../services/announcementService');
const settingsService = require('../services/settingsService'); // For pagination limit

exports.listAnnouncements = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(settingsService.getSetting('default_items_per_page', 10));
    const filter = req.query.filter || 'all'; // e.g., ?filter=active
    
    const { announcements, totalAnnouncements, currentPage, totalPages } =
    await announcementService.listAnnouncements({ page, limit, filter });
    
    res.render('admin/content/announcements/list', {
      title: 'Manage Announcements',
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'announcements',
      announcements,
      totalAnnouncements,
      currentPage,
      totalPages,
      currentFilter: filter,
      messages: req.flash()
    });
  } catch (error) {
    next(error);
  }
};

exports.showCreateForm = (req, res, next) => {
  res.render('admin/content/announcements/form', {
    title: 'Create Announcement',
    layout: 'layout/admin_layout',
    user: req.session.user,
    currentMenu: 'announcements',
    announcement: null, // For form reusability
    formAction: '/admin/content/announcements/create',
    messages: req.flash()
  });
};

exports.handleCreate = async (req, res, next) => {
  try {
    // Basic validation (can be expanded with a library like express-validator)
    if (!req.body.title || !req.body.content) {
      req.flash('error', 'Title and Content are required.');
      return res.redirect('/admin/content/announcements/create');
    }
    await announcementService.createAnnouncement(req.body, req.session.user.id);
    req.flash('success', 'Announcement created successfully.');
    res.redirect('/admin/content/announcements');
  } catch (error) {
    req.flash('error', `Failed to create announcement: ${error.message}`);
    // Optionally, re-render form with errors and old input
    // res.render('admin/content/announcements/form', { ... old data ... });
    res.redirect('/admin/content/announcements/create');
  }
};

exports.showEditForm = async (req, res, next) => {
  try {
    const announcement = await announcementService.getAnnouncementById(req.params.id);
    if (!announcement) {
      req.flash('error', 'Announcement not found.');
      return res.redirect('/admin/content/announcements');
    }
    res.render('admin/content/announcements/form', {
      title: 'Edit Announcement',
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'announcements',
      announcement,
      formAction: `/admin/content/announcements/${req.params.id}/edit`,
      messages: req.flash()
    });
  } catch (error) {
    next(error);
  }
};

exports.handleUpdate = async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.content) {
      req.flash('error', 'Title and Content are required.');
      return res.redirect(`/admin/content/announcements/${req.params.id}/edit`);
    }
    const result = await announcementService.updateAnnouncement(req.params.id, req.body, req.session.user.id);
    if (result.affectedRows > 0) {
      req.flash('success', 'Announcement updated successfully.');
    } else {
      req.flash('info', 'No changes made to the announcement or announcement not found.');
    }
    res.redirect('/admin/content/announcements');
  } catch (error) {
    req.flash('error', `Failed to update announcement: ${error.message}`);
    res.redirect(`/admin/content/announcements/${req.params.id}/edit`);
  }
};

exports.handleDelete = async (req, res, next) => {
  try {
    const result = await announcementService.deleteAnnouncement(req.params.id);
    if (result.affectedRows > 0) {
      req.flash('success', 'Announcement deleted successfully.');
    } else {
      req.flash('error', 'Announcement not found or already deleted.');
    }
    res.redirect('/admin/content/announcements');
  } catch (error) {
    req.flash('error', `Failed to delete announcement: ${error.message}`);
    res.redirect('/admin/content/announcements');
  }
};

exports.handleToggleActive = async (req, res, next) => {
  try {
    const result = await announcementService.toggleActivation(req.params.id);
    req.flash('success', `Announcement ${result.newState ? 'activated' : 'deactivated'} successfully.`);
    res.redirect('/admin/content/announcements');
  } catch (error) {
    req.flash('error', `Failed to toggle announcement activation: ${error.message}`);
    res.redirect('/admin/content/announcements');
  }
};