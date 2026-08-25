const http = require('http');
const assert = require('assert');

// Helper to make HTTP POST
function sendWebhook(payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Starting TradingView Demo Broker Test Suite...\n');

  // Test 1: Check System Health Endpoint
  console.log('Test 1: Verifying /api/health endpoint...');
  const healthRes = await getJson('/api/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  assert.strictEqual(healthRes.data.status, 'healthy', 'Health status should be healthy');
  console.log('✅ Health Check Passed:', healthRes.data);

  // Test 2: Unauthorized Webhook Secret Rejection
  console.log('\nTest 2: Verifying Webhook Secret Authentication...');
  const unauthRes = await sendWebhook({
    secret: 'wrong_secret',
    account_id: 'demo_001',
    symbol: 'BTCUSDT',
    action: 'BUY',
    quantity: 0.01
  });
  assert.strictEqual(unauthRes.status, 401, 'Invalid secret should be rejected with 401');
  console.log('✅ Webhook Auth Security Verified');

  // Test 3: Valid LONG Signal Execution (Account 1 - Gold Scalper)
  console.log('\nTest 3: Executing Valid LONG Signal on demo_001...');
  const buyRes = await sendWebhook({
    secret: 'antigravity_tv_secret_2026',
    account_id: 'demo_001',
    symbol: 'BTCUSDT',
    action: 'BUY',
    quantity: 0.05,
    stop_loss: 90000,
    take_profit: 105000,
    strategy: 'Apex Scalper PRO'
  });
  assert.strictEqual(buyRes.status, 200, 'BUY webhook should succeed with 200');
  assert.strictEqual(buyRes.data.success, true, 'Response success should be true');
  assert.ok(buyRes.data.position.id, 'Position ID should be returned');
  const posId1 = buyRes.data.position.id;
  console.log(`✅ LONG Position Opened: ${posId1} | Symbol: BTCUSDT | Entry: $${buyRes.data.position.entry_price}`);

  // Test 4: Duplicate Alert Suppression
  console.log('\nTest 4: Testing Duplicate Alert Suppression (Idempotency)...');
  const dupRes = await sendWebhook({
    secret: 'antigravity_tv_secret_2026',
    account_id: 'demo_001',
    symbol: 'BTCUSDT',
    action: 'BUY',
    quantity: 0.05,
    stop_loss: 90000,
    take_profit: 105000,
    strategy: 'Apex Scalper PRO'
  });
  assert.strictEqual(dupRes.data.message.includes('Duplicate alert ignored'), true, 'Should suppress duplicate signal');
  console.log('✅ Duplicate Alert Correctly Suppressed');

  // Test 5: Valid SHORT Signal Execution on demo_002 (Strategy 2)
  console.log('\nTest 5: Executing SHORT Signal on demo_002 (BTC Momentum)...');
  const shortRes = await sendWebhook({
    secret: 'antigravity_tv_secret_2026',
    account_id: 'demo_002',
    symbol: 'ETHUSDT',
    action: 'SELL',
    quantity: 1.5,
    stop_loss: 3200,
    take_profit: 2400,
    trailing_stop: 50,
    strategy: 'BTC Momentum Engine'
  });
  assert.strictEqual(shortRes.status, 200, 'SHORT webhook should succeed');
  console.log(`✅ SHORT Position Opened: ${shortRes.data.position.id} | Entry: $${shortRes.data.position.entry_price}`);

  // Test 6: Close Position Signal
  console.log('\nTest 6: Executing CLOSE signal for demo_001 (BTCUSDT)...');
  const closeRes = await sendWebhook({
    secret: 'antigravity_tv_secret_2026',
    account_id: 'demo_001',
    symbol: 'BTCUSDT',
    action: 'CLOSE'
  });
  assert.strictEqual(closeRes.status, 200, 'CLOSE webhook should succeed');
  assert.ok(closeRes.data.trade, 'Closed trade should be returned');
  console.log(`✅ Trade Closed: Net P&L: $${closeRes.data.trade.net_pnl} | Fees: $${closeRes.data.trade.fees}`);

  // Test 7: Verify Strategy Comparison & Multi-Account Analytics
  console.log('\nTest 7: Fetching Strategy Benchmark Analytics...');
  const compRes = await getJson('/api/analytics/compare');
  assert.strictEqual(compRes.status, 200, 'Analytics compare should return 200');
  console.log(`✅ Comparison Matrix calculated for ${compRes.data.comparison.length} demo accounts.`);

  // Test 8: Verify Trade History Export
  console.log('\nTest 8: Testing CSV Trade History Export...');
  const csvRes = await getJson('/api/trades/export');
  assert.strictEqual(csvRes.status, 200, 'CSV export should return 200');
  console.log('✅ CSV Export Generated Successfully');

  console.log('\n🎉 ALL 8 INTEGRATION TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
