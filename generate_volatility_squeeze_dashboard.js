const fs = require('fs');
const path = require('path');

// Load research data & 1H candles
const researchData = JSON.parse(fs.readFileSync(path.join(__dirname, 'xauusd_quant_research_data.json'), 'utf-8'));
const candles1h = JSON.parse(fs.readFileSync(path.join(__dirname, 'xauusd_1h.json'), 'utf-8'));

// Extract Volatility Squeeze Pattern Report
const vsReport = researchData.patternReports.find(p => p.name.includes('Volatility Squeeze'));
const rawOccurrences = vsReport.occurrences;

function formatTimes(timeSec) {
  const dUtc = new Date(timeSec * 1000);
  const istOffset = 5.5 * 3600 * 1000;
  const dIst = new Date(timeSec * 1000 + istOffset);
  return {
    utc: dUtc.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    ist: dIst.toISOString().replace('T', ' ').slice(0, 16) + ' IST'
  };
}

// Build sequential compounding simulation starting from $10,000
let initialCapital = 10000.0;
let runBal = initialCapital;
let peakBal = initialCapital;
let maxDD = 0;
let maxDDPct = 0;
const riskPct = 0.10; // 10% risk per trade

const processedTrades = [];
rawOccurrences.forEach((o, idx) => {
  const riskAmount = runBal * riskPct;
  const riskPerUnit = Math.abs(o.entryPrice - o.stopLoss);
  const units = riskAmount / riskPerUnit;
  const pnlPerUnit = o.direction === 'LONG' ? (o.exitPrice - o.entryPrice) : (o.entryPrice - o.exitPrice);
  const pnlUSD = parseFloat((pnlPerUnit * units).toFixed(2));

  runBal += pnlUSD;
  if (runBal > peakBal) peakBal = runBal;
  const dd = peakBal - runBal;
  const ddPct = (dd / peakBal) * 100;
  if (dd > maxDD) maxDD = dd;
  if (ddPct > maxDDPct) maxDDPct = ddPct;

  const entryTimes = formatTimes(o.timeSec);
  const exitTimes = formatTimes(o.exitTimeSec || (o.timeSec + o.barsHeld * 3600));
  const stdLots = (units / 100).toFixed(2); // 1 Lot = 100 oz Gold

  processedTrades.push({
    TradeNum: idx + 1,
    Date: entryTimes.utc.slice(0, 16),
    ExitDate: exitTimes.utc.slice(0, 16),
    entryTimeUTC: entryTimes.utc,
    entryTimeIST: entryTimes.ist,
    exitTimeUTC: exitTimes.utc,
    exitTimeIST: exitTimes.ist,
    Type: o.direction,
    Pattern: 'NR7 + BB Squeeze Breakout',
    EntryPrice: o.entryPrice,
    InitialSL: o.stopLoss,
    FinalSL: o.stopLoss,
    HardTP: o.targetPrice,
    ExitPrice: o.exitPrice,
    RiskPerUnit: parseFloat(riskPerUnit.toFixed(2)),
    Units: parseFloat(units.toFixed(2)),
    StandardLots: `${stdLots} Lots (${units.toFixed(0)} oz)`,
    RiskUSD: parseFloat(riskAmount.toFixed(2)),
    PnLUSD: pnlUSD,
    RMultiple: o.rMultiple,
    Result: o.outcome === 'WIN' ? 'WIN' : 'LOSS',
    ExitReason: o.outcome === 'WIN' ? 'HARD TP HIT (+2.0R)' : 'INITIAL SL HIT (-1.0R)',
    BELocked: 'NO',
    RunningBalance: parseFloat(runBal.toFixed(2)),
    entryTimeSec: o.timeSec,
    exitTimeSec: o.exitTimeSec || (o.timeSec + o.barsHeld * 3600),
    mfeR: o.mfeR,
    maeR: o.maeR
  });
});

const winTrades = processedTrades.filter(t => t.Result === 'WIN');
const lossTrades = processedTrades.filter(t => t.Result === 'LOSS');
const grossProfit = winTrades.reduce((a, b) => a + b.PnLUSD, 0);
const grossLoss = Math.abs(lossTrades.reduce((a, b) => a + b.PnLUSD, 0));
const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 99.0;
const netProfitUSD = runBal - initialCapital;
const returnPct = (netProfitUSD / initialCapital) * 100;
const winRate = (winTrades.length / processedTrades.length) * 100;

const avgWin = winTrades.length > 0 ? grossProfit / winTrades.length : 0;
const avgLoss = lossTrades.length > 0 ? grossLoss / lossTrades.length : 0;
const largestWin = winTrades.length > 0 ? Math.max(...winTrades.map(t => t.PnLUSD)) : 0;
const largestLoss = lossTrades.length > 0 ? Math.min(...lossTrades.map(t => t.PnLUSD)) : 0;

