// constructpro/services/pageContentService.js
const db = require('../config/db');

/**
 * Fetches all content sections for a given pageKey and transforms them into an object.
 * Keys are section_key and values are content_value (parsed if JSON).
 * @param {string} pageKey The key identifying the page (e.g., 'home', 'about').
 * @returns {Promise<Object>} An object with section_key: content_value pairs.
 */

exports.getPageContent = async (pageKey) => {
  const contentMap = {};
  try {
    const [rows] = await db.query(
      'SELECT section_key, content_type, content_value FROM page_content WHERE page_key = ?',
      [pageKey]
    );
    
    for (const row of rows) {
      if (row.content_type === 'json_list' && row.content_value) {
        try {
          contentMap[row.section_key] = JSON.parse(row.content_value);
        } catch (e) {
          console.error(`Failed to parse JSON for ${pageKey}.${row.section_key}:`, e);
          contentMap[row.section_key] = null; // Or an empty array/object depending on expected structure
        }
      } else if (row.content_type === 'image_url' && row.content_value) {
        // Ensure image URLs start with a / if they are relative to the domain root
        // And handle cases where it might already be an absolute URL (though less common for internal assets)
        if (row.content_value && !row.content_value.startsWith('http') && !row.content_value.startsWith('/')) {
          contentMap[row.section_key] = '/' + row.content_value;
        } else {
          contentMap[row.section_key] = row.content_value;
        }
      }
      else {
        contentMap[row.section_key] = row.content_value;
      }
    }
    return contentMap;
  } catch (error) {
    console.error(`Error fetching page content for ${pageKey}:`, error);
    throw error; // Or return an empty object {} depending on error handling strategy
  }
};

/**
 * Fetches distinct page_keys and their primary labels for listing in the admin UI.
 * It picks the label from the section with sort_order = 0 for each page_key.
 * @returns {Promise<Array<Object>>} Array of objects like [{ page_key, page_label }].
 */
exports.getAllEditablePages = async () => {
  try {
    // This query tries to get a "main" label for each page_key,
    // typically the one with the lowest sort_order or a specific section_key like 'hero_title'.
    const [rows] = await db.query(`
            SELECT pc1.page_key, COALESCE(pc2.label, pc1.label, pc1.page_key) as page_label
            FROM (SELECT DISTINCT page_key, MIN(id) as min_id FROM page_content GROUP BY page_key) AS distinct_pages
            JOIN page_content pc1 ON pc1.id = distinct_pages.min_id
            LEFT JOIN page_content pc2 ON pc2.page_key = pc1.page_key AND (pc2.section_key = 'hero_title' OR pc2.section_key = 'page_main_title')
            ORDER BY pc1.page_key;
        `);
    // A simpler alternative if the above is too complex or sort_order is reliable:
    /*
    const [rows] = await db.query(`
        SELECT page_key, label as page_label
        FROM page_content
        WHERE (page_key, sort_order) IN (
            SELECT page_key, MIN(sort_order)
            FROM page_content
            GROUP BY page_key
        )
        ORDER BY page_key;
    `);
    */
    return rows.map(row => ({
      key: row.page_key,
      label: row.page_label.length > 50 ? row.page_label.substring(0, 50) + '...' : row.page_label
    }));
  } catch (error) {
    console.error('Error fetching all editable pages:', error);
    throw error;
  }
};

/**
 * Fetches all content sections for a specific page_key, ordered for the admin edit form.
 * @param {string} pageKey The key identifying the page.
 * @returns {Promise<Array<Object>>} Array of page_content row objects.
 */
exports.getSectionsForPage = async (pageKey) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM page_content WHERE page_key = ? ORDER BY sort_order ASC, id ASC',
      [pageKey]
    );
    return rows;
  } catch (error) {
    console.error(`Error fetching sections for page ${pageKey}:`, error);
    throw error;
  }
};

/**
 * Updates multiple page content sections in a transaction.
 * @param {Array<Object>} updates Array of objects like { id, content_value } or { id, content_value, old_image_path (for deletion) }
 * @param {Object} uploadedFiles Optional object mapping section_key to new uploaded file info (from Multer).
 *                               Example: { 'home_hero_image': { filename: 'new_hero.jpg' }, ... }
 * @returns {Promise<{success: boolean, updatedCount: number, errors: Array}>}
 */
