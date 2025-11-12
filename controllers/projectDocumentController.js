// Avenircon/controllers/projectDocumentController.js
const db = require('../config/db');
//const { deleteUploadedFile } = require('../config/projectMulterConfig'); // Import the helper
const path = require('path'); // Make sure path is required
const { deleteUploadedProjectFile } = require('../config/projectMulterConfig'); // Should be this if using dedicated
//const path = 'path'; // Should be const path = require('path');
//uploadProjectDocument
//const { uploadProjectDocument } = require('../config/projectMulterConfig'); // Should be this if using dedicated
//const { uploadDocument } = require('../config/multerConfig');


exports.handleProjectDocumentUpload = async (req, res, next) => {
    const projectId = req.params.projectId; // From URL
    const uploaderId = req.session.user.id;
    const { descriptions, categories } = req.body; // Assuming these are arrays or comma-separated strings

    if (!req.files || req.files.length === 0) {
        req.flash('error_msg', 'No files were selected for upload.');
        return res.redirect(`/projects/${projectId}/details`);
    }

    try {
        const documentPromises = req.files.map(async (file, index) => {
            const description = Array.isArray(descriptions) ? (descriptions[index] || null) : (descriptions || null);
            const category = Array.isArray(categories) ? (categories[index] || 'Uncategorized') : (categories || 'Uncategorized');
            
            // Construct file path relative to public directory for DB storage
            // Multer's file.path is the full absolute path. We need a relative one for serving.
            // file.path example: /abs/path/to/Avenircon/public/uploads/project_docs/proj1-123-doc.pdf
            // We want to store: uploads/project_docs/proj1-123-doc.pdf
            const relativeFilePath = file.path.substring(file.path.indexOf('/uploads/'));


            const newDocument = {
                project_id: projectId,
                uploaded_by_id: uploaderId,
                file_name: file.originalname, // Original filename
                stored_filename: file.filename, // Multer's unique generated filename
                file_path: relativeFilePath, // Path for accessing via web, relative to 'public'
                file_type: file.mimetype,
                file_size_bytes: file.size,
                description: description,
                category: category,
                // version: 1, // For future versioning
                // permit_expiry_date: null // For future permit tracking
            };
            return db.query("INSERT INTO project_documents SET ?", newDocument);
        });

        await Promise.all(documentPromises);
        req.flash('success_msg', `${req.files.length} document(s) uploaded successfully.`);
    } catch (error) {

        console.error("Error uploading project documents:", error);
        // If DB insert fails, attempt to delete already uploaded files from this batch
        if (req.files && req.files.length > 0) { // Check if req.files exists
            req.files.forEach(file => {
                // Construct the path relative to the 'public' directory for deletion
                // Multer's file.path is absolute. deleteUploadedProjectFile expects a path relative to 'public/'
                const pathInDbFormat = file.path.substring(file.path.indexOf('uploads' + path.sep + 'project_docs' + path.sep));
                
                // Or, if deleteUploadedProjectFile expects 'public/uploads/project_docs/filename'
                // const pathForDeletionHelper = 'public' + path.sep + file.path.substring(file.path.indexOf('uploads' + path.sep + 'project_docs' + path.sep));
                // Let's assume deleteUploadedProjectFile from projectMulterConfig.js expects path relative to public/
                // file.path: D:\fixer\public\uploads\project_docs\proj6-123-name.jpg
                // We need to extract: uploads/project_docs/proj6-123-name.jpg
                let relativePathForDelete;
                const uploadsMarker = 'public' + path.sep + 'uploads'; // or just 'uploads' if helper expects it from there
                const publicIndex = file.path.indexOf(uploadsMarker);
                if (publicIndex !== -1) {
                    // If your delete helper takes path from project root (e.g. 'public/uploads/project_docs/file.ext')
                     relativePathForDelete = file.path.substring(file.path.indexOf('public' + path.sep));

                    // If your delete helper in projectMulterConfig expects path relative to `public/`
                    // e.g. 'uploads/project_docs/yourfile.pdf'
                    // Then the `filePathInDb` construction was:
                    // const filePathInDb = `uploads/project_docs/${file.filename}`; (if filename is just the name)
                    // Or based on file.path extraction.
                    // The deleteUploadedProjectFile we defined expects path relative to public: 'uploads/project_docs/...'

                    // filePathInDb from your `deleteUploadedProjectFile` definition:
                    // "filePathInDb is expected to be relative to 'public/', e.g., 'uploads/project_docs/proj1-123-doc.pdf'"
                    // So, we need to extract that part from the absolute `file.path`
                    
                    const parts = file.path.split(path.sep + 'public' + path.sep);
                    if (parts.length > 1) {
                        relativePathForDelete = parts[1]; // This should give 'uploads\project_docs\filename.ext'
                    } else {
                        console.error("Could not determine relative path for deletion from:", file.path);
                        return; // Skip deletion for this file if path is weird
                    }
                } else {
                    console.error("Could not determine relative path for deletion from:", file.path);
                    return; // Skip deletion for this file
                }


                deleteUploadedProjectFile(relativePathForDelete) // <<< USE THE CORRECTLY IMPORTED FUNCTION
                    .catch(delErr => console.error("Cleanup error during file deletion:", delErr.message || delErr, "File:", file.originalname));
            });
        }
        req.flash('error_msg', 'Failed to upload documents. Database operation failed.'); // More specific error
        // Decide if you redirect here or let it fall through to next(error) if you want the global error handler page
        return res.redirect(`/projects/${projectId}/details`); // Or render an error page
    }
    // Removed the redundant res.redirect from here as it was inside the try block
    // It should only happen on success or specific error handling.
    // If try succeeds and there's no explicit redirect, it might hang.
    // Put success redirect at the end of try or ensure all paths lead to a response.
    // If all promises resolve, then redirect on success:
    // This was missing from your original controller snippet if Promise.all was successful
    if (!(error)) { // if no error occurred in try block
         res.redirect(`/projects/${projectId}/details`);
    }
};

