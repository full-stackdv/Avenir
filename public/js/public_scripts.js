// public/js/public_scripts.js
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll for anchor links (if any)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const hrefAttribute = this.getAttribute('href');
            if (hrefAttribute && hrefAttribute.length > 1) { // Ensure it's not just "#"
                const targetElement = document.querySelector(hrefAttribute);
                if (targetElement) {
                    e.preventDefault();
                    targetElement.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Example: Add 'scrolled' class to navbar on scroll
    const publicNavbar = document.querySelector('.navbar.fixed-top'); // Target your public navbar
    if (publicNavbar) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                publicNavbar.classList.add('navbar-scrolled');
            } else {
                publicNavbar.classList.remove('navbar-scrolled');
            }
        });
    }

    // Add any other general public site enhancements here.
    // For example, simple animations on scroll, etc.
});