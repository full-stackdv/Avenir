// routes/staff.js
const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffManagementController');
const idCardController = require('../controllers/idCardController');
const { uploadStaffPhoto } = require('../config/multerConfig');
const { isAuthenticated, hasRole } = require('../middleware/authMiddleware');

// Assuming 'Project Manager' and 'Admin' can manage staff. Adjust roles as needed.
const canManageStaff = [isAuthenticated, hasRole(['Admin', 'Project Manager', 'Editor'])]; // Or specific new role
const canDeleteStaff = [isAuthenticated, hasRole('Admin')]; // Example: Only Admin can delete

// Staff Management Routes
router.get('/', canManageStaff, staffController.listStaff);
router.get('/register', canManageStaff, staffController.showRegisterForm);
router.post('/register', canManageStaff, uploadStaffPhoto.single('staff_photo'), staffController.registerStaff);
router.get('/:id/edit', canManageStaff, staffController.showEditForm);
router.post('/:id/edit', canManageStaff, uploadStaffPhoto.single('staff_photo'), staffController.updateStaff);
router.post('/:id/delete', canDeleteStaff, staffController.deleteStaff);

// ID Card Generator Route for a specific staff member
router.get('/:staff_id/idcard', canManageStaff, idCardController.showIdCardGeneratorForm);
// Alias for clarity as per directory structure, if 'create' page is the main generator
router.get('/:staff_id/idcard/create', canManageStaff, idCardController.showIdCardGeneratorForm);


module.exports = router;