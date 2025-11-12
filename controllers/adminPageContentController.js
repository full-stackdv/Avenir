// constructpro/controllers/adminPageContentController.js
const pageContentService = require('../services/pageContentService');
const fs = require('fs').promises; // For deleting old images
const path = require('path');

/**
 * @desc    List all editable pages
 * @route   GET /admin/pages
 * @access  Private (Admin)
 */
exports.listEditablePages = async (req, res, next) => {
  try {
    const pages = await pageContentService.getAllEditablePages();
    res.render('admin/pages/list', {
      title: 'Manage Page Content',
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'manage_pages', // For sidebar active state
      pages,
      messages: req.flash()
    });
  } catch (error) {
    console.error("Error listing editable pages:", error);
    next(error);
  }
};

/**
 * @desc    Show form to edit content for a specific page
 * @route   GET /admin/pages/:pageKey/edit
 * @access  Private (Admin)
 */
exports.showEditPageForm = async (req, res, next) => {
  const { pageKey } = req.params;
  try {
    const sections = await pageContentService.getSectionsForPage(pageKey);
    if (!sections || sections.length === 0) {
      req.flash('error', `No content sections found for page key: ${pageKey}. Please ensure seed data exists.`);
      return res.redirect('/admin/pages');
    }
    
    // Determine a display name for the page (e.g., from its hero_title or first section's label)
    const pageDisplayName = sections.find(s => s.section_key === 'hero_title' || s.section_key === 'page_main_title')?.label ||
      sections[0]?.page_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ||
      pageKey;
    
    res.render('admin/pages/edit_form', {
      title: `Edit Content: ${pageDisplayName}`,
      layout: 'layout/admin_layout',
      user: req.session.user,
      currentMenu: 'manage_pages',
      pageKey,
      pageDisplayName,
      sections,
      messages: req.flash()
    });
  } catch (error) {
    console.error(`Error showing edit form for page ${pageKey}:`, error);
    next(error);
  }
};

/**
 * @desc    Handle update of page content
 * @route   POST /admin/pages/:pageKey/edit
 * @access  Private (Admin)
 */
