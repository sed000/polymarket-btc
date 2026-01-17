import { Bot } from "../bot";
import { buildBotConfigFromEnv, getPrivateKey, validateBotConfig } from "../config";
import { initDatabase } from "../db";
import { handleRequest } from "./routes";
import { wsManager, type WebSocketData } from "./websocket";
import { setBotInstance } from "./handlers/bot";

const PORT = parseInt(process.env.WEB_PORT || "3001", 10);

// Build config from environment
const config = buildBotConfigFromEnv();
const configErrors = validateBotConfig(config);
if (configErrors.length > 0) {
  console.error("Configuration errors:");
  configErrors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

const privateKey = getPrivateKey(config.paperTrading);
if (!privateKey) {
  console.error("Error: PRIVATE_KEY environment variable is required for real trading");
  console.error("Or enable paper trading mode: PAPER_TRADING=true");
  process.exit(1);
}

// Initialize database
initDatabase(config.paperTrading, config.riskMode);

// Create bot instance
const bot = new Bot(privateKey, config, (message) => {
  // Broadcast log to WebSocket clients
  wsManager.broadcastLog(message);
});

// Set bot instance for handlers
setBotInstance(bot);

// State broadcast interval
let stateBroadcastInterval: Timer | null = null;

async function startBot() {
  console.log("Initializing Polymarket BTC Bot...\n");

  // Suppress verbose axios errors during init
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const msg = args[0]?.toString() || "";
    if (msg.includes("request error") || msg.includes("CLOB Client")) {
      return;
    }
    originalError.apply(console, args);
  };

  try {
    await bot.init();
  } finally {
    console.error = originalError;
  }

  // Broadcast state periodically
  stateBroadcastInterval = setInterval(() => {
    const state = bot.getState();
    wsManager.broadcastStateUpdate({
      running: state.running,
      balance: state.balance,
      savedProfit: state.savedProfit,
      positionCount: state.positions.size,
      tradingEnabled: state.tradingEnabled,
      wsConnected: state.wsConnected,
      paperTrading: state.paperTrading,
      consecutiveLosses: state.consecutiveLosses,
      consecutiveWins: state.consecutiveWins,
    });
  }, 1000);

  console.log(`\nBot initialized. Web server starting on port ${PORT}...`);
}

// Start the server
const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: {
          id: wsManager.generateId(),
        } as WebSocketData,
      });
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Serve static files from web/dist for production
    if (!url.pathname.startsWith("/api")) {
      const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(`./src/web/dist${filePath}`);
      if (await file.exists()) {
        return new Response(file);
      }
      // SPA fallback - serve index.html for all routes
      const indexFile = Bun.file("./src/web/dist/index.html");
      if (await indexFile.exists()) {
        return new Response(indexFile);
      }
    }

    // API routes
    return handleRequest(req);
  },
  websocket: {
    open(ws: import("bun").ServerWebSocket<WebSocketData>) {
      wsManager.addClient(ws);

      // Send initial state
      const state = bot.getState();
      ws.send(JSON.stringify({
        type: "state_update",
        data: {
          running: state.running,
          balance: state.balance,
          savedProfit: state.savedProfit,
          positionCount: state.positions.size,
          tradingEnabled: state.tradingEnabled,
          wsConnected: state.wsConnected,
          paperTrading: state.paperTrading,
          consecutiveLosses: state.consecutiveLosses,
          consecutiveWins: state.consecutiveWins,
        },
      }));
    },
    message(ws, message) {
      // Handle incoming messages if needed
      try {
        const data = JSON.parse(message.toString());
        console.log("[WS] Received message:", data);
      } catch {
        // Ignore invalid JSON
      }
    },
    close(ws: import("bun").ServerWebSocket<WebSocketData>) {
      wsManager.removeClient(ws);
    },
  },
});

// Initialize bot
startBot().catch((err) => {
  console.error("Failed to initialize bot:", err);
  process.exit(1);
});

console.log(`Web server running at http://localhost:${PORT}`);
console.log(`WebSocket available at ws://localhost:${PORT}/ws`);

// Handle shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  if (stateBroadcastInterval) {
    clearInterval(stateBroadcastInterval);
  }
  bot.stop();
  process.exit(0);
});
