// Apex Broker Web Terminal Client Engine

let API_URL = window.location.origin;
if (window.location.hostname === 'localhost' && window.location.port === '5500') {
  API_URL = 'http://localhost:3000';
}

let activeAccountId = 'demo_001';
let accounts = [];
let positions = [];
let livePrices = {};
let previousPrices = {};
let ws = null;
let equityChart = null;
let dailyPnlChart = null;
let currentTab = 'terminal';
let tradeDebounceTimer = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initSystemClock();
  initCharts();
  initWebSocket();
  loadAccounts();
  loadAllPrices();

  // Setup auto-refresh fallback every 10s
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      refreshActiveData();
    }
  }, 10000);

  // Setup account selector change listener
  document.getElementById('account-selector').addEventListener('change', (e) => {
    activeAccountId = e.target.value;
    const tradeFilter = document.getElementById('trade-filter-account');
    if (tradeFilter) {
      tradeFilter.value = activeAccountId;
    }
    refreshActiveData();
  });
});

// Live System Clock
function initSystemClock() {
  const clockEl = document.getElementById('system-time');
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  };
  update();
  setInterval(update, 1000);
}

// WebSocket Live Sync
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('⚡ Connected to Live Broker WebSocket');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'INIT') {
          livePrices = msg.data.prices || {};
          renderTickerBar();
        } else if (msg.type === 'PRICE_TICK') {
          for (const [sym, pData] of Object.entries(msg.data)) {
            previousPrices[sym] = livePrices[sym] ? livePrices[sym].price : pData.price;
            livePrices[sym] = pData;
          }
          renderTickerBar();
          updateOpenPositionsPrices();
        } else if (msg.type === 'POSITION_OPENED') {
          showToast(`🚀 [${msg.data.account.name}] Opened ${msg.data.position.side} ${msg.data.position.quantity} ${msg.data.position.symbol} @ $${msg.data.position.entry_price}`, 'success');
          refreshActiveData();
        } else if (msg.type === 'POSITION_CLOSED') {
          const t = msg.data.trade;
          const pnlColor = t.net_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
          showToast(`🏁 [${msg.data.account.name}] Closed ${t.symbol} (${t.exit_reason}) | P&L: $${t.net_pnl}`, t.net_pnl >= 0 ? 'success' : 'warning');
          refreshActiveData();
        }
      } catch (e) {
        console.error('WS Message Parse Error:', e);
      }
    };

    ws.onclose = () => {
      console.log('WS Connection closed, retrying in 4s...');
      setTimeout(initWebSocket, 4000);
    };

    ws.onerror = () => {
      // Handled in onclose
    };
  } catch (e) {
    console.warn('WebSocket init skipped or running purely on REST API');
  }
}

// REST API Helper
async function api(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    return await res.json();
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    return { success: false, error: err.message };
  }
}

// Load Accounts List
async function loadAccounts() {
  const res = await api('/api/accounts');
  if (res.success && res.accounts) {
    accounts = res.accounts;
    if (accounts.length > 0 && !accounts.some(a => a.id === activeAccountId)) {
      activeAccountId = accounts[0].id;
    }
    renderAccountSelectors();
    updateKpis();
    loadPositions();
    loadAnalyticsData();
  }
}

// Render Account Switcher Dropdown
function renderAccountSelectors() {
  const selector = document.getElementById('account-selector');
  const tvSelector = document.getElementById('tv-target-account');
  const simSelector = document.getElementById('sim-account');
  const tradeFilter = document.getElementById('trade-filter-account');

  const prevTradeFilter = tradeFilter ? tradeFilter.value : null;

  selector.innerHTML = '';
  tvSelector.innerHTML = '';
  simSelector.innerHTML = '';
  
  if (tradeFilter) {
    tradeFilter.innerHTML = '<option value="all">All Accounts (Combined)</option>';
    accounts.forEach(acc => {
      const isSelected = acc.id === activeAccountId;
      tradeFilter.innerHTML += `<option value="${acc.id}" ${isSelected ? 'selected' : ''}>${acc.name}</option>`;
    });
    tradeFilter.value = activeAccountId;
  }

  renderManageAccountsList();
  generateTvSnippets();
}

