import { BacktestEngine, runBacktest } from "../../backtest/engine";
import {
  fetchHistoricalDataset,
  loadCachedDataset,
  getCacheStats,
} from "../../backtest/data-fetcher";
import type { BacktestConfig, BacktestResult, OptimizationRanges } from "../../backtest/types";
import { DEFAULT_BACKTEST_CONFIG, DEFAULT_OPTIMIZATION_RANGES } from "../../backtest/types";
import {
  listBacktestRuns,
  getBacktestTrades,
  getBacktestTradeStats,
  initBacktestDatabase,
} from "../../db";
import { wsManager } from "../websocket";

// Initialize backtest database on import
initBacktestDatabase();

export async function handleRunBacktest(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Parse config from request
    const config: BacktestConfig = {
      entryThreshold: body.entryThreshold ?? DEFAULT_BACKTEST_CONFIG.entryThreshold,
      maxEntryPrice: body.maxEntryPrice ?? DEFAULT_BACKTEST_CONFIG.maxEntryPrice,
      stopLoss: body.stopLoss ?? DEFAULT_BACKTEST_CONFIG.stopLoss,
      maxSpread: body.maxSpread ?? DEFAULT_BACKTEST_CONFIG.maxSpread,
      timeWindowMs: body.timeWindowMs ?? DEFAULT_BACKTEST_CONFIG.timeWindowMs,
      profitTarget: body.profitTarget ?? DEFAULT_BACKTEST_CONFIG.profitTarget,
      startingBalance: body.startingBalance ?? DEFAULT_BACKTEST_CONFIG.startingBalance,
      slippage: body.slippage ?? DEFAULT_BACKTEST_CONFIG.slippage,
      compoundLimit: body.compoundLimit ?? DEFAULT_BACKTEST_CONFIG.compoundLimit,
      baseBalance: body.baseBalance ?? DEFAULT_BACKTEST_CONFIG.baseBalance,
      riskMode: body.riskMode ?? DEFAULT_BACKTEST_CONFIG.riskMode,
      startDate: new Date(body.startDate || Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(body.endDate || Date.now()),
    };

    // Broadcast progress
    wsManager.broadcastBacktestProgress(0, "Loading historical data...");

    // Load or fetch market data
    let markets;
    if (body.fetchFresh) {
      markets = await fetchHistoricalDataset(config.startDate, config.endDate, {
        forceRefetch: false,
        onProgress: (progress) => {
          const pct = Math.round((progress.current / progress.total) * 50);
          wsManager.broadcastBacktestProgress(pct, `Loading: ${progress.slug} (${progress.status})`);
        },
      });
    } else {
      markets = await loadCachedDataset(config.startDate, config.endDate);
    }

    if (markets.length === 0) {
      return Response.json({
        error: "No historical data available for the specified date range. Try running with fetchFresh: true",
      }, { status: 400 });
    }

    wsManager.broadcastBacktestProgress(50, `Running backtest on ${markets.length} markets...`);

    // Run backtest
    const result = runBacktest(config, markets);

    wsManager.broadcastBacktestProgress(100, "Backtest complete");

    return Response.json({
      ...result,
      marketsLoaded: markets.length,
      config: {
        ...result.config,
        startDate: result.config.startDate.toISOString(),
        endDate: result.config.endDate.toISOString(),
      },
    });
  } catch (err) {
    console.error("Backtest error:", err);
    return Response.json({ error: "Backtest failed" }, { status: 500 });
  }
}

export async function handleGetBacktestHistory(url: URL): Promise<Response> {
  try {
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    const runs = listBacktestRuns(limit);

    // Parse config JSON for each run
    const parsedRuns = runs.map((run) => ({
      ...run,
      config: JSON.parse(run.config_json),
    }));

    return Response.json(parsedRuns);
  } catch (err) {
    return Response.json({ error: "Failed to fetch backtest history" }, { status: 500 });
  }
}

export async function handleGetBacktestRun(runId: string): Promise<Response> {
  try {
    const trades = getBacktestTrades(parseInt(runId, 10));
    const stats = getBacktestTradeStats(parseInt(runId, 10));

    return Response.json({ trades, stats });
  } catch (err) {
    return Response.json({ error: "Failed to fetch backtest run" }, { status: 500 });
  }
}

