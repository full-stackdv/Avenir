// public/js/blog_scripts.js
document.addEventListener('DOMContentLoaded', function() {
    // Placeholder for any blog-specific client-side interactions.
    // For example, if you had client-side search filtering (not server-side search)
    // or dynamic loading of more posts (infinite scroll).

    // If you had a client-side search for the blog list:
    const searchInput = document.getElementById('blogSearchInput'); // Assuming <input id="blogSearchInput">
    const postCards = document.querySelectorAll('.blog-post-card-item'); // Assuming each post has this class

    if (searchInput && postCards.length > 0) {
        searchInput.addEventListener('keyup', function() {
            const searchTerm = searchInput.value.toLowerCase();
            postCards.forEach(card => {
                const title = card.querySelector('.card-title a').textContent.toLowerCase();
                const summary = card.querySelector('.card-text').textContent.toLowerCase();
                if (title.includes(searchTerm) || summary.includes(searchTerm)) {
                    card.style.display = ''; // Or 'block', 'flex' etc.
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }
});