// Update Top KPI Cards
function updateKpis() {
  const currentAcc = accounts.find(a => a.id === activeAccountId) || accounts[0];
  if (!currentAcc) return;

  document.getElementById('stat-balance').textContent = `$${currentAcc.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('stat-initial-bal').textContent = `Starting: $${currentAcc.initial_balance.toLocaleString()}`;
  document.getElementById('stat-equity').textContent = `$${currentAcc.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const unPnlEl = document.getElementById('stat-unrealized-pnl');
  unPnlEl.textContent = `${currentAcc.unrealizedPnl >= 0 ? '+' : ''}$${currentAcc.unrealizedPnl.toFixed(2)}`;
  unPnlEl.className = `font-mono font-semibold ${currentAcc.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  const netPnlEl = document.getElementById('stat-net-pnl');
  netPnlEl.textContent = `${currentAcc.totalNetPnl >= 0 ? '+' : ''}$${currentAcc.totalNetPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  netPnlEl.className = `text-xl font-bold font-mono ${currentAcc.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  const roi = currentAcc.initial_balance > 0 ? (((currentAcc.equity - currentAcc.initial_balance) / currentAcc.initial_balance) * 100) : 0;
  const roiEl = document.getElementById('stat-roi');
  roiEl.textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`;
  document.getElementById('stat-roi-badge').className = `text-[10px] mt-1 font-semibold flex items-center space-x-1 ${roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  document.getElementById('stat-win-rate').textContent = `${currentAcc.winRate.toFixed(1)}%`;
  document.getElementById('stat-wins-losses').textContent = `${currentAcc.winningTradesCount}W / ${currentAcc.losingTradesCount}L (${currentAcc.totalTrades} total)`;
  document.getElementById('stat-profit-factor').textContent = currentAcc.profitFactor.toFixed(2);
  document.getElementById('stat-drawdown').textContent = `Max DD: ${currentAcc.maxDrawdown.toFixed(1)}%`;

  document.getElementById('stat-strategy').textContent = currentAcc.assigned_strategy || 'General TradingView';
  document.getElementById('stat-leverage').textContent = `Lev: ${currentAcc.leverage}x`;
  document.getElementById('stat-free-margin').textContent = `Free: $${currentAcc.freeMargin.toLocaleString()}`;
}

// Load and Render Active Positions
async function loadPositions() {
  const res = await api(`/api/positions?account_id=${activeAccountId}`);
  if (res.success) {
    positions = res.positions || [];
    renderPositionsTable();
  }
}

function renderPositionsTable() {
  const tbody = document.getElementById('positions-tbody');
  const countTag = document.getElementById('positions-count-tag');
  const badge = document.getElementById('open-positions-badge');

  countTag.textContent = `(${positions.length} Open)`;
  if (positions.length > 0) {
    badge.textContent = positions.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  if (positions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-8 text-slate-500 font-sans">
          No active open positions for this account. Send a TradingView webhook or use the Signal Simulator to open a trade.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = positions.map(pos => {
    const isLong = pos.side === 'BUY';
    const sideBadge = isLong
      ? `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">LONG</span>`
      : `<span class="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold">SHORT</span>`;

    const liveData = livePrices[pos.symbol];
    const markPrice = liveData ? liveData.price : pos.current_price;

    let unPnl = pos.unrealized_pnl;
    if (pos.side === 'BUY') {
      unPnl = (markPrice - pos.entry_price) * pos.quantity;
    } else {
      unPnl = (pos.entry_price - markPrice) * pos.quantity;
    }

    const roi = pos.margin_used > 0 ? (unPnl / pos.margin_used) * 100 : 0;
    const pnlClass = unPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';

    let riskBadge = [];
    if (pos.stop_loss) riskBadge.push(`SL: $${pos.stop_loss}`);
    if (pos.take_profit) riskBadge.push(`TP: $${pos.take_profit}`);
    if (pos.trailing_stop_active) riskBadge.push(`Trailing ($${pos.trailing_stop_distance})`);
    const riskText = riskBadge.length > 0 ? riskBadge.join(' | ') : '<span class="text-slate-500">None</span>';

    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3 px-4 font-bold text-white">${pos.symbol}</td>
        <td class="py-3 px-4">${sideBadge}</td>
        <td class="py-3 px-4">${pos.quantity}</td>
        <td class="py-3 px-4">$${pos.entry_price.toLocaleString()}</td>
        <td class="py-3 px-4 font-semibold mark-price-${pos.symbol}">$${markPrice.toLocaleString()}</td>
        <td class="py-3 px-4 text-xs font-sans text-slate-300">${riskText}</td>
        <td class="py-3 px-4 text-slate-400">$${pos.margin_used.toFixed(2)}</td>
        <td class="py-3 px-4 font-bold ${pnlClass}">
          ${unPnl >= 0 ? '+' : ''}$${unPnl.toFixed(2)}
        </td>
        <td class="py-3 px-4 font-bold ${pnlClass}">
          ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%
        </td>
        <td class="py-3 px-4 text-right space-x-1 font-sans">
          <button onclick="openModifyRiskModal('${pos.id}', ${pos.stop_loss || 'null'}, ${pos.take_profit || 'null'}, ${pos.trailing_stop_distance || 'null'})" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-semibold border border-slate-700">
            Edit SL/TP
          </button>
          <button onclick="closeSinglePosition('${pos.id}')" class="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded text-[11px] font-semibold border border-rose-500/30">
            Close
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateOpenPositionsPrices() {
  if (positions.length === 0) return;
  renderPositionsTable();
}

// Top Scrolling Real-Time Price Ticker
async function loadAllPrices() {
  const res = await api('/api/prices');
  if (res.success && res.prices) {
    livePrices = res.prices;
    renderTickerBar();
  }
}

function renderTickerBar() {
  const container = document.getElementById('ticker-items');
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSD', 'EURUSD', 'GBPUSD'];

  let html = '';
  symbols.forEach(sym => {
    const data = livePrices[sym];
    if (data) {
      const prev = previousPrices[sym] || data.price;
      const isUp = data.price >= prev;
      const flashClass = isUp ? 'text-emerald-400' : 'text-rose-400';
      const formattedPrice = sym.includes('USD') && !sym.includes('BTC') && !sym.includes('ETH') && !sym.includes('XAU') && !sym.includes('SOL')
        ? data.price.toFixed(4)
        : data.price.toLocaleString('en-US', { minimumFractionDigits: 2 });

      html += `
        <div class="flex items-center space-x-1.5 font-mono cursor-pointer hover:text-white" onclick="populateSimSymbol('${sym}')">
          <span class="text-slate-300 font-bold">${sym}:</span>
          <span class="${flashClass} font-semibold">$${formattedPrice}</span>
        </div>
      `;
    }
  });

  if (html) container.innerHTML = html;
}

// Chart.js Visualizations
function initCharts() {
  const ctxEquity = document.getElementById('equityChart').getContext('2d');
  const ctxDaily = document.getElementById('dailyPnlChart').getContext('2d');

  equityChart = new Chart(ctxEquity, {
    type: 'line',
    data: {
      labels: ['Start'],
      datasets: [{
        label: 'Account Equity ($)',
        data: [10000],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx) => `Equity: $${parseFloat(ctx.raw).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: {
            color: '#64748b',
            font: { size: 10 },
            callback: (val) => `$${val.toLocaleString()}`
          }
        }
      }
    }
  });

  dailyPnlChart = new Chart(ctxDaily, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Daily Net P&L ($)',
        data: [],
        backgroundColor: (ctx) => {
          const val = ctx.raw;
          return val >= 0 ? '#10b981' : '#f43f5e';
        },
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: {
            color: '#64748b',
            font: { size: 10 },
            callback: (val) => `$${val}`
          }
        }
      }
    }
  });
}

// Load Analytics & Comparison Matrix
async function loadAnalyticsData() {
  const [cmpRes, eqRes, dailyRes] = await Promise.all([
    api('/api/analytics/compare'),
    api(`/api/analytics/equity-curve?account_id=${activeAccountId}`),
    api(`/api/analytics/daily-pnl?account_id=${activeAccountId}`)
  ]);

  if (cmpRes.success && cmpRes.comparison) {
    renderComparisonTable(cmpRes.comparison);
  }

  // Update Equity Curve
  if (eqRes.success && eqRes.snapshots) {
    const snaps = eqRes.snapshots;
    if (snaps.length > 0) {
      equityChart.data.labels = snaps.map(s => s.created_at.slice(11, 19));
      equityChart.data.datasets[0].data = snaps.map(s => s.equity);
    } else {
      const cur = accounts.find(a => a.id === activeAccountId);
      equityChart.data.labels = ['Start', 'Now'];
      equityChart.data.datasets[0].data = [cur ? cur.initial_balance : 10000, cur ? cur.equity : 10000];
    }
    equityChart.update();
  }

  // Update Daily P&L Chart
  if (dailyRes.success && dailyRes.daily) {
    dailyPnlChart.data.labels = dailyRes.daily.map(d => d.date);
    dailyPnlChart.data.datasets[0].data = dailyRes.daily.map(d => d.daily_net_pnl);
    dailyPnlChart.update();
  }
}

// Render Side-by-Side Comparison Matrix
function renderComparisonTable(comparison) {
  const tbody = document.getElementById('comparison-tbody');
  // Sort by Net P&L descending
  const sorted = [...comparison].sort((a, b) => b.totalNetPnl - a.totalNetPnl);

  tbody.innerHTML = sorted.map((item, idx) => {
    const isFirst = idx === 0 && item.totalNetPnl > 0;
    const rankBadge = isFirst
      ? `<span class="bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded text-xs">🥇 #1</span>`
      : `<span class="text-slate-400 font-bold">#${idx + 1}</span>`;

    const pnlClass = item.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const roiClass = item.totalRoiPct >= 0 ? 'text-emerald-400' : 'text-rose-400';

    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3 px-4">${rankBadge}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-white font-sans">${item.accountName}</div>
          <div class="text-[10px] text-indigo-400 font-sans">${item.strategy}</div>
        </td>
        <td class="py-3 px-4 text-slate-400">$${item.initialBalance.toLocaleString()}</td>
        <td class="py-3 px-4 font-bold text-cyan-300">$${item.equity.toLocaleString()}</td>
        <td class="py-3 px-4 font-bold ${pnlClass}">
          ${item.totalNetPnl >= 0 ? '+' : ''}$${item.totalNetPnl.toLocaleString()}
        </td>
        <td class="py-3 px-4 font-bold ${roiClass}">
          ${item.totalRoiPct >= 0 ? '+' : ''}${item.totalRoiPct.toFixed(2)}%
        </td>
        <td class="py-3 px-4 font-semibold text-slate-200">
          ${item.winRate.toFixed(1)}% <span class="text-slate-500 text-[10px]">(${item.winningTrades}W / ${item.losingTrades}L)</span>
        </td>
        <td class="py-3 px-4 font-bold text-white">${item.profitFactor.toFixed(2)}</td>
        <td class="py-3 px-4 text-xs text-slate-300">
          <span class="text-emerald-400">$${item.avgWin.toFixed(1)}</span> / <span class="text-rose-400">$${item.avgLoss.toFixed(1)}</span>
        </td>
        <td class="py-3 px-4 text-rose-400">${item.maxDrawdownPct.toFixed(1)}%</td>
        <td class="py-3 px-4 text-slate-300">${item.totalTrades}</td>
      </tr>
    `;
  }).join('');
}

// Load Trade History
async function loadTradesData() {
  const tradeFilterEl = document.getElementById('trade-filter-account');
  const accountFilter = tradeFilterEl ? tradeFilterEl.value : activeAccountId;
  const outcomeFilter = document.getElementById('trade-filter-outcome')?.value || 'all';
  const symbolFilter = document.getElementById('trade-filter-symbol')?.value?.trim() || '';

  let url = `/api/trades?limit=100`;
  if (accountFilter && accountFilter !== 'all') url += `&account_id=${encodeURIComponent(accountFilter)}`;
  if (outcomeFilter && outcomeFilter !== 'all') url += `&outcome=${encodeURIComponent(outcomeFilter)}`;
  if (symbolFilter) url += `&symbol=${encodeURIComponent(symbolFilter)}`;

  // Update export button href to match current account filter
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) {
    let exportUrl = '/api/trades/export';
    if (accountFilter && accountFilter !== 'all') {
      exportUrl += `?account_id=${encodeURIComponent(accountFilter)}`;
    }
    exportBtn.href = exportUrl;
  }

  const res = await api(url);
  if (res.success && res.trades) {
    renderTradesTable(res.trades);
  }
}

function debounceLoadTrades() {
  clearTimeout(tradeDebounceTimer);
  tradeDebounceTimer = setTimeout(loadTradesData, 300);
}

function renderTradesTable(trades) {
  const tbody = document.getElementById('trades-tbody');
  if (trades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-8 text-slate-500 font-sans">
          No trades found matching selected filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = trades.map(t => {
    const isLong = t.side === 'BUY';
    const sideBadge = isLong
      ? `<span class="text-emerald-400 font-bold">BUY</span>`
      : `<span class="text-rose-400 font-bold">SELL</span>`;

    const pnlClass = t.net_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const exitReasonBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-slate-800 border border-slate-700 text-slate-300">${t.exit_reason}</span>`;

    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3 px-4 text-slate-400 text-[11px]">${t.closed_at.replace('T', ' ').slice(0, 19)}</td>
        <td class="py-3 px-4 font-sans">
          <div class="text-white font-semibold">${t.account_name}</div>
          <div class="text-[10px] text-slate-400">${t.strategy || 'Default'}</div>
        </td>
        <td class="py-3 px-4 font-bold text-white">${t.symbol}</td>
        <td class="py-3 px-4">${sideBadge}</td>
        <td class="py-3 px-4">${t.quantity}</td>
        <td class="py-3 px-4 text-xs">
          <div>In: $${t.entry_price.toLocaleString()}</div>
          <div class="text-slate-400">Out: $${t.exit_price.toLocaleString()}</div>
        </td>
        <td class="py-3 px-4">${exitReasonBadge}</td>
        <td class="py-3 px-4 text-slate-400">$${t.fees.toFixed(2)}</td>
        <td class="py-3 px-4 font-bold ${pnlClass}">
          ${t.net_pnl >= 0 ? '+' : ''}$${t.net_pnl.toFixed(2)}
        </td>
        <td class="py-3 px-4 font-bold ${pnlClass}">
          ${t.pnl_percent >= 0 ? '+' : ''}${t.pnl_percent.toFixed(2)}%
        </td>
        <td class="py-3 px-4 text-slate-400 text-xs">${formatDuration(t.duration_seconds)}</td>
      </tr>
    `;
  }).join('');
}

function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${(sec / 3600).toFixed(1)}h`;
}

// Load Webhook Audit Logs
async function loadWebhookLogs() {
  const res = await api('/api/webhook/logs?limit=50');
  if (res.success && res.logs) {
    renderWebhookLogsTable(res.logs);
  }
}

function renderWebhookLogsTable(logs) {
  const tbody = document.getElementById('webhook-logs-tbody');
  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-slate-500 font-sans">
          No webhook requests received yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(l => {
    let statusBadge = '';
    if (l.status === 'SUCCESS') statusBadge = '<span class="text-emerald-400 font-bold">SUCCESS</span>';
    else if (l.status === 'IGNORED_DUPLICATE') statusBadge = '<span class="text-amber-400 font-bold">DUPLICATE</span>';
    else statusBadge = '<span class="text-rose-400 font-bold">' + l.status + '</span>';

    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-2.5 px-4 text-slate-400 text-[10px]">${l.created_at.replace('T', ' ').slice(0, 19)}</td>
        <td class="py-2.5 px-4">${statusBadge}</td>
        <td class="py-2.5 px-4 text-slate-300 font-sans">${l.account_id || 'N/A'}</td>
        <td class="py-2.5 px-4 font-bold text-white">${l.action || '-'}</td>
        <td class="py-2.5 px-4 text-cyan-300">${l.symbol || '-'}</td>
        <td class="py-2.5 px-4 max-w-xs truncate text-[10px] text-slate-400" title="${escapeHtml(l.raw_payload)}">${escapeHtml(l.raw_payload)}</td>
        <td class="py-2.5 px-4 text-xs font-sans ${l.status === 'SUCCESS' ? 'text-slate-300' : 'text-rose-400'}">${l.response_message || ''}</td>
      </tr>
    `;
  }).join('');
}

// Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('text-cyan-400', 'border-b-2', 'border-cyan-500');
    b.classList.add('text-slate-400');
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  const activeContent = document.getElementById(`tab-content-${tabId}`);
  if (activeBtn && activeContent) {
    activeBtn.classList.add('text-cyan-400', 'border-b-2', 'border-cyan-500');
    activeBtn.classList.remove('text-slate-400');
    activeContent.classList.remove('hidden');
  }

  if (tabId === 'compare') loadAnalyticsData();
  if (tabId === 'trades') {
    const tradeFilterEl = document.getElementById('trade-filter-account');
    if (tradeFilterEl && (tradeFilterEl.value === 'all' || tradeFilterEl.value === '')) {
      tradeFilterEl.value = activeAccountId;
    }
    loadTradesData();
  }
  if (tabId === 'webhooks') loadWebhookLogs();
}

// Refresh active view
function refreshActiveData() {
  loadAccounts();
  loadPositions();
  if (currentTab === 'compare') loadAnalyticsData();
  if (currentTab === 'trades') loadTradesData();
  if (currentTab === 'webhooks') loadWebhookLogs();
}

function refreshAllData() {
  const icon = document.getElementById('refresh-icon');
  icon.classList.add('fa-spin');
  refreshActiveData();
  setTimeout(() => icon.classList.remove('fa-spin'), 600);
}

// Actions: Close Positions
async function closeSinglePosition(posId) {
  if (!confirm('Are you sure you want to close this position?')) return;
  const res = await api(`/api/positions/close/${posId}`, { method: 'POST' });
  if (res.success) {
    showToast(`Position closed at $${res.trade.exit_price}`, 'success');
    refreshActiveData();
  } else {
    showToast(res.error || 'Failed to close position', 'error');
  }
}

async function closeAllCurrentPositions() {
  if (!confirm('Are you sure you want to CLOSE ALL open positions for this account?')) return;
  const res = await api('/api/positions/close-all', {
    method: 'POST',
    body: JSON.stringify({ account_id: activeAccountId })
  });
  if (res.success) {
    showToast(`Closed ${res.trades.length} positions`, 'success');
    refreshActiveData();
  } else {
    showToast(res.error || 'Failed to close all', 'error');
  }
}

// TradingView Snippet Generator
function generateTvSnippets() {
  const targetAcc = document.getElementById('tv-target-account').value || activeAccountId;
  const secret = document.getElementById('tv-secret-key').value || 'antigravity_tv_secret_2026';
  const webhookUrl = `${window.location.origin}/api/webhook`;

  document.getElementById('tv-webhook-url').value = webhookUrl;

  const buyPayload = {
    secret: secret,
    account_id: targetAcc,
    symbol: "{{ticker}}",
    action: "BUY",
    quantity: 0.05,
    stop_loss: 94500,
    take_profit: 98000,
    trailing_stop: 500,
    strategy: "Apex Strategy 1",
    price: "{{close}}"
  };

  const sellPayload = {
    secret: secret,
    account_id: targetAcc,
    symbol: "{{ticker}}",
    action: "SELL",
    quantity: 0.05,
    stop_loss: 97500,
    take_profit: 93000,
    trailing_stop: 500,
    strategy: "Apex Strategy 1",
    price: "{{close}}"
  };

  document.getElementById('snippet-buy-json').value = JSON.stringify(buyPayload, null, 2);
  document.getElementById('snippet-sell-json').value = JSON.stringify(sellPayload, null, 2);

  const pineScriptSnippet = `// Add this to your Pine Script strategy for automated webhook alerts:
if (longCondition)
    alert('{"secret":"${secret}","account_id":"${targetAcc}","symbol":"' + syminfo.ticker + '","action":"BUY","quantity":0.05,"price":' + str.tostring(close) + ',"strategy":"' + syminfo.ticker + ' Strategy"}', alert.freq_once_per_bar_close)

if (shortCondition)
    alert('{"secret":"${secret}","account_id":"${targetAcc}","symbol":"' + syminfo.ticker + '","action":"SELL","quantity":0.05,"price":' + str.tostring(close) + ',"strategy":"' + syminfo.ticker + ' Strategy"}', alert.freq_once_per_bar_close)`;

  document.getElementById('snippet-pinescript').value = pineScriptSnippet;
}

// Signal Simulator Form Submission
async function executeSimulatedSignal(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-fire-sim');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Firing...';

  const payload = {
    secret: document.getElementById('tv-secret-key').value || 'antigravity_tv_secret_2026',
    account_id: document.getElementById('sim-account').value,
    symbol: document.getElementById('sim-symbol').value.toUpperCase().trim(),
    action: document.getElementById('sim-action').value,
    quantity: parseFloat(document.getElementById('sim-qty').value) || 0.01,
    stop_loss: parseFloat(document.getElementById('sim-sl').value) || null,
    take_profit: parseFloat(document.getElementById('sim-tp').value) || null,
    trailing_stop: parseFloat(document.getElementById('sim-trailing').value) || null,
    strategy: document.getElementById('sim-strategy').value.trim()
  };

  const res = await api('/api/webhook', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  btn.disabled = false;
  btn.innerHTML = '⚡ Fire Webhook Signal';

  if (res.success) {
    showToast(res.message || 'Signal executed successfully', 'success');
    closeModal('modal-simulator');
    refreshActiveData();
  } else {
    showToast(res.error || 'Signal failed', 'error');
  }
}

// Demo Account Manager Functions
function renderManageAccountsList() {
  const container = document.getElementById('accounts-list-container');
  container.innerHTML = accounts.map(acc => `
    <div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
      <div>
        <div class="font-bold text-white text-xs">${acc.name} <span class="text-cyan-400 font-mono">(${acc.id})</span></div>
        <div class="text-[10px] text-slate-400">Equity: $${acc.equity.toLocaleString()} | Lev: ${acc.leverage}x | Fee: ${(acc.fee_rate * 100).toFixed(2)}%</div>
      </div>
      <div class="flex items-center space-x-1.5">
        <button onclick="resetAccount('${acc.id}')" class="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-semibold" title="Reset to initial balance">
          Reset
        </button>
        <button onclick="deleteAccount('${acc.id}')" class="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-semibold">
          Delete
        </button>
      </div>
    </div>
  `).join('');
}

async function createDemoAccount(e) {
  e.preventDefault();
  const name = document.getElementById('new-acc-name').value.trim();
  const strategy = document.getElementById('new-acc-strategy').value.trim();
  const initialBalance = parseFloat(document.getElementById('new-acc-balance').value) || 10000;
  const leverage = parseFloat(document.getElementById('new-acc-leverage').value) || 10;
  const feeRate = (parseFloat(document.getElementById('new-acc-fee').value) || 0.04) / 100;

  const res = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name,
      assigned_strategy: strategy,
      initial_balance: initialBalance,
      leverage,
      fee_rate: feeRate
    })
  });

  if (res.success) {
    showToast(`Created account: ${name}`, 'success');
    document.getElementById('create-account-form').reset();
    loadAccounts();
  } else {
    showToast(res.error || 'Failed to create account', 'error');
  }
}

async function resetAccount(accId) {
  if (!confirm('Are you sure you want to reset this account? All open positions and trade history will be wiped.')) return;
  const res = await api(`/api/accounts/${accId}/reset`, { method: 'POST' });
  if (res.success) {
    showToast(res.message, 'success');
    loadAccounts();
  } else {
    showToast(res.error || 'Failed to reset', 'error');
  }
}

async function deleteAccount(accId) {
  if (accounts.length <= 1) {
    alert('Cannot delete the last remaining account.');
    return;
  }
  if (!confirm(`Are you sure you want to delete account ${accId}?`)) return;
  const res = await api(`/api/accounts/${accId}`, { method: 'DELETE' });
  if (res.success) {
    showToast('Account deleted', 'success');
    if (activeAccountId === accId) {
      activeAccountId = accounts.find(a => a.id !== accId).id;
    }
    loadAccounts();
  }
}

// Modify Risk Modal
function openModifyRiskModal(posId, sl, tp, trailing) {
  document.getElementById('modify-pos-id').value = posId;
  document.getElementById('modify-pos-sl').value = sl || '';
  document.getElementById('modify-pos-tp').value = tp || '';
  document.getElementById('modify-pos-trailing').value = trailing || '';
  openModal('modal-modify-risk');
}

async function savePositionRisk(e) {
  e.preventDefault();
  const posId = document.getElementById('modify-pos-id').value;
  const sl = document.getElementById('modify-pos-sl').value;
  const tp = document.getElementById('modify-pos-tp').value;
  const trailing = document.getElementById('modify-pos-trailing').value;

  const res = await api(`/api/positions/${posId}`, {
    method: 'PUT',
    body: JSON.stringify({
      stopLoss: sl ? parseFloat(sl) : null,
      takeProfit: tp ? parseFloat(tp) : null,
      trailingStopDistance: trailing ? parseFloat(trailing) : null
    })
  });

  if (res.success) {
    showToast('Position risk updated', 'success');
    closeModal('modal-modify-risk');
    refreshActiveData();
  } else {
    showToast(res.error || 'Failed to update', 'error');
  }
}

// Helper Utilities
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openWebhookGeneratorModal() {
  generateTvSnippets();
  openModal('modal-webhook-setup');
}

function openSimulatorModal() {
  openModal('modal-simulator');
}

function openManageAccountsModal() {
  renderManageAccountsList();
  openModal('modal-manage-accounts');
}

function populateSimSymbol(sym) {
  document.getElementById('sim-symbol').value = sym;
  openSimulatorModal();
}

function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  el.select();
  document.execCommand('copy');
  showToast('Copied to clipboard!', 'info');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  let bg = 'bg-slate-900 border-slate-700 text-white';
  if (type === 'success') bg = 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200';
  if (type === 'warning') bg = 'bg-amber-950/90 border-amber-500/50 text-amber-200';
  if (type === 'error') bg = 'bg-rose-950/90 border-rose-500/50 text-rose-200';

  toast.className = `p-3 rounded-xl border text-xs font-semibold shadow-xl flex items-center space-x-2 transition-all transform duration-300 opacity-0 translate-y-2 pointer-events-auto ${bg}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check text-emerald-400' : (type === 'error' ? 'fa-triangle-exclamation text-rose-400' : 'fa-circle-info text-cyan-400')}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
