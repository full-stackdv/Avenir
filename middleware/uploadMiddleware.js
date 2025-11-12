
//uploadMiddleware.js  
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define the storage location and filename
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'feature_images');
        // Create the directory if it doesn't exist
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Create a unique filename: fieldname-timestamp.extension
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// File filter to accept only images
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true); // Accept file
    } else {
        cb(new Error('Not an image! Please upload an image file.'), false); // Reject file
        // Or use: cb(null, false); and handle error in route
    }
};

// Configure multer instance
const uploadFeatureImage = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5 MB limit
    },
    fileFilter: imageFileFilter
});

module.exports = { uploadFeatureImage };

