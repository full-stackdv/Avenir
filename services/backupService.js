const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const db = require('../config/db');
const settingsService = require('./settingsService'); // Assuming it's in the same directory

const getDbCredentials = () => {
    // Ensure these environment variables are set in your .env file
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306
    };
};

/*
async function logBackupAttempt(backupType, status, filePath, fileSize, notes, triggeredByUserId) {
    try {
        const [result] = await db.query(
            'INSERT INTO backup_logs (backup_type, status, file_path, file_size_bytes, notes, triggered_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
            [backupType, status, filePath, fileSize, notes, triggeredByUserId]
        );
        return result.insertId;
    } catch (error) {
        console.error('Failed to log backup attempt:', error);
        // Depending on policy, you might want to throw this error or handle it
    }
}*/

async function logBackupAttempt(backupType, status, filePath, fileName, fileSize, notes, triggeredByUserId) {
    try {
        const [result] = await db.query(
            'INSERT INTO backup_logs (backup_type, status, file_path, file_name, file_size_bytes, notes, triggered_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)', // Added file_name
            [backupType, status, filePath, fileName, fileSize, notes, triggeredByUserId]
        );
        return result.insertId;
    } catch (error) {
        console.error('Failed to log backup attempt:', error);
        // Depending on policy, you might want to throw this error or handle it
    }
}

async function ensureBackupDirectoryExists(backupDir) {
    try {
        await fs.access(backupDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(backupDir, { recursive: true });
            console.log(`Backup directory created: ${backupDir}`);
        } else {
            throw error; // Re-throw other errors (e.g., permission issues)
        }
    }
    // Check for writability (simple check, might not be exhaustive)
    try {
        const testFile = path.join(backupDir, `_writable_test_${Date.now()}`);
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
    } catch (error) {
        console.error(`Backup directory ${backupDir} is not writable. Error: ${error.message}`);
        throw new Error(`Backup directory ${backupDir} is not writable or accessible.`);
    }
}

async function rotateBackups(backupDir, maxBackupsToKeep) {
    if (maxBackupsToKeep <= 0) return; // 0 or less means unlimited

    try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files
            .filter(file => file.startsWith('constructpro_backup_') && (file.endsWith('.sql') || file.endsWith('.sql.gz')))
            .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                time: null // Placeholder for mtime
            }));

        for (const bf of backupFiles) {
            const stats = await fs.stat(bf.path);
            bf.time = stats.mtime.getTime();
        }

        backupFiles.sort((a, b) => b.time - a.time); // Sort descending (newest first)

        if (backupFiles.length > maxBackupsToKeep) {
            const filesToDelete = backupFiles.slice(maxBackupsToKeep);
            for (const file of filesToDelete) {
                await fs.unlink(file.path);
                console.log(`Rotated (deleted) old backup: ${file.name}`);
                // Optionally, update corresponding backup_logs entries if you store full paths
                // and want to mark them as 'file_deleted' or similar.
                // For simplicity here, we are just deleting the file.
            }
        }
    } catch (error) {
        console.error('Error during backup rotation:', error);
        // Non-fatal, but should be logged
    }
}

