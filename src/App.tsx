import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Square,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Clock,
  Radio,
  Sliders,
  Terminal,
  Crosshair,
  TrendingUp,
  Info,
  Timer,
  Cpu,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRightLeft,
  Target,
  Percent,
  CheckCircle2
} from 'lucide-react';

interface LatencyArbMetrics {
  binancePrice: number;
  strikePrice: number;
  priceDeltaUsd: number;
  priceDeltaPct: number;
  fairYesPrice: number;
  fairNoPrice: number;
  marketYesPrice: number;
  marketNoPrice: number;
  yesSpreadGap: number;
  noSpreadGap: number;
  activeOpportunity: 'BUY_UP_ARB' | 'BUY_DOWN_ARB' | 'SNIPE_UP_SETTLEMENT' | 'SNIPE_DOWN_SETTLEMENT' | 'NEUTRAL';
  arbEdgePct: number;
  estimatedNetProfitPct: number;
  binanceLatencyMs: number;
  limitlessLatencyMs: number;
  minArbThreshold: number;
  activeStrategy: 'SETTLEMENT_SNIPING' | 'LATENCY_ARB';
  winProbabilityPct: number;
  isSnipingZone: boolean;
  snipeConfidence: number;
  maxSnipeBuyPrice: number;
  snipeLateWindowSeconds: number;
  minute: number;
  windowMinute: number;
  secondsRemainingInWindow: number;
  isWindowActive: boolean;
  time: number;
}

interface PositionTrade {
  id: string;
  orderId?: string;
  tpOrderId?: string;
  marketSlug?: string;
  time: number;
  direction: 'YES' | 'NO';
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
  strategyType?: 'SETTLEMENT_SNIPER' | 'LATENCY_ARB' | 'CONVERGENCE_HARVEST';
  arbMetrics?: {
    fairPrice: number;
    marketPrice: number;
    spreadGap: number;
    binancePriceAtTrigger: number;
    strikeAtTrigger: number;
    executionSpeedMs: number;
  };
}

interface SystemLog {
  time: number;
  type: 'INFO' | 'ALERT' | 'SUCCESS' | 'WARN' | 'ERROR';
  message: string;
}

interface AppState {
  mode: 'LIVE';
  strategy: 'SETTLEMENT_SNIPING' | 'LATENCY_ARB';
  activeStrategy: 'SETTLEMENT_SNIPING' | 'LATENCY_ARB';
  snipeConfidence: number;
  maxSnipeBuyPrice: number;
  snipeLateWindowSeconds: number;
  minSnipeDeltaUsd: number;
  currentPrice: number;
  liveBalance: number;
  contractSlug: string | null;
  contractPrice: number;
  yesPrice: number;
  noPrice: number;
  isBotRunning: boolean;
  arbMetrics: LatencyArbMetrics | null;
  minArbThreshold: number;
  riskPercentage?: number;
  tpTargetDelta?: number;
  stopLossDelta?: number;
  executionMode?: 'MAKER_LIMIT' | 'SNIPER';
  maxTradesPerWindow?: number;
  hasLiveKeys: boolean;
  rpcStatus?: {
    connected: boolean;
    rpcUrlType: string;
    latencyMs?: number;
    blockNumber?: number;
  };
}

