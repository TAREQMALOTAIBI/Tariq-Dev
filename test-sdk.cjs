const { HttpClient, LimitlessMarketFetcher, ConsoleLogger } = require("@limitless-exchange/limitless-exchange-sdk");
const logger = new ConsoleLogger('info');
const httpClient = new HttpClient({ logger, baseURL: 'https://api.limitless.exchange' });
const fetcher = new LimitlessMarketFetcher({ httpClient, logger });

fetcher.fetchMarkets().then(markets => {
  const btcMarket = markets.find(m => m.title && m.title.includes("Bitcoin price") && m.title.includes("15 min") && m.status === "ACTIVE");
  console.log("BTC Market:", btcMarket ? btcMarket.title : "Not found");
  if (btcMarket) console.log("Slug:", btcMarket.slug);
}).catch(console.error);
