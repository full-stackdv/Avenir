//public/js/script.js
document.addEventListener('DOMContentLoaded', function() {
  
    console.log('Avenircon scripts.js loaded and DOM fully parsed.');
  // --- Task Deletion Confirmation ---
  // Find all forms with the class 'delete-task-form'
  const deleteTaskForms = document.querySelectorAll('form.delete-task-form'); // Use a more specific class
  
  deleteTaskForms.forEach(form => {
    form.addEventListener('submit', function(event) {
      const taskName = this.dataset.taskName || 'this task'; // Get task name from data attribute
      const confirmed = confirm(`Are you sure you want to delete "${taskName}"? This action cannot be undone.`);
      if (!confirmed) {
        event.preventDefault(); // Stop form submission if not confirmed
      }
    });
  });
  
  // --- Project Deletion Confirmation (Placeholder for when you implement it) ---
  const deleteProjectForms = document.querySelectorAll('form.delete-project-form');
  deleteProjectForms.forEach(form => {
    form.addEventListener('submit', function(event) {
      const projectName = this.dataset.projectName || 'this project';
      const confirmed = confirm(`Are you sure you want to delete "${projectName}" and all its associated data (tasks, documents, etc.)? This action is permanent and cannot be undone.`);
      if (!confirmed) {
        event.preventDefault();
      }
    });
  });
  
  
  
    const sidebar = document.getElementById('sidebarMenu');
    const sidebarToggler = document.querySelector('.navbar-toggler'); // Assuming main app navbar toggler controls sidebar on mobile

    if (sidebar && sidebarToggler) {
        // This is a very basic toggle. Bootstrap's offcanvas might be more robust
        // or you might have a dedicated sidebar toggle button.
        // Let's assume the main navbar toggler can also show/hide sidebar on mobile.
        
        // If Bootstrap's collapse is already handling the navbar,
        // we might need a different button or a more integrated approach.
        // For now, this is a simple illustrative toggle:
        
        // Check if we are on a small screen initially
        function isMobileView() {
            return window.innerWidth < 768;
        }

        // If you have a specific button to toggle sidebar (e.g., inside the navbar)
        const dedicatedSidebarToggle = document.getElementById('sidebarToggleBtn'); // Example ID

        if (dedicatedSidebarToggle) {
            dedicatedSidebarToggle.addEventListener('click', function(event) {
                event.preventDefault();
                sidebar.classList.toggle('show'); // Toggles the .show class we defined in CSS
            });
        } else if (sidebarToggler && isMobileView()) { 
            // Fallback: if no dedicated button, let main navbar toggler also try to affect sidebar
            // This might conflict if Bootstrap's collapse for navbar is also very active.
            // Consider carefully if this is the desired behavior.
            // A dedicated sidebar toggle button is usually cleaner.
            // For now, this event listener is commented out to avoid conflicts without a dedicated button.
            /*
            sidebarToggler.addEventListener('click', function() {
                if (isMobileView()) { // Only toggle sidebar via navbar toggler on mobile
                    sidebar.classList.toggle('show');
                }
            });
            */
        }
    }
    
  // --- Smooth scroll for anchor links (e.g., on public pages) ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const hrefAttribute = this.getAttribute('href');
      // Ensure it's not just a hash for other JS functionality (like Bootstrap tabs/modals)
      if (hrefAttribute.length > 1 && document.querySelector(hrefAttribute)) {
        e.preventDefault();
        document.querySelector(hrefAttribute).scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });
  
  // --- Active Nav Link based on URL (Simple version for public pages) ---
  // This is an alternative to the EJS logic if you prefer client-side
  // const publicNavLinks = document.querySelectorAll('.public-navbar .nav-link');
  // const currentPath = window.location.pathname;
  
  // publicNavLinks.forEach(link => {
  //     if (link.getAttribute('href') === currentPath) {
  //         link.classList.add('active');
  //     } else if (currentPath === '/' && link.getAttribute('href') === '/') { // Special case for home
  //          link.classList.add('active');
  //     }
  // });
  
  
  // --- Mobile Menu Toggle (if not relying solely on Bootstrap's JS) ---
  // Example:
  // const mobileToggler = document.querySelector('.navbar-toggler');
  // const navCollapse = document.querySelector('.navbar-collapse');
  // if (mobileToggler && navCollapse) {
  //     mobileToggler.addEventListener('click', function() {
  //         navCollapse.classList.toggle('show');
  //     });
  // }
  
  // You can add more general public-facing JavaScript interactions here.
  console.log('Public script.js loaded.');
});

/*
// Avenircon/public/js/scripts.js

document.addEventListener('DOMContentLoaded', function() {
    console.log('Avenircon scripts.js loaded and DOM fully parsed.');

    // Example: Add event listeners for all delete forms for tasks (if we were to handle via AJAX later)
    // For now, the HTML form submission with onsubmit="return confirm(...)" is handling deletion.
    // This is just a placeholder to show where such client-side logic would go.

    const deleteTaskForms = document.querySelectorAll('form[action*="/tasks/"][action*="/delete"]');
    deleteTaskForms.forEach(form => {
        form.addEventListener('submit', function(event) {
            // The built-in confirm dialog in onsubmit="return confirm(...)" already handles this.
            // If we were doing AJAX, we'd put:
            // event.preventDefault();
            // if (confirm('Are you sure you want to delete this task via JavaScript?')) {
            //     // AJAX call here
            //     console.log('Confirmed delete for task via JS - AJAX would go here for form:', event.target.action);
            // }
        });
    });

    // You can add other global client-side enhancements here, like:
    // - Initializing Bootstrap components (tooltips, popovers, modals if not auto-initialized)
    // - Simple UI interactions
});


*/