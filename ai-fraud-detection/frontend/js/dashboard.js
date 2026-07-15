/**
 * dashboard.js — Dashboard page logic
 * Loads KPI cards, Chart.js charts, ML accuracy widget
 * Auto-refreshes every 5 seconds
 */

let fraudDoughnutChart = null;
let dailyBarChart      = null;
let trendLineChart     = null;
let refreshInterval    = null;

// ── Init ───────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initUserDisplay();
  await loadDashboard();
  await loadMLStats();
  startAutoRefresh();
});

// ── Data Loading ───────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const data = await DashboardAPI.getDashboard();
    updateKPICards(data);
    updateCharts(data);
    updateRecentTable(data.recentTransactions || []);
  } catch (err) {
    console.error('Dashboard error:', err);
    showDemoData();
  }
}

async function loadMLStats() {
  try {
    const stats = await ModelAPI.getStats();
    if (stats && !stats.error) updateMLAccuracyWidget(stats);
  } catch (err) {
    updateMLAccuracyWidget({ accuracy: 0.95, f1: 0.89, auc_roc: 0.97, recall: 0.92 });
  }
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────

function updateKPICards(data) {
  setText('stat-total',   data.totalTransactions  || 0);
  setText('stat-fraud',   data.fraudTransactions  || 0);
  setText('stat-safe',    data.safeTransactions   || 0);
  setText('stat-pct',    (data.fraudPercentage    || 0) + '%');
  setText('stat-amount', formatCurrency(data.totalAmount  || 0));
  setText('stat-famount',formatCurrency(data.fraudAmount  || 0));
}

function getChartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    grid: styles.getPropertyValue('--chart-grid').trim() || '#222222',
    ticks: styles.getPropertyValue('--chart-ticks').trim() || '#a0a0a0',
    labels: styles.getPropertyValue('--chart-labels').trim() || '#ffffff'
  };
}

// ── Charts ─────────────────────────────────────────────────────────────────────

