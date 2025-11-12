// controllers/reportingController.js
const db = require('../config/db');
const dateFns = require('date-fns'); // For date formatting
//const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs-extra');
const path = require('path');
const ExcelJS = require('exceljs');
const { createObjectCsvWriter } = require('csv-writer');
// controllers/reportingController.js
const budgetController = require('./budgetController'); // For project financial summary

/*
async function getProjectReportData(projectId, req) {
    // 1. Fetch full project details including creator/manager and financial fields
    const [projectRows] = await db.query(
        `SELECT p.*, 
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as formatted_start_date,
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as formatted_end_date,
                creator.username as creator_username, 
                manager.username as project_manager_username 
         FROM projects p
         LEFT JOIN users creator ON p.created_by_id = creator.id
         LEFT JOIN users manager ON p.project_manager_id = manager.id
         WHERE p.id = ?`,
        [projectId]
    );

    if (projectRows.length === 0) {
        return null; // Project not found
    }
    const project = projectRows[0];

    // 2. Fetch all tasks for the project, include assignee name, parent task info, and financial fields
    const [tasks] = await db.query(
      `SELECT t.*, 
              DATE_FORMAT(t.start_date, '%Y-%m-%d') as formatted_start_date,
              DATE_FORMAT(t.end_date, '%Y-%m-%d') as formatted_end_date,
              assignee.username as assignee_username,
              assignee.first_name as assignee_first_name,
              assignee.last_name as assignee_last_name,
              parent.name as parent_task_name,
              parent.task_code as parent_task_code
       FROM tasks t
       LEFT JOIN users assignee ON t.assigned_to_id = assignee.id
       LEFT JOIN tasks parent ON t.parent_task_id = parent.id
       WHERE t.project_id = ?
               ORDER BY t.parent_task_id ASC, t.task_order ASC, t.start_date ASC, t.name ASC`, // Hierarchical/logical order
      [projectId]
    );

    let totalTasks = tasks.length;
    let completedTasksCount = 0;
    let sumOfProgress = 0;
    let overdueTasksCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalTaskPlannedBudget = 0;
    let totalTaskActualCost = 0;

    tasks.forEach(task => {
        task.assignee_display_name = [task.assignee_first_name, task.assignee_last_name].filter(Boolean).join(' ') || task.assignee_username || 'Unassigned';
        
        if (task.status === 'Completed' || task.progress_percentage === 100) {
            completedTasksCount++;
        }
        sumOfProgress += (task.progress_percentage || 0);
        
        if (task.end_date && new Date(task.formatted_end_date || task.end_date) < today && task.status !== 'Completed' && task.progress_percentage !== 100) {
            overdueTasksCount++;
        }

        // For Task Financial Details table
        task.task_budget_num = parseFloat(task.task_budget) || 0;
        task.actual_cost_num = parseFloat(task.actual_cost) || 0; // Assumes tasks table has actual_cost
        totalTaskPlannedBudget += task.task_budget_num;
        totalTaskActualCost += task.actual_cost_num;
    });

    const overallProgress = totalTasks > 0 ? Math.round(sumOfProgress / totalTasks) : 0;

    // Financial Summary
    const projectPlannedBudget = parseFloat(project.budget) || 0; // From projects table
    const projectActualCost = parseFloat(project.actual_cost) || 0;     // From projects table (updated by budget logs)
    const projectVariance = projectPlannedBudget - projectActualCost;

    return {
        project: { // Main project data for overview
            ...project, // Spread existing project data
            // Ensure formatted dates are used if original dates are also present
            start_date_formatted: project.formatted_start_date || (project.start_date ? dateFns.format(new Date(project.start_date), 'yyyy-MM-dd') : 'N/A'),
            end_date_formatted: project.formatted_end_date || (project.end_date ? dateFns.format(new Date(project.end_date), 'yyyy-MM-dd') : 'N/A'),
        },
        tasks: tasks, // Full task list with added display properties
        overallStats: {
            totalTasks,
            completedTasksCount,
            overdueTasksCount,
            overallProgress
        },
        financialSummary: {
            projectPlannedBudget,
            projectActualCost,
            projectVariance,
            totalTaskPlannedBudget,
            totalTaskActualCost,
            totalTaskVariance: totalTaskPlannedBudget - totalTaskActualCost
        },
        reportGeneratedDate: dateFns.format(new Date(), 'MMMM d, yyyy, h:mm a'),
        baseUrl: `${req.protocol}://${req.get('host')}` // For PDF assets
    };
}
*/

