const fs = require('fs');
const path = require('path');

// 1. Load exact TradingView Live 4H candles
const rawCandles = JSON.parse(fs.readFileSync(path.join(__dirname, 'tradingview_live_xauusd_4h.json'), 'utf-8'));
console.log(`Loaded ${rawCandles.length} live TradingView 4H candles for OANDA:XAUUSD.`);

// Strategy Parameters
const initialCapital = 10000.0;
const riskPct = 0.10; // 10% capital risk per trade
const riskPerOz = 10.0; // $10 SL distance on Gold
const rewardMultiple = 2.50; // 1:2.50 R:R
const rewardPerOz = riskPerOz * rewardMultiple; // $25 TP distance

// 2. Identify Major 4H Swing Highs / Lows (Pivots)
function findPivots(candles, leftBars = 3, rightBars = 3) {
  const pivots = [];
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) isHigh = false;
      if (candles[j].low <= current.low) isLow = false;
    }

    if (isHigh) {
      pivots.push({
        type: 'RESISTANCE',
        price: current.high,
        time: current.time,
        datetimeStr: current.datetimeStr,
        index: i,
        touched: false
      });
    }
    if (isLow) {
      pivots.push({
        type: 'SUPPORT',
        price: current.low,
        time: current.time,
        datetimeStr: current.datetimeStr,
        index: i,
        touched: false
      });
    }
  }
  return pivots;
}

const allPivots = findPivots(rawCandles, 3, 3);
console.log(`Identified ${allPivots.length} 4H swing Support & Resistance pivot levels.`);

// 3. Simulate Backtest Execution on Live TradingView Bars
let capital = initialCapital;
let peakCapital = initialCapital;
let maxDrawdownUSD = 0;
let maxDrawdownPct = 0;

const trades = [];
let inPosition = false;
let position = null;

// Start scanning from 6 months back or after warm-up
const startIndex = 20;

for (let i = startIndex; i < rawCandles.length; i++) {
  const c = rawCandles[i];

  // A. Check exit if in position
  if (inPosition) {
    let exited = false;
    let exitPrice = 0;
    let exitReason = '';
    let isWin = false;

    // Check Trailing Stop to Breakeven (+0.05R) when price moves +1.0R into profit ($10.00 gain)
    if (position.type === 'LONG') {
      if (!position.beLocked && c.high >= position.entryPrice + 10.0) {
        position.currentSL = position.entryPrice + 0.50; // Lock +0.05 R
        position.beLocked = true;
      }

      // Check SL or TP Hit
      if (c.low <= position.currentSL) {
        exitPrice = position.currentSL;
        exitReason = position.beLocked ? 'TRAILING SL HIT' : 'INITIAL SL HIT';
        isWin = exitPrice >= position.entryPrice;
        exited = true;
      } else if (c.high >= position.hardTP) {
        exitPrice = position.hardTP;
        exitReason = 'HARD TP HIT';
        isWin = true;
        exited = true;
      }
    } else if (position.type === 'SHORT') {
      if (!position.beLocked && c.low <= position.entryPrice - 10.0) {
        position.currentSL = position.entryPrice - 0.50;
        position.beLocked = true;
      }

      if (c.high >= position.currentSL) {
        exitPrice = position.currentSL;
        exitReason = position.beLocked ? 'TRAILING SL HIT' : 'INITIAL SL HIT';
        isWin = exitPrice <= position.entryPrice;
        exited = true;
      } else if (c.low <= position.hardTP) {
        exitPrice = position.hardTP;
        exitReason = 'HARD TP HIT';
        isWin = true;
        exited = true;
      }
    }

    if (exited) {
      const pnlPerOz = position.type === 'LONG' ? (exitPrice - position.entryPrice) : (position.entryPrice - exitPrice);
      const pnlUSD = pnlPerOz * position.lotOunces;
      const rMultiple = pnlPerOz / riskPerOz;

      capital += pnlUSD;
      if (capital > peakCapital) peakCapital = capital;
      const ddUSD = peakCapital - capital;
      const ddPct = (ddUSD / peakCapital) * 100;
      if (ddUSD > maxDrawdownUSD) maxDrawdownUSD = ddUSD;
      if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

      trades.push({
        TradeNum: trades.length + 1,
        Date: position.entryDateTime,
        ExitDate: c.datetimeStr,
        Type: position.type,
        LevelType: position.levelType,
        EntryPrice: position.entryPrice,
        InitialSL: position.initialSL,
        FinalSL: position.currentSL,
        HardTP: position.hardTP,
        ExitPrice: exitPrice,
        RiskPerOz: riskPerOz,
        LotOunces: position.lotOunces,
        RiskUSD: position.riskUSD,
        PnLUSD: parseFloat(pnlUSD.toFixed(2)),
        RMultiple: parseFloat(rMultiple.toFixed(2)),
        Result: pnlUSD > 10 ? 'WIN' : (pnlUSD < -10 ? 'LOSS' : 'BREAKEVEN'),
        ExitReason: exitReason,
        BELocked: position.beLocked ? 'YES' : 'NO',
        RunningBalance: parseFloat(capital.toFixed(2)),
        entryTimeSec: position.entryTimeSec,
        exitTimeSec: c.time
      });

      inPosition = false;
      position = null;
      continue;
    }
  }

  // B. Check for new 1st-Touch Bounce Setups if not in position
  if (!inPosition) {
    // Look at active, untouched pivot levels created at least 3 bars ago
    const activePivots = allPivots.filter(p => p.index < i - 2 && !p.touched && (i - p.index) <= 120);

    for (const pivot of activePivots) {
      if (pivot.type === 'RESISTANCE') {
        // Price touches resistance level for the 1st time
        if (c.high >= pivot.price - 1.5 && c.open < pivot.price) {
          pivot.touched = true;
          const entryPrice = parseFloat((pivot.price - 0.5).toFixed(2));
          const sl = entryPrice + riskPerOz;
          const tp = entryPrice - rewardPerOz;
          const riskAmount = capital * riskPct;
          const lotOunces = parseFloat((riskAmount / riskPerOz).toFixed(2));

          inPosition = true;
          position = {
            type: 'SHORT',
            levelType: 'RESISTANCE BOUNCE',
            entryPrice: entryPrice,
            initialSL: sl,
            currentSL: sl,
            hardTP: tp,
            lotOunces: lotOunces,
            riskUSD: riskAmount,
            entryDateTime: c.datetimeStr,
            entryTimeSec: c.time,
            beLocked: false
          };
          break;
        }
      } else if (pivot.type === 'SUPPORT') {
        // Price touches support level for the 1st time
        if (c.low <= pivot.price + 1.5 && c.open > pivot.price) {
          pivot.touched = true;
          const entryPrice = parseFloat((pivot.price + 0.5).toFixed(2));
          const sl = entryPrice - riskPerOz;
          const tp = entryPrice + rewardPerOz;
          const riskAmount = capital * riskPct;
          const lotOunces = parseFloat((riskAmount / riskPerOz).toFixed(2));

          inPosition = true;
          position = {
            type: 'LONG',
            levelType: 'SUPPORT BOUNCE',
            entryPrice: entryPrice,
            initialSL: sl,
            currentSL: sl,
            hardTP: tp,
            lotOunces: lotOunces,
            riskUSD: riskAmount,
            entryDateTime: c.datetimeStr,
            entryTimeSec: c.time,
            beLocked: false
          };
          break;
        }
      }
    }
  }
}

