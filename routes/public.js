//public.js 
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const settingsService = require('../services/settingsService');
//const postService = require('../services/postService');
const postService = require('../services/postService');

// Optional: const { validateContactForm, validateCommentForm } = require('../middleware/validationMiddleware');

// This file does NOT handle GET / (the main homepage) as it's handled by routes/app.js

// R1. GET / (Homepage - Public Landing Page) moved from public app.js to here 
router.get('/', (req, res, next) => {
    try {
        res.render('index', {
            title: 'Avenircon - Home',
            pageTitle: 'Welcome to Avenircon',
            layout: './layouts/public_layout',
            formData: req.session.contactFormData && req.session.contactFormData.source_page === 'homepage' ? req.session.contactFormData : {},
           errors: req.session.contactFormErrors && req.session.contactFormData && req.session.contactFormData.source_page === 'homepage' ? req.session.contactFormErrors : []
        });
        if (req.session.contactFormData && req.session.contactFormData.source_page === 'homepage') {
            delete req.session.contactFormData;
            delete req.session.contactFormErrors;
        }
    } catch (error) {
        console.error("Error rendering public homepage (index.ejs):", error);
        next(error);
    }
});

// R3. About Us Page
router.get('/about', publicController.showAboutPage);

// R4. Blog Listing Page
router.get('/blog', publicController.showBlogPage);


// R5. Single Blog Post Page
router.get('/blog/:slug', publicController.showSinglePostPage);

// R5.6 Comment Submission
router.post('/blog/:slug/comments', /* [validateCommentForm], */ publicController.handleAddComment);

// R6. Contact Us Page
router.get('/contact', publicController.showContactPage);

// R6.3 Contact Form Submission
router.post('/contact', /* [validateContactForm], */ publicController.handleContactForm);


// R4. Blog Listing Page
router.get('/gallery', publicController.showGalleryPage);


module.exports = router;