const summary = {
  strategyName: 'Volatility Squeeze Breakout (NR7 + Bollinger Bands)',
  symbol: 'OANDA:XAUUSD (Gold / US Dollar)',
  timeframe: '1-Hour (1H)',
  backtestPeriod: 'Feb 16, 2026 – Aug 19, 2026 (6 Months)',
  initialCapital: initialCapital,
  finalBalance: parseFloat(runBal.toFixed(2)),
  netProfitUSD: parseFloat(netProfitUSD.toFixed(2)),
  returnPct: parseFloat(returnPct.toFixed(2)),
  totalTrades: processedTrades.length,
  winningTrades: winTrades.length,
  losingTrades: lossTrades.length,
  winRatePct: parseFloat(winRate.toFixed(2)),
  profitFactor: parseFloat(profitFactor.toFixed(2)),
  maxDrawdownUSD: parseFloat(maxDD.toFixed(2)),
  maxDrawdownPct: parseFloat(maxDDPct.toFixed(2)),
  avgWinUSD: parseFloat(avgWin.toFixed(2)),
  avgLossUSD: parseFloat(avgLoss.toFixed(2)),
  largestWinUSD: parseFloat(largestWin.toFixed(2)),
  largestLossUSD: parseFloat(largestLoss.toFixed(2)),
  riskRewardRatio: '1 : 2.00 (Fixed Target)'
};

// Build Chart Markers
const markers = [];
processedTrades.forEach(t => {
  markers.push({
    time: t.entryTimeSec,
    position: t.Type === 'LONG' ? 'belowBar' : 'aboveBar',
    color: t.Type === 'LONG' ? '#2ECC71' : '#E74C3C',
    shape: t.Type === 'LONG' ? 'arrowUp' : 'arrowDown',
    text: `#${t.TradeNum} ${t.Type} @ $${t.EntryPrice}`
  });

  markers.push({
    time: t.exitTimeSec,
    position: t.Type === 'LONG' ? 'aboveBar' : 'belowBar',
    color: t.Result === 'WIN' ? '#F1C40F' : '#E74C3C',
    shape: 'circle',
    text: `#${t.TradeNum} ${t.Result} (${t.PnLUSD >= 0 ? '+$' : '-$'}${Math.abs(t.PnLUSD).toLocaleString()})`
  });
});
markers.sort((a, b) => a.time - b.time);

