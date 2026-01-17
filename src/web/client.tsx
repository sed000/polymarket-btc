import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type RiskMode = "normal" | "super-risk" | "dynamic-risk";

interface BotConfig {
  entryThreshold: number;
  maxEntryPrice: number;
  stopLoss: number;
  maxSpread: number;
  timeWindowMs: number;
  pollIntervalMs: number;
  paperTrading: boolean;
  paperBalance: number;
  riskMode: RiskMode;
  compoundLimit: number;
  baseBalance: number;
  signatureType: number;
  funderAddress?: string;
  maxPositions: number;
}

interface BotPosition {
  tradeId: number;
  tokenId: string;
  shares: number;
  entryPrice: number;
  side: "UP" | "DOWN";
  marketSlug: string;
  marketEndDate: string;
  limitOrderId?: string;
  dynamicStopLoss?: number;
}

interface BotState {
  running: boolean;
  balance: number;
  savedProfit: number;
  positions: BotPosition[];
  pendingEntries: string[];
  pendingExits: string[];
  lastScan: string | null;
  logs: string[];
  tradingEnabled: boolean;
  initError: string | null;
  wsConnected: boolean;
  userWsConnected: boolean;
  paperTrading: boolean;
  consecutiveLosses: number;
  consecutiveWins: number;
}

interface WsStats {
  marketConnected: boolean;
  marketLastMessageAt: number;
  marketSubscriptionCount: number;
  marketPriceCount: number;
  userConnected: boolean;
  userLastMessageAt: number;
  userMarketCount: number;
  priceMaxAgeMs: number;
}

interface EligibleMarket {
  slug: string;
  question: string;
  endDate: string;
  timeRemaining: number;
  upTokenId: string;
  downTokenId: string;
  upAsk: number;
  downAsk: number;
  upBid: number;
  downBid: number;
  eligibleSide: "UP" | "DOWN" | null;
}

interface Trade {
  id: number;
  market_slug: string;
  token_id: string;
  side: "UP" | "DOWN";
  entry_price: number;
  exit_price: number | null;
  shares: number;
  cost_basis: number;
  status: "OPEN" | "STOPPED" | "RESOLVED";
  pnl: number | null;
  created_at: string;
  closed_at: string | null;
  market_end_date: string | null;
}

interface OverviewResponse {
  ready: boolean;
  error?: string | null;
  config?: BotConfig;
  state?: BotState;
  wsStats?: WsStats;
  markets?: EligibleMarket[];
  trades?: Trade[];
  stats?: {
    total: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number;
    totalPnL: number;
  };
  dbPath?: string;
  updatedAt?: string;
}

