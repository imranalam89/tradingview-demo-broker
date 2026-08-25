const fs = require('fs');
const path = require('path');

// Load datasets
const candles1h = JSON.parse(fs.readFileSync(path.join(__dirname, 'xauusd_1h.json'), 'utf-8'));
const candles4h = JSON.parse(fs.readFileSync(path.join(__dirname, 'xauusd_4h.json'), 'utf-8'));
const candlesDaily = JSON.parse(fs.readFileSync(path.join(__dirname, 'xauusd_daily.json'), 'utf-8'));

console.log(`Loaded ${candles1h.length} 1H bars, ${candles4h.length} 4H bars, and ${candlesDaily.length} Daily bars.`);

// -------------------------------------------------------------
// HELPER MATH & TECHNICAL INDICATORS
// -------------------------------------------------------------
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

function computeEMA(candles, period = 50) {
  const emas = new Array(candles.length).fill(0);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  emas[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  }
  return emas;
}

// -------------------------------------------------------------
// 1. STATISTICAL DEFINITION OF MEDIUM & LARGE MOVEMENTS
// -------------------------------------------------------------
const atr1h = computeATR(candles1h, 14);
const atr4h = computeATR(candles4h, 14);

console.log(`\n=======================================================================`);
console.log(`📊 1. DEFINING & QUANTIFYING MOVEMENTS ON 1H & 4H`);

function analyzeMovementDistributions(candles, atrs, tfName) {
  const ranges = [];
  const bodySizes = [];
  const atrRatios = [];
  const pctChanges = [];

  for (let i = 14; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);
    const atr = atrs[i];
    const pct = ((c.high - c.low) / c.open) * 100;

    ranges.push(range);
    bodySizes.push(body);
    atrRatios.push(range / atr);
    pctChanges.push(pct);
  }

  ranges.sort((a, b) => a - b);
  atrRatios.sort((a, b) => a - b);
  pctChanges.sort((a, b) => a - b);

  const p50Range = ranges[Math.floor(ranges.length * 0.50)];
  const p75Range = ranges[Math.floor(ranges.length * 0.75)];
  const p90Range = ranges[Math.floor(ranges.length * 0.90)];
  const p95Range = ranges[Math.floor(ranges.length * 0.95)];

  const p50Atr = atrRatios[Math.floor(atrRatios.length * 0.50)];
  const p75Atr = atrRatios[Math.floor(atrRatios.length * 0.75)];
  const p90Atr = atrRatios[Math.floor(atrRatios.length * 0.90)];
  const p95Atr = atrRatios[Math.floor(atrRatios.length * 0.95)];

  console.log(`\n[${tfName}] Movement Distribution (${ranges.length} bars):`);
  console.log(`   • Median Range (P50):    $${p50Range.toFixed(2)} (${p50Atr.toFixed(2)}x ATR)`);
  console.log(`   • Medium Move (P75):     $${p75Range.toFixed(2)} (${p75Atr.toFixed(2)}x ATR)`);
  console.log(`   • Large Move (P90):      $${p90Range.toFixed(2)} (${p90Atr.toFixed(2)}x ATR)`);
  console.log(`   • Extreme Move (P95):    $${p95Range.toFixed(2)} (${p95Atr.toFixed(2)}x ATR)`);

  return {
    medianRange: p50Range,
    mediumThresholdATR: 1.5, // 1.5x ATR is ~75th-80th percentile
    largeThresholdATR: 2.5   // 2.5x ATR is ~92nd-95th percentile
  };
}

const stats1h = analyzeMovementDistributions(candles1h, atr1h, '1-Hour (1H)');
const stats4h = analyzeMovementDistributions(candles4h, atr4h, '4-Hour (4H)');

// -------------------------------------------------------------
// 2. PRE-MOVEMENT CHARACTERISTICS (WHAT HAPPENS BEFORE LARGE MOVES?)
// -------------------------------------------------------------
console.log(`\n=======================================================================`);
console.log(`🔬 2. PRECURSOR ANALYSIS: WHAT HAPPENS 3, 5, 10 BARS BEFORE LARGE MOVES?`);

