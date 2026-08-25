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
  return JSON.stringify({ m: func, p: paramList });
}

function createMsg(func, paramList) {
  return prependHeader(constructMessage(func, paramList));
}

function fetchTradingViewData(symbol = 'OANDA:XAUUSD', resolution = '60', nBars = 3000) {
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
      ws.send(createMsg('set_auth_token', ['unauthorized_user_token']));
      ws.send(createMsg('chart_create_session', [chartSession, '']));
      ws.send(createMsg('resolve_symbol', [
        chartSession,
        'symbol_1',
        `={"symbol":"${symbol}","adjustment":"splits","session":"regular"}`
      ]));

      ws.send(createMsg('create_series', [
        chartSession,
        's1',
        's1',
        'symbol_1',
        resolution,
        nBars
      ]));

      timeoutId = setTimeout(() => {
        console.log(`Timeout waiting for data (${resolution}). Closing WebSocket.`);
        ws.close();
        if (candleData.length > 0) resolve(candleData);
        else reject(new Error(`Timed out fetching data for resolution ${resolution}`));
      }, 10000);
    };

    ws.onmessage = (event) => {
      const raw = event.data.toString();
      if (raw.includes('~m~')) {
        const parts = raw.split('~m~').filter(p => p && !/^\d+$/.test(p));
        for (const part of parts) {
          if (part.startsWith('~h~')) {
            ws.send(prependHeader(part));
            continue;
          }
          try {
            const json = JSON.parse(part);
            if (json.m === 'timescale_update') {
              const series = json.p[1]?.s1?.s;
              if (series && Array.isArray(series)) {
                candleData = series.map(bar => {
                  const [time, open, high, low, close, volume] = bar.v;
                  const d = new Date(time * 1000);
                  const dateStr = d.toISOString().slice(0, 10);
                  const timeStr = d.toISOString().slice(11, 16);
                  return {
                    time: time,
                    open: parseFloat(open),
                    high: parseFloat(high),
                    low: parseFloat(low),
                    close: parseFloat(close),
                    volume: parseFloat(volume || 0),
                    datetimeStr: `${dateStr} ${timeStr}`
                  };
                });
                clearTimeout(timeoutId);
                ws.close();
                resolve(candleData);
              }
            }
          } catch (err) {}
        }
      }
    };

    ws.onerror = (err) => {
      console.error(`WebSocket Error (${resolution}):`, err);
      reject(err);
    };

    ws.onclose = () => {};
  });
}

async function fetchMultiTimeframes() {
  const resolutions = [
    { res: 'D', name: 'Daily', file: 'xauusd_daily.json', bars: 500 },
    { res: '240', name: '4-Hour', file: 'xauusd_4h.json', bars: 1500 },
    { res: '60', name: '1-Hour', file: 'xauusd_1h.json', bars: 3000 },
    { res: '15', name: '15-Min', file: 'xauusd_15m.json', bars: 4000 }
  ];

  for (const item of resolutions) {
    try {
      const data = await fetchTradingViewData('OANDA:XAUUSD', item.res, item.bars);
      console.log(`✅ Fetched ${data.length} bars for ${item.name} (${item.res})!`);
      console.log(`   Range: ${data[0].datetimeStr} to ${data[data.length - 1].datetimeStr}`);
      fs.writeFileSync(path.join(__dirname, item.file), JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`❌ Failed fetching ${item.name}:`, e.message);
    }
  }
}

fetchMultiTimeframes();
