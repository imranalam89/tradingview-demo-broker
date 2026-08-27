const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/database');

// GET /api/trades - Query trade history with multi-filter support
router.get('/', (req, res) => {
  try {
    const {
      account_id,
      strategy,
      symbol,
      outcome, // 'win', 'loss'
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT t.*, a.name as account_name FROM trades t JOIN accounts a ON t.account_id = a.id WHERE 1=1';
    const params = [];

    if (account_id && account_id !== 'all') {
      query += ' AND t.account_id = ?';
      params.push(account_id);
    }

    if (strategy && strategy !== 'all') {
      query += ' AND t.strategy LIKE ?';
      params.push(`%${strategy}%`);
    }

    if (symbol && symbol !== 'all') {
      query += ' AND t.symbol = ?';
      params.push(symbol.toUpperCase().trim());
    }

    if (outcome === 'win') {
      query += ' AND t.net_pnl > 0';
    } else if (outcome === 'loss') {
      query += ' AND t.net_pnl <= 0';
    }

    if (start_date) {
      query += ' AND t.closed_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND t.closed_at <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY t.closed_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const trades = db.prepare(query).all(...params);

    // Summary statistics for current filter
    let statsQuery = 'SELECT COUNT(*) as total_count, SUM(net_pnl) as total_net_pnl, SUM(fees) as total_fees FROM trades WHERE 1=1';
    const statsParams = [];

    if (account_id && account_id !== 'all') {
      statsQuery += ' AND account_id = ?';
      statsParams.push(account_id);
    }
    if (strategy && strategy !== 'all') {
      statsQuery += ' AND strategy LIKE ?';
      statsParams.push(`%${strategy}%`);
    }
    if (symbol && symbol !== 'all') {
      statsQuery += ' AND symbol = ?';
      statsParams.push(symbol.toUpperCase().trim());
    }

    const stats = db.prepare(statsQuery).get(...statsParams);

    res.json({
      success: true,
      trades,
      summary: {
        totalTrades: stats.total_count || 0,
        totalNetPnl: parseFloat((stats.total_net_pnl || 0).toFixed(2)),
        totalFees: parseFloat((stats.total_fees || 0).toFixed(2))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trades/export - Export trades to CSV
router.get('/export', (req, res) => {
  try {
    const { account_id } = req.query;
    let query = 'SELECT t.*, a.name as account_name FROM trades t JOIN accounts a ON t.account_id = a.id';
    const params = [];

    if (account_id && account_id !== 'all') {
      query += ' WHERE t.account_id = ?';
      params.push(account_id);
    }
    query += ' ORDER BY t.closed_at DESC';

    const trades = db.prepare(query).all(...params);

    // Build CSV
    const headers = [
      'Trade ID',
      'Account ID',
      'Account Name',
      'Strategy',
      'Symbol',
      'Direction',
      'Quantity',
      'Entry Price',
      'Exit Price',
      'Stop Loss',
      'Take Profit',
      'Exit Reason',
      'Gross PnL ($)',
      'Fees ($)',
      'Net PnL ($)',
      'PnL %',
      'Signal Time',
      'Execution Time',
      'Closed At',
      'Duration (sec)'
    ];

    const rows = trades.map(t => [
      t.id,
      t.account_id,
      `"${(t.account_name || '').replace(/"/g, '""')}"`,
      `"${(t.strategy || '').replace(/"/g, '""')}"`,
      t.symbol,
      t.side,
      t.quantity,
      t.entry_price,
      t.exit_price,
      t.stop_loss || '',
      t.take_profit || '',
      t.exit_reason,
      t.gross_pnl,
      t.fees,
      t.net_pnl,
      t.pnl_percent,
      t.signal_time || '',
      t.execution_time || '',
      t.closed_at,
      t.duration_seconds
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=trade_history_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trades/record - Record a completed trade
router.post('/record', (req, res) => {
  try {
    const {
      account_id,
      symbol,
      side,
      quantity,
      entry_price,
      exit_price,
      stop_loss,
      take_profit,
      exit_reason = 'TP_HIT',
      fees = 0.0,
      strategy = '',
      opened_at,
      closed_at = new Date().toISOString()
    } = req.body;

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const posId = 'pos_' + crypto.randomUUID().slice(0, 8);
    const tradeId = 'tr_' + crypto.randomUUID().slice(0, 8);

    const priceDiff = side.toUpperCase() === 'BUY' ? (exit_price - entry_price) : (entry_price - exit_price);
    const grossPnl = priceDiff * quantity;
    const netPnl = grossPnl - fees;
    const pnlPercent = entry_price > 0 ? (grossPnl / (entry_price * quantity)) * 100 : 0;

    // Insert trade
    db.prepare(`
      INSERT INTO trades (id, account_id, position_id, symbol, side, quantity, entry_price, exit_price, stop_loss, take_profit, exit_reason, gross_pnl, fees, net_pnl, pnl_percent, strategy, signal_time, execution_time, closed_at, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      account_id,
      posId,
      symbol.toUpperCase(),
      side.toUpperCase(),
      quantity,
      entry_price,
      exit_price,
      stop_loss,
      take_profit,
      exit_reason,
      parseFloat(grossPnl.toFixed(2)),
      parseFloat(fees.toFixed(2)),
      parseFloat(netPnl.toFixed(2)),
      parseFloat(pnlPercent.toFixed(2)),
      strategy || account.assigned_strategy,
      opened_at || closed_at,
      opened_at || closed_at,
      closed_at,
      3600
    );

    // Update account balance
    const newBalance = parseFloat((account.balance + netPnl).toFixed(2));
    db.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?').run(newBalance, closed_at, account_id);

    // Record equity snapshot
    db.prepare(`
      INSERT INTO equity_snapshots (account_id, balance, equity, unrealized_pnl, open_positions_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(account_id, newBalance, newBalance, 0, 0, closed_at);

    res.json({ success: true, message: 'Trade recorded successfully', tradeId, newBalance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