function analyzePrecursors(candles, atrs, largeAtrMult = 2.0) {
  let largeMoveCount = 0;
  let preVolatilityCompressionCount = 0;
  let preHigherLowLowerHighCount = 0;
  let preSessionSweepCount = 0;
  let preInsideBarCount = 0;

  const bb = computeBollingerBands(candles, 20);

  for (let i = 30; i < candles.length - 1; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    const atr = atrs[i];

    if (range >= atr * largeAtrMult) {
      largeMoveCount++;

      // Check 5 bars prior
      const prior5 = candles.slice(i - 5, i);
      const priorAvgRange = prior5.reduce((sum, b) => sum + (b.high - b.low), 0) / 5;
      
      // 1. Volatility compression: Prior 5 bars had below-average range
      if (priorAvgRange < atr * 0.85 || (bb[i - 1] && bb[i - 1].width < 0.015)) {
        preVolatilityCompressionCount++;
      }

      // 2. Inside bars in prior 3 bars
      let hasInsideBar = false;
      for (let j = i - 3; j < i; j++) {
        if (candles[j].high <= candles[j - 1].high && candles[j].low >= candles[j - 1].low) {
          hasInsideBar = true;
          break;
        }
      }
      if (hasInsideBar) preInsideBarCount++;

      // 3. Price action consolidation/range structure
      let higherLows = true;
      let lowerHighs = true;
      for (let j = 1; j < prior5.length; j++) {
        if (prior5[j].low <= prior5[j - 1].low) higherLows = false;
        if (prior5[j].high >= prior5[j - 1].high) lowerHighs = false;
      }
      if (higherLows || lowerHighs) preHigherLowLowerHighCount++;
    }
  }

  console.log(`Total Large 1H Moves (>= 2.0x ATR) Identified: ${largeMoveCount}`);
  console.log(`   • Preceded by Volatility Compression / BB Squeeze: ${preVolatilityCompressionCount} (${((preVolatilityCompressionCount / largeMoveCount) * 100).toFixed(1)}%)`);
  console.log(`   • Preceded by Inside Bar in last 3 bars:           ${preInsideBarCount} (${((preInsideBarCount / largeMoveCount) * 100).toFixed(1)}%)`);
  console.log(`   • Preceded by Triangle / Wedge Coiling Structure:  ${preHigherLowLowerHighCount} (${((preHigherLowLowerHighCount / largeMoveCount) * 100).toFixed(1)}%)`);
}

analyzePrecursors(candles1h, atr1h, 2.0);

// -------------------------------------------------------------
// 3. QUANTITATIVE PATTERN TESTING ENGINE (ZERO LOOK-AHEAD BIAS)
// -------------------------------------------------------------
console.log(`\n=======================================================================`);
console.log(`🧪 3. TESTING 5 REPEATABLE PATTERNS ON 6-MONTH XAU/USD (FEB-AUG 2026)`);

// Define Previous Day High/Low
function buildDailyLevels(dailyCandles) {
  const map = {};
  for (let i = 1; i < dailyCandles.length; i++) {
    const todayStr = dailyCandles[i].datetimeStr.slice(0, 10);
    map[todayStr] = {
      pdh: dailyCandles[i - 1].high,
      pdl: dailyCandles[i - 1].low,
      pdc: dailyCandles[i - 1].close,
      pdo: dailyCandles[i - 1].open
    };
  }
  return map;
}

const dailyLevels = buildDailyLevels(candlesDaily);

