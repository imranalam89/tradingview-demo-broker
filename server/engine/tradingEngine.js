const crypto = require('crypto');
const EventEmitter = require('events');
const db = require('../db/database');
const priceFeed = require('./priceFeed');

class TradingEngine extends EventEmitter {
  constructor() {
    super();
    this.isEvaluating = false;
    this.setupPriceListener();
  }

  setupPriceListener() {
    // Listen to real-time price updates from PriceFeed
    priceFeed.on('price', ({ symbol, price }) => {
      this.evaluatePositions(symbol, price);
    });
  }

  // Get account by ID or name
  getAccount(accountIdOrName) {
    if (!accountIdOrName) return null;
    return db.prepare('SELECT * FROM accounts WHERE id = ? OR name = ?').get(accountIdOrName, accountIdOrName);
  }

  // Calculate realistic execution price with slippage and spread
  calculateExecutionPrice(symbol, side, requestedPrice = null, slippageRate = 0.0002, spreadRate = 0.0001) {
    const marketData = priceFeed.getPriceData(symbol);
    const basePrice = requestedPrice && requestedPrice > 0 ? requestedPrice : (marketData ? marketData.price : 100);

    // Realistic slippage: slightly randomized between 50% and 120% of slippage_rate
    const jitter = 0.5 + Math.random() * 0.7;
    const slippage = basePrice * (slippageRate * jitter);
    const halfSpread = (basePrice * spreadRate) / 2;

    if (side === 'BUY' || side === 'LONG') {
      return parseFloat((basePrice + slippage + halfSpread).toFixed(4));
    } else {
      return parseFloat((basePrice - slippage - halfSpread).toFixed(4));
    }
  }

  // Open simulated trade position
  openPosition({
    accountId,
    symbol,
    action, // 'BUY', 'SELL', 'LONG', 'SHORT'
    quantity,
    amountInDollars,
    percentageOfBalance,
    stopLoss,
    takeProfit,
    trailingStopDistance,
    strategy,
    signalTime,
    price: requestedPrice
  }) {
    const account = this.getAccount(accountId);
    if (!account) {
      throw new Error(`Account "${accountId}" not found.`);
    }

    if (!account.is_active) {
      throw new Error(`Account "${account.name}" is deactivated.`);
    }

    const normSide = (action.toUpperCase().includes('BUY') || action.toUpperCase().includes('LONG')) ? 'BUY' : 'SELL';
    const normSymbol = symbol.toUpperCase().replace('/', '').replace('.', '').trim();

    // Get current market execution price
    const execPrice = this.calculateExecutionPrice(
      normSymbol,
      normSide,
      requestedPrice,
      account.slippage_rate,
      account.spread_rate
    );

    // Determine position quantity
    let finalQty = parseFloat(quantity);
    if (isNaN(finalQty) || finalQty <= 0) {
      if (amountInDollars && parseFloat(amountInDollars) > 0) {
        finalQty = parseFloat((parseFloat(amountInDollars) / execPrice).toFixed(6));
      } else if (percentageOfBalance && parseFloat(percentageOfBalance) > 0) {
        const alloc = (account.balance * (parseFloat(percentageOfBalance) / 100)) * account.leverage;
        finalQty = parseFloat((alloc / execPrice).toFixed(6));
      } else {
        // Default safe 10% allocation with leverage
        const alloc = (account.balance * 0.1) * account.leverage;
        finalQty = parseFloat((alloc / execPrice).toFixed(6));
      }
    }

    if (finalQty <= 0) {
      throw new Error('Invalid order quantity calculated.');
    }

    // Margin calculations
    const notionalValue = execPrice * finalQty;
    const marginRequired = notionalValue / account.leverage;

    // Check existing margin usage
    const openPositions = db.prepare('SELECT * FROM positions WHERE account_id = ?').all(account.id);
    const totalMarginUsed = openPositions.reduce((sum, pos) => sum + (pos.margin_used || 0), 0);
    const freeMargin = account.balance - totalMarginUsed;

    if (marginRequired > freeMargin) {
      throw new Error(`Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${freeMargin.toFixed(2)}`);
    }

    // Entry Fee calculation
    const entryFee = notionalValue * account.fee_rate;

    const now = new Date().toISOString();
    const positionId = 'pos_' + crypto.randomUUID().slice(0, 8);

    const isTrailing = (trailingStopDistance && parseFloat(trailingStopDistance) > 0) ? 1 : 0;

    // Insert Position into SQLite
    const insertPos = db.prepare(`
      INSERT INTO positions (
        id, account_id, symbol, side, quantity, entry_price, current_price,
        stop_loss, take_profit, trailing_stop_distance, trailing_stop_active,
        highest_price, lowest_price, unrealized_pnl, margin_used,
        strategy, status, signal_time, execution_time, opened_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPos.run(
      positionId,
      account.id,
      normSymbol,
      normSide,
      finalQty,
      execPrice,
      execPrice,
      stopLoss ? parseFloat(stopLoss) : null,
      takeProfit ? parseFloat(takeProfit) : null,
      trailingStopDistance ? parseFloat(trailingStopDistance) : null,
      isTrailing,
      execPrice, // initial highest
      execPrice, // initial lowest
      -entryFee, // starting unrealized P&L after fee
      marginRequired,
      strategy || account.assigned_strategy || 'Default Strategy',
      'OPEN',
      signalTime || now,
      now,
      now,
      now
    );

    console.log(`🚀 [${account.name}] OPENED ${normSide} ${finalQty} ${normSymbol} @ $${execPrice} (SL: ${stopLoss || 'None'}, TP: ${takeProfit || 'None'})`);

    const newPosition = db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
    this.emit('position_opened', { account, position: newPosition });
    this.recordEquitySnapshot(account.id);

    return newPosition;
  }

  // Close simulated position
  closePosition(positionId, exitReason = 'MANUAL_CLOSE', explicitExitPrice = null) {
    const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found or already closed.`);
    }

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(position.account_id);
    if (!account) {
      throw new Error(`Account ${position.account_id} not found.`);
    }