function updateCharts(data) {
  const safe  = data.safeTransactions  || 0;
  const fraud = data.fraudTransactions || 0;
  const colors = getChartColors();

  // Doughnut — Fraud vs Safe
  const dctx = document.getElementById('fraudDoughnutChart')?.getContext('2d');
  if (dctx) {
    if (fraudDoughnutChart) fraudDoughnutChart.destroy();
    fraudDoughnutChart = new Chart(dctx, {
      type: 'doughnut',
      data: {
        labels: ['Safe', 'Fraud'],
        datasets: [{
          data: [safe, fraud],
          backgroundColor: ['rgba(16,185,129,0.85)', 'rgba(255,0,60,0.85)'],
          borderColor:     ['#10b981', '#ff003c'],
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { position: 'bottom', labels: { color: colors.ticks, padding: 16, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} transactions` } }
        },
        animation: { animateScale: true, duration: 800 }
      }
    });
  }

  // Bar — Daily Transactions
  const bctx = document.getElementById('dailyBarChart')?.getContext('2d');
  if (bctx && data.dailyCounts) {
    const labels = Object.keys(data.dailyCounts).map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    });
    const values = Object.values(data.dailyCounts);

    if (dailyBarChart) dailyBarChart.destroy();
    dailyBarChart = new Chart(bctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Transactions',
          data: values,
          backgroundColor: 'rgba(168,85,247,0.6)',
          borderColor:     '#a855f7',
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: colors.grid }, ticks: { color: colors.ticks } },
          y: { grid: { color: colors.grid }, ticks: { color: colors.ticks }, beginAtZero: true }
        },
        animation: { duration: 700 }
      }
    });
  }

  // Line — Fraud Trend
  const lctx = document.getElementById('trendLineChart')?.getContext('2d');
  if (lctx && data.dailyCounts) {
    const labels = Object.keys(data.dailyCounts).map(d =>
      new Date(d).toLocaleDateString('en-US', { weekday: 'short' })
    );
    // Simulated fraud trend (proportional)
    const fraudValues = Object.values(data.dailyCounts).map(v =>
      Math.floor(v * (data.fraudPercentage || 5) / 100)
    );

    if (trendLineChart) trendLineChart.destroy();
    trendLineChart = new Chart(lctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Fraud Cases',
          data: fraudValues,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168,85,247,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#a855f7',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: colors.grid }, ticks: { color: colors.ticks } },
          y: { grid: { color: colors.grid }, ticks: { color: colors.ticks }, beginAtZero: true }
        },
        animation: { duration: 700 }
      }
    });
  }
}

window.addEventListener('themeChanged', () => {
  loadDashboard();
});

// ── ML Stats Widget ────────────────────────────────────────────────────────────

function updateMLAccuracyWidget(stats) {
  setText('ml-accuracy', ((stats.accuracy || 0) * 100).toFixed(1) + '%');
  setText('ml-f1',       ((stats.f1       || 0) * 100).toFixed(1) + '%');
  setText('ml-recall',   ((stats.recall   || 0) * 100).toFixed(1) + '%');
  setText('ml-aucroc',   ((stats.auc_roc  || 0) * 100).toFixed(1) + '%');
  setText('ml-algorithm', stats.algorithm || 'RandomForest + IsolationForest');
  setText('ml-version',   stats.model_version || '2.0');
  setText('ml-trained',   stats.trained_at ? formatDate(stats.trained_at) : 'Unknown');
}

// ── Recent Transactions Table ─────────────────────────────────────────────────

function updateRecentTable(transactions) {
  const tbody = document.getElementById('recentTableBody');
  if (!tbody) return;
  if (!transactions.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px">No transactions yet</td></tr>';
    return;
  }
  tbody.innerHTML = transactions.map(t => `
    <tr class="${t.fraud ? 'fraud-row' : 'safe-row'}">
      <td><code style="color:var(--accent-cyan);font-size:12px">${truncate(t.transactionId, 16)}</code></td>
      <td>${truncate(t.sender)}</td>
      <td class="fw-600">${formatCurrency(t.amount)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="score-bar" style="width:60px">
            <div class="score-fill ${scoreClass(t.fraudScore)}" style="width:${t.fraudScore}%"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${getScoreColor(t.fraudScore)}">${t.fraudScore}</span>
        </div>
      </td>
      <td>${t.fraud
        ? '<span class="badge badge-fraud">Fraud</span>'
        : '<span class="badge badge-safe">Safe</span>'}</td>
      <td>${getConfidenceBadge(t.confidence)}</td>
      <td style="color:var(--text-secondary);font-size:12px">${formatDate(t.createdAt)}</td>
    </tr>
  `).join('');
}

function scoreClass(score) {
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

// ── Auto Refresh ───────────────────────────────────────────────────────────────

function startAutoRefresh() {
  refreshInterval = setInterval(async () => {
    await loadDashboard();
    flashRefresh();
  }, 5000);
}

function flashRefresh() {
  const badge = document.getElementById('refreshBadge');
  if (badge) {
    badge.style.opacity = '0.5';
    setTimeout(() => badge.style.opacity = '1', 300);
  }
}

// ── Demo Data (when backend is down) ──────────────────────────────────────────

function showDemoData() {
  const demo = {
    totalTransactions: 1248,
    fraudTransactions: 87,
    safeTransactions:  1161,
    fraudPercentage:   6.97,
    totalAmount:       18540000,
    fraudAmount:       3200000,
    dailyCounts: {
      [daysAgo(6)]: 180, [daysAgo(5)]: 210, [daysAgo(4)]: 165,
      [daysAgo(3)]: 230, [daysAgo(2)]: 195, [daysAgo(1)]: 248, [daysAgo(0)]: 220
    },
    recentTransactions: []
  };
  updateKPICards(demo);
  updateCharts(demo);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ── Utility ────────────────────────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