export async function handleOptimize(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Base config
    const baseConfig: Omit<BacktestConfig, "startDate" | "endDate"> = {
      entryThreshold: body.entryThreshold ?? DEFAULT_BACKTEST_CONFIG.entryThreshold,
      maxEntryPrice: body.maxEntryPrice ?? DEFAULT_BACKTEST_CONFIG.maxEntryPrice,
      stopLoss: body.stopLoss ?? DEFAULT_BACKTEST_CONFIG.stopLoss,
      maxSpread: body.maxSpread ?? DEFAULT_BACKTEST_CONFIG.maxSpread,
      timeWindowMs: body.timeWindowMs ?? DEFAULT_BACKTEST_CONFIG.timeWindowMs,
      profitTarget: body.profitTarget ?? DEFAULT_BACKTEST_CONFIG.profitTarget,
      startingBalance: body.startingBalance ?? DEFAULT_BACKTEST_CONFIG.startingBalance,
      slippage: body.slippage ?? DEFAULT_BACKTEST_CONFIG.slippage,
      compoundLimit: body.compoundLimit ?? DEFAULT_BACKTEST_CONFIG.compoundLimit,
      baseBalance: body.baseBalance ?? DEFAULT_BACKTEST_CONFIG.baseBalance,
      riskMode: body.riskMode ?? DEFAULT_BACKTEST_CONFIG.riskMode,
    };

    const startDate = new Date(body.startDate || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date(body.endDate || Date.now());

    // Optimization ranges
    const ranges: OptimizationRanges = body.ranges ?? DEFAULT_OPTIMIZATION_RANGES;

    wsManager.broadcastBacktestProgress(0, "Loading historical data for optimization...");

    // Load market data
    const markets = await loadCachedDataset(startDate, endDate);
    if (markets.length === 0) {
      return Response.json({
        error: "No historical data available. Fetch data first using POST /api/backtest/run with fetchFresh: true",
      }, { status: 400 });
    }

    // Generate parameter grid
    const parameterSets: BacktestConfig[] = [];

    const entryRange = ranges.entryThreshold ?? { min: baseConfig.entryThreshold, max: baseConfig.entryThreshold, step: 1 };
    const stopRange = ranges.stopLoss ?? { min: baseConfig.stopLoss, max: baseConfig.stopLoss, step: 1 };
    const spreadRange = ranges.maxSpread ?? { min: baseConfig.maxSpread, max: baseConfig.maxSpread, step: 1 };

    for (let entry = entryRange.min; entry <= entryRange.max; entry += entryRange.step) {
      for (let stop = stopRange.min; stop <= stopRange.max; stop += stopRange.step) {
        for (let spread = spreadRange.min; spread <= spreadRange.max; spread += spreadRange.step) {
          parameterSets.push({
            ...baseConfig,
            entryThreshold: entry,
            stopLoss: stop,
            maxSpread: spread,
            startDate,
            endDate,
          });
        }
      }
    }

    wsManager.broadcastBacktestProgress(10, `Testing ${parameterSets.length} parameter combinations...`);

    // Run all backtests
    const results: Array<{ config: BacktestConfig; result: BacktestResult }> = [];

    for (let i = 0; i < parameterSets.length; i++) {
      const config = parameterSets[i];
      const result = runBacktest(config, markets);
      results.push({ config, result });

      const progress = 10 + Math.round(((i + 1) / parameterSets.length) * 90);
      if (i % 10 === 0 || i === parameterSets.length - 1) {
        wsManager.broadcastBacktestProgress(progress, `Tested ${i + 1}/${parameterSets.length} combinations`);
      }
    }

    // Sort by total PnL
    results.sort((a, b) => b.result.metrics.totalPnL - a.result.metrics.totalPnL);

    // Return top 10 results
    const topResults = results.slice(0, 10).map((r, i) => ({
      rank: i + 1,
      config: {
        entryThreshold: r.config.entryThreshold,
        maxEntryPrice: r.config.maxEntryPrice,
        stopLoss: r.config.stopLoss,
        maxSpread: r.config.maxSpread,
        timeWindowMs: r.config.timeWindowMs,
        profitTarget: r.config.profitTarget,
        riskMode: r.config.riskMode,
      },
      metrics: r.result.metrics,
    }));

    wsManager.broadcastBacktestProgress(100, "Optimization complete");

    return Response.json({
      totalCombinations: parameterSets.length,
      marketsUsed: markets.length,
      topResults,
    });
  } catch (err) {
    console.error("Optimization error:", err);
    return Response.json({ error: "Optimization failed" }, { status: 500 });
  }
}

export async function handleGetCacheStats(): Promise<Response> {
  try {
    const stats = getCacheStats();
    return Response.json({
      ...stats,
      dateRange: {
        earliest: stats.dateRange.earliest?.toISOString() || null,
        latest: stats.dateRange.latest?.toISOString() || null,
      },
    });
  } catch (err) {
    return Response.json({ error: "Failed to get cache stats" }, { status: 500 });
  }
}

export async function handleFetchData(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const startDate = new Date(body.startDate || Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date(body.endDate || Date.now());
    const forceRefetch = body.forceRefetch ?? false;

    wsManager.broadcastBacktestProgress(0, "Fetching historical data...");

    const markets = await fetchHistoricalDataset(startDate, endDate, {
      forceRefetch,
      onProgress: (progress) => {
        const pct = Math.round((progress.current / progress.total) * 100);
        wsManager.broadcastBacktestProgress(pct, `${progress.slug}: ${progress.status}`);
      },
    });

    wsManager.broadcastBacktestProgress(100, "Data fetch complete");

    return Response.json({
      marketsLoaded: markets.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  } catch (err) {
    console.error("Data fetch error:", err);
    return Response.json({ error: "Failed to fetch historical data" }, { status: 500 });
  }
}
