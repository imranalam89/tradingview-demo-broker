const fs = require('fs');
const path = require('path');

// Load 1H candles for XAU/USD
const candles1h = JSON.parse(fs.readFileSync(path.join(__dirname, 'xauusd_1h.json'), 'utf-8'));
console.log(`Loaded ${candles1h.length} 1H candles from ${candles1h[0].datetimeStr} to ${candles1h[candles1h.length - 1].datetimeStr}`);

// Technical indicator helpers
function computeATR(candles, period = 14) {
  const atrs = new Array(candles.length).fill(0);
  const trs = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trs[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  atrs[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    atrs[i] = (atrs[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atrs;
}

function computeSMA(candles, period = 20, field = 'close') {
  const smas = new Array(candles.length).fill(0);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j][field];
    }
    smas[i] = sum / period;
  }
  return smas;
}

function computeBollingerBands(candles, period = 20, mult = 2) {
  const sma = computeSMA(candles, period);
  const bb = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      bb.push({ middle: 0, upper: 0, lower: 0, width: 0 });
      continue;
    }
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(candles[j].close - sma[i], 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    const upper = sma[i] + mult * stdDev;
    const lower = sma[i] - mult * stdDev;
    const width = (upper - lower) / sma[i];
    bb.push({ middle: sma[i], upper, lower, width });
  }
  return bb;
}

const atrs = computeATR(candles1h, 14);
const bb = computeBollingerBands(candles1h, 20);

