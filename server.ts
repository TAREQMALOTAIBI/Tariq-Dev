import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import WebSocket from "ws";
import { ethers } from "ethers";
import {
  HttpClient,
  MarketFetcher,
  MarketPageFetcher,
  OrderClient,
  OrderType,
  Side,
  WebSocketClient,
  PortfolioFetcher,
  APIError,
  withRetry,
  ConsoleLogger
} from "@limitless-exchange/sdk";

class OrderQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private minDelayMs: number;

  constructor(minDelayMs = 150) {
    this.minDelayMs = minDelayMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      await new Promise((r) => setTimeout(r, this.minDelayMs));
    }

    this.processing = false;
  }
}

const orderQueue = new OrderQueue(150);
const app = express();
const PORT = 3000;

app.use(express.json());

// Application State: Strictly LIVE Trading Mode
const mode: "LIVE" = "LIVE";
let liveBalance = 0.00;
let paperBalance = 0.00;
let isUpdatingBalance = false;
let lastBalanceUpdate = 0;

// Limitless SDK Setup
let limitlessOrderClient: OrderClient | null = null;
let limitlessMarketFetcher: MarketFetcher | null = null;
let limitlessMarketPageFetcher: MarketPageFetcher | null = null;
let limitlessPortfolioFetcher: PortfolioFetcher | null = null;
let limitlessWsClient: WebSocketClient | null = null;
let activeContractSlug: string | null = null;
let currentYesPrice: number = 0.50; // UP / YES contract price on Limitless
let currentNoPrice: number = 0.50;  // DOWN / NO contract price on Limitless
let currentContractPrice: number = 0.50;
let currentWindowStrikePrice: number | null = null;
let windowStartTime: number = Date.now();
let walletAddress: string | null = null;
let usdcContract: ethers.Contract | null = null;
let walletSigner: ethers.Wallet | null = null;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
const usdcAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) public returns (bool)"
];

let rpcStatus: { connected: boolean; rpcUrlType: string; latencyMs?: number; blockNumber?: number } = {
  connected: false,
  rpcUrlType: "Default Public Base RPC"
};

// RPC Connection verification
async function testRpcProvider(provider: ethers.JsonRpcProvider, rawRpcUrl?: string) {
  const isAlchemy = rawRpcUrl?.includes("alchemy.com");
  const rpcType = isAlchemy ? "Alchemy Dedicated RPC" : rawRpcUrl ? "Custom Private RPC" : "Default Public Base RPC";
  rpcStatus.rpcUrlType = rpcType;
  
  try {
    const startTime = Date.now();
    const blockNumber = await provider.getBlockNumber();
    const latencyMs = Date.now() - startTime;
    rpcStatus.connected = true;
    rpcStatus.blockNumber = blockNumber;
    rpcStatus.latencyMs = latencyMs;
    addLog("SUCCESS", `⚡ RPC Connected (${rpcType}): Block #${blockNumber} (Latency: ${latencyMs}ms)`);
  } catch (err: any) {
    rpcStatus.connected = false;
    addLog("ERROR", `❌ RPC Connection Failed (${rpcType}): ${err?.message || err}`);
  }
}

// Log buffer for frontend streaming
const systemLogs: Array<{ time: number; type: "INFO" | "ALERT" | "SUCCESS" | "WARN" | "ERROR"; message: string }> = [];

function addLog(type: "INFO" | "ALERT" | "SUCCESS" | "WARN" | "ERROR", message: string) {
  const logEntry = { time: Date.now(), type, message };
  systemLogs.unshift(logEntry);
  if (systemLogs.length > 100) systemLogs.pop();
  broadcast("log", logEntry);
}

// Data & Memory Engine
interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isFinal: boolean;
}

let candleMemory: CandleData[] = [];
let currentPrice = 0;
let lastBinanceTickTime = Date.now();
let lastLimitlessQuoteTime = Date.now();
let lastArbExecutionTime = 0;
let lastTradeWindowIndex: number | null = null;
let isBotRunning = false;

// Latency & Cross-Exchange Statistical Arbitrage Metrics
interface LatencyArbMetrics {
  binancePrice: number;
  strikePrice: number;
  priceDeltaUsd: number;
  priceDeltaPct: number;
  fairYesPrice: number;
  fairNoPrice: number;
  marketYesPrice: number;
  marketNoPrice: number;
  yesSpreadGap: number; // Fair YES - Market YES
  noSpreadGap: number;  // Fair NO - Market NO
  activeOpportunity: "BUY_UP_ARB" | "BUY_DOWN_ARB" | "NEUTRAL";
  arbEdgePct: number;
  estimatedNetProfitPct: number;
  binanceLatencyMs: number;
  limitlessLatencyMs: number;
  minArbThreshold: number; // Configurable threshold (e.g. 0.10)
  minute: number;
  windowMinute: number;
  secondsRemainingInWindow: number;
  isWindowActive: boolean;
  time: number;
}

let minArbThreshold = 0.10; // 10% minimum statistical price discrepancy
let riskPercentage = 0.04; // 4% risk allocation per trade
let latestArbMetrics: LatencyArbMetrics | null = null;

// Position & Trade tracking
interface PositionTrade {
  id: string;
  orderId?: string;
  tpOrderId?: string;
  marketSlug?: string;
  time: number;
  direction: "YES" | "NO";
  entryPrice: number;
  strikePrice: number;
  contractPrice: number;
  amount: number;
  shares: number;
  mode: string;
  orderType: string;
  windowIndex: number;
  targetPayout: number;
  settlementPayout?: number;
  pnl?: number;
  status: string;
  tokenId?: string;
  strategyType: "LATENCY_ARB" | "CONVERGENCE_HARVEST";
  arbMetrics?: {
    fairPrice: number;
    marketPrice: number;
    spreadGap: number;
    binancePriceAtTrigger: number;
    strikeAtTrigger: number;
    executionSpeedMs: number;
  };
}

