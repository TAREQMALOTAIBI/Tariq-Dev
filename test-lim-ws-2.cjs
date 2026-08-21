const WebSocket = require('ws');
const ws = new WebSocket('wss://ws.limitless.exchange', {
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
});
ws.on('open', () => {
  console.log('Connected');
  ws.close();
});
ws.on('error', (err) => console.error(err));
