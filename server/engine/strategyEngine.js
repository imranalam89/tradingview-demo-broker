const EventEmitter = require('events');
const db = require('../db/database');
const priceFeed = require('./priceFeed');
const tradingEngine = require('./tradingEngine');

// Technical Indicator Calculation Helpers
function calculateEMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateATR(candles, period = 5) {
  if (candles.length < period) return 2.0;
  let trSum = 0;
  const trs = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  if (trs.length < period) return 2.0;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

class StrategyEngine extends EventEmitter {
  constructor() {
    super();
    this.strategies = new Map(); // accountId -> strategyConfig
    this.candles15m = new Map(); // symbol -> Array of { open, high, low, close, time }
    this.currentBar15m = new Map(); // symbol -> active forming bar
    this.dailyTradeCounts = new Map(); // accountId_YYYYMMDD -> count
    this.isInitialized = false;

    // Register XAU 15M IND2 native autonomous strategy
    this.registerDefaultStrategies();
  }

  registerDefaultStrategies() {
    // 1. Exact Settings from User Screenshots for XAU 15M IND2 (Account: demo_f589a3)
    this.addStrategy('demo_f589a3', {
      name: 'Apex Scalper PRO Auto [XAU 15M]',
      symbol: 'XAUUSD',
      timeframeMs: 15 * 60 * 1000, // 15 Minutes
      enabled: true,
      
      // Trend & EMAs
      fastEmaLen: 19,
      slowEmaLen: 24,
      baseEmaLen: 120,
      slopeLookback: 5,
      requireSlope: true,

      // RSI Filters
      rsiLen: 14,
      rsiBullMin: 54,
      rsiBullMax: 72,
      rsiBearMin: 30,
      rsiBearMax: 50,

      // Session & Day Caps (UTC 06:00 to 18:30)
      useSessionFilter: true,
      sessionStartHour: 6,
      sessionStartMin: 0,
      sessionEndHour: 18,
      sessionEndMin: 30,
      maxDailyTrades: 6,
      tradeDirection: 'Both', // 'Both', 'Long Only', 'Short Only'

      // Risk & Position Sizing
      riskMode: 'Percent of Equity',
      riskPct: 2.0, // 2% Risk
      atrLen: 5,
      slAtrMult: 1.6,
      minSlDist: 2.0,
      rrRatio: 1.8, // 1:1.8 R:R

      // Trailing / Breakeven
      enableBE: true, // Enabled
      beTriggerR: 0.6, // Snap to Breakeven at +0.6R
      beOffsetAtr: 0.25 // +0.25x ATR Fee Buffer
    });

    // Also link demo_001 as fallback
    this.addStrategy('demo_001', {
      ...this.getStrategy('demo_f589a3'),
      name: 'Apex Scalper PRO Auto [demo_001]'
    });
  }

  addStrategy(accountId, config) {
    this.strategies.set(accountId, config);
    console.log(`🤖 Registered native strategy for account [${accountId}]: ${config.name}`);
  }

  getStrategy(accountId) {
    return this.strategies.get(accountId);
  }

  start() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log('⚡ Starting 24/7 Autonomous Strategy Engine...');
    this.bootstrapCandles('XAUUSD');

    // Hook into live real-time price feed
    priceFeed.on('price', ({ symbol, price, timestamp }) => {
      this.handlePriceTick(symbol, price, timestamp);
    });
  }

  // Generate synthetic / baseline 15m candle history if starting fresh
  bootstrapCandles(symbol) {
    const now = Date.now();
    const currentPrice = priceFeed.getPrice(symbol) || 2915.0;
    const history = [];

    // Create 150 baseline 15m bars to seed EMAs (120 baseline) and RSI(14)
    let p = currentPrice - 8.0;
    for (let i = 150; i >= 1; i--) {
      const barTime = now - (i * 15 * 60 * 1000);
      const volatility = 0.5 + Math.random() * 1.5;
      const change = (Math.random() - 0.49) * 2.0;
      p += change;
      history.push({
        open: p,
        high: p + volatility,
        low: p - volatility,
        close: p + change * 0.5,
        time: barTime
      });
    }

    this.candles15m.set(symbol, history);
    console.log(`📊 Initialized ${history.length} 15-minute bars for ${symbol}`);
  }

  // Handle incoming live price ticks and update 15m bar
  handlePriceTick(symbol, price, timestamp = Date.now()) {
    const sym = symbol.toUpperCase().replace('/', '').replace('.', '').trim();
    if (sym !== 'XAUUSD' && sym !== 'GOLD' && sym !== 'PAXGUSDT') return;

    let candles = this.candles15m.get('XAUUSD');
    if (!candles) {
      this.bootstrapCandles('XAUUSD');
      candles = this.candles15m.get('XAUUSD');
    }

    const barDuration = 15 * 60 * 1000;
    const currentBarStart = Math.floor(timestamp / barDuration) * barDuration;

    let currentBar = this.currentBar15m.get('XAUUSD');

    if (!currentBar || currentBar.time !== currentBarStart) {
      // Previous bar closed!
      if (currentBar) {
        candles.push({ ...currentBar });
        if (candles.length > 300) candles.shift();

        // 🎯 Evaluate strategy triggers on completed candle close!
        this.evaluateStrategiesOnBarClose('XAUUSD', currentBar);
      }

      // Start new forming bar
      currentBar = {
        open: price,
        high: price,
        low: price,
        close: price,
        time: currentBarStart
      };
      this.currentBar15m.set('XAUUSD', currentBar);
    } else {
      // Update forming bar extremes
      if (price > currentBar.high) currentBar.high = price;
      if (price < currentBar.low) currentBar.low = price;
      currentBar.close = price;
    }

    // Dynamic Breakeven Snap Check
    this.checkBreakevenTriggers('XAUUSD', price);
  }

  // Check and snap Stop Loss to Breakeven when trade reaches +0.6R
  checkBreakevenTriggers(symbol, currentPrice) {
    for (const [accId, cfg] of this.strategies.entries()) {
      if (!cfg.enabled || !cfg.enableBE || cfg.symbol !== symbol) continue;

      try {
        const openPositions = db.prepare('SELECT * FROM positions WHERE account_id = ? AND symbol = ? AND status = \'OPEN\'').all(accId, symbol);
        for (const pos of openPositions) {
          const initialRisk = Math.abs(pos.entry_price - (pos.stop_loss || (pos.entry_price - 5.0)));
          if (initialRisk <= 0) continue;

          const candles = this.candles15m.get(symbol) || [];
          const atrVal = calculateATR(candles, cfg.atrLen);
          const buffer = atrVal * (cfg.beOffsetAtr || 0.25);

          if (pos.side === 'BUY') {
            const triggerPrice = pos.entry_price + (initialRisk * cfg.beTriggerR);
            if (currentPrice >= triggerPrice && pos.stop_loss < pos.entry_price) {
              const newSL = parseFloat((pos.entry_price + buffer).toFixed(2));
              db.prepare('UPDATE positions SET stop_loss = ?, updated_at = ? WHERE id = ?').run(newSL, new Date().toISOString(), pos.id);
              console.log(`🔒 [BREAKEVEN LOCKED] ${pos.symbol} Long SL moved to $${newSL} (+${cfg.beTriggerR}R reached)`);
            }
          } else if (pos.side === 'SELL') {
            const triggerPrice = pos.entry_price - (initialRisk * cfg.beTriggerR);
            if (currentPrice <= triggerPrice && pos.stop_loss > pos.entry_price) {
              const newSL = parseFloat((pos.entry_price - buffer).toFixed(2));
              db.prepare('UPDATE positions SET stop_loss = ?, updated_at = ? WHERE id = ?').run(newSL, new Date().toISOString(), pos.id);
              console.log(`🔒 [BREAKEVEN LOCKED] ${pos.symbol} Short SL moved to $${newSL} (+${cfg.beTriggerR}R reached)`);
            }
          }
        }
      } catch (err) {
        // Suppress transient query errors during table reload
      }
    }
  }

  // Evaluate strategy conditions when a 15m candle closes
  evaluateStrategiesOnBarClose(symbol, closedBar) {
    const candles = this.candles15m.get(symbol);
    if (!candles || candles.length < 125) return;

    const closes = candles.map(c => c.close);
    const close = closedBar.close;
    const low = closedBar.low;
    const high = closedBar.high;
    const prevClose = candles[candles.length - 2].close;

    // Check each registered account strategy
    for (const [accId, cfg] of this.strategies.entries()) {
      if (!cfg.enabled || cfg.symbol !== symbol) continue;

      // 1. Check if Account exists in DB
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accId);
      if (!account || !account.is_active) continue;

      // 2. Check if already in position
      const openPos = db.prepare('SELECT * FROM positions WHERE account_id = ? AND symbol = ? AND status = "OPEN"').get(accId, symbol);
      if (openPos) continue;

      // 3. Daily Trade Cap Check
      const todayStr = new Date().toISOString().slice(0, 10);
      const dayKey = `${accId}_${todayStr}`;
      const dailyCount = this.dailyTradeCounts.get(dayKey) || 0;
      if (dailyCount >= cfg.maxDailyTrades) continue;

      // 4. Session Timezone Filter (06:00 to 18:30 UTC)
      if (cfg.useSessionFilter) {
        const nowUTC = new Date();
        const curMinutes = nowUTC.getUTCHours() * 60 + nowUTC.getUTCMinutes();
        const startMinutes = cfg.sessionStartHour * 60 + cfg.sessionStartMin;
        const endMinutes = cfg.sessionEndHour * 60 + cfg.sessionEndMin;

        if (curMinutes < startMinutes || curMinutes > endMinutes) {
          continue; // Outside Killzone session
        }
      }

      // 5. Technical Indicators
      const emaFast = calculateEMA(closes, cfg.fastEmaLen); // EMA 19
      const emaSlow = calculateEMA(closes, cfg.slowEmaLen); // EMA 24
      const emaBase = calculateEMA(closes, cfg.baseEmaLen); // EMA 120
      const rsiVal = calculateRSI(closes, cfg.rsiLen);      // RSI 14
      const atrVal = calculateATR(candles, cfg.atrLen);     // ATR 5

      // Macro Trend Slope
      const slopeLookback = cfg.slopeLookback || 5;
      const prevEmaBase = calculateEMA(closes.slice(0, -slopeLookback), cfg.baseEmaLen);
      const slopeBull = !cfg.requireSlope || (emaBase >= prevEmaBase);
      const slopeBear = !cfg.requireSlope || (emaBase <= prevEmaBase);

      const bullTrend = (close > emaBase) && (emaSlow > emaBase) && slopeBull;
      const bearTrend = (close < emaBase) && (emaSlow < emaBase) && slopeBear;

      // Fast momentum cross or pullback rejection
      const prevEmaFast = calculateEMA(closes.slice(0, -1), cfg.fastEmaLen);
      const prevEmaSlow = calculateEMA(closes.slice(0, -1), cfg.slowEmaLen);

      const longCross = (prevEmaFast <= prevEmaSlow && emaFast > emaSlow) || (low <= emaFast && close > emaFast && prevClose <= prevEmaFast);
      const shortCross = (prevEmaFast >= prevEmaSlow && emaFast < emaSlow) || (high >= emaFast && close < emaFast && prevClose >= prevEmaFast);

      const longCondition = bullTrend && longCross && (rsiVal >= cfg.rsiBullMin && rsiVal <= cfg.rsiBullMax) && (cfg.tradeDirection === 'Both' || cfg.tradeDirection === 'Long Only');
      const shortCondition = bearTrend && shortCross && (rsiVal <= cfg.rsiBearMax && rsiVal >= cfg.rsiBearMin) && (cfg.tradeDirection === 'Both' || cfg.tradeDirection === 'Short Only');

      // 6. Execute Long Entry
      if (longCondition) {
        const slDistance = Math.max(atrVal * cfg.slAtrMult, cfg.minSlDist);
        const stopLoss = parseFloat((close - slDistance).toFixed(2));
        const takeProfit = parseFloat((close + (slDistance * cfg.rrRatio)).toFixed(2));

        // Position size for 2% risk
        const dollarsToRisk = account.balance * (cfg.riskPct / 100.0);
        const quantity = Math.max(0.01, parseFloat((dollarsToRisk / slDistance).toFixed(2)));

        console.log(`🔥 [AUTO-STRATEGY] Triggered 15M BUY for ${account.name} | Close: $${close} | SL: $${stopLoss} | TP: $${takeProfit} | Qty: ${quantity}`);

        try {
          tradingEngine.openPosition({
            accountId: accId,
            symbol: symbol,
            action: 'BUY',
            quantity: quantity,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            trailingStopDistance: null,
            strategy: cfg.name,
            signalTime: new Date().toISOString(),
            price: close
          });

          this.dailyTradeCounts.set(dayKey, dailyCount + 1);
        } catch (e) {
          console.error(`Failed to execute auto buy for ${accId}:`, e.message);
        }
      }

      // 7. Execute Short Entry
      if (shortCondition) {
        const slDistance = Math.max(atrVal * cfg.slAtrMult, cfg.minSlDist);
        const stopLoss = parseFloat((close + slDistance).toFixed(2));
        const takeProfit = parseFloat((close - (slDistance * cfg.rrRatio)).toFixed(2));

        const dollarsToRisk = account.balance * (cfg.riskPct / 100.0);
        const quantity = Math.max(0.01, parseFloat((dollarsToRisk / slDistance).toFixed(2)));

        console.log(`🔥 [AUTO-STRATEGY] Triggered 15M SELL for ${account.name} | Close: $${close} | SL: $${stopLoss} | TP: $${takeProfit} | Qty: ${quantity}`);

        try {
          tradingEngine.openPosition({
            accountId: accId,
            symbol: symbol,
            action: 'SELL',
            quantity: quantity,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            trailingStopDistance: null,
            strategy: cfg.name,
            signalTime: new Date().toISOString(),
            price: close
          });

          this.dailyTradeCounts.set(dayKey, dailyCount + 1);
        } catch (e) {
          console.error(`Failed to execute auto sell for ${accId}:`, e.message);
        }
      }
    }
  }
}

const strategyEngine = new StrategyEngine();

module.exports = strategyEngine;
