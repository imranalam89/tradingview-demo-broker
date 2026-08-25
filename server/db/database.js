const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/trading_broker.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initial_balance REAL DEFAULT 10000.0,
      balance REAL DEFAULT 10000.0,
      currency TEXT DEFAULT 'USD',
      leverage REAL DEFAULT 1.0,
      fee_rate REAL DEFAULT 0.0004,
      slippage_rate REAL DEFAULT 0.0002,
      spread_rate REAL DEFAULT 0.0001,
      assigned_strategy TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL, -- 'BUY' or 'SELL'
      quantity REAL NOT NULL,
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      trailing_stop_distance REAL,
      trailing_stop_active INTEGER DEFAULT 0,
      highest_price REAL,
      lowest_price REAL,
      unrealized_pnl REAL DEFAULT 0.0,
      margin_used REAL DEFAULT 0.0,
      strategy TEXT DEFAULT '',
      status TEXT DEFAULT 'OPEN',
      signal_time TEXT,
      execution_time TEXT,
      opened_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      position_id TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      exit_reason TEXT NOT NULL,
      gross_pnl REAL NOT NULL,
      fees REAL DEFAULT 0.0,
      net_pnl REAL NOT NULL,
      pnl_percent REAL DEFAULT 0.0,
      strategy TEXT DEFAULT '',
      signal_time TEXT,
      execution_time TEXT,
      closed_at TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      symbol TEXT,
      action TEXT,
      raw_payload TEXT,
      status TEXT NOT NULL,
      response_message TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      unrealized_pnl REAL DEFAULT 0.0,
      open_positions_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Seed default demo accounts if none exist
  const count = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
  if (count === 0) {
    const now = new Date().toISOString();
    const insertAccount = db.prepare(`
      INSERT INTO accounts (id, name, initial_balance, balance, currency, leverage, fee_rate, slippage_rate, spread_rate, assigned_strategy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAccount.run('demo_001', 'Demo Account 1 (Gold Scalper)', 10000.0, 10000.0, 'USD', 10.0, 0.0004, 0.0002, 0.0001, 'Apex Gold Scalper', now, now);
    insertAccount.run('demo_002', 'Demo Account 2 (BTC Momentum)', 10000.0, 10000.0, 'USD', 5.0, 0.0004, 0.0002, 0.0001, 'BTC Momentum Engine', now, now);
    insertAccount.run('demo_003', 'Demo Account 3 (Trend Follower)', 10000.0, 10000.0, 'USD', 1.0, 0.0002, 0.0001, 0.0001, 'Trend Follower 4H', now, now);
    insertAccount.run('demo_004', 'Demo Account 4 (Mean Reversion)', 10000.0, 10000.0, 'USD', 1.0, 0.0002, 0.0001, 0.0001, 'Mean Reversion PRO', now, now);

    console.log('✅ Seeded initial demo accounts (demo_001, demo_002, demo_003, demo_004)');
  }
}

initSchema();

module.exports = db;
