document.addEventListener('DOMContentLoaded', function () {
    // ... (your existing script.js content, like delete confirmations)

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
});


