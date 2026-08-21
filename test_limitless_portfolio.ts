import { HttpClient, PortfolioFetcher } from "@limitless-exchange/sdk";
import dotenv from "dotenv";
dotenv.config();

const httpClient = new HttpClient({
  baseURL: 'https://api.limitless.exchange',
});
httpClient.setHMACCredentials({
  tokenId: process.env.LIMITLESS_API_KEY!,
  secret: process.env.LIMITLESS_API_SECRET!
});

const limitlessPortfolioFetcher = new PortfolioFetcher(httpClient);

async function run() {
  try {
    const profile = await limitlessPortfolioFetcher.getProfile();
    console.log("Profile ID:", profile.id, "Account:", profile.account);

    const positions = await limitlessPortfolioFetcher.getCLOBPositions();
    console.log("Positions:", JSON.stringify(positions, null, 2));
  } catch (e: any) {
    console.error(e.data || e);
  }
}
run();
