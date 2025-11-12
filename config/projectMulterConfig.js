// constructpro/config/projectMulterConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // File system module

// Define the storage directory for project-specific documents
const projectDocsDir = path.join(__dirname, '../public/uploads/project_docs');

// Ensure the upload directory exists
if (!fs.existsSync(projectDocsDir)) {
    try {
        fs.mkdirSync(projectDocsDir, { recursive: true });
        console.log(`Directory created: ${projectDocsDir}`);
    } catch (err) {
        console.error(`Error creating directory ${projectDocsDir}:`, err);
        // Depending on how critical this is at startup, you might throw the error
        // or log it and let the application continue (uploads will fail later).
        // For now, let's log and continue, Multer will error out if dir is not writable.
    }
} else {
    console.log(`Directory already exists: ${projectDocsDir}`);
}

// --- Multer Disk Storage Configuration for Project Documents ---
const projectDocumentStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        // const projectId = req.params.projectId;
        // if (!projectId) {
        //     return cb(new Error('Project ID is missing from request, cannot determine upload destination.'));
        // }
        // Example: Create subdirectories per project (optional but good for organization)
        // const projectSpecificPath = path.join(projectDocsDir, `project_${projectId}`);
        // if (!fs.existsSync(projectSpecificPath)) {
        //     try {
        //         fs.mkdirSync(projectSpecificPath, { recursive: true });
        //     } catch (mkdirErr) {
        //         console.error(`Error creating project-specific directory ${projectSpecificPath}:`, mkdirErr);
        //         return cb(mkdirErr);
        //     }
        // }
        // cb(null, projectSpecificPath);

        // Simple approach: Save all project docs to the main project_docs directory
        cb(null, projectDocsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        // Sanitize originalname to prevent path traversal or other issues, and keep it somewhat identifiable
        const safeOriginalName = file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace non-alphanumeric (excluding ., _, -) with _
            .substring(0, 100); // Limit length of the original name part

        // Prepend projectId if available in req.params for better organization within a flat directory
        // Ensure req.params.projectId is available at this stage if you rely on it here.
        // Multer middleware runs before validation/controller logic that might populate req.params differently.
        // For reliability, projectId is usually part of the route where multer is applied.
        const projectId = req.params.projectId || 'unknownproject'; // Fallback if projectId not in params

        cb(null, `proj${projectId}-${uniqueSuffix}-${safeOriginalName}${extension}`);
    }
});

// --- File Filter for Project Documents ---
const projectDocumentFileFilter = (req, file, cb) => {
    // Define allowed MIME types for project documents
    const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .doc, .docx
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xls, .xlsx
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .ppt, .pptx
        'text/plain', 'text/csv',
        'application/zip', 'application/x-rar-compressed',
        'application/acad', // Common for .dwg
        'image/vnd.dwg',    // Another possibility for .dwg
        'application/dxf',  // .dxf
        'application/vnd.ms-project', // .mpp
        // 'application/octet-stream' // Use as a last resort, can be risky as it accepts anything
        // Add more specific MIME types as per requirements for different CAD files, etc.
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true); // Accept file
    } else {
        console.warn(`Rejected project document: ${file.originalname}, MIME type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(', ')}`);
        // Create a specific error for multer to catch
        const err = new Error('File type not permitted for project documents. Please upload a valid file format.');
        err.code = 'INVALID_FILE_TYPE'; // Custom error code
        err.status = 400; // Bad Request
        cb(err); // Reject file
    }
};

// --- Multer Upload Instance for Project Documents ---
const uploadProjectDocument = multer({
    storage: projectDocumentStorage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB file size limit (adjust as needed)
        files: 10 // Max number of files per upload request (adjust as needed)
    },
    fileFilter: projectDocumentFileFilter
});

// --- Helper function to delete uploaded project documents ---
// This can be specific to project documents or generalized if paths are handled carefully
const deleteUploadedProjectFile = (filePathInDb) => {
    // filePathInDb is expected to be relative to 'public/', e.g., 'uploads/project_docs/proj1-123-doc.pdf'
    if (!filePathInDb) {
        console.error('deleteUploadedProjectFile: No file path provided.');
        return Promise.reject(new Error('File path is required for deletion.'));
    }

    const absoluteFilePath = path.join(__dirname, '..', 'public', filePathInDb);

    // Security check: Ensure the path is within the intended 'public/uploads/project_docs' directory
    const intendedBaseDir = path.resolve(path.join(__dirname, '..', 'public', 'uploads', 'project_docs'));
    if (!path.resolve(absoluteFilePath).startsWith(intendedBaseDir)) {
        console.error('Attempt to delete file outside of designated project_docs directory:', absoluteFilePath);
        return Promise.reject(new Error('Invalid file path for deletion due to security constraints.'));
    }

    return new Promise((resolve, reject) => {
        fs.unlink(absoluteFilePath, (err) => {
            if (err) {
                // ENOENT means file not found, which is okay if it was already deleted
                if (err.code === 'ENOENT') {
                    console.warn(`File not found for deletion (may have been already deleted or path is incorrect): ${absoluteFilePath}`);
                    return resolve({ message: 'File not found, presumed already deleted or path incorrect.' });
                }
                console.error('Error deleting project file from server:', absoluteFilePath, err);
                return reject(err);
            }
            console.log('Successfully deleted project file from server:', absoluteFilePath);
            resolve({ message: 'File deleted successfully.' });
        });
    });
};


