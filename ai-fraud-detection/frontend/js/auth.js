/**
 * auth.js — Authentication and Theme switcher logic
 */

// Theme initialization - runs immediately to avoid style flashing
(function() {
  const savedTheme = localStorage.getItem('appTheme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.classList.add('theme-light');
  } else {
    document.documentElement.classList.remove('theme-light');
  }
})();

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('theme-light');
  localStorage.setItem('appTheme', isLight ? 'light' : 'dark');
  updateThemeButton();
  window.dispatchEvent(new Event('themeChanged'));
}

function updateThemeButton() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isLight = document.documentElement.classList.contains('theme-light');
  btn.innerHTML = isLight 
    ? `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></svg> Dark Mode`
    : `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light Mode`;
}

document.addEventListener('DOMContentLoaded', () => {
  updateThemeButton();
});

// ── Session Utils ──────────────────────────────────────────────────────────────

function saveSession(data) {
  localStorage.setItem('authToken',    data.token);
  localStorage.setItem('authUsername', data.username);
  localStorage.setItem('authRole',     data.role);
}

function clearSession() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUsername');
  localStorage.removeItem('authRole');
}

function getSession() {
  return {
    token:    localStorage.getItem('authToken'),
    username: localStorage.getItem('authUsername'),
    role:     localStorage.getItem('authRole')
  };
}

function requireAuth() {
  const { token } = getSession();
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  const { role } = getSession();
  return role === 'ADMIN';
}

function initUserDisplay() {
  const { username, role } = getSession();
  const usernameEls = document.querySelectorAll('.username-display');
  const roleEls     = document.querySelectorAll('.role-display');
  const avatarEls   = document.querySelectorAll('.user-avatar');

  usernameEls.forEach(el => el.textContent = username || 'User');
  roleEls.forEach(el => {
    el.textContent = role || 'USER';
    el.className += role === 'ADMIN' ? ' badge-admin' : ' badge-user';
  });
  avatarEls.forEach(el => {
    el.textContent = (username || 'U')[0].toUpperCase();
  });

  // Hide admin-only elements
  if (role !== 'ADMIN') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

// ── Alert Helper ───────────────────────────────────────────────────────────────

function showAlert(elId, message, type = 'error') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `auth-alert ${type} show`;
  el.innerHTML = `${message}`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

// ── Login Form ─────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showAlert('loginAlert', 'Please fill in all fields', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Signing in…';

  try {
    const data = await AuthAPI.login({ username, password });
    saveSession(data);
    showAlert('loginAlert', 'Login successful! Redirecting…', 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 800);
  } catch (err) {
    showAlert('loginAlert', err.message || 'Login failed', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

// ── Register Form ──────────────────────────────────────────────────────────────

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;
  const role     = document.querySelector('input[name="role"]:checked')?.value || 'USER';

  if (!username || !email || !password) {
    showAlert('registerAlert', 'Please fill in all fields', 'error');
    return;
  }
  if (password !== confirm) {
    showAlert('registerAlert', 'Passwords do not match', 'error');
    return;
  }
  if (password.length < 6) {
    showAlert('registerAlert', 'Password must be at least 6 characters', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Creating account…';

  try {
    const data = await AuthAPI.register({ username, email, password, role });
    saveSession(data);
    showAlert('registerAlert', 'Account created! Redirecting…', 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 800);
  } catch (err) {
    showAlert('registerAlert', err.message || 'Registration failed', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
}