// Standard Outcome Simulator (Tracks exact MFE, MAE, R:R outcomes across forward window)
function evaluateTradeOutcome(candles, entryIdx, type, entryPrice, stopLoss, targetPrice, maxBars = 24) {
  const risk = Math.abs(entryPrice - stopLoss);
  let mfe = 0; // Max Favorable Excursion
  let mae = 0; // Max Adverse Excursion
  let exitPrice = 0;
  let exitBar = entryIdx;
  let outcome = 'TIMEOUT'; // 'WIN', 'LOSS', 'TIMEOUT'

  for (let i = entryIdx + 1; i < Math.min(candles.length, entryIdx + 1 + maxBars); i++) {
    const c = candles[i];
    
    if (type === 'LONG') {
      const fav = c.high - entryPrice;
      const adv = entryPrice - c.low;
      if (fav > mfe) mfe = fav;
      if (adv > mae) mae = adv;

      // Check Stop Loss First (Conservative)
      if (c.low <= stopLoss) {
        outcome = 'LOSS';
        exitPrice = stopLoss;
        exitBar = i;
        break;
      } else if (c.high >= targetPrice) {
        outcome = 'WIN';
        exitPrice = targetPrice;
        exitBar = i;
        break;
      }
    } else if (type === 'SHORT') {
      const fav = entryPrice - c.low;
      const adv = c.high - entryPrice;
      if (fav > mfe) mfe = fav;
      if (adv > mae) mae = adv;

      if (c.high >= stopLoss) {
        outcome = 'LOSS';
        exitPrice = stopLoss;
        exitBar = i;
        break;
      } else if (c.low <= targetPrice) {
        outcome = 'WIN';
        exitPrice = targetPrice;
        exitBar = i;
        break;
      }
    }
  }

  if (outcome === 'TIMEOUT') {
    const lastBar = candles[Math.min(candles.length - 1, entryIdx + maxBars)];
    exitPrice = lastBar.close;
    exitBar = Math.min(candles.length - 1, entryIdx + maxBars);
    if (type === 'LONG') outcome = exitPrice > entryPrice ? 'WIN' : 'LOSS';
    else outcome = exitPrice < entryPrice ? 'WIN' : 'LOSS';
  }

  const pnlUSD = type === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
  const rMultiple = pnlUSD / risk;

  return {
    outcome,
    entryPrice: parseFloat(entryPrice.toFixed(2)),
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    targetPrice: parseFloat(targetPrice.toFixed(2)),
    exitPrice: parseFloat(exitPrice.toFixed(2)),
    exitTime: candles[exitBar].datetimeStr,
    exitTimeSec: candles[exitBar].time,
    barsHeld: exitBar - entryIdx,
    mfe: parseFloat(mfe.toFixed(2)),
    mae: parseFloat(mae.toFixed(2)),
    mfeR: parseFloat((mfe / risk).toFixed(2)),
    maeR: parseFloat((mae / risk).toFixed(2)),
    rMultiple: parseFloat(rMultiple.toFixed(2))
  };
}

// -------------------------------------------------------------
// PATTERN 1: ASIAN SESSION LIQUIDITY SWEEP & REVERSAL (1H)
// -------------------------------------------------------------
function testAsianSweepPattern(candles, atrs) {
  const occurrences = [];
  
  // Group candles by date
  const byDate = {};
  candles.forEach((c, idx) => {
    const d = c.datetimeStr.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push({ ...c, idx });
  });

  Object.keys(byDate).forEach(dateStr => {
    const dayBars = byDate[dateStr];
    // Asian session: 00:00 to 07:00 UTC (indices where hour < 7)
    const asianBars = dayBars.filter(b => {
      const hour = parseInt(b.datetimeStr.slice(11, 13), 10);
      return hour >= 0 && hour < 7;
    });

    if (asianBars.length < 5) return;

    const asianHigh = Math.max(...asianBars.map(b => b.high));
    const asianLow = Math.min(...asianBars.map(b => b.low));
    const asianRange = asianHigh - asianLow;

    // London / NY session: 07:00 to 16:00 UTC
    const tradeWindow = dayBars.filter(b => {
      const hour = parseInt(b.datetimeStr.slice(11, 13), 10);
      return hour >= 7 && hour <= 15;
    });

    let sweptHigh = false;
    let sweptLow = false;

    tradeWindow.forEach(bar => {
      const atr = atrs[bar.idx];
      if (atr === 0) return;

      // High Sweep: Price pierced Asian High by 0.1x to 0.8x ATR, but closed back below Asian High
      if (!sweptHigh && bar.high > asianHigh && bar.high <= asianHigh + atr * 0.8 && bar.close < asianHigh) {
        sweptHigh = true;
        const entryPrice = bar.close;
        const sl = bar.high + 1.5;
        const tp = entryPrice - (sl - entryPrice) * 2.0; // 1:2 R:R

        const res = evaluateTradeOutcome(candles, bar.idx, 'SHORT', entryPrice, sl, tp, 18);
        occurrences.push({
          pattern: 'Asian Liquidity Sweep (High Rejection)',
          direction: 'SHORT',
          timeframe: '1H',
          date: bar.datetimeStr,
          timeSec: bar.time,
          asianHigh,
          asianLow,
          asianRange: parseFloat(asianRange.toFixed(2)),
          atr: parseFloat(atr.toFixed(2)),
          ...res
        });
      }

      // Low Sweep: Price pierced Asian Low by 0.1x to 0.8x ATR, but closed back above Asian Low
      if (!sweptLow && bar.low < asianLow && bar.low >= asianLow - atr * 0.8 && bar.close > asianLow) {
        sweptLow = true;
        const entryPrice = bar.close;
        const sl = bar.low - 1.5;
        const tp = entryPrice + (entryPrice - sl) * 2.0; // 1:2 R:R

        const res = evaluateTradeOutcome(candles, bar.idx, 'LONG', entryPrice, sl, tp, 18);
        occurrences.push({
          pattern: 'Asian Liquidity Sweep (Low Rejection)',
          direction: 'LONG',
          timeframe: '1H',
          date: bar.datetimeStr,
          timeSec: bar.time,
          asianHigh,
          asianLow,
          asianRange: parseFloat(asianRange.toFixed(2)),
          atr: parseFloat(atr.toFixed(2)),
          ...res
        });
      }
    });
  });

  return occurrences;
}

