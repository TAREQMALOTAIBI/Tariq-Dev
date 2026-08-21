import { ethers } from "ethers";
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const usdcAbi = ["function balanceOf(address owner) view returns (uint256)", "function decimals() view returns (uint8)"];
const c = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);
c.decimals().then(console.log).catch(console.error);
