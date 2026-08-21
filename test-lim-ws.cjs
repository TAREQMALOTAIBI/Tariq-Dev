const WebSocket = require('ws');
const ws = new WebSocket('wss://ws.limitless.exchange');
ws.on('open', () => {
  console.log('Connected to Limitless WS successfully');
  ws.close();
});
ws.on('error', (err) => {
  console.error('Limitless WS Error:', err.message);
});
