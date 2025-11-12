///config/csvMulterConfig.js
const multer = require('multer');
const path = require('path');

// Configure storage for CSV files
const csvStorage = multer.memoryStorage();

const csvFileFilter = (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv') || file.mimetype === 'application/vnd.ms-excel') { // Added broader CSV MIME type
        cb(null, true);
    } else {
        cb(new Error('Only .csv files are allowed!'), false);
    }
};

const uploadCsv = multer({ // This is the object that should have the .single method
    storage: csvStorage,
    fileFilter: csvFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Ensure you are exporting an object with uploadCsv as a property
module.exports = { uploadCsv }; // <<< CORRECT EXPORT






/*
const multer = require('multer');
const path = require('path');

// Configure storage for CSV files
const csvStorage = multer.memoryStorage(); // Store file in memory as a Buffer

const csvFileFilter = (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
    } else {
        cb(new Error('Only .csv files are allowed!'), false);
    }
};

const uploadCsv = multer({
    storage: csvStorage,
    fileFilter: csvFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});
*/