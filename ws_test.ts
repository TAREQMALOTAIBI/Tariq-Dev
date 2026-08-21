import { WebSocketClient, HttpClient } from '@limitlessx/sdk';
async function test() {
  const httpClient = new HttpClient({ baseURL: 'https://api.limitless.exchange' });
  const res = await httpClient.get('/markets/active');
  const btcMarket = res.data.find((m: any) => m.slug.includes('btc-up-or-down-15-min'));
  
  if (btcMarket) {
    console.log(`Active BTC 15m market found: ${btcMarket.slug}`);
    const limitlessWsClient = new WebSocketClient({
      url: 'wss://ws.limitless.exchange',
      autoReconnect: true
    });
    
    limitlessWsClient.on('orderbookUpdate', (data: any) => {
      console.log('orderbookUpdate:', data);
    });
    
    limitlessWsClient.on('message', (data: any) => {
      console.log('message:', data);
    });
    
    limitlessWsClient.on('priceUpdate', (data: any) => {
      console.log('priceUpdate:', data);
    });

    limitlessWsClient.on('marketPriceUpdate', (data: any) => {
      console.log('marketPriceUpdate:', data);
    });

    await limitlessWsClient.connect();
    await limitlessWsClient.subscribe('subscribe_market_prices', { marketSlugs: [btcMarket.slug] });
    console.log("Subscribed");
  }
}
test();
