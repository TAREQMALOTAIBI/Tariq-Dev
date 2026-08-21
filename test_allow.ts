import { HttpClient } from "@limitless-exchange/sdk";
import dotenv from "dotenv";
dotenv.config();

const httpClient = new HttpClient({
  baseURL: 'https://api.limitless.exchange',
});
httpClient.setHMACCredentials({
  tokenId: process.env.LIMITLESS_API_KEY!,
  secret: process.env.LIMITLESS_API_SECRET!
});

async function run() {
  try {
    const res = await httpClient.get('/portfolio/trading/allowance?type=clob');
    console.log(res);
  } catch (e: any) {
    console.error(e.data);
  }
}
run();