exports.handleUpdatePageContent = async (req, res, next) => {
  const { pageKey } = req.params;
  const updates = [];
  const oldImagePathsToDelete = [];
  
  // req.body will contain fields like 'content_value_SECTIONID'
  // req.files (if using Multer for multiple fields) will be an object like:
  // { 'image_SECTIONID': [{...fileinfo...}], 'image_OTHERSECTIONID': [{...fileinfo...}] }
  // Or if Multer is configured with .array() or .single() for a specific field name, adjust accordingly.
  // For simplicity with dynamic field names, we'll process req.files based on keys.
  
  try {
    const sectionsForPage = await pageContentService.getSectionsForPage(pageKey); // To get section_key and old_image_path
/*    
    for (const section of sectionsForPage) {
      const sectionId = section.id;
      const formFieldName = `content_value_${sectionId}`;
      const imageFieldName = `image_file_${sectionId}`; // Name used in <input type="file" name="image_file_<%= section.id %>">
      
      let newContentValue = req.body[formFieldName]; // For text, textarea, json_list, rich_text
      
      if (section.content_type === 'image_url') {
        const uploadedFile = req.files && req.files[imageFieldName] ? req.files[imageFieldName][0] : null;
        
        if (uploadedFile) {
          // New image uploaded
          newContentValue = `/uploads/page_images/${uploadedFile.filename}`; // Path to store in DB
          if (section.content_value) { // If there was an old image
            oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
          }
        } else if (req.body[`remove_image_${sectionId}`] === 'true') {
          // Checkbox to remove image was checked
          if (section.content_value) {
            oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
          }
          newContentValue = null; // Set to null if image removed
        } else {
          // No new image, no removal => keep existing value
          newContentValue = section.content_value;
        }
      }
      
      updates.push({
        id: sectionId,
        section_key: section.section_key, // Needed by service for associating uploadedFiles
        content_value: newContentValue,
        // old_image_path: section.content_type === 'image_url' ? section.content_value : null // For service to know
      });
    }
    

*/

// ...
for (const section of sectionsForPage) {
  const sectionId = section.id;
  const formFieldName = `content_value_${sectionId}`;
  // This is the name of the <input type="file" name="image_file_<%= section.id %>"> in your EJS
  const expectedImageInputName = `image_file_${sectionId}`;
  
  let newContentValue = req.body[formFieldName];
  
  if (section.content_type === 'image_url') {
    // Find the uploaded file from req.files (which is now an array)
    const uploadedFile = req.files ? req.files.find(f => f.fieldname === expectedImageInputName) : null;
    
    if (uploadedFile) {
      // New image uploaded
      if (uploadedFile.fileValidationError) { // Check for filter error
        req.flash('error', `Error with image for ${section.label}: ${uploadedFile.fileValidationError}`);
        newContentValue = section.content_value; // Keep old value
      } else {
        newContentValue = `/uploads/page_images/${uploadedFile.filename}`; // Path to store in DB
        if (section.content_value && section.content_value !== newContentValue) { // If there was an old image and it's different
          oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
        }
      }
    } else if (req.body[`remove_image_${sectionId}`] === 'true') {
      // Checkbox to remove image was checked
      if (section.content_value) {
        oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
      }
      newContentValue = null; // Set to null if image removed
    } else {
      // No new image, no removal => keep existing value
      newContentValue = section.content_value;
    }
  }
  
  updates.push({
    id: sectionId,
    section_key: section.section_key,
    content_value: newContentValue,
  });
}

    // The service's updatePageContent was expecting uploadedFiles keyed by section_key.
    // We've already processed files and determined the newContentValue for image_urls above.
    // So we can simplify the call to the service or adjust the service.
    // Let's assume for now `updatePageContent` primarily handles DB updates, and file deletion is done here.
    
    const result = await pageContentService.updatePageContent(updates); // Pass simplified updates
    
    if (result.success) {
      // Delete old images only after successful DB update
      for (const oldPath of oldImagePathsToDelete) {
        try {
          await fs.access(oldPath); // Check if file exists
          await fs.unlink(oldPath);
          console.log(`Successfully deleted old image: ${oldPath}`);
        } catch (unlinkError) {
          if (unlinkError.code !== 'ENOENT') { // Ignore if file not found
            console.error(`Error deleting old image ${oldPath}:`, unlinkError);
          }
        }
      }
      req.flash('success', `${result.updatedCount} content section(s) updated successfully for page '${pageKey}'.`);
    } else {
      // If service returns errors (e.g., JSON parse error)
      let errorMessage = `Failed to update content for page '${pageKey}'.`;
      if (result.message) errorMessage = result.message;
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(err => req.flash('error', err)); // Flash individual errors
      } else {
        req.flash('error', errorMessage);
      }

      // Cleanup logic for files if DB update fails or general error:
if (req.files && (result.success === false || errorOccurredDuringUpdate)) { // 'errorOccurredDuringUpdate' is a placeholder for your error flag
  req.files.forEach(async (file) => { // req.files is an array from .any()
    if (!file.fileValidationError) { // Only attempt to delete files that passed the filter
      const tempPath = path.join(__dirname, '../../public/uploads/page_images', file.filename);
      try {
        await fs.unlink(tempPath);
        console.log(`Cleaned up uploaded file due to update error: ${tempPath}`);
      } catch (cleanupErr) {
        if (cleanupErr.code !== 'ENOENT') {
          console.error(`Error cleaning up file ${tempPath}:`, cleanupErr);
        }
      }
    }
  });
}
      
/*
      // If new images were uploaded but DB update failed, delete the newly uploaded files
      if (req.files) {
        for (const fieldKey in req.files) {
          req.files[fieldKey].forEach(async (file) => {
            const tempPath = path.join(__dirname, '../../public/uploads/page_images', file.filename);
            try {
              await fs.unlink(tempPath);
              console.log(`Cleaned up uploaded file due to update error: ${tempPath}`);
            } catch (cleanupErr) {
              console.error(`Error cleaning up file ${tempPath}:`, cleanupErr);
            }
          });
        }
      }

*/

    }
    
  } catch (error) {
    console.error(`Error handling update for page ${pageKey}:`, error);
    req.flash('error', 'A server error occurred while updating page content.');
    
    // Cleanup uploaded files on general error too
    if (req.files) {
      for (const fieldKey in req.files) {
        req.files[fieldKey].forEach(async (file) => {
          const tempPath = path.join(__dirname, '../../public/uploads/page_images', file.filename);
          try {
            await fs.unlink(tempPath);
          } catch (e) { /* ignore */ }
        });
      }
    }
  }
  res.redirect(`/admin/pages/${pageKey}/edit`);
};