const tradeHistory: PositionTrade[] = [];

// Mathematical Helper: Standard Normal Cumulative Distribution Function (Abramowitz & Stegun approximation)
function normalCDF(x: number): number {
  if (isNaN(x)) return 0.5;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// Compute Volatility from Recent 1m Candles (Annualized/15m standard deviation)
function calculateRollingVolatility(): number {
  if (candleMemory.length < 10) return 0.0035; // Default 0.35% per 15-min
  const returns: number[] = [];
  for (let i = 1; i < candleMemory.length; i++) {
    const prev = candleMemory[i - 1].close;
    const curr = candleMemory[i].close;
    if (prev > 0) {
      returns.push(Math.log(curr / prev));
    }
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const standardDev = Math.sqrt(variance);
  return Math.max(standardDev, 0.001);
}

// Real-Time Cross-Exchange & Latency Arbitrage Evaluator
function evaluateLatencyArbitrage(currentBtcPrice: number) {
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSeconds = now.getSeconds();
  const windowMinute = currentMinute % 15;
  const currentWindowIndex = Math.floor(now.getTime() / (15 * 60 * 1000));

  // If at start of 15m window or strike not set, record Strike Price
  if (currentWindowStrikePrice === null || windowMinute === 0 && currentSeconds < 10) {
    if (currentWindowStrikePrice === null || Math.floor((now.getTime() - windowStartTime) / (15 * 60 * 1000)) > 0) {
      currentWindowStrikePrice = currentBtcPrice;
      windowStartTime = now.getTime();
      addLog("INFO", `🎯 New 15m BTC Cycle Initialized! Strike Price Fixed at: $${currentBtcPrice.toFixed(2)}`);
    }
  }

  const strike = currentWindowStrikePrice || currentBtcPrice;
  const priceDeltaUsd = Number((currentBtcPrice - strike).toFixed(2));
  const priceDeltaPct = Number(((priceDeltaUsd / strike) * 100).toFixed(3));

  // Time remaining in current 15m cycle (seconds)
  const secondsElapsed = (windowMinute * 60) + currentSeconds;
  const secondsRemainingInWindow = Math.max(900 - secondsElapsed, 5);
  const timeFraction = secondsRemainingInWindow / 900; // Fraction of 15-min remaining

  // Dynamic Volatility of BTC in 15-min timeframe
  const vol = calculateRollingVolatility() * Math.sqrt(Math.max(timeFraction, 0.05)) * strike;

  // Real-time Theoretical / Fair Binary Option Probability via d2 normal cumulative distribution:
  // z = (P_t - Strike) / (Volatility_window)
  const zScore = vol > 0 ? priceDeltaUsd / vol : 0;
  
  let rawFairYes = normalCDF(zScore);
  // Boundary clamping for realistic market pricing
  rawFairYes = Math.max(0.03, Math.min(0.97, rawFairYes));
  
  const fairYesPrice = Number(rawFairYes.toFixed(2));
  const fairNoPrice = Number((1 - fairYesPrice).toFixed(2));

  // Calculate Instantaneous Spread Gap against Limitless Live Orderbook Quotes
  const yesSpreadGap = Number((fairYesPrice - currentYesPrice).toFixed(2));
  const noSpreadGap = Number((fairNoPrice - currentNoPrice).toFixed(2));

  // Arbitrage Opportunity Detection:
  // Condition 1: Fair Price exceeds Market Price by at least minArbThreshold (e.g. +10%)
  // Condition 2: Not in the extreme last 30 seconds of the window to avoid settlement race
  let activeOpportunity: "BUY_UP_ARB" | "BUY_DOWN_ARB" | "NEUTRAL" = "NEUTRAL";
  let arbEdgePct = 0;
  let estimatedNetProfitPct = 0;

  const isWindowActive = secondsRemainingInWindow > 30 && secondsRemainingInWindow < 870;

  if (isWindowActive) {
    if (yesSpreadGap >= minArbThreshold && currentYesPrice <= 0.85) {
      activeOpportunity = "BUY_UP_ARB";
      arbEdgePct = Number(((yesSpreadGap / currentYesPrice) * 100).toFixed(1));
      estimatedNetProfitPct = Number((((1.00 - currentYesPrice) / currentYesPrice) * 100).toFixed(1));
    } else if (noSpreadGap >= minArbThreshold && currentNoPrice <= 0.85) {
      activeOpportunity = "BUY_DOWN_ARB";
      arbEdgePct = Number(((noSpreadGap / currentNoPrice) * 100).toFixed(1));
      estimatedNetProfitPct = Number((((1.00 - currentNoPrice) / currentNoPrice) * 100).toFixed(1));
    }
  }

  const binanceLatencyMs = Math.max(0, Date.now() - lastBinanceTickTime);
  const limitlessLatencyMs = Math.max(0, Date.now() - lastLimitlessQuoteTime);

  latestArbMetrics = {
    binancePrice: currentBtcPrice,
    strikePrice: strike,
    priceDeltaUsd,
    priceDeltaPct,
    fairYesPrice,
    fairNoPrice,
    marketYesPrice: currentYesPrice,
    marketNoPrice: currentNoPrice,
    yesSpreadGap,
    noSpreadGap,
    activeOpportunity,
    arbEdgePct,
    estimatedNetProfitPct,
    binanceLatencyMs,
    limitlessLatencyMs,
    minArbThreshold,
    minute: currentMinute,
    windowMinute,
    secondsRemainingInWindow,
    isWindowActive,
    time: Date.now()
  };

  broadcast("latency_arb_update", latestArbMetrics);

  // AUTOMATED LATENCY ARBITRAGE EXECUTION TRIGGER
  if (isBotRunning && isWindowActive && activeOpportunity !== "NEUTRAL") {
    // Throttle: Don't execute more than once every 12 seconds per direction
    if (Date.now() - lastArbExecutionTime > 12000) {
      lastArbExecutionTime = Date.now();
      
      const direction: "YES" | "NO" = activeOpportunity === "BUY_UP_ARB" ? "YES" : "NO";
      const targetMarketPrice = direction === "YES" ? currentYesPrice : currentNoPrice;
      const targetFairPrice = direction === "YES" ? fairYesPrice : fairNoPrice;
      const spread = direction === "YES" ? yesSpreadGap : noSpreadGap;

      addLog("ALERT", `⚡ [LATENCY ARB OPPORTUNITY DETECTED] Direction: ${direction} | Fair: $${targetFairPrice.toFixed(2)} vs Market: $${targetMarketPrice.toFixed(2)} (Edge: +${(spread * 100).toFixed(0)}%) | BTC: $${currentBtcPrice.toFixed(2)} (Δ: $${priceDeltaUsd})`);

      executeLatencyArbTrade(direction, currentBtcPrice, strike, targetMarketPrice, targetFairPrice, spread, currentWindowIndex);
    }
  }
}

// Instant Execution Engine for Latency Arbitrage Orders
async function executeLatencyArbTrade(
  direction: "YES" | "NO",
  binancePrice: number,
  strikePrice: number,
  marketPrice: number,
  fairPrice: number,
  spreadGap: number,
  windowIndex: number
) {
  const currentBalance = liveBalance;
  // Dynamic Risk Allocation: configurable % of wallet balance per Latency Arb opportunity (default 5%)
  let tradeAmount = currentBalance > 0 ? (currentBalance * riskPercentage) : 0;
  tradeAmount = Math.floor(tradeAmount * 100) / 100;

  if (tradeAmount < 0.50) {
    tradeAmount = Math.min(1.00, Math.floor(currentBalance * 100) / 100);
  }

  if (tradeAmount <= 0) {
    addLog("WARN", `Latency Arb trade (${direction}) skipped: live balance ($${currentBalance.toFixed(2)}) is insufficient.`);
    return;
  }

  // Ensure reasonable execution price with slight slippage buffer
  const executionPrice = Number((Math.min(marketPrice + 0.02, fairPrice - 0.02, 0.88)).toFixed(2));
  const shares = Number((tradeAmount / executionPrice).toFixed(2));
  tradeAmount = Number((shares * executionPrice).toFixed(2));

  const startTime = Date.now();

  const tradeDetails: PositionTrade = {
    id: Math.random().toString(36).substring(2, 9),
    time: Date.now(),
    direction,
    entryPrice: binancePrice,
    strikePrice,
    contractPrice: executionPrice,
    amount: tradeAmount,
    shares,
    mode,
    orderType: "FOK / GTC (ARB)",
    windowIndex,
    targetPayout: Number((shares * 1.00).toFixed(2)),
    status: "PLACED (LATENCY ARB BUY)",
    strategyType: "LATENCY_ARB",
    arbMetrics: {
      fairPrice,
      marketPrice,
      spreadGap,
      binancePriceAtTrigger: binancePrice,
      strikeAtTrigger: strikePrice,
      executionSpeedMs: 0
    }
  };

  if (!limitlessOrderClient || !limitlessMarketFetcher || !activeContractSlug) {
    const reason = !limitlessOrderClient ? "ERROR (Missing API Keys / Private Key)" : "ERROR (No Active Market)";
    tradeDetails.status = reason;
    tradeHistory.unshift(tradeDetails);
    if (tradeHistory.length > 50) tradeHistory.pop();
    broadcast("trade", tradeDetails);
    addLog("ERROR", `LIVE Latency Arb order failed: ${reason}`);
    return;
  }

  try {
    const market = await withRetry(
      () => limitlessMarketFetcher!.getMarket(activeContractSlug!),
      { statusCodes: [429, 500, 502, 503, 504], maxRetries: 2 }
    );
    const tokenId = direction === "YES" ? market.tokens.yes : market.tokens.no;
    tradeDetails.tokenId = tokenId;
    tradeDetails.marketSlug = market.slug;

    addLog("INFO", `🚀 [ORDER DISPATCH] Sending LIVE Latency Arb Buy for ${direction} @ $${executionPrice.toFixed(2)} (${shares} shares, Edge: +${(spreadGap * 100).toFixed(0)}%)...`);

    const result: any = await orderQueue.enqueue(() =>
      withRetry(
        () => limitlessOrderClient!.createOrder({
          marketSlug: market.slug,
          tokenId: tokenId,
          side: Side.BUY,
          price: executionPrice,
          size: shares,
          orderType: OrderType.GTC,
          ...( { stpPolicy: "cancel_maker" } as any ),
        }),
        {
          statusCodes: [425, 429, 500, 502, 503, 504],
          maxRetries: 2,
        }
      )
    );

    const execSpeedMs = Date.now() - startTime;
    if (tradeDetails.arbMetrics) {
      tradeDetails.arbMetrics.executionSpeedMs = execSpeedMs;
    }

    const orderId = result?.order?.id || result?.orderId || result?.id || "N/A";
    tradeDetails.orderId = orderId;
    const isFilledImmediately = Boolean(result && (result.makerMatches?.length > 0 || result.execution?.settlementStatus === "SETTLED"));

    if (result?.execution?.settlementStatus === "CANCELED" && result?.execution?.reason === "STP_TAKER_REJECTED") {
      tradeDetails.status = "REJECTED (STP)";
      addLog("WARN", `⚠️ Latency Arb Order rejected by STP.`);
    } else if (isFilledImmediately) {
      tradeDetails.status = `FILLED (ARB MATCHED in ${execSpeedMs}ms)`;
      addLog("SUCCESS", `🎯 LIVE LATENCY ARB FILLED in ${execSpeedMs}ms! Direction: ${direction} [ID: ${orderId}] @ $${executionPrice.toFixed(2)} (${shares} shares). Value locked: $${tradeAmount.toFixed(2)}.`);
      
      // Auto Take-Profit Limit Sell when quote converges to Fair Value (or +25% profit)
      const tpTargetPrice = Number((Math.min(Math.max(fairPrice, executionPrice + 0.15), 0.95)).toFixed(2));
      placeTakeProfitSell(market.slug, tokenId, shares, tradeDetails, tpTargetPrice);
    } else {
      tradeDetails.status = "OPEN (ARB LIMIT ORDER IN BOOK)";
      addLog("SUCCESS", `⚡ LIVE ARB ORDER SUBMITTED in ${execSpeedMs}ms: Sitting in Limitless Orderbook [ID: ${orderId}] for ${direction} @ $${executionPrice.toFixed(2)}.`);
    }

    tradeHistory.unshift(tradeDetails);
    if (tradeHistory.length > 50) tradeHistory.pop();
    broadcast("trade", tradeDetails);
    setTimeout(updateLiveBalance, 1500);
  } catch (error: any) {
    console.error("Error executing Latency Arb trade:", error);
    const errMessage = error?.data?.message || error?.message || "Unknown error";
    tradeDetails.status = `ERROR (${errMessage})`;
    tradeHistory.unshift(tradeDetails);
    if (tradeHistory.length > 50) tradeHistory.pop();
    broadcast("trade", tradeDetails);
    addLog("ERROR", `❌ LIVE LATENCY ARB FAILED: ${errMessage}`);
  }
}

async function placeTakeProfitSell(marketSlug: string, tokenId: string, shares: number, parentTrade: PositionTrade, tpPrice = 0.85) {
  try {
    addLog("INFO", `📈 Placing Statistical Convergence Take-Profit Limit Sell for ${parentTrade.direction} @ $${tpPrice.toFixed(2)} (${shares} shares)...`);
    const sellResult: any = await orderQueue.enqueue(() =>
      withRetry(
        () => limitlessOrderClient!.createOrder({
          marketSlug,
          tokenId,
          side: Side.SELL,
          price: tpPrice,
          size: shares,
          orderType: OrderType.GTC,
          ...( { stpPolicy: "cancel_maker" } as any ),
        }),
        {
          statusCodes: [425, 429, 500, 502, 503, 504],
          maxRetries: 2
        }
      )
    );
    const sellOrderId = sellResult?.order?.id || sellResult?.orderId || sellResult?.id || "N/A";
    parentTrade.tpOrderId = sellOrderId;
    parentTrade.status = `TP_ACTIVE (LIMIT SELL @ $${tpPrice.toFixed(2)})`;
    addLog("SUCCESS", `🚀 TAKE-PROFIT ORDER LIVE: Limit Sell [ID: ${sellOrderId}] placed @ $${tpPrice.toFixed(2)}!`);
    broadcast("trade", parentTrade);
  } catch (tpErr: any) {
    console.warn("Error placing take-profit sell order:", tpErr?.message || tpErr);
    addLog("WARN", `⚠️ Could not place instant TP Sell @ $${tpPrice.toFixed(2)}: ${tpErr.message}. Holding for settlement.`);
  }
}

// Live USDC & Limitless Portfolio Balance updating
async function updateLiveBalance() {
  if (isUpdatingBalance) return;
  if (Date.now() - lastBalanceUpdate < 4000) return;

  if (usdcContract && walletAddress) {
    isUpdatingBalance = true;
    try {
      const bal = await usdcContract.balanceOf(walletAddress);
      const decimals = 6;
      let walletUsdc = parseFloat(ethers.formatUnits(bal, decimals));
      let totalPortfolioValue = walletUsdc;

      if (limitlessPortfolioFetcher) {
        try {
          const positions = await limitlessPortfolioFetcher.getCLOBPositions();
          let positionsValue = 0;
          for (const pos of positions) {
            positionsValue += (Number(pos.positions.yes.cost || 0) / 1000000) + (Number(pos.positions.yes.unrealizedPnl || 0) / 1000000);
            positionsValue += (Number(pos.positions.no.cost || 0) / 1000000) + (Number(pos.positions.no.unrealizedPnl || 0) / 1000000);
          }
          totalPortfolioValue += positionsValue;
        } catch (portErr: any) {
          if (portErr instanceof APIError) {
            console.error(`Portfolio APIError (${portErr.status}): ${portErr.message}`);
          }
        }
      }

      liveBalance = totalPortfolioValue;
      lastBalanceUpdate = Date.now();
      broadcast("balance", { paperBalance, liveBalance });
    } catch (e: any) {
      console.error("Failed to fetch live balance:", e);
    } finally {
      isUpdatingBalance = false;
    }
  }
}

async function initializeLimitlessClient() {
  try {
    const tokenId = process.env.LMTS_TOKEN_ID || process.env.LIMITLESS_API_KEY;
    const tokenSecret = process.env.LMTS_TOKEN_SECRET || process.env.LIMITLESS_API_SECRET;
    const privateKey = process.env.PRIVATE_KEY;

    const logger = new ConsoleLogger('info');
    const httpClientConfig: any = {
      logger,
      baseURL: 'https://api.limitless.exchange',
    };

    if (tokenId && tokenSecret) {
      httpClientConfig.hmacCredentials = { tokenId, secret: tokenSecret };
    }

    const httpClient = new HttpClient(httpClientConfig);

    if (tokenId && tokenSecret && privateKey) {
      const rawRpc = process.env.RPC_URL;
      const provider = new ethers.JsonRpcProvider(rawRpc || 'https://mainnet.base.org');
      
      await testRpcProvider(provider, rawRpc);

      walletSigner = new ethers.Wallet(privateKey, provider);
      walletAddress = walletSigner.address;
      usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);

      limitlessMarketFetcher = new MarketFetcher(httpClient);
      limitlessPortfolioFetcher = new PortfolioFetcher(httpClient);
      limitlessMarketPageFetcher = new MarketPageFetcher(httpClient);

      limitlessOrderClient = new OrderClient({
        httpClient,
        wallet: walletSigner,
        marketFetcher: limitlessMarketFetcher,
      });

      addLog("SUCCESS", `Limitless Latency Arbitrage Engine Initialized with wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`);
      await updateLiveBalance();
    } else {
      console.warn("Limitless credentials missing. LIVE mode will fail. Fetching public market data.");
      limitlessMarketFetcher = new MarketFetcher(httpClient);
    }

    const wsLogger: any = {
      level: 'info',
      debug: (msg: string, meta?: any) => logger.debug(msg, meta),
      info: (msg: string, meta?: any) => logger.info(msg, meta),
      warn: (msg: string, meta?: any) => logger.warn(msg, meta),
      error: (msg: string, err?: any, meta?: any) => {
        const errText = err?.message || String(err || '');
        if (msg?.includes('Failed to re-subscribe') || errText.includes('WebSocket not connected')) {
          logger.debug(msg, { errText, meta });
          return;
        }
        logger.error(msg, err, meta);
      }
    };

    const wsConfig: any = {
      url: 'wss://ws.limitless.exchange',
      autoReconnect: true,
      logger: wsLogger,
    };
    if (tokenId && tokenSecret) {
      wsConfig.hmacCredentials = { tokenId, secret: tokenSecret };
    }

    limitlessWsClient = new WebSocketClient(wsConfig, wsLogger);

    limitlessWsClient.on('orderbookUpdate', (data: any) => {
      lastLimitlessQuoteTime = Date.now();
      if (data && data.orderbook && (data.marketSlug === activeContractSlug || !activeContractSlug)) {
        if (data.marketSlug && !activeContractSlug) {
          activeContractSlug = data.marketSlug;
        }
        const asks = data.orderbook.asks;
        const bids = data.orderbook.bids;
        if (asks && asks.length > 0) {
          const bestAskPrice = Number(asks[0].price);
          if (bestAskPrice > 0 && bestAskPrice < 1) {
            currentYesPrice = Number(bestAskPrice.toFixed(2));
          }
        }
        if (bids && bids.length > 0) {
          const bestBidPrice = Number(bids[0].price);
          if (bestBidPrice > 0 && bestBidPrice < 1) {
            currentNoPrice = Number((1 - bestBidPrice).toFixed(2));
          }
        }
        broadcast("contract_price", {
          price: currentYesPrice,
          yesPrice: currentYesPrice,
          noPrice: currentNoPrice,
          slug: activeContractSlug
        });
        if (currentPrice > 0) {
          evaluateLatencyArbitrage(currentPrice);
        }
      }
    });

    limitlessWsClient.on('newPriceData', (data: any) => {
      lastLimitlessQuoteTime = Date.now();
      if (data && data.updatedPrices) {
        const yesP = Number(data.updatedPrices.yes ?? (data.updatedPrices[0]?.yesPrice ?? data.updatedPrices[0]?.price));
        const noP = Number(data.updatedPrices.no ?? (data.updatedPrices[0]?.noPrice));
        if (yesP > 0 && yesP < 1) {
          currentYesPrice = Number(yesP.toFixed(2));
        }
        if (noP > 0 && noP < 1) {
          currentNoPrice = Number(noP.toFixed(2));
        } else if (yesP > 0 && yesP < 1) {
          currentNoPrice = Number((1 - yesP).toFixed(2));
        }
        broadcast("contract_price", {
          price: currentYesPrice,
          yesPrice: currentYesPrice,
          noPrice: currentNoPrice,
          slug: activeContractSlug
        });
        if (currentPrice > 0) {
          evaluateLatencyArbitrage(currentPrice);
        }
      }
    });

    limitlessWsClient.on('positions', (data: any) => {
      console.log('[Limitless WS] Real-time positions update:', JSON.stringify(data));
      updateLiveBalance();
    });

    limitlessWsClient.on('orderEvent', async (event: any) => {
      try {
        if (event.source === 'OME') {
          console.log(`[Limitless WS] OME Order ${event.type}: OrderID ${event.orderId} | Side: ${event.side} | Price: ${event.price}`);
          addLog("INFO", `⚡ WS OME Order ${event.type}: ID ${event.orderId?.slice(0, 8)}... (${event.side} @ $${event.price})`);

          const eventType = (event.type || '').toUpperCase();
          if (eventType === 'MATCHED' || eventType === 'FILLED' || eventType === 'PARTIAL_FILL') {
            const matchingTrade = tradeHistory.find(
              (t) => (t.orderId === event.orderId || t.tokenId === event.tokenId) && 
                     (t.status.includes("OPEN") || t.status.includes("PLACED"))
            );

            if (matchingTrade && !matchingTrade.tpOrderId && !matchingTrade.status.includes("TP_ACTIVE")) {
              matchingTrade.status = `FILLED (ARB MATCHED @ $${matchingTrade.contractPrice.toFixed(2)})`;
              addLog("SUCCESS", `🎯 [WS Fill Detected] Latency Arb Buy Matched for ${matchingTrade.direction} [ID: ${event.orderId}]!`);

              if (matchingTrade.marketSlug && matchingTrade.tokenId) {
                const tpTarget = Number((Math.min(matchingTrade.contractPrice + 0.20, 0.90)).toFixed(2));
                await placeTakeProfitSell(matchingTrade.marketSlug, matchingTrade.tokenId, matchingTrade.shares, matchingTrade, tpTarget);
              }
            } else if (matchingTrade && matchingTrade.tpOrderId === event.orderId && event.side === 'SELL') {
              matchingTrade.status = `PROFIT_TAKEN (ARB CONVERGED @ $${event.price})`;
              matchingTrade.pnl = Number((matchingTrade.shares * Number(event.price) - matchingTrade.amount).toFixed(2));
              addLog("SUCCESS", `💰🎉 [TAKE PROFIT HIT] Arb Position closed @ $${event.price}! Profit: +$${matchingTrade.pnl.toFixed(2)}`);
              broadcast("trade", matchingTrade);
              setTimeout(updateLiveBalance, 1500);
            }
          }
        } else if (event.source === 'SETTLEMENT') {
          console.log(`[Limitless WS] Settlement ${event.type}: OrderID ${event.orderId} | Tx: ${event.txHash}`);
          addLog("SUCCESS", `🎯 WS Settlement ${event.type}: Order ID ${event.orderId?.slice(0, 8)}...`);
          updateLiveBalance();
        }
      } catch (err: any) {
        console.warn("Error handling WS orderEvent:", err?.message || err);
      }
    });

    limitlessWsClient.on('marketCreated', (data: any) => {
      if (data && data.slug) {
        const s = (data.slug || '').toLowerCase();
        const t = (data.title || '').toLowerCase();
        const isBtc = s.includes('btc') || t.includes('btc') || s.includes('bitcoin') || t.includes('bitcoin');
        const is15m = s.includes('15') || t.includes('15') || s.includes('15m') || t.includes('15-min');
        
        if (isBtc && is15m) {
          activeContractSlug = data.slug;
          currentWindowStrikePrice = currentPrice > 0 ? currentPrice : null;
          windowStartTime = Date.now();
          addLog("INFO", `⚡ New 15m BTC Market Created on Limitless via WebSocket: ${data.slug}`);
          if (limitlessWsClient && limitlessWsClient.isConnected()) {
            limitlessWsClient.subscribe('subscribe_market_prices', { marketSlugs: [data.slug] }).catch(() => {});
          }
        }
      }
    });

    limitlessWsClient.on('marketResolved', (data: any) => {
      if (data && data.slug === activeContractSlug) {
        addLog("INFO", `🏁 15m BTC Market Resolved on Limitless: ${data.slug} | Winner: ${data.winningOutcome}. Refreshing active contract...`);
        setTimeout(syncActiveMarket, 1000);
      }
    });

    limitlessWsClient.on('disconnect', (reason: string) => {
      addLog("WARN", `⚠️ Limitless WebSocket Disconnected (${reason}). Auto-reconnect active.`);
    });

    (limitlessWsClient as any).on('reconnect', () => {
      addLog("INFO", "🔄 Limitless WebSocket reconnected.");
    });

    try {
      await limitlessWsClient.connect();
      addLog("SUCCESS", "⚡ Limitless WebSocket Connected for Real-Time Latency Arbitrage Price Feeds!");
      
      if (tokenId && tokenSecret) {
        await limitlessWsClient.subscribe('subscribe_positions').catch(() => {});
        await limitlessWsClient.subscribe('subscribe_order_events').catch(() => {});
        await limitlessWsClient.subscribe('subscribe_transactions').catch(() => {});
        addLog("SUCCESS", "🔐 Subscribed to Limitless Authenticated Streams");
      }
    } catch (wsErr) {
      console.warn("Limitless WebSocket connection deferred:", wsErr);
    }

    let lastSubscribedSlug: string | null = null;
    const syncActiveMarket = async () => {
      try {
        if (!limitlessMarketFetcher) return;
        
        const allFetchedMarkets: any[] = [];
        try {
          const p1 = await limitlessMarketFetcher.getActiveMarkets({ limit: 25, page: 1, sortBy: 'newest' });
          if (p1?.data) allFetchedMarkets.push(...p1.data);
          
          const p2 = await limitlessMarketFetcher.getActiveMarkets({ limit: 25, page: 2, sortBy: 'newest' });
          if (p2?.data) allFetchedMarkets.push(...p2.data);

          const pEnding = await limitlessMarketFetcher.getActiveMarkets({ limit: 25, page: 1, sortBy: 'ending_soon' });
          if (pEnding?.data) allFetchedMarkets.push(...pEnding.data);
        } catch (fetchErr: any) {
          console.warn("MarketFetcher pagination notice:", fetchErr?.message || fetchErr);
        }

        if (limitlessMarketPageFetcher) {
          try {
            const cryptoPage = await limitlessMarketPageFetcher.getMarketPageByPath('/crypto');
            if (cryptoPage?.id) {
              const pageMarkets = await limitlessMarketPageFetcher.getMarkets(cryptoPage.id, {
                limit: 25,
                sort: '-updatedAt',
                filters: { ticker: 'btc' }
              });
              if (pageMarkets?.data) {
                allFetchedMarkets.push(...pageMarkets.data);
              }
            }
          } catch (pageErr: any) {
            console.warn("MarketPageFetcher notice:", pageErr?.message || pageErr);
          }
        }
        
        const seenSlugs = new Set<string>();
        const openMarkets = allFetchedMarkets.filter((m: any) => {
          if (!m?.slug || seenSlugs.has(m.slug)) return false;
          seenSlugs.add(m.slug);
          const status = (m.status || '').toLowerCase();
          const isResolved = m.isResolved === true || status === 'resolved' || status === 'closed';
          return !isResolved;
        });

        const btcMarket = openMarkets.find((m: any) => {
          const s = (m.slug || '').toLowerCase();
          const t = (m.title || '').toLowerCase();
          const isBtc = s.includes('btc') || t.includes('btc') || s.includes('bitcoin') || t.includes('bitcoin');
          const is15m = s.includes('15') || t.includes('15') || s.includes('15m') || t.includes('15-min') || s.includes('15 min') || s.includes('15min');
          const is1h = s.includes('1h') || t.includes('1h') || s.includes('hourly') || t.includes('daily');
          return isBtc && is15m && !is1h;
        }) || openMarkets.find((m: any) => {
          const s = (m.slug || '').toLowerCase();
          const isBtc = s.includes('btc') || s.includes('bitcoin');
          return isBtc && !s.includes('daily');
        });

        if (btcMarket) {
          const prevSlug = activeContractSlug;
          activeContractSlug = btcMarket.slug;
          
          if (btcMarket.tradePrices?.buy?.market?.[0] !== undefined) {
            currentYesPrice = Number(Number(btcMarket.tradePrices.buy.market[0]).toFixed(2));
          } else if (btcMarket.prices && btcMarket.prices.length > 0) {
            currentYesPrice = Number(Number(btcMarket.prices[0]).toFixed(2));
          }

          if (btcMarket.tradePrices?.buy?.market?.[1] !== undefined) {
            currentNoPrice = Number(Number(btcMarket.tradePrices.buy.market[1]).toFixed(2));
          } else if (btcMarket.prices && btcMarket.prices.length > 1) {
            currentNoPrice = Number(Number(btcMarket.prices[1]).toFixed(2));
          } else {
            currentNoPrice = Number((1 - currentYesPrice).toFixed(2));
          }

          broadcast("contract_price", {
            price: currentYesPrice,
            yesPrice: currentYesPrice,
            noPrice: currentNoPrice,
            slug: activeContractSlug
          });

          if (prevSlug !== activeContractSlug) {
            addLog("INFO", `📌 Active 15m BTC Market Synced for Latency Arb: ${activeContractSlug} (UP: $${currentYesPrice} | DOWN: $${currentNoPrice})`);
          }

          if (limitlessWsClient && limitlessWsClient.isConnected() && activeContractSlug !== lastSubscribedSlug) {
            lastSubscribedSlug = activeContractSlug;
            await limitlessWsClient.subscribe('subscribe_market_prices', { marketSlugs: [activeContractSlug] }).catch(() => {});
          }
        }
      } catch (e: any) {
        if (!e?.message?.includes('resolved')) {
          console.error("Market sync error:", e);
        }
      }
    };

    await syncActiveMarket();
    setInterval(syncActiveMarket, 15000);
    setInterval(monitorOpenOrdersAndPositions, 2000);
  } catch (error) {
    console.error("Failed to initialize Limitless Client:", error);
  }
}

// Background Monitor: Verifies order fills and manages Take-Profit
let isMonitoringOrders = false;
async function monitorOpenOrdersAndPositions() {
  if (isMonitoringOrders || !limitlessPortfolioFetcher || !isBotRunning) return;
  isMonitoringOrders = true;

  try {
    const clobPositions = await limitlessPortfolioFetcher.getCLOBPositions().catch(() => []);

    for (const trade of tradeHistory) {
      if (trade.status.includes("OPEN") || trade.status.includes("PLACED")) {
        const matchingPosition = clobPositions.find((p: any) => p.marketSlug === trade.marketSlug);
        const positionShares = matchingPosition ? 
          (trade.direction === "YES" ? Number(matchingPosition.positions?.yes?.shares || 0) : Number(matchingPosition.positions?.no?.shares || 0)) : 0;

        if (positionShares > 0) {
          trade.status = `FILLED (ARB POSITION ACTIVE)`;
          addLog("SUCCESS", `🎯 [Arb Position Verified]: ${trade.direction} active with ${positionShares} shares!`);

          if (trade.marketSlug && trade.tokenId && !trade.tpOrderId) {
            const tpTarget = Number((Math.min(trade.contractPrice + 0.20, 0.90)).toFixed(2));
            await placeTakeProfitSell(trade.marketSlug, trade.tokenId, trade.shares, trade, tpTarget);
          }
        }
      }
    }
  } catch (err: any) {
    // Non-blocking
  } finally {
    isMonitoringOrders = false;
  }
}

async function cancelAllOpenOrders(targetSlug?: string): Promise<number> {
  let count = 0;
  if (limitlessOrderClient) {
    const slug = targetSlug || activeContractSlug;
    if (slug) {
      addLog("INFO", `Cancelling all open Arb orders on ${slug}...`);
      try {
        await orderQueue.enqueue(() => limitlessOrderClient!.cancelAll(slug));
        addLog("SUCCESS", `✅ Open orders cancelled on Limitless.`);
      } catch (err: any) {
        console.warn("Error in cancelAllOpenOrders:", err?.message || err);
      }
    }
  }

  for (const t of tradeHistory) {
    if (t.status.includes("OPEN") || t.status.includes("PLACED")) {
      t.status = "CANCELLED";
      count++;
    }
  }

  broadcast("trade_history", tradeHistory);
  setTimeout(updateLiveBalance, 1500);
  return count;
}

// SSE Clients
const clients: express.Response[] = [];

function broadcast(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((c) => c.write(message));
}

// API Routes
app.get("/api/state", (req, res) => {
  const hasLiveKeys = Boolean(
    (process.env.LMTS_TOKEN_ID || process.env.LIMITLESS_API_KEY) &&
    (process.env.LMTS_TOKEN_SECRET || process.env.LIMITLESS_API_SECRET) &&
    process.env.PRIVATE_KEY
  );
  res.json({
    mode: "LIVE",
    strategy: "LATENCY_ARBITRAGE_CROSS_EXCHANGE",
    currentPrice,
    liveBalance,
    contractSlug: activeContractSlug || 'btc-up-or-down-15-min',
    contractPrice: currentYesPrice,
    yesPrice: currentYesPrice,
    noPrice: currentNoPrice,
    isBotRunning,
    arbMetrics: latestArbMetrics,
    minArbThreshold,
    riskPercentage,
    hasLiveKeys,
    rpcStatus,
    logs: systemLogs,
    trades: tradeHistory
  });
});

app.post("/api/toggle", async (req, res) => {
  const { running } = req.body;
  if (typeof running === "boolean") {
    isBotRunning = running;
    broadcast("bot_status", { isBotRunning });
    addLog("INFO", `⚡ Latency Arbitrage & Cross-Exchange Arb Engine ${isBotRunning ? 'STARTED (LIVE)' : 'STOPPED'}`);
  }
  res.json({ success: true, isBotRunning });
});

app.post("/api/settings", async (req, res) => {
  const { threshold, risk } = req.body;
  if (typeof threshold === "number" && threshold >= 0.03 && threshold <= 0.50) {
    minArbThreshold = threshold;
    addLog("INFO", `⚙️ Arbitrage Trigger Threshold updated to: ${(minArbThreshold * 100).toFixed(0)}%`);
    if (currentPrice > 0) evaluateLatencyArbitrage(currentPrice);
  }
  if (typeof risk === "number" && risk >= 0.01 && risk <= 0.50) {
    riskPercentage = risk;
    addLog("INFO", `🛡️ Risk Allocation updated to: ${(riskPercentage * 100).toFixed(0)}% of wallet balance per trade.`);
  }
  broadcast("settings_update", { minArbThreshold, riskPercentage });
  res.json({ success: true, minArbThreshold, riskPercentage });
});

app.post("/api/cancel-orders", async (req, res) => {
  try {
    const cancelledCount = await cancelAllOpenOrders();
    res.json({ success: true, message: "تم إلغاء جميع الأوامر المفتوحة بنجاح!", count: cancelledCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to cancel orders" });
  }
});

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.push(res);

  const currentWsStatus = binanceWs && binanceWs.readyState === WebSocket.OPEN ? "connected" : "disconnected";
  res.write(`event: ws_status\ndata: ${JSON.stringify({ status: currentWsStatus })}\n\n`);

  req.on("close", () => {
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
  });
});

// Fetch initial historical candles
async function fetchHistoricalData() {
  const restEndpoints = [
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100",
    "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100",
    "https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100"
  ];

  addLog("INFO", "Fetching initial BTC/USDT candles from Binance for Latency Engine calibration...");

  let fetchedData = null;
  for (const endpoint of restEndpoints) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        fetchedData = await response.json();
        break;
      }
    } catch (err) {
      // Continue to next endpoint
    }
  }

  if (fetchedData && Array.isArray(fetchedData)) {
    candleMemory = fetchedData.map((kline: any) => ({
      openTime: Number(kline[0]),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: Number(kline[6]),
      isFinal: true
    }));

    if (candleMemory.length > 100) candleMemory = candleMemory.slice(-100);

    if (candleMemory.length > 0) {
      currentPrice = candleMemory[candleMemory.length - 1].close;
      currentWindowStrikePrice = currentPrice;
      evaluateLatencyArbitrage(currentPrice);
    }
    addLog("SUCCESS", `Loaded ${candleMemory.length} candles. Volatility calibrated for 15m Binary Options.`);
  }
}

