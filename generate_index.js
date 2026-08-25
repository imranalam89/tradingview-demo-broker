const fs = require('fs');
const path = require('path');

// Load multi-pair backtest results
const multiPairData = JSON.parse(fs.readFileSync(path.join(__dirname, 'multi_pair_backtest_results.json'), 'utf-8'));

function formatTimes(timeSec) {
  const dUtc = new Date(timeSec * 1000);
  const istOffset = 5.5 * 3600 * 1000;
  const dIst = new Date(timeSec * 1000 + istOffset);
  
  const utcStr = dUtc.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const istStr = dIst.toISOString().replace('T', ' ').slice(0, 16) + ' IST';
  return { utc: utcStr, ist: istStr };
}

// Enhance trades with UTC and IST strings
Object.keys(multiPairData).forEach(pairKey => {
  const pair = multiPairData[pairKey];
  pair.trades = pair.trades.map(t => {
    const entryTimes = formatTimes(t.entryTimeSec);
    const exitTimes = formatTimes(t.exitTimeSec);
    return {
      ...t,
      entryTimeUTC: entryTimes.utc,
      entryTimeIST: entryTimes.ist,
      exitTimeUTC: exitTimes.utc,
      exitTimeIST: exitTimes.ist
    };
  });
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>Apex Multi-Asset Terminal — 4H TradingView Backtest Engine</title>
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
      --card-bg: rgba(15, 22, 36, 0.92);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-gold: #F1C40F;
      --accent-gold-glow: rgba(241, 196, 15, 0.25);
      --accent-green: #2ECC71;
      --accent-red: #E74C3C;
      --accent-blue: #3498DB;
      --accent-silver: #BDC3C7;
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
        radial-gradient(circle at 10% 20%, rgba(241, 196, 15, 0.04) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(52, 152, 219, 0.04) 0%, transparent 40%);
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

    /* Fluid Pair Selector Nav */
    .pair-selector-nav {
      display: flex;
      align-items: center;
      background: rgba(20, 29, 47, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 3px;
      gap: 4px;
    }

    .pair-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: clamp(6px, 1vw, 8px) clamp(10px, 1.5vw, 18px);
      border-radius: 9px;
      font-family: var(--font-mono);
      font-size: clamp(11.5px, 1.3vw, 13px); font-weight: 700;
      cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
    }

    .pair-btn:hover { color: var(--text-main); background: rgba(255, 255, 255, 0.05); }

    .pair-btn.active {
      background: linear-gradient(135deg, rgba(241, 196, 15, 0.2), rgba(241, 196, 15, 0.08));
      border: 1px solid var(--accent-gold);
      color: #FFFFFF;
      box-shadow: 0 0 14px var(--accent-gold-glow);
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

    .btn-strategy-guide:active { transform: scale(0.97); }

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

    /* Fluid Responsive 8-Card KPI Grid */
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

    /* Responsive Interactive TradingView Chart Container */
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
      top: 10px;
      left: 10px;
      right: 10px;
      z-index: 20;
      background: rgba(11, 16, 26, 0.88);
      backdrop-filter: blur(8px);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 6px 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: clamp(10.5px, 1.1vw, 12px);
      font-family: var(--font-mono);
      pointer-events: none;
    }

    .live-tv-container {
      width: 100%;
      height: clamp(340px, 50vh, 580px);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #080C14;
      display: none;
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
    tr.active-trade-row {
      background: rgba(241, 196, 15, 0.18) !important;
      border-left: 3px solid var(--accent-gold);
    }

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

    /* ==========================================================================
       RESPONSIVE BREAKPOINTS (Mobile, Tablet, Desktop)
       ========================================================================== */
    @media (max-width: 1024px) {
      .charts-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 768px) {
      header { padding: 10px 14px; }
      .pair-selector-nav { width: 100%; justify-content: space-between; }
      .pair-btn { flex: 1; justify-content: center; }
      .header-controls { width: 100%; justify-content: flex-start; }
      .btn-strategy-guide, .view-tab-btn, .tz-toggle-btn { flex: 1; justify-content: center; }
      .trade-picker-group { width: 100%; flex-direction: column; align-items: stretch; }
      .trade-picker-group select, .trade-picker-group button { width: 100%; justify-content: center; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 480px) {
      .brand { width: 100%; }
      .trade-annotation-bar { grid-template-columns: 1fr 1fr; }
      #tvLightweightChart, .live-tv-container { height: 320px; }
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
      box-shadow: 0 0 60px rgba(0, 0, 0, 0.95), 0 0 30px rgba(241, 196, 15, 0.2);
      border-radius: 18px;
      max-width: 1100px;
      width: 100%;
      max-height: 94vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: modalFadeIn 0.25s ease-out;
    }

    @keyframes modalFadeIn {
      from { transform: scale(0.96) translateY(15px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }

    .modal-header {
      background: rgba(18, 26, 43, 0.98);
      border-bottom: 1px solid var(--card-border);
      padding: clamp(12px, 1.5vw, 18px) clamp(16px, 2vw, 24px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .modal-close-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      width: 34px; height: 34px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .modal-close-btn:hover { background: rgba(231, 76, 60, 0.2); color: var(--accent-red); }

    .modal-nav-tabs {
      display: flex;
      gap: 6px;
      padding: 8px clamp(12px, 1.8vw, 20px);
      background: rgba(13, 20, 34, 0.95);
      border-bottom: 1px solid var(--card-border);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .modal-tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 7px 12px;
      border-radius: 8px;
      font-size: clamp(11px, 1.2vw, 12px); font-weight: 700;
      cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .modal-tab-btn:hover { color: var(--text-main); background: rgba(255, 255, 255, 0.04); }
    .modal-tab-btn.active {
      background: rgba(241, 196, 15, 0.15);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
    }

    .modal-body {
      padding: clamp(14px, 2vw, 24px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 20px;
      color: #E2E8F0;
      line-height: 1.6;
      font-size: clamp(12.5px, 1.3vw, 13.5px);
    }

    .modal-tab-content { display: none; flex-direction: column; gap: 18px; }
    .modal-tab-content.active { display: flex; }

    .lesson-section {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: clamp(14px, 1.8vw, 20px);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .lesson-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(241, 196, 15, 0.15);
      border: 1px solid rgba(241, 196, 15, 0.4);
      color: var(--accent-gold);
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      width: fit-content;
    }

    .lesson-title { font-size: clamp(14.5px, 1.6vw, 16.5px); font-weight: 800; color: #FFFFFF; }

    .kid-rule-box {
      background: rgba(46, 204, 113, 0.08);
      border-left: 4px solid var(--accent-green);
      padding: 12px 14px;
      border-radius: 0 10px 10px 0;
      font-size: clamp(12px, 1.2vw, 13px);
    }

    .kid-rule-box b { color: var(--accent-green); }

    .warning-rule-box {
      background: rgba(231, 76, 60, 0.08);
      border-left: 4px solid var(--accent-red);
      padding: 12px 14px;
      border-radius: 0 10px 10px 0;
      font-size: clamp(12px, 1.2vw, 13px);
    }

    .warning-rule-box b { color: var(--accent-red); }

    .graphic-container {
      background: #080C14;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
    }

    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(clamp(180px, 18vw, 240px), 1fr));
      gap: 12px;
    }

    .step-card {
      background: rgba(20, 29, 47, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .code-box {
      background: #05080E;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: clamp(11px, 1.1vw, 12px);
      color: #38BDF8;
      overflow-x: auto;
    }

    footer {
      text-align: center; padding: 18px; color: var(--text-muted); font-size: 11.5px;
      border-top: 1px solid var(--card-border); margin-top: auto;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">
        <i data-lucide="candlestick-chart"></i>
      </div>
      <div>
        <div class="brand-title">APEX MULTI-ASSET TERMINAL</div>
        <div class="brand-subtitle" id="headerSubtitle">4H Live TradingView Backtest Engine</div>
      </div>
    </div>

    <!-- Pair Selector Tabs: XAU/USD, XAG/USD, EUR/USD -->
    <div class="pair-selector-nav">
      <button class="pair-btn active" id="pairBtnXAUUSD" onclick="switchPair('XAUUSD')">
        <span style="color:#F1C40F;">●</span> XAU/USD
      </button>
      <button class="pair-btn" id="pairBtnXAGUSD" onclick="switchPair('XAGUSD')">
        <span style="color:#BDC3C7;">●</span> XAG/USD
      </button>
      <button class="pair-btn" id="pairBtnEURUSD" onclick="switchPair('EURUSD')">
        <span style="color:#3498DB;">●</span> EUR/USD
      </button>
    </div>

    <!-- Mode Switcher Tabs + Timezone Toggle -->
    <div class="header-controls">
      <button class="tz-toggle-btn" id="btnToggleTZ" onclick="toggleTimezone()">
        <i data-lucide="globe"></i> <span id="tzLabel">🇮🇳 IST (UTC+5:30)</span>
      </button>
      <button class="btn-strategy-guide" onclick="openStrategyModal()">
        <i data-lucide="book-open"></i> 📘 Strategy Manual
      </button>
      <a href="volatility_squeeze_terminal.html" class="view-tab-btn" style="text-decoration:none;">
        <i data-lucide="zap" class="text-gold"></i> ⚡ Squeeze Terminal
      </a>
      <a href="xauusd_quant_research.html" class="view-tab-btn" style="text-decoration:none;">
        <i data-lucide="microscope" class="text-blue"></i> 🔬 Quant Lab
      </a>
      <button class="view-tab-btn active" id="tabBacktest" onclick="switchChartMode('backtest')">
        <i data-lucide="crosshair"></i> 📊 4H Chart
      </button>
      <button class="view-tab-btn" id="tabLive" onclick="switchChartMode('live')">
        <i data-lucide="activity"></i> 🔴 Live Stream
      </button>
    </div>
  </header>

  <!-- Main Container -->
  <div class="dashboard-container">

    <!-- Strategy Summary Banner -->
    <div class="strategy-banner">
      <div>
        <div class="banner-title">
          <i data-lucide="award" class="text-gold"></i>
          <span id="bannerTitle">4-Hour S/R 1st-Touch Bounce — Gold / US Dollar (XAU/USD)</span>
        </div>
        <div class="banner-desc" id="bannerDesc">
          Executed on <b>TradingView OANDA:XAUUSD 4H Live Data</b> (Feb 1, 2026 – Aug 19, 2026).
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <span class="badge badge-tz" id="badgeActiveTZ">Active TZ: 🇮🇳 IST</span>
        <span class="badge badge-long">4-Hour (4H)</span>
        <span class="badge badge-win" id="badgePairSymbol">OANDA:XAUUSD</span>
      </div>
    </div>

    <!-- KPI Grid (8 Key Metrics) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Starting Capital <i data-lucide="wallet"></i></div>
        <div class="kpi-value" id="kpiInitial">$10,000</div>
        <div class="kpi-subtext text-muted">Initial Base Account</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Final Balance <i data-lucide="shield-check"></i></div>
        <div class="kpi-value text-gold" id="kpiFinal">$135,527</div>
        <div class="kpi-subtext text-green" id="kpiReturnPct">+1,255.3% Net Return</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Net Profit <i data-lucide="dollar-sign"></i></div>
        <div class="kpi-value text-green" id="kpiNetProfit">+$125,527</div>
        <div class="kpi-subtext text-muted" id="kpiTradesCount">116 Total Trades</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Win Rate <i data-lucide="target"></i></div>
        <div class="kpi-value text-green" id="kpiWinRate">69.8%</div>
        <div class="kpi-subtext text-muted" id="kpiWinLossRatio">81 W / 35 L</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Profit Factor <i data-lucide="bar-chart-3"></i></div>
        <div class="kpi-value text-gold" id="kpiProfitFactor">1.43</div>
        <div class="kpi-subtext text-muted">Gross P / Gross L</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Max Drawdown <i data-lucide="alert-triangle"></i></div>
        <div class="kpi-value text-red" id="kpiMaxDrawdown">51.2%</div>
        <div class="kpi-subtext text-muted" id="kpiMaxDDUSD">-$107,719 USD</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Avg Win / Loss <i data-lucide="scale"></i></div>
        <div class="kpi-value text-blue" id="kpiAvgWinLoss" style="font-size:clamp(14px, 1.5vw, 16px);">+$5.2k / -$8.4k</div>
        <div class="kpi-subtext text-muted">Per Executed Trade</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Best / Worst <i data-lucide="zap"></i></div>
        <div class="kpi-value text-green" id="kpiBestWorst" style="font-size:clamp(14px, 1.5vw, 16px);">+$42.1k / -$21.0k</div>
        <div class="kpi-subtext text-muted">Largest Win / Loss</div>
      </div>
    </div>

    <!-- MAIN CHART SECTION WITH FULL TRADINGVIEW ENGINE -->
    <div class="chart-section-card">

      <div class="section-header">
        <div>
          <div class="section-title">
            <i data-lucide="activity" class="text-gold"></i>
            <span id="chartSectionTitle">TradingView 4H Chart — Gold / US Dollar (XAU/USD)</span>
          </div>
          <div class="kpi-subtext text-muted" style="margin-top: 2px;">
            Interactive TradingView canvas. Green/Red markers show trade entries & exits. Tap any trade in table to zoom!
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

      <!-- Selected Trade Details Banner -->
      <div class="trade-annotation-bar" id="tradeAnnotationBar">
        <!-- Populated via JS -->
      </div>

      <!-- 1. Interactive TradingView Lightweight Chart Container -->
      <div id="tvLightweightChart">
        <div class="chart-overlay-legend" id="chartLegend">
          <span style="font-weight:700; color:var(--accent-gold);" id="legendSymbolLabel">XAUUSD 4H</span>
          <span id="legendOHLC" style="color:#CBD5E1;">Touch candle to inspect</span>
        </div>
      </div>

      <!-- 2. Embedded Live TradingView Cloud Widget (Alternative) -->
      <div class="live-tv-container" id="liveTvContainer">
        <div class="tradingview-widget-container" style="height:100%; width:100%;">
          <div id="tradingview_embed_box" style="height:100%; width:100%;"></div>
          <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
        </div>
      </div>

    </div>

    <!-- Secondary Analytics Grid -->
    <div class="charts-grid">
      <!-- Equity Curve -->
      <div class="sub-card">
        <div class="section-title">
          <i data-lucide="line-chart" class="text-gold"></i> <span id="equityChartTitle">Cumulative Account Equity Curve</span>
        </div>
        <div style="height: clamp(190px, 25vh, 240px); position: relative;">
          <canvas id="equityChart"></canvas>
        </div>
      </div>

      <!-- Performance by Trade Result -->
      <div class="sub-card">
        <div class="section-title">
          <i data-lucide="pie-chart" class="text-gold"></i> <span id="winLossChartTitle">Win/Loss Distribution</span>
        </div>
        <div style="height: clamp(190px, 25vh, 240px); position: relative;">
          <canvas id="winLossChart"></canvas>
        </div>
      </div>
    </div>

    <!-- Complete Master Ledger Table -->
    <div class="sub-card">
      <div class="section-header">
        <div class="section-title">
          <i data-lucide="list" class="text-gold"></i> <span id="tableSectionTitle">Master Trade Ledger</span>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <select id="tableFilterResult" onchange="renderTable()">
            <option value="ALL">All Results (WIN & LOSS)</option>
            <option value="WIN">WIN ONLY</option>
            <option value="LOSS">LOSS ONLY</option>
          </select>
          <select id="tableFilterType" onchange="renderTable()">
            <option value="ALL">All Directions (LONG & SHORT)</option>
            <option value="LONG">LONG ONLY</option>
            <option value="SHORT">SHORT ONLY</option>
          </select>
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

  <!-- Strategy Master Blueprint Modal -->
  <div class="strategy-modal-backdrop" id="strategyModalBackdrop" onclick="handleModalBackdropClick(event)">
    <div class="strategy-modal-card" id="strategyModalCard">
      
      <div class="modal-header">
        <div class="brand" style="gap:10px;">
          <div class="brand-icon" style="width:34px; height:34px;">
            <i data-lucide="graduation-cap"></i>
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 800; color: #FFFFFF;">4H 1st-Touch Bounce Strategy — Full Master Guide</div>
            <div style="font-size: 11px; color: var(--accent-gold); font-weight: 600;">Code-Level Logic, Exact Pivot Math, Case Studies & Rules</div>
          </div>
        </div>
        <button class="modal-close-btn" onclick="closeStrategyModal()"><i data-lucide="x"></i></button>
      </div>

      <!-- Navigation Tabs inside Modal -->
      <div class="modal-nav-tabs">
        <button class="modal-tab-btn active" id="mtabBtn1" onclick="switchModalTab(1)"><i data-lucide="workflow"></i> 1. Core Logic</button>
        <button class="modal-tab-btn" id="mtabBtn2" onclick="switchModalTab(2)"><i data-lucide="maximize"></i> 2. Pivot Math</button>
        <button class="modal-tab-btn" id="mtabBtn3" onclick="switchModalTab(3)"><i data-lucide="clock"></i> 3. Timeframes</button>
        <button class="modal-tab-btn" id="mtabBtn4" onclick="switchModalTab(4)"><i data-lucide="file-check"></i> 4. Case Studies</button>
        <button class="modal-tab-btn" id="mtabBtn5" onclick="switchModalTab(5)"><i data-lucide="sliders"></i> 5. Exact Specs</button>
      </div>

      <div class="modal-body">

        <!-- TAB 1: CORE LOGIC & FLOW -->
        <div class="modal-tab-content active" id="mtabContent1">
          <div class="lesson-section">
            <div class="lesson-badge">🎯 The Fundamental Market Edge</div>
            <div class="lesson-title">Why the 1st-Touch Bounce Works</div>
            <p>
              When institutional algorithms and market makers create a <b>4-Hour Swing High (Resistance)</b> or <b>4-Hour Swing Low (Support)</b>, unfilled limit orders and resting liquidity remain concentrated at the extreme wick tips.
            </p>
            <div class="kid-rule-box">
              👉 <b>The 1st-Touch Principle</b>: On the very first retest, liquidity is at its maximum strength, causing sharp rejection bounces. By the 2nd, 3rd, or 4th touch, liquidity is completely exhausted, leading to breakouts. Hence, <b>we ONLY trade the 1st touch</b>!
            </div>

            <div class="graphic-container">
              <svg viewBox="0 0 700 180" style="width: 100%; height: auto; max-height: 160px;">
                <line x1="40" y1="35" x2="660" y2="35" stroke="#E74C3C" stroke-width="3" stroke-dasharray="6,4"/>
                <text x="50" y="25" fill="#E74C3C" font-size="12" font-weight="bold">RESISTANCE CEILING (4H Pivot High)</text>
                
                <line x1="40" y1="145" x2="660" y2="145" stroke="#2ECC71" stroke-width="3" stroke-dasharray="6,4"/>
                <text x="50" y="170" fill="#2ECC71" font-size="12" font-weight="bold">SUPPORT FLOOR (4H Pivot Low)</text>

                <path d="M 70 130 Q 180 25 260 120" fill="none" stroke="#F1C40F" stroke-width="3"/>
                <circle cx="180" cy="35" r="7" fill="#E74C3C"/>
                <text x="180" y="55" fill="#F1C40F" font-size="11" font-weight="bold" text-anchor="middle">1st Touch: SELL ✅ (+2.50 R)</text>

                <path d="M 260 120 Q 360 155 440 50" fill="none" stroke="#F1C40F" stroke-width="3"/>
                <circle cx="360" cy="145" r="7" fill="#2ECC71"/>
                <text x="360" y="130" fill="#F1C40F" font-size="11" font-weight="bold" text-anchor="middle">1st Touch: BUY ✅ (+2.50 R)</text>

                <path d="M 440 50 L 520 35 L 590 35 L 650 10" fill="none" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4,4"/>
                <circle cx="590" cy="35" r="6" fill="#E74C3C"/>
                <text x="590" y="20" fill="#E74C3C" font-size="10" font-weight="bold">3rd Touch: BREAKOUT ❌ (NO TRADE)</text>
              </svg>
            </div>
          </div>
        </div>

        <!-- TAB 2: EXACT S/R PIVOT MATH -->
        <div class="modal-tab-content" id="mtabContent2">
          <div class="lesson-section">
            <div class="lesson-badge">📐 Exact Code Algorithm</div>
            <div class="lesson-title">How Support & Resistance are Calculated in Code</div>
            <p>
              The strategy does <b>NOT</b> guess or use vague lines. It uses the strict <b>3-Bar Fractal Pivot Rule</b>:
            </p>
            <div class="code-box">
// Exact Javascript code from run_multi_pair_backtest.js
function findPivots(candles, leftBars = 3, rightBars = 3) {
  // Candle i is RESISTANCE if its HIGH is strictly greater than 3 candles left & 3 candles right
  if (candles[j].high >= current.high) isHigh = false;
  // Candle i is SUPPORT if its LOW is strictly lower than 3 candles left & 3 candles right
  if (candles[j].low <= current.low) isLow = false;
}
            </div>

            <div class="kid-rule-box">
              ✅ <b>WHAT THE STRATEGY USES</b>:<br>
              • <b>Resistance</b>: The highest wick of a 4H candle higher than 3 bars before & 3 bars after.<br>
              • <b>Support</b>: The lowest wick of a 4H candle lower than 3 bars before & 3 bars after.<br>
              • <b>Untouched Rule</b>: Level is deleted immediately after the 1st test.<br>
              • <b>Lookback Age</b>: Levels older than 120 bars (20 days) are discarded.
            </div>

            <div class="warning-rule-box">
              🚫 <b>WHAT THE STRATEGY EXPLICITLY DOES NOT USE</b>:<br>
              • Does NOT use Previous Day High/Low, Previous Week High/Low, or Moving Averages.<br>
              • Does NOT use RSI, MACD, Fibonacci, or multi-indicator lag.
            </div>
          </div>
        </div>

        <!-- TAB 3: TIMEFRAME HIERARCHY -->
        <div class="modal-tab-content" id="mtabContent3">
          <div class="lesson-section">
            <div class="lesson-badge">⏱️ Timeframe Architecture</div>
            <div class="lesson-title">The Single-Timeframe Institutional Precision</div>
            
            <div class="steps-grid">
              <div class="step-card">
                <div style="font-size:14px; font-weight:800; color:var(--accent-gold);">4-Hour (4H) Timeframe</div>
                <div style="font-size:12px; color:#CBD5E1;">
                  <b>100% of the strategy runs on 4H</b>. It identifies the structural pivots, places the limit order, monitors the step-trailing stop, and executes the exits.
                </div>
              </div>
              <div class="step-card">
                <div style="font-size:14px; font-weight:800; color:var(--accent-blue);">Why 4H Beats Lower Timeframes</div>
                <div style="font-size:12px; color:#CBD5E1;">
                  1-minute and 15-minute charts contain 80% algorithmic noise and fakeouts. 4-Hour blocks represent true interbank liquidity clusters.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 4: REAL BACKTEST CASE STUDIES -->
        <div class="modal-tab-content" id="mtabContent4">
          <div class="lesson-section">
            <div class="lesson-badge">📊 Verified Case Studies</div>
            <div class="lesson-title">Analyzing Real Trades from the 6-Month Backtest</div>

            <div class="step-card" style="border-left: 3px solid var(--accent-green);">
              <div style="color:var(--accent-green); font-weight:800; font-size:13px;">🏆 Case 1: Big Winner (Trade #2 — BUY on Gold)</div>
              <div style="font-size:12px; color:#CBD5E1; line-height:1.5;">
                • <b>Date</b>: 2026-02-02 06:00 UTC (11:30 IST) | <b>Entry</b>: $4,408.59 | <b>SL</b>: $4,398.59 | <b>TP</b>: $4,433.59<br>
                • <b>Reason</b>: A 4H Swing Low formed at $4,402.38. Price rallied to $4,700, then pulled back on Feb 2. The 4H candle dipped to $4,402.38, filled the BUY order, and bounced to $4,719, hitting the <b>+$2,512.50 (+2.50 R) Take Profit</b>.
              </div>
            </div>

            <div class="step-card" style="border-left: 3px solid var(--accent-red);">
              <div style="color:var(--accent-red); font-weight:800; font-size:13px;">❌ Case 2: Controlled Loss (Trade #5 — BUY on Gold)</div>
              <div style="font-size:12px; color:#CBD5E1; line-height:1.5;">
                • <b>Date</b>: 2026-02-05 18:00 UTC (23:30 IST) | <b>Entry</b>: $4,790.40 | <b>SL</b>: $4,780.40 | <b>Exit</b>: $4,780.40<br>
                • <b>Reason</b>: Support was at $4,789.65. Price touched the level but heavy market selloff broke through to $4,775.20. The exact $10.00 SL halted the trade with a controlled <b>-$1,578.17 (-1.00 R) Loss</b>.
              </div>
            </div>

            <div class="step-card" style="border-left: 3px solid var(--accent-gold);">
              <div style="color:var(--accent-gold); font-weight:800; font-size:13px;">🛡️ Case 3: Breakeven Trailing Save (Trade #7 — SHORT on Gold)</div>
              <div style="font-size:12px; color:#CBD5E1; line-height:1.5;">
                • <b>Date</b>: 2026-02-11 10:00 UTC (15:30 IST) | <b>Entry</b>: $5,091.18 | <b>Initial SL</b>: $5,101.18<br>
                • <b>Reason</b>: Resistance was at $5,119.35. Price dropped to $5,019 (gain of +$71/oz). The trailing engine <b>locked SL to Breakeven +$0.50</b>. Price later reversed to $5,095, closing the trade in a <b>+$63.92 PROFIT</b> instead of a loss!
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 5: EXACT VARIABLE SPECS -->
        <div class="modal-tab-content" id="mtabContent5">
          <div class="lesson-section">
            <div class="lesson-badge">⚙️ Technical Specification Table</div>
            <div class="lesson-title">All Strategy Variables & Asset Settings</div>

            <div class="table-wrapper">
              <table style="width:100%; font-size:12px;">
                <thead>
                  <tr>
                    <th>Variable Name</th>
                    <th>XAU/USD (Gold)</th>
                    <th>XAG/USD (Silver)</th>
                    <th>EUR/USD (Euro)</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>riskPct</b></td>
                    <td>10.0%</td>
                    <td>10.0%</td>
                    <td>10.0%</td>
                    <td>Account risk per trade</td>
                  </tr>
                  <tr>
                    <td><b>riskPerUnit (SL)</b></td>
                    <td>$10.00 / oz</td>
                    <td>$0.40 / oz</td>
                    <td>25 pips ($0.0025)</td>
                    <td>Fixed stop-loss distance</td>
                  </tr>
                  <tr>
                    <td><b>rewardMultiple (TP)</b></td>
                    <td>2.50 ($25.00)</td>
                    <td>2.50 ($1.00)</td>
                    <td>2.50 (62.5 pips)</td>
                    <td>1:2.50 Hard Take Profit target</td>
                  </tr>
                  <tr>
                    <td><b>Trailing Trigger</b></td>
                    <td>+$10.00 gain</td>
                    <td>+$0.40 gain</td>
                    <td>+25 pips gain</td>
                    <td>Moves SL to Breakeven (+0.05R)</td>
                  </tr>
                  <tr>
                    <td><b>leftBars / rightBars</b></td>
                    <td>3 / 3</td>
                    <td>3 / 3</td>
                    <td>3 / 3</td>
                    <td>Fractal pivot strength</td>
                  </tr>
                  <tr>
                    <td><b>entryOffset</b></td>
                    <td>$1.50</td>
                    <td>$0.10</td>
                    <td>5 pips ($0.0005)</td>
                    <td>Limit order buffer before level</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <script>
    const allData = ${JSON.stringify(multiPairData)};
    let activePairKey = 'XAUUSD';
    let activeTimezone = 'IST'; // 'IST' or 'UTC'
    let currentMode = 'backtest';
    let currentTradeIdx = 0;

    let chartInstance = null;
    let candlestickSeries = null;
    let entryLine = null;
    let slLine = null;
    let tpLine = null;
    let equityChartInstance = null;
    let winLossChartInstance = null;

    window.onload = function() {
      lucide.createIcons();
      initLightweightTradingViewChart();
      updateDashboardForPair(activePairKey);
    };

    function switchPair(pairKey) {
      if (!allData[pairKey]) return;
      activePairKey = pairKey;
      currentTradeIdx = 0;

      document.querySelectorAll('.pair-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.getElementById(\`pairBtn\${pairKey}\`);
      if (activeBtn) activeBtn.classList.add('active');

      updateDashboardForPair(pairKey);
    }

    function updateDashboardForPair(pairKey) {
      const pairData = allData[pairKey];
      const summary = pairData.summary;
      const trades = pairData.trades;
      const candles = pairData.candles;
      const markers = pairData.markers;

      document.getElementById('headerSubtitle').textContent = \`4H Live TradingView Backtest Engine — \${summary.name}\`;
      document.getElementById('bannerTitle').textContent = \`4-Hour S/R 1st-Touch Bounce — \${summary.name} (\${pairKey})\`;
      document.getElementById('bannerDesc').innerHTML = \`Executed on <b>TradingView OANDA:\${pairKey} 4H Live Data</b> (\${summary.backtestPeriod}).\`;
      document.getElementById('badgePairSymbol').textContent = \`OANDA:\${pairKey}\`;
      document.getElementById('chartSectionTitle').textContent = \`TradingView 4H Chart — \${summary.name} (\${pairKey})\`;
      document.getElementById('legendSymbolLabel').textContent = \`\${pairKey} 4H\`;
      document.getElementById('tableSectionTitle').textContent = \`Master Trade Ledger — \${pairKey}\`;

      document.getElementById('kpiInitial').textContent = '$10,000';
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
        candlestickSeries.setData(candles);
        candlestickSeries.setMarkers(markers);
        fitAllTrades();
      }

      populateTradeSelector();
      renderTradeAnnotation(0);
      renderTable();
      updateSecondaryCharts(trades, summary);

      if (currentMode === 'live') initCloudTradingViewWidget();
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
      container.innerHTML = '<div class="chart-overlay-legend" id="chartLegend"><span style="font-weight:700; color:var(--accent-gold);" id="legendSymbolLabel">XAUUSD 4H</span><span id="legendOHLC" style="color:#CBD5E1;">Touch candle to inspect</span></div>';

      chartInstance = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { color: '#080C14' },
          textColor: '#94A3B8',
          fontSize: 11,
          fontFamily: 'JetBrains Mono'
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: '#F1C40F', width: 1, style: 3, labelBackgroundColor: '#F1C40F' },
          horzLine: { color: '#F1C40F', width: 1, style: 3, labelBackgroundColor: '#F1C40F' }
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          scaleMargins: { top: 0.1, bottom: 0.1 }
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          timeVisible: true,
          secondsVisible: false
        },
        handleScroll: { vertTouchDrag: true, horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
      });

      candlestickSeries = chartInstance.addCandlestickSeries({
        upColor: '#2ECC71',
        downColor: '#E74C3C',
        borderVisible: false,
        wickUpColor: '#2ECC71',
        wickDownColor: '#E74C3C'
      });

      chartInstance.subscribeCrosshairMove(param => {
        const legend = document.getElementById('legendOHLC');
        if (!param || !param.time || !param.seriesData.get(candlestickSeries)) {
          legend.innerHTML = 'Touch candle to inspect';
          return;
        }
        const data = param.seriesData.get(candlestickSeries);
        const timeSec = param.time;
        const dUtc = new Date(timeSec * 1000);
        const dIst = new Date((timeSec + 5.5 * 3600) * 1000);
        const timeStr = activeTimezone === 'IST' 
          ? dIst.toISOString().slice(5, 10) + ' ' + dIst.toISOString().slice(11, 16) + ' IST'
          : dUtc.toISOString().slice(5, 10) + ' ' + dUtc.toISOString().slice(11, 16) + ' UTC';

        legend.innerHTML = \`<span style="color:#F1C40F;">\${timeStr}</span> | O: <b style="color:\${data.close >= data.open ? '#2ECC71' : '#E74C3C'}">$\${data.open}</b> | H: <b>$\${data.high}</b> | L: <b>$\${data.low}</b> | C: <b style="color:\${data.close >= data.open ? '#2ECC71' : '#E74C3C'}">$\${data.close}</b>\`;
      });

      // Responsive Resize Listener with RAF debounce
      let resizeTimeout;
      const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) return;
        cancelAnimationFrame(resizeTimeout);
        resizeTimeout = requestAnimationFrame(() => {
          const newRect = entries[0].contentRect;
          if (chartInstance && newRect.width > 0 && newRect.height > 0) {
            chartInstance.applyOptions({ width: newRect.width, height: newRect.height });
          }
        });
      });
      resizeObserver.observe(container);
    }

    function fitAllTrades() {
      if (chartInstance) chartInstance.timeScale().fitContent();
    }

    function focusOnTrade(idx) {
      if (!chartInstance || !candlestickSeries) return;
      const trades = allData[activePairKey].trades;
      const t = trades[idx];
      if (!t) return;

      const entryTimeSec = t.entryTimeSec;
      const exitTimeSec = t.exitTimeSec;

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

      const rangeMargin = 4 * 24 * 3600;
      chartInstance.timeScale().setVisibleRange({
        from: entryTimeSec - rangeMargin,
        to: exitTimeSec + rangeMargin
      });
    }

    function populateTradeSelector() {
      const select = document.getElementById('tradeSelector');
      select.innerHTML = '';
      const trades = allData[activePairKey].trades;

      trades.forEach((t, idx) => {
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
      if (currentMode !== 'backtest') switchChartMode('backtest');
      renderTradeAnnotation(idx);
      focusOnTrade(idx);
      highlightTableRow(idx);
    }

    function prevTrade() {
      if (currentTradeIdx > 0) selectTrade(currentTradeIdx - 1);
    }

    function nextTrade() {
      const trades = allData[activePairKey].trades;
      if (currentTradeIdx < trades.length - 1) selectTrade(currentTradeIdx + 1);
    }

    function renderTradeAnnotation(idx) {
      const trades = allData[activePairKey].trades;
      const t = trades[idx];
      if (!t) return;
      const isWin = t.Result === 'WIN';
      const pnl = parseFloat(t.PnLUSD);
      const entryTime = activeTimezone === 'IST' ? t.entryTimeIST : t.entryTimeUTC;
      const exitTime = activeTimezone === 'IST' ? t.exitTimeIST : t.exitTimeUTC;

      const bar = document.getElementById('tradeAnnotationBar');
      bar.innerHTML = \`
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
      const resFilter = document.getElementById('tableFilterResult').value;
      const typeFilter = document.getElementById('tableFilterType').value;
      const tbody = document.getElementById('tradeTableBody');
      tbody.innerHTML = '';
      const trades = allData[activePairKey].trades;

      trades.forEach((t, idx) => {
        if (resFilter !== 'ALL' && t.Result !== resFilter) return;
        if (typeFilter !== 'ALL' && t.Type !== typeFilter) return;

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
      document.getElementById('equityChartTitle').textContent = \`Cumulative Equity Curve (\${activePairKey}: $10k → $\${(summary.finalBalance/1000).toFixed(0)}k)\`;
      document.getElementById('winLossChartTitle').textContent = \`Win/Loss Distribution (\${summary.winningTrades} W / \${summary.losingTrades} L)\`;

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
            borderColor: activePairKey === 'XAUUSD' ? '#F1C40F' : (activePairKey === 'XAGUSD' ? '#BDC3C7' : '#3498DB'),
            backgroundColor: activePairKey === 'XAUUSD' ? 'rgba(241, 196, 15, 0.1)' : (activePairKey === 'XAGUSD' ? 'rgba(189, 195, 199, 0.1)' : 'rgba(52, 152, 219, 0.1)'),
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointBackgroundColor: '#F1C40F',
            pointRadius: 1.5,
            pointHoverRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => \` Balance: $\${ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits: 0})}\`
              }
            }
          },
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
          plugins: {
            legend: { position: 'bottom', labels: { color: '#F1F5F9', font: { family: 'Inter', size: 11 } } }
          }
        }
      });
    }

    function switchChartMode(mode) {
      currentMode = mode;
      document.getElementById('tabBacktest').classList.toggle('active', mode === 'backtest');
      document.getElementById('tabLive').classList.toggle('active', mode === 'live');

      const tvChart = document.getElementById('tvLightweightChart');
      const tvCloud = document.getElementById('liveTvContainer');

      if (mode === 'backtest') {
        tvChart.style.display = 'block';
        tvCloud.style.display = 'none';
        if (chartInstance) {
          chartInstance.applyOptions({ width: tvChart.clientWidth, height: tvChart.clientHeight });
        }
      } else {
        tvChart.style.display = 'none';
        tvCloud.style.display = 'block';
        initCloudTradingViewWidget();
      }
    }

    let tvCloudInstance = null;
    function initCloudTradingViewWidget() {
      const embedBox = document.getElementById('tradingview_embed_box');
      embedBox.innerHTML = '';
      if (typeof TradingView !== 'undefined') {
        tvCloudInstance = new TradingView.widget({
          "autosize": true,
          "symbol": \`OANDA:\${activePairKey}\`,
          "interval": "240",
          "timezone": activeTimezone === 'IST' ? "Asia/Kolkata" : "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#080C14",
          "enable_publishing": false,
          "hide_side_toolbar": false,
          "allow_symbol_change": true,
          "container_id": "tradingview_embed_box",
          "studies": ["STD;SMA", "STD;RSI"]
        });
      }
    }

    function openStrategyModal() {
      document.getElementById('strategyModalBackdrop').classList.add('active');
    }

    function closeStrategyModal() {
      document.getElementById('strategyModalBackdrop').classList.remove('active');
    }

    function handleModalBackdropClick(event) {
      if (event.target.id === 'strategyModalBackdrop') closeStrategyModal();
    }

    function switchModalTab(tabNum) {
      for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(\`mtabBtn\${i}\`);
        const content = document.getElementById(\`mtabContent\${i}\`);
        if (btn) btn.classList.toggle('active', i === tabNum);
        if (content) content.classList.toggle('active', i === tabNum);
      }
    }
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('✅ Successfully compiled ultra-responsive index.html with clamp() fluid scaling and debounced RAF resize!');
