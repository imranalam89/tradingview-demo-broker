const express = require('express');
const router = express.Router();
const db = require('../db/database');
const tradingEngine = require('../engine/tradingEngine');
const priceFeed = require('../engine/priceFeed');

// GET /api/positions - Get active positions
router.get('/', (req, res) => {
  try {
    const { account_id } = req.query;
    let query = 'SELECT p.*, a.name as account_name FROM positions p JOIN accounts a ON p.account_id = a.id WHERE p.status = \'OPEN\'';
    const params = [];

    if (account_id) {
      query += ' AND p.account_id = ?';
      params.push(account_id);
    }
    query += ' ORDER BY p.opened_at DESC';

    const positions = db.prepare(query).all(...params);

    // Attach latest live price if available
    const enriched = positions.map(pos => {
      const liveData = priceFeed.getPriceData(pos.symbol);
      const markPrice = liveData ? liveData.price : pos.current_price;
      
      let unrealizedPnl = pos.unrealized_pnl;
      if (pos.side === 'BUY') {
        unrealizedPnl = (markPrice - pos.entry_price) * pos.quantity;
      } else {
        unrealizedPnl = (pos.entry_price - markPrice) * pos.quantity;
      }

      const roiPercent = (unrealizedPnl / pos.margin_used) * 100;

      return {
        ...pos,
        mark_price: markPrice,
        unrealized_pnl: parseFloat(unrealizedPnl.toFixed(2)),
        roi_percent: parseFloat(roiPercent.toFixed(2))
      };
    });

    res.json({ success: true, positions: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/positions/close/:id - Close position manually
router.post('/close/:id', (req, res) => {
  try {
    const { id } = req.params;
    const closedTrade = tradingEngine.closePosition(id, 'MANUAL_CLOSE');
    res.json({ success: true, message: 'Position closed successfully', trade: closedTrade });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/positions/close-all - Close all positions
router.post('/close-all', (req, res) => {
  try {
    const { account_id, symbol } = req.body;
    if (!account_id) {
      return res.status(400).json({ success: false, error: 'account_id is required to close all positions' });
    }

    const closedTrades = tradingEngine.closeAllPositions(account_id, symbol || null, 'MANUAL_CLOSE_ALL');
    res.json({ success: true, message: `Closed ${closedTrades.length} positions`, trades: closedTrades });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/positions/:id - Modify SL/TP/Trailing Stop
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { stopLoss, takeProfit, trailingStopDistance } = req.body;

    const updated = tradingEngine.updatePositionRisk(id, {
      stopLoss,
      takeProfit,
      trailingStopDistance
    });

    res.json({ success: true, position: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
