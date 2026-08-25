const fs = require('fs');
const path = require('path');

console.log('Generating comprehensive terminal_data.js...');

function processCandles(data, isRaw5m = false) {
  if (isRaw5m) {
    return data.map(c => {
      const dt = new Date(c.date + 'T' + (c.time.length === 5 ? c.time + ':00Z' : c.time + 'Z'));
      const ts = Math.floor(dt.getTime() / 1000);
      return {
        time: ts,
        open: Math.round(Number(c.open) * 100) / 100,
        high: Math.round(Number(c.high) * 100) / 100,
        low: Math.round(Number(c.low) * 100) / 100,
        close: Math.round(Number(c.close) * 100) / 100,
        volume: Number(c.volume || 0),
        datetimeStr: c.date + ' ' + c.time
      };
    }).filter(c => !isNaN(c.time) && c.open > 0).sort((a, b) => a.time - b.time);
  }
  return data.map(c => ({
    time: c.time,
    open: Math.round(Number(c.open) * 100) / 100,
    high: Math.round(Number(c.high) * 100) / 100,
    low: Math.round(Number(c.low) * 100) / 100,
    close: Math.round(Number(c.close) * 100) / 100,
    volume: Number(c.volume || 0),
    datetimeStr: c.datetimeStr || new Date(c.time * 1000).toISOString().replace('T', ' ').substring(0, 16)
  })).filter(c => !isNaN(c.time) && c.open > 0).sort((a, b) => a.time - b.time);
}

// 1. XAUUSD 5m
let xau5m = [];
if (fs.existsSync('XAUUSD_5m_OHLC_12Months_2025_2026.json')) {
  const raw = JSON.parse(fs.readFileSync('XAUUSD_5m_OHLC_12Months_2025_2026.json'));
  xau5m = processCandles(raw, true);
}

// 2. XAUUSD 15m
let xau15m = [];
if (fs.existsSync('xauusd_15m.json')) {
  xau15m = processCandles(JSON.parse(fs.readFileSync('xauusd_15m.json')));
}

// 3. XAUUSD 1h (Merged 12 Months + TradingView)
const map1h = new Map();
if (fs.existsSync('XAUUSD_1Hour_OHLC_12Months_2025_2026.json')) {
  const h1_raw1 = JSON.parse(fs.readFileSync('XAUUSD_1Hour_OHLC_12Months_2025_2026.json'));
  h1_raw1.forEach(c => {
    const dt = new Date(c.isoTime || (c.date + 'T' + (c.time.length === 5 ? c.time + ':00Z' : c.time + 'Z')));
    const ts = Math.floor(dt.getTime() / 1000);
    if (!isNaN(ts) && c.open > 0) {
      map1h.set(ts, {
        time: ts,
        open: Math.round(Number(c.open) * 100) / 100,
        high: Math.round(Number(c.high) * 100) / 100,
        low: Math.round(Number(c.low) * 100) / 100,
        close: Math.round(Number(c.close) * 100) / 100,
        volume: Number(c.volume || 0),
        datetimeStr: c.date + ' ' + c.time
      });
    }
  });
}
if (fs.existsSync('xauusd_1h.json')) {
  const h1_raw2 = JSON.parse(fs.readFileSync('xauusd_1h.json'));
  h1_raw2.forEach(c => {
    if (c.time && c.open > 0) {
      map1h.set(c.time, {
        time: c.time,
        open: Math.round(Number(c.open) * 100) / 100,
        high: Math.round(Number(c.high) * 100) / 100,
        low: Math.round(Number(c.low) * 100) / 100,
        close: Math.round(Number(c.close) * 100) / 100,
        volume: Number(c.volume || 0),
        datetimeStr: c.datetimeStr || new Date(c.time * 1000).toISOString().replace('T', ' ').substring(0, 16)
      });
    }
  });
}
const xau1h = Array.from(map1h.values()).sort((a, b) => a.time - b.time);

// 4. XAUUSD 4h
let xau4h = [];
if (fs.existsSync('xauusd_4h.json')) {
  xau4h = processCandles(JSON.parse(fs.readFileSync('xauusd_4h.json')));
}

// 5. XAUUSD Daily
let xaudaily = [];
if (fs.existsSync('xauusd_daily.json')) {
  xaudaily = processCandles(JSON.parse(fs.readFileSync('xauusd_daily.json')));
}

// 6. EURUSD 4h
let eurusd4h = [];
if (fs.existsSync('tradingview_live_eurusd_4h.json')) {
  eurusd4h = processCandles(JSON.parse(fs.readFileSync('tradingview_live_eurusd_4h.json')));
}

// 7. XAGUSD 4h
let xagusd4h = [];
if (fs.existsSync('tradingview_live_xagusd_4h.json')) {
  xagusd4h = processCandles(JSON.parse(fs.readFileSync('tradingview_live_xagusd_4h.json')));
}

const terminalData = {
  XAUUSD: {
    name: 'Gold vs US Dollar (XAU/USD)',
    symbol: 'XAUUSD',
    pointSize: 0.01,
    contractSize: 100,
    defaultSpread: 0.25,
    defaultCommission: 7,
    timeframes: {
      '5m': xau5m,
      '15m': xau15m,
      '1h': xau1h,
      '4h': xau4h,
      '1d': xaudaily
    }
  },
  XAGUSD: {
    name: 'Silver vs US Dollar (XAG/USD)',
    symbol: 'XAGUSD',
    pointSize: 0.001,
    contractSize: 5000,
    defaultSpread: 0.02,
    defaultCommission: 7,
    timeframes: {
      '4h': xagusd4h
    }
  },
  EURUSD: {
    name: 'Euro vs US Dollar (EUR/USD)',
    symbol: 'EURUSD',
    pointSize: 0.0001,
    contractSize: 100000,
    defaultSpread: 0.00015,
    defaultCommission: 7,
    timeframes: {
      '4h': eurusd4h
    }
  }
};

const jsContent = `/**
 * APEX PRO TERMINAL - Historical Market Datasets
 * Auto-generated on ${new Date().toISOString()}
 * High-precision OHLCV historical feeds for replay & backtesting.
 */
(function() {
  const root = typeof window !== 'undefined' ? window : global;
  root.TERMINAL_HISTORICAL_DATA = ${JSON.stringify(terminalData)};
})();
`;

fs.writeFileSync('terminal_data.js', jsContent);
console.log('Successfully generated terminal_data.js! Size:', (fs.statSync('terminal_data.js').size / (1024 * 1024)).toFixed(2), 'MB');
