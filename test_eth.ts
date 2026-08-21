import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

async function run() {
  const bal = await provider.getBalance(wallet.address);
  console.log("ETH Balance:", ethers.formatEther(bal));
}
run();