module.exports = {
    uploadProjectDocument,
    deleteUploadedProjectFile  // Exporting the specific delete helper
};
/*

//let's craft dedicated multer config for project documents, and leave previous multerConfig.js as it is: 
// constructpro/config/projectMulterConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // File system module

// --- Existing Feature Image Configuration ---
const featureImageDir = path.join(__dirname, '../public/uploads/feature_images');
if (!fs.existsSync(featureImageDir)) {
  fs.mkdirSync(featureImageDir, { recursive: true });
}
const featureImageStorage = multer.diskStorage({ /* ... existing config ... *//*/*});
const featureImageFileFilter = (req, file, cb) => { /* ... existing config ... *//* };
const uploadFeatureImage = multer({ /* ... existing config ... *//* });


// --- Configuration for Admin Post-Associated Documents ---
const postDocumentDir = path.join(__dirname, '../public/uploads/documents'); // For documents associated with posts
if (!fs.existsSync(postDocumentDir)) {
  fs.mkdirSync(postDocumentDir, { recursive: true });
}
const postDocumentStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, postDocumentDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 50); // Sanitize and shorten
    cb(null, `postdoc-${uniqueSuffix}-${safeOriginalName}${extension}`);
  }
});
const postDocumentFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Error: File type not allowed for post documents.');
    err.status = 400;
    cb(err);
  }
};
const uploadPostDocument = multer({ // Renamed from generic uploadDocument for clarity
  storage: postDocumentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: postDocumentFileFilter
});


// --- NEW: Configuration for Project-Specific Documents ---
const projectDocsDir = path.join(__dirname, '../public/uploads/project_docs');
if (!fs.existsSync(projectDocsDir)) {
  fs.mkdirSync(projectDocsDir, { recursive: true });
}

const projectDocumentStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    // We can create subdirectories per project if desired, e.g., `project_docs/${req.params.projectId}`
    // For now, let's keep it simple in one directory. Ensure directory exists.
    // fs.mkdirSync(path.join(projectDocsDir, req.params.projectId), { recursive: true }); // If using subdirs
    // cb(null, path.join(projectDocsDir, req.params.projectId));
    cb(null, projectDocsDir); // Save files to public/uploads/project_docs/
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    // Sanitize originalname to prevent issues, keep it for easier identification
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 100); // Max 100 chars for name part
    // Add projectId to filename for better organization if not using subfolders, and easier deletion logic later
    const projectId = req.params.projectId || 'unknown_project';
    cb(null, `proj${projectId}-${uniqueSuffix}-${safeOriginalName}${extension}`);
  }
});

const projectDocumentFileFilter = (req, file, cb) => {
  // Define allowed file types for project documents (can be more extensive)
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .doc, .docx
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xls, .xlsx
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .ppt, .pptx
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed',
    'application/dwg', 'application/vnd.dwg', 'image/vnd.dwg', // AutoCAD
    'application/octet-stream' // Fallback for some proprietary file types, use with caution
    // Add more as needed e.g. specific CAD file mimetypes
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true); // Accept file
  } else {
    console.warn(`Rejected file: ${file.originalname}, mimetype: ${file.mimetype}`);
    const err = new Error('Error: This file type is not permitted for project documents.');
    err.status = 400; // Bad Request
    cb(err); // Reject file
  }
};

const uploadProjectDocument = multer({
  storage: projectDocumentStorage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit for project documents (adjust as needed)
  },
  fileFilter: projectDocumentFileFilter
});

// Helper function to delete files from server
const deleteUploadedFile = (filePath) => {
    // filePath is relative to the project root, e.g., 'public/uploads/feature_images/image.jpg'
    // For security, ensure it's within the 'public/uploads' directory
    const absoluteFilePath = path.join(__dirname, '..', filePath); // Assuming config is in project_root/config
    
    // Basic path traversal check (very basic)
    const uploadsBaseDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!absoluteFilePath.startsWith(uploadsBaseDir)) {
        console.error('Attempt to delete file outside of uploads directory:', absoluteFilePath);
        return Promise.reject(new Error('Invalid file path for deletion.'));
    }

    return new Promise((resolve, reject) => {
        fs.unlink(absoluteFilePath, (err) => {
            if (err) {
                // ENOENT means file not found, which is okay if it was already deleted or never existed
                if (err.code === 'ENOENT') {
                    console.warn(`File not found for deletion (may have been already deleted): ${absoluteFilePath}`);
                    return resolve();
                }
                console.error('Error deleting file from server:', absoluteFilePath, err);
                return reject(err);
            }
            console.log('Successfully deleted file from server:', absoluteFilePath);
            resolve();
        });
    });
};


module.exports = {
  uploadFeatureImage,
  uploadPostDocument,    // Renamed for clarity
  uploadProjectDocument, // New export
  deleteUploadedFile     // Exporting the helper
};


*/