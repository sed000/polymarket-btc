import {
  getRecentTrades,
  getTradeStats,
  getOpenTrades,
  getTotalPnL,
  type Trade,
} from "../../db";

export async function handleGetRecentTrades(url: URL): Promise<Response> {
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 10;

  try {
    const trades = getRecentTrades(limit);
    return Response.json(trades);
  } catch (err) {
    return Response.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}

export async function handleGetTradeStats(): Promise<Response> {
  try {
    const stats = getTradeStats();
    const totalPnL = getTotalPnL();
    return Response.json({ ...stats, totalPnL });
  } catch (err) {
    return Response.json({ error: "Failed to fetch trade stats" }, { status: 500 });
  }
}

export async function handleGetOpenTrades(): Promise<Response> {
  try {
    const trades = getOpenTrades();
    return Response.json(trades);
  } catch (err) {
    return Response.json({ error: "Failed to fetch open trades" }, { status: 500 });
  }
}
