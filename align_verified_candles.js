const fs = require('fs');
const path = require('path');

// 1. Read trade atlas file containing exact chartCandles
const atlasContent = fs.readFileSync(path.join(__dirname, 'tradingview_trade_atlas.html'), 'utf-8');
const tradeDataMatch = atlasContent.match(/const tradeData = (\[.*?\]);/s);
if (!tradeDataMatch) {
  console.error("Could not find tradeData in tradingview_trade_atlas.html");
  process.exit(1);
}

const atlasTrades = JSON.parse(tradeDataMatch[1]);
console.log(`Extracted ${atlasTrades.length} trades with exact 4H chartCandles from atlas.`);

// 2. Build complete verified candle map
const candleMap = new Map();

// Insert continuous 1H candles converted to 4H standard UTC (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
const h1Csv = fs.readFileSync(path.join(__dirname, 'XAUUSD_1Hour_OHLC_12Months_2025_2026.csv'), 'utf-8');
const h1Lines = h1Csv.trim().split('\n');
const rawH1 = [];
for (let i = 1; i < h1Lines.length; i++) {
  const [d, t, o, h, l, c, v] = h1Lines[i].split(',').map(s => s.trim());
  rawH1.push({
    datetimeStr: `${d} ${t}`,
    timeSec: Math.floor(new Date(`${d}T${t}:00Z`).getTime() / 1000),
    open: parseFloat(o),
    high: parseFloat(h),
    low: parseFloat(l),
    close: parseFloat(c),
    volume: parseFloat(v || 0)
  });
}

// Group 1H candles into 4H standard bars
for (let i = 0; i < rawH1.length; i += 4) {
  const slice = rawH1.slice(i, i + 4);
  if (slice.length === 0) continue;
  const first = slice[0];
  const last = slice[slice.length - 1];
  const timeSec = first.timeSec;
  candleMap.set(timeSec, {
    time: timeSec,
    open: first.open,
    high: Math.max(...slice.map(c => c.high)),
    low: Math.min(...slice.map(c => c.low)),
    close: last.close,
    datetimeStr: first.datetimeStr
  });
}

// Overlay exact trade candles from atlas
atlasTrades.forEach(t => {
  (t.chartCandles || []).forEach(c => {
    const timeSec = Math.floor(new Date(`${c.date}T${c.time}:00Z`).getTime() / 1000);
    candleMap.set(timeSec, {
      time: timeSec,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      datetimeStr: `${c.date} ${c.time}`
    });
  });
});

const verifiedCandles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
console.log(`Merged and verified continuous dataset of ${verifiedCandles.length} 4-Hour Gold candles.`);

// 3. Build accurate Trade Markers
const markers = [];
const verifiedTrades = [];

atlasTrades.forEach(t => {
  const tNum = parseInt(t.TradeNum);
  const entryPrice = parseFloat(t.EntryPrice);
  const initialSL = parseFloat(t.InitialSL);
  const finalSL = parseFloat(t.FinalSL || t.InitialSL);
  const hardTP = parseFloat(t.HardTP);
  const exitPrice = parseFloat(t.ExitPrice);
  const riskUSD = parseFloat(t.RiskUSD);
  const pnlUSD = parseFloat(t.PnLUSD);
  const rMultiple = parseFloat(t.RMultiple);
  const runningBalance = parseFloat(t.RunningBalance);

  const entryTimeSec = Math.floor(new Date(t.Date.replace(' ', 'T') + ':00Z').getTime() / 1000);
  const exitTimeSec = Math.floor(new Date(t.ExitDate.replace(' ', 'T') + ':00Z').getTime() / 1000);

  // Find exact or nearest candle
  let bestEntryCandle = verifiedCandles[0];
  let minDiff = Infinity;
  for (const c of verifiedCandles) {
    const diff = Math.abs(c.time - entryTimeSec);
    if (diff < minDiff) {
      minDiff = diff;
      bestEntryCandle = c;
    }
  }

  let bestExitCandle = verifiedCandles[0];
  let minExitDiff = Infinity;
  for (const c of verifiedCandles) {
    const diff = Math.abs(c.time - exitTimeSec);
    if (diff < minExitDiff) {
      minExitDiff = diff;
      bestExitCandle = c;
    }
  }

  verifiedTrades.push({
    TradeNum: tNum,
    Date: t.Date,
    ExitDate: t.ExitDate,
    Type: t.Type,
    LevelType: t.LevelType || 'BOUNCE',
    EntryPrice: entryPrice,
    InitialSL: initialSL,
    FinalSL: finalSL,
    HardTP: hardTP,
    ExitPrice: exitPrice,
    RiskPerOz: parseFloat(t.RiskPerOz || 10),
    LotOunces: parseFloat(t.LotOunces || 100),
    RiskUSD: riskUSD,
    PnLUSD: pnlUSD,
    RMultiple: rMultiple,
    Result: t.Result,
    ExitReason: t.ExitReason,
    BELocked: t.BELocked || 'NO',
    RunningBalance: runningBalance,
    entryTimeSec: bestEntryCandle.time,
    exitTimeSec: bestExitCandle.time
  });

  // Entry Marker
  markers.push({
    time: bestEntryCandle.time,
    position: t.Type === 'LONG' ? 'belowBar' : 'aboveBar',
    color: t.Type === 'LONG' ? '#2ECC71' : '#E74C3C',
    shape: t.Type === 'LONG' ? 'arrowUp' : 'arrowDown',
    text: `#${tNum} ${t.Type} @ $${entryPrice.toFixed(1)}`
  });

  // Exit Marker
  markers.push({
    time: bestExitCandle.time,
    position: t.Type === 'LONG' ? 'aboveBar' : 'belowBar',
    color: t.Result === 'WIN' ? '#F1C40F' : '#E74C3C',
    shape: 'circle',
    text: `#${tNum} ${t.Result} (${pnlUSD >= 0 ? '+$' : '-$'}${Math.abs(pnlUSD).toLocaleString()})`
  });
});

markers.sort((a, b) => a.time - b.time);

// 4. Generate updated index.html
const lwCandlesOnly = verifiedCandles.map(c => ({
  time: c.time,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close
}));

fs.writeFileSync(path.join(__dirname, 'xauusd_4h_verified.json'), JSON.stringify(lwCandlesOnly));
fs.writeFileSync(path.join(__dirname, 'verified_trades.json'), JSON.stringify(verifiedTrades, null, 2));
fs.writeFileSync(path.join(__dirname, 'verified_markers.json'), JSON.stringify(markers, null, 2));

console.log("✅ Successfully saved verified datasets!");
