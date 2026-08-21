import { HttpClient, MarketFetcher } from "@limitless-exchange/sdk";
import dotenv from "dotenv";
dotenv.config();

const httpClient = new HttpClient({ baseURL: 'https://api.limitless.exchange' });
const marketFetcher = new MarketFetcher(httpClient);

async function run() {
  try {
    const res = await marketFetcher.getActiveMarkets({ limit: 20, sortBy: 'newest' });
    const btcMarket = res.data.find(m => m.slug.includes('btc-up-or-down-15-min'));
    console.log("Found Active:", btcMarket?.slug, btcMarket?.title);
  } catch(e) {
    console.error(e);
  }
}
run();
