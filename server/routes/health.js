const express = require('express');
const router = express.Router();
const priceFeed = require('../engine/priceFeed');
const db = require('../db/database');

const startTime = Date.now();

// GET /api/health - Keep-alive and system status endpoint
router.get('/', (req, res) => {
  try {
    const totalAccounts = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
    const openPositions = db.prepare('SELECT COUNT(*) as c FROM positions WHERE status = \'OPEN\'').get().c;
    const totalTrades = db.prepare('SELECT COUNT(*) as c FROM trades').get().c;
    const pricesTracked = priceFeed.prices.size;
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    res.json({
      status: 'healthy',
      engine: '24/7 TradingView Demo Broker Engine',
      uptime: `${uptimeSeconds}s`,
      timestamp: new Date().toISOString(),
      metrics: {
        totalAccounts,
        openPositions,
        totalTrades,
        pricesTracked
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
