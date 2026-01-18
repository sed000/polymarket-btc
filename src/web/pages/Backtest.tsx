import React, { useState, useEffect } from "react";
import { backtestApi, strategyApi } from "../api/client";
import { useWebSocket } from "../hooks/useWebSocket";

interface BacktestConfig {
  startDate: string;
  endDate: string;
  entryThreshold: number;
  maxEntryPrice: number;
  stopLoss: number;
  maxSpread: number;
  timeWindowMs: number;
  profitTarget: number;
  startingBalance: number;
  riskMode: "normal" | "super-risk" | "dynamic-risk";
  fetchFresh: boolean;
}

interface BacktestResult {
  metrics: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
  };
  trades: any[];
  equityCurve: { timestamp: number; balance: number }[];
  marketsLoaded: number;
  savedProfit: number;
  finalBalance: number;
}

const defaultConfig: BacktestConfig = {
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  endDate: new Date().toISOString().split("T")[0],
  entryThreshold: 0.70,
  maxEntryPrice: 0.95,
  stopLoss: 0.40,
  maxSpread: 0.05,
  timeWindowMs: 15 * 60 * 1000,
  profitTarget: 0.98,
  startingBalance: 100,
  riskMode: "dynamic-risk",
  fetchFresh: false,
};

function BacktestForm({
  config,
  onChange,
  onRun,
  onOptimize,
  loading,
}: {
  config: BacktestConfig;
  onChange: (config: BacktestConfig) => void;
  onRun: () => void;
  onOptimize: () => void;
  loading: boolean;
}) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Backtest Configuration</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Start Date</label>
          <input
            type="date"
            value={config.startDate}
            onChange={(e) => onChange({ ...config, startDate: e.target.value })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">End Date</label>
          <input
            type="date"
            value={config.endDate}
            onChange={(e) => onChange({ ...config, endDate: e.target.value })}
            className="input w-full"
          />
        </div>

        <div>
          <label className="label">Entry Threshold</label>
          <input
            type="number"
            step="0.01"
            value={config.entryThreshold}
            onChange={(e) => onChange({ ...config, entryThreshold: parseFloat(e.target.value) })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Max Entry Price</label>
          <input
            type="number"
            step="0.01"
            value={config.maxEntryPrice}
            onChange={(e) => onChange({ ...config, maxEntryPrice: parseFloat(e.target.value) })}
            className="input w-full"
          />
        </div>

        <div>
          <label className="label">Stop Loss</label>
          <input
            type="number"
            step="0.01"
            value={config.stopLoss}
            onChange={(e) => onChange({ ...config, stopLoss: parseFloat(e.target.value) })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Max Spread</label>
          <input
            type="number"
            step="0.01"
            value={config.maxSpread}
            onChange={(e) => onChange({ ...config, maxSpread: parseFloat(e.target.value) })}
            className="input w-full"
          />
        </div>

        <div>
          <label className="label">Profit Target</label>
          <input
            type="number"
            step="0.01"
            value={config.profitTarget}
            onChange={(e) => onChange({ ...config, profitTarget: parseFloat(e.target.value) })}
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Starting Balance</label>
          <input
            type="number"
            step="1"
            value={config.startingBalance}
            onChange={(e) => onChange({ ...config, startingBalance: parseFloat(e.target.value) })}
            className="input w-full"
          />
        </div>

        <div>
          <label className="label">Risk Mode</label>
          <select
            value={config.riskMode}
            onChange={(e) => onChange({ ...config, riskMode: e.target.value as any })}
            className="input w-full"
          >
            <option value="normal">Normal</option>
            <option value="super-risk">Super Risk</option>
            <option value="dynamic-risk">Dynamic Risk</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.fetchFresh}
              onChange={(e) => onChange({ ...config, fetchFresh: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-400">Fetch fresh data</span>
          </label>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onRun} disabled={loading} className="btn btn-primary">
          {loading ? "Running..." : "Run Backtest"}
        </button>
        <button onClick={onOptimize} disabled={loading} className="btn btn-secondary">
          {loading ? "..." : "Grid Optimize"}
        </button>
      </div>
    </div>
  );
}

function ResultsPanel({ result }: { result: BacktestResult | null }) {
  if (!result) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Results</h3>
        <p className="text-gray-500">Run a backtest to see results</p>
      </div>
    );
  }

  const { metrics } = result;

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Results</h3>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg p-3">
          <div className={`text-2xl font-bold ${metrics.totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {metrics.totalPnL >= 0 ? "+" : ""}${metrics.totalPnL.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">Total PnL</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-2xl font-bold">{(metrics.winRate * 100).toFixed(1)}%</div>
          <div className="text-xs text-gray-400">Win Rate</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-2xl font-bold">{metrics.totalTrades}</div>
          <div className="text-xs text-gray-400">Total Trades</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Wins / Losses</span>
          <span>
            <span className="text-green-400">{metrics.wins}</span> / <span className="text-red-400">{metrics.losses}</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Sharpe Ratio</span>
          <span>{metrics.sharpeRatio.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Profit Factor</span>
          <span>{metrics.profitFactor === Infinity ? "Inf" : metrics.profitFactor.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Max Drawdown</span>
          <span className="text-red-400">{(metrics.maxDrawdownPercent * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Avg Win</span>
          <span className="text-green-400">${metrics.avgWin.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Avg Loss</span>
          <span className="text-red-400">${metrics.avgLoss.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Markets Tested</span>
          <span>{result.marketsLoaded}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Final Balance</span>
          <span>${result.finalBalance.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function EquityChart({ data }: { data: { timestamp: number; balance: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
        <div className="h-48 flex items-center justify-center text-gray-500">No data</div>
      </div>
    );
  }

  const minBalance = Math.min(...data.map((d) => d.balance));
  const maxBalance = Math.max(...data.map((d) => d.balance));
  const range = maxBalance - minBalance || 1;

  const width = 100;
  const height = 48;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.balance - minBalance) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
      <div className="h-48">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>${minBalance.toFixed(0)}</span>
        <span>${maxBalance.toFixed(0)}</span>
      </div>
    </div>
  );
}

function TradesTable({ trades }: { trades: any[] }) {
  if (!trades || trades.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Trades ({trades.length})</h3>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800">
            <tr className="text-gray-400 text-left">
              <th className="pb-2">Side</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">Exit</th>
              <th className="pb-2">Reason</th>
              <th className="pb-2 text-right">PnL</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i} className="table-row">
                <td className="py-1">
                  <span className={trade.side === "UP" ? "text-green-400" : "text-red-400"}>
                    {trade.side}
                  </span>
                </td>
                <td className="py-1 font-mono">${trade.entryPrice.toFixed(2)}</td>
                <td className="py-1 font-mono">${trade.exitPrice.toFixed(2)}</td>
                <td className="py-1 text-xs text-gray-400">{trade.exitReason}</td>
                <td className={`py-1 text-right font-mono ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SaveAsStrategyButton({
  config,
  result,
}: {
  config: BacktestConfig;
  result: BacktestResult | null;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await strategyApi.create({
        name: name.trim(),
        description: `Backtest: ${config.startDate} to ${config.endDate}`,
        config: {
          entryThreshold: config.entryThreshold,
          maxEntryPrice: config.maxEntryPrice,
          stopLoss: config.stopLoss,
          maxSpread: config.maxSpread,
          timeWindowMs: config.timeWindowMs,
          profitTarget: config.profitTarget,
          riskMode: config.riskMode,
        },
      });
      setShowForm(false);
      setName("");
      alert("Strategy saved!");
    } catch (err) {
      alert("Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  if (!result) return null;

  if (!showForm) {
    return (
      <button onClick={() => setShowForm(true)} className="btn btn-secondary">
        Save as Strategy
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Strategy name..."
        className="input"
      />
      <button onClick={handleSave} disabled={saving || !name.trim()} className="btn btn-primary">
        {saving ? "Saving..." : "Save"}
      </button>
      <button onClick={() => setShowForm(false)} className="btn btn-secondary">
        Cancel
      </button>
    </div>
  );
}

export default function Backtest() {
  const [config, setConfig] = useState<BacktestConfig>(defaultConfig);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { backtestProgress } = useWebSocket();

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backtestApi.run(config);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  const runOptimize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backtestApi.optimize({
        startDate: config.startDate,
        endDate: config.endDate,
        ranges: {
          entryThreshold: { min: 0.65, max: 0.85, step: 0.05 },
          stopLoss: { min: 0.30, max: 0.50, step: 0.05 },
        },
      });
      alert(`Optimization complete! Best result: ${JSON.stringify(res.topResults[0], null, 2)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Backtest Lab</h2>
        <SaveAsStrategyButton config={config} result={result} />
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {loading && backtestProgress && (
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-cyan-500 h-2 rounded-full transition-all"
                style={{ width: `${backtestProgress.progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {backtestProgress.progress}%
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-2">{backtestProgress.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BacktestForm
          config={config}
          onChange={setConfig}
          onRun={runBacktest}
          onOptimize={runOptimize}
          loading={loading}
        />
        <ResultsPanel result={result} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EquityChart data={result?.equityCurve || []} />
        <TradesTable trades={result?.trades || []} />
      </div>
    </div>
  );
}
