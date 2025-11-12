// constructpro/config/multerConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // File system module

// --- Helper to ensure directory exists ---
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// --- Define Base Upload Directory ---
const uploadsBaseDir = path.join(__dirname, '..', 'public', 'uploads');

// --- Specific Directories for Different Types of Uploads ---
const featureImageDir = path.join(uploadsBaseDir, 'feature_images');
const documentsDir = path.join(uploadsBaseDir, 'documents'); // For post-associated documents
const staffPhotosDir = path.join(uploadsBaseDir, 'staff_photos');
const companyAssetsDir = path.join(uploadsBaseDir, 'company_assets');
const projectDocsDir = path.join(uploadsBaseDir, 'project_docs');
const pageImagesDir = path.join(uploadsBaseDir, 'page_images'); // <<< NEW DIRECTORY FOR PAGE CONTENT IMAGES

// --- Ensure all directories exist ---
ensureDirExists(featureImageDir);
ensureDirExists(documentsDir);
ensureDirExists(staffPhotosDir);
ensureDirExists(companyAssetsDir);
ensureDirExists(projectDocsDir);
ensureDirExists(pageImagesDir); // <<< ENSURE NEW DIRECTORY IS CREATED

// --- Generic File Filters ---
const imageFileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|webp|svg/; // Added SVG
  const extnameValid = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetypeValid = filetypes.test(file.mimetype);
  
  if (mimetypeValid && extnameValid) {
    return cb(null, true);
  } else {
    // To pass a custom error message to the controller, set it on req
    req.fileValidationError = 'Invalid image type. Allowed: JPEG, JPG, PNG, GIF, WEBP, SVG.';
    // Then call cb with an error object for Multer to handle, or just cb(null, false)
    // For consistency with your existing pattern, let's create an Error object
    const err = new Error('Error: Images Only! (jpeg, jpg, png, gif, webp, svg)');
    err.status = 400; // Bad Request
    // cb(err); // This will stop multer and pass err to your error handler
    cb(null, false); // This will reject the file, and you check req.fileValidationError in controller
  }
};

const documentFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', // Added SVG
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'video/mp4', 'video/mpeg', 'video/quicktime'
    // Add other relevant document types if needed
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid document type. Please upload a supported file format.';
    // const err = new Error('Error: File type not allowed for documents.');
    // err.status = 400;
    // cb(err);
    cb(null, false);
  }
};

// --- Storage Engines ---

// Storage for Feature Images (Posts)
const featureImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, featureImageDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname.replace(/[^a-zA-Z0-9-]/g, '_') + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Storage for Post-Associated Documents
const postDocumentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeOriginalName);
  }
});

