/**
 * APEX PRO TERMINAL — Core Application Controller & Multi-View Engine
 * Supports: Dashboard Hub (Home Screen), Trading Workstation, Full-Page Analytics, Settings
 */

class ApexTerminalApp {
  constructor() {
    this.dataStore = window.TERMINAL_HISTORICAL_DATA || {};
    this.currentView = 'dashboard';

    // Multi-Account System
    this.accounts = [];
    this.activeAccount = null;
    this.analyticsAccount = null;

    // Active Trading Parameters
    this.activeSymbol = 'XAUUSD';
    this.activeTimeframe = '15m';
    this.chartLayout = '1';

    // Chart References
    this.charts = {};
    this.series = {};
    this.volumeSeries = {};
    this.activePriceLines = [];

    // Analytics Chart References
    this.analyticsEquityChart = null;

    // Replay State
    this.replayIndex = 0;
    this.isPlaying = false;
    this.replaySpeed = 1.0;
    this.replayInterval = null;
    this.availableCandles = [];

    // On-chart Risk/Reward Sizer
    this.longShortTool = {
      active: false,
      type: 'LONG',
      entryPrice: 0,
      slPrice: 0,
      tpPrice: 0,
      riskPct: 1.0
    };

    // Filter & Search state for Dashboard
    this.dashboardFilter = {
      search: '',
      pair: 'ALL',
      status: 'ALL',
      sortBy: 'lastActivity'
    };

    this.init();
  }

  init() {
    this.loadAccounts();
    this.setupUIEventListeners();
    this.setupKeyboardShortcuts();
    this.initCreateAccountFormDateBounds();
    this.switchView('dashboard'); // DEFAULT HOME SCREEN
    this.showToast('Apex Pro Platform Ready', 'info');
  }

