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
  ArrowRightLeft
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
  activeOpportunity: 'BUY_UP_ARB' | 'BUY_DOWN_ARB' | 'NEUTRAL';
  arbEdgePct: number;
  estimatedNetProfitPct: number;
  binanceLatencyMs: number;
  limitlessLatencyMs: number;
  minArbThreshold: number;
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
  strategyType?: 'LATENCY_ARB' | 'CONVERGENCE_HARVEST';
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
  strategy: string;
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
  executionMode?: "MAKER_LIMIT" | "SNIPER";
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
    strategy: 'LATENCY_ARBITRAGE_CROSS_EXCHANGE',
    currentPrice: 0,
    liveBalance: 0,
    contractSlug: 'btc-up-or-down-15-min',
    contractPrice: 0.50,
    yesPrice: 0.50,
    noPrice: 0.50,
    isBotRunning: false,
    arbMetrics: null,
    minArbThreshold: 0.10,
    riskPercentage: 0.04,
    tpTargetDelta: 0.15,
    stopLossDelta: 0.20,
    executionMode: "MAKER_LIMIT",
    maxTradesPerWindow: 1,
    hasLiveKeys: false,
  });

  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [trades, setTrades] = useState<PositionTrade[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [activeTab, setActiveTab] = useState<'logs' | 'trades'>('logs');
  const [togglingBot, setTogglingBot] = useState(false);
  const [cancellingOrders, setCancellingOrders] = useState(false);
  const [selectedThreshold, setSelectedThreshold] = useState<number>(0.10);
  const [selectedRisk, setSelectedRisk] = useState<number>(0.04);
  const [selectedTpTarget, setSelectedTpTarget] = useState<number>(0.15);
  const [selectedStopLoss, setSelectedStopLoss] = useState<number>(0.20);
  const [selectedExecMode, setSelectedExecMode] = useState<"MAKER_LIMIT" | "SNIPER">("MAKER_LIMIT");

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
        threshold: selectedThreshold,
        risk: selectedRisk,
        tpTarget: selectedTpTarget,
        stopLoss: selectedStopLoss,
        mode: selectedExecMode,
        maxTrades: 1,
        ...overrides,
      };
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('خطأ في تحديث الإعدادات:', err);
    }
  };

  const handleUpdateThreshold = async (threshold: number) => {
    setSelectedThreshold(threshold);
    await updateSettings({ threshold });
  };

  const handleUpdateRisk = async (risk: number) => {
    setSelectedRisk(risk);
    await updateSettings({ risk });
  };

  const handleUpdateTp = async (tpTarget: number) => {
    setSelectedTpTarget(tpTarget);
    await updateSettings({ tpTarget });
  };

  const handleUpdateSl = async (stopLoss: number) => {
    setSelectedStopLoss(stopLoss);
    await updateSettings({ stopLoss });
  };

  const handleUpdateExecMode = async (mode: "MAKER_LIMIT" | "SNIPER") => {
    setSelectedExecMode(mode);
    await updateSettings({ mode });
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
        if (data.minArbThreshold) setSelectedThreshold(data.minArbThreshold);
        if (data.riskPercentage) setSelectedRisk(data.riskPercentage);
        if (data.tpTargetDelta) setSelectedTpTarget(data.tpTargetDelta);
        if (data.stopLossDelta) setSelectedStopLoss(data.stopLossDelta);
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

    eventSource.addEventListener('latency_arb_update', (e: MessageEvent) => {
      try {
        const data: LatencyArbMetrics = JSON.parse(e.data);
        setState((prev) => ({ ...prev, arbMetrics: data, currentPrice: data.binancePrice }));
      } catch (err) {
        console.error('خطأ في تحليل حدث المراجحة:', err);
      }
    });

    eventSource.addEventListener('bot_status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, isBotRunning: data.isBotRunning }));
      } catch (err) {
        console.error('خطأ في تحليل حدث حالة الروبوت:', err);
      }
    });

    eventSource.addEventListener('contract_price', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          contractPrice: data.price ?? prev.contractPrice,
          yesPrice: data.yesPrice ?? prev.yesPrice,
          noPrice: data.noPrice ?? prev.noPrice,
          contractSlug: data.slug || prev.contractSlug,
        }));
      } catch (err) {
        console.error('خطأ في تحليل حدث سعر العقد:', err);
      }
    });

    eventSource.addEventListener('balance', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          liveBalance: data.liveBalance,
        }));
      } catch (err) {
        console.error('خطأ في تحليل حدث الرصيد:', err);
      }
    });

    eventSource.addEventListener('trade', (e: MessageEvent) => {
      try {
        const data: PositionTrade = JSON.parse(e.data);
        setTrades((prev) => {
          const existsIndex = prev.findIndex((t) => t.id === data.id);
          if (existsIndex !== -1) {
            const updated = [...prev];
            updated[existsIndex] = data;
            return updated;
          }
          return [data, ...prev.slice(0, 49)];
        });
      } catch (err) {
        console.error('خطأ في تحليل حدث الصفقة:', err);
      }
    });

    eventSource.addEventListener('trade_history', (e: MessageEvent) => {
      try {
        const data: PositionTrade[] = JSON.parse(e.data);
        setTrades(data);
      } catch (err) {
        console.error('خطأ في تحليل سجل الصفقات:', err);
      }
    });

    eventSource.addEventListener('settings_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.minArbThreshold !== undefined) setSelectedThreshold(data.minArbThreshold);
        if (data.riskPercentage !== undefined) setSelectedRisk(data.riskPercentage);
        if (data.tpTargetDelta !== undefined) setSelectedTpTarget(data.tpTargetDelta);
        if (data.stopLossDelta !== undefined) setSelectedStopLoss(data.stopLossDelta);
        if (data.executionMode) setSelectedExecMode(data.executionMode);
      } catch (err) {
        console.error('خطأ في تحليل حدث تحديث الإعدادات:', err);
      }
    });

    eventSource.addEventListener('log', (e: MessageEvent) => {
      try {
        const data: SystemLog = JSON.parse(e.data);
        setLogs((prev) => [data, ...prev.slice(0, 99)]);
      } catch (err) {
        console.error('خطأ في تحليل حدث السجل:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleToggleBot = async () => {
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
  const strike = arb?.strikePrice ?? state.currentPrice;
  const priceDeltaUsd = arb?.priceDeltaUsd ?? (state.currentPrice - strike);
  const priceDeltaPct = arb?.priceDeltaPct ?? 0;
  const fairYes = arb?.fairYesPrice ?? 0.50;
  const fairNo = arb?.fairNoPrice ?? 0.50;
  const marketYes = arb?.marketYesPrice ?? state.yesPrice;
  const marketNo = arb?.marketNoPrice ?? state.noPrice;
  const yesGap = arb?.yesSpreadGap ?? Number((fairYes - marketYes).toFixed(2));
  const noGap = arb?.noSpreadGap ?? Number((fairNo - marketNo).toFixed(2));
  const opportunity = arb?.activeOpportunity ?? 'NEUTRAL';
  const edgePct = arb?.arbEdgePct ?? 0;
  const secondsRemaining = arb?.secondsRemainingInWindow ?? 900;
  const windowMinute = arb?.windowMinute ?? (new Date().getMinutes() % 15);
  const minsRemaining = Math.floor(secondsRemaining / 60);
  const secsRemaining = secondsRemaining % 60;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="p-2 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 rounded-xl border border-cyan-500/30">
              <ArrowRightLeft className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                محرك المراجحة الإحصائية اللحظية (Latency & Cross-Exchange Arb)
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50 font-mono">
                  Binance Feed ➔ Limitless 15m BTC
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                مقارنة سعر البيتكوين اللحظي بالمللي ثانية مع احتمالات عقود 15 دقيقة واقتناص فروقات التسعير قبل تحديث صناع السوق
              </p>
            </div>
          </div>

          {/* Controls & Badges */}
          <div className="flex items-center space-x-4 space-x-reverse">
            <div className="flex items-center space-x-2 space-x-reverse text-xs px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
              <Radio
                className={`w-3.5 h-3.5 ${
                  wsStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <span className="text-slate-300 font-medium">
                بث بينانس اللحظي:{' '}
                <span className={wsStatus === 'connected' ? 'text-emerald-400 font-semibold font-mono' : 'text-amber-400'}>
                  {wsStatus === 'connected' ? 'نشط (Sub-ms)' : 'غير متصل'}
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse text-xs px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
              <span
                className={`w-2 h-2 rounded-full ${
                  state.rpcStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-300 font-medium">
                شبكة Base:{' '}
                <span className={state.rpcStatus?.connected ? 'text-emerald-400 font-semibold font-mono' : 'text-amber-400'}>
                  {state.rpcStatus?.connected ? `${state.rpcStatus.rpcUrlType || 'متصل'} (${state.rpcStatus.latencyMs ?? 0}ms)` : 'Public Node'}
                </span>
              </span>
            </div>

            <button
              onClick={handleToggleBot}
              disabled={togglingBot}
              className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-lg cursor-pointer ${
                state.isBotRunning
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-rose-900/20'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-900/20'
              }`}
            >
              {state.isBotRunning ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>إيقاف محرك المراجحة</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>تشغيل محرك المراجحة الفوري</span>
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

          {/* 2. Latency Arbitrage Opportunity Radar */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>رادار فرص المراجحة (Arbitrage Status)</span>
              <Crosshair className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span
                  className={`text-lg font-black font-mono tracking-tight ${
                    opportunity === 'BUY_UP_ARB'
                      ? 'text-emerald-400'
                      : opportunity === 'BUY_DOWN_ARB'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {opportunity === 'BUY_UP_ARB'
                    ? '⚡ فرصة شراء صعود (UP ARB)'
                    : opportunity === 'BUY_DOWN_ARB'
                    ? '⚡ فرصة شراء هبوط (DOWN ARB)'
                    : '⚪ مراقبة الفروقات السعرية'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {opportunity !== 'NEUTRAL' ? `فارق السعر: +${(Math.max(yesGap, noGap) * 100).toFixed(0)}% (Edge)` : `فارق العرض أقل من الحد الأدنى (${(selectedThreshold * 100).toFixed(0)}%)`}
                </span>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold font-mono ${
                  opportunity !== 'NEUTRAL'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {opportunity !== 'NEUTRAL' ? 'اقتناص فوري' : 'مراقبة'}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>نوع التنفيذ:</span>
              <span className="font-mono text-cyan-300 font-bold">Immediate FOK / Maker</span>
            </div>
          </div>

          {/* 3. Window Timer & Settlement Countdown */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>نافذة العقد الحالية (15m BTC Cycle)</span>
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
              <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                15M Window
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>حالة النافذة:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {secondsRemaining > 30 ? 'متاحة للمراجحة اللحظية' : 'إغلاق للتسوية'}
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
              <span>حجم صفقة المراجحة ({(selectedRisk * 100).toFixed(0)}%):</span>
              <span className="text-emerald-400 font-mono font-bold">
                ${(state.liveBalance * selectedRisk).toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>

        {/* Live Mathematical Arbitrage Matrix (Fair Price vs Market Orderbook) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* UP (YES) Contract Discrepancy Matrix */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">عقد الصعود (UP / YES) - مراجحة السعر</h2>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold font-mono ${
                  yesGap >= selectedThreshold
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {yesGap >= selectedThreshold ? `⚡ فجوة رابحة: +${(yesGap * 100).toFixed(0)}%` : 'سعر متوازن'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
              {/* Fair Theoretical Price */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">السعر النظري العادل (Fair Price)</span>
                <span className="text-2xl font-extrabold font-mono text-cyan-300">${fairYes.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500 block mt-1">بناءً على انحراف بينانس اللحظي</span>
              </div>

              {/* Limitless Market Price */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">سعر العرض في المنصة (Market Ask)</span>
                <span className="text-2xl font-extrabold font-mono text-white">${marketYes.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500 block mt-1">أفضل طلب في دفتر الأوامر</span>
              </div>
            </div>

            {/* Visual Spread Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">الفارق السعري المستهدف (Arbitrage Edge):</span>
                <span className={yesGap > 0 ? 'text-emerald-400 font-bold' : 'text-slate-400 font-bold'}>
                  {yesGap >= 0 ? `+${(yesGap * 100).toFixed(1)} سنت` : `${(yesGap * 100).toFixed(1)} سنت`} ({marketYes > 0 ? ((yesGap / marketYes) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 flex">
                <div
                  className="bg-cyan-500 h-full transition-all duration-300"
                  style={{ width: `${Math.min(marketYes * 100, 100)}%` }}
                  title="سعر السوق"
                />
                {yesGap > 0 && (
                  <div
                    className="bg-emerald-400 h-full transition-all duration-300 animate-pulse"
                    style={{ width: `${Math.min(yesGap * 100, 100 - marketYes * 100)}%` }}
                    title="هامش المراجحة الرابح"
                  />
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>ربح العقد عند التسوية ($1.00):</span>
              <span className="font-mono text-emerald-400 font-bold">
                +${(1.00 - marketYes).toFixed(2)} ({marketYes > 0 ? (((1.00 - marketYes) / marketYes) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </div>

          {/* DOWN (NO) Contract Discrepancy Matrix */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <ArrowDownRight className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-bold text-white">عقد الهبوط (DOWN / NO) - مراجحة السعر</h2>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold font-mono ${
                  noGap >= selectedThreshold
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {noGap >= selectedThreshold ? `⚡ فجوة رابحة: +${(noGap * 100).toFixed(0)}%` : 'سعر متوازن'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
              {/* Fair Theoretical Price */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">السعر النظري العادل (Fair Price)</span>
                <span className="text-2xl font-extrabold font-mono text-rose-300">${fairNo.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500 block mt-1">بناءً على انحراف بينانس اللحظي</span>
              </div>

              {/* Limitless Market Price */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">سعر العرض في المنصة (Market Ask)</span>
                <span className="text-2xl font-extrabold font-mono text-white">${marketNo.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500 block mt-1">أفضل طلب في دفتر الأوامر</span>
              </div>
            </div>

            {/* Visual Spread Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">الفارق السعري المستهدف (Arbitrage Edge):</span>
                <span className={noGap > 0 ? 'text-rose-400 font-bold' : 'text-slate-400 font-bold'}>
                  {noGap >= 0 ? `+${(noGap * 100).toFixed(1)} سنت` : `${(noGap * 100).toFixed(1)} سنت`} ({marketNo > 0 ? ((noGap / marketNo) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 flex">
                <div
                  className="bg-slate-600 h-full transition-all duration-300"
                  style={{ width: `${Math.min(marketNo * 100, 100)}%` }}
                  title="سعر السوق"
                />
                {noGap > 0 && (
                  <div
                    className="bg-rose-400 h-full transition-all duration-300 animate-pulse"
                    style={{ width: `${Math.min(noGap * 100, 100 - marketNo * 100)}%` }}
                    title="هامش المراجحة الرابح"
                  />
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>ربح العقد عند التسوية ($1.00):</span>
              <span className="font-mono text-emerald-400 font-bold">
                +${(1.00 - marketNo).toFixed(2)} ({marketNo > 0 ? (((1.00 - marketNo) / marketNo) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </div>
        </div>

        {/* Engine Settings & Control Center */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. Execution Mode & Order Type */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold text-slate-200">وضع التنفيذ (Execution Mode)</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                التحكم في طريقة إرسال الأوامر للمنصة:
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleUpdateExecMode("MAKER_LIMIT")}
                  className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer flex flex-col items-center ${
                    selectedExecMode === "MAKER_LIMIT"
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-300'
                      : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>Maker Limit</span>
                  <span className="text-[9px] opacity-80">أمر محدد (0 انزلاق)</span>
                </button>
                <button
                  onClick={() => handleUpdateExecMode("SNIPER")}
                  className={`py-2 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer flex flex-col items-center ${
                    selectedExecMode === "SNIPER"
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-300'
                      : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>Sniper</span>
                  <span className="text-[9px] opacity-80">تنفيذ فوري</span>
                </button>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
              <span>الوضع الحالي:</span>
              <span className="text-cyan-400 font-bold">
                {selectedExecMode === "MAKER_LIMIT" ? "صانع سوق محدد (GTC Maker)" : "قناص فوري"}
              </span>
            </div>
          </div>

          {/* 2. Dynamic Take-Profit Target */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold text-slate-200">حد أخذ الربح (Take-Profit)</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                فارق الربح فوق سعر الدخول لبيع العقد تلقائياً:
              </p>

              <div className="grid grid-cols-4 gap-1.5">
                {[0.10, 0.15, 0.20, 0.25].map((tp) => (
                  <button
                    key={tp}
                    onClick={() => handleUpdateTp(tp)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedTpTarget === tp
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    +{(tp * 100).toFixed(0)}¢
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>الهدف المختار:</span>
              <span className="text-emerald-400 font-mono font-bold">
                +{(selectedTpTarget * 100).toFixed(0)} سنت (+{((selectedTpTarget / 0.50) * 100).toFixed(0)}% عائد)
              </span>
            </div>
          </div>

          {/* 3. Dynamic Stop-Loss Protection */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                <h2 className="text-xs font-bold text-slate-200">وقف الخسارة (Stop-Loss)</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                الخروج التلقائي لحماية رأس المال إذا انعكس الاتجاه:
              </p>

              <div className="grid grid-cols-3 gap-1.5">
                {[0.15, 0.20, 0.30].map((sl) => (
                  <button
                    key={sl}
                    onClick={() => handleUpdateSl(sl)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                      selectedStopLoss === sl
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20 ring-1 ring-rose-300'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    -{(sl * 100).toFixed(0)}¢
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>حماية رأس المال:</span>
              <span className="text-rose-400 font-mono font-bold">
                -{(selectedStopLoss * 100).toFixed(0)} سنت (إيقاف تلقائي)
              </span>
            </div>
          </div>

          {/* 4. Quick Actions & Emergency Order Cleanup */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 space-x-reverse mb-3">
                <Cpu className="w-4 h-4 text-purple-400" />
                <h2 className="text-xs font-bold text-slate-200">إدارة الأوامر والسيولة</h2>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                إلغاء جميع الأوامر المعلقة وتحرير السيولة المحجوزة:
              </p>

              <button
                onClick={handleCancelAllOrders}
                disabled={cancellingOrders}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 flex items-center justify-center space-x-2 space-x-reverse transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cancellingOrders ? 'animate-spin' : ''}`} />
                <span>{cancellingOrders ? 'جاري الإلغاء...' : 'إلغاء الأوامر وتحرير الرصيد'}</span>
              </button>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
              <span>قاعدة النافذة:</span>
              <span className="text-cyan-400 font-bold">1 صفقة / نافذة 15 دقيقة</span>
            </div>
          </div>
        </div>

        {/* Live Arbitrage Execution Logs & Positions Stream with Tabs */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 space-x-reverse">
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  activeTab === 'logs'
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                    : 'bg-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>سجلات المحرك المباشرة ({logs.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('trades')}
                className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  activeTab === 'trades'
                    ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                    : 'bg-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>الصفقات والمراكز النشطة ({trades.length})</span>
              </button>
            </div>
            <span className="text-xs text-slate-500 font-mono">Sub-millisecond Engine Stream</span>
          </div>

          {activeTab === 'logs' ? (
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs space-y-2 h-80 overflow-y-auto">
              {logs.length > 0 ? (
                logs.map((log, idx) => (
                  <div key={idx} className="flex items-start space-x-3 space-x-reverse text-slate-300 py-1 border-b border-slate-900/80">
                    <span className="text-slate-500 shrink-0">{new Date(log.time).toLocaleTimeString()}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        log.type === 'ALERT'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : log.type === 'SUCCESS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : log.type === 'WARN'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : log.type === 'ERROR'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                          : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span className="leading-relaxed">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600">
                  جاري الاستماع لسجلات المراجحة الفورية...
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs space-y-3 h-80 overflow-y-auto">
              {trades.length > 0 ? (
                trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          trade.direction === 'YES'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {trade.direction === 'YES' ? '🔼 UP (YES)' : '🔽 DOWN (NO)'}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-slate-200 font-bold">
                          {trade.shares} عقد @ ${trade.contractPrice.toFixed(2)} (${trade.amount.toFixed(2)} USD)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(trade.timestamp).toLocaleTimeString()} • {trade.marketSlug || '15m-BTC'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 space-x-reverse">
                      {trade.tpOrderId && (
                        <span className="px-2 py-1 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 text-[10px] font-bold">
                          🎯 هدف الربح مفعل
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                          trade.status.includes('PROFIT') || trade.status.includes('SUCCESS')
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : trade.status.includes('STOPPED') || trade.status.includes('FAIL')
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : trade.status.includes('CANCELLED')
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                        }`}
                      >
                        {trade.status}
                      </span>
                      {trade.pnl !== undefined && (
                        <span
                          className={`font-bold font-mono text-xs ${
                            trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {trade.pnl >= 0 ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600">
                  لا توجد صفقات مسجلة حتى الآن. عند تفعيل الروبوت واكتشاف فرصة مراجحة مؤكدة، ستظهر الصفقات هنا تلقائياً.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