// Storage for Staff Photos
const staffPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, staffPhotosDir),
  filename: (req, file, cb) => {
    cb(null, `staff-photo-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// Storage for Company Assets (Logo, Signature, Stamp)
const companyAssetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, companyAssetsDir),
  filename: (req, file, cb) => {
    let newFilename = file.fieldname.replace('_upload', '');
    if (!['company_logo', 'ceo_signature', 'company_stamp'].includes(newFilename)) {
      newFilename = `${newFilename.replace(/[^a-zA-Z0-9-]/g, '_')}-${Date.now()}`;
    }
    cb(null, `${newFilename}${path.extname(file.originalname)}`);
  }
});

// Storage for general Project Documents
const projectDocumentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, projectDocsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now();
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `project-doc-${uniqueSuffix}-${safeOriginalName}`);
  }
});

// <<< NEW STORAGE ENGINE FOR PAGE CONTENT IMAGES >>>
const pageContentImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pageImagesDir), // Use the new directory
  filename: (req, file, cb) => {
    // Fieldname might be like 'image_file_123' (where 123 is section.id)
    // Keep it somewhat descriptive but unique.
    const sectionIdPart = file.fieldname.replace('image_file_', 's'); // e.g., s123
    const safeOriginalName = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50); // Limit length
    cb(null, `page-${sectionIdPart}-${safeOriginalName}-${Date.now()}${path.extname(file.originalname)}`);
  }
});


// --- Multer Upload Instances ---
const uploadFeatureImage = multer({
  storage: featureImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: imageFileFilter
});

const uploadPostDocument = multer({
  storage: postDocumentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: documentFileFilter
});

const uploadStaffPhoto = multer({
  storage: staffPhotoStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

const uploadCompanyAsset = multer({
  storage: companyAssetStorage,
  fileFilter: imageFileFilter, // Typically images
  limits: { fileSize: 1 * 1024 * 1024 } // 1MB
});

const uploadProjectDocument = multer({
  storage: projectDocumentStorage,
  fileFilter: documentFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// <<< NEW MULTER INSTANCE FOR PAGE CONTENT IMAGES >>>
// This will use .any() as discussed, allowing any file field names.
// The controller (`adminPageContentController`) will then find the relevant files
// from the `req.files` array based on expected field names like `image_file_SECTIONID`.
const uploadPageContentImages = multer({
  storage: pageContentImageStorage,
  fileFilter: imageFileFilter, // Page content images should be images
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB limit for page content images
}).any(); // Use .any() to accept files from any field name.


// --- File Deletion Helper ---
// This helper seems robust. filePathFragment should be relative to 'public' dir.
// e.g., 'uploads/feature_images/some-image.jpg' OR '/uploads/feature_images/some-image.jpg'
const deleteUploadedFile = (filePathFragment) => {
  if (!filePathFragment) {
    console.warn("deleteUploadedFile called with no filePathFragment.");
    return;
  }
  
  let relativePathFromPublic = filePathFragment;
  // Normalize: remove leading slash if present, ensure it starts with 'uploads/' or similar known structure if not absolute
  if (relativePathFromPublic.startsWith('/')) {
    relativePathFromPublic = relativePathFromPublic.substring(1);
  }
  // If it doesn't start with 'uploads/', it's ambiguous. Assume it's missing.
  // For this project structure, we expect paths like 'uploads/directory/file.ext'
  if (!relativePathFromPublic.startsWith('uploads/')) {
    console.warn(`deleteUploadedFile: filePathFragment '${filePathFragment}' does not seem to be a valid path relative to public/uploads/. Deletion skipped.`);
    return;
  }
  
  const fullPath = path.join(__dirname, '..', 'public', relativePathFromPublic);
  
  const publicDirResolved = path.resolve(path.join(__dirname, '..', 'public'));
  const fullPathResolved = path.resolve(fullPath);
  
  if (!fullPathResolved.startsWith(publicDirResolved)) {
    console.error(`Security Alert: Attempted to delete file outside public directory: ${fullPathResolved}`);
    return;
  }
  
  fs.unlink(fullPath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // console.warn(`File not found, cannot delete: ${fullPath}`); // Can be noisy
      } else {
        console.error(`Failed to delete file: ${fullPath}`, err);
      }
    } else {
      console.log(`Successfully deleted file: ${fullPath}`);
    }
  });
};


module.exports = {
  uploadFeatureImage,
  uploadPostDocument,
  uploadStaffPhoto,
  uploadCompanyAsset,
  uploadProjectDocument,
  uploadPageContentImages, // <<< EXPORT NEW MULTER INSTANCE
  deleteUploadedFile
};


/*

// avenircon/config/multerConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // File system module

// --- Helper to ensure directory exists ---
const ensureDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// --- Define Base Upload Directory ---
const uploadsBaseDir = path.join(__dirname, '..', 'public', 'uploads');

// --- Specific Directories for Different Types of Uploads ---
const featureImageDir = path.join(uploadsBaseDir, 'feature_images');
const documentsDir = path.join(uploadsBaseDir, 'documents'); // For post-associated documents
const staffPhotosDir = path.join(uploadsBaseDir, 'staff_photos'); // NEW
const companyAssetsDir = path.join(uploadsBaseDir, 'company_assets'); // NEW
const projectDocsDir = path.join(uploadsBaseDir, 'project_docs'); // Assuming this is for general project documents

// --- Ensure all directories exist ---
ensureDirExists(featureImageDir);
ensureDirExists(documentsDir);
ensureDirExists(staffPhotosDir); // NEW
ensureDirExists(companyAssetsDir); // NEW
ensureDirExists(projectDocsDir);


// --- Generic File Filters ---
const imageFileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        const err = new Error('Error: Images Only! (jpeg, jpg, png, gif, webp)');
        err.status = 400;
        cb(err);
    }
};

const documentFileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'video/mp4', 'video/mpeg', 'video/quicktime'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const err = new Error('Error: File type not allowed for documents.');
        err.status = 400;
        cb(err);
    }
};

// --- Storage Engines ---

// Storage for Feature Images (Posts)
const featureImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, featureImageDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Storage for Post-Associated Documents
const postDocumentStorage = multer.diskStorage({ // Renamed from documentStorage for clarity
    destination: (req, file, cb) => cb(null, documentsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, uniqueSuffix + '-' + safeOriginalName); // Removed extension duplicate
    }
});

// Storage for Staff Photos (NEW)
const staffPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, staffPhotosDir),
    filename: (req, file, cb) => {
        cb(null, `staff-photo-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Storage for Company Assets (Logo, Signature, Stamp) (NEW)
const companyAssetStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, companyAssetsDir),
    filename: (req, file, cb) => {
        let newFilename = file.fieldname.replace('_upload', ''); // e.g., company_logo_upload -> company_logo
        if (!['company_logo', 'ceo_signature', 'company_stamp'].includes(newFilename)) {
             newFilename = `${newFilename}-${Date.now()}`; // Fallback for safety
        }
        cb(null, `${newFilename}${path.extname(file.originalname)}`); // Allows overwrite
    }
});

