
// public/js/idcard.js

document.addEventListener('DOMContentLoaded', () => {
    // Constants
    const CARD_WIDTH_MM = 50; // Standard CR80 card width is 85.6mm, height is 53.98mm. Let's assume landscape for these dimensions or adjust.
    const CARD_HEIGHT_MM = 85; // The EJS preview seems portrait, so width 50mm, height 85mm might be custom.
    const DPI = 72; // dots per inch
    const PX_PER_MM = DPI / 25.4;
    const CARD_WIDTH_PX = CARD_WIDTH_MM * PX_PER_MM;
    const CARD_HEIGHT_PX = CARD_HEIGHT_MM * PX_PER_MM;
    const LOCAL_STORAGE_KEY = 'idCardGeneratorCustomizations_v2'; // Changed key to avoid conflict with old versions

    // DOM Elements - Card Preview Areas
    const frontIdCardEl = document.getElementById('front-id-card');
    const backIdCardEl = document.getElementById('back-id-card');

    // DOM Elements - Live Preview Card Content
    const companyNameLiveEl = document.getElementById('companyName'); // Front header
    const companySubtitleLiveEl = document.getElementById('companySubtitle'); // Front header
    const companyLogoLiveEl = document.getElementById('companyLogo'); // Front
    const employeePhotoLiveEl = document.getElementById('employeePhoto'); // Front
    const employeeNameLiveEl = document.getElementById('employeeName'); // Front
    const employeePositionLiveEl = document.getElementById('employeePosition'); // Front
    const employeeIdLiveEl = document.getElementById('employeeId'); // Front
    const frontBarcodeLiveEl = document.getElementById('frontBarcode'); // Front

    const backLogoLiveEl = document.getElementById('logo'); // Back card logo
    const backNameLiveEl = document.getElementById('backName'); // Back
    const backPositionLiveEl = document.getElementById('backPosition'); // Back
    const backIdLiveEl = document.getElementById('backId'); // Back
    const issueDateLiveEl = document.getElementById('issueDate'); // Back
    const expiryDateLiveEl = document.getElementById('expiryDate'); // Back
    const companyPhoneDisplayLiveEl = document.getElementById('companyPhoneDisplay'); // Back
    const companyEmailDisplayLiveEl = document.getElementById('companyEmailDisplay'); // Back
    const companyWebsiteDisplayLiveEl = document.getElementById('companyWebsiteDisplay'); // Back
    const companyLocationDisplayLiveEl = document.getElementById('companyLocationDisplay'); // Back
    const authorizationDisplayLiveEl = document.getElementById('authorizationDisplay'); // Back
    const ceoNameDisplayLiveEl = document.getElementById('ceoNameDisplay'); // Back
    const companyNameDisplayLiveEl = document.getElementById('companyNameDisplay'); // Back footer
    const backBarcodeLiveEl = document.getElementById('backBarcode'); // Back
    const signatureLiveEl = document.querySelector('#back-id-card .signature'); // Back
    const stampLiveEl = document.querySelector('#back-id-card .stamp'); // Back

    // DOM Elements - Form Inputs: Company Details
    const companyNameInputEl = document.getElementById('idcard-companyName');
    const companySubtitleInputEl = document.getElementById('idcard-companySubtitle');
    const companyLogoUploadEl = document.getElementById('idcard-companyLogoUpload');
    const ceoSignatureUploadEl = document.getElementById('idcard-ceoSignatureUpload');
    const companyStampUploadEl = document.getElementById('idcard-companyStampUpload');
    const companyPhoneInputEl = document.getElementById('idcard-companyPhone');
    const companyEmailInputEl = document.getElementById('idcard-companyEmail');
    const companyWebsiteInputEl = document.getElementById('idcard-companyWebsite');
    const companyLocationInputEl = document.getElementById('idcard-companyLocation');
    const ceoNameInputEl = document.getElementById('idcard-ceoName');

    // DOM Elements - Form Inputs: Employee Details
    const employeeFullNameFrontInputEl = document.getElementById('idcard-employeeFullNameFront');
    const employeePositionFrontInputEl = document.getElementById('idcard-employeePositionFront');
    const employeeFullNameBackInputEl = document.getElementById('idcard-employeeFullNameBack');
    const employeePositionBackInputEl = document.getElementById('idcard-employeePositionBack');
    const employeePhotoUploadEl = document.getElementById('idcard-employeePhotoUpload');
    const employeePhoneInputEl = document.getElementById('idcard-employeePhone');
    const employeeEmailInputEl = document.getElementById('idcard-employeeEmail');
    const employeeIdNumberInputEl = document.getElementById('idcard-employeeIdNumber');
    const employeeIdNumberBackInputEl = document.getElementById('idcard-employeeIdNumberBack');
    const issueDateInputEl = document.getElementById('idcard-issueDate');
    const expiryDateInputEl = document.getElementById('idcard-expiryDate');
    const authorizationStatementInputEl = document.getElementById('idcard-authorizationStatement');

    // DOM Elements - Style Controls: Front Card Colors
    const frontIdCardBackgroundColorEl = document.getElementById('frontIdCardBackgroundColor');
    const frontHeaderBackgroundColorEl = document.getElementById('frontHeaderBackgroundColor');
    const frontHeaderFontColorEl = document.getElementById('frontHeaderFontColor');
    const frontEmployeePhotoBorderColorEl = document.getElementById('frontEmployeePhotoBorderColor');
    // EJS doesn't have these from old HTML:
    // const frontEmployeePhotoBackgroundColorEl = document.getElementById('frontEmployeePhotoBackgroundColor');
    // const frontEmployeeNameBackgroundColorEl = document.getElementById('frontEmployeeNameBackgroundColor');
    // const frontEmployeeNameFontColorEl = document.getElementById('frontEmployeeNameFontColor');
    // const frontEmployeePositionBackgroundColorEl = document.getElementById('frontEmployeePositionBackgroundColor');
    // const frontEmployeePositionFontColorEl = document.getElementById('frontEmployeePositionFontColor');
    // const frontEmployeeIdBackgroundColorEl = document.getElementById('frontEmployeeIdBackgroundColor');
    // const frontEmployeeIdFontColorEl = document.getElementById('frontEmployeeIdFontColor');
    // const frontCompanyLogoBackgroundColorEl = document.getElementById('frontCompanyLogoBackgroundColor');
    // const frontCompanyLogoBorderColorEl = document.getElementById('frontCompanyLogoBorderColor');

    // DOM Elements - Style Controls: Front Card Fonts & Positioning
    const frontEmployeeNameTopEl = document.getElementById('frontEmployeeNameTop');
    const frontEmployeeNameLeftEl = document.getElementById('frontEmployeeNameLeft');
    const frontEmployeeNameFontSizeEl = document.getElementById('frontEmployeeNameFontSize');
    const frontEmployeeNameFontWeightEl = document.getElementById('frontEmployeeNameFontWeight');
    const frontEmployeeNameTextAlignEl = document.getElementById('frontEmployeeNameTextAlign');
    // Additional font controls from EJS would go here if mapped from old HTML

    // DOM Elements - Style Controls: Front Card Images & Barcode
    const frontCompanyLogoWidthEl = document.getElementById('frontCompanyLogoWidth');
    const frontCompanyLogoHeightEl = document.getElementById('frontCompanyLogoHeight');
    const frontEmployeePhotoWidthEl = document.getElementById('frontEmployeePhotoWidth');
    const frontEmployeePhotoHeightEl = document.getElementById('frontEmployeePhotoHeight');
    const frontEmployeePhotoBorderRadiusEl = document.getElementById('idcard-frontEmployeePhotoBorderRadius');
    const frontCompanyLogoBorderRadiusEl = document.getElementById('idcard-frontCompanyLogoBorderRadius');
    // Additional image/barcode style inputs from EJS would go here

    // DOM Elements - Style Controls: Back Card Colors
    const backIdCardBackgroundColorEl = document.getElementById('backIdCardBackgroundColor');
    // Add more back card color inputs if they exist in EJS and are needed

    // DOM Elements - Style Controls: Back Card Fonts
    // Add back card font inputs if they exist in EJS and are needed

    // DOM Elements - Style Controls: Back Card Images & Barcode
    const backCompanyLogoBorderRadiusEl = document.getElementById('idcard-backCompanyLogoBorderRadius');
    // Add other back card image style inputs from EJS if needed

    // DOM Elements - Buttons
    const generatePreviewBtnEl = document.getElementById('idcard-generatePreviewBtn');
    const previewCardBtnEl = document.getElementById('idcard-previewCardBtn');
    const exportPdfBtnEl = document.getElementById('idcard-exportPdfBtn');
    const exportPngBtnEl = document.getElementById('idcard-exportPngBtn');
    const printBtnEl = document.getElementById('idcard-printBtn');

    // Style Apply/Reset Buttons
    const frontApplyColorsButtonEl = document.getElementById('frontApplyColorsButton');
    const frontResetColorsButtonEl = document.getElementById('frontResetColorsButton');
    const frontApplyFontButtonEl = document.getElementById('frontApplyFontButton');
    const frontResetFontButtonEl = document.getElementById('frontResetFontButton');
    const frontApplyImageButtonEl = document.getElementById('frontApplyImageButton');
    const frontResetImageButtonEl = document.getElementById('frontResetImageButton');

    const backApplyColorsButtonEl = document.getElementById('backApplyColorsButton');
    const backResetColorsButtonEl = document.getElementById('backResetColorsButton');
    const backApplyFontButtonEl = document.getElementById('backApplyFontButton');
    const backResetFontButtonEl = document.getElementById('backResetFontButton');
    const backApplyImageButtonEl = document.getElementById('backApplyImageButton');
    const backResetImageButtonEl = document.getElementById('backResetImageButton');

    // Modal Elements
    const previewModalEl = document.getElementById('previewModal');
    const frontPreviewModalContentEl = document.getElementById('front-preview-modal');
    const backPreviewModalContentEl = document.getElementById('back-preview-modal');
    let previewModalInstance;
    if (previewModalEl) {
        previewModalInstance = new bootstrap.Modal(previewModalEl);
    }
    
    // --- Helper Functions ---

    function mmToPx(mm) {
        return mm * PX_PER_MM;
    }

    function applyStyles(element, styles) {
        if (!element) return;
        for (const property in styles) {
            element.style[property] = styles[property];
        }
    }

    function applyImageBorderRadius(imageElement, borderRadius) {
        if (!imageElement) return;
        imageElement.style.borderRadius = borderRadius + "%";
    }

    function handleImageUpload(inputElement, imageElement, callback) {
        if (!inputElement || !imageElement) return;
        const file = inputElement.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imageElement.src = e.target.result;
                if (callback) callback();
            }
            reader.readAsDataURL(file);
        }
    }

    async function generateBarcode(element, text, widthMm = 40, heightMm = 10) {
        if (!element || !text) {
            if (element) element.innerHTML = ''; // Clear if no text
            return;
        }
        try {
            JsBarcode(element, text, {
                format: "CODE128",
                displayValue: false, // No text below barcode, ID number is separate
                lineColor: "#000",
                width: mmToPx(widthMm) / 100, // JsBarcode width unit is a bit abstract
                height: mmToPx(heightMm),
                margin: 0
            });
        } catch (error) {
            console.error("Barcode generation error:", error);
            element.innerHTML = '<text fill="red">Error</text>'; // Display error in SVG
        }
    }
    
    // --- Validation Functions ---
    function validatePhoneNumber(phoneNumber) {
        const phoneRegex = /^\+?\d{7,15}$/; // Simplified regex, adjust as needed
        return phoneRegex.test(phoneNumber);
    }

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function validateWebsiteURL(url) {
        try {
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    }

    function displayValidationMessage(inputId, message, isValid) {
        const inputEl = document.getElementById(inputId);
        const errorEl = document.getElementById(inputId + 'Error'); // e.g., idcard-companyNameError

        if (!inputEl || !errorEl) return;

        if (isValid) {
            inputEl.classList.remove('is-invalid');
            inputEl.classList.add('is-valid');
            errorEl.textContent = '';
        } else {
            inputEl.classList.remove('is-valid');
            inputEl.classList.add('is-invalid');
            errorEl.textContent = message;
        }
    }
    
    // --- Data Handling & Local Storage ---

    function loadDataFromLocalStorage() {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY);
        try {
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error("Error parsing localStorage data:", e);
            return {};
        }
    }

    function saveDataToLocalStorage(data) {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error("Error saving to localStorage:", e);
        }
    }

    function getCurrentFormData() {
        return {
            // Company Details
            companyName: companyNameInputEl.value,
            companySubtitle: companySubtitleInputEl.value,
            companyPhone: companyPhoneInputEl.value,
            companyEmail: companyEmailInputEl.value,
            companyWebsite: companyWebsiteInputEl.value,
            companyLocation: companyLocationInputEl.value,
            ceoName: ceoNameInputEl.value,

            // Employee Details
            employeeFullNameFront: employeeFullNameFrontInputEl.value,
            employeePositionFront: employeePositionFrontInputEl.value,
            employeeFullNameBack: employeeFullNameBackInputEl.value,
            employeePositionBack: employeePositionBackInputEl.value,
            employeePhone: employeePhoneInputEl.value,
            employeeEmail: employeeEmailInputEl.value,
            employeeIdNumber: employeeIdNumberInputEl.value,
            employeeIdNumberBack: employeeIdNumberBackInputEl.value,
            issueDate: issueDateInputEl.value,
            expiryDate: expiryDateInputEl.value,
            authorizationStatement: authorizationStatementInputEl.value,

            // Image data URLs (updated on upload)
            companyLogoDataUrl: companyLogoLiveEl.src.startsWith('data:image') ? companyLogoLiveEl.src : null,
            employeePhotoDataUrl: employeePhotoLiveEl.src.startsWith('data:image') ? employeePhotoLiveEl.src : null,
            ceoSignatureDataUrl: signatureLiveEl.src.startsWith('data:image') ? signatureLiveEl.src : null,
            companyStampDataUrl: stampLiveEl.src.startsWith('data:image') ? stampLiveEl.src : null,

            // Styles
            styles: {
                frontIdCardBackgroundColor: frontIdCardBackgroundColorEl.value,
                frontHeaderBackgroundColor: frontHeaderBackgroundColorEl.value,
                frontHeaderFontColor: frontHeaderFontColorEl.value,
                frontEmployeePhotoBorderColor: frontEmployeePhotoBorderColorEl.value,
                
                frontEmployeeNameTop: frontEmployeeNameTopEl.value,
                frontEmployeeNameLeft: frontEmployeeNameLeftEl.value,
                frontEmployeeNameFontSize: frontEmployeeNameFontSizeEl.value,
                frontEmployeeNameFontWeight: frontEmployeeNameFontWeightEl.value,
                frontEmployeeNameTextAlign: frontEmployeeNameTextAlignEl.value,
                
                frontCompanyLogoWidth: frontCompanyLogoWidthEl.value,
                frontCompanyLogoHeight: frontCompanyLogoHeightEl.value,
                frontEmployeePhotoWidth: frontEmployeePhotoWidthEl.value,
                frontEmployeePhotoHeight: frontEmployeePhotoHeightEl.value,
                frontEmployeePhotoBorderRadius: frontEmployeePhotoBorderRadiusEl.value,
                frontCompanyLogoBorderRadius: frontCompanyLogoBorderRadiusEl.value,
                
                backIdCardBackgroundColor: backIdCardBackgroundColorEl.value,
                backCompanyLogoBorderRadius: backCompanyLogoBorderRadiusEl.value,
                // Add all other style inputs here
            }
        };
    }

    function populateFormWithData(data) {
        // Company Details
        companyNameInputEl.value = data.companyName || '';
        companySubtitleInputEl.value = data.companySubtitle || '';
        companyPhoneInputEl.value = data.companyPhone || '';
        companyEmailInputEl.value = data.companyEmail || '';
        companyWebsiteInputEl.value = data.companyWebsite || '';
        companyLocationInputEl.value = data.companyLocation || '';
        ceoNameInputEl.value = data.ceoName || '';

        // Employee Details
        employeeFullNameFrontInputEl.value = data.employeeFullNameFront || '';
        employeePositionFrontInputEl.value = data.employeePositionFront || '';
        employeeFullNameBackInputEl.value = data.employeeFullNameBack || '';
        employeePositionBackInputEl.value = data.employeePositionBack || '';
        employeePhoneInputEl.value = data.employeePhone || '';
        employeeEmailInputEl.value = data.employeeEmail || '';
        employeeIdNumberInputEl.value = data.employeeIdNumber || '';
        employeeIdNumberBackInputEl.value = data.employeeIdNumberBack || '';
        issueDateInputEl.value = data.issueDate || '';
        expiryDateInputEl.value = data.expiryDate || '';
        authorizationStatementInputEl.value = data.authorizationStatement || '';

        // Restore images if data URLs exist (from local storage or previous uploads)
        if (data.companyLogoDataUrl) companyLogoLiveEl.src = data.companyLogoDataUrl;
        else if (initialCompanySettings && initialCompanySettings.logo_url) companyLogoLiveEl.src = initialCompanySettings.logo_url;
        
        if (data.employeePhotoDataUrl) employeePhotoLiveEl.src = data.employeePhotoDataUrl;
        else if (initialStaffData && initialStaffData.photo_url) employeePhotoLiveEl.src = initialStaffData.photo_url;

        if (data.ceoSignatureDataUrl) signatureLiveEl.src = data.ceoSignatureDataUrl;
        else if (initialCompanySettings && initialCompanySettings.signature_url) signatureLiveEl.src = initialCompanySettings.signature_url;
        
        if (data.companyStampDataUrl) stampLiveEl.src = data.companyStampDataUrl;
        else if (initialCompanySettings && initialCompanySettings.stamp_url) stampLiveEl.src = initialCompanySettings.stamp_url;


        // Populate Styles
        if (data.styles) {
            frontIdCardBackgroundColorEl.value = data.styles.frontIdCardBackgroundColor || '#FFFFFF';
            frontHeaderBackgroundColorEl.value = data.styles.frontHeaderBackgroundColor || '#FF4900';
            frontHeaderFontColorEl.value = data.styles.frontHeaderFontColor || '#FFFFFF';
            frontEmployeePhotoBorderColorEl.value = data.styles.frontEmployeePhotoBorderColor || '#000000';
            
            frontEmployeeNameTopEl.value = data.styles.frontEmployeeNameTop || '45';
            frontEmployeeNameLeftEl.value = data.styles.frontEmployeeNameLeft || '5';
            frontEmployeeNameFontSizeEl.value = data.styles.frontEmployeeNameFontSize || '3.5';
            frontEmployeeNameFontWeightEl.value = data.styles.frontEmployeeNameFontWeight || '500';
            frontEmployeeNameTextAlignEl.value = data.styles.frontEmployeeNameTextAlign || 'center';
            
            frontCompanyLogoWidthEl.value = data.styles.frontCompanyLogoWidth || '10';
            frontCompanyLogoHeightEl.value = data.styles.frontCompanyLogoHeight || '10';
            frontEmployeePhotoWidthEl.value = data.styles.frontEmployeePhotoWidth || '30';
            frontEmployeePhotoHeightEl.value = data.styles.frontEmployeePhotoHeight || '30';
            frontEmployeePhotoBorderRadiusEl.value = data.styles.frontEmployeePhotoBorderRadius || '50';
            frontCompanyLogoBorderRadiusEl.value = data.styles.frontCompanyLogoBorderRadius || '0';
            
            backIdCardBackgroundColorEl.value = data.styles.backIdCardBackgroundColor || '#FFFFFF';
            backCompanyLogoBorderRadiusEl.value = data.styles.backCompanyLogoBorderRadius || '0';
        }
    }
    
    // --- Update Preview ---
    async function updatePreview() {
        const data = getCurrentFormData();

        // Update Live Preview Text Content
        if (companyNameLiveEl) companyNameLiveEl.textContent = data.companyName;
        if (companySubtitleLiveEl) companySubtitleLiveEl.textContent = data.companySubtitle;
        if (employeeNameLiveEl) employeeNameLiveEl.textContent = data.employeeFullNameFront;
        if (employeePositionLiveEl) employeePositionLiveEl.textContent = data.employeePositionFront;
        if (employeeIdLiveEl) employeeIdLiveEl.textContent = data.employeeIdNumber ? `ID: ${data.employeeIdNumber}` : '';
        
        if (backNameLiveEl) backNameLiveEl.textContent = data.employeeFullNameBack;
        if (backPositionLiveEl) backPositionLiveEl.textContent = data.employeePositionBack;
        if (backIdLiveEl) backIdLiveEl.textContent = data.employeeIdNumberBack;
        if (issueDateLiveEl) issueDateLiveEl.textContent = data.issueDate ? `Issued: ${new Date(data.issueDate).toLocaleDateString()}`: '';
        if (expiryDateLiveEl) expiryDateLiveEl.textContent = data.expiryDate ? `Expires: ${new Date(data.expiryDate).toLocaleDateString()}`: '';
        
        if (companyPhoneDisplayLiveEl) companyPhoneDisplayLiveEl.textContent = data.companyPhone ? `P: ${data.companyPhone}` : '';
        if (companyEmailDisplayLiveEl) companyEmailDisplayLiveEl.textContent = data.companyEmail ? `E: ${data.companyEmail}` : '';
        if (companyWebsiteDisplayLiveEl) companyWebsiteDisplayLiveEl.textContent = data.companyWebsite ? `W: ${data.companyWebsite}` : '';
        if (companyLocationDisplayLiveEl) companyLocationDisplayLiveEl.textContent = data.companyLocation;
        if (authorizationDisplayLiveEl) authorizationDisplayLiveEl.textContent = data.authorizationStatement;
        if (ceoNameDisplayLiveEl) ceoNameDisplayLiveEl.textContent = data.ceoName ? `CEO: ${data.ceoName}` : '';
        if (companyNameDisplayLiveEl) companyNameDisplayLiveEl.textContent = data.companyName; // Back footer

        // Update images (src is handled by populate or image upload handlers)
        // Apply Styles (will read from style control inputs)
        applyAllStyles();

        // Generate Barcodes
        if (data.employeeIdNumber) {
           await generateBarcode(frontBarcodeLiveEl, data.employeeIdNumber);
        } else {
           if(frontBarcodeLiveEl) frontBarcodeLiveEl.innerHTML = '';
        }
        if (data.employeeIdNumberBack) {
           await generateBarcode(backBarcodeLiveEl, data.employeeIdNumberBack);
        } else {
            if(backBarcodeLiveEl) backBarcodeLiveEl.innerHTML = '';
        }

        // Save current state to local storage
        saveDataToLocalStorage(data);
    }

    // --- Apply Styles Functions ---
    function applyFrontCardColors() {
        if (!frontIdCardEl) return;
        applyStyles(frontIdCardEl, { backgroundColor: frontIdCardBackgroundColorEl.value });
        const headerSection = frontIdCardEl.querySelector('.header-section');
        if (headerSection) {
            applyStyles(headerSection, { backgroundColor: frontHeaderBackgroundColorEl.value });
            const headerText = headerSection.querySelector('#companyName'); // Assuming h1 or similar for text
            if (headerText) applyStyles(headerText, { color: frontHeaderFontColorEl.value });
        }
        if (employeePhotoLiveEl) {
            applyStyles(employeePhotoLiveEl, { borderColor: frontEmployeePhotoBorderColorEl.value });
        }
    }

    function resetFrontCardColors() {
        frontIdCardBackgroundColorEl.value = '#FFFFFF';
        frontHeaderBackgroundColorEl.value = '#FF4900';
        frontHeaderFontColorEl.value = '#FFFFFF';
        frontEmployeePhotoBorderColorEl.value = '#000000';
        applyFrontCardColors();
        updatePreview();
    }

    function applyFrontCardFontsAndPositioning() {
        if (employeeNameLiveEl) {
            applyStyles(employeeNameLiveEl, {
                position: 'absolute', // Assuming this is desired for direct positioning
                top: frontEmployeeNameTopEl.value + 'mm',
                left: frontEmployeeNameLeftEl.value + 'mm',
                fontSize: frontEmployeeNameFontSizeEl.value + 'mm',
                fontWeight: frontEmployeeNameFontWeightEl.value,
                textAlign: frontEmployeeNameTextAlignEl.value,
            });
        }
        // Add more font applications here for other elements if controls exist
    }
    
    function resetFrontCardFontsAndPositioning() {
        frontEmployeeNameTopEl.value = '45';
        frontEmployeeNameLeftEl.value = '5';
        frontEmployeeNameFontSizeEl.value = '3.5';
        frontEmployeeNameFontWeightEl.value = '500';
        frontEmployeeNameTextAlignEl.value = 'center';
        applyFrontCardFontsAndPositioning();
        updatePreview();
    }

    function applyFrontCardImagesAndRadius() {
        if (companyLogoLiveEl) {
            applyStyles(companyLogoLiveEl, {
                width: frontCompanyLogoWidthEl.value + 'mm',
                height: frontCompanyLogoHeightEl.value + 'mm',
            });
            applyImageBorderRadius(companyLogoLiveEl, frontCompanyLogoBorderRadiusEl.value);
        }
        if (employeePhotoLiveEl) {
            applyStyles(employeePhotoLiveEl, {
                width: frontEmployeePhotoWidthEl.value + 'mm',
                height: frontEmployeePhotoHeightEl.value + 'mm',
            });
            applyImageBorderRadius(employeePhotoLiveEl, frontEmployeePhotoBorderRadiusEl.value);
        }
    }

    function resetFrontCardImagesAndRadius() {
        frontCompanyLogoWidthEl.value = '10';
        frontCompanyLogoHeightEl.value = '10';
        frontEmployeePhotoWidthEl.value = '30';
        frontEmployeePhotoHeightEl.value = '30';
        frontEmployeePhotoBorderRadiusEl.value = '50';
        frontCompanyLogoBorderRadiusEl.value = '0';
        applyFrontCardImagesAndRadius();
        updatePreview();
    }
    
    function applyBackCardColors() {
        if (backIdCardEl) {
            applyStyles(backIdCardEl, { backgroundColor: backIdCardBackgroundColorEl.value });
        }
    }

    function resetBackCardColors() {
        backIdCardBackgroundColorEl.value = '#FFFFFF';
        applyBackCardColors();
        updatePreview();
    }
    
    function applyBackCardImagesAndRadius() {
        if (backLogoLiveEl) { // Assuming backLogoLiveEl is the company logo on the back
            applyImageBorderRadius(backLogoLiveEl, backCompanyLogoBorderRadiusEl.value);
            // Add width/height controls if available for back logo
        }
    }

    function resetBackCardImagesAndRadius() {
        backCompanyLogoBorderRadiusEl.value = '0';
        applyBackCardImagesAndRadius();
        updatePreview();
    }

    function applyAllStyles() {
        applyFrontCardColors();
        applyFrontCardFontsAndPositioning();
        applyFrontCardImagesAndRadius();
        applyBackCardColors();
        // applyBackCardFonts(); // Implement if back font controls exist
        applyBackCardImagesAndRadius();
    }

    // --- Action Button Handlers ---
    function validateAllFields() {
        let isValid = true;
        // Simplified validation chain
        const fieldsToValidate = [
            { el: companyNameInputEl, msg: 'Company name is required.', validator: val => val.trim() !== '' },
            { el: companyPhoneInputEl, msg: 'Valid company phone is required.', validator: validatePhoneNumber },
            { el: companyEmailInputEl, msg: 'Valid company email is required.', validator: validateEmail },
            { el: companyWebsiteInputEl, msg: 'Valid company website is required.', validator: validateWebsiteURL, optional: true },
            { el: companyLocationInputEl, msg: 'Company location is required.', validator: val => val.trim() !== '' },
            { el: ceoNameInputEl, msg: 'CEO name is required.', validator: val => val.trim() !== '' },
            { el: employeeFullNameFrontInputEl, msg: 'Employee full name (front) is required.', validator: val => val.trim() !== '' },
            { el: employeePositionFrontInputEl, msg: 'Employee position (front) is required.', validator: val => val.trim() !== '' },
            { el: employeeIdNumberInputEl, msg: 'Employee ID (front) is required.', validator: val => val.trim() !== '' },
            { el: employeeIdNumberBackInputEl, msg: 'Employee ID (back) is required and must match front ID.', validator: val => val.trim() !== '' && val === employeeIdNumberInputEl.value },
            { el: issueDateInputEl, msg: 'Issue date is required.', validator: val => val.trim() !== '' },
            { el: expiryDateInputEl, msg: 'Expiry date is required.', validator: val => val.trim() !== '' },
            { el: authorizationStatementInputEl, msg: 'Authorization statement is required.', validator: val => val.trim() !== '' },
            { el: employeePhoneInputEl, msg: 'Valid employee phone format required if provided.', validator: validatePhoneNumber, optional: true },
            { el: employeeEmailInputEl, msg: 'Valid employee email format required if provided.', validator: validateEmail, optional: true },
        ];

        fieldsToValidate.forEach(field => {
            const value = field.el.value;
            let fieldIsValid;
            if (field.optional && value.trim() === '') {
                fieldIsValid = true;
            } else {
                fieldIsValid = field.validator(value);
            }
            displayValidationMessage(field.el.id, field.msg, fieldIsValid);
            if (!fieldIsValid) isValid = false;
        });
        return isValid;
    }

    async function handleGeneratePreview() {
        if (!validateAllFields()) {
            alert("Please correct the errors in the form.");
            return;
        }
        await updatePreview();
    }
    
    async function handleOpenFullPreview() {
        await handleGeneratePreview(); // Ensure preview is up-to-date
        if (frontPreviewModalContentEl) frontPreviewModalContentEl.innerHTML = frontIdCardEl.outerHTML;
        if (backPreviewModalContentEl) backPreviewModalContentEl.innerHTML = backIdCardEl.outerHTML;
        if (previewModalInstance) previewModalInstance.show();
    }

    async function handleExportPdf() {
        await handleGeneratePreview();
        try {
            // Wait for images and styles to render, especially barcodes
            await new Promise(resolve => setTimeout(resolve, 300)); 
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [CARD_WIDTH_MM, CARD_HEIGHT_MM] // Note: standard CR80 is ~85.6x54mm. These seem custom portrait.
            });

            const frontCanvas = await html2canvas(frontIdCardEl, { scale: 2, useCORS: true });
            pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', 0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);
            
            pdf.addPage([CARD_WIDTH_MM, CARD_HEIGHT_MM]);
            const backCanvas = await html2canvas(backIdCardEl, { scale: 2, useCORS: true });
            pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);
            
            pdf.save(`id_card_${employeeFullNameFrontInputEl.value.replace(/\s/g, '_') || 'employee'}.pdf`);
        } catch (error) {
            console.error('Error exporting PDF:', error);
            alert('Error exporting PDF. Check console for details.');
        }
    }

    async function handleExportPng() {
        await handleGeneratePreview();
        try {
            await new Promise(resolve => setTimeout(resolve, 300));

            const frontCanvas = await html2canvas(frontIdCardEl, { scale: 2, useCORS: true });
            const frontLink = document.createElement('a');
            frontLink.download = `id_card_front_${employeeFullNameFrontInputEl.value.replace(/\s/g, '_') || 'employee'}.png`;
            frontLink.href = frontCanvas.toDataURL('image/png');
            frontLink.click();

            const backCanvas = await html2canvas(backIdCardEl, { scale: 2, useCORS: true });
            const backLink = document.createElement('a');
            backLink.download = `id_card_back_${employeeFullNameFrontInputEl.value.replace(/\s/g, '_') || 'employee'}.png`;
            backLink.href = backCanvas.toDataURL('image/png');
            backLink.click();
        } catch (error) {
            console.error('Error exporting PNG:', error);
            alert('Error exporting PNG. Check console for details.');
        }
    }

    async function handlePrint() {
        await handleGeneratePreview();
        try {
            await new Promise(resolve => setTimeout(resolve, 300));

            const printWindow = window.open('', '_blank');
            printWindow.document.write('<html><head><title>Print ID Card</title>');
            // Add styles to make it look somewhat like the card for printing
            printWindow.document.write(`<style>
                body { margin: 0; display: flex; flex-direction: column; align-items: center; }
                .id-card-print-area { 
                    width: ${CARD_WIDTH_MM}mm; 
                    height: ${CARD_HEIGHT_MM}mm; 
                    overflow: hidden; 
                    margin-bottom: 10mm;
                    page-break-after: always;
                }
                img { max-width: 100%; height: auto; }
            </style></head><body>`);
            printWindow.document.write('<h3>Front</h3><div class="id-card-print-area">' + frontIdCardEl.innerHTML + '</div>');
            printWindow.document.write('<h3>Back</h3><div class="id-card-print-area">' + backIdCardEl.innerHTML + '</div>');
            printWindow.document.write('<script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); } }</script></body></html>');
            printWindow.document.close();
        } catch (error) {
            console.error('Error printing:', error);
            alert('Error printing. Check console for details.');
        }
    }

    // --- Initialization ---
    function initializePage() {
        // 1. Prepare initial data structure from server (EJS global vars)
        const serverData = {
            companyName: initialCompanySettings.name || '',
            companySubtitle: initialCompanySettings.subtitle || '',
            companyPhone: initialCompanySettings.phone || '',
            companyEmail: initialCompanySettings.email || '',
            companyWebsite: initialCompanySettings.website || '',
            companyLocation: initialCompanySettings.address || '', // Assuming 'address' field from companySettings
            ceoName: initialCompanySettings.ceo_name || '',

            employeeFullNameFront: initialStaffData.full_name || '',
            employeePositionFront: initialStaffData.position || '',
            employeeFullNameBack: initialStaffData.full_name || '', // Default to same as front
            employeePositionBack: initialStaffData.position || '', // Default to same as front
            employeePhone: initialStaffData.phone_number || '',
            employeeEmail: initialStaffData.email || '',
            employeeIdNumber: initialStaffData.staff_id || '',
            employeeIdNumberBack: initialStaffData.staff_id || '', // Default to same as front
            issueDate: initialStaffData.id_issue_date ? initialStaffData.id_issue_date.split('T')[0] : '', // Format date
            expiryDate: initialStaffData.id_expiry_date ? initialStaffData.id_expiry_date.split('T')[0] : '', // Format date
            authorizationStatement: initialCompanySettings.id_authorization_statement || 'This cardholder is an authorized member of our organization.',
            
            // Initial image URLs from server
            companyLogoDataUrl: initialCompanySettings.logo_url,
            employeePhotoDataUrl: initialStaffData.photo_url,
            ceoSignatureDataUrl: initialCompanySettings.signature_url,
            companyStampDataUrl: initialCompanySettings.stamp_url,

            styles: {} // Default empty styles, to be overridden by local storage if exists
        };
        
        // 2. Load customizations from local storage
        const localCustomizations = loadDataFromLocalStorage();
        
        // 3. Merge: Server data is base, local storage overrides specific fields/styles
        // For text/data fields, local storage takes precedence if it exists (user might have typed something)
        // For styles, local storage always takes precedence.
        const finalInitialData = { ...serverData };
        for (const key in localCustomizations) {
            if (key !== 'styles' && localCustomizations[key] !== null && localCustomizations[key] !== undefined) {
                finalInitialData[key] = localCustomizations[key];
            }
        }
        finalInitialData.styles = { ...serverData.styles, ...(localCustomizations.styles || {}) };

        // Ensure image URLs are correctly set from server data if not overridden by local base64
        if (!localCustomizations.companyLogoDataUrl) finalInitialData.companyLogoDataUrl = serverData.companyLogoDataUrl;
        if (!localCustomizations.employeePhotoDataUrl) finalInitialData.employeePhotoDataUrl = serverData.employeePhotoDataUrl;
        if (!localCustomizations.ceoSignatureDataUrl) finalInitialData.ceoSignatureDataUrl = serverData.ceoSignatureDataUrl;
        if (!localCustomizations.companyStampDataUrl) finalInitialData.companyStampDataUrl = serverData.companyStampDataUrl;


        // 4. Populate form with this merged data
        populateFormWithData(finalInitialData);

        // 5. Set up event listeners
        // Inputs that trigger preview update and save
        const inputsToWatch = [
            companyNameInputEl, companySubtitleInputEl, companyPhoneInputEl, companyEmailInputEl,
            companyWebsiteInputEl, companyLocationInputEl, ceoNameInputEl, employeeFullNameFrontInputEl,
            employeePositionFrontInputEl, employeeFullNameBackInputEl, employeePositionBackInputEl,
            employeePhoneInputEl, employeeEmailInputEl, employeeIdNumberInputEl, employeeIdNumberBackInputEl,
            issueDateInputEl, expiryDateInputEl, authorizationStatementInputEl,
            // Style inputs
            frontIdCardBackgroundColorEl, frontHeaderBackgroundColorEl, frontHeaderFontColorEl,
            frontEmployeePhotoBorderColorEl, frontEmployeeNameTopEl, frontEmployeeNameLeftEl,
            frontEmployeeNameFontSizeEl, frontEmployeeNameFontWeightEl, frontEmployeeNameTextAlignEl,
            frontCompanyLogoWidthEl, frontCompanyLogoHeightEl, frontEmployeePhotoWidthEl,
            frontEmployeePhotoHeightEl, frontEmployeePhotoBorderRadiusEl, frontCompanyLogoBorderRadiusEl,
            backIdCardBackgroundColorEl, backCompanyLogoBorderRadiusEl
        ];
        inputsToWatch.forEach(input => {
            if (input) input.addEventListener('input', updatePreview);
            if (input && (input.type === 'color' || input.type === 'date' || input.tagName === 'SELECT')) { // Some inputs need 'change'
                input.addEventListener('change', updatePreview);
            }
        });

        // Image uploads
        if (companyLogoUploadEl) companyLogoUploadEl.addEventListener('change', () => handleImageUpload(companyLogoUploadEl, companyLogoLiveEl, updatePreview));
        if (employeePhotoUploadEl) employeePhotoUploadEl.addEventListener('change', () => handleImageUpload(employeePhotoUploadEl, employeePhotoLiveEl, updatePreview));
        if (ceoSignatureUploadEl) ceoSignatureUploadEl.addEventListener('change', () => handleImageUpload(ceoSignatureUploadEl, signatureLiveEl, updatePreview));
        if (companyStampUploadEl) companyStampUploadEl.addEventListener('change', () => handleImageUpload(companyStampUploadEl, stampLiveEl, updatePreview));

        // Action Buttons
        if (generatePreviewBtnEl) generatePreviewBtnEl.addEventListener('click', handleGeneratePreview);
        if (previewCardBtnEl) previewCardBtnEl.addEventListener('click', handleOpenFullPreview);
        if (exportPdfBtnEl) exportPdfBtnEl.addEventListener('click', handleExportPdf);
        if (exportPngBtnEl) exportPngBtnEl.addEventListener('click', handleExportPng);
        if (printBtnEl) printBtnEl.addEventListener('click', handlePrint);

        // Style Apply/Reset Buttons
        if (frontApplyColorsButtonEl) frontApplyColorsButtonEl.addEventListener('click', () => { applyFrontCardColors(); updatePreview(); });
        if (frontResetColorsButtonEl) frontResetColorsButtonEl.addEventListener('click', resetFrontCardColors);
        if (frontApplyFontButtonEl) frontApplyFontButtonEl.addEventListener('click', () => { applyFrontCardFontsAndPositioning(); updatePreview(); });
        if (frontResetFontButtonEl) frontResetFontButtonEl.addEventListener('click', resetFrontCardFontsAndPositioning);
        if (frontApplyImageButtonEl) frontApplyImageButtonEl.addEventListener('click', () => { applyFrontCardImagesAndRadius(); updatePreview(); });
        if (frontResetImageButtonEl) frontResetImageButtonEl.addEventListener('click', resetFrontCardImagesAndRadius);
        
        if (backApplyColorsButtonEl) backApplyColorsButtonEl.addEventListener('click', () => { applyBackCardColors(); updatePreview(); });
        if (backResetColorsButtonEl) backResetColorsButtonEl.addEventListener('click', resetBackCardColors);
        // Add back font apply/reset if controls exist
        if (backApplyImageButtonEl) backApplyImageButtonEl.addEventListener('click', () => { applyBackCardImagesAndRadius(); updatePreview(); });
        if (backResetImageButtonEl) backResetImageButtonEl.addEventListener('click', resetBackCardImagesAndRadius);
        
        // 6. Initial preview generation
        updatePreview();
    }

    // --- Start the application ---
    // Ensure server data is available (it should be, as EJS script runs before this)
    if (typeof initialStaffData !== 'undefined' && typeof initialCompanySettings !== 'undefined') {
        initializePage();
    } else {
        console.error("Initial data (staffMember, companySettings) not found. Ensure it's passed correctly from the server.");
        // Fallback or error display
        alert("Error: Could not load initial data for the ID card generator.");
    }
});