exports.createManualBackup = async (triggeredByUserId) => {
    const isBackupEnabled = settingsService.getSetting('backup_enabled', false);
    if (!isBackupEnabled) {
        console.warn('Backup creation skipped: Backups are disabled in system settings.');
        return { success: false, message: 'Backups are disabled in system settings.' };
    }

    const backupDirSetting = settingsService.getSetting('backup_directory', './backups');
    const backupDir = path.resolve(backupDirSetting); // Resolve to absolute path

    const dbCreds = getDbCredentials();
    if (!dbCreds.user || !dbCreds.database) {
        console.error('Database credentials for backup are not fully configured in .env');
        await logBackupAttempt('manual', 'failed', null, null, 'DB credentials missing.', triggeredByUserId);
        return { success: false, message: 'Database credentials for backup are not configured.' };
    }

    await ensureBackupDirectoryExists(backupDir);
    

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `constructpro_backup_${timestamp}.sql.gz`; // Using gzip by default
    const backupFilePath = path.join(backupDir, backupFileName);
    let logId;
    


    try {
        //logId = await logBackupAttempt('manual', 'in_progress', backupFilePath, null, 'Backup process started.', triggeredByUserId);
        logId = await logBackupAttempt('manual', 'in_progress', backupFilePath, backupFileName, null, 'Backup process started.', triggeredByUserId);

        // Note: Ensure mysqldump is in PATH or provide full path.
        // Password handling: mysqldump can take password via MYSQL_PWD env variable or --password option.
        // Using MYSQL_PWD is generally safer than putting it directly in the command string.
        const command = `mysqldump --user="${dbCreds.user}" --host="${dbCreds.host}" --port="${dbCreds.port}" "${dbCreds.database}" | gzip > "${backupFilePath}"`;
        
        const { stdout, stderr } = await execPromise(command, { env: { ...process.env, MYSQL_PWD: dbCreds.password } });

        if (stderr && !stderr.includes("mysqldump: [Warning]")) { // Ignore typical warnings unless critical
            console.error(`mysqldump stderr: ${stderr}`);
            // Decide if stderr constitutes a failure
        }

        const stats = await fs.stat(backupFilePath);
        await db.query(
            'UPDATE backup_logs SET status = ?, file_size_bytes = ?, notes = ? WHERE id = ?',
            ['success', stats.size, 'Backup completed successfully.', logId]
        );

        // Rotate backups
        const maxBackups = parseInt(settingsService.getSetting('max_local_backups_to_keep', '5'), 10);
        await rotateBackups(backupDir, maxBackups);

        return { success: true, message: `Backup created successfully: ${backupFileName}`, filePath: backupFilePath, logId };

    } catch (error) {
        console.error('Backup creation failed:', error);
        let errorMessage = `Backup failed: ${error.message}`;
        if (error.stderr) errorMessage += ` STDERR: ${error.stderr}`;
        if (error.stdout) errorMessage += ` STDOUT: ${error.stdout}`;
        // When logging 'failed' if logId was not set (initial failure)
    if (!logId) {
        await logBackupAttempt('manual', 'failed', backupFilePath, backupFileName, null, errorMessage.substring(0, 65535), triggeredByUserId);
    }
/*
        if (logId) {
            await db.query(
                'UPDATE backup_logs SET status = ?, notes = ? WHERE id = ?',
                ['failed', errorMessage.substring(0, 65535), logId] // TEXT limit
            );
        }*/ else {
            // Log initial failure if 'in_progress' log wasn't even created
            await logBackupAttempt('manual', 'failed', backupFilePath, null, errorMessage.substring(0, 65535), triggeredByUserId);
        }
        // Attempt to clean up partially created file
        try {
            await fs.access(backupFilePath); // Check if file exists
            await fs.unlink(backupFilePath); // Delete it
            console.log(`Cleaned up failed backup file: ${backupFilePath}`);
        } catch (cleanupError) {
            // Ignore if file doesn't exist or other cleanup error
        }
        return { success: false, message: 'Backup creation failed. Check server logs.' };
    }
};

exports.listBackups = async (page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    try {
        const [rows] = await db.query(
            `SELECT bl.*, u.username as triggered_by_username 
             FROM backup_logs bl
             LEFT JOIN users u ON bl.triggered_by_user_id = u.id
             ORDER BY bl.backup_timestamp DESC 
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM backup_logs');
        return {
            backups: rows,
            totalBackups: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
        };
    } catch (error) {
        console.error('Error listing backups:', error);
        throw error;
    }
};

exports.getBackupDetails = async (backupLogId) => {
    try {
        const [rows] = await db.query(
            `SELECT bl.*, u.username as triggered_by_username 
             FROM backup_logs bl
             LEFT JOIN users u ON bl.triggered_by_user_id = u.id
             WHERE bl.id = ?`,
            [backupLogId]
        );
        return rows[0];
    } catch (error) {
        console.error('Error fetching backup details:', error);
        throw error;
    }
};

exports.deleteBackup = async (backupLogId) => {
    const backupDetails = await this.getBackupDetails(backupLogId);
    if (!backupDetails) {
        return { success: false, message: 'Backup log entry not found.' };
    }

    // Delete physical file if path exists and status was success or in_progress
    if (backupDetails.file_path && (backupDetails.status === 'success' || backupDetails.status === 'in_progress')) {
        try {
            await fs.access(backupDetails.file_path); // Check if file exists
            await fs.unlink(backupDetails.file_path);
            console.log(`Deleted physical backup file: ${backupDetails.file_path}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`Backup file not found for deletion, but proceeding to delete log: ${backupDetails.file_path}`);
            } else {
                console.error(`Error deleting physical backup file ${backupDetails.file_path}:`, error);
                return { success: false, message: `Could not delete physical file: ${error.message}. Log entry not deleted.` };
            }
        }
    }

    // Delete log entry from database
    try {
        await db.query('DELETE FROM backup_logs WHERE id = ?', [backupLogId]);
        return { success: true, message: 'Backup log and associated file (if existed) deleted successfully.' };
    } catch (error) {
        console.error('Error deleting backup log entry:', error);
        return { success: false, message: `Failed to delete backup log entry: ${error.message}` };
    }
};
