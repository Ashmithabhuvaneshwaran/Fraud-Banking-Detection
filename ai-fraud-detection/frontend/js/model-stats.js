/**
 * model-stats.js — ML Model Performance Page
 * Shows accuracy, confusion matrix, feature importance, retrain,
 * and dataset upload with drag-and-drop.
 */

let featureChart    = null;
let statusPollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initUserDisplay();
  await loadModelStats();
  await loadFeatureImportance();
  await loadDatasetInfo();
  initRetrainButton();
  initDatasetUpload();
});

// ── Dataset Info ───────────────────────────────────────────────────────────────

async function loadDatasetInfo() {
  try {
    const info = await apiFetch(`${ML_BASE}/upload/dataset/info`);
    const el   = document.getElementById('datasetInfoPanel');
    if (!el) return;
    if (info.exists && !info.error) {
      el.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
          <div style="width:40px;height:40px;background:rgba(16,217,126,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--accent-teal);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:var(--accent-green)">
              Dataset Loaded
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px">
              <span style="background:var(--bg-input);padding:4px 10px;border-radius:100px">
                Rows: ${info.rows?.toLocaleString()}
              </span>
              <span style="background:rgba(239,68,68,0.15);color:var(--accent-red);padding:4px 10px;border-radius:100px">
                Fraud: ${info.fraud?.toLocaleString()}
              </span>
              <span style="background:rgba(16,185,129,0.15);color:var(--accent-green);padding:4px 10px;border-radius:100px">
                Safe: ${info.safe?.toLocaleString()}
              </span>
              <span style="background:var(--bg-input);padding:4px 10px;border-radius:100px">
                Rate: ${info.fraudRate}
              </span>
            </div>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;background:rgba(245,158,11,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--accent-yellow);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--accent-yellow)">No Dataset on Disk</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:3px">Using synthetic data. Upload a real dataset below for better accuracy.</div>
          </div>
        </div>`;
    }
  } catch {
    // ML service offline — silent fail
  }
}

// ── Dataset Upload ─────────────────────────────────────────────────────────────

function initDatasetUpload() {
  const dropzone  = document.getElementById('uploadDropzone');
  const fileInput = document.getElementById('datasetFileInput');
  if (!dropzone || !fileInput) return;

  // Click to browse
  dropzone.addEventListener('click', () => fileInput.click());

  // Drag events
  dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
  });

  // Auto-retrain toggle
  document.getElementById('uploadBtn')?.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) { showToast2('Please select a file first', 'warning'); return; }
    uploadDataset(file);
  });
}

function handleFileSelected(file) {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext     = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showToast2(`"${ext}" not supported. Use .csv, .xlsx, or .xls`, 'error');
    return;
  }

  // Show preview
  const preview = document.getElementById('uploadPreview');
  if (preview) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    preview.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:14px;background:rgba(20,184,166,0.07);border:1px solid rgba(20,184,166,0.2);border-radius:10px">
        <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:var(--accent-teal);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${file.name}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${sizeMB} MB · ${ext.toUpperCase()}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="uploadBtn">Upload &amp; Train</button>
      </div>`;

    document.getElementById('uploadBtn')?.addEventListener('click', () => uploadDataset(file));
  }
}

