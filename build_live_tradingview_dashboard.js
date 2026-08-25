const fs = require('fs');
const path = require('path');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, 'tradingview_live_xauusd_4h.json'), 'utf-8'));
const allTrades = JSON.parse(fs.readFileSync(path.join(__dirname, 'tradingview_live_trades.json'), 'utf-8'));

// Filter for 2026-02-01 onwards (the exact 6-month period shown on user's TradingView chart)
const sixMonthTrades = allTrades.filter(t => t.Date >= '2026-02-01');

// Recalculate 6-Month equity curve starting from $10,000
let balance = 10000.0;
let peak = 10000.0;
let maxDD = 0;
const processedTrades = [];

sixMonthTrades.forEach((t, i) => {
  const riskAmount = balance * 0.10;
  const lotOunces = parseFloat((riskAmount / 10.0).toFixed(2));
  const pnlPerOz = t.Type === 'LONG' ? (t.ExitPrice - t.EntryPrice) : (t.EntryPrice - t.ExitPrice);
  const pnlUSD = parseFloat((pnlPerOz * lotOunces).toFixed(2));
  
  balance += pnlUSD;
  if (balance > peak) peak = balance;
  const dd = peak - balance;
  if (dd > maxDD) maxDD = dd;

  processedTrades.push({
    ...t,
    TradeNum: i + 1,
    RiskUSD: parseFloat(riskAmount.toFixed(2)),
    LotOunces: lotOunces,
    PnLUSD: pnlUSD,
    RunningBalance: parseFloat(balance.toFixed(2))
  });
});

console.log(`\n======================================================`);
console.log(`🎯 6-MONTH LIVE TRADINGVIEW DATASET (Feb 2026 – Aug 2026)`);
console.log(`======================================================`);
console.log(`Total Trades:       ${processedTrades.length}`);
const wins = processedTrades.filter(t => t.Result === 'WIN').length;
const losses = processedTrades.filter(t => t.Result === 'LOSS').length;
console.log(`Wins / Losses:      ${wins} Wins / ${losses} Losses (${((wins/processedTrades.length)*100).toFixed(1)}% Win Rate)`);
console.log(`Starting Balance:   $10,000.00`);
console.log(`Final Balance:      $${balance.toFixed(2)} (+${(((balance-10000)/10000)*100).toFixed(1)}%)`);
console.log(`Max Drawdown:       -$${maxDD.toFixed(2)} (${((maxDD/peak)*100).toFixed(1)}%)`);

// Build TradingView Markers
const markers = [];
processedTrades.forEach(t => {
  // Entry Marker
  markers.push({
    time: t.entryTimeSec,
    position: t.Type === 'LONG' ? 'belowBar' : 'aboveBar',
    color: t.Type === 'LONG' ? '#2ECC71' : '#E74C3C',
    shape: t.Type === 'LONG' ? 'arrowUp' : 'arrowDown',
    text: `#${t.TradeNum} ${t.Type} @ $${t.EntryPrice.toFixed(1)}`
  });

  // Exit Marker
  markers.push({
    time: t.exitTimeSec,
    position: t.Type === 'LONG' ? 'aboveBar' : 'belowBar',
    color: t.Result === 'WIN' ? '#F1C40F' : '#E74C3C',
    shape: 'circle',
    text: `#${t.TradeNum} ${t.Result} (${t.PnLUSD >= 0 ? '+$' : '-$'}${Math.abs(t.PnLUSD).toLocaleString()})`
  });
});

markers.sort((a, b) => a.time - b.time);

fs.writeFileSync(path.join(__dirname, 'tv_live_6m_trades.json'), JSON.stringify(processedTrades, null, 2));
fs.writeFileSync(path.join(__dirname, 'tv_live_6m_markers.json'), JSON.stringify(markers, null, 2));

console.log("✅ Saved 6-month TradingView live trade dataset and markers!");
