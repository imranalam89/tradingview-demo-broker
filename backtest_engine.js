const fs = require('fs');
const path = require('path');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = lines[i].split(',').map(p => p.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx];
    });
    records.push({
      date: row['Date'],
      time: row['Time'] || '00:00',
      open: parseFloat(row['Open']),
      high: parseFloat(row['High']),
      low: parseFloat(row['Low']),
      close: parseFloat(row['Close']),
      volume: parseFloat(row['Volume'] || 0)
    });
  }
  return records;
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const emaArray = new Array(prices.length);
  let ema = prices[0];
  emaArray[0] = ema;
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray[i] = ema;
  }
  return emaArray;
}

function calculateATR(candles, period = 14) {
  const tr = new Array(candles.length);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  
  const atr = new Array(candles.length);
  let sum = 0;
  for (let i = 0; i < period && i < candles.length; i++) {
    sum += tr[i];
    atr[i] = sum / (i + 1);
  }
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

function calculateRSI(candles, period = 14) {
  const rsi = new Array(candles.length).fill(50);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period && i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

function runBacktest(candles, options = {}) {
  const {
    initialCapital = 10000,
    riskPct = 0.02,
    fastEmaPeriod = 20,
    slowEmaPeriod = 50,
    trendEmaPeriod = 200,
    atrMultiplierSL = 1.5,
    riskRewardRatio = 2.5,
    trailingBreakeven = true
  } = options;

  const closes = candles.map(c => c.close);
  const emaFast = calculateEMA(closes, fastEmaPeriod);
  const emaSlow = calculateEMA(closes, slowEmaPeriod);
  const emaTrend = calculateEMA(closes, trendEmaPeriod);
  const atr = calculateATR(candles, 14);
  const rsi = calculateRSI(candles, 14);

  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdownUSD = 0;
  let maxDrawdownPct = 0;

  const trades = [];
  let inPosition = false;
  let position = null;

  const startIndex = Math.max(trendEmaPeriod, 50) + 1;

  for (let i = startIndex; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    if (inPosition) {
      // Trailing / Breakeven check
      if (trailingBreakeven) {
        if (position.type === 'LONG' && c.high >= position.entry + (position.entry - position.initialSL)) {
          position.currentSL = Math.max(position.currentSL, position.entry + 0.5);
        } else if (position.type === 'SHORT' && c.low <= position.entry - (position.initialSL - position.entry)) {
          position.currentSL = Math.min(position.currentSL, position.entry - 0.5);
        }
      }

      let exited = false;
      let exitPrice = 0;
      let exitReason = '';

      if (position.type === 'LONG') {
        if (c.low <= position.currentSL) {
          exitPrice = position.currentSL;
          exitReason = exitPrice >= position.entry ? 'Breakeven / Trailing SL' : 'Stop Loss Hit';
          exited = true;
        } else if (c.high >= position.tp) {
          exitPrice = position.tp;
          exitReason = 'Take Profit Target Hit';
          exited = true;
        }
      } else if (position.type === 'SHORT') {
        if (c.high >= position.currentSL) {
          exitPrice = position.currentSL;
          exitReason = exitPrice <= position.entry ? 'Breakeven / Trailing SL' : 'Stop Loss Hit';
          exited = true;
        } else if (c.low <= position.tp) {
          exitPrice = position.tp;
          exitReason = 'Take Profit Target Hit';
          exited = true;
        }
      }

      if (exited) {
        const pnl = position.type === 'LONG' 
          ? (exitPrice - position.entry) * position.lots 
          : (position.entry - exitPrice) * position.lots;
        
        capital += pnl;
        if (capital > peakCapital) peakCapital = capital;
        const ddUSD = peakCapital - capital;
        const ddPct = (ddUSD / peakCapital) * 100;
        if (ddUSD > maxDrawdownUSD) maxDrawdownUSD = ddUSD;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        trades.push({
          tradeNum: trades.length + 1,
          entryDate: `${position.candle.date} ${position.candle.time}`,
          exitDate: `${c.date} ${c.time}`,
          type: position.type,
          entry: position.entry.toFixed(2),
          exit: exitPrice.toFixed(2),
          sl: position.initialSL.toFixed(2),
          tp: position.tp.toFixed(2),
          lots: position.lots.toFixed(2),
          pnlUSD: pnl.toFixed(2),
          balance: capital.toFixed(2),
          result: pnl > 5 ? 'WIN' : (pnl < -5 ? 'LOSS' : 'BREAKEVEN'),
          exitReason
        });

        inPosition = false;
        position = null;
        continue;
      }
    }

    // New Entry Signals
    if (!inPosition) {
      const currentATR = atr[i] || 5.0;
      const isUptrend = c.close > emaTrend[i];
      const isDowntrend = c.close < emaTrend[i];

      const longCross = prev.close <= emaFast[i-1] && c.close > emaFast[i] && emaFast[i] > emaSlow[i] && isUptrend && rsi[i] > 50 && rsi[i] < 72;
      const shortCross = prev.close >= emaFast[i-1] && c.close < emaFast[i] && emaFast[i] < emaSlow[i] && isDowntrend && rsi[i] < 50 && rsi[i] > 28;

      if (longCross) {
        const slDist = Math.max(currentATR * atrMultiplierSL, 4.0);
        const sl = c.close - slDist;
        const tp = c.close + (slDist * riskRewardRatio);
        const riskAmount = capital * riskPct;
        const lots = riskAmount / slDist;

        inPosition = true;
        position = {
          type: 'LONG',
          entry: c.close,
          initialSL: sl,
          currentSL: sl,
          tp: tp,
          lots: lots,
          candle: c
        };
      } else if (shortCross) {
        const slDist = Math.max(currentATR * atrMultiplierSL, 4.0);
        const sl = c.close + slDist;
        const tp = c.close - (slDist * riskRewardRatio);
        const riskAmount = capital * riskPct;
        const lots = riskAmount / slDist;

        inPosition = true;
        position = {
          type: 'SHORT',
          entry: c.close,
          initialSL: sl,
          currentSL: sl,
          tp: tp,
          lots: lots,
          candle: c
        };
      }
    }
  }

  const winTrades = trades.filter(t => t.result === 'WIN');
  const lossTrades = trades.filter(t => t.result === 'LOSS');
  const beTrades = trades.filter(t => t.result === 'BREAKEVEN');

  const grossProfit = winTrades.reduce((acc, t) => acc + parseFloat(t.pnlUSD), 0);
  const grossLoss = Math.abs(lossTrades.reduce((acc, t) => acc + parseFloat(t.pnlUSD), 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 99.9;
  const netProfit = capital - initialCapital;
  const returnPct = (netProfit / initialCapital) * 100;
  const winRate = trades.length > 0 ? ((winTrades.length / trades.length) * 100) : 0;

  return {
    summary: {
      strategyName: "Apex Gold 1H Trend & Dynamic Trailing Engine",
      dataset: `12 Months (${candles.length} Candles)`,
      initialCapital: initialCapital,
      finalBalance: parseFloat(capital.toFixed(2)),
      netProfitUSD: parseFloat(netProfit.toFixed(2)),
      returnPct: parseFloat(returnPct.toFixed(2)),
      totalTrades: trades.length,
      winningTrades: winTrades.length,
      losingTrades: lossTrades.length,
      breakEvenTrades: beTrades.length,
      winRatePct: parseFloat(winRate.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      grossProfitUSD: parseFloat(grossProfit.toFixed(2)),
      grossLossUSD: parseFloat(grossLoss.toFixed(2)),
      maxDrawdownUSD: parseFloat(maxDrawdownUSD.toFixed(2)),
      maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
      avgWinUSD: winTrades.length > 0 ? parseFloat((grossProfit / winTrades.length).toFixed(2)) : 0,
      avgLossUSD: lossTrades.length > 0 ? parseFloat((grossLoss / lossTrades.length).toFixed(2)) : 0
    },
    trades
  };
}

// Run backtests on available datasets
const dataFile = path.join(__dirname, 'XAUUSD_1Hour_OHLC_12Months_2025_2026.csv');
if (fs.existsSync(dataFile)) {
  const candles = parseCSV(dataFile);
  console.log(`\n======================================================`);
  console.log(`🔥 RUNNING APEX GOLD BACKTEST ON 12-MONTH 1H DATA (${candles.length} Candles)`);
  console.log(`======================================================`);

  const result = runBacktest(candles, {
    initialCapital: 10000,
    riskPct: 0.02,
    fastEmaPeriod: 20,
    slowEmaPeriod: 50,
    trendEmaPeriod: 200,
    atrMultiplierSL: 1.5,
    riskRewardRatio: 2.5,
    trailingBreakeven: true
  });

  console.log(JSON.stringify(result.summary, null, 2));

  // Export summary and trade log
  fs.writeFileSync(path.join(__dirname, 'Apex_Gold_1H_Trend_Engine_Summary.json'), JSON.stringify(result.summary, null, 2));
  
  // Format CSV
  const csvHeader = 'Trade #,Entry Date,Exit Date,Type,Entry Price,Exit Price,Initial SL,Hard TP,Lots,PnL USD,Balance,Result,Exit Reason\n';
  const csvRows = result.trades.map(t => 
    `${t.tradeNum},${t.entryDate},${t.exitDate},${t.type},${t.entry},${t.exit},${t.sl},${t.tp},${t.lots},${t.pnlUSD},${t.balance},${t.result},"${t.exitReason}"`
  ).join('\n');
  fs.writeFileSync(path.join(__dirname, 'Apex_Gold_1H_Trend_Engine_Trade_Log.csv'), csvHeader + csvRows);

  console.log(`\n✅ Saved 'Apex_Gold_1H_Trend_Engine_Summary.json' and 'Apex_Gold_1H_Trend_Engine_Trade_Log.csv'!`);
}