const terminalData = {
  summary,
  trades: processedTrades,
  markers,
  candles: candles1h.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>Apex Volatility Squeeze Terminal — 1H NR7 + BB Breakout Engine (XAU/USD)</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!-- TradingView Lightweight Charts -->
  <script src="https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js"></script>
  <!-- Chart.js & Lucide Icons -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    :root {
      --bg-dark: #070A10;
      --card-bg: rgba(15, 22, 36, 0.94);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-gold: #F1C40F;
      --accent-gold-glow: rgba(241, 196, 15, 0.25);
      --accent-green: #2ECC71;
      --accent-red: #E74C3C;
      --accent-blue: #3498DB;
      --accent-purple: #9B59B6;
      --text-main: #F1F5F9;
      --text-muted: #94A3B8;
      --font-main: 'Inter', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: var(--font-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-image: 
        radial-gradient(circle at 10% 15%, rgba(241, 196, 15, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 90% 85%, rgba(46, 204, 113, 0.05) 0%, transparent 40%);
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* Fluid Responsive Header */
    header {
      background: rgba(11, 16, 26, 0.96);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: clamp(10px, 1.5vw, 16px) clamp(14px, 2vw, 28px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      flex-wrap: wrap;
      gap: 12px;
    }

    .brand { display: flex; align-items: center; gap: 12px; }

    .brand-icon {
      width: clamp(34px, 4vw, 42px);
      height: clamp(34px, 4vw, 42px);
      background: linear-gradient(135deg, #F1C40F, #D4AC0D);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      color: #000;
      box-shadow: 0 0 16px var(--accent-gold-glow);
      flex-shrink: 0;
    }

    .brand-title {
      font-size: clamp(15px, 2vw, 18px); font-weight: 800; letter-spacing: -0.5px;
      background: linear-gradient(90deg, #FFFFFF, #CBD5E1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-subtitle {
      font-size: clamp(9.5px, 1.2vw, 11px); color: var(--accent-gold); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    .header-controls { 
      display: flex; 
      align-items: center; 
      gap: 8px; 
      flex-wrap: wrap; 
    }

    .btn-strategy-guide {
      background: linear-gradient(135deg, #F1C40F, #D4AC0D);
      color: #000000;
      border: none;
      padding: clamp(7px, 1vw, 9px) clamp(10px, 1.5vw, 16px);
      border-radius: 10px;
      font-family: var(--font-main);
      font-size: clamp(11px, 1.2vw, 12.5px);
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 0 14px rgba(241, 196, 15, 0.35);
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .view-tab-btn {
      background: rgba(20, 29, 47, 0.8);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: clamp(6px, 1vw, 8px) clamp(9px, 1.2vw, 14px);
      border-radius: 9px;
      font-family: var(--font-main);
      font-size: clamp(11px, 1.2vw, 12px); font-weight: 600;
      cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .view-tab-btn.active {
      background: rgba(241, 196, 15, 0.15);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      box-shadow: 0 0 12px var(--accent-gold-glow);
    }

    .tz-toggle-btn {
      background: rgba(52, 152, 219, 0.15);
      border: 1px solid rgba(52, 152, 219, 0.4);
      color: #3498DB;
      padding: clamp(6px, 1vw, 8px) clamp(9px, 1.2vw, 14px);
      border-radius: 9px;
      font-size: clamp(11px, 1.2vw, 12px); font-weight: 700;
      cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .tz-toggle-btn:hover { background: rgba(52, 152, 219, 0.3); color: #FFFFFF; }

    /* Dashboard Layout */
    .dashboard-container {
      padding: clamp(10px, 1.8vw, 24px);
      max-width: 1720px;
      margin: 0 auto;
      width: 100%;
      display: flex; flex-direction: column; gap: clamp(12px, 1.8vw, 22px);
    }

    .strategy-banner {
      background: linear-gradient(135deg, rgba(241, 196, 15, 0.12), rgba(15, 22, 36, 0.95));
      border: 1px solid rgba(241, 196, 15, 0.3);
      border-radius: 14px;
      padding: clamp(12px, 1.5vw, 18px);
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 12px;
    }

    .banner-title { font-size: clamp(14px, 1.6vw, 16px); font-weight: 800; color: #FFFFFF; display: flex; align-items: center; gap: 8px; }
    .banner-desc { font-size: clamp(11.5px, 1.2vw, 12.5px); color: #CBD5E1; margin-top: 3px; line-height: 1.4; }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(clamp(130px, 12vw, 180px), 1fr));
      gap: clamp(8px, 1.2vw, 14px);
    }

    .kpi-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: clamp(10px, 1.4vw, 16px);
      display: flex; flex-direction: column; gap: 4px;
      position: relative; overflow: hidden;
    }

    .kpi-card::before {
      content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2.5px;
      background: linear-gradient(90deg, transparent, var(--accent-gold), transparent);
      opacity: 0.5;
    }

    .kpi-label {
      font-size: clamp(9.5px, 1.1vw, 11px); font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.5px;
      display: flex; justify-content: space-between; align-items: center;
    }

    .kpi-value { font-size: clamp(17px, 2vw, 22px); font-weight: 800; font-family: var(--font-mono); letter-spacing: -0.5px; }
    .kpi-subtext { font-size: clamp(10.5px, 1.1vw, 11.5px); font-weight: 500; }

    /* Main Chart Card */
    .chart-section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: clamp(12px, 1.6vw, 20px);
      display: flex; flex-direction: column; gap: 14px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    }

    .section-header {
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 12px;
    }

    .section-title { font-size: clamp(14px, 1.5vw, 16px); font-weight: 700; display: flex; align-items: center; gap: 8px; }

    .trade-picker-group { 
      display: flex; 
      align-items: center; 
      gap: 8px; 
      flex-wrap: wrap; 
    }

    select, .btn-action {
      background: rgba(20, 29, 47, 0.8);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 7px 12px;
      border-radius: 8px;
      font-family: var(--font-main);
      font-size: clamp(11.5px, 1.2vw, 12.5px); font-weight: 500;
      outline: none; cursor: pointer;
      transition: all 0.2s ease;
      display: flex; align-items: center; gap: 6px;
      min-height: 36px;
    }

    select:hover, .btn-action:hover { border-color: var(--accent-gold); }

    #tvLightweightChart {
      width: 100%;
      height: clamp(340px, 50vh, 580px);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #080C14;
      position: relative;
    }

    .chart-overlay-legend {
      position: absolute;
      top: 10px; left: 10px; right: 10px;
      z-index: 20;
      background: rgba(11, 16, 26, 0.88);
      backdrop-filter: blur(8px);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 6px 10px;
      display: flex; flex-wrap: wrap; gap: 8px;
      font-size: clamp(10.5px, 1.1vw, 12px);
      font-family: var(--font-mono);
      pointer-events: none;
    }

    .trade-annotation-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(clamp(130px, 14vw, 170px), 1fr));
      gap: 8px;
      background: rgba(20, 29, 47, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px 14px;
    }

    .anno-item { display: flex; flex-direction: column; gap: 2px; }
    .anno-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
    .anno-val { font-size: clamp(11.5px, 1.2vw, 12.5px); font-weight: 700; font-family: var(--font-mono); }

    .charts-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
    }

    .sub-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: clamp(12px, 1.6vw, 18px);
      display: flex; flex-direction: column; gap: 12px;
    }

    .table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 10px;
      border: 1px solid var(--card-border);
      max-height: 460px;
    }

    table { width: 100%; border-collapse: collapse; font-size: clamp(11.5px, 1.2vw, 12.5px); text-align: left; }

    thead th {
      position: sticky; top: 0;
      background: rgba(18, 26, 43, 0.98);
      z-index: 10;
      padding: 10px 12px;
      font-weight: 700; color: var(--text-muted);
      text-transform: uppercase; font-size: clamp(9.5px, 1.1vw, 10.5px);
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--card-border);
      white-space: nowrap;
    }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      white-space: nowrap;
      font-family: var(--font-mono);
      font-size: clamp(11px, 1.2vw, 12px);
    }

    tr:hover { background: rgba(241, 196, 15, 0.07); cursor: pointer; }
    tr.active-trade-row { background: rgba(241, 196, 15, 0.18) !important; border-left: 3px solid var(--accent-gold); }

    .badge {
      padding: 2.5px 7px; border-radius: 5px; font-size: 10px; font-weight: 700;
      text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px;
    }

    .badge-win { background: rgba(46, 204, 113, 0.15); color: #2ECC71; border: 1px solid rgba(46, 204, 113, 0.3); }
    .badge-loss { background: rgba(231, 76, 60, 0.15); color: #E74C3C; border: 1px solid rgba(231, 76, 60, 0.3); }
    .badge-long { background: rgba(52, 152, 219, 0.15); color: #3498DB; border: 1px solid rgba(52, 152, 219, 0.3); }
    .badge-short { background: rgba(155, 89, 182, 0.15); color: #9B59B6; border: 1px solid rgba(155, 89, 182, 0.3); }
    .badge-tz { background: rgba(52, 152, 219, 0.15); color: #3498DB; border: 1px solid rgba(52, 152, 219, 0.3); }

    .text-green { color: var(--accent-green); }
    .text-red { color: var(--accent-red); }
    .text-gold { color: var(--accent-gold); }
    .text-blue { color: var(--accent-blue); }

    @media (max-width: 1024px) { .charts-grid { grid-template-columns: 1fr; } }
    @media (max-width: 768px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .trade-picker-group { width: 100%; flex-direction: column; }
      .trade-picker-group select, .trade-picker-group button { width: 100%; justify-content: center; }
    }

    /* Modal Responsive */
    .strategy-modal-backdrop {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(4, 7, 13, 0.90);
      backdrop-filter: blur(18px);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: clamp(10px, 2vw, 24px);
      overflow-y: auto;
    }

    .strategy-modal-backdrop.active { display: flex; }

    .strategy-modal-card {
      background: #0B101D;
      border: 1px solid rgba(241, 196, 15, 0.4);
      box-shadow: 0 0 60px rgba(0, 0, 0, 0.95);
      border-radius: 18px;
      max-width: 1000px;
      width: 100%;
      max-height: 94vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .modal-header {
      background: rgba(18, 26, 43, 0.98);
      border-bottom: 1px solid var(--card-border);
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-close-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      width: 34px; height: 34px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 16px;
      color: #E2E8F0;
      line-height: 1.6;
      font-size: 13.5px;
    }

    .lesson-section {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">
        <i data-lucide="zap"></i>
      </div>
      <div>
        <div class="brand-title">VOLATILITY SQUEEZE TERMINAL</div>
        <div class="brand-subtitle">1H NR7 + Bollinger Bands Compression Engine</div>
      </div>
    </div>

    <div class="header-controls">
      <button class="tz-toggle-btn" id="btnToggleTZ" onclick="toggleTimezone()">
        <i data-lucide="globe"></i> <span id="tzLabel">🇮🇳 IST (UTC+5:30)</span>
      </button>
      <button class="btn-strategy-guide" onclick="openStrategyModal()">
        <i data-lucide="book-open"></i> 📘 Squeeze Strategy Guide
      </button>
      <a href="index.html" class="view-tab-btn" style="text-decoration:none;">
        <i data-lucide="arrow-left"></i> Main Terminal
      </a>
      <a href="xauusd_quant_research.html" class="view-tab-btn" style="text-decoration:none;">
        <i data-lucide="microscope"></i> Research Lab
      </a>
    </div>
  </header>

  <!-- Main Container -->
  <div class="dashboard-container">

    <!-- Strategy Summary Banner -->
    <div class="strategy-banner">
      <div>
        <div class="banner-title">
          <i data-lucide="flame" class="text-gold"></i>
          1-Hour Volatility Squeeze Breakout — XAU/USD (Gold)
        </div>
        <div class="banner-desc">
          Executed on <b>TradingView OANDA:XAUUSD 1H Live Candlesticks</b> (Feb 16, 2026 – Aug 19, 2026). Triggers explosive entries following NR7 coiling inside compressed Bollinger Bands.
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <span class="badge badge-tz" id="badgeActiveTZ">Active TZ: 🇮🇳 IST</span>
        <span class="badge badge-long">1-Hour (1H)</span>
        <span class="badge badge-win">OANDA:XAUUSD</span>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Starting Capital <i data-lucide="wallet"></i></div>
        <div class="kpi-value" id="kpiInitial">$10,000</div>
        <div class="kpi-subtext text-muted">Initial Base Account</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Final Balance <i data-lucide="shield-check"></i></div>
        <div class="kpi-value text-gold" id="kpiFinal">$38,945</div>
        <div class="kpi-subtext text-green" id="kpiReturnPct">+289.5% Net Return</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Net Profit <i data-lucide="dollar-sign"></i></div>
        <div class="kpi-value text-green" id="kpiNetProfit">+$28,945</div>
        <div class="kpi-subtext text-muted" id="kpiTradesCount">38 Total Trades</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Win Rate <i data-lucide="target"></i></div>
        <div class="kpi-value text-green" id="kpiWinRate">63.2%</div>
        <div class="kpi-subtext text-muted" id="kpiWinLossRatio">24 W / 14 L</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Profit Factor <i data-lucide="bar-chart-3"></i></div>
        <div class="kpi-value text-gold" id="kpiProfitFactor">2.14</div>
        <div class="kpi-subtext text-muted">Gross P / Gross L</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Max Drawdown <i data-lucide="alert-triangle"></i></div>
        <div class="kpi-value text-red" id="kpiMaxDrawdown">22.4%</div>
        <div class="kpi-subtext text-muted" id="kpiMaxDDUSD">-$5,420 USD</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Avg Win / Loss <i data-lucide="scale"></i></div>
        <div class="kpi-value text-blue" id="kpiAvgWinLoss" style="font-size:clamp(14px, 1.5vw, 16px);">+$2.1k / -$1.5k</div>
        <div class="kpi-subtext text-muted">Per Executed Trade</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Best / Worst <i data-lucide="zap"></i></div>
        <div class="kpi-value text-green" id="kpiBestWorst" style="font-size:clamp(14px, 1.5vw, 16px);">+$8.4k / -$3.9k</div>
        <div class="kpi-subtext text-muted">Largest Win / Loss</div>
      </div>
    </div>

    <!-- MAIN CHART SECTION -->
    <div class="chart-section-card">
      <div class="section-header">
        <div>
          <div class="section-title">
            <i data-lucide="activity" class="text-gold"></i>
            TradingView 1H Chart — Volatility Squeeze Breakout (XAU/USD)
          </div>
          <div class="kpi-subtext text-muted" style="margin-top: 2px;">
            Interactive TradingView canvas. Green/Red markers show squeeze entries & targets. Tap any trade to zoom!
          </div>
        </div>

        <div class="trade-picker-group">
          <button class="btn-action" onclick="fitAllTrades()" style="background:rgba(241,196,15,0.15); color:var(--accent-gold); border-color:var(--accent-gold);">
            <i data-lucide="maximize-2"></i> Reset View
          </button>
          <select id="tradeSelector" onchange="selectTrade(parseInt(this.value))">
            <!-- Populated via JS -->
          </select>
          <div style="display:flex; gap:6px; flex: 1;">
            <button class="btn-action" onclick="prevTrade()" style="flex:1;"><i data-lucide="chevron-left"></i> Prev</button>
            <button class="btn-action" onclick="nextTrade()" style="flex:1;">Next <i data-lucide="chevron-right"></i></button>
          </div>
        </div>
      </div>

      <!-- Trade Annotation Bar -->
      <div class="trade-annotation-bar" id="tradeAnnotationBar">
        <!-- Populated via JS -->
      </div>

      <!-- Chart Container -->
      <div id="tvLightweightChart">
        <div class="chart-overlay-legend" id="chartLegend">
          <span style="font-weight:700; color:var(--accent-gold);">XAUUSD 1H</span>
          <span id="legendOHLC" style="color:#CBD5E1;">Touch candle to inspect</span>
        </div>
      </div>
    </div>

    <!-- Secondary Charts -->
    <div class="charts-grid">
      <div class="sub-card">
        <div class="section-title">
          <i data-lucide="line-chart" class="text-gold"></i> Cumulative Account Equity Curve ($10k → $38.9k)
        </div>
        <div style="height: clamp(190px, 25vh, 240px); position: relative;">
          <canvas id="equityChart"></canvas>
        </div>
      </div>

      <div class="sub-card">
        <div class="section-title">
          <i data-lucide="pie-chart" class="text-gold"></i> Win/Loss Distribution (24 Wins / 14 Losses)
        </div>
        <div style="height: clamp(190px, 25vh, 240px); position: relative;">
          <canvas id="winLossChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Master Trade Ledger -->
    <div class="sub-card">
      <div class="section-header">
        <div class="section-title">
          <i data-lucide="list" class="text-gold"></i> Master Trade Ledger — Volatility Squeeze Breakout
        </div>
      </div>

      <div class="table-wrapper">
        <table id="tradeTable">
          <thead>
            <tr>
              <th>Trade #</th>
              <th>Direction</th>
              <th id="thEntryTime">Entry Time (IST)</th>
              <th id="thExitTime">Exit Time (IST)</th>
              <th>Lot Size</th>
              <th>Entry Price</th>
              <th>Initial SL</th>
              <th>Hard TP</th>
              <th>Exit Price</th>
              <th>Net PnL ($)</th>
              <th>Result</th>
              <th>Balance ($)</th>
            </tr>
          </thead>
          <tbody id="tradeTableBody">
            <!-- Populated via JS -->
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- Strategy Modal -->
  <div class="strategy-modal-backdrop" id="strategyModalBackdrop" onclick="handleModalBackdropClick(event)">
    <div class="strategy-modal-card" id="strategyModalCard">
      <div class="modal-header">
        <div class="brand" style="gap:10px;">
          <div class="brand-icon" style="width:34px; height:34px;">
            <i data-lucide="zap"></i>
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 800; color: #FFFFFF;">1H Volatility Squeeze Strategy Blueprint</div>
            <div style="font-size: 11px; color: var(--accent-gold); font-weight: 600;">NR7 + Bollinger Bands Contraction & Expansion Logic</div>
          </div>
        </div>
        <button class="modal-close-btn" onclick="closeStrategyModal()"><i data-lucide="x"></i></button>
      </div>

      <div class="modal-body">
        <div class="lesson-section">
          <div style="font-weight:800; color:var(--accent-gold); font-size:14px;">1. The Coiling Spring Concept</div>
          <p>
            Volatility is cyclical: **Extreme Compression leads to Explosive Expansion**. When Gold contracts into a tight range with low volume, market makers build large positions before releasing the price.
          </p>
        </div>

        <div class="lesson-section">
          <div style="font-weight:800; color:var(--accent-green); font-size:14px;">2. The 3-Step Identification Rule</div>
          <ul style="padding-left:18px; display:flex; flex-direction:column; gap:6px;">
            <li><b>Step 1 (BB Squeeze)</b>: 20-period Bollinger Band Width reaches the bottom 25th percentile of recent history.</li>
            <li><b>Step 2 (NR7)</b>: The current 1H candle has the narrowest High-Low range of the last 7 bars.</li>
            <li><b>Step 3 (Breakout Trigger)</b>: The next 1H candle closes **above the 3-bar consolidation high (BUY)** or **below the 3-bar consolidation low (SELL)**.</li>
          </ul>
        </div>

        <div class="lesson-section">
          <div style="font-weight:800; color:var(--accent-blue); font-size:14px;">3. Risk & Money Management</div>
          <p>
            • **Stop Loss**: Placed on the opposite side of the 3-bar consolidation box.<br>
            • **Take Profit**: Exactly **1 : 2.00 Risk:Reward Ratio**.<br>
            • **Risk per trade**: 10.0% of account balance with dynamic lot sizing.
          </p>
        </div>
      </div>
    </div>
  </div>

  <script>
    const data = ${JSON.stringify(terminalData)};
    let activeTimezone = 'IST';
    let currentTradeIdx = 0;

    let chartInstance = null;
    let candlestickSeries = null;
    let entryLine = null, slLine = null, tpLine = null;
    let equityChartInstance = null, winLossChartInstance = null;

    window.onload = function() {
      lucide.createIcons();
      initLightweightTradingViewChart();
      updateDashboard();
    };

    function updateDashboard() {
      const summary = data.summary;
      const trades = data.trades;

      document.getElementById('kpiFinal').textContent = \`$\${summary.finalBalance.toLocaleString('en-US', {maximumFractionDigits: 0})}\`;
      document.getElementById('kpiReturnPct').textContent = \`+\${summary.returnPct.toFixed(1)}% Net Return\`;
      document.getElementById('kpiNetProfit').textContent = \`+$\${summary.netProfitUSD.toLocaleString('en-US', {maximumFractionDigits: 0})}\`;
      document.getElementById('kpiTradesCount').textContent = \`\${summary.totalTrades} Total Trades\`;
      document.getElementById('kpiWinRate').textContent = \`\${summary.winRatePct}%\`;
      document.getElementById('kpiWinLossRatio').textContent = \`\${summary.winningTrades} W / \${summary.losingTrades} L\`;
      document.getElementById('kpiProfitFactor').textContent = summary.profitFactor;
      document.getElementById('kpiMaxDrawdown').textContent = \`\${summary.maxDrawdownPct}%\`;
      document.getElementById('kpiMaxDDUSD').textContent = \`-$\${summary.maxDrawdownUSD.toLocaleString()} USD\`;
      document.getElementById('kpiAvgWinLoss').textContent = \`+$\${(summary.avgWinUSD/1000).toFixed(1)}k / -$\${(summary.avgLossUSD/1000).toFixed(1)}k\`;
      document.getElementById('kpiBestWorst').textContent = \`+$\${(summary.largestWinUSD/1000).toFixed(1)}k / -$\${(Math.abs(summary.largestLossUSD)/1000).toFixed(1)}k\`;

      if (candlestickSeries) {
        candlestickSeries.setData(data.candles);
        candlestickSeries.setMarkers(data.markers);
        fitAllTrades();
      }

      populateTradeSelector();
      renderTradeAnnotation(0);
      renderTable();
      updateSecondaryCharts(trades, summary);
    }

    function toggleTimezone() {
      activeTimezone = activeTimezone === 'IST' ? 'UTC' : 'IST';
      document.getElementById('tzLabel').textContent = activeTimezone === 'IST' ? '🇮🇳 IST (UTC+5:30)' : '🌐 UTC (Global)';
      document.getElementById('badgeActiveTZ').textContent = activeTimezone === 'IST' ? 'Active TZ: 🇮🇳 IST' : 'Active TZ: 🌐 UTC';
      document.getElementById('thEntryTime').textContent = activeTimezone === 'IST' ? 'Entry Time (IST)' : 'Entry Time (UTC)';
      document.getElementById('thExitTime').textContent = activeTimezone === 'IST' ? 'Exit Time (IST)' : 'Exit Time (UTC)';
      
      populateTradeSelector();
      renderTradeAnnotation(currentTradeIdx);
      renderTable();
    }

    function initLightweightTradingViewChart() {
      const container = document.getElementById('tvLightweightChart');
      container.innerHTML = '<div class="chart-overlay-legend" id="chartLegend"><span style="font-weight:700; color:var(--accent-gold);">XAUUSD 1H</span><span id="legendOHLC" style="color:#CBD5E1;">Touch candle to inspect</span></div>';

      chartInstance = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { color: '#080C14' }, textColor: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' },
        grid: { vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, horzLines: { color: 'rgba(255, 255, 255, 0.05)' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.08)' },
        timeScale: { borderColor: 'rgba(255, 255, 255, 0.08)', timeVisible: true }
      });

      candlestickSeries = chartInstance.addCandlestickSeries({
        upColor: '#2ECC71', downColor: '#E74C3C', borderVisible: false, wickUpColor: '#2ECC71', wickDownColor: '#E74C3C'
      });

      chartInstance.subscribeCrosshairMove(param => {
        const legend = document.getElementById('legendOHLC');
        if (!param || !param.time || !param.seriesData.get(candlestickSeries)) {
          legend.innerHTML = 'Touch candle to inspect';
          return;
        }
        const d = param.seriesData.get(candlestickSeries);
        const timeSec = param.time;
        const dUtc = new Date(timeSec * 1000);
        const dIst = new Date((timeSec + 5.5 * 3600) * 1000);
        const timeStr = activeTimezone === 'IST' 
          ? dIst.toISOString().slice(5, 10) + ' ' + dIst.toISOString().slice(11, 16) + ' IST'
          : dUtc.toISOString().slice(5, 10) + ' ' + dUtc.toISOString().slice(11, 16) + ' UTC';

        legend.innerHTML = \`<span style="color:#F1C40F;">\${timeStr}</span> | O: <b style="color:\${d.close >= d.open ? '#2ECC71' : '#E74C3C'}">$\${d.open}</b> | H: <b>$\${d.high}</b> | L: <b>$\${d.low}</b> | C: <b style="color:\${d.close >= d.open ? '#2ECC71' : '#E74C3C'}">$\${d.close}</b>\`;
      });

      let resizeTimeout;
      const ro = new ResizeObserver(entries => {
        cancelAnimationFrame(resizeTimeout);
        resizeTimeout = requestAnimationFrame(() => {
          if (entries[0] && chartInstance) {
            chartInstance.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
          }
        });
      });
      ro.observe(container);
    }

    function fitAllTrades() {
      if (chartInstance) chartInstance.timeScale().fitContent();
    }

    function focusOnTrade(idx) {
      if (!chartInstance || !candlestickSeries) return;
      const t = data.trades[idx];
      if (!t) return;

      if (entryLine) candlestickSeries.removePriceLine(entryLine);
      if (slLine) candlestickSeries.removePriceLine(slLine);
      if (tpLine) candlestickSeries.removePriceLine(tpLine);

      entryLine = candlestickSeries.createPriceLine({
        price: t.EntryPrice,
        color: '#F1C40F',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: \`#\${t.TradeNum} ENTRY: $\${t.EntryPrice}\`
      });

      slLine = candlestickSeries.createPriceLine({
        price: t.InitialSL,
        color: '#E74C3C',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: \`SL: $\${t.InitialSL}\`
      });

      tpLine = candlestickSeries.createPriceLine({
        price: t.HardTP,
        color: '#2ECC71',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: \`TP: $\${t.HardTP}\`
      });

      const rangeMargin = 12 * 3600;
      chartInstance.timeScale().setVisibleRange({
        from: t.entryTimeSec - rangeMargin,
        to: t.exitTimeSec + rangeMargin
      });
    }

    function populateTradeSelector() {
      const select = document.getElementById('tradeSelector');
      select.innerHTML = '';
      data.trades.forEach((t, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        const icon = t.Result === 'WIN' ? '✅' : '❌';
        const dateStr = activeTimezone === 'IST' ? t.entryTimeIST : t.entryTimeUTC;
        option.textContent = \`#\${t.TradeNum}: \${t.Type} @ $\${t.EntryPrice} [\${dateStr.slice(5)}] (\${icon} \${t.PnLUSD >= 0 ? '+$' : '-$'}\${Math.abs(t.PnLUSD).toFixed(0)})\`;
        select.appendChild(option);
      });
      select.value = currentTradeIdx;
    }

    function selectTrade(idx) {
      currentTradeIdx = idx;
      document.getElementById('tradeSelector').value = idx;
      renderTradeAnnotation(idx);
      focusOnTrade(idx);
      highlightTableRow(idx);
    }

    function prevTrade() { if (currentTradeIdx > 0) selectTrade(currentTradeIdx - 1); }
    function nextTrade() { if (currentTradeIdx < data.trades.length - 1) selectTrade(currentTradeIdx + 1); }

    function renderTradeAnnotation(idx) {
      const t = data.trades[idx];
      if (!t) return;
      const isWin = t.Result === 'WIN';
      const pnl = parseFloat(t.PnLUSD);
      const entryTime = activeTimezone === 'IST' ? t.entryTimeIST : t.entryTimeUTC;
      const exitTime = activeTimezone === 'IST' ? t.exitTimeIST : t.exitTimeUTC;

      document.getElementById('tradeAnnotationBar').innerHTML = \`
        <div class="anno-item">
          <span class="anno-label">Selected Setup</span>
          <span class="anno-val text-gold">Trade #\${t.TradeNum} (\${t.Type})</span>
        </div>
        <div class="anno-item">
          <span class="anno-label">\${activeTimezone === 'IST' ? '🇮🇳 Entry (IST)' : '🌐 Entry (UTC)'}</span>
          <span class="anno-val text-blue">\${entryTime}</span>
        </div>
        <div class="anno-item">
          <span class="anno-label">\${activeTimezone === 'IST' ? '🇮🇳 Exit (IST)' : '🌐 Exit (UTC)'}</span>
          <span class="anno-val \${isWin ? 'text-green' : 'text-red'}">\${exitTime}</span>
        </div>
        <div class="anno-item">
          <span class="anno-label">Position Size</span>
          <span class="anno-val text-gold">\${t.StandardLots}</span>
        </div>
        <div class="anno-item">
          <span class="anno-label">Price Move</span>
          <span class="anno-val">$\${t.EntryPrice} &rarr; $\${t.ExitPrice}</span>
        </div>
        <div class="anno-item">
          <span class="anno-label">Net Profit</span>
          <span class="anno-val \${pnl >= 0 ? 'text-green' : 'text-red'}">\${pnl >= 0 ? '+$' : '-$'}\${Math.abs(pnl).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
        </div>
      \`;
    }

    function renderTable() {
      const tbody = document.getElementById('tradeTableBody');
      tbody.innerHTML = '';
      data.trades.forEach((t, idx) => {
        const isWin = t.Result === 'WIN';
        const isLong = t.Type === 'LONG';
        const pnl = parseFloat(t.PnLUSD);
        const entryTime = activeTimezone === 'IST' ? t.entryTimeIST : t.entryTimeUTC;
        const exitTime = activeTimezone === 'IST' ? t.exitTimeIST : t.exitTimeUTC;

        const tr = document.createElement('tr');
        tr.id = \`trade-row-\${idx}\`;
        if (idx === currentTradeIdx) tr.classList.add('active-trade-row');
        tr.onclick = () => selectTrade(idx);

        tr.innerHTML = \`
          <td><b class="text-gold">#\${t.TradeNum}</b></td>
          <td><span class="badge \${isLong ? 'badge-long' : 'badge-short'}">\${t.Type}</span></td>
          <td><span class="text-gold" style="font-weight:600;">\${entryTime}</span></td>
          <td>\${exitTime}</td>
          <td><b class="text-blue">\${t.StandardLots}</b></td>
          <td>$\${t.EntryPrice}</td>
          <td class="text-red">$\${t.InitialSL}</td>
          <td class="text-green">$\${t.HardTP}</td>
          <td>$\${t.ExitPrice}</td>
          <td class="\${pnl >= 0 ? 'text-green' : 'text-red'}"><b>\${pnl >= 0 ? '+$' : '-$'}\${Math.abs(pnl).toFixed(0)}</b></td>
          <td><span class="badge \${isWin ? 'badge-win' : 'badge-loss'}">\${t.Result}</span></td>
          <td><b class="text-gold">$\${t.RunningBalance.toLocaleString('en-US', {minimumFractionDigits: 0})}</b></td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function highlightTableRow(idx) {
      document.querySelectorAll('#tradeTableBody tr').forEach(r => r.classList.remove('active-trade-row'));
      const row = document.getElementById(\`trade-row-\${idx}\`);
      if (row) {
        row.classList.add('active-trade-row');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function updateSecondaryCharts(trades, summary) {
      const equityLabels = ['Start', ...trades.map(t => \`#\${t.TradeNum}\`)];
      const equityData = [10000, ...trades.map(t => t.RunningBalance)];

      if (equityChartInstance) equityChartInstance.destroy();
      const ctxEq = document.getElementById('equityChart').getContext('2d');
      equityChartInstance = new Chart(ctxEq, {
        type: 'line',
        data: {
          labels: equityLabels,
          datasets: [{
            label: 'Balance ($)',
            data: equityData,
            borderColor: '#F1C40F',
            backgroundColor: 'rgba(241, 196, 15, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointBackgroundColor: '#F1C40F',
            pointRadius: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: { size: 9 }, maxTicksLimit: 10 } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', callback: (v) => \`$\${(v/1000).toFixed(0)}k\` } }
          }
        }
      });

      if (winLossChartInstance) winLossChartInstance.destroy();
      const ctxWL = document.getElementById('winLossChart').getContext('2d');
      winLossChartInstance = new Chart(ctxWL, {
        type: 'doughnut',
        data: {
          labels: [\`Wins (\${summary.winningTrades})\`, \`Losses (\${summary.losingTrades})\`],
          datasets: [{
            data: [summary.winningTrades, summary.losingTrades],
            backgroundColor: ['#2ECC71', '#E74C3C'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#F1F5F9', font: { family: 'Inter', size: 11 } } } }
        }
      });
    }

    function openStrategyModal() { document.getElementById('strategyModalBackdrop').classList.add('active'); }
    function closeStrategyModal() { document.getElementById('strategyModalBackdrop').classList.remove('active'); }
    function handleModalBackdropClick(e) { if (e.target.id === 'strategyModalBackdrop') closeStrategyModal(); }
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'volatility_squeeze_terminal.html'), html);
console.log('✅ Successfully compiled volatility_squeeze_terminal.html!');
