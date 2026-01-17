import type { Bot, BotState, BotConfig, WsStats, Position } from "../../bot";
import type { EligibleMarket } from "../../scanner";

let botInstance: Bot | null = null;

export function setBotInstance(bot: Bot): void {
  botInstance = bot;
}

export function getBotInstance(): Bot | null {
  return botInstance;
}

function positionsToArray(positions: Map<string, Position>): any[] {
  const arr: any[] = [];
  positions.forEach((pos, tokenId) => {
    arr.push({
      tokenId,
      tradeId: pos.tradeId,
      shares: pos.shares,
      entryPrice: pos.entryPrice,
      side: pos.side,
      marketSlug: pos.marketSlug,
      marketEndDate: pos.marketEndDate.toISOString(),
      limitOrderId: pos.limitOrderId,
      dynamicStopLoss: pos.dynamicStopLoss,
    });
  });
  return arr;
}

function serializeBotState(state: BotState): any {
  return {
    running: state.running,
    balance: state.balance,
    savedProfit: state.savedProfit,
    positions: positionsToArray(state.positions),
    pendingEntries: Array.from(state.pendingEntries),
    pendingExits: Array.from(state.pendingExits),
    lastScan: state.lastScan?.toISOString() || null,
    logs: state.logs,
    tradingEnabled: state.tradingEnabled,
    initError: state.initError,
    wsConnected: state.wsConnected,
    userWsConnected: state.userWsConnected,
    markets: state.markets,
    paperTrading: state.paperTrading,
    consecutiveLosses: state.consecutiveLosses,
    consecutiveWins: state.consecutiveWins,
  };
}

export async function handleGetState(): Promise<Response> {
  if (!botInstance) {
    return Response.json({ error: "Bot not initialized" }, { status: 503 });
  }

  const state = botInstance.getState();
  return Response.json(serializeBotState(state));
}

export async function handleGetConfig(): Promise<Response> {
  if (!botInstance) {
    return Response.json({ error: "Bot not initialized" }, { status: 503 });
  }

  const config = botInstance.getConfig();
  return Response.json(config);
}

export async function handleStart(): Promise<Response> {
  if (!botInstance) {
    return Response.json({ error: "Bot not initialized" }, { status: 503 });
  }

  const state = botInstance.getState();
  if (state.running) {
    return Response.json({ error: "Bot is already running" }, { status: 400 });
  }

  await botInstance.start();
  return Response.json({ success: true, message: "Bot started" });
}

export async function handleStop(): Promise<Response> {
  if (!botInstance) {
    return Response.json({ error: "Bot not initialized" }, { status: 503 });
  }

  const state = botInstance.getState();
  if (!state.running) {
    return Response.json({ error: "Bot is not running" }, { status: 400 });
  }

  botInstance.stop();
  return Response.json({ success: true, message: "Bot stopped" });
}

export async function handleGetMarkets(): Promise<Response> {
  if (!botInstance) {
    return Response.json({ error: "Bot not initialized" }, { status: 503 });
  }

  try {
    const markets = await botInstance.getMarketOverview();
    return Response.json(markets);
  } catch (err) {
    return Response.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}

export async function handleGetWsStats(): Promise<Response> {
  if (!botInstance) {
    return Response.json({ error: "Bot not initialized" }, { status: 503 });
  }

  const stats = botInstance.getWsStats();
  return Response.json(stats);
}