// -------------------------------------------------------------
// PATTERN 2: VOLATILITY SQUEEZE BREAKOUT (NR7 + BB SQUEEZE) (1H)
// -------------------------------------------------------------
function testVolatilitySqueezePattern(candles, atrs) {
  const occurrences = [];
  const bb = computeBollingerBands(candles, 20);

  for (let i = 25; i < candles.length - 15; i++) {
    const atr = atrs[i];
    if (atr === 0) continue;

    // Check NR7 (current bar has narrowest range of last 7 bars)
    const currentRange = candles[i].high - candles[i].low;
    let isNR7 = true;
    for (let j = i - 6; j < i; j++) {
      if (candles[j].high - candles[j].low <= currentRange) {
        isNR7 = false;
        break;
      }
    }

    // Check BB width is in bottom 25% of recent 50 bars
    const recentWidths = bb.slice(i - 40, i + 1).map(b => b.width);
    const sortedWidths = [...recentWidths].sort((a, b) => a - b);
    const p25Width = sortedWidths[Math.floor(sortedWidths.length * 0.25)];
    const isBBCompression = bb[i].width <= p25Width;

    if (isNR7 && isBBCompression) {
      // Look for breakout candle in next 1-2 bars
      const triggerBar = candles[i + 1];
      const prevHigh = Math.max(...candles.slice(i - 3, i + 1).map(b => b.high));
      const prevLow = Math.min(...candles.slice(i - 3, i + 1).map(b => b.low));

      if (triggerBar.close > prevHigh) {
        // Bullish Expansion Breakout
        const entryPrice = triggerBar.close;
        const sl = prevLow - 1.0;
        const tp = entryPrice + (entryPrice - sl) * 2.0;

        const res = evaluateTradeOutcome(candles, i + 1, 'LONG', entryPrice, sl, tp, 20);
        occurrences.push({
          pattern: 'Volatility Squeeze Breakout (Bullish)',
          direction: 'LONG',
          timeframe: '1H',
          date: triggerBar.datetimeStr,
          timeSec: triggerBar.time,
          atr: parseFloat(atr.toFixed(2)),
          bbWidth: parseFloat((bb[i].width * 100).toFixed(3)),
          ...res
        });
        i += 6; // skip ahead to avoid overlapping duplicates
      } else if (triggerBar.close < prevLow) {
        // Bearish Expansion Breakout
        const entryPrice = triggerBar.close;
        const sl = prevHigh + 1.0;
        const tp = entryPrice - (sl - entryPrice) * 2.0;

        const res = evaluateTradeOutcome(candles, i + 1, 'SHORT', entryPrice, sl, tp, 20);
        occurrences.push({
          pattern: 'Volatility Squeeze Breakout (Bearish)',
          direction: 'SHORT',
          timeframe: '1H',
          date: triggerBar.datetimeStr,
          timeSec: triggerBar.time,
          atr: parseFloat(atr.toFixed(2)),
          bbWidth: parseFloat((bb[i].width * 100).toFixed(3)),
          ...res
        });
        i += 6;
      }
    }
  }

  return occurrences;
}

