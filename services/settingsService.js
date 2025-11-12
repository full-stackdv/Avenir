//constructpro/services/settingsServices.js

const db = require('../config/db');
//const bodyparser = require("body-parser") // Not directly used in this file, usually app-level middleware

const settingsCache = new Map();
let cacheInitialized = false;

async function initializeSettingsCache() {
  if (cacheInitialized) {
    console.log('Settings cache already initialized. Skipping re-initialization.');
    return;
  }
  try {
    console.log('Initializing system settings cache...');
    const [rows] = await db.query('SELECT setting_key, setting_value, is_json_value, input_type FROM system_settings');
    rows.forEach(setting => {
      let value = setting.setting_value;
      if (setting.is_json_value && setting.setting_value) { // Added check for setting_value existence
        try {
          value = JSON.parse(setting.setting_value);
        } catch (e) {
          console.error(`Failed to parse JSON for setting ${setting.setting_key}:`, e);
          // Keep as string or set to null/default if parsing fails
        }
      } else if (setting.input_type === 'boolean') { // Check by input_type for booleans
        value = (setting.setting_value === 'true' || setting.setting_value === true); // Ensure boolean type
      }
      // For numbers, you might want to parse them here if they are stored as strings
      // else if (setting.input_type === 'number' && setting.setting_value !== null && setting.setting_value !== '') {
      //   const numValue = parseFloat(setting.setting_value);
      //   if (!isNaN(numValue)) {
      //     value = numValue;
      //   }
      // }
      settingsCache.set(setting.setting_key, value);
    });
    cacheInitialized = true;
    console.log(`System settings cache initialized with ${settingsCache.size} items.`);
  } catch (error) {
    console.error('Failed to initialize settings cache:', error);
    // Application might not function correctly without settings, consider how to handle this
    // For now, we let the app continue, but getSetting will return defaults.
    // To make it critical, you could throw the error here.
  }
}


function getSetting(key, defaultValue = undefined) {
  if (!cacheInitialized) {
    // This warning is important. If this happens frequently, it means initializeSettingsCache() is not being called
    // reliably at startup OR is failing.
    console.warn(`Settings cache not initialized when trying to get key "${key}". Returning default value. Check server startup logs.`);
    return defaultValue;
  }
  const value = settingsCache.get(key);
  return value !== undefined ? value : defaultValue;
}


async function getAllSettingsFromDB(grouped = false) {
  try {
    const [rows] = await db.query('SELECT * FROM system_settings ORDER BY setting_group, sort_order, label');
    if (!grouped) {
      return rows;
    }
    const groupedSettings = {};
    rows.forEach(setting => {
      if (!groupedSettings[setting.setting_group]) {
        groupedSettings[setting.setting_group] = [];
      }
      // Parse options if it's a select type and options are JSON
      if (setting.input_type === 'select' && setting.options) {
        try {
          setting.parsed_options = JSON.parse(setting.options);
        } catch (e) {
          console.error(`Failed to parse options for setting ${setting.setting_key}:`, e);
          setting.parsed_options = [];
        }
      }
      // The setting_value for boolean is already 'true' or 'false' string from DB,
      // which the form's checkbox `checked` attribute handles correctly.
      // The cache (settingsCache) stores actual booleans.
      groupedSettings[setting.setting_group].push(setting);
    });
    return groupedSettings;
  } catch (error) {
    console.error('Error fetching all settings from DB:', error);
    throw error;
  }
}

async function updateSetting(key, value) { // This function is less used if admin form updates all at once
  try {
    let storeValue = value;
    const [[settingMeta]] = await db.query('SELECT is_json_value, is_sensitive, input_type FROM system_settings WHERE setting_key = ?', [key]);
    
    if (!settingMeta) {
      throw new Error(`Setting key "${key}" not found.`);
    }
    
    if (settingMeta.input_type === 'password' && (value === '********' || value === '' || value === null)) {
      // console.log(`Skipping update for sensitive field ${key} due to placeholder/empty value.`);
      return { changed: false };
    }
    
    if (settingMeta.is_json_value && typeof value !== 'string') { // if it's already a string, assume it's valid JSON string
      storeValue = JSON.stringify(value);
    } else if (settingMeta.input_type === 'boolean') {
      storeValue = (value === 'true' || value === true) ? 'true' : 'false';
    }
    
    const [result] = await db.query(
      'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      [storeValue, key]
    );
    
    if (result.affectedRows > 0) {
      // Update cache
      let cacheValue = value;
      if (settingMeta.input_type === 'boolean') {
        cacheValue = (storeValue === 'true');
      } else if (settingMeta.is_json_value && storeValue) {
         try { cacheValue = JSON.parse(storeValue); } catch(e) { /* remain string */ }
      }
      settingsCache.set(key, cacheValue);
      return { changed: true, affectedRows: result.affectedRows };
    }
    return { changed: false, affectedRows: result.affectedRows };
  } catch (error) {
    console.error(`Error updating setting ${key}:`, error);
    throw error;
  }
}