/*
        console.error("Error uploading project documents:", error);


        // If DB insert fails, attempt to delete already uploaded files from this batch
        req.files.forEach(file => {
            deleteUploadedFile(file.path.substring(file.path.indexOf('public/'))).catch(delErr => console.error("Cleanup error:", delErr)); //not defined line
        });
        req.flash('error_msg', 'Failed to upload documents. Please try again.');
        

    }
    res.redirect(`/projects/${projectId}/details`);
};
*/

exports.downloadDocument = async (req, res, next) => {
  const { projectId, documentId } = req.params;
  const userId = req.session.user.id;
  
  try {
    const [documents] = await db.query(
      'SELECT * FROM project_documents WHERE id = ? AND project_id = ?',
      [documentId, projectId]
    );
    
    if (documents.length === 0) {
      req.flash('error_msg', 'Document not found or you do not have access to this project.');
      return res.redirect(`/projects/${projectId}/documents`);
    }
    
    const document = documents[0];
    const filePath = path.join(__dirname, '..', document.file_path); // Assuming file_path is stored relative to project root like 'public/uploads/project_documents/filename.pdf'
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath} for document ID: ${documentId}`);
      req.flash('error_msg', 'File not found on server. It might have been moved or deleted.');
      return res.redirect(`/projects/${projectId}/documents`);
    }
    
    // Log download activity (optional - good for audit trails)
    // await db.query('INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
    //   [userId, 'DOCUMENT_DOWNLOAD', 'PROJECT_DOCUMENT', documentId, `Downloaded: ${document.file_name}`]);
    
    res.download(filePath, document.original_file_name, (err) => {
      if (err) {
        console.error('Error during file download:', err);
        if (!res.headersSent) {
          req.flash('error_msg', 'Could not download the file due to a server error.');
          return res.redirect(`/projects/${projectId}/documents`);
        }
      }
    });
    
  } catch (error) {
    console.error('Error downloading document:', error);
    req.flash('error_msg', 'Server error while trying to download document.');
    res.redirect(`/projects/${projectId}/documents`);
    // next(error); // Or pass to a generic error handler
  }
};


exports.deleteProjectDocument = async (req, res, next) => {
    const { projectId, documentId } = req.params;
    const userId = req.session.user.id;

    try {
        const [docRows] = await db.query("SELECT * FROM project_documents WHERE id = ? AND project_id = ?", [documentId, projectId]);
        if (docRows.length === 0) {
            req.flash('error_msg', 'Document not found or you do not have permission to delete it.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const document = docRows[0];

        // document.file_path is stored as 'uploads/project_docs/filename.ext'
        await deleteUploadedProjectFile(document.file_path); // Pass the path as stored in DB

        await db.query("DELETE FROM project_documents WHERE id = ?", [documentId]);

        req.flash('success_msg', 'Document deleted successfully.');
    } catch (error) {
        console.error("Error deleting project document:", error);
        req.flash('error_msg', 'Failed to delete document.');
    }
    res.redirect(`/projects/${projectId}/details`);
};
/*
exports.deleteProjectDocument = async (req, res, next) => {
    const { projectId, documentId } = req.params;
    const userId = req.session.user.id; // For audit logging if needed

    try {
        const [docRows] = await db.query("SELECT * FROM project_documents WHERE id = ? AND project_id = ?", [documentId, projectId]);
        if (docRows.length === 0) {
            req.flash('error_msg', 'Document not found or you do not have permission to delete it.');
            return res.redirect(`/projects/${projectId}/details`);
        }
        const document = docRows[0];

        // Delete physical file
        // document.file_path should be like 'uploads/project_docs/filename.ext'
        // We need to construct the path from the project root/public directory.
        const filePathToDelete = `public/${document.file_path}`; 
        await deleteUploadedFile(filePathToDelete);

        // Delete record from DB
        await db.query("DELETE FROM project_documents WHERE id = ?", [documentId]);

        req.flash('success_msg', 'Document deleted successfully.');
    } catch (error) {
        console.error("Error deleting project document:", error);
        req.flash('error_msg', 'Failed to delete document.');
    }
    res.redirect(`/projects/${projectId}/details`);
};*/