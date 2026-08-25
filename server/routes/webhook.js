const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const tradingEngine = require('../engine/tradingEngine');

// In-memory cache for duplicate alert suppression (stores hash -> timestamp)
const recentAlerts = new Map();
const DUPLICATE_WINDOW_MS = 3000; // 3 seconds window to prevent double fire

// Cleanup old hashes periodically
setInterval(() => {
  const now = Date.now();
  for (const [hash, time] of recentAlerts.entries()) {
    if (now - time > DUPLICATE_WINDOW_MS * 2) {
      recentAlerts.delete(hash);
    }
  }
}, 10000);

// Helper to parse unstructured text payload from TradingView into structured object
function parseFlexiblePayload(reqBody) {
  if (typeof reqBody === 'object' && reqBody !== null) {
    // If it's already an object, normalize field names
    const data = { ...reqBody };
    
    // Check if account_id or account is provided
    data.accountId = data.account_id || data.accountId || data.account || 'demo_001';
    data.symbol = data.symbol || data.ticker || data.pair || '';
    data.action = (data.action || data.order_action || data.signal || data.side || '').toUpperCase();
    data.quantity = data.quantity || data.qty || data.size || data.contracts || data.order_contracts || null;
    data.amountInDollars = data.amount || data.usd_amount || data.dollars || null;
    data.percentageOfBalance = data.percentage || data.percent || data.pct || null;
    data.stopLoss = data.stop_loss || data.stopLoss || data.sl || null;
    data.takeProfit = data.take_profit || data.takeProfit || data.tp || null;
    data.trailingStopDistance = data.trailing_stop || data.trailingStop || data.trailing_distance || data.ts || null;
    data.strategy = data.strategy || data.strategy_name || data.indicator || 'TradingView Alert';
    data.signalTime = data.signal_time || data.time || data.timestamp || new Date().toISOString();
    data.secret = data.secret || data.token || data.key || null;
    data.price = data.price || data.close || data.open || null;

    return data;
  }

  // If payload sent as raw string (e.g. "BUY BTCUSDT qty=0.01 sl=95000 tp=98000")
  if (typeof reqBody === 'string') {
    const raw = reqBody.trim();
    try {
      const parsed = JSON.parse(raw);
      return parseFlexiblePayload(parsed);
    } catch (e) {
      // Regex parsing for text alert format
      const tokens = raw.split(/\s+/);
      const action = (tokens[0] || 'BUY').toUpperCase();
      const symbol = tokens[1] || 'BTCUSDT';
      const qtyMatch = raw.match(/(?:qty|quantity|size)=([0-9.]+)/i);
      const slMatch = raw.match(/(?:sl|stop_loss)=([0-9.]+)/i);
      const tpMatch = raw.match(/(?:tp|take_profit)=([0-9.]+)/i);
      const accMatch = raw.match(/(?:acc|account|account_id)=([a-zA-Z0-9_-]+)/i);

      return {
        accountId: accMatch ? accMatch[1] : 'demo_001',
        symbol,
        action,
        quantity: qtyMatch ? parseFloat(qtyMatch[1]) : null,
        stopLoss: slMatch ? parseFloat(slMatch[1]) : null,
        takeProfit: tpMatch ? parseFloat(tpMatch[1]) : null,
        strategy: 'Raw Text Webhook',
        signalTime: new Date().toISOString()
      };
    }
  }

  return null;
}