exports.updatePageContent = async (updates, uploadedFiles = {}) => {
  const connection = await db.getConnection();
  let updatedCount = 0;
  const errorList = [];
  
  try {
    await connection.beginTransaction();
    
    for (const update of updates) {
      const { id, section_key, content_value: newTextValue, old_image_path } = update;
      let finalContentValue = newTextValue;
      
      // Check if there's a new file uploaded for this section_key
      if (uploadedFiles[section_key]) {
        const newFile = uploadedFiles[section_key];
        finalContentValue = `/uploads/page_images/${newFile.filename}`; // Assuming this storage path
        
        // Delete old image if one existed and a new one is uploaded
        if (old_image_path) {
          // fs.unlink needs to be handled here or in controller with try-catch
          // For now, we'll just log the intent. Actual deletion should be in controller or a dedicated file service.
          console.log(`pageContentService: Intending to delete old image: ${old_image_path}`);
        }
      }
      
      // For json_list, ensure content_value is a valid JSON string or null
      const [sectionMetaRows] = await connection.query('SELECT content_type FROM page_content WHERE id = ?', [id]);
      if (sectionMetaRows.length > 0 && sectionMetaRows[0].content_type === 'json_list') {
        if (finalContentValue === null || finalContentValue.trim() === "") {
          // Keep as null if empty
        } else {
          try {
            JSON.parse(finalContentValue); // Validate JSON
          } catch (e) {
            console.error(`Invalid JSON for section id ${id} (${section_key}): ${finalContentValue}. Error: ${e.message}`);
            errorList.push(`Invalid JSON format for section "${section_key}". Changes not saved for this item.`);
            // Skip update for this specific item, or store as is and let admin fix
            // For safety, let's skip:
            continue;
          }
        }
      }
      
      
      const [result] = await connection.query(
        'UPDATE page_content SET content_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [finalContentValue, id]
      );
      if (result.affectedRows > 0) {
        updatedCount++;
      }
    }
    
    if (errorList.length > 0) {
      // If there were non-critical errors (like JSON parse errors) but we want to commit other changes
      // await connection.commit(); // Decide on rollback vs commit with partial success
      // For now, let's rollback if any error occurs during parsing, to be safe.
      // A more granular approach might be needed.
      // If we decide to commit valid changes and report errors:
      // await connection.commit();
      // return { success: false, updatedCount, errors: errorList, message: "Some items had errors." };
      
      // For now, strict: rollback on any processing error.
      await connection.rollback();
      return { success: false, updatedCount: 0, errors: errorList, message: "Errors occurred during update. No changes saved." };
    }
    
    await connection.commit();
    return { success: true, updatedCount, errors: [] };
    
  } catch (error) {
    await connection.rollback();
    console.error('Error updating page content:', error);
    throw error; // Or return { success: false, message: error.message, errors: [...] }
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Retrieves a single page content value by pageKey and sectionKey.
 * Useful for specific, one-off lookups if needed.
 * @param {string} pageKey
 * @param {string} sectionKey
 * @param {*} defaultValue Optional default value if not found.
 * @returns {Promise<string|object|null>}
 */
exports.getSectionValue = async (pageKey, sectionKey, defaultValue = null) => {
  try {
    const [rows] = await db.query(
      'SELECT content_type, content_value FROM page_content WHERE page_key = ? AND section_key = ?',
      [pageKey, sectionKey]
    );
    if (rows.length > 0) {
      const row = rows[0];
      if (row.content_type === 'json_list' && row.content_value) {
        try {
          return JSON.parse(row.content_value);
        } catch (e) {
          console.error(`Failed to parse JSON for ${pageKey}.${sectionKey}:`, e);
          return defaultValue;
        }
      }
      return row.content_value;
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error fetching section value for ${pageKey}.${sectionKey}:`, error);
    return defaultValue; // Return default on error to prevent crashes
  }
};