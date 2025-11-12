// constructpro/config/documentMulterConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // File system module
/*
// Define the storage directory for feature images
const featureImageDir = path.join(__dirname, '../public/uploads/feature_images');

// Ensure the upload directory exists
if (!fs.existsSync(featureImageDir)) {
  fs.mkdirSync(featureImageDir, { recursive: true });
}

// --- Multer Disk Storage Configuration for Feature Images ---
const featureImageStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, featureImageDir); // Save files to public/uploads/feature_images/
  },
  filename: function(req, file, cb) {
    // Create a unique filename: fieldname-timestamp-originalExt
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// --- File Filter for Feature Images (Accept only common image types) ---
const featureImageFileFilter = (req, file, cb) => {
  // Allowed extensions
  const filetypes = /jpeg|jpg|png|gif|webp/;
  // Check extension
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime type
  const mimetype = filetypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true); // Accept file
  } else {
    // Create a specific error for multer to catch and pass to global error handler
    // Or, pass a custom error message to be handled in the controller/route
    const err = new Error('Error: Images Only! (jpeg, jpg, png, gif, webp)');
    err.status = 400; // Bad Request
    cb(err); // Reject file
  }
};

// --- Multer Upload Instance for Feature Images ---
const uploadFeatureImage = multer({
  storage: featureImageStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB file size limit
  },
  fileFilter: featureImageFileFilter
});

*/

// --- Configuration for Generic Document Uploads (for later Document Management) ---
const documentDir = path.join(__dirname, '../public/uploads/documents');
if (!fs.existsSync(documentDir)) {
  fs.mkdirSync(documentDir, { recursive: true });
}

const documentStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, documentDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    // Sanitize originalname to prevent issues, keep it for easier identification
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, uniqueSuffix + '-' + safeOriginalName + extension);
  }
});

const documentFileFilter = (req, file, cb) => {
  // More permissive filter for documents, or define specific allowed types
  // For now, let's accept common document/media types.
  // You can make this more restrictive based on requirements.
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .doc, .docx
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xls, .xlsx
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .ppt, .pptx
    'text/plain',
    'video/mp4', 'video/mpeg', 'video/quicktime' // .mov
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Error: File type not allowed for documents.');
    err.status = 400;
    cb(err);
  }
};

const uploadDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for general documents (adjust as needed)
  },
  fileFilter: documentFileFilter
});


module.exports = {
  uploadFeatureImage,
  uploadDocument
};
