// constructpro/middleware/announcementMiddleware.js
const announcementService = require('../services/announcementService'); // Adjust path as necessary

module.exports = async (req, res, next) => {
  // Display announcements for logged-in users, or all users if desired.
  // Modify the condition if you want announcements on public pages too.
  // if (req.session.user) { // Only for logged-in users
  try {
    // Fetch active announcements. This call is efficient.
    const activeAnnouncements = await announcementService.getActiveAnnouncementsForDisplay();
    if (activeAnnouncements && activeAnnouncements.length > 0) {
      res.locals.activeAnnouncements = activeAnnouncements;
    } else {
      res.locals.activeAnnouncements = [];
    }
  } catch (error) {
    console.error("Failed to load active announcements:", error);
    res.locals.activeAnnouncements = []; // Ensure it's always an array
  }
  // } else {
  //     res.locals.activeAnnouncements = [];
  // }
  next();
};

 