/*

// In constructpro/controllers/adminPageContentController.js
// Inside exports.handleUpdatePageContent = async (req, res, next) => { ... }

// ...
for (const section of sectionsForPage) {
  const sectionId = section.id;
  const formFieldName = `content_value_${sectionId}`;
  // This is the name of the <input type="file" name="image_file_<%= section.id %>"> in your EJS
  const expectedImageInputName = `image_file_${sectionId}`;
  
  let newContentValue = req.body[formFieldName];
  
  if (section.content_type === 'image_url') {
    // Find the uploaded file from req.files (which is now an array)
    const uploadedFile = req.files ? req.files.find(f => f.fieldname === expectedImageInputName) : null;
    
    if (uploadedFile) {
      // New image uploaded
      if (uploadedFile.fileValidationError) { // Check for filter error
        req.flash('error', `Error with image for ${section.label}: ${uploadedFile.fileValidationError}`);
        newContentValue = section.content_value; // Keep old value
      } else {
        newContentValue = `/uploads/page_images/${uploadedFile.filename}`; // Path to store in DB
        if (section.content_value && section.content_value !== newContentValue) { // If there was an old image and it's different
          oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
        }
      }
    } else if (req.body[`remove_image_${sectionId}`] === 'true') {
      // Checkbox to remove image was checked
      if (section.content_value) {
        oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
      }
      newContentValue = null; // Set to null if image removed
    } else {
      // No new image, no removal => keep existing value
      newContentValue = section.content_value;
    }
  }
  
  updates.push({
    id: sectionId,
    section_key: section.section_key,
    content_value: newContentValue,
  });
}



// ... (database update logic) ...

// Cleanup logic for files if DB update fails or general error:
if (req.files && (result.success === false || errorOccurredDuringUpdate)) { // 'errorOccurredDuringUpdate' is a placeholder for your error flag
  req.files.forEach(async (file) => { // req.files is an array from .any()
    if (!file.fileValidationError) { // Only attempt to delete files that passed the filter
      const tempPath = path.join(__dirname, '../../public/uploads/page_images', file.filename);
      try {
        await fs.unlink(tempPath);
        console.log(`Cleaned up uploaded file due to update error: ${tempPath}`);
      } catch (cleanupErr) {
        if (cleanupErr.code !== 'ENOENT') {
          console.error(`Error cleaning up file ${tempPath}:`, cleanupErr);
        }
      }
    }
  });
}


// ...

/*

// ... inside handleUpdatePageContent ...
for (const section of sectionsForPage) {
  const sectionId = section.id;
  const formFieldName = `content_value_${sectionId}`;
  // This is the name of the <input type="file" name="image_file_<%= section.id %>">
  const expectedImageInputName = `image_file_${sectionId}`;
  
  let newContentValue = req.body[formFieldName];
  
  if (section.content_type === 'image_url') {
    // Find the uploaded file from req.files array that matches the expected input name
    const uploadedFile = req.files ? req.files.find(f => f.fieldname === expectedImageInputName) : null;
    
    if (uploadedFile) {
      newContentValue = `/uploads/page_images/${uploadedFile.filename}`;
      if (section.content_value) {
        oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
      }
    } else if (req.body[`remove_image_${sectionId}`] === 'true') {
      if (section.content_value) {
        oldImagePathsToDelete.push(path.join(__dirname, '../../public', section.content_value));
      }
      newContentValue = null;
    } else {
      newContentValue = section.content_value;
    }
  }
  
  updates.push({
    id: sectionId,
    section_key: section.section_key,
    content_value: newContentValue,
  });
}

// ... rest of the function for service call and cleanup ...
// Cleanup logic for req.files (if it's an array from .any())
if (req.files && (result.success === false || error)) { // If update failed or general error
  req.files.forEach(async (file) => { // req.files is an array
    const tempPath = path.join(__dirname, '../../public/uploads/page_images', file.filename);
    try {
      await fs.unlink(tempPath);
      console.log(`Cleaned up uploaded file due to update error: ${tempPath}`);
    } catch (cleanupErr) {
      console.error(`Error cleaning up file ${tempPath}:`, cleanupErr);
    }
  });
}

// ...
*/