// Storage for general Project Documents
const projectDocumentStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, projectDocsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now();
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `project_doc-${uniqueSuffix}-${safeOriginalName}`);
    }
});


// --- Multer Upload Instances ---
const uploadFeatureImage = multer({
    storage: featureImageStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: imageFileFilter
});

const uploadPostDocument = multer({ // Renamed from uploadDocument
    storage: postDocumentStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: documentFileFilter
});

const uploadStaffPhoto = multer({ // NEW
    storage: staffPhotoStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

const uploadCompanyAsset = multer({ // NEW
    storage: companyAssetStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 1 * 1024 * 1024 } // 1MB limit per asset
});

const uploadProjectDocument = multer({ // For general project documents
    storage: projectDocumentStorage,
    fileFilter: documentFileFilter,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});


// --- File Deletion Helper ---
const deleteUploadedFile = (filePathFragment) => {
    if (!filePathFragment) {
        console.warn("deleteUploadedFile called with no filePathFragment.");
        return;
    }
    // filePathFragment is expected to be like 'uploads/feature_images/image.jpg'
    // So, path.join(__dirname, '..', 'public', filePathFragment) is usually incorrect if filePathFragment already contains 'uploads'
    // Let's assume filePathFragment is relative to the 'public' directory, e.g., 'uploads/staff_photos/photo.jpg'
    // OR relative to the project root, e.g. 'public/uploads/staff_photos/photo.jpg'
    
    let fullPath;
    if (filePathFragment.startsWith('public/')) {
        fullPath = path.join(__dirname, '..', filePathFragment);
    } else if (filePathFragment.startsWith('/uploads/')) { // if it's an absolute URL path
         fullPath = path.join(__dirname, '..', 'public', filePathFragment);
    }
    else { // Assumes relative to public/uploads/
         fullPath = path.join(uploadsBaseDir, path.basename(filePathFragment)); // This might be too simple
         // A more robust way is to expect the full relative path from 'public'
         // For now, let's stick to the `public/uploads/...` structure for filePathFragment
         fullPath = path.join(__dirname, '..', 'public', filePathFragment); // Assuming filePathFragment = uploads/dir/file.ext
    }


    // Ensure the path is within the public directory to prevent accidental deletion outside
    const publicDirResolved = path.resolve(path.join(__dirname, '..', 'public'));
    const fullPathResolved = path.resolve(fullPath);

    if (!fullPathResolved.startsWith(publicDirResolved)) {
        console.error(`Attempted to delete file outside public directory: ${fullPathResolved}`);
        return;
    }

    fs.unlink(fullPath, (err) => {
        if (err) {
            if (err.code === 'ENOENT') { // File not found
                console.warn(`File not found, cannot delete: ${fullPath}`);
            } else {
                console.error(`Failed to delete file: ${fullPath}`, err);
            }
        } else {
            console.log(`Successfully deleted file: ${fullPath}`);
        }
    });
};

module.exports = {
    uploadFeatureImage,
    uploadPostDocument, // Updated name
    uploadStaffPhoto,   // NEW
    uploadCompanyAsset, // NEW
    uploadProjectDocument, // Existing, ensure it's correctly defined
    deleteUploadedFile
};


/*

// config/multerConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure directories exist
const ensureExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const staffPhotosDir = path.join(__dirname, '..', 'public', 'uploads', 'staff_photos');
const companyAssetsDir = path.join(__dirname, '..', 'public', 'uploads', 'company_assets');
const idCardUploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'id_card_elements'); // For generic uploads via idcard.js if needed

ensureExists(staffPhotosDir);
ensureExists(companyAssetsDir);
ensureExists(idCardUploadsDir);


// Storage engine for staff photos
const staffPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, staffPhotosDir);
    },
    filename: (req, file, cb) => {
        cb(null, `staff-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Storage engine for company assets (logo, signature, stamp)
const companyAssetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, companyAssetsDir);
    },
    filename: (req, file, cb) => {
        // Use a more descriptive name, e.g., logo.png, signature.png
        // Or keep it unique: `asset-${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
        let filename = file.fieldname; // e.g., company_logo, ceo_signature
        if (file.fieldname === 'company_logo_upload') filename = 'company_logo';
        if (file.fieldname === 'ceo_signature_upload') filename = 'ceo_signature';
        if (file.fieldname === 'company_stamp_upload') filename = 'company_stamp';
        cb(null, `${filename}${path.extname(file.originalname)}`); // Overwrites existing, which is fine for these singleton assets
    }
});

// Storage for general ID card image uploads (like photo for a new card from idcard.js)
const idCardElementStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, idCardUploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, `id-element-${Date.now()}${path.extname(file.originalname)}`);
    }
});


// File filter (simple image filter)
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const uploadStaffPhoto = multer({ storage: staffPhotoStorage, fileFilter: imageFileFilter });
const uploadCompanyAsset = multer({ storage: companyAssetStorage, fileFilter: imageFileFilter });
const uploadIdCardElement = multer({ storage: idCardElementStorage, fileFilter: imageFileFilter});


module.exports = {
    uploadStaffPhoto,
    uploadCompanyAsset,
    uploadIdCardElement // Export this if you plan to use it for ad-hoc uploads from the ID card interface
};

*/
/*
// constructpro/config/multerConfig.js
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // File system module

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
*/
/*

Dependencies: multer, path (Node.js core), fs (Node.js core).

Directory Creation: It checks if the upload directories (public/uploads/feature_images and public/uploads/documents) exist and creates them if they don't. This is important for Multer to work correctly.

featureImageStorage:

destination: Specifies where to save uploaded feature images.

filename: Defines how filenames are generated. Here, it's fieldname-timestamp-randomString.extension to ensure uniqueness and prevent overwrites.
featureImageFileFilter:

Specifies which file types are allowed (common image extensions and mimetypes).

If an invalid file type is uploaded, it calls cb(new Error(...)) which can be caught by an error-handling middleware in Express or handled in the route. I've added err.status = 400 to help with this.

uploadFeatureImage Instance:

This is the actual Multer middleware instance configured with the storage, file size limits (e.g., 2MB), and file filter.

documentStorage, documentFileFilter, uploadDocument:

Similar setup for generic document uploads, intended for the "Document Management" feature later. It has a more permissive file filter and a potentially larger size limit.
module.exports: Exports the configured Multer instances so they can be used in route files.
*/