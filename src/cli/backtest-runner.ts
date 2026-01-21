/**
 * Backtest Runner
 * Integrates backtest functionality into the CLI
 */

import type { BacktestConfig, BacktestResult } from "../backtest/types";
import { DEFAULT_BACKTEST_CONFIG } from "../backtest/types";
import { fetchHistoricalDataset, loadCachedDataset, getCacheStats } from "../backtest/data-fetcher";
import { runBacktest } from "../backtest/engine";
import {
  initBacktestDatabase,
  insertBacktestRun,
  updateBacktestRunStatus,
  insertBacktestTrade,
} from "../db";
import type { CommandResult } from "./commands";

export interface BacktestProgress {
  current: number;
  total: number;
  phase: "fetching" | "running" | "complete";
  message?: string;
}

export type ProgressCallback = (progress: BacktestProgress) => void;

/**
 * Run a backtest with the given configuration
 */
export async function runBacktestCommand(
  days: number = 7,
  onProgress?: ProgressCallback
): Promise<CommandResult> {
  try {
    initBacktestDatabase();

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Report initial progress
    onProgress?.({
      current: 0,
      total: 100,
      phase: "fetching",
      message: "Loading historical data...",
    });

    // Load or fetch market data
    let markets = await loadCachedDataset(startDate, endDate);

    if (markets.length === 0) {
      onProgress?.({
        current: 0,
        total: 100,
        phase: "fetching",
        message: "Fetching from API...",
      });

      markets = await fetchHistoricalDataset(startDate, endDate, {
        onProgress: (p) => {
          onProgress?.({
            current: Math.floor((p.current / p.total) * 50),
            total: 100,
            phase: "fetching",
            message: `Fetching markets: ${p.current}/${p.total}`,
          });
        },
      });
    }

    if (markets.length === 0) {
      return {
        success: false,
        message: "No historical data available for this period.",
      };
    }

    onProgress?.({
      current: 50,
      total: 100,
      phase: "running",
      message: `Running backtest on ${markets.length} markets...`,
    });

    // Build config from env defaults
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      startDate,
      endDate,
      entryThreshold: parseFloat(process.env.BACKTEST_ENTRY_THRESHOLD || "0.95"),
      maxEntryPrice: parseFloat(process.env.BACKTEST_MAX_ENTRY_PRICE || "0.98"),
      stopLoss: parseFloat(process.env.BACKTEST_STOP_LOSS || "0.80"),
      startingBalance: parseFloat(process.env.BACKTEST_STARTING_BALANCE || "100"),
      riskMode: (process.env.BACKTEST_MODE || "normal") as "normal" | "super-risk" | "safe",
    };

    // Run the backtest
    const result = runBacktest(config, markets);

    // Save to database
    const runId = insertBacktestRun(config, markets.length);
    for (const trade of result.trades) {
      insertBacktestTrade(runId, trade);
    }
    updateBacktestRunStatus(runId, "COMPLETED");

    onProgress?.({
      current: 100,
      total: 100,
      phase: "complete",
      message: "Backtest complete",
    });

    // Format results
    const winRate = result.metrics.totalTrades > 0
      ? ((result.metrics.wins / result.metrics.totalTrades) * 100).toFixed(1)
      : "0.0";

    const lines: string[] = [
      "Backtest Results:",
      "",
      `Period:        ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
      `Markets:       ${markets.length}`,
      "",
      `Total Trades:  ${result.metrics.totalTrades}`,
      `Wins:          ${result.metrics.wins}`,
      `Losses:        ${result.metrics.losses}`,
      `Win Rate:      ${winRate}%`,
      "",
      `Final Balance: $${result.metrics.finalBalance.toFixed(2)}`,
      `Total PnL:     $${result.metrics.totalPnL.toFixed(2)}`,
      `Max Drawdown:  ${(result.metrics.maxDrawdown * 100).toFixed(1)}%`,
    ];

    return {
      success: true,
      message: lines.join("\n"),
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Backtest failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get backtest data statistics
 */
export async function getBacktestStatsCommand(): Promise<CommandResult> {
  try {
    initBacktestDatabase();

    const stats = getCacheStats();

    const lines: string[] = [
      "Backtest Data Statistics:",
      "",
      `Markets Cached:  ${stats.totalMarkets}`,
      `Price Ticks:     ${stats.totalPriceTicks}`,
    ];

    if (stats.dateRange.earliest && stats.dateRange.latest) {
      lines.push(
        `Date Range:      ${stats.dateRange.earliest.toISOString().slice(0, 10)} to ${stats.dateRange.latest.toISOString().slice(0, 10)}`
      );
    } else {
      lines.push("Date Range:      No data");
    }

    return {
      success: true,
      message: lines.join("\n"),
      data: stats,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fetch historical data for backtesting
 */
export async function fetchBacktestDataCommand(
  days: number = 7,
  onProgress?: ProgressCallback
): Promise<CommandResult> {
  try {
    initBacktestDatabase();

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    onProgress?.({
      current: 0,
      total: 100,
      phase: "fetching",
      message: "Fetching historical data...",
    });

    const markets = await fetchHistoricalDataset(startDate, endDate, {
      onProgress: (p) => {
        onProgress?.({
          current: Math.floor((p.current / p.total) * 100),
          total: 100,
          phase: "fetching",
          message: `Fetching: ${p.current}/${p.total} markets`,
        });
      },
    });

    onProgress?.({
      current: 100,
      total: 100,
      phase: "complete",
      message: "Fetch complete",
    });

    return {
      success: true,
      message: `Fetched ${markets.length} markets from ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
      data: { marketCount: markets.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