async function getProjectReportData(projectId, req) {
    // 1. Fetch full project details including creator/manager and financial fields
    // Ensure 'budget' (for planned) and 'actual_cost' (for project-level actual) are selected.
    const [projectRows] = await db.query(
        `SELECT p.*, 
                p.budget as project_planned_budget,       -- Alias for clarity if needed, or just use p.budget
                p.actual_cost as project_direct_actual_cost, -- Alias for project-level actual cost
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as formatted_start_date,
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as formatted_end_date,
                creator.username as creator_username, 
                manager.username as project_manager_username 
         FROM projects p
         LEFT JOIN users creator ON p.created_by_id = creator.id
         LEFT JOIN users manager ON p.project_manager_id = manager.id
         WHERE p.id = ?`,
        [projectId]
    );

    if (projectRows.length === 0) {
        return null; // Project not found
    }
    const project = projectRows[0];

    // 2. Fetch all tasks for the project.
    // Ensure 'task_budget' (for planned) and 'actual_cost' (for task-level actual) are selected.
    const [tasks] = await db.query(
      `SELECT t.*, 
              t.task_budget as task_planned_budget,    -- Alias for clarity
              t.actual_cost as task_actual_cost_val,  -- Alias for task-level actual cost
              DATE_FORMAT(t.start_date, '%Y-%m-%d') as formatted_start_date,
              DATE_FORMAT(t.end_date, '%Y-%m-%d') as formatted_end_date,
              assignee.username as assignee_username,
              assignee.first_name as assignee_first_name,
              assignee.last_name as assignee_last_name,
              parent.name as parent_task_name,
              parent.task_code as parent_task_code
       FROM tasks t
       LEFT JOIN users assignee ON t.assigned_to_id = assignee.id
       LEFT JOIN tasks parent ON t.parent_task_id = parent.id
       WHERE t.project_id = ?
       ORDER BY COALESCE(t.parent_task_id, t.id), t.task_order ASC, t.start_date ASC, t.name ASC`, // Hierarchical/logical order
      [projectId]
    );

    let totalTasks = tasks.length;
    let completedTasksCount = 0;
    let sumOfProgress = 0;
    let overdueTasksCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalTaskPlannedBudget = 0;
    let totalTaskActualCost = 0;

    for (const task of tasks) { // Changed to for...of for potential async operations inside if needed later
        task.assignee_display_name = [task.assignee_first_name, task.assignee_last_name].filter(Boolean).join(' ') || task.assignee_username || 'Unassigned';
        
        if (task.status === 'Completed' || task.progress_percentage === 100) {
            completedTasksCount++;
        }
        sumOfProgress += (task.progress_percentage || 0);
        
        if (task.end_date && new Date(task.formatted_end_date || task.end_date) < today && task.status !== 'Completed' && task.progress_percentage !== 100) {
            overdueTasksCount++;
        }

        // For Task Financial Details table
        // Use the aliased names or direct field names if no alias used
        task.task_budget_num = parseFloat(task.task_planned_budget || task.task_budget) || 0;
        task.actual_cost_num = parseFloat(task.task_actual_cost_val || task.actual_cost) || 0; 
        
        totalTaskPlannedBudget += task.task_budget_num;
        totalTaskActualCost += task.actual_cost_num;
    }

    const overallProgress = totalTasks > 0 ? Math.round(sumOfProgress / totalTasks) : 0;

    // Financial Summary
    // Use the aliased names or direct field names from the 'project' object
    const projectPlannedBudget = parseFloat(project.project_planned_budget || project.budget) || 0;
    const projectActualCost = parseFloat(project.project_direct_actual_cost || project.actual_cost) || 0; // This is actual_cost DIRECTLY on the project table
    const projectVariance = projectPlannedBudget - projectActualCost;

    // Optional: If you want "Total Project Actual Cost" to also include rolled-up task actual costs
    // This is usually not how "Project Actual Cost" (direct) vs "Aggregated Task Actual Cost" is shown.
    // Keep them separate as your EJS does.
    // let aggregatedProjectActualCost = projectActualCost + totalTaskActualCost; // If needed for a different metric

    return {
        project: { 
            ...project, 
            start_date_formatted: project.formatted_start_date || (project.start_date ? dateFns.format(new Date(project.start_date), 'yyyy-MM-dd') : 'N/A'),
            end_date_formatted: project.formatted_end_date || (project.end_date ? dateFns.format(new Date(project.end_date), 'yyyy-MM-dd') : 'N/A'),
        },
        tasks: tasks, 
        overallStats: {
            totalTasks,
            completedTasksCount,
            overdueTasksCount,
            overallProgress
        },
        financialSummary: {
            projectPlannedBudget,    // From projects.budget
            projectActualCost,       // From projects.actual_cost (direct project expenses)
            projectVariance,
            totalTaskPlannedBudget,  // Sum of tasks.task_budget
            totalTaskActualCost,     // Sum of tasks.actual_cost
            totalTaskVariance: totalTaskPlannedBudget - totalTaskActualCost
        },
        reportGeneratedDate: dateFns.format(new Date(), 'MMMM d, yyyy, h:mm a'),
        baseUrl: `${req.protocol}://${req.get('host')}`
    };
}

