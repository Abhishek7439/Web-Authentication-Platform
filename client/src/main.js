import { getToken, setToken, clearToken, del } from './lib/api.js';
import { renderLoginPage } from './pages/login.js';
import { renderRegisterPage } from './pages/register.js';
import { renderDashboardPage } from './pages/dashboard.js';
import { renderApprovalsPage } from './pages/approvals.js';
import { renderAuditPage } from './pages/audit.js';

/**
 * Simple hash-based router.
 */
const routes = {
  '/': () => (getToken() ? renderDashboardPage() : renderLoginPage()),
  '/login': () => renderLoginPage(),
  '/register': () => renderRegisterPage(),
  '/dashboard': () => renderDashboardPage(),
  '/approvals': () => renderApprovalsPage(),
  '/audit': () => renderAuditPage(),
};

/**
 * Navigate to a hash route.
 */
export function navigate(path) {
  window.location.hash = `#${path}`;
}

/**
 * Logout and redirect to login.
 */
export function logout() {
  del('/auth/session').catch(() => {}); // Best-effort server cleanup
  clearToken();
  navigate('/login');
}

/**
 * Get the current user from the stored token.
 */
export function getCurrentUser() {
  const raw = localStorage.getItem('commander_user');
  return raw ? JSON.parse(raw) : null;
}

/**
 * Store user info alongside the token.
 */
export function setCurrentUser(user) {
  localStorage.setItem('commander_user', JSON.stringify(user));
}

/**
 * Clear user info.
 */
export function clearCurrentUser() {
  localStorage.removeItem('commander_user');
}

/**
 * Render the appropriate page based on the current hash.
 */
function render() {
  const hash = window.location.hash.slice(1) || '/';
  const app = document.getElementById('app');

  // Handle magic-link verification: #/magic-link/<token>
  if (hash.startsWith('/magic-link/')) {
    const token = hash.replace('/magic-link/', '');
    handleMagicLinkVerify(token, app);
    return;
  }

  // Find matching route (exact match first, then fallback to /)
  const routeKey = routes[hash] ? hash : '/';

  // Check auth for protected routes
  if (['/dashboard', '/approvals', '/audit', '/recovery'].includes(routeKey) && !getToken()) {
    navigate('/login');
    return;
  }

  app.innerHTML = '';
  const content = routes[routeKey]();
  if (typeof content === 'string') {
    app.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    app.appendChild(content);
  }
}

/**
 * Handle magic link token verification.
 */
async function handleMagicLinkVerify(token, app) {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="card">
          <h1>Verifying...</h1>
          <p class="subtitle">Checking your magic link, please wait.</p>
        </div>
      </div>
    </div>
  `;

  try {
    const API_BASE = window.location.origin + '/api';
    const res = await fetch(`${API_BASE}/auth/magic-link/verify/${token}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Verification failed');
    }

    setToken(data.token);
    setCurrentUser(data.user);
    navigate('/dashboard');
  } catch (err) {
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="card">
            <h1>Link Invalid</h1>
            <div class="alert alert-error">${err.message}</div>
            <a href="#/login" class="btn btn-primary btn-block mt-lg">Back to Login</a>
          </div>
        </div>
      </div>
    `;
  }
}

/**
 * Render the navigation bar (for authenticated pages).
 */
export function renderNav() {
  const user = getCurrentUser();
  if (!user) return '';

  const roleClass = user.role === 'admin' ? 'admin' : user.role === 'senior' ? 'senior' : '';

  return `
    <nav class="nav">
      <div class="nav-brand">
        <span class="chain-icon">⛓</span>
        Commander Auth
      </div>
      <ul class="nav-links">
        <li><a href="#/dashboard" id="nav-dashboard">Dashboard</a></li>
        <li><a href="#/approvals" id="nav-approvals">Approvals</a></li>
        <li><a href="#/audit" id="nav-audit">Audit Log</a></li>
      </ul>
      <div class="nav-user">
        <span class="user-badge">${user.email}</span>
        <span class="role-badge ${roleClass}">${user.role}</span>
        <button class="btn btn-outline btn-sm" id="btn-logout">Logout</button>
      </div>
    </nav>
  `;
}

/**
 * Attach logout handler after rendering nav.
 */
export function attachNavHandlers() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearToken();
      clearCurrentUser();
      navigate('/login');
    });
  }
}

// Listen for hash changes
window.addEventListener('hashchange', render);

// Initial render
render();