interface Job {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

interface StrategyParams {
  entryThreshold: number;
  maxEntryPrice: number;
  stopLoss: number;
  maxSpread: number;
  timeWindowMs: number;
  riskMode: RiskMode;
  compoundLimit: number;
  baseBalance: number;
  maxPositions: number;
}

interface StrategyPreset {
  id: string;
  name: string;
  description?: string;
  params: StrategyParams;
  createdAt: string;
  updatedAt: string;
}

interface BacktestRun {
  id: number;
  name: string | null;
  config_json: string;
  markets_tested: number;
  created_at: string;
  completed_at: string | null;
  status: string;
  config?: Record<string, unknown>;
}

interface BacktestTrade {
  id: number;
  run_id: number;
  market_slug: string;
  token_id: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  shares: number;
  entry_timestamp: number;
  exit_timestamp: number | null;
  exit_reason: string | null;
  pnl: number | null;
}

interface BacktestResultSummary {
  runId: number;
  metrics: Record<string, number>;
  equityCurve: Array<{ timestamp: number; balance: number }>;
  drawdownCurve: Array<{ timestamp: number; drawdown: number }>;
  savedProfit: number;
  finalBalance: number;
  tradeCount: number;
  config: Record<string, unknown>;
}

const DEFAULT_STRATEGY: StrategyParams = {
  entryThreshold: 0.95,
  maxEntryPrice: 0.98,
  stopLoss: 0.8,
  maxSpread: 0.03,
  timeWindowMs: 5 * 60 * 1000,
  riskMode: "normal",
  compoundLimit: 0,
  baseBalance: 10,
  maxPositions: 1,
};

const DEFAULT_BACKTEST = {
  days: 7,
  startDate: "",
  endDate: "",
  entryThreshold: 0.95,
  maxEntryPrice: 0.98,
  stopLoss: 0.8,
  maxSpread: 0.03,
  timeWindowMin: 5,
  profitTarget: 0.99,
  startingBalance: 100,
  slippage: 0.001,
  compoundLimit: 0,
  baseBalance: 10,
  riskMode: "normal" as RiskMode,
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

function Sparkline({ points }: { points?: Array<{ timestamp: number; balance: number }> }) {
  if (!points || points.length === 0) {
    return <div className="hint">No data</div>;
  }
  const width = 300;
  const height = 120;
  const values = points.map(p => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const span = Math.max(points.length - 1, 1);
  const toX = (index: number) => (index / span) * (width - 10) + 5;
  const toY = (value: number) => height - 10 - ((value - min) / range) * (height - 20);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(index)} ${toY(point.balance)}`)
    .join(" ");
  const area = `${path} L ${width - 5} ${height - 10} L 5 ${height - 10} Z`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path className="fill" d={area} />
      <path d={path} />
    </svg>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<"live" | "backtest" | "strategy" | "history">("live");
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResultSummary | null>(null);
  const [backtestTrades, setBacktestTrades] = useState<BacktestTrade[]>([]);
  const [backtestForm, setBacktestForm] = useState(DEFAULT_BACKTEST);
  const [strategies, setStrategies] = useState<StrategyPreset[]>([]);
  const [strategyForm, setStrategyForm] = useState({
    id: "",
    name: "",
    description: "",
    params: { ...DEFAULT_STRATEGY },
  });
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BacktestRun | null>(null);
  const [runTrades, setRunTrades] = useState<BacktestTrade[]>([]);
  const [runStats, setRunStats] = useState<Record<string, number> | null>(null);

  const isRunning = overview?.state?.running ?? false;

  useEffect(() => {
    let cancelled = false;
    async function fetchOverview() {
      try {
        const data = await api<OverviewResponse>("/api/overview");
        if (!cancelled) {
          setOverview(data);
          setOverviewError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setOverviewError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (activeTab === "live") {
      fetchOverview();
      const timer = setInterval(fetchOverview, 1200);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    async function fetchStrategies() {
      try {
        const data = await api<{ strategies: StrategyPreset[] }>("/api/strategies");
        if (!cancelled) setStrategies(data.strategies);
      } catch {
        if (!cancelled) setStrategies([]);
      }
    }
    fetchStrategies();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchRuns() {
      try {
        const data = await api<{ runs: BacktestRun[] }>("/api/backtest/runs?limit=25");
        if (!cancelled) setRuns(data.runs);
      } catch {
        if (!cancelled) setRuns([]);
      }
    }
    if (activeTab === "history") {
      fetchRuns();
    }
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = await api<{ job: Job }>(`/api/jobs/${jobId}`);
        if (cancelled) return;
        setJob(data.job);
        if (data.job.status === "completed") {
          setJobMessage(null);
          if (data.job.type === "backtest-run" && data.job.result) {
            setBacktestResult(data.job.result as BacktestResultSummary);
            const runId = (data.job.result as BacktestResultSummary).runId;
            const tradesResp = await api<{ trades: BacktestTrade[] }>(`/api/backtest/trades/${runId}?limit=100`);
            setBacktestTrades(tradesResp.trades || []);
          }
          if (data.job.type !== "backtest-run" && data.job.result) {
            setBacktestResult(null);
          }
        }
        if (data.job.status === "failed") {
          setJobMessage(data.job.error || "Job failed");
        }
        if (data.job.status === "completed" || data.job.status === "failed") {
          setJobId(null);
        }
      } catch (err) {
        if (!cancelled) {
          setJobMessage(err instanceof Error ? err.message : String(err));
        }
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId]);

  const overviewStats = useMemo(() => {
    if (!overview?.state || !overview?.stats) return null;
    return {
      balance: overview.state.balance,
      saved: overview.state.savedProfit,
      positions: overview.state.positions.length,
      totalPnL: overview.stats.totalPnL,
      winRate: overview.stats.winRate,
    };
  }, [overview]);

  async function handleStart() {
    try {
      await api("/api/bot/start", { method: "POST" });
      setJobMessage(null);
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleStop() {
    try {
      await api("/api/bot/stop", { method: "POST" });
      setJobMessage(null);
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitJob(path: string, payload: Record<string, unknown>) {
    setJob(null);
    setJobMessage(null);
    try {
      const data = await api<{ jobId: string }>(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setJobId(data.jobId);
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function runBacktest() {
    const payload = {
      days: backtestForm.days,
      startDate: backtestForm.startDate || undefined,
      endDate: backtestForm.endDate || undefined,
      config: {
        entryThreshold: backtestForm.entryThreshold,
        maxEntryPrice: backtestForm.maxEntryPrice,
        stopLoss: backtestForm.stopLoss,
        maxSpread: backtestForm.maxSpread,
        timeWindowMs: backtestForm.timeWindowMin * 60 * 1000,
        profitTarget: backtestForm.profitTarget,
        startingBalance: backtestForm.startingBalance,
        slippage: backtestForm.slippage,
        compoundLimit: backtestForm.compoundLimit,
        baseBalance: backtestForm.baseBalance,
        riskMode: backtestForm.riskMode,
      },
    };
    await submitJob("/api/backtest/run", payload);
  }

  async function fetchBacktestData(force: boolean) {
    const payload = {
      days: backtestForm.days,
      startDate: backtestForm.startDate || undefined,
      endDate: backtestForm.endDate || undefined,
      force,
    };
    await submitJob("/api/backtest/fetch", payload);
  }

  async function optimizeBacktest(quick: boolean) {
    const payload = {
      days: backtestForm.days,
      startDate: backtestForm.startDate || undefined,
      endDate: backtestForm.endDate || undefined,
      quick,
      config: {
        entryThreshold: backtestForm.entryThreshold,
        maxEntryPrice: backtestForm.maxEntryPrice,
        stopLoss: backtestForm.stopLoss,
        maxSpread: backtestForm.maxSpread,
        timeWindowMs: backtestForm.timeWindowMin * 60 * 1000,
        profitTarget: backtestForm.profitTarget,
        startingBalance: backtestForm.startingBalance,
        slippage: backtestForm.slippage,
        compoundLimit: backtestForm.compoundLimit,
        baseBalance: backtestForm.baseBalance,
        riskMode: backtestForm.riskMode,
      },
    };
    await submitJob("/api/backtest/optimize", payload);
  }

  async function runGenetic() {
    const payload = {
      days: backtestForm.days,
      startDate: backtestForm.startDate || undefined,
      endDate: backtestForm.endDate || undefined,
      config: {
        entryThreshold: backtestForm.entryThreshold,
        maxEntryPrice: backtestForm.maxEntryPrice,
        stopLoss: backtestForm.stopLoss,
        maxSpread: backtestForm.maxSpread,
        timeWindowMs: backtestForm.timeWindowMin * 60 * 1000,
        profitTarget: backtestForm.profitTarget,
        startingBalance: backtestForm.startingBalance,
        slippage: backtestForm.slippage,
        compoundLimit: backtestForm.compoundLimit,
        baseBalance: backtestForm.baseBalance,
        riskMode: backtestForm.riskMode,
      },
      ga: {
        population: 50,
        generations: 100,
        mutation: 0.15,
        trainSplit: 0.7,
        elite: 5,
      },
    };
    await submitJob("/api/backtest/genetic", payload);
  }

  async function compareModes() {
    const payload = {
      days: backtestForm.days,
      startDate: backtestForm.startDate || undefined,
      endDate: backtestForm.endDate || undefined,
      config: {
        entryThreshold: backtestForm.entryThreshold,
        maxEntryPrice: backtestForm.maxEntryPrice,
        stopLoss: backtestForm.stopLoss,
        maxSpread: backtestForm.maxSpread,
        timeWindowMs: backtestForm.timeWindowMin * 60 * 1000,
        profitTarget: backtestForm.profitTarget,
        startingBalance: backtestForm.startingBalance,
        slippage: backtestForm.slippage,
        compoundLimit: backtestForm.compoundLimit,
        baseBalance: backtestForm.baseBalance,
        riskMode: backtestForm.riskMode,
      },
    };
    await submitJob("/api/backtest/compare", payload);
  }

  function loadStrategy(strategy: StrategyPreset) {
    setStrategyForm({
      id: strategy.id,
      name: strategy.name,
      description: strategy.description || "",
      params: { ...strategy.params },
    });
  }

  function applyStrategyToBacktest(strategy: StrategyPreset) {
    setBacktestForm(prev => ({
      ...prev,
      entryThreshold: strategy.params.entryThreshold,
      maxEntryPrice: strategy.params.maxEntryPrice,
      stopLoss: strategy.params.stopLoss,
      maxSpread: strategy.params.maxSpread,
      timeWindowMin: Math.round(strategy.params.timeWindowMs / 60000),
      riskMode: strategy.params.riskMode,
      compoundLimit: strategy.params.compoundLimit,
      baseBalance: strategy.params.baseBalance,
    }));
    setActiveTab("backtest");
  }

  async function saveStrategy() {
    try {
      const payload = {
        id: strategyForm.id || undefined,
        name: strategyForm.name,
        description: strategyForm.description,
        params: strategyForm.params,
      };
      const response = await api<{ strategy: StrategyPreset }>("/api/strategies", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStrategies(prev => {
        const next = prev.filter(item => item.id !== response.strategy.id);
        return [response.strategy, ...next];
      });
      setStrategyForm({ id: "", name: "", description: "", params: { ...DEFAULT_STRATEGY } });
      setJobMessage("Strategy saved.");
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeStrategy(id: string) {
    try {
      await api(`/api/strategies/${id}`, { method: "DELETE" });
      setStrategies(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyStrategyToBot(strategy: StrategyPreset) {
    try {
      await api("/api/strategies/apply", {
        method: "POST",
        body: JSON.stringify({ params: strategy.params }),
      });
      setJobMessage("Strategy applied to bot. Ready to start.");
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function selectRun(run: BacktestRun) {
    setSelectedRun(run);
    setRunTrades([]);
    setRunStats(null);
    try {
      const data = await api<{ trades: BacktestTrade[]; stats: Record<string, number> }>(
        `/api/backtest/trades/${run.id}?limit=200`
      );
      setRunTrades(data.trades);
      setRunStats(data.stats);
    } catch (err) {
      setJobMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <h1 className="hero-title">Polymarket Bot Console</h1>
          <p className="hero-subtitle">Live execution, backtesting lab, and strategy studio in one cockpit.</p>
        </div>
        <div className="hero-meta">
          {overview?.config && (
            <span className="meta-pill">{overview.config.paperTrading ? "Paper Mode" : "Live Mode"}</span>
          )}
          {overview?.config && <span className="meta-pill alt">Risk: {overview.config.riskMode}</span>}
          {overview?.state && (
            <span className={`badge ${overview.state.running ? "ok" : "off"}`}>
              <span className="pulse" />
              {overview.state.running ? "Bot Running" : "Bot Stopped"}
            </span>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab ${activeTab === "live" ? "active" : ""}`} onClick={() => setActiveTab("live")}>
          Live Terminal
        </button>
        <button
          className={`tab ${activeTab === "backtest" ? "active" : ""}`}
          onClick={() => setActiveTab("backtest")}
        >
          Backtest Lab
        </button>
        <button
          className={`tab ${activeTab === "strategy" ? "active" : ""}`}
          onClick={() => setActiveTab("strategy")}
        >
          Strategy Studio
        </button>
        <button
          className={`tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Run History
        </button>
      </nav>

      {jobMessage && <div className="notice">{jobMessage}</div>}
      {overviewError && <div className="notice">{overviewError}</div>}
      {overview && !overview.ready && overview.error && <div className="notice">{overview.error}</div>}

      {activeTab === "live" && (
        <div className="grid">
          <section className="card" style={{ gridColumn: "span 7" }}>
            <h3>Status & Capital</h3>
            {overviewStats ? (
              <div className="stat-grid">
                <div className="stat">
                  <span className="stat-label">Balance</span>
                  <span className="stat-value">{formatCurrency(overviewStats.balance)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Saved Profit</span>
                  <span className="stat-value">{formatCurrency(overviewStats.saved)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Open Positions</span>
                  <span className="stat-value">{overviewStats.positions}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total PnL</span>
                  <span className="stat-value">{formatCurrency(overviewStats.totalPnL)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Win Rate</span>
                  <span className="stat-value">{formatPct(overviewStats.winRate)}</span>
                </div>
              </div>
            ) : (
              <div className="hint">Waiting for bot data...</div>
            )}
            {overview?.config && (
              <div className="split" style={{ marginTop: 16 }}>
                <div className="stack">
                  <span className="tag">Entry Window</span>
                  <div className="pill">
                    {overview.config.entryThreshold.toFixed(2)} - {overview.config.maxEntryPrice.toFixed(2)}
                  </div>
                </div>
                <div className="stack">
                  <span className="tag">Stop Loss</span>
                  <div className="pill warn">&lt;= {overview.config.stopLoss.toFixed(2)}</div>
                </div>
                <div className="stack">
                  <span className="tag">Max Spread</span>
                  <div className="pill">{overview.config.maxSpread.toFixed(2)}</div>
                </div>
              </div>
            )}
          </section>

          <section className="card" style={{ gridColumn: "span 5" }}>
            <h3>Controls</h3>
            <div className="btn-row">
              <button className="btn" onClick={handleStart} disabled={isRunning}>
                Start Bot
              </button>
              <button className="btn secondary" onClick={handleStop} disabled={!isRunning}>
                Stop Bot
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <span className="tag">WebSocket</span>
              <div className="stat-grid" style={{ marginTop: 10 }}>
                <div className="stat">
                  <span className="stat-label">Market</span>
                  <span className="stat-value">
                    {overview?.wsStats?.marketConnected ? "Connected" : "Offline"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">User</span>
                  <span className="stat-value">{overview?.wsStats?.userConnected ? "Connected" : "Offline"}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Prices</span>
                  <span className="stat-value">{overview?.wsStats?.marketPriceCount ?? 0}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Subs</span>
                  <span className="stat-value">{overview?.wsStats?.marketSubscriptionCount ?? 0}</span>
                </div>
              </div>
            </div>
            {overview?.dbPath && <p className="hint">DB: {overview.dbPath}</p>}
          </section>

          <section className="card" style={{ gridColumn: "span 7" }}>
            <h3>Active Markets</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Up (Bid/Ask)</th>
                  <th>Down (Bid/Ask)</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {overview?.markets && overview.markets.length > 0 ? (
                  overview.markets.slice(0, 6).map(market => (
                    <tr key={market.slug}>
                      <td>{formatTimeRemaining(market.timeRemaining)}</td>
                      <td className="mono">
                        {market.upBid.toFixed(2)} / {market.upAsk.toFixed(2)}
                      </td>
                      <td className="mono">
                        {market.downBid.toFixed(2)} / {market.downAsk.toFixed(2)}
                      </td>
                      <td>
                        {market.eligibleSide ? (
                          <span className="pill">{market.eligibleSide}</span>
                        ) : (
                          <span className="hint">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="hint">
                      No active markets yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ gridColumn: "span 5" }}>
            <h3>Open Positions</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Shares</th>
                  <th>Stop</th>
                </tr>
              </thead>
              <tbody>
                {overview?.state?.positions?.length ? (
                  overview.state.positions.map(position => (
                    <tr key={position.tradeId}>
                      <td>{position.side}</td>
                      <td className="mono">{position.entryPrice.toFixed(2)}</td>
                      <td className="mono">{position.shares.toFixed(2)}</td>
                      <td className="mono">
                        {(position.dynamicStopLoss ?? overview?.config?.stopLoss ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="hint">
                      No open positions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ gridColumn: "span 7" }}>
            <h3>Recent Trades</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {overview?.trades && overview.trades.length > 0 ? (
                  overview.trades.slice(0, 6).map(trade => (
                    <tr key={trade.id}>
                      <td>{trade.status}</td>
                      <td>{trade.side}</td>
                      <td className="mono">{trade.entry_price.toFixed(2)}</td>
                      <td className="mono">{trade.exit_price ? trade.exit_price.toFixed(2) : "-"}</td>
                      <td className="mono">{trade.pnl !== null ? trade.pnl.toFixed(2) : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="hint">
                      No trades yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ gridColumn: "span 5" }}>
            <h3>Activity Log</h3>
            <div className="log">
              {overview?.state?.logs?.length ? (
                overview.state.logs.slice(-12).map((log, index) => <span key={index}>{log}</span>)
              ) : (
                <span className="hint">No logs yet.</span>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "backtest" && (
        <div className="grid">
          <section className="card" style={{ gridColumn: "span 7" }}>
            <h3>Backtest Config</h3>
            <div className="form-grid">
              <label className="field">
                Days
                <input
                  type="number"
                  value={backtestForm.days}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, days: Number(event.target.value) || 1 }))
                  }
                />
              </label>
              <label className="field">
                Start Date
                <input
                  type="date"
                  value={backtestForm.startDate}
                  onChange={event => setBacktestForm(prev => ({ ...prev, startDate: event.target.value }))}
                />
              </label>
              <label className="field">
                End Date
                <input
                  type="date"
                  value={backtestForm.endDate}
                  onChange={event => setBacktestForm(prev => ({ ...prev, endDate: event.target.value }))}
                />
              </label>
              <label className="field">
                Entry Threshold
                <input
                  type="number"
                  step="0.01"
                  value={backtestForm.entryThreshold}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, entryThreshold: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Max Entry
                <input
                  type="number"
                  step="0.01"
                  value={backtestForm.maxEntryPrice}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, maxEntryPrice: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Stop Loss
                <input
                  type="number"
                  step="0.01"
                  value={backtestForm.stopLoss}
                  onChange={event => setBacktestForm(prev => ({ ...prev, stopLoss: Number(event.target.value) }))}
                />
              </label>
              <label className="field">
                Max Spread
                <input
                  type="number"
                  step="0.01"
                  value={backtestForm.maxSpread}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, maxSpread: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Window (min)
                <input
                  type="number"
                  value={backtestForm.timeWindowMin}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, timeWindowMin: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Profit Target
                <input
                  type="number"
                  step="0.01"
                  value={backtestForm.profitTarget}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, profitTarget: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Starting Balance
                <input
                  type="number"
                  value={backtestForm.startingBalance}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, startingBalance: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Slippage
                <input
                  type="number"
                  step="0.001"
                  value={backtestForm.slippage}
                  onChange={event => setBacktestForm(prev => ({ ...prev, slippage: Number(event.target.value) }))}
                />
              </label>
              <label className="field">
                Compound Limit
                <input
                  type="number"
                  value={backtestForm.compoundLimit}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, compoundLimit: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="field">
                Base Balance
                <input
                  type="number"
                  value={backtestForm.baseBalance}
                  onChange={event => setBacktestForm(prev => ({ ...prev, baseBalance: Number(event.target.value) }))}
                />
              </label>
              <label className="field">
                Risk Mode
                <select
                  value={backtestForm.riskMode}
                  onChange={event =>
                    setBacktestForm(prev => ({ ...prev, riskMode: event.target.value as RiskMode }))
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="super-risk">Super Risk</option>
                  <option value="dynamic-risk">Dynamic Risk</option>
                </select>
              </label>
            </div>
            <p className="hint">
              Leave dates empty to use "Days" as a rolling window. Backtests run against cached data unless you
              force refresh.
            </p>
          </section>

          <section className="card" style={{ gridColumn: "span 5" }}>
            <h3>Run Actions</h3>
            <div className="btn-row">
              <button className="btn" onClick={runBacktest}>
                Run Backtest
              </button>
              <button className="btn secondary" onClick={() => fetchBacktestData(false)}>
                Fetch Data
              </button>
              <button className="btn ghost" onClick={() => fetchBacktestData(true)}>
                Force Re-fetch
              </button>
              <button className="btn warn" onClick={() => optimizeBacktest(true)}>
                Quick Optimize
              </button>
              <button className="btn warn" onClick={() => optimizeBacktest(false)}>
                Deep Optimize
              </button>
              <button className="btn secondary" onClick={runGenetic}>
                Genetic Search
              </button>
              <button className="btn ghost" onClick={compareModes}>
                Compare Modes
              </button>
            </div>
            {job && (
              <div style={{ marginTop: 16 }}>
                <div className="badge">{job.status.toUpperCase()}</div>
                {job.progress && (
                  <pre className="hint" style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(job.progress, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </section>

          <section className="card" style={{ gridColumn: "span 7" }}>
            <h3>Equity Curve</h3>
            {backtestResult ? (
              <Sparkline points={backtestResult.equityCurve} />
            ) : (
              <div className="hint">Run a backtest to see equity curves.</div>
            )}
          </section>

          <section className="card" style={{ gridColumn: "span 5" }}>
            <h3>Backtest Snapshot</h3>
            {backtestResult ? (
              <div className="stat-grid">
                <div className="stat">
                  <span className="stat-label">Final Balance</span>
                  <span className="stat-value">{formatCurrency(backtestResult.finalBalance)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Saved Profit</span>
                  <span className="stat-value">{formatCurrency(backtestResult.savedProfit)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Trades</span>
                  <span className="stat-value">{backtestResult.tradeCount}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total PnL</span>
                  <span className="stat-value">
                    {backtestResult.metrics?.totalPnL !== undefined
                      ? formatCurrency(backtestResult.metrics.totalPnL)
                      : "-"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Win Rate</span>
                  <span className="stat-value">
                    {backtestResult.metrics?.winRate !== undefined
                      ? formatPct(backtestResult.metrics.winRate)
                      : "-"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="hint">No backtest results yet.</div>
            )}
          </section>

          <section className="card" style={{ gridColumn: "span 12" }}>
            <h3>Recent Backtest Trades</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {backtestTrades.length ? (
                  backtestTrades.slice(0, 12).map(trade => (
                    <tr key={trade.id}>
                      <td className="mono">{trade.market_slug}</td>
                      <td>{trade.side}</td>
                      <td className="mono">{trade.entry_price.toFixed(2)}</td>
                      <td className="mono">{trade.exit_price ? trade.exit_price.toFixed(2) : "-"}</td>
                      <td className="mono">{trade.pnl !== null ? trade.pnl.toFixed(2) : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="hint">
                      Trades will appear after a run completes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {job?.type === "backtest-optimize" && job.result && (
            <section className="card" style={{ gridColumn: "span 12" }}>
              <h3>Optimization Leaders</h3>
              <pre className="hint" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </section>
          )}

          {job?.type === "backtest-genetic" && job.result && (
            <section className="card" style={{ gridColumn: "span 12" }}>
              <h3>Genetic Search Summary</h3>
              <pre className="hint" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </section>
          )}

          {job?.type === "backtest-compare" && job.result && (
            <section className="card" style={{ gridColumn: "span 12" }}>
              <h3>Mode Comparison</h3>
              <pre className="hint" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </section>
          )}
        </div>
      )}

      {activeTab === "strategy" && (
        <div className="grid">
          <section className="card" style={{ gridColumn: "span 6" }}>
            <h3>Strategy Builder</h3>
            <div className="field" style={{ marginBottom: 12 }}>
              Name
              <input
                type="text"
                value={strategyForm.name}
                onChange={event => setStrategyForm(prev => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              Description
              <textarea
                value={strategyForm.description}
                onChange={event => setStrategyForm(prev => ({ ...prev, description: event.target.value }))}
              />
            </div>
            <div className="form-grid">
              <label className="field">
                Entry Threshold
                <input
                  type="number"
                  step="0.01"
                  value={strategyForm.params.entryThreshold}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, entryThreshold: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Max Entry
                <input
                  type="number"
                  step="0.01"
                  value={strategyForm.params.maxEntryPrice}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, maxEntryPrice: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Stop Loss
                <input
                  type="number"
                  step="0.01"
                  value={strategyForm.params.stopLoss}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, stopLoss: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Max Spread
                <input
                  type="number"
                  step="0.01"
                  value={strategyForm.params.maxSpread}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, maxSpread: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Window (min)
                <input
                  type="number"
                  value={Math.round(strategyForm.params.timeWindowMs / 60000)}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, timeWindowMs: Number(event.target.value) * 60000 },
                    }))
                  }
                />
              </label>
              <label className="field">
                Risk Mode
                <select
                  value={strategyForm.params.riskMode}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, riskMode: event.target.value as RiskMode },
                    }))
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="super-risk">Super Risk</option>
                  <option value="dynamic-risk">Dynamic Risk</option>
                </select>
              </label>
              <label className="field">
                Compound Limit
                <input
                  type="number"
                  value={strategyForm.params.compoundLimit}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, compoundLimit: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Base Balance
                <input
                  type="number"
                  value={strategyForm.params.baseBalance}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, baseBalance: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="field">
                Max Positions
                <input
                  type="number"
                  value={strategyForm.params.maxPositions}
                  onChange={event =>
                    setStrategyForm(prev => ({
                      ...prev,
                      params: { ...prev.params, maxPositions: Number(event.target.value) },
                    }))
                  }
                />
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={saveStrategy}>
                Save Strategy
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  setStrategyForm({ id: "", name: "", description: "", params: { ...DEFAULT_STRATEGY } })
                }
              >
                Reset
              </button>
            </div>
          </section>

          <section className="card" style={{ gridColumn: "span 6" }}>
            <h3>Saved Strategies</h3>
            {strategies.length === 0 && <div className="hint">No strategies saved yet.</div>}
            <div className="stack">
              {strategies.map(strategy => (
                <div key={strategy.id} className="stat">
                  <strong>{strategy.name}</strong>
                  <span className="hint">{strategy.description || "No notes yet."}</span>
                  <div className="btn-row">
                    <button className="btn ghost" onClick={() => loadStrategy(strategy)}>
                      Load
                    </button>
                    <button className="btn secondary" onClick={() => applyStrategyToBacktest(strategy)}>
                      Use in Backtest
                    </button>
                    <button className="btn" onClick={() => applyStrategyToBot(strategy)}>
                      Apply to Bot
                    </button>
                    <button className="btn warn" onClick={() => removeStrategy(strategy.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="hint">
              Applying a strategy updates the live bot only in paper trading mode. Stop the bot before applying.
            </p>
          </section>
        </div>
      )}

      {activeTab === "history" && (
        <div className="grid">
          <section className="card" style={{ gridColumn: "span 5" }}>
            <h3>Recent Runs</h3>
            {runs.length === 0 && <div className="hint">No runs saved yet.</div>}
            <div className="stack">
              {runs.map(run => (
                <div key={run.id} className="stat">
                  <span className="stat-label">Run #{run.id}</span>
                  <span className="stat-value">{run.status}</span>
                  <span className="hint">{run.created_at}</span>
                  <div className="btn-row">
                    <button className="btn ghost" onClick={() => selectRun(run)}>
                      View Trades
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card" style={{ gridColumn: "span 7" }}>
            <h3>Run Details</h3>
            {selectedRun ? (
              <>
                <div className="stat-grid">
                  <div className="stat">
                    <span className="stat-label">Status</span>
                    <span className="stat-value">{selectedRun.status}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Markets Tested</span>
                    <span className="stat-value">{selectedRun.markets_tested}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Created</span>
                    <span className="stat-value">{selectedRun.created_at}</span>
                  </div>
                </div>
                {runStats && (
                  <div className="stat-grid" style={{ marginTop: 12 }}>
                    <div className="stat">
                      <span className="stat-label">Win Rate</span>
                      <span className="stat-value">{formatPct(runStats.winRate || 0)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Total PnL</span>
                      <span className="stat-value">{formatCurrency(runStats.totalPnL || 0)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Trades</span>
                      <span className="stat-value">{runStats.total || 0}</span>
                    </div>
                  </div>
                )}
                <table className="table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Side</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runTrades.length ? (
                      runTrades.slice(0, 12).map(trade => (
                        <tr key={trade.id}>
                          <td className="mono">{trade.market_slug}</td>
                          <td>{trade.side}</td>
                          <td className="mono">{trade.entry_price.toFixed(2)}</td>
                          <td className="mono">{trade.exit_price ? trade.exit_price.toFixed(2) : "-"}</td>
                          <td className="mono">{trade.pnl !== null ? trade.pnl.toFixed(2) : "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="hint">
                          Select a run to load trades.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="hint">Pick a run to see trades and metrics.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
