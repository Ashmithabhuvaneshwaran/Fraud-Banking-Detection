/**
 * transaction.js — Transaction list, add, and detail pages
 * Features: search, filter, pagination, CSV export, ML explanation
 */

let allTransactions = [];
let filteredTransactions = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let mlPreviewDebounce = null;

// ══════════════════════════════════════════════════════════════════════════
// INDEX PAGE — Transaction Table
// ══════════════════════════════════════════════════════════════════════════

async function initTransactionList() {
  if (!requireAuth()) return;
  initUserDisplay();
  showTableLoading();

  try {
    allTransactions = await TransactionAPI.getAll();
    filteredTransactions = [...allTransactions];
    renderTable();
    updateTableStats();
  } catch (err) {
    showTableError(err.message);
  }

  // Search
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  document.getElementById('confidenceFilter')?.addEventListener('change', applyFilters);
  document.getElementById('exportBtn')?.addEventListener('click', exportCSV);
}

function applyFilters() {
  const search     = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const status     = document.getElementById('statusFilter')?.value || 'all';
  const confidence = document.getElementById('confidenceFilter')?.value || 'all';

  filteredTransactions = allTransactions.filter(t => {
    const matchSearch =
      t.transactionId?.toLowerCase().includes(search) ||
      t.sender?.toLowerCase().includes(search) ||
      t.receiver?.toLowerCase().includes(search) ||
      t.location?.toLowerCase().includes(search);

    const matchStatus =
      status === 'all' ||
      (status === 'fraud' && t.fraud) ||
      (status === 'safe'  && !t.fraud);

    const matchConf =
      confidence === 'all' ||
      t.confidence?.toUpperCase() === confidence.toUpperCase();

    return matchSearch && matchStatus && matchConf;
  });

  currentPage = 1;
  renderTable();
  updateTableStats();
}