// POST /api/webhook
router.post('/', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const configuredSecret = process.env.WEBHOOK_SECRET || 'antigravity_tv_secret_2026';
  
  let payload = parseFlexiblePayload(req.body);
  const logId = 'log_' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  if (!payload || !payload.action) {
    db.prepare(`
      INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, null, null, 'UNKNOWN', JSON.stringify(req.body), 'INVALID_PAYLOAD', 'Missing action or malformed payload', ip, now);

    return res.status(400).json({ success: false, error: 'Invalid or malformed webhook payload' });
  }

  // 1. Webhook Authentication Validation
  const providedSecret = req.headers['x-webhook-secret'] || req.query.secret || req.query.token || payload.secret;
  
  if (configuredSecret && configuredSecret !== '' && providedSecret !== configuredSecret) {
    db.prepare(`
      INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, payload.accountId, payload.symbol, payload.action, JSON.stringify(req.body), 'AUTH_FAILED', 'Unauthorized webhook secret token', ip, now);

    return res.status(401).json({ success: false, error: 'Unauthorized. Invalid webhook secret token.' });
  }

  // 2. Duplicate Alert Suppression (Idempotency)
  const alertSignature = `${payload.accountId}_${payload.symbol}_${payload.action}_${payload.quantity || ''}_${payload.price || ''}`;
  const sigHash = crypto.createHash('md5').update(alertSignature).digest('hex');
  const lastSeen = recentAlerts.get(sigHash);

  if (lastSeen && (Date.now() - lastSeen < DUPLICATE_WINDOW_MS)) {
    db.prepare(`
      INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, payload.accountId, payload.symbol, payload.action, JSON.stringify(req.body), 'IGNORED_DUPLICATE', 'Duplicate signal received within 3 seconds', ip, now);

    return res.json({ success: true, message: 'Duplicate alert ignored (idempotent)', log_id: logId });
  }
  recentAlerts.set(sigHash, Date.now());

  // 3. Process Action
  try {
    const act = payload.action.toUpperCase();

    if (act === 'BUY' || act === 'LONG' || act === 'OPEN_LONG' || act === 'SELL' || act === 'SHORT' || act === 'OPEN_SHORT') {
      const position = tradingEngine.openPosition({
        accountId: payload.accountId,
        symbol: payload.symbol,
        action: act,
        quantity: payload.quantity,
        amountInDollars: payload.amountInDollars,
        percentageOfBalance: payload.percentageOfBalance,
        stopLoss: payload.stopLoss,
        takeProfit: payload.takeProfit,
        trailingStopDistance: payload.trailingStopDistance,
        strategy: payload.strategy,
        signalTime: payload.signalTime,
        price: payload.price
      });

      db.prepare(`
        INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, payload.accountId, payload.symbol, act, JSON.stringify(req.body), 'SUCCESS', `Position opened: ${position.id} (${position.side} ${position.quantity} ${position.symbol} @ $${position.entry_price})`, ip, now);

      return res.json({
        success: true,
        message: 'Order executed successfully',
        position,
        log_id: logId
      });
    }

    if (act === 'CLOSE' || act === 'CLOSE_LONG' || act === 'CLOSE_SHORT' || act === 'EXIT') {
      // Find open position for this account and symbol
      const posQuery = 'SELECT * FROM positions WHERE account_id = ? AND symbol = ?';
      const normSym = payload.symbol.toUpperCase().replace('/', '').replace('.', '').trim();
      const pos = db.prepare(posQuery).get(payload.accountId, normSym);

      if (!pos) {
        db.prepare(`
          INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(logId, payload.accountId, payload.symbol, act, JSON.stringify(req.body), 'NO_OP', `No open position found to close for ${payload.symbol}`, ip, now);

        return res.json({ success: true, message: `No open position found to close for ${payload.symbol}`, log_id: logId });
      }

      const closedTrade = tradingEngine.closePosition(pos.id, 'SIGNAL_CLOSE');

      db.prepare(`
        INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, payload.accountId, payload.symbol, act, JSON.stringify(req.body), 'SUCCESS', `Position closed: ${closedTrade.id} | Net P&L: $${closedTrade.net_pnl}`, ip, now);

      return res.json({
        success: true,
        message: 'Position closed successfully',
        trade: closedTrade,
        log_id: logId
      });
    }

    if (act === 'CLOSE_ALL' || act === 'FLATTEN') {
      const closedTrades = tradingEngine.closeAllPositions(payload.accountId, payload.symbol || null, 'SIGNAL_CLOSE_ALL');

      db.prepare(`
        INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, payload.accountId, payload.symbol || 'ALL', act, JSON.stringify(req.body), 'SUCCESS', `Closed ${closedTrades.length} positions`, ip, now);

      return res.json({
        success: true,
        message: `Closed ${closedTrades.length} positions`,
        trades: closedTrades,
        log_id: logId
      });
    }

    // Default error for unknown action
    throw new Error(`Unsupported action: ${payload.action}`);

  } catch (err) {
    db.prepare(`
      INSERT INTO webhook_logs (id, account_id, symbol, action, raw_payload, status, response_message, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, payload.accountId, payload.symbol, payload.action, JSON.stringify(req.body), 'ERROR', err.message, ip, now);

    return res.status(400).json({ success: false, error: err.message, log_id: logId });
  }
});

// GET /api/webhook/logs - Retrieve recent webhook audit logs
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const accountId = req.query.account_id;
    let query = 'SELECT * FROM webhook_logs';
    const params = [];

    if (accountId) {
      query += ' WHERE account_id = ?';
      params.push(accountId);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const logs = db.prepare(query).all(...params);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