// -------------------------------------------------------------
// PATTERN 3: PREVIOUS DAY HIGH/LOW FAKEOUT REVERSAL (1H)
// -------------------------------------------------------------
function testPDHPDLReversalPattern(candles, atrs) {
  const occurrences = [];

  for (let i = 25; i < candles.length - 15; i++) {
    const c = candles[i];
    const dStr = c.datetimeStr.slice(0, 10);
    const levels = dailyLevels[dStr];
    if (!levels) continue;

    const atr = atrs[i];
    const { pdh, pdl } = levels;

    // Bearish Fakeout of PDH: Price breached PDH by 0.1x to 0.7x ATR, but closed strongly back below PDH
    if (c.high > pdh && c.high <= pdh + atr * 0.7 && c.close < pdh && (c.open - c.close) > (c.high - c.low) * 0.4) {
      const entryPrice = c.close;
      const sl = c.high + 1.5;
      const tp = entryPrice - (sl - entryPrice) * 2.0;

      const res = evaluateTradeOutcome(candles, i, 'SHORT', entryPrice, sl, tp, 24);
      occurrences.push({
        pattern: 'PDH Liquidity Sweep & Reversal',
        direction: 'SHORT',
        timeframe: '1H',
        date: c.datetimeStr,
        timeSec: c.time,
        pdh: parseFloat(pdh.toFixed(2)),
        pdl: parseFloat(pdl.toFixed(2)),
        atr: parseFloat(atr.toFixed(2)),
        ...res
      });
      i += 4;
    }

    // Bullish Fakeout of PDL: Price pierced PDL by 0.1x to 0.7x ATR, but closed strongly back above PDL
    if (c.low < pdl && c.low >= pdl - atr * 0.7 && c.close > pdl && (c.close - c.open) > (c.high - c.low) * 0.4) {
      const entryPrice = c.close;
      const sl = c.low - 1.5;
      const tp = entryPrice + (entryPrice - sl) * 2.0;

      const res = evaluateTradeOutcome(candles, i, 'LONG', entryPrice, sl, tp, 24);
      occurrences.push({
        pattern: 'PDL Liquidity Sweep & Reversal',
        direction: 'LONG',
        timeframe: '1H',
        date: c.datetimeStr,
        timeSec: c.time,
        pdh: parseFloat(pdh.toFixed(2)),
        pdl: parseFloat(pdl.toFixed(2)),
        atr: parseFloat(atr.toFixed(2)),
        ...res
      });
      i += 4;
    }
  }

  return occurrences;
}

// -------------------------------------------------------------
// PATTERN 4: TREND MOMENTUM PULLBACK RE-EXPANSION (1H)
// -------------------------------------------------------------
function testTrendMomentumPullback(candles, atrs) {
  const occurrences = [];
  const ema20 = computeSMA(candles, 20);
  const ema50 = computeEMA(candles, 50);

  for (let i = 50; i < candles.length - 20; i++) {
    const c = candles[i];
    const atr = atrs[i];
    if (atr === 0) continue;

    // Bullish Trend: EMA20 > EMA50, price touched EMA20 and printed a bullish rejection candle
    if (ema20[i] > ema50[i] && ema20[i - 5] > ema50[i - 5]) {
      const touchedEMA = c.low <= ema20[i] && c.close > ema20[i];
      const isBullishCandle = c.close > c.open && (c.close - c.open) >= (c.high - c.low) * 0.5;

      if (touchedEMA && isBullishCandle) {
        const entryPrice = c.close;
        const sl = Math.min(c.low, ema50[i]) - 2.0;
        const tp = entryPrice + (entryPrice - sl) * 2.0;

        const res = evaluateTradeOutcome(candles, i, 'LONG', entryPrice, sl, tp, 24);
        occurrences.push({
          pattern: 'Trend Momentum 20-EMA Pullback (Bullish)',
          direction: 'LONG',
          timeframe: '1H',
          date: c.datetimeStr,
          timeSec: c.time,
          atr: parseFloat(atr.toFixed(2)),
          ema20: parseFloat(ema20[i].toFixed(2)),
          ema50: parseFloat(ema50[i].toFixed(2)),
          ...res
        });
        i += 5;
      }
    }

    // Bearish Trend: EMA20 < EMA50, price rallied to EMA20 and printed a bearish rejection candle
    if (ema20[i] < ema50[i] && ema20[i - 5] < ema50[i - 5]) {
      const touchedEMA = c.high >= ema20[i] && c.close < ema20[i];
      const isBearishCandle = c.close < c.open && (c.open - c.close) >= (c.high - c.low) * 0.5;

      if (touchedEMA && isBearishCandle) {
        const entryPrice = c.close;
        const sl = Math.max(c.high, ema50[i]) + 2.0;
        const tp = entryPrice - (sl - entryPrice) * 2.0;

        const res = evaluateTradeOutcome(candles, i, 'SHORT', entryPrice, sl, tp, 24);
        occurrences.push({
          pattern: 'Trend Momentum 20-EMA Pullback (Bearish)',
          direction: 'SHORT',
          timeframe: '1H',
          date: c.datetimeStr,
          timeSec: c.time,
          atr: parseFloat(atr.toFixed(2)),
          ema20: parseFloat(ema20[i].toFixed(2)),
          ema50: parseFloat(ema50[i].toFixed(2)),
          ...res
        });
        i += 5;
      }
    }
  }

  return occurrences;
}

