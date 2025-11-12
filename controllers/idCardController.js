// controllers/idCardController.js
const db = require('../config/db');
const { deleteUploadedFile } = require('../config/multerConfig');
const staffManagt = require('./staffManagementController')
const COMPANY_SETTINGS_ID = 1; // We'll use a single row with ID=1 for company settings

// Show page to manage Company ID Card Settings (Admin)
exports.showCompanySettingsForm = async (req, res, next) => {
    try {
        let [settingsRows] = await db.query("SELECT *, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as last_updated FROM company_id_settings WHERE id = ?", [COMPANY_SETTINGS_ID]);
        let settings;
        if (settingsRows.length === 0) {
            // This case should ideally be handled by the initial seed in SQL.
            // If not, create a default one.
            await db.query(
                "INSERT INTO company_id_settings (id, company_name, company_subtitle, ceo_name, default_authorization_statement) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id",
                [COMPANY_SETTINGS_ID, 'AVENIR CONSTRUCTION', 'We Build for Future', 'CEO, Temkin Sheref(Eng)', 'This card certifies that the bearer is an authorized employee of AVENIR CONSTRUCTION.']
            );
            [settingsRows] = await db.query("SELECT *, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as last_updated FROM company_id_settings WHERE id = ?", [COMPANY_SETTINGS_ID]);
        }
        settings = settingsRows[0];

        const formData = req.session.formData || settings;
        const errors = req.session.errors || {};
        delete req.session.formData;
        delete req.session.errors;

        res.render('admin/idcard_settings', {
            title: 'Company ID Card Settings',
            layout: './layouts/admin_layout',
            user: req.session.user,
            settings: settings, // Original settings for context (e.g., displaying current images)
            formData,       // For repopulating form fields
            errors,
            currentPath: req.path
        });
    } catch (error) {
        console.error("Error fetching company ID settings:", error);
        next(error);
    }
};

// Handle update of Company ID Card Settings (Admin)
exports.updateCompanySettings = async (req, res, next) => {
    const {
        company_name, company_subtitle, company_phone, company_email,
        company_website, company_location, ceo_name, default_authorization_statement,
        existing_logo_filename, existing_signature_filename, existing_stamp_filename
    } = req.body;
    //mployee_id_number

    let new_logo_filename = existing_logo_filename;
    let new_signature_filename = existing_signature_filename;
    let new_stamp_filename = existing_stamp_filename;
    //let new_company_name = company_name; 
    //let new_company_subtitile = company_subtitle; 
    //let new_company_email = company_email;
    //let new_company_website = company_website; 
    //let mew_company_location = company_location

    let filesToDeleteOnError = [];

    if (req.files) {
        if (req.files.company_logo_upload) {
            new_logo_filename = req.files.company_logo_upload[0].filename;
            filesToDeleteOnError.push(`uploads/company_assets/${new_logo_filename}`);
        }
        if (req.files.ceo_signature_upload) {
            new_signature_filename = req.files.ceo_signature_upload[0].filename;
            filesToDeleteOnError.push(`uploads/company_assets/${new_signature_filename}`);
        }
        if (req.files.company_stamp_upload) {
            new_stamp_filename = req.files.company_stamp_upload[0].filename;
            filesToDeleteOnError.push(`uploads/company_assets/${new_stamp_filename}`);
        }
    }

    // Basic Validation
    let errors = {};
    if (!company_name) errors.company_name = "Company name is required.";
    // Add more validation if needed

    if (Object.keys(errors).length > 0) {
        filesToDeleteOnError.forEach(fp => deleteUploadedFile(fp));
        req.session.formData = { ...req.body, 
            logo_filename: existing_logo_filename, 
            signature_filename: existing_signature_filename, 
            stamp_filename: existing_stamp_filename 
        };
        req.session.errors = errors;
        req.flash('error_msg', 'Please correct the errors below.');
        return res.redirect('/admin/idcard/settings');
    }
    
    try {
        const [updateResult] = await db.query(
            `UPDATE company_id_settings SET 
            company_name = ?, company_subtitle = ?, logo_filename = ?, 
            signature_filename = ?, stamp_filename = ?, company_phone = ?, 
            company_email = ?, company_website = ?, company_location = ?, 
            ceo_name = ?, default_authorization_statement = ? 
            WHERE id = ?`,
            [
                company_name, company_subtitle, new_logo_filename,
                new_signature_filename, new_stamp_filename, company_phone || null,
                company_email || null, company_website || null, company_location || null,
                ceo_name || null, default_authorization_statement || null,
                COMPANY_SETTINGS_ID
            ]
        );

        if (updateResult.affectedRows > 0) {
            if (req.files?.company_logo_upload && existing_logo_filename && existing_logo_filename !== new_logo_filename) {
                deleteUploadedFile(`uploads/company_assets/${existing_logo_filename}`);
            }
            if (req.files?.ceo_signature_upload && existing_signature_filename && existing_signature_filename !== new_signature_filename) {
                deleteUploadedFile(`uploads/company_assets/${existing_signature_filename}`);
            }
            if (req.files?.company_stamp_upload && existing_stamp_filename && existing_stamp_filename !== new_stamp_filename) {
                deleteUploadedFile(`uploads/company_assets/${existing_stamp_filename}`);
            }
        }
        req.flash('success_msg', 'Company ID settings updated successfully.');
    } catch (error) {
        console.error("Error updating company ID settings:", error);
        filesToDeleteOnError.forEach(fp => deleteUploadedFile(fp)); // Cleanup on DB error
        req.flash('error_msg', 'Failed to update company ID settings.');
        // Repopulate form data for PRG pattern
        req.session.formData = { ...req.body, 
            logo_filename: new_logo_filename, // show newly uploaded attempt if error
            signature_filename: new_signature_filename,
            stamp_filename: new_stamp_filename
        };
        req.session.errors = {}; // Or extract specific DB errors
        next(error); // or res.redirect('/admin/idcard/settings');
    }
    res.redirect('/admin/idcard/settings');
};