export default function App() {
  const [state, setState] = useState<AppState>({
    mode: 'LIVE',
    strategy: 'SETTLEMENT_SNIPING',
    activeStrategy: 'SETTLEMENT_SNIPING',
    snipeConfidence: 0.93,
    maxSnipeBuyPrice: 0.94,
    snipeLateWindowSeconds: 180,
    minSnipeDeltaUsd: 30,
    currentPrice: 0,
    liveBalance: 0,
    contractSlug: 'btc-up-or-down-15-min',
    contractPrice: 0.50,
    yesPrice: 0.50,
    noPrice: 0.50,
    isBotRunning: false,
    arbMetrics: null,
    minArbThreshold: 0.12,
    riskPercentage: 0.10,
    tpTargetDelta: 0.15,
    stopLossDelta: 0.20,
    executionMode: 'SNIPER',
    maxTradesPerWindow: 1,
    hasLiveKeys: false,
  });

  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [trades, setTrades] = useState<PositionTrade[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [activeTab, setActiveTab] = useState<'logs' | 'trades'>('logs');
  const [togglingBot, setTogglingBot] = useState(false);
  const [cancellingOrders, setCancellingOrders] = useState(false);
  
  // Strategy & Parameter Local States
  const [selectedStrategy, setSelectedStrategy] = useState<'SETTLEMENT_SNIPING' | 'LATENCY_ARB'>('SETTLEMENT_SNIPING');
  const [selectedConfidence, setSelectedConfidence] = useState<number>(0.93);
  const [selectedMaxBuyPrice, setSelectedMaxBuyPrice] = useState<number>(0.94);
  const [selectedLateZone, setSelectedLateZone] = useState<number>(180);
  const [selectedThreshold, setSelectedThreshold] = useState<number>(0.12);
  const [selectedRisk, setSelectedRisk] = useState<number>(0.10);
  const [selectedExecMode, setSelectedExecMode] = useState<'MAKER_LIMIT' | 'SNIPER'>('SNIPER');

  const handleCancelAllOrders = async () => {
    setCancellingOrders(true);
    try {
      const res = await fetch('/api/cancel-orders', { method: 'POST' });
      if (res.ok) {
        await fetchState();
      }
    } catch (err) {
      console.error('خطأ في إلغاء الأوامر:', err);
    } finally {
      setCancellingOrders(false);
    }
  };

  const updateSettings = async (overrides: any) => {
    try {
      const payload = {
        strategy: selectedStrategy,
        snipeConfidence: selectedConfidence,
        maxSnipeBuyPrice: selectedMaxBuyPrice,
        snipeLateWindowSeconds: selectedLateZone,
        threshold: selectedThreshold,
        risk: selectedRisk,
        mode: selectedExecMode,
        maxTrades: 1,
        ...overrides,
      };
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated.activeStrategy) setSelectedStrategy(updated.activeStrategy);
      }
    } catch (err) {
      console.error('خطأ في تحديث الإعدادات:', err);
    }
  };

  const handleStrategyChange = async (strategy: 'SETTLEMENT_SNIPING' | 'LATENCY_ARB') => {
    setSelectedStrategy(strategy);
    await updateSettings({ strategy });
  };

  const handleConfidenceChange = async (confidence: number) => {
    setSelectedConfidence(confidence);
    await updateSettings({ snipeConfidence: confidence });
  };

  const handleMaxBuyPriceChange = async (price: number) => {
    setSelectedMaxBuyPrice(price);
    await updateSettings({ maxSnipeBuyPrice: price });
  };

  const handleLateZoneChange = async (seconds: number) => {
    setSelectedLateZone(seconds);
    await updateSettings({ snipeLateWindowSeconds: seconds });
  };

  const handleUpdateRisk = async (risk: number) => {
    setSelectedRisk(risk);
    await updateSettings({ risk });
  };

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          ...data,
        }));
        if (data.activeStrategy) setSelectedStrategy(data.activeStrategy);
        if (data.snipeConfidence) setSelectedConfidence(data.snipeConfidence);
        if (data.maxSnipeBuyPrice) setSelectedMaxBuyPrice(data.maxSnipeBuyPrice);
        if (data.snipeLateWindowSeconds) setSelectedLateZone(data.snipeLateWindowSeconds);
        if (data.minArbThreshold) setSelectedThreshold(data.minArbThreshold);
        if (data.riskPercentage) setSelectedRisk(data.riskPercentage);
        if (data.executionMode) setSelectedExecMode(data.executionMode);
        if (data.logs) setLogs(data.logs);
        if (data.trades) setTrades(data.trades);
      }
    } catch (err) {
      console.error('فشل في جلب الحالة الأولية:', err);
    }
  };

  useEffect(() => {
    fetchState();

    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('ws_status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setWsStatus(data.status);
      } catch (err) {
        console.error('خطأ في تحليل حدث ws_status:', err);
      }
    });

    eventSource.addEventListener('price', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, currentPrice: data.price }));
      } catch (err) {
        console.error('خطأ في تحليل حدث السعر:', err);
      }
    });

    eventSource.addEventListener('contract_price', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          contractPrice: data.price,
          yesPrice: data.yesPrice ?? data.price,
          noPrice: data.noPrice ?? (1 - data.price),
          contractSlug: data.slug || prev.contractSlug,
        }));
      } catch (err) {
        console.error('خطأ في تحليل حدث سعر العقد:', err);
      }
    });

    eventSource.addEventListener('latency_arb_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          arbMetrics: data,
          yesPrice: data.marketYesPrice,
          noPrice: data.marketNoPrice,
          currentPrice: data.binancePrice || prev.currentPrice,
        }));
      } catch (err) {
        console.error('خطأ في تحليل حدث المراجحة:', err);
      }
    });

    eventSource.addEventListener('bot_status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, isBotRunning: data.isBotRunning }));
      } catch (err) {
        console.error('خطأ في تحليل حالة البوت:', err);
      }
    });

    eventSource.addEventListener('balance_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, liveBalance: data.liveBalance }));
      } catch (err) {
        console.error('خطأ في تحليل تحديث الرصيد:', err);
      }
    });

    eventSource.addEventListener('log', (e: MessageEvent) => {
      try {
        const log = JSON.parse(e.data);
        setLogs((prev) => [log, ...prev.slice(0, 99)]);
      } catch (err) {
        console.error('خطأ في تحليل اللوغ:', err);
      }
    });

    eventSource.addEventListener('trade', (e: MessageEvent) => {
      try {
        const trade = JSON.parse(e.data);
        setTrades((prev) => {
          const index = prev.findIndex((t) => t.id === trade.id || (t.orderId && t.orderId === trade.orderId));
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = trade;
            return updated;
          }
          return [trade, ...prev.slice(0, 49)];
        });
      } catch (err) {
        console.error('خطأ في تحليل حدث الصفقة:', err);
      }
    });

    eventSource.addEventListener('trade_history', (e: MessageEvent) => {
      try {
        const history = JSON.parse(e.data);
        if (Array.isArray(history)) setTrades(history);
      } catch (err) {
        console.error('خطأ في تحليل سجل الصفقات:', err);
      }
    });

    const pollInterval = setInterval(fetchState, 5000);

    return () => {
      eventSource.close();
      clearInterval(pollInterval);
    };
  }, []);

  const toggleBot = async () => {
    setTogglingBot(true);
    try {
      const res = await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: !state.isBotRunning }),
      });
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({ ...prev, isBotRunning: data.isBotRunning }));
      }
    } catch (err) {
      console.error('خطأ في تبديل حالة الروبوت:', err);
    } finally {
      setTogglingBot(false);
    }
  };

  const arb = state.arbMetrics;
  const strike = arb?.strikePrice || state.currentPrice || 0;
  const priceDeltaUsd = arb?.priceDeltaUsd ?? 0;
  const priceDeltaPct = arb?.priceDeltaPct ?? 0;
  const fairYes = arb?.fairYesPrice ?? 0.50;
  const fairNo = arb?.fairNoPrice ?? 0.50;
  const marketYes = state.yesPrice || 0.50;
  const marketNo = state.noPrice || 0.50;
  const yesGap = arb?.yesSpreadGap ?? (fairYes - marketYes);
  const noGap = arb?.noSpreadGap ?? (fairNo - marketNo);
  const opportunity = arb?.activeOpportunity ?? 'NEUTRAL';
  const isSnipingZone = arb?.isSnipingZone ?? false;
  const winProbabilityPct = arb?.winProbabilityPct ?? 50.0;
  const secondsRemaining = arb?.secondsRemainingInWindow ?? 900;
  const minsRemaining = Math.floor(secondsRemaining / 60);
  const secsRemaining = secondsRemaining % 60;
  const windowMinute = arb?.windowMinute ?? (new Date().getMinutes() % 15);

  // Expected Yields for Sniping
  const yesSnipeYield = marketYes > 0 ? Number((((1.00 - marketYes) / marketYes) * 100).toFixed(1)) : 0;
  const noSnipeYield = marketNo > 0 ? Number((((1.00 - marketNo) / marketNo) * 100).toFixed(1)) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950" dir="rtl">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400">
              <Target className="w-5 h-5 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>محرك قنص التسوية اللحظية</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono font-normal">
                    Settlement Sniping 95%+
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400">
                قنص صفقات التسوية شبه المؤكدة في الدقائق الأخيرة على منصة Limitless
              </p>
            </div>
          </div>

          {/* Header Controls & Status Badges */}
          <div className="flex items-center space-x-3 space-x-reverse">
            {/* Active Strategy Selector */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => handleStrategyChange('SETTLEMENT_SNIPING')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedStrategy === 'SETTLEMENT_SNIPING'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>قنص التسوية (95%+)</span>
              </button>
              <button
                onClick={() => handleStrategyChange('LATENCY_ARB')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedStrategy === 'LATENCY_ARB'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>مراجحة الفروقات</span>
              </button>
            </div>

            {/* WebSocket Stream Badge */}
            <div className="hidden sm:flex items-center space-x-2 space-x-reverse px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    wsStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    wsStatus === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="text-xs font-medium text-slate-300 font-mono">
                {wsStatus === 'connected' ? 'Binance Low-Latency' : 'Offline'}
              </span>
            </div>

            {/* Bot On/Off Master Button */}
            <button
              onClick={toggleBot}
              disabled={togglingBot}
              className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-lg cursor-pointer ${
                state.isBotRunning
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-rose-900/20'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-cyan-900/20'
              }`}
            >
              {state.isBotRunning ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>إيقاف الروبوت</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>تشغيل الروبوت التلقائي</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Real-time Spot Price & Strike Deviation */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>سعر البيتكوين الفوري (Binance Spot)</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold tracking-tight font-mono text-white">
                $
                {state.currentPrice > 0
                  ? state.currentPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '---.--'}
              </span>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  priceDeltaUsd >= 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {priceDeltaUsd >= 0 ? `+${priceDeltaUsd.toFixed(2)}$` : `${priceDeltaUsd.toFixed(2)}$`} ({priceDeltaPct >= 0 ? `+${priceDeltaPct.toFixed(2)}%` : `${priceDeltaPct.toFixed(2)}%`})
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>سعر البداية (Strike):</span>
              <span className="text-cyan-300 font-bold">${strike.toFixed(2)}</span>
            </div>
          </div>

          {/* 2. Sniping Radar & Confidence Status */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>رادار قنص التسوية (Sniping Radar)</span>
              <Crosshair className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span
                  className={`text-base font-black font-mono tracking-tight ${
                    opportunity === 'SNIPE_UP_SETTLEMENT' || opportunity === 'BUY_UP_ARB'
                      ? 'text-emerald-400'
                      : opportunity === 'SNIPE_DOWN_SETTLEMENT' || opportunity === 'BUY_DOWN_ARB'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {opportunity === 'SNIPE_UP_SETTLEMENT'
                    ? '🎯 قنص صعود مؤكد (UP @ 95%+)'
                    : opportunity === 'SNIPE_DOWN_SETTLEMENT'
                    ? '🎯 قنص هبوط مؤكد (DOWN @ 95%+)'
                    : isSnipingZone
                    ? '⏳ بانتظار اكتمال شرط الأمان'
                    : '⚪ خارج منطقة القنص'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  نسبة التأكيد الرياضي: <strong className="text-cyan-300">{winProbabilityPct}%</strong>
                </span>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold font-mono ${
                  opportunity.includes('SNIPE') || opportunity.includes('ARB')
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                    : isSnipingZone
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {opportunity.includes('SNIPE') ? 'قنص فوري' : isSnipingZone ? 'منطقة القنص' : 'مراقبة'}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>الاستراتيجية النشطة:</span>
              <span className="font-mono text-cyan-300 font-bold">
                {selectedStrategy === 'SETTLEMENT_SNIPING' ? 'Settlement Sniping (95%+)' : 'Latency Arbitrage'}
              </span>
            </div>
          </div>

          {/* 3. Window Timer & Sniping Zone Countdown */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>نافذة العقد الحالية (15m BTC Window)</span>
              <Timer className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className="flex flex-col">
                <span className="text-2xl font-black font-mono text-white">
                  {String(minsRemaining).padStart(2, '0')}:{String(secsRemaining).padStart(2, '0')}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  الدقيقة {windowMinute} من 15 دقيقة
                </span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  isSnipingZone
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isSnipingZone ? '🎯 Sniping Zone Active' : 'Pre-Sniping Phase'}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>منطقة القنص (آخر 3 دقائق):</span>
              <span className={`font-mono font-bold ${isSnipingZone ? 'text-emerald-400' : 'text-slate-400'}`}>
                {isSnipingZone ? 'جاهز للتنفيذ الفوري' : `تبدأ بعد ${Math.max(0, secondsRemaining - selectedLateZone)} ثانية`}
              </span>
            </div>
          </div>

          {/* 4. On-Chain Live Balance */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>رصيد المحفظة المباشر (Base USDC)</span>
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-emerald-400">
                $
                {state.liveBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                LIVE ON-CHAIN
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>حجم صفقة القنص ({(selectedRisk * 100).toFixed(0)}%):</span>
              <span className="text-emerald-400 font-mono font-bold">
                ${(state.liveBalance * selectedRisk).toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>

        {/* Sniping & Probability Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* UP (YES) Contract Sniping Card */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">عقد الصعود (UP / YES) - قنص التسوية</h2>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold font-mono ${
                  fairYes >= selectedConfidence
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {fairYes >= selectedConfidence ? `🎯 نسبة الفوز: ${(fairYes * 100).toFixed(1)}%` : `احتمال: ${(fairYes * 100).toFixed(0)}%`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
              {/* Market Price on Limitless */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">سعر الشراء في المنصة (Market Ask)</span>
                <span className="text-2xl font-extrabold font-mono text-white">${marketYes.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500 block mt-1">الحد الأقصى للشراء: ${selectedMaxBuyPrice.toFixed(2)}</span>
              </div>

              {/* Settlement Payout */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">عائد التسوية المضمون عند الفوز</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-400">$1.00</span>
                <span className="text-[11px] text-emerald-400/80 block mt-1 font-bold">
                  صافي ربح: +{yesSnipeYield}% (+$
                  {(1.00 - marketYes).toFixed(2)}/عقد)
                </span>
              </div>
            </div>

            {/* Probability Visual Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">نسبة الأمان الرياضي (Win Confidence):</span>
                <span className={fairYes >= selectedConfidence ? 'text-emerald-400 font-bold' : 'text-slate-400 font-bold'}>
                  {(fairYes * 100).toFixed(1)}% (المطلوب: {(selectedConfidence * 100).toFixed(0)}%+)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 flex">
                <div
                  className={`h-full transition-all duration-300 ${
                    fairYes >= selectedConfidence ? 'bg-emerald-400' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.min(fairYes * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>حالة تنفيذ قنص الصعود:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {priceDeltaUsd >= 30 && isSnipingZone && fairYes >= selectedConfidence && marketYes <= selectedMaxBuyPrice
                  ? '🎯 متطابق 100% - جاهز للقنص الفوري'
                  : '⏳ بانتظار الشروط (السعر والوقت)'}
              </span>
            </div>
          </div>

          {/* DOWN (NO) Contract Sniping Card */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <ArrowDownRight className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-bold text-white">عقد الهبوط (DOWN / NO) - قنص التسوية</h2>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold font-mono ${
                  fairNo >= selectedConfidence
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {fairNo >= selectedConfidence ? `🎯 نسبة الفوز: ${(fairNo * 100).toFixed(1)}%` : `احتمال: ${(fairNo * 100).toFixed(0)}%`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
              {/* Market Price on Limitless */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">سعر الشراء في المنصة (Market Ask)</span>
                <span className="text-2xl font-extrabold font-mono text-white">${marketNo.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500 block mt-1">الحد الأقصى للشراء: ${selectedMaxBuyPrice.toFixed(2)}</span>
              </div>

              {/* Settlement Payout */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">عائد التسوية المضمون عند الفوز</span>
                <span className="text-2xl font-extrabold font-mono text-emerald-400">$1.00</span>
                <span className="text-[11px] text-emerald-400/80 block mt-1 font-bold">
                  صافي ربح: +{noSnipeYield}% (+$
                  {(1.00 - marketNo).toFixed(2)}/عقد)
                </span>
              </div>
            </div>

            {/* Probability Visual Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">نسبة الأمان الرياضي (Win Confidence):</span>
                <span className={fairNo >= selectedConfidence ? 'text-rose-400 font-bold' : 'text-slate-400 font-bold'}>
                  {(fairNo * 100).toFixed(1)}% (المطلوب: {(selectedConfidence * 100).toFixed(0)}%+)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 flex">
                <div
                  className={`h-full transition-all duration-300 ${
                    fairNo >= selectedConfidence ? 'bg-rose-400' : 'bg-slate-600'
                  }`}
                  style={{ width: `${Math.min(fairNo * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>حالة تنفيذ قنص الهبوط:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {priceDeltaUsd <= -30 && isSnipingZone && fairNo >= selectedConfidence && marketNo <= selectedMaxBuyPrice
                  ? '🎯 متطابق 100% - جاهز للقنص الفوري'
                  : '⏳ بانتظار الشروط (السعر والوقت)'}
              </span>
            </div>
          </div>
        </div>

        {/* Settlement Sniping Settings & Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. Minimum Win Confidence */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold text-slate-200">نسبة الأمان والتأكيد (Win Confidence)</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                الحد الأدنى للاحتمالية الرياضية للدخول في الصفقة:
              </p>

              <div className="grid grid-cols-4 gap-1.5">
                {[0.90, 0.93, 0.95, 0.98].map((conf) => (
                  <button
                    key={conf}
                    onClick={() => handleConfidenceChange(conf)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedConfidence === conf
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {(conf * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>مستوى الأمان المعتمد:</span>
              <span className="text-cyan-300 font-bold font-mono">
                {(selectedConfidence * 100).toFixed(0)}% فوز مؤكد
              </span>
            </div>
          </div>

          {/* 2. Maximum Buy Price */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <Target className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold text-slate-200">أعلى سعر شراء (Max Snipe Price)</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                سقف سعر الشراء لضمان تحقيق عائد ربحي عند التسوية:
              </p>

              <div className="grid grid-cols-4 gap-1.5">
                {[0.90, 0.92, 0.94, 0.96].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleMaxBuyPriceChange(p)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedMaxBuyPrice === p
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    ${p.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>عائد التسوية المضمون:</span>
              <span className="text-emerald-400 font-mono font-bold">
                +{(((1 - selectedMaxBuyPrice) / selectedMaxBuyPrice) * 100).toFixed(1)}% صافي ربح
              </span>
            </div>
          </div>

          {/* 3. Sniping Timing Zone */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <Clock className="w-4 h-4 text-purple-400" />
                <h2 className="text-xs font-bold text-slate-200">توقيت منطقة القنص (Sniping Zone)</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                الوقت المتبقي قبل انتهاء العقد للسماح بالقنص:
              </p>

              <div className="grid grid-cols-4 gap-1.5">
                {[60, 90, 120, 180].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => handleLateZoneChange(sec)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedLateZone === sec
                        ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {sec} ثانية
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>تفعيل القنص:</span>
              <span className="text-purple-300 font-mono font-bold">
                آخر {(selectedLateZone / 60).toFixed(1)} دقيقة قبل الإغلاق
              </span>
            </div>
          </div>

          {/* 4. Risk & Order Actions */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold text-slate-200">تخصيص المخاطرة والسيولة</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                حجم الصفقة من رصيد المحفظة لكل قنص:
              </p>

              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {[0.05, 0.10, 0.15, 0.25].map((risk) => (
                  <button
                    key={risk}
                    onClick={() => handleUpdateRisk(risk)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedRisk === risk
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {(risk * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCancelAllOrders}
              disabled={cancellingOrders}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold font-mono bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all cursor-pointer flex items-center justify-center space-x-1.5 space-x-reverse"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cancellingOrders ? 'animate-spin' : ''}`} />
              <span>{cancellingOrders ? 'جاري الإلغاء...' : 'إلغاء جميع الأوامر المفتوحة'}</span>
            </button>
          </div>
        </div>

        {/* Live Logs & Trade History Tabs */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
          <div className="flex border-b border-slate-800/80 bg-slate-950/40 px-4">
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-3 px-4 text-xs font-bold font-mono border-b-2 transition-all flex items-center space-x-2 space-x-reverse cursor-pointer ${
                activeTab === 'logs'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>سجل العمليات المباشر (Execution Logs)</span>
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`py-3 px-4 text-xs font-bold font-mono border-b-2 transition-all flex items-center space-x-2 space-x-reverse cursor-pointer ${
                activeTab === 'trades'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>سجل صفقات القنص المفتوحة والمغلقة ({trades.length})</span>
            </button>
          </div>

          <div className="p-4 max-h-80 overflow-y-auto font-mono text-xs">
            {activeTab === 'logs' ? (
              <div className="space-y-1.5">
                {logs.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">بانتظار وصول البيانات من المحرك...</p>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="flex items-start space-x-2 space-x-reverse text-slate-300">
                      <span className="text-slate-500 shrink-0">[{new Date(log.time).toLocaleTimeString()}]</span>
                      <span
                        className={`font-bold shrink-0 ${
                          log.type === 'SUCCESS'
                            ? 'text-emerald-400'
                            : log.type === 'ALERT'
                            ? 'text-cyan-400'
                            : log.type === 'WARN'
                            ? 'text-amber-400'
                            : log.type === 'ERROR'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        [{log.type}]
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {trades.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">لا توجد صفقات مسجلة بعد. عند تشغيل الروبوت واقتراب نهاية النافذة سيتم قنص الصفقات آلياً.</p>
                ) : (
                  trades.map((trade) => (
                    <div
                      key={trade.id}
                      className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl flex items-center justify-between flex-wrap gap-2"
                    >
                      <div className="flex items-center space-x-3 space-x-reverse">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            trade.direction === 'YES'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {trade.direction === 'YES' ? 'UP / YES' : 'DOWN / NO'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">${trade.amount.toFixed(2)} USD</span>
                            <span className="text-slate-400">({trade.shares} عقد @ ${trade.contractPrice.toFixed(2)})</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                              {trade.strategyType === 'SETTLEMENT_SNIPER' ? '🎯 Settlement Snipe' : '⚡ Latency Arb'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            الوقت: {new Date(trade.time).toLocaleTimeString()} | تسوية مستهدفة: ${trade.targetPayout.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 space-x-reverse">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                            trade.status.includes('MATCHED') || trade.status.includes('FILLED') || trade.status.includes('PROFIT')
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : trade.status.includes('CANCELLED')
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse'
                          }`}
                        >
                          {trade.status}
                        </span>
                        {trade.pnl !== undefined && (
                          <span className={`font-bold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {trade.pnl >= 0 ? `+${trade.pnl.toFixed(2)}$` : `${trade.pnl.toFixed(2)}$`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