// ... rest of your controller (showProjectReport, downloadPDF, downloadExcel, downloadCSV) ...
// These functions use getProjectReportData, so they will benefit from any changes made there.


exports.showProjectReport = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    // req.projectContext is available from checkProjectAccess middleware
    // but we re-fetch project details in getProjectReportData for freshness

    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {
            req.flash('error_msg', 'Project not found or report data could not be generated.');
            return res.redirect('/dashboard');
        }

        res.render('projects/report', {
            title: `Report - ${reportData.project.name}`,
            pageTitle: `Project Status Report: ${reportData.project.name}`,
            project: reportData.project, // Pass project separately for convenience if EJS uses it directly
            reportData: reportData,
            currentUser: req.session.user,
            layout: './layouts/main_layout',
            projectId: projectId, // For download links
             // Helper for EJS if needed, though dateFns is better handled in controller
            formatDate: (dateString) => dateString ? dateFns.format(new Date(dateString), 'MMM d, yyyy') : 'N/A',
            breadcrumbs: [  
                 { name: 'Dashboard', url: '/dashboard' },
                { name: 'Projects', url: '/projects' },
                { name: reportData.project.name, url: `/projects/${projectId}/details` },
                { name: 'Report', url: '', active: true }
             ]
        });
               

    } catch (error) {
        console.error(`Error generating report for project ${projectId}:`, error);
        req.flash('error_msg', 'Could not generate project report. ' + error.message);
        res.redirect(req.projectContext ? `/projects/${req.projectContext.id}/details` : '/dashboard');
    }
};