async function updateSettings(settingsArray) { // settingsArray = [{key: 'key1', value: 'val1'}, ...]
  const connection = await db.getConnection();
  let changesMade = 0;
  try {
    await connection.beginTransaction();
    for (const setting of settingsArray) {
      let storeValue = setting.value;
      const [[settingMeta]] = await connection.query('SELECT is_json_value, is_sensitive, input_type FROM system_settings WHERE setting_key = ?', [setting.key]);
      
      if (!settingMeta) {
        console.warn(`Setting key "${setting.key}" not found during batch update. Skipping.`);
        continue;
      }
      
      if (settingMeta.input_type === 'password' && (storeValue === '********' || storeValue === '' || storeValue === null)) {
        // This setting will be skipped as its value is a placeholder.
        // The controller should filter these out before calling updateSettings if they mean "no change".
        // For `updateSettings` as written, it means "don't store '********'".
        continue;
      }
      
      if (settingMeta.is_json_value && typeof storeValue !== 'string') {
        storeValue = JSON.stringify(storeValue);
      } else if (settingMeta.input_type === 'boolean') {
        // Value from form for checkbox: 'true' if checked, undefined if not.
        // The controller handleUpdateSettings already converts undefined to 'false' for booleans.
        // So, storeValue here will be 'true' or 'false' string.
        storeValue = (storeValue === 'true' || storeValue === true) ? 'true' : 'false';
      }
      // Removed: redundant check for undefined/null as controller should handle it.
      // If storeValue reaches here as undefined for a non-boolean, it implies an issue in controller or form submission.
      
      const [result] = await connection.query(
        'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
        [storeValue, setting.key]
      );

      if (result.affectedRows > 0) {
        changesMade++;
        // Update cache correctly
        let cacheValueToSet;
        if (settingMeta.input_type === 'boolean') {
          cacheValueToSet = (storeValue === 'true');
        } else if (settingMeta.is_json_value && storeValue) {
          try {
            cacheValueToSet = JSON.parse(storeValue);
          } catch (e) {
            cacheValueToSet = storeValue; // Keep as string if parse fails
            console.error(`Failed to parse JSON for cache update on key ${setting.key}: ${e}`);
          }
        } else {
          cacheValueToSet = storeValue; // storeValue is already the correct type for non-JSON, non-boolean strings
        }
        settingsCache.set(setting.key, cacheValueToSet);
      }
    }
    await connection.commit();
    // No need to call fetchAndCacheAllSettings() again if we update the cache iteratively
    console.log(`${changesMade} settings updated and cache refreshed iteratively.`);
    return { success: true, settingsUpdated: changesMade };
  } catch (error) {
    await connection.rollback();
    console.error('Error updating settings in batch:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}


module.exports = {
  initializeSettingsCache,
  getSetting,
  getAllSettingsFromDB,
  updateSetting,
  updateSettings
};

/*
//constructpro/services/settingsServices.js

const db = require('../config/db');
const bodyparser = require("body-parser")
const settingsCache = new Map();
let cacheInitialized = false;

async function initializeSettingsCache() {
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value, is_json_value FROM system_settings');
    rows.forEach(setting => {
      let value = setting.setting_value;
      if (setting.is_json_value) {
        try {
          value = JSON.parse(setting.setting_value);
        } catch (e) {
          console.error(`Failed to parse JSON for setting ${setting.setting_key}:`, e);
          // Keep as string or set to null/default if parsing fails
        }
      } else if (setting.setting_value === 'true') {
        value = true;
      } else if (setting.setting_value === 'false') {
        value = false;
      }
      settingsCache.set(setting.setting_key, value);
    });
    cacheInitialized = true;
    console.log('System settings cache initialized.');
  } catch (error) {
    console.error('Failed to initialize settings cache:', error);
    // Application might not function correctly without settings, consider how to handle this
  }
}

async function getAllSettingsFromDB(grouped = false) {
  try {
    const [rows] = await db.query('SELECT * FROM system_settings ORDER BY setting_group, sort_order, label');
    if (!grouped) {
      return rows;
    }
    const groupedSettings = {};
    rows.forEach(setting => {
      if (!groupedSettings[setting.setting_group]) {
        groupedSettings[setting.setting_group] = [];
      }
      // Parse options if it's a select type and options are JSON
      if (setting.input_type === 'select' && setting.options) {
        try {
          setting.parsed_options = JSON.parse(setting.options);
        } catch (e) {
          console.error(`Failed to parse options for setting ${setting.setting_key}:`, e);
          setting.parsed_options = [];
        }
      }
      // For boolean 'false' string, ensure it's treated correctly for checkbox
      if (setting.input_type === 'boolean' && setting.setting_value === 'false') {
        // setting.setting_value is already 'false', which is fine for HTML value
      } else if (setting.input_type === 'boolean' && setting.setting_value === 'true') {
        // setting.setting_value is already 'true'
      }
      
      groupedSettings[setting.setting_group].push(setting);
    });
    return groupedSettings;
  } catch (error) {
    console.error('Error fetching all settings from DB:', error);
    throw error;
  }
}


function getSetting(key, defaultValue = undefined) {
  if (!cacheInitialized) {
    console.warn('Settings cache not initialized. Consider calling initializeSettingsCache() on app start.');
    // Optionally, you could fetch directly from DB here as a fallback, but it's less efficient.
    // For now, return defaultValue or undefined.
    return defaultValue;
  }
  const value = settingsCache.get(key);
  return value !== undefined ? value : defaultValue;
}

async function updateSetting(key, value) {
  try {
    let storeValue = value;
    const [settingMeta] = await db.query('SELECT is_json_value, is_sensitive, input_type FROM system_settings WHERE setting_key = ?', [key]);
    
    if (settingMeta.length === 0) {
      throw new Error(`Setting key "${key}" not found.`);
    }
    
    // Do not update password if value is placeholder or empty (unless explicitly allowed)
    if (settingMeta[0].input_type === 'password' && (value === '********' || value === '')) {
      // console.log(`Skipping update for sensitive field ${key} due to placeholder/empty value.`);
      return { changed: false }; // Indicate no change
    }
    
    
    if (settingMeta[0].is_json_value) {
      storeValue = JSON.stringify(value);
    } else if (typeof value === 'boolean') {
      storeValue = value ? 'true' : 'false';
    }
    
    
    const [result] = await db.query(
      'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      [storeValue, key]
    );
    
    // Update cache
    if (result.affectedRows > 0) {
      let cacheValue = value;
      if (typeof value === 'string' && value.toLowerCase() === 'true') cacheValue = true;
      else if (typeof value === 'string' && value.toLowerCase() === 'false') cacheValue = false;
      
      settingsCache.set(key, cacheValue);
      return { changed: true, affectedRows: result.affectedRows };
    }
    return { changed: false, affectedRows: result.affectedRows }; // No rows updated, maybe value was same
  } catch (error) {
    console.error(`Error updating setting ${key}:`, error);
    throw error;
  }
}

async function updateSettings(settingsArray) { // settingsArray = [{key: 'key1', value: 'val1'}, ...]
  const connection = await db.getConnection();
  let changesMade = 0;
  try {
    await connection.beginTransaction();
    for (const setting of settingsArray) {
      // Similar logic as updateSetting, but within a transaction
      let storeValue = setting.value;
      const [settingMetaRows] = await connection.query('SELECT is_json_value, is_sensitive, input_type FROM system_settings WHERE setting_key = ?', [setting.key]);
      
      if (settingMetaRows.length === 0) {
        console.warn(`Setting key "${setting.key}" not found during batch update. Skipping.`);
        continue;
      }
      const settingMeta = settingMetaRows[0];
      
      // Skip password update if it's a placeholder or empty
      if (settingMeta.input_type === 'password' && (storeValue === '********' || storeValue === '')) {
        // console.log(`Skipping update for sensitive field ${setting.key} during batch update.`);
        continue; // Skip this setting
      }
      
      if (settingMeta.is_json_value) {
        storeValue = JSON.stringify(setting.value);
      } else if (typeof setting.value === 'boolean') {
        storeValue = setting.value ? 'true' : 'false';
      } else if (setting.value === undefined || setting.value === null) { // Handle unchecked checkboxes not sending value
        if (settingMeta.input_type === 'boolean') {
          storeValue = 'false';
        } else {
          storeValue = ''; // Or keep as NULL depending on column definition
        }
      }
      
      
      const [result] = await connection.query(
        'UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
        [storeValue, setting.key]
      );
      if (result.affectedRows > 0) {
        changesMade++;
        // Update cache: convert string 'true'/'false' back to boolean for cache
        let cacheValue = setting.value;
        if (settingMeta.input_type === 'boolean') {
          cacheValue = (storeValue === 'true');
        } else if (settingMeta.is_json_value) {
          try { cacheValue = JSON.parse(storeValue); } catch (e) { /* keep as string */ /*}
        }
        settingsCache.set(setting.key, cacheValue);
      }
    }
    await connection.commit();
    return { success: true, settingsUpdated: changesMade };
  } catch (error) {
    await connection.rollback();
    console.error('Error updating settings in batch:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}


module.exports = {
  initializeSettingsCache,
  getSetting,
  getAllSettingsFromDB, // Primarily for the admin settings page
  updateSetting, // For individual updates if needed
  updateSettings // For batch updates from the admin form
};*/