    // Determine exit price
    let exitPrice = explicitExitPrice;
    if (!exitPrice || exitPrice <= 0) {
      const exitSide = position.side === 'BUY' ? 'SELL' : 'BUY';
      exitPrice = this.calculateExecutionPrice(
        position.symbol,
        exitSide,
        null,
        account.slippage_rate,
        account.spread_rate
      );
    }

    // Calculate P&L
    let grossPnl = 0;
    if (position.side === 'BUY') {
      grossPnl = (exitPrice - position.entry_price) * position.quantity;
    } else {
      grossPnl = (position.entry_price - exitPrice) * position.quantity;
    }

    const entryNotional = position.entry_price * position.quantity;
    const exitNotional = exitPrice * position.quantity;
    const entryFee = entryNotional * account.fee_rate;
    const exitFee = exitNotional * account.fee_rate;
    const totalFees = entryFee + exitFee;
    const netPnl = grossPnl - totalFees;
    const pnlPercent = (grossPnl / (entryNotional / account.leverage)) * 100;

    const now = new Date().toISOString();
    const openedTime = new Date(position.opened_at).getTime();
    const closedTime = new Date(now).getTime();
    const durationSeconds = Math.max(1, Math.round((closedTime - openedTime) / 1000));

    const tradeId = 'trd_' + crypto.randomUUID().slice(0, 8);

