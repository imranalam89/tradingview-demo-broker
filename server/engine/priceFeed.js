const WebSocket = require('ws');
const https = require('https');
const EventEmitter = require('events');

class PriceFeedManager extends EventEmitter {
  constructor() {
    super();
    this.prices = new Map(); // Symbol -> { price, timestamp, high24h, low24h, change24h }
    this.ws = null;
    this.reconnectTimer = null;
    this.restPollTimer = null;
    this.subscribers = new Set();
    this.isInitialized = false;

    // Default price benchmarks to ensure immediate availability
    this.setInitialPrices();
  }

  setInitialPrices() {
    const defaults = {
      'BTCUSDT': 96250.00,
      'ETHUSDT': 2780.50,
      'SOLUSDT': 195.40,
      'BNBUSDT': 640.20,
      'XAUUSD': 2915.50,
      'GOLD': 2915.50,
      'XAGUSD': 32.80,
      'EURUSD': 1.0485,
      'GBPUSD': 1.2590,
      'USDJPY': 152.30,
      'SPY': 595.20,
      'QQQ': 510.40,
      'US30': 43800.00,
      'NAS100': 21250.00
    };

    const now = Date.now();
    for (const [sym, p] of Object.entries(defaults)) {
      this.prices.set(sym.toUpperCase(), {
        price: p,
        timestamp: now,
        high24h: p * 1.015,
        low24h: p * 0.985,
        change24h: 0.5
      });
    }
  }

  start() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    console.log('📡 Starting Real-Time Price Feeds...');
    this.connectBinanceWS();
    this.startForexAndCommodityPolling();
  }

  // Connect to Binance Live WebSocket for 24/7 Crypto Price Stream
  connectBinanceWS() {
    try {
      if (this.ws) {
        try { this.ws.terminate(); } catch (e) {}
      }

      // Stream miniTickers for all USDT pairs
      const wsUrl = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('✅ Connected to Binance Real-Time WebSocket Feed');
      });

      this.ws.on('message', (data) => {
        try {
          const tickers = JSON.parse(data.toString());
          if (Array.isArray(tickers)) {
            const now = Date.now();
            for (const ticker of tickers) {
              const symbol = ticker.s.toUpperCase();
              const price = parseFloat(ticker.c);
              const high24h = parseFloat(ticker.h);
              const low24h = parseFloat(ticker.l);

              if (!isNaN(price) && price > 0) {
                const prev = this.prices.get(symbol);
                const prevPrice = prev ? prev.price : price;

                this.prices.set(symbol, {
                  price,
                  timestamp: now,
                  high24h: isNaN(high24h) ? price : high24h,
                  low24h: isNaN(low24h) ? price : low24h,
                  change24h: prev ? ((price - prevPrice) / prevPrice) * 100 : 0
                });

                // If this is PAXGUSDT (Gold backed crypto), keep XAUUSD updated in real-time
                if (symbol === 'PAXGUSDT') {
                  this.prices.set('XAUUSD', {
                    price,
                    timestamp: now,
                    high24h,
                    low24h,
                    change24h: 0.2
                  });
                  this.prices.set('GOLD', {
                    price,
                    timestamp: now,
                    high24h,
                    low24h,
                    change24h: 0.2
                  });
                  this.emit('price', { symbol: 'XAUUSD', price, timestamp: now });
                }

                this.emit('price', { symbol, price, timestamp: now });
              }
            }
          }
        } catch (err) {
          // Ignore JSON parse blip
        }
      });

      this.ws.on('error', (err) => {
        console.warn('⚠️ Binance WS warning:', err.message);
      });

      this.ws.on('close', () => {
        console.log('🔄 Binance WS closed, reconnecting in 5s...');
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connectBinanceWS(), 5000);
      });

    } catch (e) {
      console.error('Failed to init Binance WS:', e.message);
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connectBinanceWS(), 10000);
    }
  }

  // Periodic fetch for Forex & Metals (Gold, Silver, EURUSD, etc.)
  startForexAndCommodityPolling() {
    const poll = async () => {
      try {
        await this.fetchPublicForexRates();
      } catch (err) {
        // Silently continue
      }
    };

    poll();
    // Poll every 15 seconds for traditional forex/commodity market updates
    this.restPollTimer = setInterval(poll, 15000);
  }

  fetchPublicForexRates() {
    return new Promise((resolve) => {
      // Free public rates endpoint from exchangerate-api or frankfurter for FX
      const url = 'https://api.frankfurter.dev/v1/latest?base=USD';
      
      const req = https.get(url, { timeout: 6000 }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const data = JSON.parse(raw);
              if (data && data.rates) {
                const now = Date.now();
                if (data.rates.EUR) {
                  const eurusd = parseFloat((1 / data.rates.EUR).toFixed(5));
                  this.updatePrice('EURUSD', eurusd);
                }
                if (data.rates.GBP) {
                  const gbpusd = parseFloat((1 / data.rates.GBP).toFixed(5));
                  this.updatePrice('GBPUSD', gbpusd);
                }
                if (data.rates.JPY) {
                  const usdjpy = parseFloat((data.rates.JPY).toFixed(3));
                  this.updatePrice('USDJPY', usdjpy);
                }
                if (data.rates.AUD) {
                  const audusd = parseFloat((1 / data.rates.AUD).toFixed(5));
                  this.updatePrice('AUDUSD', audusd);
                }
              }
            }
          } catch (e) {}
          resolve();
        });
      });

      req.on('error', () => resolve());
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
    });
  }

  updatePrice(symbol, price) {
    const sym = symbol.toUpperCase();
    const now = Date.now();
    const prev = this.prices.get(sym);
    const prevPrice = prev ? prev.price : price;
    
    this.prices.set(sym, {
      price,
      timestamp: now,
      high24h: prev ? Math.max(prev.high24h, price) : price * 1.01,
      low24h: prev ? Math.min(prev.low24h, price) : price * 0.99,
      change24h: prev ? ((price - prevPrice) / prevPrice) * 100 : 0
    });

    this.emit('price', { symbol: sym, price, timestamp: now });
  }

  getPrice(symbol) {
    if (!symbol) return null;
    let sym = symbol.toUpperCase().trim();
    // Normalize formats: e.g. BINANCE:BTCUSDT -> BTCUSDT, FX:XAUUSD -> XAUUSD
    if (sym.includes(':')) {
      sym = sym.split(':')[1];
    }
    sym = sym.replace('/', '').replace('.', '');

    const data = this.prices.get(sym);
    return data ? data.price : null;
  }

  getPriceData(symbol) {
    if (!symbol) return null;
    let sym = symbol.toUpperCase().trim();
    if (sym.includes(':')) {
      sym = sym.split(':')[1];
    }
    sym = sym.replace('/', '').replace('.', '');
    return this.prices.get(sym) || null;
  }

  getAllPrices() {
    const result = {};
    for (const [sym, data] of this.prices.entries()) {
      result[sym] = data;
    }
    return result;
  }

  stop() {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.restPollTimer) clearInterval(this.restPollTimer);
    this.isInitialized = false;
  }
}

const priceFeed = new PriceFeedManager();

module.exports = priceFeed;
