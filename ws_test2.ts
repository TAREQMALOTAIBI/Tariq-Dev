import { WebSocketClient, HttpClient } from '@limitless-exchange/sdk';
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
        console.log('orderbookUpdate:', data.orderbook.adjustedMidpoint);
    });
    
    limitlessWsClient.on('newPriceData', (data: any) => {
        console.log('newPriceData:', data);
    });

    await limitlessWsClient.connect();
    // Try subscribing to orderbook instead? Or both.
    await limitlessWsClient.subscribe('subscribe_market_prices', { marketSlugs: [btcMarket.slug] });
    await limitlessWsClient.subscribe('subscribe_orderbook', { marketSlug: btcMarket.slug } as any);
    console.log("Subscribed");
  }
}
test();