// 4. Calculate Final Statistics
const winTrades = trades.filter(t => t.Result === 'WIN');
const lossTrades = trades.filter(t => t.Result === 'LOSS');
const grossProfit = winTrades.reduce((a, b) => a + b.PnLUSD, 0);
const grossLoss = Math.abs(lossTrades.reduce((a, b) => a + b.PnLUSD, 0));
const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 99.9;
const netProfitUSD = capital - initialCapital;
const returnPct = ((netProfitUSD / initialCapital) * 100);

const summary = {
  strategyName: "4H Support/Resistance Trailing Bounce (TradingView Live OANDA Data)",
  dataset: `Live TradingView Feed (${rawCandles.length} 4H Candles: ${rawCandles[0].datetimeStr} to ${rawCandles[rawCandles.length-1].datetimeStr})`,
  initialCapital: initialCapital,
  finalBalance: parseFloat(capital.toFixed(2)),
  netProfitUSD: parseFloat(netProfitUSD.toFixed(2)),
  returnPct: parseFloat(returnPct.toFixed(2)),
  totalTrades: trades.length,
  winningTrades: winTrades.length,
  losingTrades: lossTrades.length,
  winRatePct: parseFloat(((winTrades.length / trades.length) * 100).toFixed(2)),
  profitFactor: parseFloat(profitFactor.toFixed(2)),
  grossProfitUSD: parseFloat(grossProfit.toFixed(2)),
  grossLossUSD: parseFloat(grossLoss.toFixed(2)),
  maxDrawdownUSD: parseFloat(maxDrawdownUSD.toFixed(2)),
  maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2))
};

console.log("\n=======================================================================");
console.log("🎯 LIVE TRADINGVIEW DATA BACKTEST RESULTS (OANDA:XAUUSD)");
console.log("=======================================================================");
console.log(JSON.stringify(summary, null, 2));

// Save output files
fs.writeFileSync(path.join(__dirname, 'tradingview_live_backtest_summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(__dirname, 'tradingview_live_trades.json'), JSON.stringify(trades, null, 2));

// Export CSV
const csvHeader = 'TradeNum,Date,ExitDate,Type,LevelType,EntryPrice,InitialSL,FinalSL,HardTP,ExitPrice,RiskPerOz,LotOunces,RiskUSD,PnLUSD,RMultiple,Result,ExitReason,BELocked,RunningBalance\n';
const csvRows = trades.map(t =>
  `${t.TradeNum},${t.Date},${t.ExitDate},${t.Type},${t.LevelType},${t.EntryPrice},${t.InitialSL},${t.FinalSL},${t.HardTP},${t.ExitPrice},${t.RiskPerOz},${t.LotOunces},${t.RiskUSD},${t.PnLUSD},${t.RMultiple},${t.Result},"${t.ExitReason}",${t.BELocked},${t.RunningBalance}`
).join('\n');
fs.writeFileSync(path.join(__dirname, 'tradingview_live_trade_log.csv'), csvHeader + csvRows);

console.log("\n✅ Saved 'tradingview_live_trades.json' and 'tradingview_live_trade_log.csv'!");