// -------------------------------------------------------------
// PATTERN 5: 4H FRACTAL PIVOT 1ST-TOUCH BOUNCE (4H)
// -------------------------------------------------------------
function test4HPivotPattern(candles, atrs) {
  const occurrences = [];
  function findPivots(bars, leftBars = 3, rightBars = 3) {
    const pivs = [];
    for (let i = leftBars; i < bars.length - rightBars; i++) {
      let isHigh = true, isLow = true;
      for (let j = i - leftBars; j <= i + rightBars; j++) {
        if (j === i) continue;
        if (bars[j].high >= bars[i].high) isHigh = false;
        if (bars[j].low <= bars[i].low) isLow = false;
      }
      if (isHigh) pivs.push({ type: 'RESISTANCE', price: bars[i].high, idx: i, touched: false });
      if (isLow) pivs.push({ type: 'SUPPORT', price: bars[i].low, idx: i, touched: false });
    }
    return pivs;
  }

  const pivots = findPivots(candles, 3, 3);

  for (let i = 20; i < candles.length - 10; i++) {
    const c = candles[i];
    const active = pivots.filter(p => p.idx < i - 2 && !p.touched && (i - p.idx) <= 120);

    for (const p of active) {
      if (p.type === 'SUPPORT' && c.low <= p.price + 1.5 && c.open > p.price) {
        p.touched = true;
        const entryPrice = p.price + 0.75;
        const sl = entryPrice - 10.0;
        const tp = entryPrice + 25.0; // 1:2.5 R:R

        const res = evaluateTradeOutcome(candles, i, 'LONG', entryPrice, sl, tp, 15);
        occurrences.push({
          pattern: '4H Structural Pivot 1st-Touch (Support)',
          direction: 'LONG',
          timeframe: '4H',
          date: c.datetimeStr,
          timeSec: c.time,
          pivotPrice: parseFloat(p.price.toFixed(2)),
          ...res
        });
        break;
      } else if (p.type === 'RESISTANCE' && c.high >= p.price - 1.5 && c.open < p.price) {
        p.touched = true;
        const entryPrice = p.price - 0.75;
        const sl = entryPrice + 10.0;
        const tp = entryPrice - 25.0;

        const res = evaluateTradeOutcome(candles, i, 'SHORT', entryPrice, sl, tp, 15);
        occurrences.push({
          pattern: '4H Structural Pivot 1st-Touch (Resistance)',
          direction: 'SHORT',
          timeframe: '4H',
          date: c.datetimeStr,
          timeSec: c.time,
          pivotPrice: parseFloat(p.price.toFixed(2)),
          ...res
        });
        break;
      }
    }
  }

  return occurrences;
}

// Run All Pattern Tests
const p1Occurrences = testAsianSweepPattern(candles1h, atr1h);
const p2Occurrences = testVolatilitySqueezePattern(candles1h, atr1h);
const p3Occurrences = testPDHPDLReversalPattern(candles1h, atr1h);
const p4Occurrences = testTrendMomentumPullback(candles1h, atr1h);
const p5Occurrences = test4HPivotPattern(candles4h, atr4h);

