import { fetchBookmarks, getScanningProgress, checkAllDeadLinks } from "./fetch_data.js";
import { debounce } from "./utils.js";

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize bookmarks
  setupMessageListener();
  setupWindowResizeEventListener();
  setupHelpButton();
  setupScanningTooltip();

  showLoading();
  const allBookmarks = await fetchBookmarks();
  await displayBookmarks(allBookmarks);
  setupSearchInput();
});


function displayScanningProgress(progress, timestamp) {
  const progressElement = document.getElementById('fetchProgress');
  if (progressElement) {
    if (progress < 100) {
      progressElement.textContent = ` Scanning (${progress}%)`;
    } else {
      progressElement.textContent = 'Scanning complete';
    }
  } else {
    console.error("Progress element does not exist");
  }
}
function setupMessageListener() {
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'SCANNING_PROGRESS_UPDATE') {

      const { progress, timestamp } = await getScanningProgress();
      console.log(message);
      console.log(progress);
      if (progress >= 0) {
        displayScanningProgress(progress, timestamp);
        const allBookmarks = await fetchBookmarks();
        await displayBookmarks(allBookmarks);
      }
    } else if (message.type === 'SCANNING_UPON_CREATION' || message.type === 'SCANNING_UPON_CHANGE') {
      const allBookmarks = await fetchBookmarks();
      await displayBookmarks(allBookmarks);
    }
  });
}

function setupHelpButton() {
  const helpButton = document.getElementById('helpButton');
  const searchWrapper = document.querySelector('.search-wrapper');

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerHTML = `
    <h3>Help</h3>
    <p>Type any text to search titles and descriptions.</p>
    <br />
    <h4>Search Prefixes</h4>
    <ul>
    <li><strong>:dead</strong> - Show dead links</li>
    <li><strong>:site</strong> - Show site bookmarks</li>
    <li><strong>:page</strong> - Show page bookmarks</li>
  `;
  searchWrapper.appendChild(tooltip);

  helpButton.addEventListener('click', (e) => {
    e.stopPropagation();
    tooltip.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!tooltip.contains(e.target) && !helpButton.contains(e.target)) {
      tooltip.classList.remove('show');
    }
  });
}

async function setupScanningTooltip() {
  const progressWrapper = document.querySelector('.fetch-progress');
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';

  progressWrapper.appendChild(tooltip);

  progressWrapper.addEventListener('mouseover', async (e) => {
    console.log("Show progress tooltip");
    e.stopPropagation();
    const { progress, timestamp } = await getScanningProgress();
    if (progress == 100) {
      tooltip.innerHTML = `
        <p>Scanning is complete!</p>
        <p>All broken links are found.</p>
      `;
    } else {
      tooltip.innerHTML = `
        <p>While scanning your bookmarks,</p>
        <p>you can continue using the extension normally.</p>
        <p>Broken links will update automatically afterwards.</p>
      `;
    }
    tooltip.classList.toggle('show');
  });

  progressWrapper.addEventListener('mouseout', (e) => {
    console.log("Hide progress tooltip");
    e.stopPropagation();
    tooltip.classList.remove('show');
  });
}

function showLoading() {
  const bookmarksGrid = document.getElementById('bookmarksGrid');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading';
  loadingDiv.textContent = 'Loading bookmarks...';

  bookmarksGrid.textContent = '';
  bookmarksGrid.appendChild(loadingDiv);
}

function showEmpty() {
  const bookmarksGrid = document.getElementById('bookmarksGrid');
  const emptyStateDiv = document.createElement('div');
  emptyStateDiv.className = 'empty-state';
  emptyStateDiv.textContent = 'No bookmarks found';

  bookmarksGrid.textContent = '';
  bookmarksGrid.appendChild(emptyStateDiv);
}

