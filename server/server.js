require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const db = require('./db/database');
const priceFeed = require('./engine/priceFeed');
const tradingEngine = require('./engine/tradingEngine');

const webhookRoutes = require('./routes/webhook');
const accountsRoutes = require('./routes/accounts');
const positionsRoutes = require('./routes/positions');
const tradesRoutes = require('./routes/trades');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (supports Netlify frontend connecting to cloud backend)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret']
}));

// Body parsers: support JSON and text payloads from TradingView
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/plain', 'application/text'] }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/health', healthRoutes);

// Price list endpoint for quick UI price table
app.get('/api/prices', (req, res) => {
  res.json({ success: true, prices: priceFeed.getAllPrices() });
});

// Single Page App fallback for client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket Server for live UI updates
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  // Send immediate initial state
  ws.send(JSON.stringify({
    type: 'INIT',
    data: {
      prices: priceFeed.getAllPrices()
    }
  }));
});

// Listen to trading engine events and broadcast to all connected UI clients
tradingEngine.on('position_opened', (payload) => {
  broadcast('POSITION_OPENED', payload);
});

tradingEngine.on('position_closed', (payload) => {
  broadcast('POSITION_CLOSED', payload);
});

// Throttled price broadcast (every 500ms max to prevent UI stutter)
let pendingPrices = {};
let priceBroadcastTimer = null;

priceFeed.on('price', ({ symbol, price, timestamp }) => {
  pendingPrices[symbol] = { price, timestamp };

  if (!priceBroadcastTimer) {
    priceBroadcastTimer = setTimeout(() => {
      broadcast('PRICE_TICK', pendingPrices);
      pendingPrices = {};
      priceBroadcastTimer = null;
    }, 500);
  }
});

// 24/7 Periodic Background Engine Monitor
// Runs every 5 seconds to evaluate positions, record equity curves, and keep state synced
setInterval(() => {
  try {
    const allPrices = priceFeed.getAllPrices();
    for (const [symbol, data] of Object.entries(allPrices)) {
      tradingEngine.evaluatePositions(symbol, data.price);
    }

    // Record equity snapshot every 30 seconds
    const accounts = db.prepare('SELECT id FROM accounts WHERE is_active = 1').all();
    for (const acc of accounts) {
      tradingEngine.recordEquitySnapshot(acc.id);
    }
  } catch (err) {
    console.error('Background monitor error:', err.message);
  }
}, 5000);

// Start price feeds and listen on port
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 TradingView Demo Broker Engine is running!`);
  console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Webhook Endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`💓 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
  
  priceFeed.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  priceFeed.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
