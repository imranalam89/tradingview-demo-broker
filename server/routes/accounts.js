const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');

// GET /api/accounts - List all accounts with live calculated metrics
router.get('/', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all();
    const result = accounts.map(acc => {
      const positions = db.prepare('SELECT * FROM positions WHERE account_id = ?').all(acc.id);
      const trades = db.prepare('SELECT * FROM trades WHERE account_id = ?').all(acc.id);

      const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
      const marginUsed = positions.reduce((sum, p) => sum + (p.margin_used || 0), 0);
      const equity = parseFloat((acc.balance + unrealizedPnl).toFixed(2));
      const freeMargin = parseFloat((acc.balance - marginUsed).toFixed(2));

      // Trading stats
      const totalTrades = trades.length;
      const winningTrades = trades.filter(t => t.net_pnl > 0);
      const losingTrades = trades.filter(t => t.net_pnl < 0);
      const totalNetPnl = trades.reduce((sum, t) => sum + t.net_pnl, 0);
      const winRate = totalTrades > 0 ? ((winningTrades.length / totalTrades) * 100) : 0;

      const grossWins = winningTrades.reduce((sum, t) => sum + t.gross_pnl, 0);
      const grossLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.gross_pnl, 0));
      const profitFactor = grossLosses > 0 ? (grossWins / grossLosses) : (grossWins > 0 ? grossWins : 1.0);

      // Max drawdown calculation from equity snapshots or trades
      let peak = acc.initial_balance;
      let maxDrawdown = 0;
      let currentBal = acc.initial_balance;

      for (const t of trades) {
        currentBal += t.net_pnl;
        if (currentBal > peak) peak = currentBal;
        const dd = peak > 0 ? ((peak - currentBal) / peak) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      return {
        ...acc,
        equity,
        marginUsed: parseFloat(marginUsed.toFixed(2)),
        freeMargin,
        unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
        openPositionsCount: positions.length,
        totalTrades,
        winningTradesCount: winningTrades.length,
        losingTradesCount: losingTrades.length,
        winRate: parseFloat(winRate.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        totalNetPnl: parseFloat(totalNetPnl.toFixed(2)),
        maxDrawdown: parseFloat(maxDrawdown.toFixed(2))
      };
    });

    res.json({ success: true, accounts: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts - Create new demo account
router.post('/', (req, res) => {
  try {
    const {
      name,
      initial_balance = 10000.0,
      currency = 'USD',
      leverage = 1.0,
      fee_rate = 0.0004,
      slippage_rate = 0.0002,
      spread_rate = 0.0001,
      assigned_strategy = ''
    } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Account name is required' });
    }

    const id = req.body.id ? req.body.id.trim() : ('demo_' + crypto.randomUUID().slice(0, 6));
    const now = new Date().toISOString();
    const balance = parseFloat(initial_balance) || 10000.0;

    db.prepare(`
      INSERT INTO accounts (id, name, initial_balance, balance, currency, leverage, fee_rate, slippage_rate, spread_rate, assigned_strategy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      balance,
      balance,
      currency,
      parseFloat(leverage) || 1.0,
      parseFloat(fee_rate) || 0.0004,
      parseFloat(slippage_rate) || 0.0002,
      parseFloat(spread_rate) || 0.0001,
      assigned_strategy.trim(),
      now,
      now
    );

    const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    res.json({ success: true, account: newAccount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/accounts/:id - Edit account details
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const {
      name = account.name,
      leverage = account.leverage,
      fee_rate = account.fee_rate,
      slippage_rate = account.slippage_rate,
      spread_rate = account.spread_rate,
      assigned_strategy = account.assigned_strategy
    } = req.body;

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE accounts
      SET name = ?, leverage = ?, fee_rate = ?, slippage_rate = ?, spread_rate = ?, assigned_strategy = ?, updated_at = ?
      WHERE id = ?
    `).run(name, parseFloat(leverage), parseFloat(fee_rate), parseFloat(slippage_rate), parseFloat(spread_rate), assigned_strategy, now, id);

    const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    res.json({ success: true, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts/:id/reset - Reset account back to initial balance and clear trades/positions
router.post('/:id/reset', (req, res) => {
  try {
    const { id } = req.params;
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const now = new Date().toISOString();

    const resetTx = db.transaction(() => {
      // 1. Delete all positions
      db.prepare('DELETE FROM positions WHERE account_id = ?').run(id);
      // 2. Delete all trades
      db.prepare('DELETE FROM trades WHERE account_id = ?').run(id);
      // 3. Delete equity snapshots
      db.prepare('DELETE FROM equity_snapshots WHERE account_id = ?').run(id);
      // 4. Restore initial balance
      db.prepare('UPDATE accounts SET balance = initial_balance, updated_at = ? WHERE id = ?').run(now, id);
    });

    resetTx();

    const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    res.json({ success: true, message: `Account ${account.name} reset to $${account.initial_balance}`, account: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/accounts/:id - Delete account
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    res.json({ success: true, message: `Account ${id} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