function createBookmarkCard(bookmark) {
  const card = document.createElement('div');
  card.className = 'bookmark-card';
  card.title = bookmark.url;

  // Create content wrapper
  const content = document.createElement('div');
  content.className = 'bookmark-content';

  // Create title element
  const title = document.createElement('div');
  title.className = 'bookmark-title';
  title.title = bookmark.title;
  title.textContent = bookmark.title;

  // Create URL element
  const url = document.createElement('div');
  url.className = 'bookmark-url';
  url.title = bookmark.url;
  url.textContent = bookmark.url;

  // Create badges container
  const badgesContainer = document.createElement('div');
  badgesContainer.className = 'badges-container';

  // Add first category badge
  const siteBadge = document.createElement('div');
  siteBadge.className = 'category-badge';
  siteBadge.textContent = bookmark.siteOrPage;

  // Add second category badge
  const typeBadge = document.createElement('div');
  typeBadge.className = 'category-badge badge-dead';
  if (bookmark.status == "dead") {
    typeBadge.textContent = "dead";
  }
  else {
    typeBadge.hidden = true;
  }

  // Add badges to container
  badgesContainer.appendChild(siteBadge);
  badgesContainer.appendChild(typeBadge);

  // Create delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-button';
  deleteBtn.setAttribute('aria-label', 'Delete bookmark');
  deleteBtn.title = 'Delete bookmark';

  const deleteIcon = document.createElement('img');
  deleteIcon.src = 'delete_128x128.png';
  deleteIcon.alt = 'Delete';
  deleteBtn.appendChild(deleteIcon);

  // Add elements to content wrapper
  content.appendChild(title);
  content.appendChild(url);

  // Add content, badges container, and delete button to card
  card.appendChild(content);
  card.appendChild(badgesContainer);
  card.appendChild(deleteBtn);

  card.addEventListener('click', () => {
    if (window.getSelection().toString() === '') {
      chrome.tabs.create({ url: bookmark.url });
    }
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteBookmark(bookmark.id, card);
    const allBookmarks = await fetchBookmarks();
    await displayBookmarks(allBookmarks);
  });

  card.setAttribute('tabindex', '0');
  card.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target === deleteBtn) {
        await deleteBookmark(bookmark.id, card);
        const allBookmarks = await fetchBookmarks();
        await displayBookmarks(allBookmarks);
      } else {
        chrome.tabs.create({ url: bookmark.url });
      }
    }
  });

  return card;
}

async function deleteBookmark(bookmarkId, card) {
  try {
    if (!confirm('Are you sure you want to delete this bookmark?')) {
      return;
    }

    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9)';

    await chrome.bookmarks.remove(bookmarkId);

    setTimeout(() => {
      card.remove();
      const bookmarkCount = document.getElementById('bookmarkCount');
      const currentCount = parseInt(bookmarkCount.textContent);
      bookmarkCount.textContent = currentCount - 1;
    }, 300);

  } catch (error) {
    console.error('Error deleting bookmark:', error);
    alert('Failed to delete bookmark. Please try again.');
    card.style.opacity = '1';
    card.style.transform = 'none';
  }
}

async function displayBookmarks(bookmarks) {
  if (bookmarks.length === 0) {
    showEmpty();
    return;
  }

  const bookmarksGrid = document.getElementById('bookmarksGrid');
  bookmarksGrid.textContent = '';

  bookmarks.forEach(bookmark => {
    if (bookmark.url) {
      const card = createBookmarkCard(bookmark);
      bookmarksGrid.appendChild(card);
    }
  });

  const visibleBookmarks = bookmarks.filter(b => b.url).length;
  document.getElementById('bookmarkCount').textContent = visibleBookmarks;
}



function filterBookmarks(bookmarks, searchTerm) {
  var filtered = [];
  if (searchTerm.startsWith(":dead")) {
    filtered = bookmarks.filter(bookmark => bookmark.status == "dead");
  }
  else if (searchTerm.startsWith(":site")) {
    filtered = bookmarks.filter(bookmark => bookmark.siteOrPage.toLowerCase() == "site");
  }
  else if (searchTerm.startsWith(":page")) {
    filtered = bookmarks.filter(bookmark => bookmark.siteOrPage.toLowerCase() == "page");
  } else {
    filtered = bookmarks.filter(bookmark => {
      if (!bookmark.url) return false;
      const searchLower = searchTerm.toLowerCase();
      var result = bookmark.title.toLowerCase().includes(searchLower) ||
        bookmark.url.toLowerCase().includes(searchLower);
      return result;
    });
  }
  return filtered;
}

function setupSearchInput(delay = 300) {
  const searchInput = document.getElementById('searchInput');
  const debouncedFilter = debounce(filterBookmarks, delay);
  searchInput.addEventListener('input', async (e) => {
    const allBookmarks = await fetchBookmarks();
    const filtered = await debouncedFilter(allBookmarks, e.target.value);
    await displayBookmarks(filtered);
  });
}

function setupWindowResizeEventListener() {
  window.addEventListener('resize', () => {
    const bookmarksGrid = document.getElementById('bookmarksGrid');
    bookmarksGrid.style.display = 'none';
    requestAnimationFrame(() => {
      bookmarksGrid.style.display = 'grid';
    });
  });
}

// function displayTabDescription(description) {
//   document.getElementById("description").textContent = description;
// }