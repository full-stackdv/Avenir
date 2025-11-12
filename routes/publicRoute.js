const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
// Optional: const { validateContactForm, validateCommentForm } = require('../middleware/validationMiddleware');

// This file does NOT handle GET / (the main homepage) as it's handled by routes/app.js


// GET / (Homepage - Public Landing Page)
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

/*
const express = require('express');
const router = express.Router();
const publicController = require('../../controllers/publicController'); // Path seems deep, check if correct

// Homepage
router.get('/public/index', publicController.renderHomepage); // URL is /public/public/index if mounted under /public

// About Page
router.get('/about', publicController.renderAboutPage); // URL is /public/about

// Contact Page
router.get('/contact', publicController.renderContactPage); // URL is /public/contact
router.post('/contact', publicController.handleContactForm);

// Blog/News Page
router.get('/blog', publicController.renderBlogPage); // URL is /public/blog. Should be showBlogPage
router.get('/blog/:slug', publicController.renderBlogPost); // URL is /public/blog/:slug. Should be showSinglePostPage

module.exports = router;
*/