exports.downloadProjectReportPDF = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {
            req.flash('error_msg', 'Project not found for PDF report.');
            return res.redirect(`/projects/${projectId}/details`); // Or dashboard
        }

        const templatePath = path.join(__dirname, '..', 'views', 'projects', 'report_pdf_template.ejs');
        const htmlContent = await ejs.renderFile(templatePath, {
            reportData,
            // Pass dateFns for use in PDF template if needed
            dateFns: dateFns,
            // Helper for PDF template (can be more complex)
            formatDateForPDF: (dateString) => dateString ? dateFns.format(new Date(dateString), 'yyyy-MM-dd') : 'N/A',
        });

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        /*
        // Path to your installed Chrome/Chromium.
        // This could be a standard Chrome installation or the one Puppeteer cached.
        const executablePath = "C:\\Users\\Shemsedin\\.cache\\puppeteer\\chrome-headless-shell\\win64-136.0.7103.94\\chrome-headless-shell.exe";
        // OR if you have Google Chrome installed normally:
        // const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        // OR for Microsoft Edge (Chromium-based):
        // const executablePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
        // YOU MUST VERIFY THE CORRECT PATH ON YOUR SYSTEM.
        const browser = await puppeteer.launch({
            executablePath: executablePath, // Provide the path
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        // ... (rest of your PDF generation logic) ...
    } catch (error) {
        // ... your error handling ...
    }
};
Recommendation:
First, ensure const puppeteer = require('puppeteer'); is at the top of reportingController.js. This might fix the "not defined" error if Puppeteer did manage to install some version.
If that doesn't work, try Option C using the cached Chromium first, as the download part seemed to have occurred. Set the environment variables and try npm install puppeteer again. If installation succeeds (even if it just says "already up-to-date" or similar without errors), then test your PDF download. If it still says "puppeteer is not defined", then the module itself isn't being found by Node.js (check node_modules folder).
If Option C's npm install still fails or PDF generation still fails, try Option D (puppeteer-core). This gives you more explicit control over the browser used. Remember to update the require statement to puppeteer-core.

   
        */
        const page = await browser.newPage();
        // Increased timeout for complex pages or slow CSS loading
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '25mm', right: '15mm', bottom: '25mm', left: '15mm' },
            // Example: Add header/footer
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size:9px; width:100%; text-align:center; padding:0 15mm;">
                    Project Report: ${reportData.project.name.replace(/</g, '<')}
                </div>`,
            footerTemplate: `
                <div style="font-size:9px; width:100%; text-align:center; padding:0 15mm;">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span> - Generated: ${reportData.reportGeneratedDate}
                </div>`,
        });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Project_Report_${reportData.project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${projectId}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF report:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Could not generate PDF report: ' + error.message);
            res.redirect(`/projects/${projectId}/report`);
        } else {
            // If headers are sent, we can't redirect. Just log.
            console.error("Headers already sent, couldn't redirect for PDF error.");
        }
    }
};


exports.downloadProjectReportExcel = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) { 
            req.flash('error_msg', 'Project data not found for CSV report.');
            return res.redirect(`/projects/${projectId}/details`);}

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Avenircon App';
        workbook.created = new Date();
        workbook.lastModifiedBy = 'Avenircon App';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.company = 'Avenircon'; // Optional
         
        

        // --- Summary Sheet ---
        const summarySheet = workbook.addWorksheet('Project Summary');
        // Define columns for better control
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 35 },
            { header: 'Value', key: 'value', width: 40 }
        ];
        // Add rows using an array of objects
        summarySheet.addRows([
            { metric: 'Project Name', value: reportData.project.name },
            { metric: 'Project Code', value: reportData.project.project_code || 'N/A' },
            { metric: 'Status', value: reportData.project.status },
            { metric: 'Start Date', value: reportData.project.start_date_formatted },
            { metric: 'End Date', value: reportData.project.end_date_formatted },
            { metric: 'Project Manager', value: reportData.project.project_manager_username || 'N/A' },
            { metric: 'Report Generated', value: reportData.reportGeneratedDate },
            {}, // Blank row
            { metric: 'Overall Progress', value: `${reportData.overallStats.overallProgress}%` },
            { metric: 'Total Tasks', value: reportData.overallStats.totalTasks },
            { metric: 'Completed Tasks', value: reportData.overallStats.completedTasksCount },
            { metric: 'Overdue Tasks', value: reportData.overallStats.overdueTasksCount },
            {}, // Blank row
            { metric: 'Project Planned Budget', value: reportData.financialSummary.projectPlannedBudget, style: { numFmt: '$#,##0.00' } },
            { metric: 'Project Actual Cost', value: reportData.financialSummary.projectActualCost, style: { numFmt: '$#,##0.00' } },
            { metric: 'Project Variance', value: reportData.financialSummary.projectVariance, style: { numFmt: '$#,##0.00' } },
            {},
            { metric: 'Total Task Planned Budget', value: reportData.financialSummary.totalTaskPlannedBudget, style: { numFmt: '$#,##0.00' } },
            { metric: 'Total Task Actual Cost', value: reportData.financialSummary.totalTaskActualCost, style: { numFmt: '$#,##0.00' } },
            { metric: 'Total Task Variance', value: reportData.financialSummary.totalTaskVariance, style: { numFmt: '$#,##0.00' } },
        ]);
        // Style header row
        summarySheet.getRow(1).font = { bold: true };


        // --- Task Details Sheet ---
        const tasksSheet = workbook.addWorksheet('Task Details');
        tasksSheet.columns = [
            { header: 'Code', key: 'task_code', width: 15 },
            { header: 'Task Name', key: 'name', width: 45 },
            { header: 'Parent Task', key: 'parent_task_name', width: 30 },
            { header: 'Assignee', key: 'assignee_display_name', width: 25 },
            { header: 'Start Date', key: 'formatted_start_date', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'End Date', key: 'formatted_end_date', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Progress %', key: 'progress_percentage', width: 12, style: { numFmt: '0"%"' } },
            { header: 'Task Planned Budget', key: 'task_budget_num', width: 20, style: { numFmt: '$#,##0.00' } },
            { header: 'Task Actual Cost', key: 'actual_cost_num', width: 20, style: { numFmt: '$#,##0.00' } },
        ];
        reportData.tasks.forEach(task => {
            tasksSheet.addRow({
                ...task, // Spread task properties
                // Ensure dates are actual Date objects for Excel to format correctly
                formatted_start_date: task.start_date ? new Date(task.start_date) : null,
                formatted_end_date: task.end_date ? new Date(task.end_date) : null,
            });
        });
        tasksSheet.getRow(1).font = { bold: true };


        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Project_Report_${reportData.project.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating Excel report:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Could not generate Excel report. ' + error.message);
            res.redirect(`/projects/${projectId}/report`);
        }
    }
};

exports.downloadProjectReportCSV = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {  
            req.flash('error_msg', 'Project data not found for CSV report.');
             return res.redirect(`/projects/${projectId}/details`);}

         const tempDir = path.join(__dirname, '..', 'public', 'temp');
        await fs.ensureDir(tempDir);
        const sanitizedProjectName = reportData.project.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Project_Tasks_${sanitizedProjectName}_${projectId}.csv`;
        const filePath = path.join(tempDir, filename);

        const csvWriterInstance = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: 'task_code', title: 'Task Code' },
                { id: 'name', title: 'Task Name' },
                { id: 'parent_task_name', title: 'Parent Task' },
                { id: 'assignee_display_name', title: 'Assignee' },
                { id: 'formatted_start_date', title: 'Start Date' },
                { id: 'formatted_end_date', title: 'End Date' },
                { id: 'status', title: 'Status' },
                { id: 'progress_percentage', title: 'Progress (%)' },
                { id: 'task_budget_num', title: 'Planned Budget' },
                { id: 'actual_cost_num', title: 'Actual Cost' },
            ]
        });

        const records = reportData.tasks.map(task => ({
            ...task, // Spread task for all properties
            // Dates are already formatted strings from getProjectReportData
        }));

        await csvWriterInstance.writeRecords(records);

        res.download(filePath, filename, async (err) => {
            if (err) {
                console.error("Error sending CSV file:", err);
                // If headers not sent, can still flash/redirect
                if (!res.headersSent) {
                    req.flash('error_msg', 'Error sending CSV file.');
                    res.redirect(`/projects/${projectId}/report`);
                }
            }
            await fs.unlink(filePath); // Delete temp file
        });

    } catch (error) {
        console.error('Error generating CSV report:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Could not generate CSV report. ' + error.message);
            res.redirect(`/projects/${projectId}/report`);
        }
    }
};




