import React, { useEffect, useState, useRef } from "react";
import { useBotStore } from "../stores/botStore";
import { useWebSocket } from "../hooks/useWebSocket";

function formatTime(ms: number): string {
  if (ms <= 0) return "Expired";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function formatPnL(pnl: number | null): string {
  if (pnl === null) return "-";
  const prefix = pnl >= 0 ? "+" : "";
  return `${prefix}$${pnl.toFixed(2)}`;
}

// Status Header Component
function StatusHeader() {
  const { config, state, stats, startBot, stopBot, loading } = useBotStore();
  const { lastState } = useWebSocket();

  const displayState = lastState || state;
  const balance = displayState?.balance ?? 0;
  const savedProfit = displayState?.savedProfit ?? 0;
  const running = displayState?.running ?? false;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-5 gap-6">
          <div>
            <div className="stat-label">Balance</div>
            <div className="stat-value text-cyan-400">{formatPrice(balance)}</div>
          </div>
          <div>
            <div className="stat-label">Saved Profit</div>
            <div className="stat-value text-green-400">{formatPrice(savedProfit)}</div>
          </div>
          <div>
            <div className="stat-label">Entry Range</div>
            <div className="stat-value">
              {config ? `${formatPrice(config.entryThreshold)} - ${formatPrice(config.maxEntryPrice)}` : "-"}
            </div>
          </div>
          <div>
            <div className="stat-label">Stop Loss</div>
            <div className="stat-value text-red-400">{config ? formatPrice(config.stopLoss) : "-"}</div>
          </div>
          <div>
            <div className="stat-label">Risk Mode</div>
            <div className="stat-value">
              <span className={`badge ${
                config?.riskMode === "super-risk" ? "badge-danger" :
                config?.riskMode === "dynamic-risk" ? "badge-warning" :
                "badge-info"
              }`}>
                {config?.riskMode || "normal"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {running ? (
            <button
              onClick={stopBot}
              disabled={loading}
              className="btn btn-danger flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <rect x="6" y="6" width="8" height="8" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              onClick={startBot}
              disabled={loading}
              className="btn btn-success flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
              </svg>
              Start
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold">{stats.total}</div>
            <div className="text-xs text-gray-400">Total Trades</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-green-400">{stats.wins}</div>
            <div className="text-xs text-gray-400">Wins</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-red-400">{stats.losses}</div>
            <div className="text-xs text-gray-400">Losses</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{stats.winRate.toFixed(1)}%</div>
            <div className="text-xs text-gray-400">Win Rate</div>
          </div>
          <div>
            <div className={`text-lg font-semibold ${stats.totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatPnL(stats.totalPnL)}
            </div>
            <div className="text-xs text-gray-400">Total PnL</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Markets Table Component
function MarketsTable() {
  const { markets, fetchMarkets } = useBotStore();
  const [timeUpdate, setTimeUpdate] = useState(0);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(() => {
      fetchMarkets();
      setTimeUpdate((t) => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Active Markets</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="pb-2">Market</th>
              <th className="pb-2">Time Left</th>
              <th className="pb-2 text-right">UP Bid/Ask</th>
              <th className="pb-2 text-right">DOWN Bid/Ask</th>
              <th className="pb-2 text-center">Signal</th>
            </tr>
          </thead>
          <tbody>
            {markets.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  No active markets
                </td>
              </tr>
            ) : (
              markets.map((market) => (
                <tr key={market.slug} className="table-row">
                  <td className="py-2 font-mono text-xs">{market.slug.replace("btc-updown-15m-", "")}</td>
                  <td className="py-2">{formatTime(market.timeRemaining)}</td>
                  <td className="py-2 text-right font-mono">
                    <span className="text-gray-400">{formatPrice(market.upBid)}</span>
                    {" / "}
                    <span className="text-green-400">{formatPrice(market.upAsk)}</span>
                  </td>
                  <td className="py-2 text-right font-mono">
                    <span className="text-gray-400">{formatPrice(market.downBid)}</span>
                    {" / "}
                    <span className="text-red-400">{formatPrice(market.downAsk)}</span>
                  </td>
                  <td className="py-2 text-center">
                    {market.eligibleSide ? (
                      <span className={`badge ${market.eligibleSide === "UP" ? "badge-success" : "badge-danger"}`}>
                        {market.eligibleSide}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Positions Table Component
function PositionsTable() {
  const { state } = useBotStore();
  const positions = state?.positions || [];

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Open Positions ({positions.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="pb-2">Side</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">Shares</th>
              <th className="pb-2">Stop Loss</th>
              <th className="pb-2">Market</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  No open positions
                </td>
              </tr>
            ) : (
              positions.map((pos) => (
                <tr key={pos.tokenId} className="table-row">
                  <td className="py-2">
                    <span className={`badge ${pos.side === "UP" ? "badge-success" : "badge-danger"}`}>
                      {pos.side}
                    </span>
                  </td>
                  <td className="py-2 font-mono">{formatPrice(pos.entryPrice)}</td>
                  <td className="py-2">{pos.shares.toFixed(2)}</td>
                  <td className="py-2 font-mono text-red-400">
                    {pos.dynamicStopLoss ? formatPrice(pos.dynamicStopLoss) : "-"}
                  </td>
                  <td className="py-2 font-mono text-xs text-gray-400">
                    {pos.marketSlug.replace("btc-updown-15m-", "")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Trades Table Component
function TradesTable() {
  const { trades, fetchTrades } = useBotStore();

  useEffect(() => {
    fetchTrades(15);
  }, [fetchTrades]);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Recent Trades</h3>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800">
            <tr className="text-gray-400 text-left">
              <th className="pb-2">Status</th>
              <th className="pb-2">Side</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">Exit</th>
              <th className="pb-2 text-right">PnL</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  No trades yet
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr key={trade.id} className="table-row">
                  <td className="py-2">
                    <span className={`badge ${
                      trade.status === "OPEN" ? "badge-info" :
                      trade.status === "RESOLVED" ? "badge-success" :
                      "badge-danger"
                    }`}>
                      {trade.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={trade.side === "UP" ? "text-green-400" : "text-red-400"}>
                      {trade.side}
                    </span>
                  </td>
                  <td className="py-2 font-mono">{formatPrice(trade.entry_price)}</td>
                  <td className="py-2 font-mono">{trade.exit_price ? formatPrice(trade.exit_price) : "-"}</td>
                  <td className={`py-2 text-right font-mono ${
                    trade.pnl === null ? "" : trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {formatPnL(trade.pnl)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Log Viewer Component
function LogViewer() {
  const { logs } = useWebSocket();
  const { state } = useBotStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const allLogs = [...(state?.logs || []), ...logs];
  const displayLogs = allLogs.slice(-50);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      // Scroll only within the container, not the page
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayLogs, autoScroll]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Activity Log</h3>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>
      <div
        ref={containerRef}
        className="bg-gray-900 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs"
      >
        {displayLogs.length === 0 ? (
          <div className="text-gray-500">No logs yet...</div>
        ) : (
          displayLogs.map((log, i) => (
            <div key={i} className="text-gray-300 mb-1">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// WebSocket Status Component
function WsStatusPanel() {
  const { state } = useBotStore();

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">WebSocket Status</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${state?.wsConnected ? "bg-green-400" : "bg-red-400"}`} />
          <span className="text-sm">Market WS</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${state?.userWsConnected ? "bg-green-400" : "bg-red-400"}`} />
          <span className="text-sm">User WS</span>
        </div>
      </div>
      {state && (
        <div className="mt-4 text-xs text-gray-400">
          <div>Loss Streak: {state.consecutiveLosses}</div>
          <div>Win Streak: {state.consecutiveWins}</div>
        </div>
      )}
    </div>
  );
}

// Main Dashboard Component
export default function Dashboard() {
  const { fetchState, fetchConfig, fetchStats } = useBotStore();

  useEffect(() => {
    fetchState();
    fetchConfig();
    fetchStats();

    const interval = setInterval(() => {
      fetchState();
      fetchStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchState, fetchConfig, fetchStats]);

  return (
    <div className="space-y-6">
      <StatusHeader />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketsTable />
        <PositionsTable />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TradesTable />
        </div>
        <div className="space-y-6">
          <WsStatusPanel />
          <LogViewer />
        </div>
      </div>
    </div>
  );
}