// Run full backtesting simulation with 10% risk compounding
function runVolatilitySqueezeBacktest(riskPct = 0.10, rewardMult = 2.0, useTrailingBE = true) {
  let initialCapital = 10000.0;
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDD = 0;
  let maxDDPct = 0;

  const trades = [];
  let inPosition = false;
  let pos = null;

  for (let i = 30; i < candles1h.length; i++) {
    const c = candles1h[i];

    // Check Exits if in position
    if (inPosition) {
      let exited = false;
      let exitPrice = 0;
      let exitReason = '';

      if (pos.type === 'LONG') {
        // Step-Trailing to Breakeven at +1.0 R
        if (useTrailingBE && !pos.beLocked && c.high >= pos.entryPrice + pos.riskPerUnit) {
          pos.currentSL = pos.entryPrice + (pos.riskPerUnit * 0.05); // lock +0.05R
          pos.beLocked = true;
        }

        if (c.low <= pos.currentSL) {
          exitPrice = pos.currentSL;
          exitReason = pos.beLocked ? 'TRAILING BE HIT' : 'INITIAL SL HIT';
          exited = true;
        } else if (c.high >= pos.hardTP) {
          exitPrice = pos.hardTP;
          exitReason = 'HARD TP HIT';
          exited = true;
        }
      } else if (pos.type === 'SHORT') {
        if (useTrailingBE && !pos.beLocked && c.low <= pos.entryPrice - pos.riskPerUnit) {
          pos.currentSL = pos.entryPrice - (pos.riskPerUnit * 0.05);
          pos.beLocked = true;
        }

        if (c.high >= pos.currentSL) {
          exitPrice = pos.currentSL;
          exitReason = pos.beLocked ? 'TRAILING BE HIT' : 'INITIAL SL HIT';
          exited = true;
        } else if (c.low <= pos.hardTP) {
          exitPrice = pos.hardTP;
          exitReason = 'HARD TP HIT';
          exited = true;
        }
      }

      if (exited) {
        const pnlPerUnit = pos.type === 'LONG' ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
        const pnlUSD = pnlPerUnit * pos.units;
        const rMult = pnlPerUnit / pos.riskPerUnit;

        capital += pnlUSD;
        if (capital > peakCapital) peakCapital = capital;
        const dd = peakCapital - capital;
        const ddPct = (dd / peakCapital) * 100;
        if (dd > maxDD) maxDD = dd;
        if (ddPct > maxDDPct) maxDDPct = ddPct;

        const stdLots = (pos.units / 100).toFixed(2); // 1 Lot = 100 oz Gold

        trades.push({
          TradeNum: trades.length + 1,
          Date: pos.entryDateTime,
          ExitDate: c.datetimeStr,
          Type: pos.type,
          Pattern: 'NR7 + BB Squeeze Breakout',
          EntryPrice: parseFloat(pos.entryPrice.toFixed(2)),
          InitialSL: parseFloat(pos.initialSL.toFixed(2)),
          FinalSL: parseFloat(pos.currentSL.toFixed(2)),
          HardTP: parseFloat(pos.hardTP.toFixed(2)),
          ExitPrice: parseFloat(exitPrice.toFixed(2)),
          RiskPerUnit: parseFloat(pos.riskPerUnit.toFixed(2)),
          Units: parseFloat(pos.units.toFixed(2)),
          StandardLots: `${stdLots} Lots (${pos.units.toFixed(0)} oz)`,
          RiskUSD: parseFloat(pos.riskUSD.toFixed(2)),
          PnLUSD: parseFloat(pnlUSD.toFixed(2)),
          RMultiple: parseFloat(rMult.toFixed(2)),
          Result: pnlUSD > 1 ? 'WIN' : (pnlUSD < -1 ? 'LOSS' : 'BREAKEVEN'),
          ExitReason: exitReason,
          BELocked: pos.beLocked ? 'YES' : 'NO',
          RunningBalance: parseFloat(capital.toFixed(2)),
          entryTimeSec: pos.entryTimeSec,
          exitTimeSec: c.time,
          squeezeWidth: pos.squeezeWidth
        });

        inPosition = false;
        pos = null;
        continue;
      }
    }

    // Check Entries if not in position
    if (!inPosition) {
      const atr = atrs[i];
      if (atr === 0) continue;

      // Check NR7 on candle i-1
      const prevBar = candles1h[i - 1];
      const prevRange = prevBar.high - prevBar.low;
      let isNR7 = true;
      for (let j = i - 7; j < i - 1; j++) {
        if (candles1h[j].high - candles1h[j].low <= prevRange) {
          isNR7 = false;
          break;
        }
      }

      // Check Bollinger Band Squeeze on candle i-1 (bottom 25th percentile of last 40 bars)
      const recentWidths = bb.slice(i - 41, i).map(b => b.width);
      const sortedWidths = [...recentWidths].sort((a, b) => a - b);
      const p25Width = sortedWidths[Math.floor(sortedWidths.length * 0.25)];
      const isBBSqueeze = bb[i - 1].width <= p25Width;

      if (isNR7 && isBBSqueeze) {
        const boxHigh = Math.max(candles1h[i - 1].high, candles1h[i - 2].high, candles1h[i - 3].high);
        const boxLow = Math.min(candles1h[i - 1].low, candles1h[i - 2].low, candles1h[i - 3].low);

        // Bullish Breakout: Current candle closes ABOVE consolidation box high
        if (c.close > boxHigh && c.close > c.open) {
          const entryPrice = c.close;
          const sl = boxLow - 1.0;
          const riskPerUnit = entryPrice - sl;
          const hardTP = entryPrice + (riskPerUnit * rewardMult);
          const riskAmount = capital * riskPct;
          const units = riskAmount / riskPerUnit;

          inPosition = true;
          pos = {
            type: 'LONG',
            entryPrice,
            initialSL: sl,
            currentSL: sl,
            hardTP,
            riskPerUnit,
            units,
            riskUSD: riskAmount,
            entryDateTime: c.datetimeStr,
            entryTimeSec: c.time,
            beLocked: false,
            squeezeWidth: (bb[i - 1].width * 100).toFixed(2) + '%'
          };
        }
        // Bearish Breakout: Current candle closes BELOW consolidation box low
        else if (c.close < boxLow && c.close < c.open) {
          const entryPrice = c.close;
          const sl = boxHigh + 1.0;
          const riskPerUnit = sl - entryPrice;
          const hardTP = entryPrice - (riskPerUnit * rewardMult);
          const riskAmount = capital * riskPct;
          const units = riskAmount / riskPerUnit;

          inPosition = true;
          pos = {
            type: 'SHORT',
            entryPrice,
            initialSL: sl,
            currentSL: sl,
            hardTP,
            riskPerUnit,
            units,
            riskUSD: riskAmount,
            entryDateTime: c.datetimeStr,
            entryTimeSec: c.time,
            beLocked: false,
            squeezeWidth: (bb[i - 1].width * 100).toFixed(2) + '%'
          };
        }
      }
    }
  }

  // Calculate Metrics
  const winTrades = trades.filter(t => t.Result === 'WIN');
  const lossTrades = trades.filter(t => t.Result === 'LOSS');
  const grossProfit = winTrades.reduce((a, b) => a + b.PnLUSD, 0);
  const grossLoss = Math.abs(lossTrades.reduce((a, b) => a + b.PnLUSD, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 99.0;
  const netProfitUSD = capital - initialCapital;
  const returnPct = (netProfitUSD / initialCapital) * 100;
  const winRate = (winTrades.length / trades.length) * 100;

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
    finalBalance: parseFloat(capital.toFixed(2)),
    netProfitUSD: parseFloat(netProfitUSD.toFixed(2)),
    returnPct: parseFloat(returnPct.toFixed(2)),
    totalTrades: trades.length,
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
    riskRewardRatio: `1 : ${rewardMult.toFixed(2)} (with Step-Trailing Breakeven at +1.0R)`
  };

  console.log(`\n=======================================================================`);
  console.log(`📊 VOLATILITY SQUEEZE BACKTEST RESULTS (6-MONTH 1H GOLD):`);
  console.log(`   • Total Trades:       ${summary.totalTrades} (${summary.winningTrades} W / ${summary.losingTrades} L - ${summary.winRatePct}% Win Rate)`);
  console.log(`   • Net Profit:         +$${summary.netProfitUSD.toLocaleString()} (+${summary.returnPct.toFixed(1)}%)`);
  console.log(`   • Final Equity:       $${summary.finalBalance.toLocaleString()}`);
  console.log(`   • Profit Factor:      ${summary.profitFactor}`);
  console.log(`   • Max Drawdown:       -$${summary.maxDrawdownUSD.toLocaleString()} (${summary.maxDrawdownPct.toFixed(1)}%)`);
  console.log(`   • Avg Win / Loss:     +$${summary.avgWinUSD.toFixed(2)} / -$${summary.avgLossUSD.toFixed(2)}`);

  // Build markers for chart
  const markers = [];
  trades.forEach(t => {
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

  return { summary, trades, markers, candles: candles1h.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })) };
}

const result = runVolatilitySqueezeBacktest(0.10, 2.0, true);

fs.writeFileSync(path.join(__dirname, 'volatility_squeeze_backtest_data.json'), JSON.stringify(result, null, 2));
console.log('Saved backtest data to volatility_squeeze_backtest_data.json');