async function uploadDataset(file) {
  const progressEl = document.getElementById('uploadProgress');
  const statusEl   = document.getElementById('uploadStatusMsg');

  const setStatus = (msg, color = 'var(--text-secondary)') => {
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color; }
  };

  // Show progress bar
  if (progressEl) progressEl.style.display = 'block';
  setStatus('Uploading file…');

  const autoRetrain = document.getElementById('autoRetrainToggle')?.checked !== false;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('auto_retrain', autoRetrain ? 'true' : 'false');

  try {
    // Disable upload button
    const btn = document.getElementById('uploadBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

    const res = await fetch(`${ML_BASE}/upload/dataset`, {
      method: 'POST',
      body:   formData
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    // Success
    setStatus(`Uploaded: ${result.message}`, 'var(--accent-green)');
    showToast2(`Uploaded! ${result.rows?.toLocaleString()} rows · ${result.fraudCases} fraud cases`, 'success');

    // Show upload result summary
    const summaryEl = document.getElementById('uploadSummary');
    if (summaryEl) {
      summaryEl.style.display = 'block';
      summaryEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;padding:16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px">
          <div style="text-align:center"><div style="font-size:20px;font-weight:800">${result.rows?.toLocaleString()}</div><div style="font-size:11px;color:var(--text-secondary)">Total Rows</div></div>
          <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:var(--accent-red)">${result.fraudCases?.toLocaleString()}</div><div style="font-size:11px;color:var(--text-secondary)">Fraud Cases</div></div>
          <div style="text-align:center"><div style="font-size:20px;font-weight:800">${result.fraudRate}</div><div style="font-size:11px;color:var(--text-secondary)">Fraud Rate</div></div>
          <div style="text-align:center"><div style="font-size:18px;font-weight:700;color:${result.autoRetrain ? 'var(--accent-blue)' : 'var(--text-muted)'}">${result.autoRetrain ? 'Training…' : 'Skipped'}</div><div style="font-size:11px;color:var(--text-secondary)">Model Retrain</div></div>
        </div>`;
    }

    // Poll retraining status if auto-retrain was triggered
    if (autoRetrain && result.autoRetrain) {
      setStatus('Model retraining in background… this may take a minute.', 'var(--accent-blue)');
      startStatusPolling(setStatus);
    }

    // Refresh dataset info
    await loadDatasetInfo();

  } catch (err) {
    setStatus(`Error: ${err.message}`, 'var(--accent-red)');
    showToast2('Upload failed: ' + err.message, 'error');
    const btn = document.getElementById('uploadBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Upload & Train'; }
  }
}

function startStatusPolling(setStatus) {
  if (statusPollTimer) clearInterval(statusPollTimer);
  let polls = 0;
  statusPollTimer = setInterval(async () => {
    polls++;
    if (polls > 60) { clearInterval(statusPollTimer); return; } // 5 min max

    try {
      const s = await apiFetch(`${ML_BASE}/upload/status`);
      if (s.status === 'done') {
        clearInterval(statusPollTimer);
        setStatus('Model retrained successfully!', 'var(--accent-green)');
        showToast2('Model updated! Refreshing stats…', 'success');
        setTimeout(async () => {
          await loadModelStats();
          await loadFeatureImportance();
        }, 1000);
      } else if (s.status === 'error') {
        clearInterval(statusPollTimer);
        setStatus(`Retrain error: ${s.error}`, 'var(--accent-red)');
      } else if (s.status === 'retraining') {
        setStatus(`Training in progress… (${polls * 5}s elapsed)`, 'var(--accent-blue)');
      }
    } catch {
      // ignore poll errors
    }
  }, 5000);
}

// ── Load Model Metrics ─────────────────────────────────────────────────────────

async function loadModelStats() {
  try {
    const stats = await ModelAPI.getStats();
    if (stats.error) {
      showStatsError(stats.error);
      return;
    }
    renderMetricCards(stats);
    renderConfusionMatrix(stats.confusion_matrix);
    renderMetaInfo(stats);
  } catch (err) {
    showStatsError(err.message);
  }
}

function renderMetricCards(stats) {
  const metrics = [
    { id: 'metric-accuracy',  val: stats.accuracy,  label: 'Accuracy',  color: '#0ea5e9', icon: 'TGT' },
    { id: 'metric-precision', val: stats.precision, label: 'Precision', color: '#7c3aed', icon: 'PRE' },
    { id: 'metric-recall',    val: stats.recall,    label: 'Recall',    color: '#10d97e', icon: 'REC' },
    { id: 'metric-f1',        val: stats.f1,        label: 'F1 Score',  color: '#f59e0b', icon: 'F1S' },
    { id: 'metric-aucroc',    val: stats.auc_roc,   label: 'AUC-ROC',   color: '#f43f5e', icon: 'AUC' }
  ];

  metrics.forEach(m => {
    const el = document.getElementById(m.id);
    if (!el) return;
    const pct = ((m.val || 0) * 100).toFixed(2);
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <div style="background:${m.color}20;font-size:13px;font-weight:700;width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:${m.color}">${m.icon}</div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${m.label}</div>
          <div style="font-size:30px;font-weight:800;color:${m.color}">${pct}%</div>
        </div>
      </div>
      <div class="score-bar" style="margin-top:14px;height:5px">
        <div style="height:100%;width:${pct}%;background:${m.color};border-radius:3px;transition:width 1s ease"></div>
      </div>
    `;
  });

  // Dataset stats
  setText('stat-total-samples', (stats.total_samples || 0).toLocaleString());
  setText('stat-fraud-cases',   (stats.fraud_cases   || 0).toLocaleString());
  setText('stat-train-samples', (stats.train_samples || 0).toLocaleString());
  setText('stat-test-samples',  (stats.test_samples  || 0).toLocaleString());
}

// ── Confusion Matrix ──────────────────────────────────────────────────────────

function renderConfusionMatrix(matrix) {
  const el = document.getElementById('confusionMatrix');
  if (!el || !matrix) return;

  const [[tn, fp], [fn, tp]] = matrix;
  const total = tn + fp + fn + tp;
  const maxVal = Math.max(tn, fp, fn, tp);

  const cell = (val, label, color, textColor = 'white') => `
    <div style="
      background:${color};
      padding:24px;
      border-radius:12px;
      text-align:center;
      position:relative;
    ">
      <div style="font-size:32px;font-weight:800;color:${textColor}">${val.toLocaleString()}</div>
      <div style="font-size:12px;color:${textColor === 'white' ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)'};margin-top:4px;font-weight:500">${label}</div>
      <div style="font-size:11px;color:${textColor === 'white' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)'};margin-top:2px">${total > 0 ? ((val/total)*100).toFixed(1) : 0}%</div>
    </div>
  `;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${cell(tn, 'True Negative',  'rgba(16,185,129,0.2)', 'var(--accent-green)')}
      ${cell(fp, 'False Positive', 'rgba(245,158,11,0.2)', 'var(--accent-yellow)')}
      ${cell(fn, 'False Negative', 'rgba(239,68,68,0.2)',  'var(--accent-red)')}
      ${cell(tp, 'True Positive',  'rgba(59,130,246,0.85)')}
    </div>
    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
      <div style="color:var(--accent-teal)">Correctly identified safe</div>
      <div style="color:var(--accent-yellow)">Safe flagged as fraud</div>
      <div style="color:var(--accent-red)">Fraud missed</div>
      <div style="color:var(--accent-blue)">Correctly caught fraud</div>
    </div>
  `;
}

// ── Feature Importance Chart ──────────────────────────────────────────────────

async function loadFeatureImportance() {
  try {
    const features = await ModelAPI.getFeatures();
    if (Array.isArray(features) && features.length) {
      renderFeatureChart(features);
      renderFeatureTable(features);
    }
  } catch (err) {
    console.warn('Feature importance load failed:', err.message);
  }
}

function getChartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    grid: styles.getPropertyValue('--chart-grid').trim() || '#222222',
    ticks: styles.getPropertyValue('--chart-ticks').trim() || '#a0a0a0',
    labels: styles.getPropertyValue('--chart-labels').trim() || '#ffffff'
  };
}

function renderFeatureChart(features) {
  const ctx = document.getElementById('featureImportanceChart')?.getContext('2d');
  if (!ctx) return;

  const labels = features.map(f => f.description || f.feature);
  const values = features.map(f => (f.importance * 100).toFixed(2));
  const colors = [
    'rgba(168,85,247,0.8)', 'rgba(124,58,237,0.8)', 'rgba(255,193,7,0.8)',
    'rgba(16,185,129,0.8)', 'rgba(0,188,212,0.8)',  'rgba(255,87,34,0.8)',
    'rgba(233,30,99,0.8)',  'rgba(192,132,252,0.8)'
  ];
  const chartColors = getChartColors();

  if (featureChart) featureChart.destroy();
  featureChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Importance (%)',
        data: values,
        backgroundColor: colors.slice(0, features.length),
        borderColor:     colors.slice(0, features.length).map(c => c.replace('0.8', '1')),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `Impact: ${ctx.raw}%` } }
      },
      scales: {
        x: {
          grid: { color: chartColors.grid },
          ticks: { color: chartColors.ticks, callback: v => v + '%' },
          beginAtZero: true
        },
        y: { grid: { display: false }, ticks: { color: chartColors.labels, font: { weight: '500' } } }
      },
      animation: { duration: 1000 }
    }
  });
}

window.addEventListener('themeChanged', () => {
  loadFeatureImportance();
});

function renderFeatureTable(features) {
  const tbody = document.getElementById('featureTableBody');
  if (!tbody) return;
  tbody.innerHTML = features.map((f, i) => `
    <tr>
      <td style="font-weight:600;color:var(--text-secondary)">${i + 1}</td>
      <td><code style="color:var(--accent-cyan)">${f.feature}</code></td>
      <td>${f.description || f.feature}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="score-bar" style="width:100px">
            <div class="score-fill ${impClass(f.importance)}" style="width:${(f.importance*100).toFixed(0)}%"></div>
          </div>
          <span style="font-weight:700;font-size:13px">${(f.importance*100).toFixed(2)}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

function impClass(imp) { return imp >= 0.25 ? 'high' : imp >= 0.12 ? 'medium' : 'low'; }

// ── Meta Info ─────────────────────────────────────────────────────────────────

function renderMetaInfo(stats) {
  setText('meta-version',   stats.model_version || '2.0');
  setText('meta-algorithm', stats.algorithm || 'RandomForest + IsolationForest + SMOTE');
  setText('meta-trained',   stats.trained_at ? formatDate(stats.trained_at) : 'Unknown');
}

// ── Retrain ───────────────────────────────────────────────────────────────────

function initRetrainButton() {
  const btn = document.getElementById('retrainBtn');
  if (!btn) return;

  // Hide if not admin
  if (!requireAdmin()) { btn.style.display = 'none'; return; }

  btn.addEventListener('click', async () => {
    if (!confirm('Retrain the model? This may take a few minutes.')) return;
    btn.disabled = true;
      btn.innerHTML = 'Retraining…';

    try {
      const result = await ModelAPI.retrain({});
      showToast2(result.message || 'Retraining started in background', 'success');
      setTimeout(loadModelStats, 3000);
    } catch (err) {
      showToast2('Retrain failed: ' + err.message, 'error');
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = 'Retrain Model';
      }, 3000);
    }
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function showStatsError(msg) {
  const el = document.getElementById('statsError');
  if (el) { el.style.display = 'flex'; el.querySelector('span').textContent = msg; }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast2(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type}`;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:360px;animation:fadeIn 0.3s ease;';
  toast.innerHTML = `${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
