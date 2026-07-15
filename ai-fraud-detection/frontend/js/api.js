/**
 * api.js — Centralised API Client
 * All backend calls go through this module.
 * Base URL: http://localhost:9090/api
 */

const API_BASE = 'http://localhost:9090/api';
const ML_BASE  = 'http://localhost:5000';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('authToken');
}

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = 'login.html';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Auth APIs ──────────────────────────────────────────────────────────────────

const AuthAPI = {
  login:    (data) => apiFetch(`${API_BASE}/auth/login`,    { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => apiFetch(`${API_BASE}/auth/register`, { method: 'POST', body: JSON.stringify(data) })
};

// ── Transaction APIs ───────────────────────────────────────────────────────────

const TransactionAPI = {
  getAll:   ()   => apiFetch(`${API_BASE}/transactions`),
  getById:  (id) => apiFetch(`${API_BASE}/transactions/${id}`),
  create:   (data) => apiFetch(`${API_BASE}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
  delete:   (id) => apiFetch(`${API_BASE}/transactions/${id}`, { method: 'DELETE' }),
  getFraud: ()   => apiFetch(`${API_BASE}/fraud`),
  getSafe:  ()   => apiFetch(`${API_BASE}/safe`)
};

// ── Dashboard APIs ─────────────────────────────────────────────────────────────

const DashboardAPI = {
  getDashboard:  () => apiFetch(`${API_BASE}/dashboard`),
  getStatistics: () => apiFetch(`${API_BASE}/statistics`)
};

// ── ML Model APIs ──────────────────────────────────────────────────────────────

const ModelAPI = {
  getStats:    () => apiFetch(`${API_BASE}/model/stats`),
  getFeatures: () => apiFetch(`${API_BASE}/model/features`),
  retrain:     (data) => apiFetch(`${API_BASE}/model/retrain`, { method: 'POST', body: JSON.stringify(data || {}) }),

  // Direct Flask calls for real-time preview
  predictDirect: (data) => apiFetch(`${ML_BASE}/predict`, { method: 'POST', body: JSON.stringify(data) }),
  healthCheck:   () => apiFetch(`${ML_BASE}/health`)
};

// ── Utility ────────────────────────────────────────────────────────────────────

function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getScoreColor(score) {
  if (score >= 70) return '#a855f7';
  if (score >= 40) return '#f59e0b';
  return '#10b981';
}

function getConfidenceBadge(confidence) {
  const map = {
    HIGH:   'badge-high',
    MEDIUM: 'badge-medium',
    LOW:    'badge-low'
  };
  return `<span class="badge ${map[confidence] || 'badge-low'}">${confidence || 'LOW'}</span>`;
}

function truncate(str, len = 20) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function generateTxnId() {
  return 'TXN' + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();
}
