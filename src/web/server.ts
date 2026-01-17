import { existsSync, statSync } from "fs";
import { join, normalize } from "path";
import { Bot, type BotConfig, type BotState, type WsStats } from "../bot";
import { buildBotConfigFromEnv, getPrivateKey, validateBotConfig } from "../config";
import {
  clearBacktestData,
  clearHistoricalData,
  getBacktestTrades,
  getBacktestTradeStats,
  getDbPath,
  getRecentTrades,
  getTotalPnL,
  getTradeStats,
  initBacktestDatabase,
  initDatabase,
  insertBacktestRun,
  insertBacktestTrade,
  listBacktestRuns,
  updateBacktestRunStatus,
} from "../db";
import { loadStrategies, upsertStrategy, deleteStrategy, type StrategyParams } from "../strategy-store";
import { fetchHistoricalDataset, loadCachedDataset, getCacheStats } from "../backtest/data-fetcher";
import { runBacktest } from "../backtest/engine";
import {
  compareConfigs,
  getDetailedOptimizationRanges,
  getQuickOptimizationRanges,
  runOptimization,
} from "../backtest/optimizer";
import { runGeneticOptimization } from "../backtest/genetic";
import { DEFAULT_BACKTEST_CONFIG, SUPER_RISK_CONFIG, type BacktestConfig } from "../backtest/types";
import { buildWebAssets } from "./build";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

type JobStatus = "queued" | "running" | "completed" | "failed";

