import { Bot } from "./bot";
import { buildBotConfigFromEnv, getPrivateKey, validateBotConfig } from "./config";
import { renderUI } from "./ui";
import { initDatabase } from "./db";

const config = buildBotConfigFromEnv();
const configErrors = validateBotConfig(config);
if (configErrors.length > 0) {
  console.error("Configuration errors:");
  configErrors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

const privateKey = getPrivateKey(config.paperTrading);
if (!privateKey) {
  console.error("Error: PRIVATE_KEY environment variable is required for real trading");
  console.error("Create a .env file with your wallet private key:");
  console.error("  PRIVATE_KEY=0x...");
  console.error("\nOr enable paper trading mode:");
  console.error("  PAPER_TRADING=true");
  process.exit(1);
}

async function main() {
  console.log("Initializing Polymarket BTC Bot...\n");

  // Initialize database based on mode
  initDatabase(config.paperTrading, config.riskMode);

  const bot = new Bot(privateKey, config, () => {
    // Logs are handled by UI
  });

  // Suppress verbose axios errors during init
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const msg = args[0]?.toString() || "";
    // Only suppress axios/CLOB verbose errors
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

  renderUI(bot);
}

main();
