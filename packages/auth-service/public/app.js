/**
 * API Key Portal - Client-side Application
 *
 * Vanilla JavaScript SPA with History API routing.
 * Manages OAuth login, API key creation/listing/revocation.
 */

// Auth state
let currentUser = null;

// Route definitions
const routes = {
  '/': loginPage,
  '/dashboard': dashboardPage,
  '/create-key': createKeyPage,
  '/key-created': keyCreatedPage,
};

// Router - History API based
function navigate(path) {
  window.history.pushState({}, '', path);
  render();
}

async function render() {
  const path = window.location.pathname;
  const page = routes[path] || notFoundPage;

  // Handle async pages
  const content = await page();
  document.getElementById('app').innerHTML = content;
}

function notFoundPage() {
  return `
    <div class="page">
      <div class="card">
        <h1>Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/" class="btn btn-primary" onclick="event.preventDefault(); navigate('/')">Go to Login</a>
      </div>
    </div>
  `;
}

// Auth functions
async function checkAuth() {
  try {
    const res = await fetch('/auth/me', { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      return true;
    }
  } catch (e) {
    console.error('Auth check failed:', e);
  }
  currentUser = null;
  return false;
}

async function requireAuth() {
  const authed = await checkAuth();
  if (!authed && window.location.pathname !== '/') {
    navigate('/');
    return false;
  }
  return authed;
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  currentUser = null;
  navigate('/');
}

// Login page
function loginPage() {
  // If already logged in, redirect to dashboard
  if (currentUser) {
    navigate('/dashboard');
    return '';
  }

  return `
    <div class="page login-page">
      <div class="card">
        <h1>API Key Portal</h1>
        <p>Sign in with your Google account to manage API keys.</p>
        <a href="/auth/google" class="btn btn-primary">Sign in with Google</a>
      </div>
    </div>
  `;
}

// Dashboard page
async function dashboardPage() {
  const authed = await requireAuth();
  if (!authed) return '';

  let keys = [];
  let error = null;

  try {
    const res = await fetch('/api/keys', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      keys = data.keys || [];
    } else {
      error = 'Failed to load API keys';
    }
  } catch (e) {
    error = 'Failed to connect to server';
  }

  return `
    <div class="page dashboard-page">
      <header>
        <h1>API Keys</h1>
        <div>
          <span>${escapeHtml(currentUser.email)}</span>
          <button onclick="logout()" class="btn btn-secondary">Logout</button>
        </div>
      </header>

      <button onclick="navigate('/create-key')" class="btn btn-primary">Create New Key</button>

      ${error ? `<p class="error">${error}</p>` : ''}

      ${keys.length === 0 ? '<p class="empty-state">No API keys yet. Create one to get started.</p>' : `
        <table class="keys-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key Prefix</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${keys.map(key => `
              <tr>
                <td>${escapeHtml(key.name)}</td>
                <td><code>${escapeHtml(key.key_prefix)}...</code></td>
                <td>${new Date(key.created_at).toLocaleDateString()}</td>
                <td>
                  <button onclick="confirmRevoke('${escapeHtml(key.key_id)}', '${escapeHtml(key.name)}')" class="btn btn-danger">Revoke</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

// Create key page
function createKeyPage() {
  return `
    <div class="page create-key-page">
      <h1>Create New API Key</h1>
      <form onsubmit="handleCreateKey(event)">
        <label>
          Key Name
          <input type="text" name="name" required minlength="1" maxlength="100" placeholder="My API Key">
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Create Key</button>
          <button type="button" onclick="navigate('/dashboard')" class="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

async function handleCreateKey(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const name = formData.get('name');

  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });

    if (res.ok) {
      const data = await res.json();
      // Store key in session for key-created page
      sessionStorage.setItem('newKey', JSON.stringify(data));
      navigate('/key-created');
    } else {
      const error = await res.json();
      alert(error.message || 'Failed to create key. Please try again.');
    }
  } catch (e) {
    alert('Failed to connect to server. Please try again.');
  }
}

// Key created page - shows full key once
function keyCreatedPage() {
  const newKeyData = sessionStorage.getItem('newKey');
  if (!newKeyData) {
    navigate('/dashboard');
    return '';
  }

  const data = JSON.parse(newKeyData);

  return `
    <div class="page key-created-page">
      <div class="card">
        <h1>API Key Created</h1>
        <p class="warning">Copy your API key now. You won't be able to see it again.</p>
        <div class="key-display">
          <code id="key-value">${escapeHtml(data.key)}</code>
          <button onclick="copyKey()" class="btn btn-primary">Copy to Clipboard</button>
        </div>
        <div class="key-info">
          <p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
        </div>
        <button onclick="finishKeyCreation()" class="btn btn-secondary">Done</button>
      </div>
    </div>
  `;
}

async function copyKey() {
  const keyValue = document.getElementById('key-value').textContent;
  try {
    await navigator.clipboard.writeText(keyValue);
    alert('API key copied to clipboard');
  } catch (e) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = keyValue;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('API key copied to clipboard');
  }
}

function finishKeyCreation() {
  sessionStorage.removeItem('newKey');
  navigate('/dashboard');
}

// Revoke key with confirmation dialog
function confirmRevoke(keyId, keyName) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <h2>Confirm Revocation</h2>
    <p>Are you sure you want to revoke "<strong>${escapeHtml(keyName)}</strong>"?</p>
    <p class="warning">This action cannot be undone.</p>
    <div class="dialog-actions">
      <button onclick="this.closest('dialog').close(); this.closest('dialog').remove();" class="btn btn-secondary">Cancel</button>
      <button onclick="revokeKey('${escapeHtml(keyId)}')" class="btn btn-danger">Revoke Key</button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.showModal();
}

async function revokeKey(keyId) {
  const dialog = document.querySelector('dialog');

  try {
    const res = await fetch(`/api/keys/${keyId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (dialog) {
      dialog.close();
      dialog.remove();
    }

    if (res.ok) {
      render(); // Refresh dashboard
    } else {
      alert('Failed to revoke key. Please try again.');
    }
  } catch (e) {
    if (dialog) {
      dialog.close();
      dialog.remove();
    }
    alert('Failed to connect to server. Please try again.');
  }
}

// Utility: HTML escape to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize app
window.addEventListener('popstate', render);
window.addEventListener('DOMContentLoaded', async () => {
  // Check auth state on load
  await checkAuth();

  // If we're on the root and already logged in, go to dashboard
  if (currentUser && window.location.pathname === '/') {
    navigate('/dashboard');
  } else {
    render();
  }
});
