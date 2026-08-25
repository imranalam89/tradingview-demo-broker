const fs = require('fs');
const path = require('path');

function generateSession() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 12; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function prependHeader(str) {
  return `~m~${str.length}~m~${str}`;
}

function constructMessage(func, paramList) {
  return JSON.stringify({
    m: func,
    p: paramList
  });
}

function createMsg(func, paramList) {
  return prependHeader(constructMessage(func, paramList));
}

function fetchTradingViewData(symbol = 'OANDA:XAUUSD', resolution = '240', nBars = 1500) {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to TradingView WebSocket for ${symbol} (Resolution: ${resolution}, Bars: ${nBars})...`);
    
    const ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
      headers: {
        'Origin': 'https://www.tradingview.com',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const chartSession = 'cs_' + generateSession();
    let candleData = [];
    let timeoutId;

    ws.onopen = () => {
      console.log('Connected to TradingView WebSocket!');
      
      // Set auth token as unauthorized (guest)
      ws.send(createMsg('set_auth_token', ['unauthorized_user_token']));
      
      // Create chart session
      ws.send(createMsg('chart_create_session', [chartSession, '']));
      
      // Resolve symbol
      ws.send(createMsg('resolve_symbol', [
        chartSession,
        'symbol_1',
        `={"symbol":"${symbol}","adjustment":"splits","session":"regular"}`
      ]));

      // Request series bars
      ws.send(createMsg('create_series', [
        chartSession,
        's1',
        's1',
        'symbol_1',
        resolution,
        nBars
      ]));

      timeoutId = setTimeout(() => {
        console.log('Timeout waiting for data. Closing WebSocket.');
        ws.close();
        if (candleData.length > 0) {
          resolve(candleData);
        } else {
          reject(new Error('Timed out fetching TradingView data'));
        }
      }, 8000);
    };

    ws.onmessage = (event) => {
      const raw = event.data.toString();
      
      // Handle ping
      if (raw.includes('~m~')) {
        const parts = raw.split('~m~').filter(p => p && !/^\d+$/.test(p));
        for (const part of parts) {
          if (part.startsWith('~h~')) {
            // Heartbeat response
            ws.send(prependHeader(part));
            continue;
          }
          try {
            const json = JSON.parse(part);
            if (json.m === 'timescale_update') {
              const series = json.p[1]?.s1?.s;
              if (series && Array.isArray(series)) {
                console.log(`Received ${series.length} bars from TradingView.`);
                candleData = series.map(bar => {
                  const [time, open, high, low, close, volume] = bar.v;
                  const d = new Date(time * 1000);
                  const dateStr = d.toISOString().slice(0, 10);
                  const timeStr = d.toISOString().slice(11, 16);
                  return {
                    time: time,
                    open: parseFloat(open.toFixed(2)),
                    high: parseFloat(high.toFixed(2)),
                    low: parseFloat(low.toFixed(2)),
                    close: parseFloat(close.toFixed(2)),
                    volume: parseFloat((volume || 0).toFixed(0)),
                    datetimeStr: `${dateStr} ${timeStr}`
                  };
                });
                clearTimeout(timeoutId);
                ws.close();
                resolve(candleData);
              }
            }
          } catch (err) {
            // Ignore parse chunks
          }
        }
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      reject(err);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed.');
    };
  });
}

async function main() {
  try {
    const candles = await fetchTradingViewData('OANDA:XAUUSD', '240', 1500);
    console.log(`Successfully fetched ${candles.length} real TradingView 4H candles for OANDA:XAUUSD!`);
    console.log('Sample oldest bar:', candles[0]);
    console.log('Sample newest bar:', candles[candles.length - 1]);
    
    fs.writeFileSync(
      path.join(__dirname, 'tradingview_live_xauusd_4h.json'),
      JSON.stringify(candles, null, 2)
    );
    console.log('Saved data to tradingview_live_xauusd_4h.json');
  } catch (err) {
    console.error('Error fetching TradingView live data:', err);
  }
}

main();