// Binance WebSocket Connection with multi-stream subscription (trade & kline for sub-millisecond price updates)
let binanceWs: WebSocket;
const wsEndpoints = [
  "wss://stream.binance.com:9443/ws/btcusdt@trade/btcusdt@kline_1m",
  "wss://data-stream.binance.vision/ws/btcusdt@trade/btcusdt@kline_1m",
  "wss://stream.binance.us:9443/ws/btcusdt@trade/btcusdt@kline_1m",
  "wss://data-stream.binance.vision:9443/ws/btcusdt@trade/btcusdt@kline_1m"
];
let currentEndpointIndex = 0;

function connectBinance() {
  const endpoint = wsEndpoints[currentEndpointIndex];
  addLog("INFO", `Connecting Ultra-Low Latency Binance WebSocket: ${endpoint}`);

  binanceWs = new WebSocket(endpoint);

  binanceWs.on("open", () => {
    addLog("SUCCESS", `Connected to Binance Ultra-Low Latency Trade/Price stream!`);
    broadcast("ws_status", { status: "connected" });
  });

  binanceWs.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      lastBinanceTickTime = Date.now();

      // Real-time trade tick (sub-millisecond instant price update)
      if (parsed.e === "trade" && parsed.p) {
        currentPrice = parseFloat(parsed.p);
        broadcast("price", { price: currentPrice, time: parsed.T || Date.now() });
        evaluateLatencyArbitrage(currentPrice);
      } else if (parsed.k) {
        const kline = parsed.k;
        currentPrice = parseFloat(kline.c);
        broadcast("price", { price: currentPrice, time: parsed.E || Date.now() });

        if (kline.x) {
          const candle: CandleData = {
            openTime: kline.t,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
            closeTime: kline.T,
            isFinal: true
          };
          candleMemory.push(candle);
          if (candleMemory.length > 100) candleMemory.shift();
        }

        evaluateLatencyArbitrage(currentPrice);
      }
    } catch (e) {
      console.error("Error parsing Binance WebSocket message:", e);
    }
  });

  binanceWs.on("close", () => {
    broadcast("ws_status", { status: "disconnected" });
    currentEndpointIndex = (currentEndpointIndex + 1) % wsEndpoints.length;
    setTimeout(connectBinance, 2500);
  });

  binanceWs.on("error", (err) => {
    console.error(`Binance WebSocket error on ${endpoint}:`, err);
    binanceWs.close();
  });
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
      await initializeLimitlessClient();
      await fetchHistoricalData();
      connectBinance();
    } catch (err) {
      console.error("Error starting latency arb server:", err);
    }
  });
}

startServer();

const shutdown = () => {
  console.log("Shutting down Latency Arb server...");
  if (limitlessWsClient) limitlessWsClient.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
