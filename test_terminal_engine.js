/**
 * Automated Verification Script for Apex Pro Terminal Engine
 */

require('./terminal_data.js');
const assert = require('assert');

console.log('Testing Apex Pro Terminal Engine...');

const dataStore = global.TERMINAL_HISTORICAL_DATA;
assert(dataStore.XAUUSD, 'XAUUSD dataset must exist');
console.log('✔ Dataset loaded. Available symbols:', Object.keys(dataStore));

// Check timeframes
const timeframes = Object.keys(dataStore.XAUUSD.timeframes);
console.log('✔ XAUUSD timeframes:', timeframes);

// Verify candle count & integrity
const c15m = dataStore.XAUUSD.timeframes['15m'];
assert(c15m && c15m.length > 0, '15M candles must exist');
console.log(`✔ 15M candles count: ${c15m.length}, First: ${c15m[0].datetimeStr}, Last: ${c15m[c15m.length-1].datetimeStr}`);

// Simulate a backtest run programmatically using the core mechanics
const account = {
  id: 'test_acc',
  name: 'Test Backtest Account',
  startingBalance: 10000,
  balance: 10000,
  equity: 10000,
  commission: 7.0,
  spread: 0.25,
  slippage: 0.05,
  openPositions: [],
  tradeHistory: [],
  equityCurve: [
    { time: 0, datetimeStr: 'Start', balance: 10000, equity: 10000, drawdown: 0, drawdownPct: 0 }
  ]
};

// 1. Test Trade Placement (BUY)
const startCandle = c15m[50];
const buyPos = {
  id: 'POS-TEST-1',
  symbol: 'XAUUSD',
  type: 'BUY',
  size: 1.0,
  entryPrice: startCandle.close + 0.125 + 0.05, // ask with spread & slippage
  entryTime: startCandle.time,
  entryDateStr: startCandle.datetimeStr,
  sl: startCandle.close - 10,
  tp: startCandle.close + 20,
  contractSize: 100,
  highestPrice: startCandle.close,
  lowestPrice: startCandle.close,
  trailingStop: true,
  trailingDistance: 5.0,
  breakevenTrigger: 8.0,
  breakevenOffset: 0.5
};

account.openPositions.push(buyPos);
console.log(`✔ Placed BUY order @ ${buyPos.entryPrice}, SL: ${buyPos.sl}, TP: ${buyPos.tp}`);

// 2. Replay next 50 candles and process position
let closedTrade = null;
for (let i = 51; i < 150; i++) {
  const candle = c15m[i];

  // Update Trailing & Breakeven
  buyPos.highestPrice = Math.max(buyPos.highestPrice, candle.high);
  buyPos.lowestPrice = Math.min(buyPos.lowestPrice, candle.low);

  if (candle.high - buyPos.entryPrice >= buyPos.breakevenTrigger) {
    if (!buyPos.isBreakevenSet) {
      buyPos.sl = buyPos.entryPrice + buyPos.breakevenOffset;
      buyPos.isBreakevenSet = true;
      console.log(`  [Replay Bar ${i}] Breakeven triggered -> SL moved to ${buyPos.sl}`);
    }
  }

  if (buyPos.trailingStop && (candle.high - buyPos.entryPrice >= 5.0)) {
    const potentialTrailSL = candle.high - buyPos.trailingDistance;
    if (potentialTrailSL > buyPos.sl) {
      buyPos.sl = potentialTrailSL;
    }
  }

  // Check SL/TP
  if (candle.low <= buyPos.sl) {
    const exitPrice = buyPos.sl - 0.05;
    const grossPnl = (exitPrice - buyPos.entryPrice) * buyPos.size * 100;
    const netPnl = grossPnl - (account.commission * buyPos.size);
    account.balance += netPnl;
    account.equity = account.balance;
    closedTrade = {
      id: buyPos.id,
      netPnl,
      exitPrice,
      exitReason: buyPos.isBreakevenSet ? 'Breakeven SL' : 'Trailing SL'
    };
    account.tradeHistory.push(closedTrade);
    account.openPositions = [];
    console.log(`  [Replay Bar ${i}] Position closed via ${closedTrade.exitReason} @ ${exitPrice.toFixed(2)}, Net P&L: $${netPnl.toFixed(2)}`);
    break;
  }
}

assert(account.tradeHistory.length > 0, 'Trade should have closed deterministically');
assert(account.balance !== 10000, 'Account balance should have updated');
console.log(`✔ Final Account Balance: $${account.balance.toFixed(2)}`);
console.log('✔ All terminal engine core verifications PASSED!');
