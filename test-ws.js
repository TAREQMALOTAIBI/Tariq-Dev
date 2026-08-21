const WebSocket = require('ws');

const urls = [
  "wss://stream.binance.com:9443/ws/btcusdt@kline_1m",
  "wss://data-stream.binance.vision:9443/ws/btcusdt@kline_1m",
  "wss://stream.binance.us:9443/ws/btcusdt@kline_1m"
];

urls.forEach(url => {
  const ws = new WebSocket(url);
  ws.on('open', () => {
    console.log(`Connected to ${url}`);
    ws.close();
  });
  ws.on('error', (err) => {
    console.error(`Failed ${url}: ${err.message}`);
  });
});