/*

// controllers/reportingController.js
const db = require('../config/db');
const dateFns = require('date-fns');

async function getProjectReportData(projectId, req) {
    // 1. Fetch Full Project Details
    const [projectRows] = await db.query(
        `SELECT p.*, 
                DATE_FORMAT(p.start_date, '%Y-%m-%d') as formatted_start_date_db,
                DATE_FORMAT(p.end_date, '%Y-%m-%d') as formatted_end_date_db,
                creator.username as creator_username, 
                creator.first_name as creator_first_name,
                creator.last_name as creator_last_name,
                manager.username as project_manager_username,
                manager.first_name as project_manager_first_name,
                manager.last_name as project_manager_last_name
         FROM projects p
         LEFT JOIN users creator ON p.created_by_id = creator.id
         LEFT JOIN users manager ON p.project_manager_id = manager.id
         WHERE p.id = ?`,
        [projectId]
    );

    if (projectRows.length === 0) {
        console.warn(`Report generation failed: Project with ID ${projectId} not found.`);
        return null;
    }
    const project = projectRows[0];

    // 2. Fetch All Tasks for the Project
    const [tasks] = await db.query(
      `SELECT t.*, 
              DATE_FORMAT(t.start_date, '%Y-%m-%d') as formatted_start_date_db,
              DATE_FORMAT(t.end_date, '%Y-%m-%d') as formatted_end_date_db,
              assignee.username as assignee_username,
              assignee.first_name as assignee_first_name,
              assignee.last_name as assignee_last_name,
              parent.name as parent_task_name,
              parent.task_code as parent_task_code,
              parent.id as parent_task_actual_id 
              /* parent.task_order as parent_task_order -- if needed for complex sorting beyond COALESCE *//*
       FROM tasks t
       LEFT JOIN users assignee ON t.assigned_to_id = assignee.id
       LEFT JOIN tasks parent ON t.parent_task_id = parent.id
       WHERE t.project_id = ?
       ORDER BY 
           COALESCE(parent.task_order, t.id), /* Group children under parent visually if parent_task_id is reliable *//*
           t.parent_task_id ASC NULLS FIRST,  /* Ensure parents come before children *//*
           t.task_order ASC,                  /* Then by explicit task order *//*
           t.created_at ASC,                  /* Fallback to creation date *//*
           t.name ASC                         /* Final fallback *//*`,
      [projectId]
    );

    // 3. Process Task Data & Calculate Overall Statistics
    const totalTasks = tasks.length;
    let completedTasksCount = 0;
    let sumOfProgress = 0;
    let overdueTasksCount = 0;
    const today = new Date(); // For overdue check
    today.setHours(0, 0, 0, 0); // Normalize today to start of day

    let aggregatedTaskPlannedBudget = 0;
    let aggregatedTaskActualCost = 0;

    const processedTasks = tasks.map(task => {
        const assigneeDisplayName = [task.assignee_first_name, task.assignee_last_name].filter(Boolean).join(' ') || task.assignee_username || 'Unassigned';
        
        const isCompleted = task.status === 'Completed' || (task.progress_percentage || 0) === 100;
        if (isCompleted) {
            completedTasksCount++;
        }
        sumOfProgress += (task.progress_percentage || 0);
        
        const taskEndDate = task.end_date ? new Date(task.formatted_end_date_db || task.end_date) : null;
        if (taskEndDate && taskEndDate < today && !isCompleted) {
            overdueTasksCount++;
        }

        // Financials for each task
        const taskPlannedBudget = parseFloat(task.task_budget) || 0;
        const taskActualCost = parseFloat(task.actual_cost) || 0; // Assumes tasks table has actual_cost
        aggregatedTaskPlannedBudget += taskPlannedBudget;
        aggregatedTaskActualCost += taskActualCost;

        return {
            ...task, // Spread all original task fields
            assignee_display_name: assigneeDisplayName,
            // Use formatted dates for display, but keep original Date objects if needed by ExcelJS
            start_date_obj: task.start_date ? new Date(task.start_date) : null,
            end_date_obj: task.end_date ? new Date(task.end_date) : null,
            formatted_start_date_display: task.start_date ? dateFns.format(new Date(task.start_date), 'MMM d, yyyy') : 'N/A',
            formatted_end_date_display: task.end_date ? dateFns.format(new Date(task.end_date), 'MMM d, yyyy') : 'N/A',
            task_budget_num: taskPlannedBudget,
            actual_cost_num: taskActualCost,
            task_variance: taskPlannedBudget - taskActualCost
        };
    });

    const overallProgress = totalTasks > 0 ? Math.round(sumOfProgress / totalTasks) : 0;

    // 4. Prepare Financial Summary
    const projectPlannedBudget = parseFloat(project.planned_budget) || 0;
    const projectActualCost = parseFloat(project.actual_cost) || 0; // This should be updated by budgetController
    const projectVariance = projectPlannedBudget - projectActualCost;

    const financialSummary = {
        projectPlannedBudget: projectPlannedBudget,
        projectActualCost: projectActualCost,
        projectVariance: projectVariance,
        totalTaskPlannedBudget: aggregatedTaskPlannedBudget,
        totalTaskActualCost: aggregatedTaskActualCost,
        totalTaskVariance: aggregatedTaskPlannedBudget - aggregatedTaskActualCost
    };

    // 5. Prepare Final Report Data Object
    const reportData = {
        project: {
            id: project.id,
            name: project.name,
            project_code: project.project_code || 'N/A',
            client_name: project.client_name || 'N/A',
            description: project.description || 'N/A',
            status: project.status || 'N/A',
            start_date_formatted: project.start_date ? dateFns.format(new Date(project.start_date), 'MMMM d, yyyy') : 'N/A',
            end_date_formatted: project.end_date ? dateFns.format(new Date(project.end_date), 'MMMM d, yyyy') : 'N/A',
            project_manager_display_name: [project.project_manager_first_name, project.project_manager_last_name].filter(Boolean).join(' ') || project.project_manager_username || 'N/A',
            creator_display_name: [project.creator_first_name, project.creator_last_name].filter(Boolean).join(' ') || project.creator_username || 'N/A',
            // Pass raw budget numbers for EJS to format if needed, already in financialSummary too
            planned_budget_raw: project.planned_budget, 
            actual_cost_raw: project.actual_cost
        },
        tasks: processedTasks,
        overallStats: {
            totalTasks,
            completedTasksCount,
            overdueTasksCount,
            overallProgress
        },
        financialSummary: financialSummary,
        reportGeneratedDate: dateFns.format(new Date(), 'MMMM d, yyyy, h:mm:ss a'), // More precise generation time
        baseUrl: `${req.protocol}://${req.get('host')}` // For PDF assets (CSS, images)
    };

    return reportData;
}

// --- Controller Methods using getProjectReportData ---

exports.showProjectReport = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {
            req.flash('error_msg', 'Project not found or report data could not be generated.');
            return res.redirect(req.projectContext ? `/projects/${req.projectContext.id}/details` : '/dashboard');
        }

        res.render('projects/report', {
            title: `Report - ${reportData.project.name}`,
            pageTitle: `Project Status Report: ${reportData.project.name}`,
            project: reportData.project, // For convenience (e.g., breadcrumbs if not passed separately)
            reportData: reportData,
            currentUser: req.session.user,
            layout: './layouts/main_layout',
            projectId: projectId,
            breadcrumbs: [
                { name: 'Dashboard', url: '/dashboard' },
                { name: 'Projects', url: '/projects' },
                { name: reportData.project.name, url: `/projects/${projectId}/details` },
                { name: 'Report', url: '', active: true }
            ]
        });
    } catch (error) {
        console.error(`Error in showProjectReport for project ${projectId}:`, error);
        req.flash('error_msg', 'Could not generate project report. ' + error.message);
        res.redirect(req.projectContext ? `/projects/${req.projectContext.id}/details` : '/dashboard');
    }
};



exports.downloadProjectReportPDF = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {
            req.flash('error_msg', 'Project data not found for PDF report.');
            return res.redirect(`/projects/${projectId}/report`);
        }

        const templatePath = path.join(__dirname, '..', 'views', 'projects', 'report_pdf_template.ejs');
        // Ensure reportData has all necessary fields for the PDF template
        const htmlContent = await ejs.renderFile(templatePath, {
            reportData,
            dateFns, // Make dateFns available in template
            // Helper for PDF template to format dates if not already formatted
            formatDateForPDF: (dateString) => dateString ? dateFns.format(new Date(dateString), 'yyyy-MM-dd') : 'N/A',
        });

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] // Added font hinting for potentially better rendering
        });
        const page = await browser.newPage();
        
        // For local CSS files, ensure Puppeteer can access them.
        // One way is to set base URL if CSS is linked relatively in the template.
        // Or, inline critical styles in report_pdf_template.ejs.
        // Or, read CSS file and inject it:
        // const cssPath = path.join(__dirname, '..', 'public', 'css', 'report_pdf_styles.css'); // Example
        // const cssContent = await fs.readFile(cssPath, 'utf-8');
        // await page.addStyleTag({ content: cssContent });

        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
            displayHeaderFooter: true,
            headerTemplate: `<div style="font-size:8px; width:100%; text-align:center; padding:0 10mm;">Project Report: ${reportData.project.name.replace(/</g, '<')}</div>`,
            footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; padding:0 10mm;">Page <span class="pageNumber"></span> of <span class="totalPages"></span> - ${reportData.reportGeneratedDate}</div>`,
            timeout: 60000 // Timeout for PDF generation itself
        });
        await browser.close();

        const sanitizedProjectName = reportData.project.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Project_Report_${sanitizedProjectName}_${projectId}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error(`Error generating PDF report for project ${projectId}:`, error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Could not generate PDF report: ' + error.message);
            res.redirect(`/projects/${projectId}/report`);
        } else {
            console.error("Headers already sent for PDF error, cannot redirect.");
        }
    }
};


exports.downloadProjectReportExcel = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {
            req.flash('error_msg', 'Project data not found for Excel report.');
            return res.redirect(`/projects/${projectId}/report`);
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Avenircon Application';
        workbook.lastModifiedBy = 'Avenircon Application';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.company = 'Your Company'; // Optional

        
        // --- Project Summary Sheet ---
        const summarySheet = workbook.addWorksheet('Project Summary');
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 35, style: { font: { bold: true } } },
            { header: 'Value', key: 'value', width: 50 }
        ];
        summarySheet.addRow({ metric: 'Project Name:', value: reportData.project.name });
        summarySheet.addRow({ metric: 'Project Code:', value: reportData.project.project_code });
        summarySheet.addRow({ metric: 'Client:', value: reportData.project.client_name });
        summarySheet.addRow({ metric: 'Description:', value: reportData.project.description });
        summarySheet.addRow({ metric: 'Status:', value: reportData.project.status });
        summarySheet.addRow({ metric: 'Start Date:', value: reportData.project.start_date_formatted });
        summarySheet.addRow({ metric: 'End Date:', value: reportData.project.end_date_formatted });
        summarySheet.addRow({ metric: 'Project Manager:', value: reportData.project.project_manager_display_name });
        summarySheet.addRow({ metric: 'Created By:', value: reportData.project.creator_display_name });
        summarySheet.addRow({ metric: 'Report Generated:', value: reportData.reportGeneratedDate });
        summarySheet.addRow({}); // Spacer
        summarySheet.addRow({ metric: 'Overall Progress:', value: `${reportData.overallStats.overallProgress}%` });
        summarySheet.addRow({ metric: 'Total Tasks:', value: reportData.overallStats.totalTasks });
        summarySheet.addRow({ metric: 'Completed Tasks:', value: reportData.overallStats.completedTasksCount });
        summarySheet.addRow({ metric: 'Overdue Tasks:', value: reportData.overallStats.overdueTasksCount });
        summarySheet.addRow({}); // Spacer
        summarySheet.addRow({ metric: 'PROJECT PLANNED BUDGET:', value: reportData.financialSummary.projectPlannedBudget, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00', font: { bold: true } } });
        summarySheet.addRow({ metric: 'PROJECT ACTUAL COST:', value: reportData.financialSummary.projectActualCost, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00', font: { bold: true } } });
        summarySheet.addRow({ metric: 'PROJECT VARIANCE:', value: reportData.financialSummary.projectVariance, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00', font: { bold: true, color: { argb: reportData.financialSummary.projectVariance < 0 ? 'FFFF0000' : 'FF008000' } } } });
        summarySheet.addRow({});
        summarySheet.addRow({ metric: 'Total Task Planned Budget:', value: reportData.financialSummary.totalTaskPlannedBudget, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00' } });
        summarySheet.addRow({ metric: 'Total Task Actual Cost:', value: reportData.financialSummary.totalTaskActualCost, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00' } });
        summarySheet.addRow({ metric: 'Total Task Variance:', value: reportData.financialSummary.totalTaskVariance, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00', font: { color: { argb: reportData.financialSummary.totalTaskVariance < 0 ? 'FFFF0000' : 'FF008000' } } } });
        summarySheet.getRow(1).font = { bold: true, size: 12 }; // Style header a bit

        // --- Task Details Sheet ---
        const tasksSheet = workbook.addWorksheet('Task Details');
        tasksSheet.columns = [
            { header: 'Code', key: 'task_code', width: 12 },
            { header: 'Task Name', key: 'name', width: 40 },
            { header: 'Parent Task', key: 'parent_task_name', width: 30 },
            { header: 'Assignee', key: 'assignee_display_name', width: 25 },
            { header: 'Start Date', key: 'start_date_obj', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'End Date', key: 'end_date_obj', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Progress %', key: 'progress_percentage', width: 12, style: { numFmt: '0"%"' } },
            { header: 'Planned Budget', key: 'task_budget_num', width: 18, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00' } },
            { header: 'Actual Cost', key: 'actual_cost_num', width: 18, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00' } },
            { header: 'Variance', key: 'task_variance', width: 18, style: { numFmt: '$#,##0.00;[Red]-$#,##0.00' } },
        ];
        reportData.tasks.forEach(task => {
            tasksSheet.addRow({
                ...task, // Spread processed task data
                // Ensure date_obj fields are used for Excel
            });
        });
        tasksSheet.getRow(1).font = { bold: true, size: 11 };
        // Auto-filter
        tasksSheet.autoFilter = {
            from: 'A1',
            to: { row: 1, column: tasksSheet.columns.length },
        };

        const sanitizedProjectName = reportData.project.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Project_Report_${sanitizedProjectName}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(`Error generating Excel report for project ${projectId}:`, error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Could not generate Excel report. ' + error.message);
            res.redirect(`/projects/${projectId}/report`);
        }
    }
};

exports.downloadProjectReportCSV = async (req, res, next) => {
    const projectId = parseInt(req.params.projectId);
    try {
        const reportData = await getProjectReportData(projectId, req);
        if (!reportData) {
            req.flash('error_msg', 'Project data not found for CSV report.');
            return res.redirect(`/projects/${projectId}/report`);
        }

        const tempDir = path.join(__dirname, '..', 'public', 'temp'); // Ensure this path is correct relative to controller file
        await fs.ensureDir(tempDir);
        const sanitizedProjectName = reportData.project.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const filename = `Project_Tasks_${sanitizedProjectName}_${projectId}.csv`;
        const filePath = path.join(tempDir, filename);

        const csvWriterInstance = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: 'id', title: 'Task ID' },
                { id: 'task_code', title: 'Task Code' },
                { id: 'name', title: 'Task Name' },
                { id: 'description', title: 'Description'},
                { id: 'parent_task_name', title: 'Parent Task Name' },
                { id: 'parent_task_actual_id', title: 'Parent Task ID' },
                { id: 'assignee_display_name', title: 'Assignee' },
                { id: 'formatted_start_date_display', title: 'Start Date' }, // Use display formatted dates for CSV
                { id: 'formatted_end_date_display', title: 'End Date' },
                { id: 'status', title: 'Status' },
                { id: 'priority', title: 'Priority'},
                { id: 'progress_percentage', title: 'Progress (%)' },
                { id: 'task_budget_num', title: 'Planned Budget' },
                { id: 'actual_cost_num', title: 'Actual Cost' },
                { id: 'task_variance', title: 'Variance' },
                { id: 'is_milestone', title: 'Is Milestone'},
            ]
        });

        const records = reportData.tasks.map(task => ({
            ...task, // Spread processed task data which includes the display dates
        }));

        await csvWriterInstance.writeRecords(records);

        res.download(filePath, filename, async (err) => {
            if (err) {
                console.error("Error sending CSV file:", err);
                if (!res.headersSent) {
                    req.flash('error_msg', 'Error sending CSV file.');
                    res.redirect(`/projects/${projectId}/report`);
                }
            }
            try {
                await fs.unlink(filePath); // Delete temp file
            } catch (unlinkErr) {
                console.error("Error deleting temp CSV file:", unlinkErr);
            }
        });

    } catch (error) {
        console.error(`Error generating CSV report for project ${projectId}:`, error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Could not generate CSV report. ' + error.message);
            res.redirect(`/projects/${projectId}/report`);
        }
    }
};

*/