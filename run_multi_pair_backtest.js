const fs = require('fs');
const path = require('path');

// Universal Strategy Backtester for Multi-Pair Execution
function runBacktestForPair(pairConfig) {
  const {
    symbol,
    name,
    dataFile,
    riskPct,
    riskPerUnit,
    rewardMultiple,
    unitName,
    contractSize,
    decimals,
    minHistoryDate, // 2026-02-01
    entryOffset
  } = pairConfig;

  const rawCandles = JSON.parse(fs.readFileSync(path.join(__dirname, dataFile), 'utf-8'));
  console.log(`\n=======================================================================`);
  console.log(`🚀 RUNNING BACKTEST: ${name} (${symbol})`);
  console.log(`   Loaded ${rawCandles.length} 4H candles from ${rawCandles[0].datetimeStr} to ${rawCandles[rawCandles.length - 1].datetimeStr}`);

  const rewardPerUnit = riskPerUnit * rewardMultiple;

  // 1. Identify 4H Pivots (leftBars: 3, rightBars: 3)
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

  // 2. Simulate Strategy
  let initialCapital = 10000.0;
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdownUSD = 0;
  let maxDrawdownPct = 0;

  const allTrades = [];
  let inPosition = false;
  let position = null;

  for (let i = 20; i < rawCandles.length; i++) {
    const c = rawCandles[i];

    // Check Exit if in position
    if (inPosition) {
      let exited = false;
      let exitPrice = 0;
      let exitReason = '';

      if (position.type === 'LONG') {
        // Step Trailing to Breakeven (+0.05 R) at +1.0 R profit
        if (!position.beLocked && c.high >= position.entryPrice + riskPerUnit) {
          position.currentSL = position.entryPrice + (riskPerUnit * 0.05);
          position.beLocked = true;
        }

        if (c.low <= position.currentSL) {
          exitPrice = position.currentSL;
          exitReason = position.beLocked ? 'TRAILING SL HIT' : 'INITIAL SL HIT';
          exited = true;
        } else if (c.high >= position.hardTP) {
          exitPrice = position.hardTP;
          exitReason = 'HARD TP HIT';
          exited = true;
        }
      } else if (position.type === 'SHORT') {
        if (!position.beLocked && c.low <= position.entryPrice - riskPerUnit) {
          position.currentSL = position.entryPrice - (riskPerUnit * 0.05);
          position.beLocked = true;
        }

        if (c.high >= position.currentSL) {
          exitPrice = position.currentSL;
          exitReason = position.beLocked ? 'TRAILING SL HIT' : 'INITIAL SL HIT';
          exited = true;
        } else if (c.low <= position.hardTP) {
          exitPrice = position.hardTP;
          exitReason = 'HARD TP HIT';
          exited = true;
        }
      }

      if (exited) {
        const pnlPerUnit = position.type === 'LONG' ? (exitPrice - position.entryPrice) : (position.entryPrice - exitPrice);
        const pnlUSD = pnlPerUnit * position.units;
        const rMultiple = pnlPerUnit / riskPerUnit;

        capital += pnlUSD;
        if (capital > peakCapital) peakCapital = capital;
        const ddUSD = peakCapital - capital;
        const ddPct = (ddUSD / peakCapital) * 100;
        if (ddUSD > maxDrawdownUSD) maxDrawdownUSD = ddUSD;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        allTrades.push({
          Date: position.entryDateTime,
          ExitDate: c.datetimeStr,
          Type: position.type,
          LevelType: position.levelType,
          EntryPrice: parseFloat(position.entryPrice.toFixed(decimals)),
          InitialSL: parseFloat(position.initialSL.toFixed(decimals)),
          FinalSL: parseFloat(position.currentSL.toFixed(decimals)),
          HardTP: parseFloat(position.hardTP.toFixed(decimals)),
          ExitPrice: parseFloat(exitPrice.toFixed(decimals)),
          RiskPerUnit: riskPerUnit,
          Units: position.units,
          RiskUSD: parseFloat(position.riskUSD.toFixed(2)),
          PnLUSD: parseFloat(pnlUSD.toFixed(2)),
          RMultiple: parseFloat(rMultiple.toFixed(2)),
          Result: pnlUSD > 1 ? 'WIN' : (pnlUSD < -1 ? 'LOSS' : 'BREAKEVEN'),
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

    // Check Entry if not in position
    if (!inPosition) {
      const activePivots = allPivots.filter(p => p.index < i - 2 && !p.touched && (i - p.index) <= 120);

      for (const pivot of activePivots) {
        if (pivot.type === 'RESISTANCE') {
          if (c.high >= pivot.price - entryOffset && c.open < pivot.price) {
            pivot.touched = true;
            const entryPrice = pivot.price - (entryOffset * 0.5);
            const sl = entryPrice + riskPerUnit;
            const tp = entryPrice - rewardPerUnit;
            const riskAmount = capital * riskPct;
            const units = riskAmount / riskPerUnit;

            inPosition = true;
            position = {
              type: 'SHORT',
              levelType: 'RESISTANCE BOUNCE',
              entryPrice: entryPrice,
              initialSL: sl,
              currentSL: sl,
              hardTP: tp,
              units: units,
              riskUSD: riskAmount,
              entryDateTime: c.datetimeStr,
              entryTimeSec: c.time,
              beLocked: false
            };
            break;
          }
        } else if (pivot.type === 'SUPPORT') {
          if (c.low <= pivot.price + entryOffset && c.open > pivot.price) {
            pivot.touched = true;
            const entryPrice = pivot.price + (entryOffset * 0.5);
            const sl = entryPrice - riskPerUnit;
            const tp = entryPrice + rewardPerUnit;
            const riskAmount = capital * riskPct;
            const units = riskAmount / riskPerUnit;

            inPosition = true;
            position = {
              type: 'LONG',
              levelType: 'SUPPORT BOUNCE',
              entryPrice: entryPrice,
              initialSL: sl,
              currentSL: sl,
              hardTP: tp,
              units: units,
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

  // 3. Filter for exact 6-Month Period (Feb 1, 2026 onwards)
  const sixMonthTrades = allTrades.filter(t => t.Date >= minHistoryDate);

  // Recalculate 6-Month equity curve starting from $10,000.00
  let runBal = 10000.0;
  let peakBal = 10000.0;
  let maxDD6M = 0;
  let maxDDPct6M = 0;
  const processedTrades = [];

  sixMonthTrades.forEach((t, i) => {
    const riskAmt = runBal * riskPct;
    const units = riskAmt / riskPerUnit;
    const pnlPerUnit = t.Type === 'LONG' ? (t.ExitPrice - t.EntryPrice) : (t.EntryPrice - t.ExitPrice);
    const pnlUSD = parseFloat((pnlPerUnit * units).toFixed(2));

    runBal += pnlUSD;
    if (runBal > peakBal) peakBal = runBal;
    const dd = peakBal - runBal;
    const ddPct = (dd / peakBal) * 100;
    if (dd > maxDD6M) maxDD6M = dd;
    if (ddPct > maxDDPct6M) maxDDPct6M = ddPct;

    const stdLots = (units / contractSize).toFixed(2);

    processedTrades.push({
      TradeNum: i + 1,
      Date: t.Date,
      ExitDate: t.ExitDate,
      Type: t.Type,
      LevelType: t.LevelType,
      EntryPrice: t.EntryPrice,
      InitialSL: t.InitialSL,
      FinalSL: t.FinalSL,
      HardTP: t.HardTP,
      ExitPrice: t.ExitPrice,
      RiskPerUnit: riskPerUnit,
      Units: parseFloat(units.toFixed(2)),
      StandardLots: `${stdLots} Lots (${units.toFixed(0)} ${unitName})`,
      RiskUSD: parseFloat(riskAmt.toFixed(2)),
      PnLUSD: pnlUSD,
      RMultiple: t.RMultiple,
      Result: pnlUSD > 1 ? 'WIN' : (pnlUSD < -1 ? 'LOSS' : 'BREAKEVEN'),
      ExitReason: t.ExitReason,
      BELocked: t.BELocked,
      RunningBalance: parseFloat(runBal.toFixed(2)),
      entryTimeSec: t.entryTimeSec,
      exitTimeSec: t.exitTimeSec
    });
  });

  // Calculate detailed performance metrics
  const winTrades = processedTrades.filter(t => t.Result === 'WIN');
  const lossTrades = processedTrades.filter(t => t.Result === 'LOSS');
  const grossProfit = winTrades.reduce((a, b) => a + b.PnLUSD, 0);
  const grossLoss = Math.abs(lossTrades.reduce((a, b) => a + b.PnLUSD, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 99.9;
  const netProfitUSD = runBal - 10000.0;
  const returnPct = (netProfitUSD / 10000.0) * 100;

  const avgWin = winTrades.length > 0 ? (grossProfit / winTrades.length) : 0;
  const avgLoss = lossTrades.length > 0 ? (grossLoss / lossTrades.length) : 0;
  const largestWin = winTrades.length > 0 ? Math.max(...winTrades.map(t => t.PnLUSD)) : 0;
  const largestLoss = lossTrades.length > 0 ? Math.min(...lossTrades.map(t => t.PnLUSD)) : 0;

  const summary = {
    pair: symbol,
    name: name,
    backtestPeriod: `6 Months (Feb 1, 2026 – Aug 19, 2026)`,
    initialCapital: 10000.0,
    finalBalance: parseFloat(runBal.toFixed(2)),
    netProfitUSD: parseFloat(netProfitUSD.toFixed(2)),
    returnPct: parseFloat(returnPct.toFixed(2)),
    totalTrades: processedTrades.length,
    winningTrades: winTrades.length,
    losingTrades: lossTrades.length,
    winRatePct: parseFloat(((winTrades.length / processedTrades.length) * 100).toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    grossProfitUSD: parseFloat(grossProfit.toFixed(2)),
    grossLossUSD: parseFloat(grossLoss.toFixed(2)),
    maxDrawdownUSD: parseFloat(maxDD6M.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDDPct6M.toFixed(2)),
    avgWinUSD: parseFloat(avgWin.toFixed(2)),
    avgLossUSD: parseFloat(avgLoss.toFixed(2)),
    largestWinUSD: parseFloat(largestWin.toFixed(2)),
    largestLossUSD: parseFloat(largestLoss.toFixed(2)),
    riskPerTrade: "10.0% Account Risk",
    riskRewardRatio: "1 : 2.50 (Step-Trailing Breakeven at +1.0R)"
  };

  console.log(`📊 Backtest Summary for ${symbol}:`);
  console.log(`   • Total Trades:       ${summary.totalTrades} (${summary.winningTrades} W / ${summary.losingTrades} L - ${summary.winRatePct}% Win Rate)`);
  console.log(`   • Net Profit:         +$${summary.netProfitUSD.toLocaleString()} (+${summary.returnPct.toFixed(1)}%)`);
  console.log(`   • Final Equity:       $${summary.finalBalance.toLocaleString()}`);
  console.log(`   • Profit Factor:      ${summary.profitFactor}`);
  console.log(`   • Max Drawdown:       -$${summary.maxDrawdownUSD.toLocaleString()} (${summary.maxDrawdownPct.toFixed(1)}%)`);
  console.log(`   • Avg Win / Loss:     +$${summary.avgWinUSD.toFixed(2)} / -$${summary.avgLossUSD.toFixed(2)}`);
  console.log(`   • Largest Win/Loss:   +$${summary.largestWinUSD.toFixed(2)} / $${summary.largestLossUSD.toFixed(2)}`);

  // Build Lightweight Charts Markers
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

  // Save JSON & CSV
  fs.writeFileSync(path.join(__dirname, `backtest_${symbol.toLowerCase()}_summary.json`), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(__dirname, `backtest_${symbol.toLowerCase()}_trades.json`), JSON.stringify(processedTrades, null, 2));
  fs.writeFileSync(path.join(__dirname, `backtest_${symbol.toLowerCase()}_markers.json`), JSON.stringify(markers, null, 2));

  const csvHeader = 'TradeNum,Date,ExitDate,Type,LevelType,EntryPrice,InitialSL,FinalSL,HardTP,ExitPrice,StandardLots,RiskUSD,PnLUSD,RMultiple,Result,ExitReason,BELocked,RunningBalance\n';
  const csvRows = processedTrades.map(t =>
    `${t.TradeNum},${t.Date},${t.ExitDate},${t.Type},${t.LevelType},${t.EntryPrice},${t.InitialSL},${t.FinalSL},${t.HardTP},${t.ExitPrice},"${t.StandardLots}",${t.RiskUSD},${t.PnLUSD},${t.RMultiple},${t.Result},"${t.ExitReason}",${t.BELocked},${t.RunningBalance}`
  ).join('\n');
  fs.writeFileSync(path.join(__dirname, `backtest_${symbol.toLowerCase()}_trade_log.csv`), csvHeader + csvRows);

  return {
    candles: rawCandles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    summary,
    trades: processedTrades,
    markers
  };
}

// Pair Configurations
const PAIRS = [
  {
    symbol: 'XAUUSD',
    name: 'Gold / US Dollar',
    dataFile: 'tradingview_live_xauusd_4h.json',
    riskPct: 0.10,
    riskPerUnit: 10.0, // $10 SL distance on Gold
    rewardMultiple: 2.50, // 1:2.50 R:R ($25 TP)
    unitName: 'oz',
    contractSize: 100, // 1 Lot = 100 oz
    decimals: 2,
    minHistoryDate: '2026-02-01',
    entryOffset: 1.5
  },
  {
    symbol: 'XAGUSD',
    name: 'Silver / US Dollar',
    dataFile: 'tradingview_live_xagusd_4h.json',
    riskPct: 0.10,
    riskPerUnit: 0.40, // $0.40 SL distance on Silver
    rewardMultiple: 2.50, // 1:2.50 R:R ($1.00 TP)
    unitName: 'oz',
    contractSize: 5000, // 1 Lot = 5000 oz
    decimals: 3,
    minHistoryDate: '2026-02-01',
    entryOffset: 0.10
  },
  {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    dataFile: 'tradingview_live_eurusd_4h.json',
    riskPct: 0.10,
    riskPerUnit: 0.0025, // 25 pips SL distance on EUR/USD
    rewardMultiple: 2.50, // 1:2.50 R:R (62.5 pips TP)
    unitName: 'units',
    contractSize: 100000, // 1 Lot = 100,000 units
    decimals: 5,
    minHistoryDate: '2026-02-01',
    entryOffset: 0.0005
  }
];

const multiPairResults = {};

PAIRS.forEach(config => {
  multiPairResults[config.symbol] = runBacktestForPair(config);
});

fs.writeFileSync(path.join(__dirname, 'multi_pair_backtest_results.json'), JSON.stringify(multiPairResults, null, 2));
console.log(`\n✅ Successfully generated multi_pair_backtest_results.json for all 3 pairs!`);