  // --- VIEW MANAGEMENT ---
  switchView(viewName, targetAccountId = null) {
    this.currentView = viewName;

    if (viewName !== 'terminal') {
      this.pause();
    }

    document.querySelectorAll('.app-view').forEach(view => {
      view.classList.remove('active');
    });
    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) targetEl.classList.add('active');

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    if (viewName === 'dashboard') {
      this.renderDashboard();
    } else if (viewName === 'terminal') {
      if (targetAccountId) {
        this.loadAccountIntoTerminal(targetAccountId);
      } else if (!this.activeAccount && this.accounts.length > 0) {
        this.loadAccountIntoTerminal(this.accounts[0].id);
      }
      setTimeout(() => {
        this.initAllCharts();
        this.updateAllChartsData();
        this.updatePriceLines();
        this.updateChartMarkers();
        this.resizeAllCharts();
      }, 60);
    } else if (viewName === 'analytics') {
      const acc = targetAccountId ? this.accounts.find(a => a.id === targetAccountId) : (this.activeAccount || this.accounts[0]);
      this.analyticsAccount = acc;
      this.renderFullAnalyticsView(acc);
    } else if (viewName === 'settings') {
      this.renderSettingsView();
    }
  }

  // --- ACCOUNTS & PERSISTENCE ---
  loadAccounts() {
    try {
      const saved = localStorage.getItem('APEX_PRO_TERMINAL_ACCOUNTS');
      if (saved) {
        this.accounts = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load accounts:', e);
    }

    if (!this.accounts || this.accounts.length === 0) {
      this.accounts = [
        {
          id: 'acc_xau_strategy',
          name: 'XAU Strategy Test',
          symbol: 'XAUUSD',
          timeframe: '15m',
          startingBalance: 10000,
          balance: 11420,
          equity: 11420,
          leverage: 100,
          riskPercent: 1.0,
          commission: 7.0,
          spread: 0.25,
          slippage: 0.05,
          startDate: '2026-06-19',
          endDate: '2026-08-19',
          startTimestamp: 1781821800,
          endTimestamp: 1787159700,
          currentReplayTimestamp: 1785000000,
          currentReplayIndex: 2480,
          status: 'in_progress',
          lastActivity: '2026-08-20 17:10',
          openPositions: [],
          tradeHistory: [
            {
              id: 'TRD-104921',
              symbol: 'XAUUSD',
              direction: 'BUY',
              entryDate: '2026-06-25 14:15',
              entryTime: 1782396900,
              exitDate: '2026-06-25 17:30',
              exitTime: 1782408600,
              entryPrice: 4215.50,
              exitPrice: 4235.00,
              size: 1.0,
              sl: 4205.00,
              tp: 4235.00,
              exitReason: 'Take Profit',
              grossPnl: 1950.00,
              commission: 7.0,
              spread: 25.0,
              slippage: 5.0,
              netPnl: 1943.00,
              rMultiple: 1.85,
              duration: '3h 15m',
              mfe: 1950.00,
              mae: 120.00,
              balanceBefore: 10000.00,
              balanceAfter: 11943.00
            },
            {
              id: 'TRD-104922',
              symbol: 'XAUUSD',
              direction: 'SELL',
              entryDate: '2026-07-02 09:00',
              entryTime: 1782982800,
              exitDate: '2026-07-02 11:15',
              exitTime: 1782990900,
              entryPrice: 4260.00,
              exitPrice: 4265.23,
              size: 1.0,
              sl: 4265.00,
              tp: 4240.00,
              exitReason: 'Stop Loss',
              grossPnl: -523.00,
              commission: 7.0,
              spread: 25.0,
              slippage: 5.0,
              netPnl: -523.00,
              rMultiple: -1.0,
              duration: '2h 15m',
              mfe: 80.00,
              mae: 523.00,
              balanceBefore: 11943.00,
              balanceAfter: 11420.00
            }
          ],
          equityCurve: [
            { time: 1781821800, datetimeStr: '2026-06-19 00:00', balance: 10000, equity: 10000, drawdown: 0, drawdownPct: 0 },
            { time: 1782408600, datetimeStr: '2026-06-25 17:30', balance: 11943, equity: 11943, drawdown: 0, drawdownPct: 0 },
            { time: 1782990900, datetimeStr: '2026-07-02 11:15', balance: 11420, equity: 11420, drawdown: 523, drawdownPct: 4.38 }
          ]
        },
        {
          id: 'acc_swing_eur',
          name: 'EUR/USD 4H Trend Momentum',
          symbol: 'EURUSD',
          timeframe: '4h',
          startingBalance: 50000,
          balance: 53250,
          equity: 53250,
          leverage: 100,
          riskPercent: 1.5,
          commission: 7.0,
          spread: 0.00015,
          slippage: 0.00005,
          startDate: '2025-09-01',
          endDate: '2026-08-19',
          startTimestamp: 1756760400,
          endTimestamp: 1787158800,
          currentReplayTimestamp: 1775000000,
          currentReplayIndex: 720,
          status: 'paused',
          lastActivity: '2026-08-18 10:45',
          openPositions: [],
          tradeHistory: [],
          equityCurve: [
            { time: 1756760400, datetimeStr: '2025-09-01', balance: 50000, equity: 50000, drawdown: 0, drawdownPct: 0 },
            { time: 1775000000, datetimeStr: '2026-04-10', balance: 53250, equity: 53250, drawdown: 450, drawdownPct: 0.84 }
          ]
        }
      ];
      this.saveAccounts();
    }

    const lastActiveId = localStorage.getItem('APEX_PRO_ACTIVE_ACC_ID');
    this.activeAccount = this.accounts.find(a => a.id === lastActiveId) || this.accounts[0];
  }

  saveAccounts() {
    try {
      localStorage.setItem('APEX_PRO_TERMINAL_ACCOUNTS', JSON.stringify(this.accounts));
      if (this.activeAccount) {
        localStorage.setItem('APEX_PRO_ACTIVE_ACC_ID', this.activeAccount.id);
      }
    } catch (e) {
      console.error('Error saving accounts:', e);
    }
  }

  // --- DATE MATCHING & BOUNDS ---
  findClosestCandleIndex(candles, dateString) {
    if (!candles || candles.length === 0) return 0;
    if (!dateString) return 0;

    const targetTs = Math.floor(new Date(dateString).getTime() / 1000);
    if (isNaN(targetTs)) {
      const prefixIdx = candles.findIndex(c => c.datetimeStr && c.datetimeStr.startsWith(dateString));
      return prefixIdx !== -1 ? prefixIdx : 0;
    }

    let bestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const diff = Math.abs(candles[i].time - targetTs);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  initCreateAccountFormDateBounds() {
    const symSelect = document.getElementById('create-acc-symbol');
    const tfSelect = document.getElementById('create-acc-timeframe');
    const startInput = document.getElementById('create-acc-start-date');
    const endInput = document.getElementById('create-acc-end-date');

    const updateBounds = () => {
      const sym = symSelect?.value || 'XAUUSD';
      const tf = tfSelect?.value || '15m';
      const candles = this.getCandlesForTimeframe(sym, tf);

      if (candles && candles.length > 0) {
        const firstDate = candles[0].datetimeStr.split(' ')[0];
        const lastDate = candles[candles.length - 1].datetimeStr.split(' ')[0];

        if (startInput) {
          startInput.min = firstDate;
          startInput.max = lastDate;
          startInput.value = firstDate;
        }
        if (endInput) {
          endInput.min = firstDate;
          endInput.max = lastDate;
          endInput.value = lastDate;
        }

        const infoEl = document.getElementById('create-acc-date-info');
        if (infoEl) {
          infoEl.textContent = `Available dataset: ${firstDate} → ${lastDate} (${candles.length.toLocaleString()} candles)`;
        }
      }
    };

    symSelect?.addEventListener('change', updateBounds);
    tfSelect?.addEventListener('change', updateBounds);
    updateBounds();
  }

  createNewAccount(params) {
    try {
      const sym = params.symbol || 'XAUUSD';
      const tf = params.timeframe || '15m';
      const candles = this.getCandlesForTimeframe(sym, tf);

      if (!candles || candles.length === 0) {
        this.showToast('No market data available for this selection', 'error');
        return false;
      }

      const actualStartIdx = this.findClosestCandleIndex(candles, params.startDate);
      const actualEndIdx = params.endDate ? this.findClosestCandleIndex(candles, params.endDate) : (candles.length - 1);

      const startCandle = candles[actualStartIdx] || candles[0];
      const endCandle = candles[actualEndIdx] || candles[candles.length - 1];

      const startingBal = Number(params.balance) || 10000;

      const newAcc = {
        id: 'acc_' + Date.now(),
        name: (params.name || 'My Backtest Strategy').trim(),
        symbol: sym,
        timeframe: tf,
        startingBalance: startingBal,
        balance: startingBal,
        equity: startingBal,
        leverage: Number(params.leverage) || 100,
        riskPercent: Number(params.riskPercent) || 1.0,
        commission: Number(params.commission) || 7.0,
        spread: Number(params.spread) || 0.25,
        slippage: Number(params.slippage) || 0.05,
        startDate: startCandle.datetimeStr.split(' ')[0],
        endDate: endCandle.datetimeStr.split(' ')[0],
        startTimestamp: startCandle.time,
        endTimestamp: endCandle.time,
        currentReplayTimestamp: startCandle.time,
        currentReplayIndex: actualStartIdx,
        status: 'not_started',
        lastActivity: new Date().toISOString().replace('T', ' ').substring(0, 16),
        openPositions: [],
        tradeHistory: [],
        equityCurve: [
          { time: startCandle.time, datetimeStr: startCandle.datetimeStr, balance: startingBal, equity: startingBal, drawdown: 0, drawdownPct: 0 }
        ]
      };

      this.accounts.unshift(newAcc);
      this.saveAccounts();
      this.renderDashboard();
      this.showToast(`Backtest account "${newAcc.name}" created!`, 'success');
      return true;
    } catch (e) {
      console.error('Error creating account:', e);
      this.showToast('Failed to create account: ' + e.message, 'error');
      return false;
    }
  }

  deleteAccount(accId) {
    const acc = this.accounts.find(a => a.id === accId);
    if (!acc) return;

    if (confirm(`Are you sure you want to permanently delete account "${acc.name}"?`)) {
      this.accounts = this.accounts.filter(a => a.id !== accId);
      if (this.activeAccount && this.activeAccount.id === accId) {
        this.activeAccount = this.accounts[0] || null;
      }
      this.saveAccounts();
      this.renderDashboard();
      this.showToast(`Account "${acc.name}" deleted`, 'warning');
    }
  }

  // --- DASHBOARD RENDERING ---
  renderDashboard() {
    const grid = document.getElementById('accounts-cards-grid');
    if (!grid) return;

    let list = [...this.accounts];

    if (this.dashboardFilter.search) {
      const q = this.dashboardFilter.search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q));
    }

    if (this.dashboardFilter.pair !== 'ALL') {
      list = list.filter(a => a.symbol === this.dashboardFilter.pair);
    }

    if (this.dashboardFilter.status !== 'ALL') {
      list = list.filter(a => a.status === this.dashboardFilter.status);
    }

    list.sort((a, b) => {
      const pA = a.balance - a.startingBalance;
      const pB = b.balance - b.startingBalance;
      const wrA = (a.tradeHistory.filter(t => t.netPnl > 0).length / (a.tradeHistory.length || 1));
      const wrB = (b.tradeHistory.filter(t => t.netPnl > 0).length / (b.tradeHistory.length || 1));

      if (this.dashboardFilter.sortBy === 'profit') return pB - pA;
      if (this.dashboardFilter.sortBy === 'winRate') return wrB - wrA;
      if (this.dashboardFilter.sortBy === 'name') return a.name.localeCompare(b.name);
      return (b.lastActivity || '').localeCompare(a.lastActivity || '');
    });

    const totalAccountsEl = document.getElementById('dash-overview-accounts');
    const totalTradesEl = document.getElementById('dash-overview-trades');
    const totalProfitEl = document.getElementById('dash-overview-profit');
    const avgWinRateEl = document.getElementById('dash-overview-winrate');

    const totalTrades = this.accounts.reduce((sum, a) => sum + (a.tradeHistory ? a.tradeHistory.length : 0), 0);
    const totalProfit = this.accounts.reduce((sum, a) => sum + (a.balance - a.startingBalance), 0);
    const winTrades = this.accounts.reduce((sum, a) => sum + (a.tradeHistory ? a.tradeHistory.filter(t => t.netPnl > 0).length : 0), 0);
    const globalWinRate = totalTrades > 0 ? Math.round((winTrades / totalTrades) * 100) : 0;

    if (totalAccountsEl) totalAccountsEl.textContent = this.accounts.length;
    if (totalTradesEl) totalTradesEl.textContent = totalTrades.toLocaleString();
    if (totalProfitEl) {
      totalProfitEl.textContent = `${totalProfit >= 0 ? '+' : ''}$${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      totalProfitEl.style.color = totalProfit >= 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)';
    }
    if (avgWinRateEl) avgWinRateEl.textContent = `${globalWinRate}%`;

    if (list.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 48px 20px; background:var(--bg-card); border-radius:12px; border:1px dashed var(--border-subtle);">
          <i data-lucide="folder-open" style="width:40px; height:40px; color:var(--text-dim); margin-bottom:12px;"></i>
          <h3 style="font-size:16px; margin-bottom:6px;">No Backtest Accounts Found</h3>
          <p style="font-size:12px; color:var(--text-secondary); margin-bottom:16px;">Create a new backtest simulation to start testing strategies candle-by-candle.</p>
          <button class="btn-create-acc" onclick="document.getElementById('modal-create-account').classList.add('active')">
            <i data-lucide="plus"></i> Create New Backtest
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    grid.innerHTML = list.map(acc => {
      const profit = Math.round((acc.balance - acc.startingBalance) * 100) / 100;
      const retPct = acc.startingBalance > 0 ? Math.round((profit / acc.startingBalance) * 10000) / 100 : 0;
      const trades = acc.tradeHistory || [];
      const totalCount = trades.length;
      const winCount = trades.filter(t => t.netPnl > 0).length;
      const winRate = totalCount > 0 ? Math.round((winCount / totalCount) * 100) : 0;

      let peak = acc.startingBalance;
      let maxDD = 0;
      let maxDDPct = 0;
      (acc.equityCurve || []).forEach(pt => {
        if (pt.balance > peak) peak = pt.balance;
        const dd = peak - pt.balance;
        const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
        if (ddPct > maxDDPct) maxDDPct = ddPct;
      });

      const totalSpan = (acc.endTimestamp - acc.startTimestamp) || 1;
      const currentSpan = (acc.currentReplayTimestamp - acc.startTimestamp) || 0;
      const progressPct = acc.status === 'completed' ? 100 : Math.min(100, Math.max(0, Math.round((currentSpan / totalSpan) * 100)));

      let statusLabel = '🟢 Not Started';
      let statusClass = 'not-started';
      let startBtnText = '▶ START BACKTEST';

      if (acc.status === 'in_progress') {
        statusLabel = '🔵 In Progress';
        statusClass = 'in-progress';
        startBtnText = '▶ CONTINUE BACKTEST';
      } else if (acc.status === 'paused') {
        statusLabel = '🟡 Paused';
        statusClass = 'paused';
        startBtnText = '▶ CONTINUE BACKTEST';
      } else if (acc.status === 'completed') {
        statusLabel = '🟣 Completed';
        statusClass = 'completed';
        startBtnText = '↻ REPLAY AGAIN';
      }

      const currentReplayDate = (acc.currentReplayTimestamp && !isNaN(acc.currentReplayTimestamp))
        ? new Date(acc.currentReplayTimestamp * 1000).toISOString().replace('T', ' ').substring(0, 16)
        : (acc.startDate || 'Start');

      return `
        <div class="account-card">
          <div class="acc-card-header">
            <div class="acc-title-area">
              <div class="acc-name">${acc.name}</div>
              <div class="acc-pair-badge">
                ${acc.symbol} • ${(acc.timeframe || '15m').toUpperCase()} • ${acc.leverage || 100}:1
              </div>
            </div>
            <span class="status-pill ${statusClass}">${statusLabel}</span>
          </div>

          <div class="acc-balance-row">
            <div class="acc-bal-from-to">
              <span style="color:var(--text-dim); font-size:13px;">$${(acc.startingBalance || 10000).toLocaleString()}</span>
              <span style="color:var(--text-dim);">→</span>
              <span style="color:#fff;">$${(acc.balance || 10000).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="acc-pnl-pill ${profit >= 0 ? 'positive' : 'negative'}">
              ${profit >= 0 ? '+' : ''}$${profit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${retPct}%)
            </div>
          </div>

          <div class="acc-metrics-mini">
            <div class="acc-mini-item">
              <span class="acc-mini-label">Trades</span>
              <span class="acc-mini-val">${totalCount}</span>
            </div>
            <div class="acc-mini-item">
              <span class="acc-mini-label">Win Rate</span>
              <span class="acc-mini-val" style="color:${winRate >= 50 ? 'var(--neon-emerald)' : 'var(--text-primary)'};">${winRate}%</span>
            </div>
            <div class="acc-mini-item">
              <span class="acc-mini-label">Max DD</span>
              <span class="acc-mini-val" style="color:var(--neon-crimson);">${maxDDPct.toFixed(1)}%</span>
            </div>
            <div class="acc-mini-item">
              <span class="acc-mini-label">Progress</span>
              <span class="acc-mini-val" style="color:var(--neon-gold);">${progressPct}%</span>
            </div>
          </div>

          <div class="acc-progress-section">
            <div class="acc-progress-header">
              <span>${acc.startDate || 'Start'} → ${acc.endDate || 'End'}</span>
              <span style="font-weight:700; color:var(--neon-gold);">${currentReplayDate.split(' ')[0]}</span>
            </div>
            <div class="acc-progress-track">
              <div class="acc-progress-fill" style="width:${progressPct}%;"></div>
            </div>
          </div>

          <div class="acc-card-actions">
            <button class="btn-card-start" onclick="window.terminalApp.startOrContinueAccount('${acc.id}')">
              ${startBtnText}
            </button>
            <button class="btn-card-analyze" onclick="window.terminalApp.openAccountAnalytics('${acc.id}')">
              <i data-lucide="bar-chart-2"></i> Analyze
            </button>
            <button class="btn-card-icon delete" title="Delete Account" onclick="window.terminalApp.deleteAccount('${acc.id}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  // --- START / CONTINUE / RESTORE WORKFLOW ---
  startOrContinueAccount(accId) {
    const acc = this.accounts.find(a => a.id === accId);
    if (!acc) return;

    this.activeAccount = acc;
    if (acc.status === 'not_started') {
      acc.status = 'in_progress';
    }
    acc.lastActivity = new Date().toISOString().replace('T', ' ').substring(0, 16);
    this.saveAccounts();

    this.switchView('terminal', accId);
    this.showToast(`Resumed "${acc.name}"`, 'info');
  }

  loadAccountIntoTerminal(accId) {
    const acc = this.accounts.find(a => a.id === accId);
    if (!acc) return;

    this.activeAccount = acc;
    this.activeSymbol = acc.symbol;
    this.activeTimeframe = acc.timeframe;

    this.availableCandles = this.getCandlesForTimeframe(acc.symbol, acc.timeframe);

    if (acc.currentReplayIndex !== undefined && acc.currentReplayIndex < this.availableCandles.length) {
      this.replayIndex = acc.currentReplayIndex;
    } else {
      const idx = this.availableCandles.findIndex(c => c.time >= acc.currentReplayTimestamp);
      this.replayIndex = idx !== -1 ? idx : Math.min(100, Math.floor(this.availableCandles.length * 0.1));
    }

    const scrubber = document.getElementById('replay-scrubber-input');
    if (scrubber) {
      scrubber.max = Math.max(1, this.availableCandles.length - 1);
      scrubber.value = this.replayIndex;
    }

    this.syncNavAccountStats();
    this.syncReplayInfo();
    this.renderOpenPositionsTable();
    this.renderTradeHistoryTable();
  }

  // --- CANDLE DATA ACCESS ---
  getCandlesForTimeframe(symbol, tf) {
    const symData = this.dataStore[symbol];
    if (!symData) return [];

    if (symData.timeframes && symData.timeframes[tf]) {
      return symData.timeframes[tf];
    }

    const baseTf = symData.timeframes['1h'] ? '1h' : (symData.timeframes['5m'] ? '5m' : '15m');
    const baseCandles = symData.timeframes[baseTf] || [];
    return this.aggregateCandles(baseCandles, tf);
  }

  aggregateCandles(candles, targetTf) {
    if (!candles || candles.length === 0) return [];
    
    let tfMinutes = 15;
    if (targetTf === '1m') tfMinutes = 1;
    else if (targetTf === '5m') tfMinutes = 5;
    else if (targetTf === '15m') tfMinutes = 15;
    else if (targetTf === '30m') tfMinutes = 30;
    else if (targetTf === '1h') tfMinutes = 60;
    else if (targetTf === '4h') tfMinutes = 240;
    else if (targetTf === '1d') tfMinutes = 1440;

    const tfSeconds = tfMinutes * 60;
    const aggregated = [];
    let currentBucket = null;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const bucketTime = Math.floor(c.time / tfSeconds) * tfSeconds;

      if (!currentBucket || currentBucket.time !== bucketTime) {
        if (currentBucket) aggregated.push(currentBucket);
        currentBucket = {
          time: bucketTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 0,
          datetimeStr: c.datetimeStr
        };
      } else {
        currentBucket.high = Math.max(currentBucket.high, c.high);
        currentBucket.low = Math.min(currentBucket.low, c.low);
        currentBucket.close = c.close;
        currentBucket.volume += (c.volume || 0);
      }
    }
    if (currentBucket) aggregated.push(currentBucket);
    return aggregated;
  }

  getCurrentCandle() {
    if (!this.availableCandles || this.availableCandles.length === 0) return null;
    const idx = Math.min(this.replayIndex, this.availableCandles.length - 1);
    return this.availableCandles[idx];
  }

  getSimulatedTime() {
    const c = this.getCurrentCandle();
    return c ? c.time : 0;
  }

  // --- REPLAY CONTROLLER ---
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.updateReplayButtonsUI();

    const intervalMs = Math.max(25, Math.floor(1000 / this.replaySpeed));
    this.replayInterval = setInterval(() => {
      this.stepForward();
      if (this.replayIndex >= this.availableCandles.length - 1) {
        this.pause();
        if (this.activeAccount) {
          this.activeAccount.status = 'completed';
          this.saveAccounts();
        }
        this.showToast('Replay dataset completed', 'info');
      }
    }, intervalMs);
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.replayInterval) {
      clearInterval(this.replayInterval);
      this.replayInterval = null;
    }
    if (this.activeAccount) {
      this.activeAccount.status = 'paused';
      this.saveAccounts();
    }
    this.updateReplayButtonsUI();
  }

  setSpeed(speed) {
    this.replaySpeed = Number(speed);
    if (this.isPlaying) {
      this.pause();
      this.play();
    }
    document.querySelectorAll('.speed-pill').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === this.replaySpeed);
    });
  }

  stepForward() {
    if (this.replayIndex < this.availableCandles.length - 1) {
      this.replayIndex++;
      const currentCandle = this.availableCandles[this.replayIndex];

      if (this.activeAccount) {
        this.activeAccount.currentReplayIndex = this.replayIndex;
        this.activeAccount.currentReplayTimestamp = currentCandle.time;
        this.activeAccount.lastActivity = new Date().toISOString().replace('T', ' ').substring(0, 16);
      }

      this.evaluatePositions(currentCandle);
      this.updateAllChartsData();
      this.updateFloatingMetrics();
      this.syncReplayInfo();
    }
  }

  stepBackward() {
    if (this.replayIndex > 10) {
      this.replayIndex--;
      const currentCandle = this.availableCandles[this.replayIndex];
      if (this.activeAccount) {
        this.activeAccount.currentReplayIndex = this.replayIndex;
        this.activeAccount.currentReplayTimestamp = currentCandle.time;
      }
      this.updateAllChartsData();
      this.updateFloatingMetrics();
      this.syncReplayInfo();
    }
  }

  resetReplay() {
    this.pause();
    if (this.activeAccount) {
      const idx = this.availableCandles.findIndex(c => c.time >= this.activeAccount.startTimestamp);
      this.replayIndex = idx !== -1 ? idx : Math.min(100, Math.floor(this.availableCandles.length * 0.1));
      this.activeAccount.currentReplayIndex = this.replayIndex;
      this.activeAccount.currentReplayTimestamp = this.availableCandles[this.replayIndex].time;
      this.activeAccount.status = 'in_progress';
      this.saveAccounts();
    }
    this.updateAllChartsData();
    this.updateFloatingMetrics();
    this.syncReplayInfo();
    this.showToast('Replay rewound to starting date', 'info');
  }

  // --- POSITION MANAGEMENT & EXECUTION ---
  evaluatePositions(candle) {
    if (!this.activeAccount || !this.activeAccount.openPositions) return;

    const symInfo = this.dataStore[this.activeSymbol] || { pointSize: 0.01, contractSize: 100 };
    const spread = this.activeAccount.spread || 0.25;
    const slippage = this.activeAccount.slippage || 0.05;
    const commissionPerLot = this.activeAccount.commission || 7.0;

    const remainingPositions = [];

    for (let i = 0; i < this.activeAccount.openPositions.length; i++) {
      const pos = this.activeAccount.openPositions[i];
      let isClosed = false;
      let exitPrice = 0;
      let exitReason = '';

      if (pos.type === 'BUY') {
        pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, candle.high);
        pos.lowestPrice = Math.min(pos.lowestPrice || pos.entryPrice, candle.low);

        if (pos.breakevenTrigger && pos.breakevenTrigger > 0) {
          if (candle.high - pos.entryPrice >= pos.breakevenTrigger) {
            const targetSL = pos.entryPrice + (pos.breakevenOffset || 0);
            if (!pos.sl || pos.sl < targetSL) {
              pos.sl = targetSL;
              pos.isBreakevenSet = true;
            }
          }
        }

        if (pos.trailingStop && pos.trailingDistance && pos.trailingDistance > 0) {
          const currentGain = candle.high - pos.entryPrice;
          if (!pos.trailingActivation || currentGain >= pos.trailingActivation) {
            const potentialTrailSL = candle.high - pos.trailingDistance;
            if (!pos.sl || potentialTrailSL > pos.sl) pos.sl = potentialTrailSL;
          }
        }

        const slHit = pos.sl && candle.low <= pos.sl;
        const tpHit = pos.tp && candle.high >= pos.tp;

        if (slHit && tpHit) {
          const distToSl = Math.abs(candle.open - pos.sl);
          const distToTp = Math.abs(candle.open - pos.tp);
          if (distToSl <= distToTp) {
            isClosed = true;
            exitPrice = pos.sl - slippage;
            exitReason = pos.isBreakevenSet ? 'Breakeven SL' : (pos.trailingStop ? 'Trailing SL' : 'Stop Loss');
          } else {
            isClosed = true;
            exitPrice = pos.tp;
            exitReason = 'Take Profit';
          }
        } else if (slHit) {
          isClosed = true;
          exitPrice = pos.sl - slippage;
          exitReason = pos.isBreakevenSet ? 'Breakeven SL' : (pos.trailingStop ? 'Trailing SL' : 'Stop Loss');
        } else if (tpHit) {
          isClosed = true;
          exitPrice = pos.tp;
          exitReason = 'Take Profit';
        }

      } else { // SELL
        pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, candle.high);
        pos.lowestPrice = Math.min(pos.lowestPrice || pos.entryPrice, candle.low);

        if (pos.breakevenTrigger && pos.breakevenTrigger > 0) {
          if (pos.entryPrice - candle.low >= pos.breakevenTrigger) {
            const targetSL = pos.entryPrice - (pos.breakevenOffset || 0);
            if (!pos.sl || pos.sl > targetSL) {
              pos.sl = targetSL;
              pos.isBreakevenSet = true;
            }
          }
        }

        if (pos.trailingStop && pos.trailingDistance && pos.trailingDistance > 0) {
          const currentGain = pos.entryPrice - candle.low;
          if (!pos.trailingActivation || currentGain >= pos.trailingActivation) {
            const potentialTrailSL = candle.low + pos.trailingDistance;
            if (!pos.sl || potentialTrailSL < pos.sl) pos.sl = potentialTrailSL;
          }
        }

        const slHit = pos.sl && candle.high >= pos.sl;
        const tpHit = pos.tp && candle.low <= pos.tp;

        if (slHit && tpHit) {
          const distToSl = Math.abs(candle.open - pos.sl);
          const distToTp = Math.abs(candle.open - pos.tp);
          if (distToSl <= distToTp) {
            isClosed = true;
            exitPrice = pos.sl + slippage;
            exitReason = pos.isBreakevenSet ? 'Breakeven SL' : (pos.trailingStop ? 'Trailing SL' : 'Stop Loss');
          } else {
            isClosed = true;
            exitPrice = pos.tp;
            exitReason = 'Take Profit';
          }
        } else if (slHit) {
          isClosed = true;
          exitPrice = pos.sl + slippage;
          exitReason = pos.isBreakevenSet ? 'Breakeven SL' : (pos.trailingStop ? 'Trailing SL' : 'Stop Loss');
        } else if (tpHit) {
          isClosed = true;
          exitPrice = pos.tp;
          exitReason = 'Take Profit';
        }
      }

      if (isClosed) {
        this.finalizeTrade(pos, exitPrice, candle.time, candle.datetimeStr, exitReason);
      } else {
        remainingPositions.push(pos);
      }
    }

    this.activeAccount.openPositions = remainingPositions;
    this.saveAccounts();
    this.updatePriceLines();
    this.updateChartMarkers();
  }

  openPosition(orderParams) {
    if (!this.activeAccount) return;
    const currentCandle = this.getCurrentCandle();
    if (!currentCandle) return;

    const symInfo = this.dataStore[this.activeSymbol] || { pointSize: 0.01, contractSize: 100 };
    const spread = this.activeAccount.spread || 0.25;
    const slippage = this.activeAccount.slippage || 0.05;

    let execPrice = currentCandle.close;
    if (orderParams.type === 'BUY') {
      execPrice = Math.round((currentCandle.close + (spread / 2) + slippage) * 100) / 100;
    } else {
      execPrice = Math.round((currentCandle.close - (spread / 2) - slippage) * 100) / 100;
    }

    const pos = {
      id: 'TRD-' + Math.floor(100000 + Math.random() * 900000),
      symbol: this.activeSymbol,
      type: orderParams.type,
      size: Number(orderParams.size) || 1.0,
      entryPrice: execPrice,
      entryTime: currentCandle.time,
      entryDateStr: currentCandle.datetimeStr,
      sl: orderParams.sl ? Number(orderParams.sl) : null,
      tp: orderParams.tp ? Number(orderParams.tp) : null,
      trailingStop: !!orderParams.trailingStop,
      trailingDistance: Number(orderParams.trailingDistance) || 0,
      trailingActivation: Number(orderParams.trailingActivation) || 0,
      breakevenTrigger: Number(orderParams.breakevenTrigger) || 0,
      breakevenOffset: Number(orderParams.breakevenOffset) || 0,
      highestPrice: execPrice,
      lowestPrice: execPrice,
      contractSize: symInfo.contractSize || 100,
      balanceBefore: this.activeAccount.balance,
      equityBefore: this.activeAccount.equity
    };

    this.activeAccount.openPositions.push(pos);
    this.saveAccounts();
    this.syncNavAccountStats();
    this.renderOpenPositionsTable();
    this.updatePriceLines();
    this.updateChartMarkers();
    this.showToast(`Placed ${pos.type} ${pos.size}L @ ${pos.entryPrice}`, 'success');
  }

  closePositionManually(posId, fraction = 1.0) {
    if (!this.activeAccount) return;
    const currentCandle = this.getCurrentCandle();
    if (!currentCandle) return;

    const posIndex = this.activeAccount.openPositions.findIndex(p => p.id === posId);
    if (posIndex === -1) return;

    const pos = this.activeAccount.openPositions[posIndex];
    const spread = this.activeAccount.spread || 0.25;
    const slippage = this.activeAccount.slippage || 0.05;

    let exitPrice = currentCandle.close;
    if (pos.type === 'BUY') {
      exitPrice = Math.round((currentCandle.close - (spread / 2) - slippage) * 100) / 100;
    } else {
      exitPrice = Math.round((currentCandle.close + (spread / 2) + slippage) * 100) / 100;
    }

    if (fraction < 1.0) {
      const closedSize = Math.round((pos.size * fraction) * 100) / 100;
      const partialPos = { ...pos, size: closedSize, id: pos.id + '-P' };
      this.finalizeTrade(partialPos, exitPrice, currentCandle.time, currentCandle.datetimeStr, `Partial Close (${Math.round(fraction * 100)}%)`);
      pos.size = Math.round((pos.size - closedSize) * 100) / 100;
    } else {
      this.activeAccount.openPositions.splice(posIndex, 1);
      this.finalizeTrade(pos, exitPrice, currentCandle.time, currentCandle.datetimeStr, 'Manual Close');
    }

    this.saveAccounts();
    this.syncNavAccountStats();
    this.renderOpenPositionsTable();
    this.updatePriceLines();
    this.updateChartMarkers();
  }

  finalizeTrade(pos, exitPrice, exitTime, exitDateStr, exitReason) {
    const symInfo = this.dataStore[pos.symbol] || { pointSize: 0.01, contractSize: 100 };
    const contractSize = pos.contractSize || symInfo.contractSize || 100;
    const commissionPerLot = this.activeAccount.commission || 7.0;
    const spread = this.activeAccount.spread || 0.25;
    const slippage = this.activeAccount.slippage || 0.05;

    const priceDiff = pos.type === 'BUY' ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
    const grossPnl = priceDiff * pos.size * contractSize;
    const totalCommission = commissionPerLot * pos.size;
    const totalSpreadCost = spread * pos.size * contractSize;
    const totalSlippageCost = slippage * pos.size * contractSize;
    const netPnl = Math.round((grossPnl - totalCommission) * 100) / 100;

    let rMultiple = 0;
    if (pos.sl) {
      const riskDistance = Math.abs(pos.entryPrice - pos.sl);
      if (riskDistance > 0) rMultiple = Math.round((priceDiff / riskDistance) * 100) / 100;
    }

    const mfePrice = pos.type === 'BUY' ? (pos.highestPrice - pos.entryPrice) : (pos.entryPrice - pos.lowestPrice);
    const maePrice = pos.type === 'BUY' ? (pos.entryPrice - pos.lowestPrice) : (pos.highestPrice - pos.entryPrice);
    const mfePnl = Math.round(Math.max(0, mfePrice) * pos.size * contractSize * 100) / 100;
    const maePnl = Math.round(Math.max(0, maePrice) * pos.size * contractSize * 100) / 100;

    const balanceBefore = this.activeAccount.balance;
    const balanceAfter = Math.round((balanceBefore + netPnl) * 100) / 100;

    this.activeAccount.balance = balanceAfter;
    this.activeAccount.equity = balanceAfter;

    const durationSeconds = exitTime - pos.entryTime;
    const durationMinutes = Math.floor(durationSeconds / 60);
    const durationFormatted = durationMinutes < 60 ? `${durationMinutes}m` : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;

    const tradeRecord = {
      id: pos.id,
      symbol: pos.symbol,
      direction: pos.type,
      entryDate: pos.entryDateStr,
      entryTime: pos.entryTime,
      exitDate: exitDateStr,
      exitTime: exitTime,
      entryPrice: pos.entryPrice,
      exitPrice: exitPrice,
      size: pos.size,
      sl: pos.sl,
      tp: pos.tp,
      exitReason: exitReason,
      grossPnl: Math.round(grossPnl * 100) / 100,
      commission: totalCommission,
      spread: totalSpreadCost,
      slippage: totalSlippageCost,
      netPnl: netPnl,
      rMultiple: rMultiple,
      duration: durationFormatted,
      mfe: mfePnl,
      mae: maePnl,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter
    };

    this.activeAccount.tradeHistory.unshift(tradeRecord);

    const peakBalance = Math.max(...this.activeAccount.equityCurve.map(e => e.balance), balanceAfter);
    const drawdown = Math.max(0, peakBalance - balanceAfter);
    const drawdownPct = peakBalance > 0 ? Math.round((drawdown / peakBalance) * 10000) / 100 : 0;

    this.activeAccount.equityCurve.push({
      time: exitTime,
      datetimeStr: exitDateStr,
      balance: balanceAfter,
      equity: balanceAfter,
      drawdown: Math.round(drawdown * 100) / 100,
      drawdownPct: drawdownPct,
      tradeId: tradeRecord.id
    });

    this.saveAccounts();
    this.renderTradeHistoryTable();
  }

  // --- FLOATING P&L ---
  updateFloatingMetrics() {
    if (!this.activeAccount) return;
    const currentCandle = this.getCurrentCandle();
    if (!currentCandle) return;

    const symInfo = this.dataStore[this.activeSymbol] || { contractSize: 100 };
    const contractSize = symInfo.contractSize || 100;
    const spread = this.activeAccount.spread || 0.25;

    let totalFloatingPnl = 0;

    for (let i = 0; i < this.activeAccount.openPositions.length; i++) {
      const pos = this.activeAccount.openPositions[i];
      let currentPrice = currentCandle.close;
      let priceDiff = 0;

      if (pos.type === 'BUY') {
        currentPrice = currentCandle.close - (spread / 2);
        priceDiff = currentPrice - pos.entryPrice;
      } else {
        currentPrice = currentCandle.close + (spread / 2);
        priceDiff = pos.entryPrice - currentPrice;
      }

      const floatingPnl = Math.round(priceDiff * pos.size * contractSize * 100) / 100;
      pos.currentPrice = currentPrice;
      pos.floatingPnl = floatingPnl;
      totalFloatingPnl += floatingPnl;
    }

    this.activeAccount.equity = Math.round((this.activeAccount.balance + totalFloatingPnl) * 100) / 100;
    this.syncNavAccountStats();
    this.renderOpenPositionsTable();
  }

  syncNavAccountStats() {
    if (!this.activeAccount) return;
    const balEl = document.getElementById('nav-stat-balance');
    const eqEl = document.getElementById('nav-stat-equity');
    const pnlEl = document.getElementById('nav-stat-pnl');
    const nameEl = document.getElementById('nav-account-name');

    if (nameEl) nameEl.textContent = this.activeAccount.name;
    if (balEl) balEl.textContent = `$${this.activeAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (eqEl) eqEl.textContent = `$${this.activeAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const totalPnl = Math.round((this.activeAccount.equity - this.activeAccount.startingBalance) * 100) / 100;
    const totalPnlPct = Math.round((totalPnl / this.activeAccount.startingBalance) * 10000) / 100;

    if (pnlEl) {
      pnlEl.textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${totalPnlPct}%)`;
      pnlEl.className = `acc-pnl-pill ${totalPnl >= 0 ? 'positive' : 'negative'}`;
    }
  }

  syncReplayInfo() {
    const c = this.getCurrentCandle();
    const scrubber = document.getElementById('replay-scrubber-input');
    const scrubberTime = document.getElementById('scrubber-time-val');
    const timeDisplay = document.getElementById('replay-time-display');

    if (c) {
      if (scrubberTime) scrubberTime.textContent = c.datetimeStr;
      if (timeDisplay) timeDisplay.textContent = c.datetimeStr;
      if (scrubber) scrubber.value = this.replayIndex;
    }
  }

  // --- CHARTS INITIALIZATION & UPDATES ---
  initAllCharts() {
    const chartOptions = {
      layout: {
        background: { type: 'solid', color: '#070a12' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace"
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: 'rgba(56, 189, 248, 0.4)', width: 1, style: 2 },
        horzLine: { color: 'rgba(56, 189, 248, 0.4)', width: 1, style: 2 }
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 }
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false
      }
    };

    const cells = [
      { id: 'cell-chart-1-canvas', key: 'main' },
      { id: 'cell-chart-2-canvas', key: 'c2' },
      { id: 'cell-chart-3-canvas', key: 'c3' },
      { id: 'cell-chart-4-canvas', key: 'c4' }
    ];

    cells.forEach(c => {
      const container = document.getElementById(c.id);
      if (container) {
        if (this.charts[c.key]) {
          try { this.charts[c.key].remove(); } catch (e) {}
        }
        this.charts[c.key] = LightweightCharts.createChart(container, chartOptions);
        this.series[c.key] = this.charts[c.key].addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ff4365',
          borderUpColor: '#10b981',
          borderDownColor: '#ff4365',
          wickUpColor: '#10b981',
          wickDownColor: '#ff4365'
        });
      }
    });

    window.addEventListener('resize', () => this.resizeAllCharts());
  }

  resizeAllCharts() {
    Object.keys(this.charts).forEach(key => {
      const chart = this.charts[key];
      const canvasEl = document.getElementById(`cell-chart-${key === 'main' ? '1' : key.slice(1)}-canvas`);
      if (chart && canvasEl) {
        chart.applyOptions({
          width: canvasEl.clientWidth,
          height: canvasEl.clientHeight
        });
      }
    });
  }

  updateAllChartsData() {
    if (!this.series.main || !this.availableCandles || this.availableCandles.length === 0) return;

    const visiblePrimary = this.availableCandles.slice(0, this.replayIndex + 1);
    this.series.main.setData(visiblePrimary.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    })));

    const simTime = this.getSimulatedTime();

    if (this.series.c2) {
      const c2 = this.getCandlesForTimeframe(this.activeSymbol, '1h').filter(c => c.time <= simTime);
      this.series.c2.setData(c2.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    }
    if (this.series.c3) {
      const c3 = this.getCandlesForTimeframe(this.activeSymbol, '4h').filter(c => c.time <= simTime);
      this.series.c3.setData(c3.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    }
    if (this.series.c4) {
      const c4 = this.getCandlesForTimeframe(this.activeSymbol, '5m').filter(c => c.time <= simTime);
      this.series.c4.setData(c4.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    }

    this.updateLegendOHLC();
  }

  updateLegendOHLC() {
    const c = this.getCurrentCandle();
    if (!c) return;

    const symEl = document.getElementById('legend-symbol-display');
    const ohlcEl = document.getElementById('legend-ohlc-display');

    if (symEl) {
      symEl.innerHTML = `<span>${this.activeSymbol}</span> <span class="tag-badge gold">${this.activeTimeframe.toUpperCase()}</span>`;
    }

    if (ohlcEl) {
      const isUp = c.close >= c.open;
      const color = isUp ? '#10b981' : '#ff4365';
      ohlcEl.innerHTML = `
        <span>O: <b style="color:${color}">${c.open.toFixed(2)}</b></span>
        <span>H: <b style="color:${color}">${c.high.toFixed(2)}</b></span>
        <span>L: <b style="color:${color}">${c.low.toFixed(2)}</b></span>
        <span>C: <b style="color:${color}">${c.close.toFixed(2)}</b></span>
      `;
    }
  }

  updatePriceLines() {
    if (!this.series.main) return;
    this.activePriceLines.forEach(line => {
      try { this.series.main.removePriceLine(line); } catch (e) {}
    });
    this.activePriceLines = [];

    if (!this.activeAccount || !this.activeAccount.openPositions) return;

    this.activeAccount.openPositions.forEach(pos => {
      const entryLine = this.series.main.createPriceLine({
        price: pos.entryPrice,
        color: pos.type === 'BUY' ? '#10b981' : '#ff4365',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: `${pos.type} (${pos.size}L)`
      });
      this.activePriceLines.push(entryLine);

      if (pos.sl) {
        const slLine = this.series.main.createPriceLine({
          price: pos.sl,
          color: '#ff4365',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `SL`
        });
        this.activePriceLines.push(slLine);
      }

      if (pos.tp) {
        const tpLine = this.series.main.createPriceLine({
          price: pos.tp,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP`
        });
        this.activePriceLines.push(tpLine);
      }
    });
  }

  updateChartMarkers() {
    if (!this.series.main || !this.activeAccount) return;
    const markers = [];
    const currentSimTime = this.getSimulatedTime();

    this.activeAccount.tradeHistory.forEach(t => {
      if (t.entryTime <= currentSimTime) {
        markers.push({
          time: t.entryTime,
          position: t.direction === 'BUY' ? 'belowBar' : 'aboveBar',
          color: t.direction === 'BUY' ? '#10b981' : '#ff4365',
          shape: t.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${t.direction} @ ${t.entryPrice}`
        });
      }
      if (t.exitTime <= currentSimTime) {
        markers.push({
          time: t.exitTime,
          position: t.direction === 'BUY' ? 'aboveBar' : 'belowBar',
          color: t.netPnl >= 0 ? '#10b981' : '#ff4365',
          shape: 'circle',
          text: `${t.exitReason}: ${t.netPnl >= 0 ? '+' : ''}$${t.netPnl}`
        });
      }
    });

    markers.sort((a, b) => a.time - b.time);
    this.series.main.setMarkers(markers);
  }

  // --- DEDICATED FULL-PAGE ANALYTICS VIEW ---
  openAccountAnalytics(accId) {
    const acc = this.accounts.find(a => a.id === accId);
    if (!acc) return;
    this.analyticsAccount = acc;
    this.switchView('analytics', accId);
  }

  renderFullAnalyticsView(acc) {
    if (!acc) return;

    const titleEl = document.getElementById('analytics-account-title');
    const pairEl = document.getElementById('analytics-account-pair');
    const dateRangeEl = document.getElementById('analytics-account-dates');

    if (titleEl) titleEl.textContent = acc.name;
    if (pairEl) pairEl.textContent = `${acc.symbol} • ${(acc.timeframe || '15m').toUpperCase()}`;
    if (dateRangeEl) dateRangeEl.textContent = `${acc.startDate || ''} → ${acc.endDate || ''}`;

    const trades = acc.tradeHistory || [];
    const startingBal = acc.startingBalance || 10000;
    const endingBal = acc.balance || 10000;
    const netProfit = Math.round((endingBal - startingBal) * 100) / 100;
    const netReturnPct = startingBal > 0 ? Math.round((netProfit / startingBal) * 10000) / 100 : 0;

    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.netPnl > 0);
    const losingTrades = trades.filter(t => t.netPnl < 0);
    const winRate = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 1000) / 10 : 0;

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.netPnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.netPnl, 0));
    const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : (grossProfit > 0 ? 99.9 : 0);

    const avgTrade = totalTrades > 0 ? Math.round((netProfit / totalTrades) * 100) / 100 : 0;
    const avgWin = winningTrades.length > 0 ? Math.round((grossProfit / winningTrades.length) * 100) / 100 : 0;
    const avgLoss = losingTrades.length > 0 ? Math.round((grossLoss / losingTrades.length) * 100) / 100 : 0;

    let peak = startingBal;
    let maxDD = 0;
    let maxDDPct = 0;
    (acc.equityCurve || []).forEach(pt => {
      if (pt.balance > peak) peak = pt.balance;
      const dd = peak - pt.balance;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
    });

    const recoveryFactor = maxDD > 0 ? Math.round((netProfit / maxDD) * 100) / 100 : 0;
    const expectancy = Math.round(((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss) * 100) / 100;

    const setVal = (id, val, isColor = false) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = val;
        if (isColor) {
          const num = parseFloat(val.replace(/[^0-9.-]+/g, ''));
          el.style.color = num >= 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)';
        }
      }
    };

    setVal('full-analytics-net-profit', `${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString()} (${netReturnPct}%)`, true);
    setVal('full-analytics-balance', `Ending Balance: $${endingBal.toLocaleString()}`);
    setVal('full-analytics-win-rate', `${winRate}%`);
    setVal('full-analytics-trades', `${totalTrades} Trades (W:${winningTrades.length} / L:${losingTrades.length})`);
    setVal('full-analytics-profit-factor', `${profitFactor}`);
    setVal('full-analytics-max-dd', `$${maxDD.toLocaleString()} (${maxDDPct.toFixed(1)}%)`);
    setVal('full-analytics-recovery', `Recovery Factor: ${recoveryFactor}`);

    this.renderFullAnalyticsEquityChart(acc);

    const tbody = document.getElementById('full-analytics-history-tbody');
    if (tbody) {
      if (trades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--text-dim);">No trades executed in this backtest account yet.</td></tr>`;
      } else {
        tbody.innerHTML = trades.map(t => {
          const pnlColor = t.netPnl >= 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)';
          return `
            <tr>
              <td><b style="color:var(--neon-blue);">${t.id}</b></td>
              <td>${t.entryDate}</td>
              <td>${t.exitDate}</td>
              <td><span class="tag-badge ${t.direction === 'BUY' ? 'green' : 'crimson'}">${t.direction}</span></td>
              <td>${t.size} L</td>
              <td>${t.entryPrice.toFixed(2)}</td>
              <td>${t.exitPrice.toFixed(2)}</td>
              <td><span style="font-size:10px; padding:2px 5px; border-radius:3px; background:rgba(255,255,255,0.06);">${t.exitReason}</span></td>
              <td style="color:${pnlColor}; font-weight:800;">${t.netPnl >= 0 ? '+' : ''}$${t.netPnl.toFixed(2)}</td>
              <td>${t.rMultiple ? t.rMultiple + 'R' : '-'}</td>
              <td>${t.duration}</td>
              <td><b>$${t.balanceAfter.toLocaleString()}</b></td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  renderFullAnalyticsEquityChart(acc) {
    const ctx = document.getElementById('full-analytics-equity-canvas');
    if (!ctx) return;

    if (this.analyticsEquityChart) {
      this.analyticsEquityChart.destroy();
    }

    const curve = acc.equityCurve || [];

    this.analyticsEquityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: curve.map(c => c.datetimeStr),
        datasets: [
          {
            label: 'Balance ($)',
            data: curve.map(c => c.balance),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            fill: true,
            tension: 0.15,
            borderWidth: 2,
            pointRadius: 2
          },
          {
            label: 'Underwater Drawdown ($)',
            data: curve.map(c => -c.drawdown),
            borderColor: '#ff4365',
            backgroundColor: 'rgba(255, 67, 101, 0.15)',
            fill: true,
            tension: 0.15,
            borderWidth: 1.5,
            pointRadius: 0,
            yAxisID: 'yDD'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 }, grid: { color: 'rgba(255, 255, 255, 0.03)' } },
          y: { ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'rgba(255, 255, 255, 0.03)' } },
          yDD: { position: 'right', grid: { display: false }, ticks: { color: '#ff4365', font: { family: 'JetBrains Mono', size: 10 } } }
        }
      }
    });
  }

  // --- TABLES IN TERMINAL VIEW ---
  renderOpenPositionsTable() {
    const tbody = document.getElementById('positions-tbody');
    const countBadge = document.getElementById('tab-positions-count');
    if (!tbody || !this.activeAccount) return;

    const positions = this.activeAccount.openPositions || [];
    if (countBadge) countBadge.textContent = positions.length;

    if (positions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 20px; color: var(--text-dim);">No open positions. Use BUY/SELL to place trades.</td></tr>`;
      return;
    }

    tbody.innerHTML = positions.map(p => {
      const pnlColor = (p.floatingPnl || 0) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)';
      return `
        <tr>
          <td><b style="color:var(--neon-gold);">${p.id}</b></td>
          <td>${p.entryDateStr}</td>
          <td><span class="tag-badge ${p.type === 'BUY' ? 'green' : 'crimson'}">${p.type}</span></td>
          <td><b>${p.size}</b> L</td>
          <td>${p.entryPrice.toFixed(2)}</td>
          <td>${(p.currentPrice || p.entryPrice).toFixed(2)}</td>
          <td>${p.sl ? p.sl.toFixed(2) : '-'}</td>
          <td>${p.tp ? p.tp.toFixed(2) : '-'}</td>
          <td style="color:${pnlColor}; font-weight:800;">${p.floatingPnl >= 0 ? '+' : ''}$${(p.floatingPnl || 0).toFixed(2)}</td>
          <td>
            <div style="display:flex; gap:4px;">
              <button class="btn-glass" style="padding:2px 6px; font-size:10px;" onclick="window.terminalApp.closePositionManually('${p.id}', 1.0)">Close</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderTradeHistoryTable() {
    const tbody = document.getElementById('history-tbody');
    const countBadge = document.getElementById('tab-history-count');
    if (!tbody || !this.activeAccount) return;

    const trades = this.activeAccount.tradeHistory || [];
    if (countBadge) countBadge.textContent = trades.length;

    if (trades.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 20px; color: var(--text-dim);">No closed trades yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = trades.map(t => {
      const pnlColor = t.netPnl >= 0 ? 'var(--neon-emerald)' : 'var(--neon-crimson)';
      return `
        <tr>
          <td><b style="color:var(--neon-blue);">${t.id}</b></td>
          <td>${t.entryDate}</td>
          <td>${t.exitDate}</td>
          <td><span class="tag-badge ${t.direction === 'BUY' ? 'green' : 'crimson'}">${t.direction}</span></td>
          <td>${t.size} L</td>
          <td>${t.entryPrice.toFixed(2)}</td>
          <td>${t.exitPrice.toFixed(2)}</td>
          <td><span style="font-size:10px; padding:2px 5px; border-radius:3px; background:rgba(255,255,255,0.06);">${t.exitReason}</span></td>
          <td style="color:${pnlColor}; font-weight:800;">${t.netPnl >= 0 ? '+' : ''}$${t.netPnl.toFixed(2)}</td>
          <td>${t.duration}</td>
          <td><b>$${t.balanceAfter.toLocaleString()}</b></td>
        </tr>
      `;
    }).join('');
  }

  renderSettingsView() {
    const container = document.getElementById('settings-datasets-summary');
    if (!container) return;

    const rows = [];
    Object.keys(this.dataStore).forEach(sym => {
      const info = this.dataStore[sym];
      Object.keys(info.timeframes).forEach(tf => {
        const arr = info.timeframes[tf];
        if (arr && arr.length > 0) {
          rows.push(`
            <tr>
              <td><b>${sym}</b></td>
              <td><span class="tag-badge gold">${tf.toUpperCase()}</span></td>
              <td>${arr.length.toLocaleString()} Bars</td>
              <td>${arr[0].datetimeStr.split(' ')[0]} → ${arr[arr.length - 1].datetimeStr.split(' ')[0]}</td>
              <td><span class="tag-badge green">Verified Offline</span></td>
            </tr>
          `);
        }
      });
    });

    container.innerHTML = rows.join('');
  }

  updateReplayButtonsUI() {
    const playBtn = document.getElementById('btn-replay-play');
    if (playBtn) {
      playBtn.innerHTML = this.isPlaying ? '<i data-lucide="pause"></i> Pause' : '<i data-lucide="play"></i> Play';
      if (window.lucide) lucide.createIcons();
    }
  }

  // --- UI LISTENERS & SHORTCUTS ---
  setupUIEventListeners() {
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchView(btn.dataset.view);
      });
    });

    document.getElementById('dash-search-input')?.addEventListener('input', (e) => {
      this.dashboardFilter.search = e.target.value;
      this.renderDashboard();
    });

    document.getElementById('dash-filter-pair')?.addEventListener('change', (e) => {
      this.dashboardFilter.pair = e.target.value;
      this.renderDashboard();
    });

    document.getElementById('dash-filter-status')?.addEventListener('change', (e) => {
      this.dashboardFilter.status = e.target.value;
      this.renderDashboard();
    });

    document.getElementById('dash-sort-by')?.addEventListener('change', (e) => {
      this.dashboardFilter.sortBy = e.target.value;
      this.renderDashboard();
    });

    document.getElementById('btn-replay-play')?.addEventListener('click', () => {
      if (this.isPlaying) this.pause(); else this.play();
    });
    document.getElementById('btn-replay-next')?.addEventListener('click', () => this.stepForward());
    document.getElementById('btn-replay-prev')?.addEventListener('click', () => this.stepBackward());
    document.getElementById('btn-replay-reset')?.addEventListener('click', () => this.resetReplay());

    document.getElementById('replay-scrubber-input')?.addEventListener('input', (e) => {
      this.pause();
      this.replayIndex = parseInt(e.target.value);
      if (this.activeAccount && this.availableCandles[this.replayIndex]) {
        this.activeAccount.currentReplayIndex = this.replayIndex;
        this.activeAccount.currentReplayTimestamp = this.availableCandles[this.replayIndex].time;
      }
      this.updateAllChartsData();
      this.updateFloatingMetrics();
      this.syncReplayInfo();
    });

    document.querySelectorAll('.speed-pill').forEach(btn => {
      btn.addEventListener('click', (e) => this.setSpeed(e.target.dataset.speed));
    });

    document.querySelectorAll('.tf-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tf-pill').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.activeTimeframe = e.target.dataset.tf;
        if (this.activeAccount) this.activeAccount.timeframe = this.activeTimeframe;
        this.availableCandles = this.getCandlesForTimeframe(this.activeSymbol, this.activeTimeframe);
        this.updateAllChartsData();
      });
    });

    document.getElementById('symbol-select')?.addEventListener('change', (e) => {
      this.activeSymbol = e.target.value;
      if (this.activeAccount) this.activeAccount.symbol = this.activeSymbol;
      this.availableCandles = this.getCandlesForTimeframe(this.activeSymbol, this.activeTimeframe);
      this.updateAllChartsData();
    });

    document.getElementById('btn-quick-buy')?.addEventListener('click', () => this.openOrderModal('BUY'));
    document.getElementById('btn-quick-sell')?.addEventListener('click', () => this.openOrderModal('SELL'));

    // Handle Create Account Submit Button
    const createBtn = document.getElementById('btn-submit-create-account');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const name = document.getElementById('create-acc-name')?.value || 'My Backtest Strategy';
        const symbol = document.getElementById('create-acc-symbol')?.value || 'XAUUSD';
        const timeframe = document.getElementById('create-acc-timeframe')?.value || '15m';
        const balance = document.getElementById('create-acc-balance')?.value || '10000';
        const leverage = document.getElementById('create-acc-leverage')?.value || '100';
        const startDate = document.getElementById('create-acc-start-date')?.value || '';
        const endDate = document.getElementById('create-acc-end-date')?.value || '';
        const riskPercent = document.getElementById('create-acc-risk')?.value || '1.0';
        const spread = document.getElementById('create-acc-spread')?.value || '0.25';
        const commission = document.getElementById('create-acc-comm')?.value || '7.00';

        const success = this.createNewAccount({
          name, symbol, timeframe, balance, leverage, startDate, endDate, riskPercent, spread, commission
        });

        if (success) {
          document.getElementById('modal-create-account')?.classList.remove('active');
        }
      });
    }
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (this.currentView !== 'terminal') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.isPlaying) this.pause(); else this.play();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.stepForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.stepBackward();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        this.openOrderModal('BUY');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.openOrderModal('SELL');
      }
    });
  }

  openOrderModal(type) {
    const currentCandle = this.getCurrentCandle();
    if (!currentCandle) return;

    const modal = document.getElementById('order-modal');
    if (!modal) return;

    document.getElementById('order-modal-title').textContent = `Place ${type} Order`;
    document.getElementById('order-entry-price').value = currentCandle.close.toFixed(2);

    const submitBtn = document.getElementById('btn-submit-order');
    submitBtn.textContent = `Submit ${type} Order`;
    submitBtn.className = type === 'BUY' ? 'btn-buy-neon' : 'btn-sell-neon';
    submitBtn.onclick = () => {
      const size = parseFloat(document.getElementById('order-lots')?.value) || 1.0;
      const sl = parseFloat(document.getElementById('order-sl')?.value) || null;
      const tp = parseFloat(document.getElementById('order-tp')?.value) || null;
      this.openPosition({ type, size, sl, tp });
      modal.classList.remove('active');
    };

    modal.classList.add('active');
  }

  exportTradeHistoryCSV() {
    const acc = this.analyticsAccount || this.activeAccount;
    if (!acc || !acc.tradeHistory) return;
    const trades = acc.tradeHistory;
    if (trades.length === 0) return this.showToast('No trades to export', 'warning');

    const headers = ['Trade ID', 'Entry Date', 'Exit Date', 'Direction', 'Size', 'Entry Price', 'Exit Price', 'Net PnL ($)', 'R-Multiple', 'Exit Reason'];
    const rows = trades.map(t => [t.id, t.entryDate, t.exitDate, t.direction, t.size, t.entryPrice, t.exitPrice, t.netPnl, t.rMultiple, `"${t.exitReason}"`]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${acc.name.replace(/\s+/g, '_')}_Trades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Trades exported to CSV', 'success');
  }

  showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    const borderColors = { info: 'var(--neon-blue)', success: 'var(--neon-emerald)', warning: 'var(--neon-gold)', error: 'var(--neon-crimson)' };
    toast.style.borderLeft = `4px solid ${borderColors[type] || borderColors.info}`;
    toast.innerHTML = `<span>${msg}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Global Startup
window.addEventListener('DOMContentLoaded', () => {
  window.terminalApp = new ApexTerminalApp();
});