function renderTable() {
  const tbody = document.getElementById('txnTableBody');
  if (!tbody) return;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredTransactions.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="flex-center" style="padding:50px;color:var(--text-muted)">
      <div style="text-align:center"><div style="margin-top:8px;font-size:14px;font-weight:500">No transactions found</div></div>
    </td></tr>`;
    renderPagination();
    return;
  }

  tbody.innerHTML = page.map((t, idx) => `
    <tr class="${t.fraud ? 'fraud-row' : 'safe-row'} fade-in" style="animation-delay:${idx * 0.03}s">
      <td>
        <code style="color:var(--accent-cyan);font-size:11px">${t.transactionId || '—'}</code>
      </td>
      <td>
        <div style="font-weight:600">${t.sender || '—'}</div>
        <div style="font-size:11px;color:var(--text-muted)">${t.location || ''}</div>
      </td>
      <td style="color:var(--text-secondary);font-size:12px">${t.receiver || '—'}</td>
      <td class="fw-700">${formatCurrency(t.amount)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="score-bar" style="width:55px">
            <div class="score-fill ${scoreClass(t.fraudScore)}" style="width:${t.fraudScore || 0}%"></div>
          </div>
          <span style="font-size:13px;font-weight:700;color:${getScoreColor(t.fraudScore || 0)}">${t.fraudScore || 0}</span>
        </div>
      </td>
      <td>${t.fraud
        ? '<span class="badge badge-fraud">FRAUD</span>'
        : '<span class="badge badge-safe">SAFE</span>'}</td>
      <td>
        ${t.fraudReasons?.length
          ? `<div style="font-size:11px;color:var(--text-secondary);max-width:180px">
               ${t.fraudReasons.slice(0,2).map(r => `<div>• ${r}</div>`).join('')}
               ${t.fraudReasons.length > 2 ? `<div style="color:var(--text-muted)">+${t.fraudReasons.length-2} more</div>` : ''}
             </div>`
          : '<span style="color:var(--text-muted);font-size:12px">None</span>'}
      </td>
      <td>
        <span class="badge ${t.detectionMethod === 'ML+RULES' ? 'badge-user' : 'badge-medium'}" style="font-size:10px">
          ${t.detectionMethod || 'RULES'}
        </span>
      </td>
      <td style="color:var(--text-secondary);font-size:11px">${formatDate(t.createdAt)}</td>
      <td>
        ${requireAdmin()
          ? `<button class="btn btn-danger btn-sm" onclick="deleteTransaction('${t.transactionId}')">Del</button>`
          : ''}
      </td>
    </tr>
  `).join('');

  renderPagination();
}

function renderPagination() {
  const total  = filteredTransactions.length;
  const pages  = Math.ceil(total / PAGE_SIZE);
  const el     = document.getElementById('pagination');
  if (!el) return;

  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 2) {
      html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>›</button>`;
  el.innerHTML = html;
}

function goPage(page) {
  const total = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  if (page < 1 || page > total) return;
  currentPage = page;
  renderTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateTableStats() {
  const total = filteredTransactions.length;
  const fraud = filteredTransactions.filter(t => t.fraud).length;
  setText2('count-total', total);
  setText2('count-fraud', fraud);
  setText2('count-safe',  total - fraud);
}

function scoreClass(score) { return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'; }

// Delete Transaction
async function deleteTransaction(id) {
  if (!confirm(`Delete transaction ${id}? This cannot be undone.`)) return;
  try {
    await TransactionAPI.delete(id);
    allTransactions = allTransactions.filter(t => t.transactionId !== id);
    applyFilters();
    showToast('Transaction deleted successfully', 'success');
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// CSV Export
function exportCSV() {
  const headers = ['Transaction ID','Sender','Receiver','Amount','Fraud Score','Status','Confidence','Method','Date'];
  const rows = filteredTransactions.map(t => [
    t.transactionId, t.sender, t.receiver, t.amount,
    t.fraudScore, t.fraud ? 'FRAUD' : 'SAFE',
    t.confidence, t.detectionMethod,
    formatDate(t.createdAt)
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'fraud-transactions.csv'; a.click();
  URL.revokeObjectURL(url);
}

function showTableLoading() {
  const tbody = document.getElementById('txnTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:60px">
    <div class="flex-center" style="gap:12px"><div class="spinner"></div><span style="color:var(--text-secondary)">Loading transactions…</span></div>
  </td></tr>`;
}

function showTableError(msg) {
  const tbody = document.getElementById('txnTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:60px;color:var(--accent-red)">
    Error: ${msg}
  </td></tr>`;
}

// ══════════════════════════════════════════════════════════════════════════
// ADD TRANSACTION PAGE
// ══════════════════════════════════════════════════════════════════════════

async function initAddTransaction() {
  if (!requireAuth()) return;
  initUserDisplay();

  // Auto-generate transaction ID
  const txnIdEl = document.getElementById('transactionId');
  if (txnIdEl) txnIdEl.value = generateTxnId();

  // Auto-fill sender if not admin
  const senderEl = document.getElementById('sender');
  if (senderEl) {
    const { username, role } = getSession();
    if (role !== 'ADMIN') {
      senderEl.value = username || '';
      senderEl.readOnly = true;
      senderEl.style.background = 'var(--bg-secondary)';
      senderEl.style.cursor = 'not-allowed';
      senderEl.style.color = 'var(--text-secondary)';
    }
  }

  // Real-time ML preview on any input change
  const previewFields = ['amount','hour','loginAttempts','accountAge','device','transactionType'];
  previewFields.forEach(id => {
    document.getElementById(id)?.addEventListener('input', debouncedPreview);
    document.getElementById(id)?.addEventListener('change', debouncedPreview);
  });

  // Form submit
  document.getElementById('addTxnForm')?.addEventListener('submit', submitTransaction);
}

function debouncedPreview() {
  clearTimeout(mlPreviewDebounce);
  mlPreviewDebounce = setTimeout(runMLPreview, 500);
}

async function runMLPreview() {
  const amount        = parseFloat(document.getElementById('amount')?.value)      || 0;
  const hour          = parseInt(document.getElementById('hour')?.value)           || 12;
  const loginAttempts = parseInt(document.getElementById('loginAttempts')?.value) || 1;
  const accountAge    = parseInt(document.getElementById('accountAge')?.value)    || 12;
  const device        = document.getElementById('device')?.value || 'Old';
  const txType        = document.getElementById('transactionType')?.value || 'NEFT';

  if (amount <= 0) return;

  showPreviewLoading();

  try {
    const payload = {
      amount, hour, loginAttempts, accountAge,
      isNewDevice: device === 'New' ? 1 : 0,
      isNight:     hour < 6 ? 1 : 0,
      transactionType: txType
    };
    const result = await ModelAPI.predictDirect(payload);
    renderMLPreview(result);
  } catch {
    // Fallback: simple rule-based preview
    const score = computeQuickScore({ amount, hour, loginAttempts, accountAge, device });
    renderMLPreview({
      fraudScore:       score,
      fraudProbability: score / 100,
      isFraud:          score >= 40,
      confidence:       score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW',
      explanation: { topReasons: [], isAnomaly: score >= 50, source: 'CLIENT_RULES' }
    });
  }
}

function computeQuickScore({ amount, hour, loginAttempts, accountAge, device }) {
  let s = 0;
  if (amount > 50000) s += 25;
  else if (amount > 10000) s += 10;
  if (hour < 6) s += 20;
  if (loginAttempts >= 3) s += 20;
  if (accountAge < 3) s += 20;
  if (device === 'New') s += 15;
  return Math.min(100, s);
}

function showPreviewLoading() {
  const el = document.getElementById('mlPreviewSection');
  if (el) el.style.opacity = '0.6';
}

function renderMLPreview(result) {
  const section = document.getElementById('mlPreviewSection');
  if (!section) return;
  section.style.opacity = '1';
  section.style.display = 'block';

  const score = result.fraudScore || 0;
  const isFraud = result.isFraud;
  const color = getScoreColor(score);

  // Score meter
  setText2('preview-score', score);
  setText2('preview-pct',   (result.fraudProbability * 100).toFixed(1) + '%');
  setText2('preview-conf',  result.confidence);
  const scoreEl = document.getElementById('preview-score');
  if (scoreEl) scoreEl.style.color = color;

  // Animated arc
  const fill = document.getElementById('scoreArcFill');
  if (fill) {
    const pct = score / 100;
    const circumference = 2 * Math.PI * 70;
    fill.style.strokeDashoffset = circumference * (1 - pct);
    fill.style.stroke = color;
  }

  // Status badge
  const statusEl = document.getElementById('preview-status');
  if (statusEl) {
    statusEl.innerHTML = isFraud
      ? '<span class="badge badge-fraud" style="font-size:14px;padding:6px 16px">LIKELY FRAUD</span>'
      : '<span class="badge badge-safe" style="font-size:14px;padding:6px 16px">LIKELY SAFE</span>';
  }

  // Explanation reasons
  const reasonsEl = document.getElementById('preview-reasons');
  if (reasonsEl && result.explanation?.topReasons?.length) {
    reasonsEl.innerHTML = result.explanation.topReasons.map((r, i) => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;font-weight:600">${['&#9679;','&#9679;','&#9679;'][i] || '&#9679;'} ${r.description || r.feature}</span>
          <span style="font-size:13px;color:${color};font-weight:700">+${(r.impact * 100).toFixed(0)}%</span>
        </div>
        <div class="score-bar">
          <div class="score-fill ${scoreClass2(r.impact*100)}" style="width:${(r.impact*100).toFixed(0)}%;transition:width 0.6s ease"></div>
        </div>
      </div>
    `).join('');
  } else if (reasonsEl) {
    reasonsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px">No major risk factors detected</div>';
  }
}

function scoreClass2(s) { return s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low'; }
function scoreClass(s) { return s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low'; }

async function submitTransaction(e) {
  e.preventDefault();
  const btn = document.getElementById('submitTxnBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> Analysing…';

  const data = {
    transactionId:   document.getElementById('transactionId')?.value,
    sender:          document.getElementById('sender')?.value,
    receiver:        document.getElementById('receiver')?.value,
    amount:          parseFloat(document.getElementById('amount')?.value),
    location:        document.getElementById('location')?.value,
    device:          document.getElementById('device')?.value,
    transactionType: document.getElementById('transactionType')?.value,
    loginAttempts:   parseInt(document.getElementById('loginAttempts')?.value) || 1,
    accountAge:      parseInt(document.getElementById('accountAge')?.value) || 12,
    ipAddress:       document.getElementById('ipAddress')?.value,
    hour:            parseInt(document.getElementById('hour')?.value) || new Date().getHours()
  };

  try {
    const result = await TransactionAPI.create(data);
    showResultModal(result);
    // Reset form after success
    document.getElementById('addTxnForm')?.reset();
    document.getElementById('transactionId').value = generateTxnId();
    document.getElementById('mlPreviewSection').style.display = 'none';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Submit &amp; Analyse';
  }
}

function showResultModal(txn) {
  const modal = document.getElementById('resultModal');
  if (!modal) return;

  const score = txn.fraudScore || 0;
  const color = getScoreColor(score);

  document.getElementById('result-txn-id').textContent   = txn.transactionId;
  document.getElementById('result-score').textContent    = score;
  document.getElementById('result-score').style.color    = color;
  document.getElementById('result-method').textContent   = txn.detectionMethod || '—';

  const statusEl = document.getElementById('result-status');
  if (statusEl) {
    statusEl.innerHTML = txn.fraud
      ? '<span class="badge badge-fraud" style="font-size:16px;padding:8px 20px">FRAUD DETECTED</span>'
      : '<span class="badge badge-safe"  style="font-size:16px;padding:8px 20px">SAFE TRANSACTION</span>';
  }

  const reasonsEl = document.getElementById('result-reasons');
  if (reasonsEl) {
    reasonsEl.innerHTML = txn.fraudReasons?.length
      ? txn.fraudReasons.map(r => `<li style="margin-bottom:6px;font-size:13px">• ${r}</li>`).join('')
      : '<li style="color:var(--text-muted)">No significant risk factors detected</li>';
  }

  modal.style.display = 'flex';
}

function closeResultModal() {
  const modal = document.getElementById('resultModal');
  if (modal) modal.style.display = 'none';
}

// ── Toast Notification ────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type}`;
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    max-width:360px; animation:fadeIn 0.3s ease;
  `;
  toast.innerHTML = `${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function setText2(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