    // Database transaction: remove position, add trade, credit account balance
    const closeTx = db.transaction(() => {
      // 1. Delete open position
      db.prepare('DELETE FROM positions WHERE id = ?').run(position.id);

      // 2. Insert Trade Log
      db.prepare(`
        INSERT INTO trades (
          id, account_id, position_id, symbol, side, quantity,
          entry_price, exit_price, stop_loss, take_profit, exit_reason,
          gross_pnl, fees, net_pnl, pnl_percent, strategy,
          signal_time, execution_time, closed_at, duration_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tradeId,
        account.id,
        position.id,
        position.symbol,
        position.side,
        position.quantity,
        position.entry_price,
        exitPrice,
        position.stop_loss,
        position.take_profit,
        exitReason,
        parseFloat(grossPnl.toFixed(2)),
        parseFloat(totalFees.toFixed(2)),
        parseFloat(netPnl.toFixed(2)),
        parseFloat(pnlPercent.toFixed(2)),
        position.strategy,
        position.signal_time,
        position.execution_time,
        now,
        durationSeconds
      );

      // 3. Update Account Balance
      const newBalance = parseFloat((account.balance + netPnl).toFixed(2));
      db.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?').run(newBalance, now, account.id);
    });

    closeTx();

    console.log(`🏁 [${account.name}] CLOSED ${position.side} ${position.quantity} ${position.symbol} @ $${exitPrice} | Reason: ${exitReason} | Net PnL: $${netPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

    const closedTrade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
    this.emit('position_closed', { account, trade: closedTrade });
    this.recordEquitySnapshot(account.id);

    return closedTrade;
  }

  // Close all positions for an account (or filtered by symbol)
  closeAllPositions(accountId, symbol = null, exitReason = 'SIGNAL_CLOSE_ALL') {
    let query = 'SELECT * FROM positions WHERE account_id = ?';
    const params = [accountId];
    if (symbol) {
      query += ' AND symbol = ?';
      params.push(symbol.toUpperCase().replace('/', '').replace('.', '').trim());
    }

    const openPositions = db.prepare(query).all(...params);
    const closedTrades = [];

    for (const pos of openPositions) {
      try {
        const trade = this.closePosition(pos.id, exitReason);
        closedTrades.push(trade);
      } catch (err) {
        console.error(`Error closing position ${pos.id}:`, err.message);
      }
    }

    return closedTrades;
  }

  // Modify SL / TP / Trailing Stop parameters for active position
  updatePositionRisk(positionId, { stopLoss, takeProfit, trailingStopDistance }) {
    const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
    if (!position) throw new Error(`Position ${positionId} not found.`);

    const now = new Date().toISOString();
    const isTrailing = (trailingStopDistance && parseFloat(trailingStopDistance) > 0) ? 1 : position.trailing_stop_active;

    db.prepare(`
      UPDATE positions
      SET stop_loss = COALESCE(?, stop_loss),
          take_profit = COALESCE(?, take_profit),
          trailing_stop_distance = COALESCE(?, trailing_stop_distance),
          trailing_stop_active = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      stopLoss !== undefined ? parseFloat(stopLoss) : null,
      takeProfit !== undefined ? parseFloat(takeProfit) : null,
      trailingStopDistance !== undefined ? parseFloat(trailingStopDistance) : null,
      isTrailing,
      now,
      positionId
    );

    return db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
  }

  // Continuous 24/7 position evaluation against real-time market prices
  evaluatePositions(symbol, currentPrice) {
    if (this.isEvaluating || !currentPrice || currentPrice <= 0) return;
    this.isEvaluating = true;

    try {
      const openPositions = db.prepare('SELECT * FROM positions WHERE symbol = ? AND status = \'OPEN\'').all(symbol);
      const now = new Date().toISOString();

      for (const pos of openPositions) {
        let highest = pos.highest_price || pos.entry_price;
        let lowest = pos.lowest_price || pos.entry_price;

        if (currentPrice > highest) highest = currentPrice;
        if (currentPrice < lowest) lowest = currentPrice;

        // Calculate current unrealized P&L
        let unPnl = 0;
        if (pos.side === 'BUY') {
          unPnl = (currentPrice - pos.entry_price) * pos.quantity;
        } else {
          unPnl = (pos.entry_price - currentPrice) * pos.quantity;
        }

        // 1. Check Take Profit Hit
        if (pos.take_profit && pos.take_profit > 0) {
          if (pos.side === 'BUY' && currentPrice >= pos.take_profit) {
            this.closePosition(pos.id, 'TP_HIT', pos.take_profit);
            continue;
          } else if (pos.side === 'SELL' && currentPrice <= pos.take_profit) {
            this.closePosition(pos.id, 'TP_HIT', pos.take_profit);
            continue;
          }
        }

        // 2. Check Stop Loss Hit
        if (pos.stop_loss && pos.stop_loss > 0) {
          if (pos.side === 'BUY' && currentPrice <= pos.stop_loss) {
            this.closePosition(pos.id, 'SL_HIT', pos.stop_loss);
            continue;
          } else if (pos.side === 'SELL' && currentPrice >= pos.stop_loss) {
            this.closePosition(pos.id, 'SL_HIT', pos.stop_loss);
            continue;
          }
        }

        // 3. Check Trailing Stop Hit
        if (pos.trailing_stop_active && pos.trailing_stop_distance && pos.trailing_stop_distance > 0) {
          const trailDist = pos.trailing_stop_distance;
          if (pos.side === 'BUY') {
            const dynamicStop = highest - trailDist;
            if (currentPrice <= dynamicStop && dynamicStop > pos.entry_price) {
              this.closePosition(pos.id, 'TRAILING_STOP_HIT', dynamicStop);
              continue;
            }
          } else {
            const dynamicStop = lowest + trailDist;
            if (currentPrice >= dynamicStop && dynamicStop < pos.entry_price) {
              this.closePosition(pos.id, 'TRAILING_STOP_HIT', dynamicStop);
              continue;
            }
          }
        }

        // Update position mark price and tracking extremes
        db.prepare(`
          UPDATE positions
          SET current_price = ?,
              highest_price = ?,
              lowest_price = ?,
              unrealized_pnl = ?,
              updated_at = ?
          WHERE id = ?
        `).run(currentPrice, highest, lowest, parseFloat(unPnl.toFixed(2)), now, pos.id);
      }
    } catch (err) {
      console.error('Error evaluating positions:', err);
    } finally {
      this.isEvaluating = false;
    }
  }

  // Periodic equity snapshot recording for performance analytics & curves
  recordEquitySnapshot(accountId) {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!account) return;

    const positions = db.prepare('SELECT * FROM positions WHERE account_id = ?').all(accountId);
    const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    const currentEquity = parseFloat((account.balance + unrealizedPnl).toFixed(2));
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO equity_snapshots (account_id, balance, equity, unrealized_pnl, open_positions_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(account.id, account.balance, currentEquity, unrealizedPnl, positions.length, now);
  }
}

const tradingEngine = new TradingEngine();

module.exports = tradingEngine;