/*
// public/js/idcard.js

// Constants (remain the same)
const CARD_WIDTH_MM = 50; // These seem small, typical ID card is 85.6mm x 53.98mm (CR80)
const CARD_HEIGHT_MM = 85; // If these are intentional, keep them. Otherwise, consider CR80: 85.6 and 53.98
const DPI = 72;
const PX_PER_MM = DPI / 25.4;
const CARD_WIDTH_PX = CARD_WIDTH_MM * PX_PER_MM;
const CARD_HEIGHT_PX = CARD_HEIGHT_MM * PX_PER_MM;


// DOM Elements - General (These IDs must match your actual HTML structure in idcard/create.ejs)
// Assuming your HTML pasted into idcard/create.ejs will have these exact IDs.
// If your idcard.html used different IDs, you must update them here or in your HTML.

// Elements on the card preview itself
const companyNameEl = document.getElementById('companyName'); // Front: Header company name
const companySubtitleEl = document.getElementById('companySubtitle'); // Front: Header company subtitle
const companyLogoEl = document.getElementById('companyLogo'); // Front: Company Logo image
const employeePhotoEl = document.getElementById('employeePhoto'); // Front: Employee Photo image
const employeeNameEl = document.getElementById('employeeName'); // Front: Employee Name text
const employeePositionEl = document.getElementById('employeePosition'); // Front: Employee Position text
const employeeIdEl = document.getElementById('employeeId'); // Front: Employee ID text
const frontBarcodeEl = document.getElementById('frontBarcode'); // Front: Barcode SVG/IMG

const backNameEl = document.getElementById('backName'); // Back: Employee Name text
const backPositionEl = document.getElementById('backPosition'); // Back: Employee Position text
const backIdEl = document.getElementById('backId'); // Back: Employee ID text
const issueDateEl = document.getElementById('issueDate'); // Back: Issue Date text
const expiryDateEl = document.getElementById('expiryDate'); // Back: Expiry Date text
const companyPhoneDisplayEl = document.getElementById('companyPhoneDisplay'); // Back: Company Phone text
const companyEmailDisplayEl = document.getElementById('companyEmailDisplay'); // Back: Company Email text
const companyWebsiteDisplayEl = document.getElementById('companyWebsiteDisplay'); // Back: Company Website text
const companyLocationDisplayEl = document.getElementById('companyLocationDisplay'); // Back: Company Location text
const authorizationDisplayEl = document.getElementById('authorizationDisplay'); // Back: Authorization statement text
const ceoNameDisplayEl = document.getElementById('ceoNameDisplay'); // Back: CEO Name text
const companyNameDisplayEl = document.getElementById('companyNameDisplay'); // Back: Footer Company Name text
const backBarcodeEl = document.getElementById('backBarcode'); // Back: Barcode SVG/IMG
const logoEl = document.getElementById('logo'); // Back: Company Logo image
const stampEl = document.querySelector('.stamp'); // Back: Company Stamp image (ensure class exists or use ID)
const signatureEl = document.querySelector('.signature'); // Back: CEO Signature image (ensure class exists or use ID)

const frontIdCardEl = document.getElementById('front-id-card'); // The main div for the front card preview
const backIdCardEl = document.getElementById('back-id-card');   // The main div for the back card preview


// Modal Elements
const previewModalEl = document.getElementById('previewModal'); // Main modal container
const frontPreviewModalEl = document.getElementById('front-preview-modal'); // Front card in modal
const backPreviewModalEl = document.getElementById('back-preview-modal');   // Back card in modal
const closeModalButtonEl = document.querySelector('.close-button'); // Modal close button

// DOM Elements - Form Inputs (These IDs must match your HTML structure in idcard/create.ejs)
// These are the input fields on the control panel
const companyNameInputEl = document.getElementById('idcard-companyName'); // Changed from companyNameInput
const companySubtitleInputEl = document.getElementById('idcard-companySubtitle'); // Changed
const companyLogoInputEl = document.getElementById('idcard-companyLogoUpload'); // Changed, matches EJS example
const ceoSignatureInputEl = document.getElementById('idcard-ceoSignatureUpload'); // Needs this ID in HTML
const companyStampInputEl = document.getElementById('idcard-companyStampUpload');   // Needs this ID in HTML
const companyPhoneInputEl = document.getElementById('idcard-companyPhone'); // Needs this ID
const companyEmailInputEl = document.getElementById('idcard-companyEmail'); // Needs this ID
const companyWebsiteInputEl = document.getElementById('idcard-companyWebsite'); // Needs this ID
const companyLocationInputEl = document.getElementById('idcard-companyLocation'); // Needs this ID
const ceoNameInputEl = document.getElementById('idcard-ceoName'); // Needs this ID

const frontNameInputEl = document.getElementById('idcard-employeeFullNameFront'); // Changed, matches EJS
const frontPositionInputEl = document.getElementById('idcard-employeePositionFront'); // Changed, matches EJS
const frontPhotoInputEl = document.getElementById('idcard-employeePhotoUpload'); // Changed, matches EJS
const employeePhoneInputEl = document.getElementById('idcard-employeePhone'); // Needs this ID
const employeeEmailInputEl = document.getElementById('idcard-employeeEmail');   // Needs this ID
const frontIdNumberInputEl = document.getElementById('idcard-employeeIdNumber'); // Changed, matches EJS

// Back card specific inputs (if they differ from front or company settings)
const backNameInputEl = document.getElementById('idcard-employeeFullNameBack') || frontNameInputEl; // Fallback if no separate back name
const backPositionInputEl = document.getElementById('idcard-employeePositionBack') || frontPositionInputEl; // Fallback
const backIdNumberInputEl = document.getElementById('idcard-employeeIdNumberBack') || frontIdNumberInputEl; // Fallback

const backIssueDateInputEl = document.getElementById('idcard-issueDate'); // Changed, matches EJS
const backExpiryDateInputEl = document.getElementById('idcard-expiryDate'); // Changed, matches EJS
const authorizationStatementEl = document.getElementById('idcard-authorizationStatement'); // Needs this ID

// Border Radius Inputs
const frontEmployeePhotoBorderRadiusEl = document.getElementById('idcard-frontEmployeePhotoBorderRadius'); // Needs this ID
const frontCompanyLogoBorderRadiusEl = document.getElementById('idcard-frontCompanyLogoBorderRadius');   // Needs this ID
const backCompanyLogoBorderRadiusEl = document.getElementById('idcard-backCompanyLogoBorderRadius');     // Needs this ID

// DOM Elements - Buttons (These IDs must match your HTML structure in idcard/create.ejs)
const generateButtonEl = document.getElementById('idcard-generatePreviewBtn'); // Changed to match EJS example
const previewButtonEl = document.getElementById('idcard-previewCardBtn'); // This button might be combined with generate or removed
const exportPdfButtonEl = document.getElementById('idcard-exportPdfBtn'); // Changed
const exportPngButtonEl = document.getElementById('idcard-exportPngBtn'); // Changed
const printButtonEl = document.getElementById('idcard-printBtn');     // Changed

// REMOVED: Staff Management Table and Buttons (createStaffButtonEl, saveStaffButtonEl, staffTableBodyEl)
// This functionality is now server-side.

// DOM Elements - Style Settings (Assuming these IDs are in your HTML structure for style controls)
// Front Card Colors
const frontIdCardBackgroundColorEl = document.getElementById('frontIdCardBackgroundColor');
// ... (all other style input elements remain, ensure their IDs are present in your HTML)
const frontHeaderBackgroundColorEl = document.getElementById('frontHeaderBackgroundColor');
const frontHeaderFontColorEl = document.getElementById('frontHeaderFontColor');
const frontEmployeePhotoBorderColorEl = document.getElementById('frontEmployeePhotoBorderColor');
const frontEmployeePhotoBackgroundColorEl = document.getElementById('frontEmployeePhotoBackgroundColor');
const frontEmployeeNameBackgroundColorEl = document.getElementById('frontEmployeeNameBackgroundColor');
const frontEmployeeNameFontColorEl = document.getElementById('frontEmployeeNameFontColor');
const frontEmployeePositionBackgroundColorEl = document.getElementById('frontEmployeePositionBackgroundColor');
const frontEmployeePositionFontColorEl = document.getElementById('frontEmployeePositionFontColor');
const frontEmployeeIdBackgroundColorEl = document.getElementById('frontEmployeeIdBackgroundColor');
const frontEmployeeIdFontColorEl = document.getElementById('frontEmployeeIdFontColor');
const frontCompanyLogoBackgroundColorEl = document.getElementById('frontCompanyLogoBackgroundColor');
const frontCompanyLogoBorderColorEl = document.getElementById('frontCompanyLogoBorderColor');
const frontApplyColorsButtonEl = document.getElementById('frontApplyColorsButton');
const frontResetColorsButtonEl = document.getElementById('frontResetColorsButton');

// Front Card Fonts
const frontEmployeeNameTopEl = document.getElementById('frontEmployeeNameTop');
const frontEmployeeNameLeftEl = document.getElementById('frontEmployeeNameLeft');
const frontHeaderFontSizeEl = document.getElementById('frontHeaderFontSize');
// ... (all other font style inputs and buttons) ...
const frontHeaderFontWeightEl = document.getElementById('frontHeaderFontWeight');
const frontHeaderTextAlignEl = document.getElementById('frontHeaderTextAlign');
const frontEmployeeNameFontSizeEl = document.getElementById('frontEmployeeNameFontSize');
const frontEmployeeNameFontWeightEl = document.getElementById('frontEmployeeNameFontWeight');
const frontEmployeeNameTextAlignEl = document.getElementById('frontEmployeeNameTextAlign');
const frontEmployeePositionFontSizeEl = document.getElementById('frontEmployeePositionFontSize');
const frontEmployeePositionFontWeightEl = document.getElementById('frontEmployeePositionFontWeight');
const frontEmployeePositionTextAlignEl = document.getElementById('frontEmployeePositionTextAlign');
const frontEmployeeIdFontSizeEl = document.getElementById('frontEmployeeIdFontSize');
const frontEmployeeIdFontWeightEl = document.getElementById('frontEmployeeIdFontWeight');
const frontEmployeeIdTextAlignEl = document.getElementById('frontEmployeeIdTextAlign');
const frontApplyFontButtonEl = document.getElementById('frontApplyFontButton');
const frontResetFontButtonEl = document.getElementById('frontResetFontButton');

// Front Card Images
const frontCompanyLogoTopEl = document.getElementById('frontCompanyLogoTop');
const frontCompanyLogoLeftEl = document.getElementById('frontCompanyLogoLeft');
// ... (all other image style inputs and buttons) ...
const frontEmployeePhotoTopEl = document.getElementById('frontEmployeePhotoTop');
const frontEmployeePhotoLeftEl = document.getElementById('frontEmployeePhotoLeft');
const frontCompanyLogoWidthEl = document.getElementById('frontCompanyLogoWidth');
const frontCompanyLogoHeightEl = document.getElementById('frontCompanyLogoHeight');
const frontCompanyLogoAlignEl = document.getElementById('frontCompanyLogoAlign');
const frontEmployeePhotoWidthEl = document.getElementById('frontEmployeePhotoWidth');
const frontEmployeePhotoHeightEl = document.getElementById('frontEmployeePhotoHeight');
const frontEmployeePhotoAlignEl = document.getElementById('frontEmployeePhotoAlign');
const frontBarcodeWidthEl = document.getElementById('frontBarcodeWidth');
const frontBarcodeHeightEl = document.getElementById('frontBarcodeHeight');
const frontBarcodeAlignEl = document.getElementById('frontBarcodeAlign');
const frontApplyImageButtonEl = document.getElementById('frontApplyImageButton');
const frontResetImageButtonEl = document.getElementById('frontResetImageButton');


// Back Card Colors
const backIdCardBackgroundColorEl = document.getElementById('backIdCardBackgroundColor');
// ... (all other back card style inputs and buttons) ...
const backCompanyLogoBackgroundColorEl = document.getElementById('backCompanyLogoBackgroundColor');
const backCompanyLogoBorderColorEl = document.getElementById('backCompanyLogoBorderColor');
const backApplyColorsButtonEl = document.getElementById('backApplyColorsButton');
const backResetColorsButtonEl = document.getElementById('backResetColorsButton');

// Back Card Fonts
const backEmployeeNameFontSizeEl = document.getElementById('backEmployeeNameFontSize');
// ... (all other back card font style inputs and buttons) ...
const backEmployeeNameFontWeightEl = document.getElementById('backEmployeeNameFontWeight');
const backEmployeeNameTextAlignEl = document.getElementById('backEmployeeNameTextAlign');
const backEmployeePositionFontSizeEl = document.getElementById('backEmployeePositionFontSize');
const backEmployeePositionFontWeightEl = document.getElementById('backEmployeePositionFontWeight');
const backEmployeePositionTextAlignEl = document.getElementById('backEmployeePositionTextAlign');
const backEmployeeIdFontSizeEl = document.getElementById('backEmployeeIdFontSize');
const backEmployeeIdFontWeightEl = document.getElementById('backEmployeeIdFontWeight');
const backEmployeeIdTextAlignEl = document.getElementById('backEmployeeIdTextAlign');
const backContactInfoFontSizeEl = document.getElementById('backContactInfoFontSize');
const backContactInfoFontWeightEl = document.getElementById('backContactInfoFontWeight');
const backContactInfoTextAlignEl = document.getElementById('backContactInfoTextAlign');
const backAuthorizationStatementFontSizeEl = document.getElementById('backAuthorizationStatementFontSize'); // Corrected typo: was FontWeight
const backAuthorizationStatementFontWeightEl = document.getElementById('backAuthorizationStatementFontWeight');
const backAuthorizationStatementTextAlignEl = document.getElementById('backAuthorizationStatementTextAlign');
const backCeoNameFontSizeEl = document.getElementById('backCeoNameFontSize');
const backCeoNameFontWeightEl = document.getElementById('backCeoNameFontWeight');
const backCeoNameTextAlignEl = document.getElementById('backCeoNameTextAlign');
const backFooterCompanyNameFontSizeEl = document.getElementById('backFooterCompanyNameFontSize');
const backFooterCompanyNameFontWeightEl = document.getElementById('backFooterCompanyNameFontWeight');
const backFooterCompanyNameTextAlignEl = document.getElementById('backFooterCompanyNameTextAlign');
const backAddressLocationFontSizeEl = document.getElementById('backAddressLocationFontSize');
const backAddressLocationFontWeightEl = document.getElementById('backAddressLocationFontWeight');
const backAddressLocationTextAlignEl = document.getElementById('backAddressLocationTextAlign');
const backApplyFontButtonEl = document.getElementById('backApplyFontButton');
const backResetFontButtonEl = document.getElementById('backResetFontButton');


// Back Card Images
const backCompanyLogoTopEl = document.getElementById('backCompanyLogoTop');
const backCompanyLogoLeftEl = document.getElementById('backCompanyLogoLeft');
// ... (all other back card image style inputs and buttons) ...
const backCompanyLogoWidthEl = document.getElementById('backCompanyLogoWidth');
const backCompanyLogoHeightEl = document.getElementById('backCompanyLogoHeight');
const backSignatureWidthEl = document.getElementById('backSignatureWidth');
const backSignatureHeightEl = document.getElementById('backSignatureHeight');
const backSignatureAlignEl = document.getElementById('backSignatureAlign');
const backStampWidthEl = document.getElementById('backStampWidth');
const backStampHeightEl = document.getElementById('backStampHeight');
const backStampAlignEl = document.getElementById('backStampAlign');
const backBarcodeWidthEl = document.getElementById('backBarcodeWidth');
const backBarcodeHeightEl = document.getElementById('backBarcodeHeight');
const backBarcodeAlignEl = document.getElementById('backBarcodeAlign');
const backApplyImageButtonEl = document.getElementById('backApplyImageButton');
const backResetImageButtonEl = document.getElementById('backResetImageButton');


// --- Utility Functions (largely unchanged) ---
function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

async function generateBarcode(element, text) {
    if (!element || !text) {
        // console.warn("Barcode generation skipped: Invalid element or text.");
        if (element) element.style.display = "none"; // Hide if can't generate
        return;
    }
    try {
        JsBarcode(element, text, {
            format: "CODE128",
            displayValue: false, // Typically false on ID cards for cleanliness
            lineColor: "#000000",
            width: 1.5, // Adjust for better clarity
            height: 30, // mm
            // font: "Arial", // Font options for displayValue if true
            // fontSize: 10,
            margin: 0 // No margin for tighter packing
        });
        element.style.display = "block";
    } catch (e) {
        console.error("JsBarcode error: ", e);
        element.style.display = "none";
    }
}


function handleImageUpload(inputElement, imageElement) {
    const file = inputElement.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            if (imageElement) imageElement.src = e.target.result;
            // NOTE: This is a local preview. To save this image to the server,
            // an AJAX call would be needed here to upload `file`.
            // For now, we assume primary images come from server, and this is for temporary override.
        }
        reader.readAsDataURL(file);
    }
}

function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) return true; // Optional field
    const phoneRegex = /^\+?\d{1,3}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/; // More flexible
    return phoneRegex.test(phoneNumber);
}

function validateEmail(email) {
    if (!email) return true; // Optional field
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateWebsiteURL(url) {
    if (!url) return true; // Optional field
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
}

function displayErrorMessage(element, message) { // Changed to accept element directly
    if (element && element.nextElementSibling && element.nextElementSibling.classList.contains('invalid-feedback')) {
        element.nextElementSibling.textContent = message;
        element.classList.add('is-invalid');
    } else if (element) { // Fallback if no dedicated error message element
        element.classList.add('is-invalid');
        // console.warn("No dedicated error element for:", element.id);
    }
}

function clearErrorMessage(element) { // Changed to accept element directly
     if (element && element.nextElementSibling && element.nextElementSibling.classList.contains('invalid-feedback')) {
        element.nextElementSibling.textContent = '';
        element.classList.remove('is-invalid');
    } else if (element) {
        element.classList.remove('is-invalid');
    }
}

function applyStyles(element, styles) {
    if (!element) return;
    for (const property in styles) {
        element.style[property] = styles[property];
    }
}

function applyImageBorderRadius(imageElement, borderRadius) {
    if (!imageElement) return;
    imageElement.style.borderRadius = borderRadius + "%";
}

// REMOVED: Local Storage Functions (saveDataToLocalStorage, loadDataFromLocalStorage)
// REMOVED: populateFormFields() that used localStorage. Will create a new one.
// REMOVED: saveFormDataToLocalStorage(). Card style settings are not persisted in this version.

// --- NEW: Function to populate form fields and card from server data ---
function initializeCardData(staff, company) {
    // Populate Company Info Inputs
    if (companyNameInputEl) companyNameInputEl.value = company.company_name || '';
    if (companySubtitleInputEl) companySubtitleInputEl.value = company.company_subtitle || '';
    if (companyPhoneInputEl) companyPhoneInputEl.value = company.company_phone || '';
    if (companyEmailInputEl) companyEmailInputEl.value = company.company_email || '';
    if (companyWebsiteInputEl) companyWebsiteInputEl.value = company.company_website || '';
    if (companyLocationInputEl) companyLocationInputEl.value = company.company_location || '';
    if (ceoNameInputEl) ceoNameInputEl.value = company.ceo_name || '';
    if (authorizationStatementEl) authorizationStatementEl.value = company.default_authorization_statement || '';

    // Populate Employee Info Inputs
    if (frontNameInputEl) frontNameInputEl.value = staff.full_name || '';
    if (backNameInputEl && backNameInputEl !== frontNameInputEl) backNameInputEl.value = staff.full_name || ''; // If separate field
    if (frontPositionInputEl) frontPositionInputEl.value = staff.position || '';
    if (backPositionInputEl && backPositionInputEl !== frontPositionInputEl) backPositionInputEl.value = staff.position || ''; // If separate
    if (employeePhoneInputEl) employeePhoneInputEl.value = staff.phone || '';
    if (employeeEmailInputEl) employeeEmailInputEl.value = staff.email || '';
    if (frontIdNumberInputEl) frontIdNumberInputEl.value = staff.employee_id_number || '';
    if (backIdNumberInputEl && backIdNumberInputEl !== frontIdNumberInputEl) backIdNumberInputEl.value = staff.employee_id_number || ''; // If separate

    if (backIssueDateInputEl) backIssueDateInputEl.value = staff.issue_date_formatted || ''; // Uses formatted date from server
    if (backExpiryDateInputEl) backExpiryDateInputEl.value = staff.expiry_date_formatted || '';

    // Set initial images on card preview (these are what idcard.js targets)
    if (companyLogoEl) companyLogoEl.src = company.logo_url;
    if (logoEl) logoEl.src = company.logo_url; // Back card logo
    if (employeePhotoEl) employeePhotoEl.src = staff.photo_url;
    if (signatureEl) signatureEl.src = company.signature_url;
    if (stampEl) stampEl.src = company.stamp_url;

    // Default border radius values (if elements exist)
    if (frontEmployeePhotoBorderRadiusEl) frontEmployeePhotoBorderRadiusEl.value = '50'; // Default to circle
    if (frontCompanyLogoBorderRadiusEl) frontCompanyLogoBorderRadiusEl.value = '0';
    if (backCompanyLogoBorderRadiusEl) backCompanyLogoBorderRadiusEl.value = '0';

    // Trigger initial generation/update of the card preview
    if (generateButtonEl) generateButtonEl.click();
    else updateCardPreview(); // Fallback if generate button has different ID or purpose
}


// --- Validation Event Listeners ---
// Modified to use direct element and better error display
if (companyPhoneInputEl) companyPhoneInputEl.addEventListener('input', function() {
    validatePhoneNumber(this.value) ? clearErrorMessage(this) : displayErrorMessage(this, 'Invalid phone. Use format like +1 123 456 7890.');
});
if (companyEmailInputEl) companyEmailInputEl.addEventListener('input', function() {
    validateEmail(this.value) ? clearErrorMessage(this) : displayErrorMessage(this, 'Invalid email format.');
});
if (companyWebsiteInputEl) companyWebsiteInputEl.addEventListener('input', function() {
    validateWebsiteURL(this.value) ? clearErrorMessage(this) : displayErrorMessage(this, 'Invalid URL. Must start with http(s)://.');
});
// Add similar robust listeners for other validated fields if needed.
// Example for required fields:
if (companyNameInputEl) companyNameInputEl.addEventListener('input', function() { this.value.trim() ? clearErrorMessage(this) : displayErrorMessage(this, 'Company name is required.'); });
if (ceoNameInputEl) ceoNameInputEl.addEventListener('input', function() { this.value.trim() ? clearErrorMessage(this) : displayErrorMessage(this, 'CEO name is required.'); });
if (frontNameInputEl) frontNameInputEl.addEventListener('input', function() { this.value.trim() ? clearErrorMessage(this) : displayErrorMessage(this, 'Employee name is required.'); });
if (frontPositionInputEl) frontPositionInputEl.addEventListener('input', function() { this.value.trim() ? clearErrorMessage(this) : displayErrorMessage(this, 'Position is required.'); });
if (frontIdNumberInputEl) frontIdNumberInputEl.addEventListener('input', function() { this.value.trim() ? clearErrorMessage(this) : displayErrorMessage(this, 'Employee ID is required.'); });
if (backIdNumberInputEl && backIdNumberInputEl !== frontIdNumberInputEl) backIdNumberInputEl.addEventListener('input', function() {
    if (!this.value.trim()) displayErrorMessage(this, 'Back ID number is required.');
    else if (frontIdNumberInputEl && this.value !== frontIdNumberInputEl.value) displayErrorMessage(this, 'Back ID must match Front ID.');
    else clearErrorMessage(this);
});
if (backIssueDateInputEl) backIssueDateInputEl.addEventListener('input', function() { this.value ? clearErrorMessage(this) : displayErrorMessage(this, 'Issue date is required.'); });
if (backExpiryDateInputEl) backExpiryDateInputEl.addEventListener('input', function() { this.value ? clearErrorMessage(this) : displayErrorMessage(this, 'Expiry date is required.'); });
if (authorizationStatementEl) authorizationStatementEl.addEventListener('input', function() { this.value.trim() ? clearErrorMessage(this) : displayErrorMessage(this, 'Auth. statement is required.'); });


// --- Image Upload Event Listeners (Local Preview) ---
if (companyLogoInputEl && companyLogoEl) companyLogoInputEl.addEventListener('change', function() { handleImageUpload(this, companyLogoEl); handleImageUpload(this, logoEl); }); // Update both front and back logos
if (ceoSignatureInputEl && signatureEl) ceoSignatureInputEl.addEventListener('change', function() { handleImageUpload(this, signatureEl); });
if (companyStampInputEl && stampEl) companyStampInputEl.addEventListener('change', function() { handleImageUpload(this, stampEl); });
if (frontPhotoInputEl && employeePhotoEl) frontPhotoInputEl.addEventListener('change', function() { handleImageUpload(this, employeePhotoEl); });

// --- Main Function to Update Card Preview ---
async function updateCardPreview() {
    // Validate all required fields before generating the ID card
    let isValid = true;
    const requiredTextInputs = [
        { el: companyNameInputEl, name: "Company Name" },
        { el: ceoNameInputEl, name: "CEO Name" },
        { el: frontNameInputEl, name: "Employee Name" },
        { el: frontPositionInputEl, name: "Position" },
        { el: frontIdNumberInputEl, name: "Employee ID" },
        { el: authorizationStatementEl, name: "Authorization Statement" }
    ];
    const requiredDateInputs = [
        { el: backIssueDateInputEl, name: "Issue Date" },
        { el: backExpiryDateInputEl, name: "Expiry Date" }
    ];

    requiredTextInputs.forEach(item => {
        if (item.el && !item.el.value.trim()) {
            displayErrorMessage(item.el, `${item.name} is required.`);
            isValid = false;
        } else if (item.el) {
            clearErrorMessage(item.el);
        }
    });
    requiredDateInputs.forEach(item => {
        if (item.el && !item.el.value) {
            displayErrorMessage(item.el, `${item.name} is required.`);
            isValid = false;
        } else if (item.el) {
            clearErrorMessage(item.el);
        }
    });

    // Specific validations
    if (companyPhoneInputEl && !validatePhoneNumber(companyPhoneInputEl.value)) { displayErrorMessage(companyPhoneInputEl, 'Invalid phone.'); isValid = false; } else if (companyPhoneInputEl) { clearErrorMessage(companyPhoneInputEl); }
    if (companyEmailInputEl && !validateEmail(companyEmailInputEl.value)) { displayErrorMessage(companyEmailInputEl, 'Invalid email.'); isValid = false; } else if (companyEmailInputEl) { clearErrorMessage(companyEmailInputEl); }
    if (companyWebsiteInputEl && !validateWebsiteURL(companyWebsiteInputEl.value)) { displayErrorMessage(companyWebsiteInputEl, 'Invalid URL.'); isValid = false; } else if (companyWebsiteInputEl) { clearErrorMessage(companyWebsiteInputEl); }

    if (backIdNumberInputEl && frontIdNumberInputEl && backIdNumberInputEl.value !== frontIdNumberInputEl.value) {
        displayErrorMessage(backIdNumberInputEl, 'Back ID must match Front ID.');
        isValid = false;
    } else if (backIdNumberInputEl) {
        clearErrorMessage(backIdNumberInputEl);
    }

    // If any field is invalid, stop.
    // if (!isValid) return; // Might be too aggressive, allow preview updates still

    // Update ID card elements with form data
    if (companyNameEl && companyNameInputEl) companyNameEl.textContent = companyNameInputEl.value;
    if (companySubtitleEl && companySubtitleInputEl) companySubtitleEl.textContent = companySubtitleInputEl.value;
    if (employeeNameEl && frontNameInputEl) employeeNameEl.textContent = frontNameInputEl.value;
    if (employeePositionEl && frontPositionInputEl) employeePositionEl.textContent = frontPositionInputEl.value;
    if (employeeIdEl && frontIdNumberInputEl) employeeIdEl.textContent = 'ID: ' + frontIdNumberInputEl.value;

    if (backNameEl && backNameInputEl) backNameEl.textContent = backNameInputEl.value;
    if (backPositionEl && backPositionInputEl) backPositionEl.textContent = backPositionInputEl.value;
    if (backIdEl && backIdNumberInputEl) backIdEl.textContent = 'ID: ' + backIdNumberInputEl.value;
    if (issueDateEl && backIssueDateInputEl) issueDateEl.textContent = 'Issued: ' + backIssueDateInputEl.value;
    if (expiryDateEl && backExpiryDateInputEl) expiryDateEl.textContent = 'Expires: ' + backExpiryDateInputEl.value;

    if (companyPhoneDisplayEl && companyPhoneInputEl) companyPhoneDisplayEl.textContent = 'Tel: ' + companyPhoneInputEl.value;
    if (companyEmailDisplayEl && companyEmailInputEl) companyEmailDisplayEl.textContent = 'Email: ' + companyEmailInputEl.value;
    if (companyWebsiteDisplayEl && companyWebsiteInputEl) companyWebsiteDisplayEl.textContent = 'Web: ' + companyWebsiteInputEl.value;
    if (companyLocationDisplayEl && companyLocationInputEl) companyLocationDisplayEl.textContent = companyLocationInputEl.value;
    if (authorizationDisplayEl && authorizationStatementEl) authorizationDisplayEl.textContent = authorizationStatementEl.value;
    if (ceoNameDisplayEl && ceoNameInputEl) ceoNameDisplayEl.textContent = ceoNameInputEl.value;
    if (companyNameDisplayEl && companyNameInputEl) companyNameDisplayEl.textContent = companyNameInputEl.value; // Back footer company name

    // Apply border radius to images
    if (frontEmployeePhotoBorderRadiusEl && employeePhotoEl) applyImageBorderRadius(employeePhotoEl, frontEmployeePhotoBorderRadiusEl.value);
    if (frontCompanyLogoBorderRadiusEl && companyLogoEl) applyImageBorderRadius(companyLogoEl, frontCompanyLogoBorderRadiusEl.value);
    if (backCompanyLogoBorderRadiusEl && logoEl) applyImageBorderRadius(logoEl, backCompanyLogoBorderRadiusEl.value);


    // Barcodes
    const idForBarcode = frontIdNumberInputEl ? frontIdNumberInputEl.value : null;
    await generateBarcode(frontBarcodeEl, idForBarcode);
    await generateBarcode(backBarcodeEl, idForBarcode); // Use same ID for back barcode

    // REMOVED: saveFormDataToLocalStorage(); // Data is not saved to localStorage anymore
}

// --- Button Event Listeners ---
if (generateButtonEl) generateButtonEl.addEventListener('click', updateCardPreview);

if (previewButtonEl) previewButtonEl.addEventListener('click', async function() {
    await updateCardPreview(); // Update with current form data

    if (!previewModalEl || !frontPreviewModalEl || !backPreviewModalEl) {
        console.error("Preview modal elements not found.");
        return;
    }
    // Apply border radius to images before getting HTML for modal
    if (frontEmployeePhotoBorderRadiusEl && employeePhotoEl) applyImageBorderRadius(employeePhotoEl, frontEmployeePhotoBorderRadiusEl.value);
    if (frontCompanyLogoBorderRadiusEl && companyLogoEl) applyImageBorderRadius(companyLogoEl, frontCompanyLogoBorderRadiusEl.value);
    if (backCompanyLogoBorderRadiusEl && logoEl) applyImageBorderRadius(logoEl, backCompanyLogoBorderRadiusEl.value);


    frontPreviewModalEl.innerHTML = frontIdCardEl ? frontIdCardEl.innerHTML : 'Front preview unavailable'; // Use innerHTML for content
    backPreviewModalEl.innerHTML = backIdCardEl ? backIdCardEl.innerHTML : 'Back preview unavailable';

    // Re-apply styles or ensure classes are copied if inline styles are not sufficient.
    // For simplicity, if styles are complex, consider cloning nodes with styles.
    // The current approach relies on CSS classes defined for .id-card-render-area and its children.

    previewModalEl.style.display = 'block';
});


if (exportPdfButtonEl) exportPdfButtonEl.addEventListener('click', async function() {
    await updateCardPreview();
    if (!frontIdCardEl || !backIdCardEl || typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        alert("Export PDF library not loaded or card elements missing.");
        return;
    }
     // Apply border radius before capture
    if (frontEmployeePhotoBorderRadiusEl && employeePhotoEl) applyImageBorderRadius(employeePhotoEl, frontEmployeePhotoBorderRadiusEl.value);
    if (frontCompanyLogoBorderRadiusEl && companyLogoEl) applyImageBorderRadius(companyLogoEl, frontCompanyLogoBorderRadiusEl.value);
    if (backCompanyLogoBorderRadiusEl && logoEl) applyImageBorderRadius(logoEl, backCompanyLogoBorderRadiusEl.value);

    try {
        await new Promise(resolve => setTimeout(resolve, 200)); // Ensure rendering
        const canvasFront = await html2canvas(frontIdCardEl, { scale: 2, useCORS: true });
        const frontDataURL = canvasFront.toDataURL('image/png');
        const canvasBack = await html2canvas(backIdCardEl, { scale: 2, useCORS: true });
        const backDataURL = canvasBack.toDataURL('image/png');

        const pdf = new jspdf.jsPDF({
            orientation: 'landscape', // CR80 is landscape
            unit: 'mm',
            format: [CARD_HEIGHT_MM, CARD_WIDTH_MM] // width, height for landscape; assuming original values were portrait
        });

        // If CR80 like dimensions (approx 85.6mm x 54mm)
        // const CR80_WIDTH = 85.6;
        // const CR80_HEIGHT = 53.98;
        // const pdf = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: [CR80_HEIGHT, CR80_WIDTH] });
        // pdf.addImage(frontDataURL, 'PNG', 0, 0, CR80_WIDTH, CR80_HEIGHT);
        // pdf.addPage([CR80_HEIGHT, CR80_WIDTH]);
        // pdf.addImage(backDataURL, 'PNG', 0, 0, CR80_WIDTH, CR80_HEIGHT);


        pdf.addImage(frontDataURL, 'PNG', 0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM); // Swapped for landscape
        pdf.addPage([CARD_HEIGHT_MM, CARD_WIDTH_MM]); // width, height
        pdf.addImage(backDataURL, 'PNG', 0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM); // Swapped

        pdf.save('avenircon-id-card.pdf');
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        alert('Error exporting PDF. Check console.');
    }
});

if (exportPngButtonEl) exportPngButtonEl.addEventListener('click', async function() {
    await updateCardPreview();
    if (!frontIdCardEl || !backIdCardEl || typeof html2canvas === 'undefined') {
        alert("Export PNG library not loaded or card elements missing.");
        return;
    }
    // Apply border radius before capture
    if (frontEmployeePhotoBorderRadiusEl && employeePhotoEl) applyImageBorderRadius(employeePhotoEl, frontEmployeePhotoBorderRadiusEl.value);
    if (frontCompanyLogoBorderRadiusEl && companyLogoEl) applyImageBorderRadius(companyLogoEl, frontCompanyLogoBorderRadiusEl.value);
    if (backCompanyLogoBorderRadiusEl && logoEl) applyImageBorderRadius(logoEl, backCompanyLogoBorderRadiusEl.value);

    try {
        await new Promise(resolve => setTimeout(resolve, 200));
        const canvasFront = await html2canvas(frontIdCardEl, { scale: 2, useCORS: true });
        const frontDataURL = canvasFront.toDataURL('image/png');
        const aFront = document.createElement('a');
        aFront.href = frontDataURL;
        aFront.download = 'avenircon-id-card-front.png';
        aFront.click();

        const canvasBack = await html2canvas(backIdCardEl, { scale: 2, useCORS: true });
        const backDataURL = canvasBack.toDataURL('image/png');
        const aBack = document.createElement('a');
        aBack.href = backDataURL;
        aBack.download = 'avenircon-id-card-back.png';
        aBack.click();
    } catch (error) {
        console.error('Error exporting to PNG:', error);
        alert('Error exporting PNG. Check console.');
    }
});

if (printButtonEl) printButtonEl.addEventListener('click', async function() {
    await updateCardPreview();
     // Apply border radius before print
    if (frontEmployeePhotoBorderRadiusEl && employeePhotoEl) applyImageBorderRadius(employeePhotoEl, frontEmployeePhotoBorderRadiusEl.value);
    if (frontCompanyLogoBorderRadiusEl && companyLogoEl) applyImageBorderRadius(companyLogoEl, frontCompanyLogoBorderRadiusEl.value);
    if (backCompanyLogoBorderRadiusEl && logoEl) applyImageBorderRadius(logoEl, backCompanyLogoBorderRadiusEl.value);

    if (!frontIdCardEl || !backIdCardEl) {
        alert("Card elements not found for printing.");
        return;
    }
    try {
        await new Promise(resolve => setTimeout(resolve, 200));
        const printWindow = window.open('', '_blank', 'height=700,width=1000');
        printWindow.document.write('<html><head><title>Print AvenirCon ID Card</title>');
        printWindow.document.write('<style>');
        printWindow.document.write(`
            @media print {
                @page { size: ${CARD_WIDTH_MM}mm ${CARD_HEIGHT_MM}mm; margin: 0mm; } /* Or landscape for CR80 */
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                .card-container { page-break-after: always; width: ${CARD_WIDTH_MM}mm; height: ${CARD_HEIGHT_MM}mm; overflow: hidden; display: flex; justify-content: center; align-items: center; }
                .id-card-render-area { 
                    border: 1px solid #ccc; /* For visual boundary if needed */
                    transform-origin: top left; 
                    /* Ensure the card content matches the preview */
                }
            }
            /* Styles for on-screen preview in the print window, if needed */
            body { display: flex; flex-direction: column; align-items: center; gap: 20px; font-family: Arial, sans-serif; }
            .card-container { border:1px dashed #999; padding: 5px; }
            h3 { text-align: center; }
        `);
        printWindow.document.write('</style></head><body>');
        printWindow.document.write('<h3>Front</h3><div class="card-container">');
        printWindow.document.write(frontIdCardEl.outerHTML); // Use outerHTML to include the container
        printWindow.document.write('</div>');
        printWindow.document.write('<h3>Back</h3><div class="card-container">');
        printWindow.document.write(backIdCardEl.outerHTML);
        printWindow.document.write('</div>');
        printWindow.document.write('<script>window.onload = function() { setTimeout(function(){ window.print(); window.onafterprint = function(){ window.close(); }; }, 500); };</script>');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
    } catch (error) {
        console.error('Error printing:', error);
        alert('Error preparing for print. Check console.');
    }
});

// --- Modal Display Logic ---
if (closeModalButtonEl && previewModalEl) closeModalButtonEl.addEventListener('click', function() {
    previewModalEl.style.display = 'none';
});
if (previewModalEl) window.addEventListener('click', function(event) {
    if (event.target == previewModalEl) {
        previewModalEl.style.display = 'none';
    }
});

// --- Style Settings Functions (Colors, Fonts, Images) ---
// These functions apply styles based on input fields to the card preview elements.
// They should work as before, but saveFormDataToLocalStorage() calls are removed.
// Front Card Colors
function applyFrontCardColors() {
    if(frontIdCardEl && frontIdCardBackgroundColorEl) applyStyles(frontIdCardEl, { backgroundColor: frontIdCardBackgroundColorEl.value });
    const frontHeaderSection = frontIdCardEl ? frontIdCardEl.querySelector('.header-section') : null; // Assuming class
    if(frontHeaderSection && frontHeaderBackgroundColorEl) applyStyles(frontHeaderSection, { backgroundColor: frontHeaderBackgroundColorEl.value });
    const frontHeaderH1 = frontHeaderSection ? frontHeaderSection.querySelector('h1') : null;
    if(frontHeaderH1 && frontHeaderFontColorEl) applyStyles(frontHeaderH1, { color: frontHeaderFontColorEl.value });
    if(employeePhotoEl && frontEmployeePhotoBorderColorEl && frontEmployeePhotoBackgroundColorEl) applyStyles(employeePhotoEl, { borderColor: frontEmployeePhotoBorderColorEl.value, backgroundColor: frontEmployeePhotoBackgroundColorEl.value });
    // ... (continue for all specific selectors if they exist, ensure robust null checks) ...
    // REMOVED: saveFormDataToLocalStorage();
}
function resetFrontCardColors() {
    if (frontIdCardBackgroundColorEl) frontIdCardBackgroundColorEl.value = '#FFFFFF';
    if (frontHeaderBackgroundColorEl) frontHeaderBackgroundColorEl.value = '#FF4900';
    // ... (reset all color inputs to defaults) ...
    applyFrontCardColors();
    // REMOVED: saveFormDataToLocalStorage();
}
if (frontApplyColorsButtonEl) frontApplyColorsButtonEl.addEventListener('click', applyFrontCardColors);
if (frontResetColorsButtonEl) frontResetColorsButtonEl.addEventListener('click', resetFrontCardColors);

// Front Card Fonts
function applyFrontCardFonts() {
    const frontHeaderH1 = frontIdCardEl ? frontIdCardEl.querySelector('.header-section h1') : null;
    if (frontHeaderH1 && frontHeaderFontSizeEl && frontHeaderFontWeightEl && frontHeaderTextAlignEl) applyStyles(frontHeaderH1, { fontSize: frontHeaderFontSizeEl.value + 'mm', fontWeight: frontHeaderFontWeightEl.value, textAlign: frontHeaderTextAlignEl.value });
    if (employeeNameEl && frontEmployeeNameFontSizeEl && frontEmployeeNameFontWeightEl && frontEmployeeNameTextAlignEl && frontEmployeeNameTopEl && frontEmployeeNameLeftEl) applyStyles(employeeNameEl, { fontSize: frontEmployeeNameFontSizeEl.value + 'mm', fontWeight: frontEmployeeNameFontWeightEl.value, textAlign: frontEmployeeNameTextAlignEl.value, position: 'absolute', top: frontEmployeeNameTopEl.value + 'mm', left: frontEmployeeNameLeftEl.value + 'mm' });
    // ... (continue for all font style applications) ...
    // REMOVED: saveFormDataToLocalStorage();
}
function resetFrontCardFonts() { /* Reset all font inputs to defaults */ applyFrontCardFonts(); /* REMOVED: save... */ }
if (frontApplyFontButtonEl) frontApplyFontButtonEl.addEventListener('click', applyFrontCardFonts);
if (frontResetFontButtonEl) frontResetFontButtonEl.addEventListener('click', resetFrontCardFonts);

// Front Card Images
function applyFrontCardImageSettings() {
    if(companyLogoEl && frontCompanyLogoWidthEl && frontCompanyLogoHeightEl && frontCompanyLogoAlignEl && frontCompanyLogoTopEl && frontCompanyLogoLeftEl) applyStyles(companyLogoEl, { width: frontCompanyLogoWidthEl.value + 'mm', height: frontCompanyLogoHeightEl.value + 'mm', alignSelf: frontCompanyLogoAlignEl.value, position: 'absolute', top: frontCompanyLogoTopEl.value + 'mm', left: frontCompanyLogoLeftEl.value + 'mm' });
    if(employeePhotoEl && frontEmployeePhotoWidthEl && frontEmployeePhotoHeightEl && frontEmployeePhotoAlignEl && frontEmployeePhotoTopEl && frontEmployeePhotoLeftEl) applyStyles(employeePhotoEl, { width: frontEmployeePhotoWidthEl.value + 'mm', height: frontEmployeePhotoHeightEl.value + 'mm', alignSelf: frontEmployeePhotoAlignEl.value, position: 'absolute', top: frontEmployeePhotoTopEl.value + 'mm', left: frontEmployeePhotoLeftEl.value + 'mm' });
    if (frontEmployeePhotoBorderRadiusEl && employeePhotoEl) applyImageBorderRadius(employeePhotoEl, frontEmployeePhotoBorderRadiusEl.value);
    if (frontCompanyLogoBorderRadiusEl && companyLogoEl) applyImageBorderRadius(companyLogoEl, frontCompanyLogoBorderRadiusEl.value);
    const idForBarcode = frontIdNumberInputEl ? frontIdNumberInputEl.value : null;
    generateBarcode(frontBarcodeEl, idForBarcode);
    const frontBarcodeParent = frontBarcodeEl ? frontBarcodeEl.parentNode : null;
    if(frontBarcodeParent && frontBarcodeAlignEl) applyStyles(frontBarcodeParent, { alignItems: frontBarcodeAlignEl.value === 'center' ? 'center' : (frontBarcodeAlignEl.value === 'left' ? 'flex-start' : 'flex-end') });
    // REMOVED: saveFormDataToLocalStorage();
}
function resetFrontCardImageSettings() { /* Reset all image style inputs */ applyFrontCardImageSettings(); /* REMOVED: save... */ }
if (frontApplyImageButtonEl) frontApplyImageButtonEl.addEventListener('click', applyFrontCardImageSettings);
if (frontResetImageButtonEl) frontResetImageButtonEl.addEventListener('click', resetFrontCardImageSettings);

// Back Card Colors, Fonts, Images - Similar structure to front card style functions
// (Implement applyBackCardColors, resetBackCardColors, etc., removing localStorage calls)
function applyBackCardColors() { /* Apply back card color styles */ /* REMOVED: save... */ }
function resetBackCardColors() { /* Reset back card color inputs */ applyBackCardColors(); /* REMOVED: save... */ }
if (backApplyColorsButtonEl) backApplyColorsButtonEl.addEventListener('click', applyBackCardColors);
if (backResetColorsButtonEl) backResetColorsButtonEl.addEventListener('click', resetBackCardColors);

function applyBackCardFonts() { /* Apply back card font styles */ /* REMOVED: save... */ }
function resetBackCardFonts() { /* Reset back card font inputs */ applyBackCardFonts(); /* REMOVED: save... */ }
if (backApplyFontButtonEl) backApplyFontButtonEl.addEventListener('click', applyBackCardFonts);
if (backResetFontButtonEl) backResetFontButtonEl.addEventListener('click', resetBackCardFonts);

function applyBackCardImageSettings() {
    if (logoEl && backCompanyLogoBorderRadiusEl) applyImageBorderRadius(logoEl, backCompanyLogoBorderRadiusEl.value);
    const idForBarcode = backIdNumberInputEl ? backIdNumberInputEl.value : (frontIdNumberInputEl ? frontIdNumberInputEl.value : null);
    generateBarcode(backBarcodeEl, idForBarcode);
    // ... other back image settings
    /* REMOVED: save... */
}
function resetBackCardImageSettings() { /* Reset back card image inputs */ applyBackCardImageSettings(); /* REMOVED: save... */ }
if (backApplyImageButtonEl) backApplyImageButtonEl.addEventListener('click', applyBackCardImageSettings);
if (backResetImageButtonEl) backResetImageButtonEl.addEventListener('click', resetBackCardImageSettings);


// REMOVED: Staff Management Functions (renderStaffTable, createStaff, saveStaff, editStaff, deleteStaff)
// REMOVED: Event listeners for staff management buttons

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if initialStaffData and initialCompanySettings are provided by the server
    if (typeof initialStaffData !== 'undefined' && typeof initialCompanySettings !== 'undefined') {
        initializeCardData(initialStaffData, initialCompanySettings);
    } else {
        console.warn('Initial staff or company data not found. Card may not populate correctly.');
        // Optionally, initialize with some defaults or leave blank
        updateCardPreview(); // Attempt to render with whatever is in the form
    }

    // Apply initial styles from default values in input fields (if any)
    // Or, if you store default styles somewhere, apply them here.
    // For now, it relies on CSS defaults + what initializeCardData sets via updateCardPreview.
    applyFrontCardColors();
    applyFrontCardFonts();
    applyFrontCardImageSettings();
    applyBackCardColors();
    applyBackCardFonts();
    applyBackCardImageSettings();

});

*/