import {
  handleGetState,
  handleGetConfig,
  handleStart,
  handleStop,
  handleGetMarkets,
  handleGetWsStats,
} from "./handlers/bot";
import {
  handleGetRecentTrades,
  handleGetTradeStats,
  handleGetOpenTrades,
} from "./handlers/trades";
import {
  handleRunBacktest,
  handleGetBacktestHistory,
  handleGetBacktestRun,
  handleOptimize,
  handleGetCacheStats,
  handleFetchData,
} from "./handlers/backtest";
import {
  handleListStrategies,
  handleGetStrategy,
  handleCreateStrategy,
  handleUpdateStrategy,
  handleDeleteStrategy,
  handleApplyStrategy,
  handleGetActiveStrategy,
} from "./handlers/strategies";

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle preflight requests
  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let response: Response;

    // Bot routes
    if (path === "/api/bot/state" && method === "GET") {
      response = await handleGetState();
    } else if (path === "/api/bot/config" && method === "GET") {
      response = await handleGetConfig();
    } else if (path === "/api/bot/start" && method === "POST") {
      response = await handleStart();
    } else if (path === "/api/bot/stop" && method === "POST") {
      response = await handleStop();
    } else if (path === "/api/bot/markets" && method === "GET") {
      response = await handleGetMarkets();
    } else if (path === "/api/bot/ws-stats" && method === "GET") {
      response = await handleGetWsStats();
    }

    // Trade routes
    else if (path === "/api/trades/recent" && method === "GET") {
      response = await handleGetRecentTrades(url);
    } else if (path === "/api/trades/stats" && method === "GET") {
      response = await handleGetTradeStats();
    } else if (path === "/api/trades/open" && method === "GET") {
      response = await handleGetOpenTrades();
    }

    // Backtest routes
    else if (path === "/api/backtest/run" && method === "POST") {
      response = await handleRunBacktest(req);
    } else if (path === "/api/backtest/history" && method === "GET") {
      response = await handleGetBacktestHistory(url);
    } else if (path.match(/^\/api\/backtest\/run\/\d+$/) && method === "GET") {
      const runId = path.split("/").pop()!;
      response = await handleGetBacktestRun(runId);
    } else if (path === "/api/backtest/optimize" && method === "POST") {
      response = await handleOptimize(req);
    } else if (path === "/api/backtest/cache-stats" && method === "GET") {
      response = await handleGetCacheStats();
    } else if (path === "/api/backtest/fetch" && method === "POST") {
      response = await handleFetchData(req);
    }

    // Strategy routes
    else if (path === "/api/strategies" && method === "GET") {
      response = await handleListStrategies();
    } else if (path === "/api/strategies" && method === "POST") {
      response = await handleCreateStrategy(req);
    } else if (path === "/api/strategies/active" && method === "GET") {
      response = await handleGetActiveStrategy();
    } else if (path.match(/^\/api\/strategies\/\d+$/) && method === "GET") {
      const id = path.split("/").pop()!;
      response = await handleGetStrategy(id);
    } else if (path.match(/^\/api\/strategies\/\d+$/) && method === "PUT") {
      const id = path.split("/").pop()!;
      response = await handleUpdateStrategy(id, req);
    } else if (path.match(/^\/api\/strategies\/\d+$/) && method === "DELETE") {
      const id = path.split("/").pop()!;
      response = await handleDeleteStrategy(id);
    } else if (path.match(/^\/api\/strategies\/\d+\/apply$/) && method === "POST") {
      const id = path.split("/")[3];
      response = await handleApplyStrategy(id);
    }

    // Not found
    else {
      response = Response.json({ error: "Not found" }, { status: 404 });
    }

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (err) {
    console.error("Request error:", err);
    return Response.json({ error: "Internal server error" }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
