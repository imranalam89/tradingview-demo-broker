# Apex Broker — 24/7 TradingView Demo Broker & Trade Management Engine

A high-performance demo broker and automated trade execution engine built for testing Pine Script strategies in live market conditions 24/7 via TradingView webhooks.

---

## 🌟 Key Features

* **24/7 Automated Webhook Execution**: Connect TradingView strategy alerts directly to simulated live paper trades.
* **Realistic Broker Simulation**: Simulates taker fees (e.g. 0.04%), dynamic slippage, bid-ask spreads, and margin leverage.
* **Dynamic Trade Management**: Automated Stop Loss, Take Profit, Trailing Stop tracking, and liquidation protection.
* **Multi-Strategy Testing**: Run multiple demo accounts concurrently (e.g. Account 1: Gold Scalper, Account 2: BTC Momentum) and compare side-by-side performance over 7–14+ days.
* **Real-Time Market Feeds**: Live price feeds (Binance WebSocket for crypto, public FX feeds for Gold & Forex) to evaluate positions continuously.
* **Persistent SQLite Database**: Stores accounts, open positions, closed trades, equity curves, and webhook audit logs across restarts.
* **Security & Deduplication**: Secret key authentication, IP logging, and 3-second duplicate alert suppression.
* **Modern Broker Dashboard**: Dark-mode terminal with live equity curve, drawdown charts, position risk controls, signal simulator, and CSV export.

---

## 🚀 Quick Start (Local Run)

```bash
# 1. Install dependencies
npm install

# 2. Start the 24/7 backend engine & web terminal
npm start

# 3. Open your browser
# Web Terminal: http://localhost:3000
# Webhook URL:  http://localhost:3000/api/webhook
# Health Check: http://localhost:3000/api/health
```

---

## ☁️ 100% Free 24/7 Cloud Hosting Setup

To receive TradingView webhooks continuously 24/7 while your computer is turned off:

### Option A: Deploy Backend on Render.com (100% Free)
1. Push this project repository to **GitHub**.
2. Go to [Render.com](https://render.com) and click **New > Web Service**.
3. Select your GitHub repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **Deploy**. Render will generate a public URL like:  
   `https://apex-tradingview-broker.onrender.com`
6. **Keep it awake 24/7 for free**:  
   Create a free monitor on [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com) to ping `https://apex-tradingview-broker.onrender.com/api/health` every **5 minutes**.

### Option B: Deploy Backend on Koyeb (Free Tier)
1. Create a free account on [Koyeb](https://www.koyeb.com).
2. Connect your GitHub repository and deploy the Node.js app (Koyeb free instances do not sleep).

### Option C: Run on PC with Free Cloudflare Tunnel
If running on your local machine:
```bash
# Start your local server
npm start

# In a separate terminal, launch a free Cloudflare Tunnel
npx cloudflared tunnel --url http://localhost:3000
```
Cloudflare will give you a public HTTPS URL like:  
`https://your-tunnel-name.trycloudflare.com`

---

## 🌐 Netlify Frontend Deployment

1. Go to [Netlify](https://netlify.com) and choose **Import an existing project from GitHub**.
2. Netlify will detect `netlify.toml` automatically.
3. In `netlify.toml`, replace `https://your-backend-app.onrender.com` with your cloud backend URL.
4. Deploy the frontend to Netlify.

---

## 📡 TradingView Alert & Webhook Setup

### 1. Alert Webhook URL
In TradingView alert creation dialog, check **Webhook URL** and paste:
```
https://your-backend-app.onrender.com/api/webhook
```

### 2. Alert Message Format (JSON)

#### **BUY / LONG Signal:**
```json
{
  "secret": "antigravity_tv_secret_2026",
  "account_id": "demo_001",
  "symbol": "{{ticker}}",
  "action": "BUY",
  "quantity": 0.05,
  "stop_loss": 94500,
  "take_profit": 98000,
  "trailing_stop": 500,
  "strategy": "Apex Gold Scalper",
  "price": "{{close}}"
}
```

#### **SELL / SHORT Signal:**
```json
{
  "secret": "antigravity_tv_secret_2026",
  "account_id": "demo_001",
  "symbol": "{{ticker}}",
  "action": "SELL",
  "quantity": 0.05,
  "stop_loss": 97500,
  "take_profit": 93000,
  "trailing_stop": 500,
  "strategy": "Apex Gold Scalper",
  "price": "{{close}}"
}
```

#### **CLOSE / EXIT Signal:**
```json
{
  "secret": "antigravity_tv_secret_2026",
  "account_id": "demo_001",
  "symbol": "{{ticker}}",
  "action": "CLOSE"
}
```

---

## 📊 Pine Script Automated Alert Code Snippet

Add this snippet directly into your Pine Script strategy to automatically send webhooks on candle close:

```pinescript
// === Automated Webhook Alerts ===
var string WEBHOOK_SECRET = "antigravity_tv_secret_2026"
var string DEMO_ACCOUNT   = "demo_001" // Map to your desired demo account

if (longCondition)
    alert('{"secret":"' + WEBHOOK_SECRET + '","account_id":"' + DEMO_ACCOUNT + '","symbol":"' + syminfo.ticker + '","action":"BUY","quantity":0.05,"price":' + str.tostring(close) + ',"strategy":"' + syminfo.ticker + ' Strategy"}', alert.freq_once_per_bar_close)

if (shortCondition)
    alert('{"secret":"' + WEBHOOK_SECRET + '","account_id":"' + DEMO_ACCOUNT + '","symbol":"' + syminfo.ticker + '","action":"SELL","quantity":0.05,"price":' + str.tostring(close) + ',"strategy":"' + syminfo.ticker + ' Strategy"}', alert.freq_once_per_bar_close)

if (exitCondition)
    alert('{"secret":"' + WEBHOOK_SECRET + '","account_id":"' + DEMO_ACCOUNT + '","symbol":"' + syminfo.ticker + '","action":"CLOSE"}', alert.freq_once_per_bar_close)
```

---

## 🧪 Testing the Engine

Run the automated integration test suite:
```bash
# Start server in one terminal
npm start

# In another terminal:
npm test
```
