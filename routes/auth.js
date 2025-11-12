//auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated, isGuest } = require('../middleware/authMiddleware');

// --- Authentication Routes ---
router.get('/register', isGuest, authController.showRegisterPage);
router.post('/register', isGuest, authController.registerUser);

router.get('/login', isGuest, authController.showLoginPage);
router.post('/login', isGuest, authController.loginUser);

router.get('/logout', isAuthenticated, authController.logoutUser);

// --- Password Reset Routes ---
router.get('/forgot-password', isGuest, authController.showForgotPasswordPage);
router.post('/forgot-password', isGuest, authController.handleForgotPassword);

router.get('/reset-password/:token', isGuest, authController.showResetPasswordPage);
router.post('/reset-password/:token', isGuest, authController.handleResetPassword);

module.exports = router;