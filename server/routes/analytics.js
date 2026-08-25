const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/analytics/compare - Side-by-side strategy & account comparison
router.get('/compare', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts WHERE is_active = 1').all();

    const comparison = accounts.map(acc => {
      const trades = db.prepare('SELECT * FROM trades WHERE account_id = ? ORDER BY closed_at ASC').all(acc.id);
      const positions = db.prepare('SELECT * FROM positions WHERE account_id = ? AND status = \'OPEN\'').all(acc.id);

      const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
      const currentEquity = parseFloat((acc.balance + unrealizedPnl).toFixed(2));
      const totalNetPnl = trades.reduce((sum, t) => sum + t.net_pnl, 0);
      const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);

      const winningTrades = trades.filter(t => t.net_pnl > 0);
      const losingTrades = trades.filter(t => t.net_pnl < 0);

      const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
      const totalWinsPnl = winningTrades.reduce((sum, t) => sum + t.net_pnl, 0);
      const totalLossesPnl = Math.abs(losingTrades.reduce((sum, t) => sum + t.net_pnl, 0));

      const profitFactor = totalLossesPnl > 0 ? (totalWinsPnl / totalLossesPnl) : (totalWinsPnl > 0 ? totalWinsPnl : 1.0);
      const avgWin = winningTrades.length > 0 ? (totalWinsPnl / winningTrades.length) : 0;
      const avgLoss = losingTrades.length > 0 ? (totalLossesPnl / losingTrades.length) : 0;
      const riskRewardRatio = avgLoss > 0 ? (avgWin / avgLoss) : (avgWin > 0 ? avgWin : 1.0);

      // Max Drawdown & Streaks
      let peak = acc.initial_balance;
      let maxDrawdownDollar = 0;
      let maxDrawdownPct = 0;
      let runningBalance = acc.initial_balance;

      let consecutiveWins = 0;
      let maxConsecutiveWins = 0;
      let consecutiveLosses = 0;
      let maxConsecutiveLosses = 0;

      for (const t of trades) {
        runningBalance += t.net_pnl;
        if (runningBalance > peak) peak = runningBalance;
        const ddDollar = peak - runningBalance;
        const ddPct = peak > 0 ? (ddDollar / peak) * 100 : 0;

        if (ddDollar > maxDrawdownDollar) maxDrawdownDollar = ddDollar;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        if (t.net_pnl > 0) {
          consecutiveWins++;
          consecutiveLosses = 0;
          if (consecutiveWins > maxConsecutiveWins) maxConsecutiveWins = consecutiveWins;
        } else if (t.net_pnl < 0) {
          consecutiveLosses++;
          consecutiveWins = 0;
          if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses;
        }
      }

      const avgDurationSec = trades.length > 0
        ? Math.round(trades.reduce((sum, t) => sum + t.duration_seconds, 0) / trades.length)
        : 0;

      const totalRoiPct = acc.initial_balance > 0
        ? (((currentEquity - acc.initial_balance) / acc.initial_balance) * 100)
        : 0;

      return {
        accountId: acc.id,
        accountName: acc.name,
        strategy: acc.assigned_strategy || 'General',
        initialBalance: acc.initial_balance,
        balance: acc.balance,
        equity: currentEquity,
        unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
        totalNetPnl: parseFloat(totalNetPnl.toFixed(2)),
        totalRoiPct: parseFloat(totalRoiPct.toFixed(2)),
        totalFees: parseFloat(totalFees.toFixed(2)),
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: parseFloat(winRate.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        avgWin: parseFloat(avgWin.toFixed(2)),
        avgLoss: parseFloat(avgLoss.toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        maxDrawdownDollar: parseFloat(maxDrawdownDollar.toFixed(2)),
        maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
        maxConsecutiveWins,
        maxConsecutiveLosses,
        avgDurationSec,
        openPositionsCount: positions.length
      };
    });

    res.json({ success: true, comparison });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/equity-curve
router.get('/equity-curve', (req, res) => {
  try {
    const { account_id } = req.query;
    let query = 'SELECT * FROM equity_snapshots';
    const params = [];

    if (account_id && account_id !== 'all') {
      query += ' WHERE account_id = ?';
      params.push(account_id);
    }
    query += ' ORDER BY created_at ASC LIMIT 1000';

    const snapshots = db.prepare(query).all(...params);
    res.json({ success: true, snapshots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/daily-pnl
router.get('/daily-pnl', (req, res) => {
  try {
    const { account_id } = req.query;
    let query = `
      SELECT 
        substr(closed_at, 1, 10) as date,
        COUNT(*) as trade_count,
        SUM(net_pnl) as daily_net_pnl,
        SUM(CASE WHEN net_pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN net_pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      WHERE 1=1
    `;
    const params = [];

    if (account_id && account_id !== 'all') {
      query += ' AND account_id = ?';
      params.push(account_id);
    }

    query += ' GROUP BY substr(closed_at, 1, 10) ORDER BY date ASC';

    const daily = db.prepare(query).all(...params);
    res.json({ success: true, daily });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
