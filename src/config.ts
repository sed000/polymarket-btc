import type { BotConfig, RiskMode } from "./bot";

export function buildBotConfigFromEnv(): BotConfig {
  const paperTrading = process.env.PAPER_TRADING === "true";

  return {
    entryThreshold: parseFloat(process.env.ENTRY_THRESHOLD || "0.95"),
    maxEntryPrice: parseFloat(process.env.MAX_ENTRY_PRICE || "0.98"),
    stopLoss: parseFloat(process.env.STOP_LOSS || "0.80"),
    maxSpread: parseFloat(process.env.MAX_SPREAD || "0.03"),
    timeWindowMs: parseInt(process.env.TIME_WINDOW_MINS || "5") * 60 * 1000,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "10000"),
    paperTrading,
    paperBalance: parseFloat(process.env.PAPER_BALANCE || "100"),
    riskMode: (process.env.RISK_MODE || "normal") as RiskMode,
    compoundLimit: parseFloat(process.env.COMPOUND_LIMIT || "0"),
    baseBalance: parseFloat(process.env.BASE_BALANCE || "10"),
    signatureType: parseInt(process.env.SIGNATURE_TYPE || "1") as 0 | 1 | 2,
    funderAddress: process.env.FUNDER_ADDRESS,
    maxPositions: parseInt(process.env.MAX_POSITIONS || "1"),
  };
}

export function validateBotConfig(config: BotConfig): string[] {
  const errors: string[] = [];

  if (isNaN(config.entryThreshold) || config.entryThreshold < 0 || config.entryThreshold > 1) {
    errors.push("ENTRY_THRESHOLD must be a number between 0 and 1");
  }
  if (isNaN(config.stopLoss) || config.stopLoss < 0 || config.stopLoss > 1) {
    errors.push("STOP_LOSS must be a number between 0 and 1");
  }
  if (isNaN(config.maxEntryPrice) || config.maxEntryPrice < 0 || config.maxEntryPrice > 1) {
    errors.push("MAX_ENTRY_PRICE must be a number between 0 and 1");
  }
  if (config.stopLoss >= config.entryThreshold) {
    errors.push("STOP_LOSS must be less than ENTRY_THRESHOLD");
  }
  if (isNaN(config.paperBalance) || config.paperBalance < 0) {
    errors.push("PAPER_BALANCE must be a positive number");
  }
  if (isNaN(config.maxPositions) || config.maxPositions < 1) {
    errors.push("MAX_POSITIONS must be at least 1");
  }

  return errors;
}

export function getPrivateKey(paperTrading: boolean): string | null {
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey && !paperTrading) {
    return null;
  }

  // In paper trading mode, use a placeholder key (no real transactions)
  return privateKey || "paper-trading-mode";
}
