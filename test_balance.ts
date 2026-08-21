import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
const usdcAbi = ["function balanceOf(address owner) view returns (uint256)", "function decimals() view returns (uint8)"];
const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);

async function run() {
  const bal = await usdcContract.balanceOf(wallet.address);
  const decimals = await usdcContract.decimals();
  let walletUsdc = parseFloat(ethers.formatUnits(bal, decimals));
  console.log("Wallet Address:", wallet.address);
  console.log("Live Balance USDC:", walletUsdc);
}
run();
