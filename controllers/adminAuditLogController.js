// controllers/adminAuditLogController.js
const db = require('../config/db');
const { parse, isValid, format, startOfDay, endOfDay } = require('date-fns');

// @desc    List audit log entries in the admin area
// @route   GET /admin/audit-logs
// @access  Private (Admin)
exports.listAuditLogs = async (req, res, next) => {
    try {
        const { userId, action, targetType, dateStart, dateEnd, sort, order } = req.query;
        let page = parseInt(req.query.page) || 1;
        const limit = 20; // Logs per page
        const offset = (page - 1) * limit;

        let queryParams = [];
        let countQueryParams = [];
        let baseQuery = `
            SELECT al.id, al.user_id, u.username as actor_username, al.action, 
                   al.target_type, al.target_id, al.details, al.ip_address,
                   DATE_FORMAT(al.created_at, '%Y-%m-%d %H:%i:%s') as created_at_formatted
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
        `;
        let countQuery = `SELECT COUNT(*) as total FROM audit_logs al`;
        let whereClauses = [];

        if (userId && /^\d+$/.test(userId)) { // Check if userId is a number
            whereClauses.push(`al.user_id = ?`);
            queryParams.push(parseInt(userId));
            countQueryParams.push(parseInt(userId));
        }
        if (action) {
            whereClauses.push(`al.action LIKE ?`);
            const actionLike = `%${action}%`;
            queryParams.push(actionLike);
            countQueryParams.push(actionLike);
        }
        if (targetType) {
            whereClauses.push(`al.target_type = ?`);
            queryParams.push(targetType);
            countQueryParams.push(targetType);
        }

        if (dateStart) {
            const parsedDateStart = parse(dateStart, 'yyyy-MM-dd', new Date());
            if (isValid(parsedDateStart)) {
                whereClauses.push(`al.created_at >= ?`);
                queryParams.push(format(startOfDay(parsedDateStart), 'yyyy-MM-dd HH:mm:ss'));
                countQueryParams.push(format(startOfDay(parsedDateStart), 'yyyy-MM-dd HH:mm:ss'));
            }
        }
        if (dateEnd) {
            const parsedDateEnd = parse(dateEnd, 'yyyy-MM-dd', new Date());
            if (isValid(parsedDateEnd)) {
                whereClauses.push(`al.created_at <= ?`);
                queryParams.push(format(endOfDay(parsedDateEnd), 'yyyy-MM-dd HH:mm:ss'));
                countQueryParams.push(format(endOfDay(parsedDateEnd), 'yyyy-MM-dd HH:mm:ss'));
            }
        }

        if (whereClauses.length > 0) {
            baseQuery += ` WHERE ${whereClauses.join(' AND ')}`;
            countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        const validSortColumns = ['created_at', 'action', 'target_type', 'actor_username'];
        const sortColumn = validSortColumns.includes(sort) ? sort : 'al.created_at'; // Default sort
        const sortOrder = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC'; // Default DESC

        baseQuery += ` ORDER BY ${sortColumn === 'actor_username' ? 'u.username' : sortColumn} ${sortOrder} LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        const [logs] = await db.query(baseQuery, queryParams);
        const [countResult] = await db.query(countQuery, countQueryParams);
        const totalLogs = countResult[0].total;
        const totalPages = Math.ceil(totalLogs / limit);

        // Fetch distinct users and target types for filter dropdowns
        const [distinctUsers] = await db.query("SELECT id, username FROM users ORDER BY username ASC");
        const [distinctTargetTypes] = await db.query("SELECT DISTINCT target_type FROM audit_logs WHERE target_type IS NOT NULL ORDER BY target_type ASC");


        res.render('admin/audit_logs/list', {
            title: 'Audit Logs - Admin',
            pageTitle: 'System Audit Logs',
            logs: logs,
            layout: './layouts/admin_layout',
            distinctUsers,
            distinctTargetTypes,
            filters: { userId, action, targetType, dateStart, dateEnd, sort, order },
            currentPage: page,
            totalPages: totalPages,
            totalLogs: totalLogs
        });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        next(error);
    }
};