interface Job {
  id: string;
  type: string;
  status: JobStatus;
  progress?: JsonValue;
  result?: JsonValue;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface SerializedBotState {
  running: boolean;
  balance: number;
  savedProfit: number;
  positions: BotState["positions"] extends Map<string, infer T> ? T[] : unknown[];
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

const ROOT_DIR = process.cwd();
const WEB_DIST_DIR = join(ROOT_DIR, "dist", "web");
const PORT = parseInt(process.env.WEB_PORT || "5175", 10);
const jobs = new Map<string, Job>();

let bot: Bot | null = null;
let botInitError: string | null = null;

function jsonResponse(data: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseDate(value: unknown): Date | null {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function serializeState(state: BotState): SerializedBotState {
  return {
    running: state.running,
    balance: state.balance,
    savedProfit: state.savedProfit,
    positions: Array.from(state.positions.values()),
    pendingEntries: Array.from(state.pendingEntries),
    pendingExits: Array.from(state.pendingExits),
    lastScan: state.lastScan ? state.lastScan.toISOString() : null,
    logs: state.logs,
    tradingEnabled: state.tradingEnabled,
    initError: state.initError,
    wsConnected: state.wsConnected,
    userWsConnected: state.userWsConnected,
    paperTrading: state.paperTrading,
    consecutiveLosses: state.consecutiveLosses,
    consecutiveWins: state.consecutiveWins,
  };
}

function safePath(pathname: string): string {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.replace(/^\/+/, "");
}

function getStaticFile(pathname: string): Response | null {
  const safe = safePath(pathname === "/" ? "/index.html" : pathname);
  const fullPath = join(WEB_DIST_DIR, safe);

  if (!fullPath.startsWith(WEB_DIST_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) {
    return null;
  }

  return new Response(Bun.file(fullPath));
}

function createJob(type: string): Job {
  const now = new Date().toISOString();
  const job: Job = {
    id: crypto.randomUUID(),
    type,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

function updateJob(job: Job, updates: Partial<Job>): void {
  Object.assign(job, updates);
  job.updatedAt = new Date().toISOString();
}

async function runJob(job: Job, handler: () => Promise<JsonValue>): Promise<void> {
  updateJob(job, { status: "running" });
  try {
    const result = await handler();
    updateJob(job, { status: "completed", result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(job, { status: "failed", error: message });
  }
}

function buildBacktestConfig(input: Record<string, unknown>, startDate: Date, endDate: Date): BacktestConfig {
  const base = DEFAULT_BACKTEST_CONFIG;
  return {
    entryThreshold: parseNumber(input.entryThreshold, base.entryThreshold),
    maxEntryPrice: parseNumber(input.maxEntryPrice, base.maxEntryPrice),
    stopLoss: parseNumber(input.stopLoss, base.stopLoss),
    maxSpread: parseNumber(input.maxSpread, base.maxSpread),
    timeWindowMs: parseInteger(input.timeWindowMs, base.timeWindowMs),
    profitTarget: parseNumber(input.profitTarget, base.profitTarget),
    startingBalance: parseNumber(input.startingBalance, base.startingBalance),
    slippage: parseNumber(input.slippage, base.slippage),
    compoundLimit: parseNumber(input.compoundLimit, base.compoundLimit),
    baseBalance: parseNumber(input.baseBalance, base.baseBalance),
    riskMode: (input.riskMode as BacktestConfig["riskMode"]) || base.riskMode,
    startDate,
    endDate,
  };
}

function applyStrategyParams(config: BotConfig, params: StrategyParams): void {
  config.entryThreshold = params.entryThreshold;
  config.maxEntryPrice = params.maxEntryPrice;
  config.stopLoss = params.stopLoss;
  config.maxSpread = params.maxSpread;
  config.timeWindowMs = params.timeWindowMs;
  config.riskMode = params.riskMode;
  config.compoundLimit = params.compoundLimit;
  config.baseBalance = params.baseBalance;
  config.maxPositions = params.maxPositions;
}

async function initBot(): Promise<void> {
  const config = buildBotConfigFromEnv();
  const configErrors = validateBotConfig(config);
  if (configErrors.length > 0) {
    botInitError = configErrors.join(" | ");
    return;
  }

  const privateKey = getPrivateKey(config.paperTrading);
  if (!privateKey) {
    botInitError = "PRIVATE_KEY is required for real trading (set PAPER_TRADING=true to use paper mode).";
    return;
  }

  initDatabase(config.paperTrading, config.riskMode);
  const instance = new Bot(privateKey, config);
  try {
    await instance.init();
    bot = instance;
  } catch (err) {
    botInitError = err instanceof Error ? err.message : String(err);
  }
}

const shouldBuild = process.env.WEB_BUILD === "true" || !existsSync(join(WEB_DIST_DIR, "client.js"));
if (shouldBuild) {
  await buildWebAssets();
}

await initBot();

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;

    if (pathname.startsWith("/api/")) {
      try {
        if (pathname === "/api/overview" && req.method === "GET") {
          if (!bot) {
            return jsonResponse({ ready: false, error: botInitError }, 200);
          }

          const state = bot.getState();
          const config = bot.getConfig();
          const wsStats: WsStats = bot.getWsStats();
          const markets = await bot.getMarketOverview();
          const trades = getRecentTrades(parseInteger(searchParams.get("limit"), 10));
          const stats = getTradeStats();
          const totalPnL = getTotalPnL();

          return jsonResponse({
            ready: true,
            config,
            state: serializeState(state),
            wsStats,
            markets: markets.map(m => ({
              ...m,
              endDate: m.endDate.toISOString(),
            })),
            trades,
            stats: { ...stats, totalPnL },
            dbPath: getDbPath(),
            updatedAt: new Date().toISOString(),
          });
        }

        if (pathname === "/api/bot/start" && req.method === "POST") {
          if (!bot) return jsonResponse({ error: botInitError }, 400);
          await bot.start();
          return jsonResponse({ ok: true });
        }

        if (pathname === "/api/bot/stop" && req.method === "POST") {
          if (!bot) return jsonResponse({ error: botInitError }, 400);
          bot.stop();
          return jsonResponse({ ok: true });
        }

        if (pathname === "/api/strategies" && req.method === "GET") {
          return jsonResponse({ strategies: loadStrategies() });
        }

        if (pathname === "/api/strategies" && req.method === "POST") {
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const params = body.params as StrategyParams | undefined;
          if (!params || !body.name) return jsonResponse({ error: "Missing strategy fields" }, 400);
          const strategy = upsertStrategy({
            id: typeof body.id === "string" ? body.id : undefined,
            name: String(body.name),
            description: typeof body.description === "string" ? body.description : undefined,
            params,
          });
          return jsonResponse({ strategy });
        }

        if (pathname.startsWith("/api/strategies/") && req.method === "DELETE") {
          const id = pathname.split("/").pop() || "";
          const removed = deleteStrategy(id);
          return jsonResponse({ ok: removed });
        }

        if (pathname === "/api/strategies/apply" && req.method === "POST") {
          if (!bot) return jsonResponse({ error: botInitError }, 400);
          const state = bot.getState();
          if (state.running) {
            return jsonResponse({ error: "Stop the bot before applying a new strategy." }, 409);
          }
          if (!bot.getConfig().paperTrading) {
            return jsonResponse({ error: "Applying strategies is only supported in paper trading mode." }, 400);
          }

          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const params = body.params as StrategyParams | undefined;
          if (!params) return jsonResponse({ error: "Missing strategy params" }, 400);

          applyStrategyParams(bot.getConfig(), params);
          initDatabase(true, params.riskMode);
          state.positions = new Map();
          state.pendingEntries = new Set();
          state.pendingExits = new Set();
          state.balance = bot.getConfig().paperBalance;
          state.savedProfit = 0;
          state.consecutiveLosses = 0;
          state.consecutiveWins = 0;

          return jsonResponse({ ok: true, config: bot.getConfig() });
        }

        if (pathname === "/api/backtest/cache" && req.method === "GET") {
          return jsonResponse({ stats: getCacheStats() });
        }

        if (pathname === "/api/backtest/runs" && req.method === "GET") {
          const limit = parseInteger(searchParams.get("limit"), 20);
          const runs = listBacktestRuns(limit).map(run => ({
            ...run,
            config: JSON.parse(run.config_json),
          }));
          return jsonResponse({ runs });
        }

        if (pathname.startsWith("/api/backtest/trades/") && req.method === "GET") {
          const id = Number(pathname.split("/").pop());
          if (!Number.isFinite(id)) return jsonResponse({ error: "Invalid run id" }, 400);
          const limit = parseInteger(searchParams.get("limit"), 200);
          const trades = getBacktestTrades(id).slice(0, limit);
          const stats = getBacktestTradeStats(id);
          return jsonResponse({ trades, stats });
        }

        if (pathname === "/api/backtest/run" && req.method === "POST") {
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const job = createJob("backtest-run");

          void runJob(job, async () => {
            const now = new Date();
            const days = parseInteger(body.days, 7);
            const startDate = parseDate(body.startDate) ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const endDate = parseDate(body.endDate) ?? now;
            const config = buildBacktestConfig((body.config as Record<string, unknown>) || {}, startDate, endDate);

            const force = Boolean(body.force);
            let markets = force
              ? await fetchHistoricalDataset(startDate, endDate, {
                forceRefetch: true,
                onProgress: p => updateJob(job, { progress: p }),
              })
              : await loadCachedDataset(startDate, endDate);

            if (!force && markets.length === 0) {
              markets = await fetchHistoricalDataset(startDate, endDate, {
                onProgress: p => updateJob(job, { progress: p }),
              });
            }

            initBacktestDatabase();
            const result = runBacktest(config, markets);
            const runId = insertBacktestRun(config, markets.length, typeof body.name === "string" ? body.name : undefined);
            for (const trade of result.trades) {
              insertBacktestTrade(runId, trade);
            }
            updateBacktestRunStatus(runId, "COMPLETED");

            return {
              runId,
              metrics: result.metrics,
              equityCurve: result.equityCurve,
              drawdownCurve: result.drawdownCurve,
              savedProfit: result.savedProfit,
              finalBalance: result.finalBalance,
              tradeCount: result.trades.length,
              config,
            };
          });

          return jsonResponse({ jobId: job.id });
        }

        if (pathname === "/api/backtest/fetch" && req.method === "POST") {
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const job = createJob("backtest-fetch");

          void runJob(job, async () => {
            const now = new Date();
            const days = parseInteger(body.days, 7);
            const startDate = parseDate(body.startDate) ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const endDate = parseDate(body.endDate) ?? now;
            const markets = await fetchHistoricalDataset(startDate, endDate, {
              forceRefetch: Boolean(body.force),
              onProgress: p => updateJob(job, { progress: p }),
            });
            return {
              markets: markets.length,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            };
          });

          return jsonResponse({ jobId: job.id });
        }

        if (pathname === "/api/backtest/optimize" && req.method === "POST") {
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const job = createJob("backtest-optimize");

          void runJob(job, async () => {
            const now = new Date();
            const days = parseInteger(body.days, 7);
            const startDate = parseDate(body.startDate) ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const endDate = parseDate(body.endDate) ?? now;
            const ranges = body.quick ? getQuickOptimizationRanges() : getDetailedOptimizationRanges();

            const markets = await loadCachedDataset(startDate, endDate);
            const results = await runOptimization(markets, {
              ranges,
              baseConfig: (body.config as Record<string, unknown>) || {},
              startDate,
              endDate,
              onProgress: p => updateJob(job, { progress: p }),
            });

            return {
              total: results.length,
              top: results.slice(0, 20),
            };
          });

          return jsonResponse({ jobId: job.id });
        }

        if (pathname === "/api/backtest/genetic" && req.method === "POST") {
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const job = createJob("backtest-genetic");

          void runJob(job, async () => {
            const now = new Date();
            const days = parseInteger(body.days, 14);
            const startDate = parseDate(body.startDate) ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const endDate = parseDate(body.endDate) ?? now;
            const markets = await loadCachedDataset(startDate, endDate);

            const configOverrides = (body.config as Record<string, unknown>) || {};
            const ga = (body.ga as Record<string, unknown>) || {};

            const result = await runGeneticOptimization(markets, {
              baseConfig: configOverrides,
              gaConfig: {
                populationSize: parseInteger(ga.population, 50),
                generations: parseInteger(ga.generations, 100),
                mutationRate: parseNumber(ga.mutation, 0.15),
                trainingSplit: parseNumber(ga.trainSplit, 0.7),
                eliteCount: parseInteger(ga.elite, 5),
              },
              onProgress: p => updateJob(job, { progress: p }),
            });

            return {
              bestStrategy: result.bestStrategy,
              topStrategies: result.topStrategies,
              inSampleMetrics: result.inSampleMetrics,
              outOfSampleMetrics: result.outOfSampleMetrics,
              generationHistory: result.generationHistory,
              totalEvaluations: result.totalEvaluations,
              totalGenerations: result.totalGenerations,
              convergedEarly: result.convergedEarly,
              executionTimeMs: result.executionTimeMs,
            };
          });

          return jsonResponse({ jobId: job.id });
        }

        if (pathname === "/api/backtest/compare" && req.method === "POST") {
          const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400);
          const job = createJob("backtest-compare");

          void runJob(job, async () => {
            const now = new Date();
            const days = parseInteger(body.days, 7);
            const startDate = parseDate(body.startDate) ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const endDate = parseDate(body.endDate) ?? now;
            const markets = await loadCachedDataset(startDate, endDate);

            const baseConfig = buildBacktestConfig((body.config as Record<string, unknown>) || {}, startDate, endDate);
            const normalConfig: BacktestConfig = { ...baseConfig, riskMode: "normal" };
            const superConfig: BacktestConfig = { ...baseConfig, ...SUPER_RISK_CONFIG, riskMode: "super-risk" };

            const comparison = compareConfigs(markets, normalConfig, superConfig, ["Normal", "Super-risk"]);
            return {
              comparison: comparison.map(item => ({
                label: item.label,
                metrics: item.result.metrics,
                config: item.result.config,
              })),
            };
          });

          return jsonResponse({ jobId: job.id });
        }

        if (pathname === "/api/backtest/clear" && req.method === "POST") {
          clearBacktestData();
          return jsonResponse({ ok: true });
        }

        if (pathname === "/api/backtest/clear-cache" && req.method === "POST") {
          clearHistoricalData();
          return jsonResponse({ ok: true });
        }

        if (pathname.startsWith("/api/jobs/") && req.method === "GET") {
          const id = pathname.split("/").pop() || "";
          const job = jobs.get(id);
          if (!job) return jsonResponse({ error: "Job not found" }, 404);
          return jsonResponse({ job });
        }

        return jsonResponse({ error: "Not found" }, 404);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
    }

    const staticFile = getStaticFile(pathname);
    if (staticFile) return staticFile;

    const indexFile = getStaticFile("/index.html");
    if (indexFile) return indexFile;

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Web UI running on http://localhost:${server.port}`);