// Show ID Card Generator page for a specific staff member
exports.showIdCardGeneratorForm = async (req, res, next) => {
    const { staff_id } = req.params;
    try {
        const [staffMembers] = await db.query("SELECT *, DATE_FORMAT(issue_date, '%Y-%m-%d') as issue_date_formatted, DATE_FORMAT(expiry_date, '%Y-%m-%d') as expiry_date_formatted FROM staff WHERE id = ?", [staff_id]);
        if (staffMembers.length === 0) {
            req.flash('error_msg', 'Staff member not found.');
            return res.redirect('/staff');
        }
        const staffMember = staffMembers[0];

        const [companySettingsList] = await db.query("SELECT * FROM company_id_settings WHERE id = ?", [COMPANY_SETTINGS_ID]);
        if (companySettingsList.length === 0) {
             req.flash('error_msg', 'Company ID settings not configured. Please ask an admin to configure them first.');
             return res.redirect('/staff');
        }
        const companySettings = companySettingsList[0];

        // Prepare image URLs (handle cases where filenames might be null)
        staffMember.photo_url = staffMember.photo_filename ? `/uploads/staff_photos/${staffMember.photo_filename}` : '/images/placeholder-photo.png';
        companySettings.logo_url = companySettings.logo_filename ? `/uploads/company_assets/${companySettings.logo_filename}` : '/images/logo.png'; // Default placeholder logo
        companySettings.signature_url = companySettings.signature_filename ? `/uploads/company_assets/${companySettings.signature_filename}` : '/images/signature.png'; // Default placeholder
        companySettings.stamp_url = companySettings.stamp_filename ? `/uploads/company_assets/${companySettings.stamp_filename}` : '/images/stamp.png'; // Default placeholder

        res.render('staff/idcard/create', {
            title: `ID Card for ${staffMember.full_name}`,
            layout: './layouts/main_layout', // Or a specific layout for the generator (e.g., no sidebar)
            user: req.session.user,
            staffMember,
            companySettings,
            currentPath: req.path
            // Pass any other necessary data for idcard.js, perhaps initial style settings if stored
        });

    } catch (error) {
        console.error('Error fetching data for ID card generator:', error);
        next(error);
    }
};
