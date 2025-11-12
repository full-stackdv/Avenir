// Avenircon/controllers/dashboardController.js
const db = require('../config/db');

exports.showUserDashboard = async (req, res, next) => {
  const userId = req.session.user.id;
  const userAppRole = req.session.user.role; // For determining project access
  
  try {
    // Placeholder for projects data
    let projectsWithStats = [];
    
    // 1. Fetch accessible projects for the user
    // This query needs to consider projects created by the user,
    // projects where they are the project_manager_id,
    // and projects they are a member of via project_members table.
    // Using a UNION might be complex for ordering, so multiple queries or a complex JOIN might be needed.
    // Let's start with a query that covers created_by and project_manager_id, 
    // and then integrate project_members.
    
    // Query to get projects created by user OR managed by user OR user is Admin
    // Plus projects where user is a member (more complex join/subquery needed or separate query)
    
    // Simpler initial approach: Fetch all projects user is associated with via project_members
    // or is PM or Creator. Admins see all.
    let accessibleProjectsQuery;
    let queryParams = [userId, userId]; // For PM and Creator
    
    if (userAppRole === 'Admin') {
      accessibleProjectsQuery = `
                SELECT p.id, p.name, p.project_code, p.description, p.client_name, p.status,
                       u_creator.username as creator_username
                FROM projects p
                LEFT JOIN users u_creator ON p.created_by_id = u_creator.id
                ORDER BY p.created_at DESC
            `;
      queryParams = []; // Admin sees all, no user-specific params needed here
    } else {
      // Fetch projects where user is creator, PM, or a member in project_members
      accessibleProjectsQuery = `
                SELECT DISTINCT p.id, p.name, p.project_code, p.description, p.client_name, p.status,
                       u_creator.username as creator_username
                FROM projects p
                LEFT JOIN users u_creator ON p.created_by_id = u_creator.id
                LEFT JOIN project_members pm ON p.id = pm.project_id
                WHERE p.created_by_id = ? 
                   OR p.project_manager_id = ? 
                   OR pm.user_id = ?
                ORDER BY p.created_at DESC
            `;
      queryParams.push(userId); // for pm.user_id = ?
    }
    
    const [projects] = await db.query(accessibleProjectsQuery, queryParams);
    
    if (projects.length > 0) {
      for (const project of projects) {
        // 2. For each project, fetch its tasks
        const [tasks] = await db.query(
          `SELECT id, status, progress_percentage, start_date, end_date 
                     FROM tasks 
                     WHERE project_id = ?`,
          [project.id]
        );
        
        // 3. Calculate stats
        const totalTasks = tasks.length;
        let completedTasks = 0;
        let sumOfProgress = 0;
        let overdueTasksCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day for date comparisons
        
        if (totalTasks > 0) {
          tasks.forEach(task => {
            if (task.status === 'Completed' || task.progress_percentage === 100) {
              completedTasks++;
            }
            sumOfProgress += (task.progress_percentage || 0);
            
            if (task.end_date && new Date(task.end_date) < today && task.status !== 'Completed' && task.progress_percentage !== 100) {
              overdueTasksCount++;
            }
          });
        }
        
        // Calculate overall progress (simple average for now)
        const overallProgress = totalTasks > 0 ? Math.round(sumOfProgress / totalTasks) : 0;
        
        projectsWithStats.push({
          ...project, // Spread existing project details
          totalTasks,
          completedTasks,
          overallProgress,
          overdueTasksCount
        });
      }
    }
    
    res.render('dashboard', {
      title: 'My Dashboard - Avenircon',
      pageTitle: 'My Dashboard', // This is often set by main_layout based on a route variable
      user: req.session.user,
      projects: projectsWithStats, // Pass projects with new stats
      layout: './layouts/main_layout',
      dashboard_error: null // Or some error message if needed
    });
    
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    // Render dashboard with an error message
    res.render('dashboard', {
      title: 'My Dashboard - Avenircon',
      pageTitle: 'My Dashboard',
      user: req.session.user,
      projects: [],
      layout: './layouts/main_layout',
      dashboard_error: 'Could not load project data. Please try again later.'
    });
    // Or call next(error) to let global error handler manage it
    // next(error); 
  }
};


exports.getDashboard = async (req, res, next) => {
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  
  try {
    let projectsQuery;
    let queryParams = [userId];
    
    if (userRole === 'Admin') {
      // Admin sees all projects
      projectsQuery = `
                SELECT p.*, u.username as created_by_username
                FROM projects p
                JOIN users u ON p.created_by_id = u.id
                ORDER BY p.created_at DESC
            `;
      queryParams = [];
    } else {
      // Non-admins see projects they are members of or created
      projectsQuery = `
                SELECT DISTINCT p.*, u.username as created_by_username
                FROM projects p
                JOIN users u ON p.created_by_id = u.id
                LEFT JOIN project_members pm ON p.id = pm.project_id
                WHERE p.created_by_id = ? OR pm.user_id = ?
                ORDER BY p.created_at DESC
            `;
      queryParams = [userId, userId];
    }
    
    const [projects] = await db.query(projectsQuery, queryParams);
    
    const projectSummaries = [];
    
    for (const project of projects) {
      const [tasks] = await db.query(
        'SELECT id, status, progress_percentage, start_date, end_date FROM tasks WHERE project_id = ?',
        [project.id]
      );
      
      let totalTasks = tasks.length;
      let completedTasks = 0;
      let sumOfProgress = 0;
      let overdueTasks = 0;
      const now = new Date();
      
      if (tasks.length > 0) {
        tasks.forEach(task => {
          if (task.status === 'Completed' || task.progress_percentage === 100) {
            completedTasks++;
          }
          sumOfProgress += (task.progress_percentage || 0); // Ensure progress_percentage is a number, default to 0 if null
          
          const taskEndDate = new Date(task.end_date);
          if (taskEndDate < now && task.status !== 'Completed' && task.progress_percentage < 100) {
            overdueTasks++;
          }
        });
      }
      
      let overallProgress = 0;
      if (totalTasks > 0) {
        // Option 1: Average of task progress percentages
        overallProgress = sumOfProgress / totalTasks;
        
        // Option 2: Percentage of tasks completed (uncomment to use this instead)
        // overallProgress = (completedTasks / totalTasks) * 100;
      }
      // Ensure overallProgress is an integer
      overallProgress = Math.round(overallProgress);
      
      
      projectSummaries.push({
        ...project,
        totalTasks,
        completedTasks,
        overdueTasks,
        overallProgress // This should now be correctly calculated
      });
    }
    
    res.render('dashboard', {
      title: 'Dashboard',
      layout: 'layout/main_layout',
      user: req.session.user,
      projects: projectSummaries, // Pass the summaries
      activeMenu: 'Dashboard'
    });
    
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    next(error);
  }
};

/*
B.Update Route in routes / app.js to use dashboardController:
  
  File Path: Avenircon / routes / app.js

Modifications:
  
  Remove or comment out the existing inline dashboard route handler.

Import dashboardController.

Add the new route pointing to dashboardController.showUserDashboard.
*/