const allPatterns = [
  { name: 'Asian Session Liquidity Sweep', occurrences: p1Occurrences },
  { name: 'Volatility Squeeze Breakout (NR7 + BB)', occurrences: p2Occurrences },
  { name: 'PDH / PDL Fakeout Reversal', occurrences: p3Occurrences },
  { name: 'Trend Momentum EMA Pullback', occurrences: p4Occurrences },
  { name: '4H Structural Pivot 1st-Touch', occurrences: p5Occurrences }
];

// Calculate Quantitative Metrics
const patternReports = allPatterns.map(p => {
  const occ = p.occurrences;
  const wins = occ.filter(o => o.outcome === 'WIN');
  const losses = occ.filter(o => o.outcome === 'LOSS');
  const winRate = occ.length > 0 ? (wins.length / occ.length) * 100 : 0;

  const totalR = occ.reduce((sum, o) => sum + o.rMultiple, 0);
  const avgR = occ.length > 0 ? totalR / occ.length : 0;
  const grossProfitR = wins.reduce((sum, o) => sum + o.rMultiple, 0);
  const grossLossR = Math.abs(losses.reduce((sum, o) => sum + o.rMultiple, 0));
  const profitFactor = grossLossR > 0 ? grossProfitR / grossLossR : 99.0;

  const avgMFE_R = occ.length > 0 ? occ.reduce((sum, o) => sum + o.mfeR, 0) / occ.length : 0;
  const avgMAE_R = occ.length > 0 ? occ.reduce((sum, o) => sum + o.maeR, 0) / occ.length : 0;
  const avgHoldingBars = occ.length > 0 ? occ.reduce((sum, o) => sum + o.barsHeld, 0) / occ.length : 0;

  // Statistical Edge vs Random 50% baseline (at 1:2 R:R, breakeven win rate is 33.3%)
  const expectedValuePerTrade = (winRate / 100) * 2.0 - ((100 - winRate) / 100) * 1.0;

  return {
    name: p.name,
    totalOccurrences: occ.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: parseFloat(winRate.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    expectedValueR: parseFloat(expectedValuePerTrade.toFixed(2)),
    avgMFE_R: parseFloat(avgMFE_R.toFixed(2)),
    avgMAE_R: parseFloat(avgMAE_R.toFixed(2)),
    avgHoldingBars: parseFloat(avgHoldingBars.toFixed(1)),
    totalR: parseFloat(totalR.toFixed(2)),
    occurrences: occ
  };
});

patternReports.sort((a, b) => b.expectedValueR - a.expectedValueR);

console.log(`\n=======================================================================`);
console.log(`🏆 RANKED QUANTITATIVE PATTERNS (By Expected Value per Trade):`);
patternReports.forEach((pr, idx) => {
  console.log(`\n#${idx + 1} Pattern: ${pr.name}`);
  console.log(`   • Sample Size (N):     ${pr.totalOccurrences} occurrences over 6 Months`);
  console.log(`   • Win Rate:            ${pr.winRatePct}% (${pr.wins} Wins / ${pr.losses} Losses)`);
  console.log(`   • Expected Value (EV): +${pr.expectedValueR} R per trade`);
  console.log(`   • Profit Factor:       ${pr.profitFactor}`);
  console.log(`   • Avg MFE / MAE:       ${pr.avgMFE_R} R / ${pr.avgMAE_R} R`);
  console.log(`   • Avg Duration:        ${pr.avgHoldingBars} bars`);
});

// Save complete quantitative analysis data
const quantResearchData = {
  metadata: {
    symbol: 'OANDA:XAUUSD (Gold / US Dollar)',
    period: 'Feb 16, 2026 – Aug 19, 2026 (6 Months)',
    total1HBars: candles1h.length,
    total4HBars: candles4h.length,
    totalDailyBars: candlesDaily.length,
    timezone: 'UTC & Asia/Kolkata (IST)'
  },
  movementStats: {
    stats1h,
    stats4h
  },
  patternReports: patternReports
};

fs.writeFileSync(path.join(__dirname, 'xauusd_quant_research_data.json'), JSON.stringify(quantResearchData, null, 2));
console.log(`\n✅ Saved comprehensive statistical analysis to xauusd_quant_research_data.json!`);
