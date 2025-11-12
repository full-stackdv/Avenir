// constructpro/services/announcementService.js
const db = require('../config/db');

exports.createAnnouncement = async (data, adminId) => {
    const { title, content, start_date, end_date, type, is_active } = data;
    const sql = `INSERT INTO announcements (title, content, start_date, end_date, type, is_active, created_by_admin_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    try {
        const [result] = await db.query(sql, [
            title, 
            content, 
            start_date || null, 
            end_date || null, 
            type || 'info', 
            is_active !== undefined ? (is_active === 'true' || is_active === true) : true, // Handle checkbox value
            adminId
        ]);
        return { id: result.insertId, ...data };
    } catch (error) {
        console.error('Error creating announcement:', error);
        throw error;
    }
};

exports.updateAnnouncement = async (id, data, adminId) => {
    const { title, content, start_date, end_date, type, is_active } = data;
    const sql = `UPDATE announcements SET 
                 title = ?, content = ?, start_date = ?, end_date = ?, type = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`;
    try {
        const [result] = await db.query(sql, [
            title, 
            content, 
            start_date || null, 
            end_date || null, 
            type || 'info',
            is_active !== undefined ? (is_active === 'true' || is_active === true) : false, // If checkbox not sent, assume false
            id
        ]);
        return { affectedRows: result.affectedRows };
    } catch (error) {
        console.error('Error updating announcement:', error);
        throw error;
    }
};

exports.deleteAnnouncement = async (id) => {
    const sql = `DELETE FROM announcements WHERE id = ?`;
    try {
        const [result] = await db.query(sql, [id]);
        return { affectedRows: result.affectedRows };
    } catch (error) {
        console.error('Error deleting announcement:', error);
        throw error;
    }
};

exports.getAnnouncementById = async (id) => {
    const sql = `SELECT a.*, u.username as created_by_username 
                 FROM announcements a
                 LEFT JOIN users u ON a.created_by_admin_id = u.id
                 WHERE a.id = ?`;
    try {
        const [rows] = await db.query(sql, [id]);
        if (rows.length > 0) {
            // Convert boolean is_active from 0/1 to true/false if needed for forms
            rows[0].is_active = !!rows[0].is_active;
            return rows[0];
        }
        return null;
    } catch (error) {
        console.error('Error fetching announcement by ID:', error);
        throw error;
    }
};

exports.listAnnouncements = async (options = {}) => {
    const { page = 1, limit = 10, filter = 'all' } = options; // filter: 'all', 'active', 'inactive'
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];

    if (filter === 'active') {
        whereClause = 'WHERE is_active = TRUE';
    } else if (filter === 'inactive') {
        whereClause = 'WHERE is_active = FALSE';
    }

    const dataSql = `SELECT a.*, u.username as created_by_username 
                     FROM announcements a
                     LEFT JOIN users u ON a.created_by_admin_id = u.id
                     ${whereClause}
                     ORDER BY a.created_at DESC
                     LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const countSql = `SELECT COUNT(*) as total FROM announcements ${whereClause}`;
    
    try {
        const [rows] = await db.query(dataSql, params);
        const [[{ total }]] = await db.query(countSql, params.slice(0, params.length - 2)); // Exclude limit & offset for count

        return {
            announcements: rows.map(ann => ({...ann, is_active: !!ann.is_active})),
            totalAnnouncements: total,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit)
        };
    } catch (error) {
        console.error('Error listing announcements:', error);
        throw error;
    }
};

exports.toggleActivation = async (id) => {
    // First, get current state to toggle it
    const announcement = await this.getAnnouncementById(id);
    if (!announcement) {
        throw new Error('Announcement not found');
    }
    const newActiveState = !announcement.is_active;
    const sql = `UPDATE announcements SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    try {
        const [result] = await db.query(sql, [newActiveState, id]);
        return { affectedRows: result.affectedRows, newState: newActiveState };
    } catch (error) {
        console.error('Error toggling announcement activation:', error);
        throw error;
    }
};

exports.getActiveAnnouncementsForDisplay = async () => {
    const sql = `SELECT id, title, content, type 
                 FROM announcements 
                 WHERE is_active = TRUE 
                 AND (start_date IS NULL OR start_date <= NOW())
                 AND (end_date IS NULL OR end_date >= NOW())
                 ORDER BY created_at DESC`;
    try {
        const [rows] = await db.query(sql);
        return rows;
    } catch (error) {
        console.error('Error fetching active announcements for display:', error);
        throw error;
    }
};