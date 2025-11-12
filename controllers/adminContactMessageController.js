// controllers/adminContactMessageController.js
const db = require('../config/db');

// @desc    List contact messages in the admin area
// @route   GET /admin/contact-messages
// @access  Private (Admin)
exports.listContactMessages = async (req, res, next) => {
    try {
        const filter = req.query.filter || 'all'; // 'all', 'unread', 'read'
        let page = parseInt(req.query.page) || 1;
        const limit = 15; // Messages per page
        const offset = (page - 1) * limit;

        let queryParams = [];
        let countQueryParams = [];
        let baseQuery = `
            SELECT id, name, email, subject, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as received_at, is_read 
            FROM contact_messages
        `;
        let countQuery = `SELECT COUNT(*) as total FROM contact_messages`;
        let whereClauses = [];

        if (filter === 'unread') {
            whereClauses.push(`is_read = FALSE`);
        } else if (filter === 'read') {
            whereClauses.push(`is_read = TRUE`);
        }
        // 'all' has no specific where clause for read status

        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
            countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        baseQuery += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        const [messages] = await db.query(baseQuery, queryParams);
        const [countResult] = await db.query(countQuery, countQueryParams);
        const totalMessages = countResult[0].total;
        const totalPages = Math.ceil(totalMessages / limit);

        res.render('admin/contact_messages/list', {
            title: 'Contact Messages - Admin',
            pageTitle: 'Contact Form Submissions',
            messages: messages,
            layout: './layouts/admin_layout',
            currentFilter: filter,
            currentPage: page,
            totalPages: totalPages,
            totalMessages: totalMessages
        });
    } catch (error) {
        console.error("Error fetching contact messages:", error);
        next(error);
    }
};

// @desc    Show details of a specific contact message
// @route   GET /admin/contact-messages/:messageId
// @access  Private (Admin)
exports.showContactMessageDetails = async (req, res, next) => {
    try {
        const messageId = parseInt(req.params.messageId);
        const [messageRows] = await db.query(
            "SELECT *, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as received_at_full FROM contact_messages WHERE id = ?",
            [messageId]
        );

        if (messageRows.length === 0) {
            req.flash('error_msg', 'Message not found.');
            return res.redirect('/admin/contact-messages');
        }
        const message = messageRows[0];

        // Mark as read if it's not already
        if (!message.is_read) {
            await db.query("UPDATE contact_messages SET is_read = TRUE WHERE id = ?", [messageId]);
            message.is_read = true; // Reflect change immediately in view
        }

        res.render('admin/contact_messages/details', {
            title: `Message from ${message.name} - Admin`,
            pageTitle: `Contact Message Details`,
            message: message,
            layout: './layouts/admin_layout'
        });
    } catch (error) {
        console.error("Error fetching contact message details:", error);
        next(error);
    }
};


// @desc    Delete a contact message
// @route   POST /admin/contact-messages/:messageId/delete
// @access  Private (Admin)
exports.deleteContactMessage = async (req, res, next) => {
    try {
        const messageId = parseInt(req.params.messageId);
        const [result] = await db.query("DELETE FROM contact_messages WHERE id = ?", [messageId]);

        if (result.affectedRows > 0) {
            req.flash('success_msg', 'Message deleted successfully.');
        } else {
            req.flash('error_msg', 'Message not found or already deleted.');
        }
        res.redirect('/admin/contact-messages');
    } catch (error) {
        console.error("Error deleting contact message:", error);
        req.flash('error_msg', 'Failed to delete message.');
        res.redirect('/admin/contact-messages');
    }
};