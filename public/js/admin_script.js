document.addEventListener('DOMContentLoaded', function() {
  // Confirmation for post deletion
  const deleteForms = document.querySelectorAll('.delete-post-form');
  deleteForms.forEach(form => {
    form.addEventListener('submit', function(event) {
      const postTitle = this.dataset.postTitle || 'this post';
      const confirmation = confirm(`Are you sure you want to delete "${postTitle}"? This action cannot be undone.`);
      if (!confirmation) {
        event.preventDefault(); // Stop form submission
      }
    });
  });
  
  // Add other admin-specific JavaScript here
  // For example, initializing a rich text editor, custom form validations, etc.
  console.log('Admin script loaded.');
  
  // Preview for feature image upload
  const featureImageInput = document.getElementById('feature_image');
  if (featureImageInput) {
    const imagePreviewContainer = document.createElement('div');
    imagePreviewContainer.id = 'imagePreviewContainer';
    imagePreviewContainer.classList.add('mt-2');
    
    const currentImage = document.querySelector('.current-feature-image img');
    if (currentImage) {
      // If there's a current image, insert preview after it
      currentImage.closest('.current-feature-image').insertAdjacentElement('afterend', imagePreviewContainer);
    } else {
      // Otherwise, insert after the file input itself
      featureImageInput.insertAdjacentElement('afterend', imagePreviewContainer);
    }
    
    featureImageInput.addEventListener('change', function(event) {
      const file = event.target.files[0];
      imagePreviewContainer.innerHTML = ''; // Clear previous preview
      
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.alt = 'Image preview';
          img.style.maxWidth = '200px';
          img.style.maxHeight = '150px';
          img.style.marginTop = '10px';
          img.style.border = '1px solid #ddd';
          img.style.padding = '5px';
          img.classList.add('rounded');
          imagePreviewContainer.appendChild(img);
        }
        reader.readAsDataURL(file);
      } else if (file) {
        const p = document.createElement('p');
        p.textContent = 'Selected file is not an image.';
        p.classList.add('text-danger', 'small', 'mt-1');
        imagePreviewContainer.appendChild(p);
      }
    });
  }

  const deleteCommentForms = document.querySelectorAll('.delete-comment-form');
    deleteCommentForms.forEach(form => {
        form.addEventListener('submit', function(event) {
            const author = this.dataset.commentAuthor || 'this comment';
            const confirmation = confirm(`Are you sure you want to delete the comment by "${author}"? This action cannot be undone.`);
            if (!confirmation) {
                event.preventDefault();
            }
        });
    });

});
