/**
 * Config Manager
 * Manages runtime configuration and tracks which settings can be hot-reloaded
 */

import type { RiskMode, BotConfig } from "../bot";

export interface ConfigValidationResult {
  valid: boolean;
  error?: string;
}

// Settings that can be changed immediately without restart
export const HOT_RELOADABLE_SETTINGS = new Set([
  "entryThreshold",
  "maxEntryPrice",
  "stopLoss",
  "maxSpread",
  "compoundLimit",
  "baseBalance",
  "maxPositions",
  "timeWindowMs",
]);

// Settings that require a restart to take effect
export const RESTART_REQUIRED_SETTINGS = new Set([
  "riskMode",
  "paperTrading",
  "paperBalance",
]);

/**
 * Validate a config value
 */
export function validateConfigValue(
  key: string,
  value: string
): ConfigValidationResult {
  switch (key) {
    case "risk":
    case "riskMode": {
      const validModes: RiskMode[] = ["normal", "super-risk", "dynamic-risk", "safe"];
      if (!validModes.includes(value as RiskMode)) {
        return {
          valid: false,
          error: `Invalid risk mode. Valid modes: ${validModes.join(", ")}`,
        };
      }
      return { valid: true };
    }

    case "entry":
    case "entryThreshold": {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {
        return { valid: false, error: "Entry threshold must be between 0 and 1" };
      }
      return { valid: true };
    }

    case "maxentry":
    case "maxEntryPrice": {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {
        return { valid: false, error: "Max entry price must be between 0 and 1" };
      }
      return { valid: true };
    }

    case "stop":
    case "stopLoss": {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {
        return { valid: false, error: "Stop loss must be between 0 and 1" };
      }
      return { valid: true };
    }

    case "spread":
    case "maxSpread": {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 0.2) {
        return { valid: false, error: "Max spread must be between 0 and 0.2" };
      }
      return { valid: true };
    }

    case "balance":
    case "paperBalance": {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        return { valid: false, error: "Balance must be a positive number" };
      }
      return { valid: true };
    }

    case "compound":
    case "compoundLimit": {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        return { valid: false, error: "Compound limit must be >= 0 (0 to disable)" };
      }
      return { valid: true };
    }

    case "base":
    case "baseBalance": {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        return { valid: false, error: "Base balance must be a positive number" };
      }
      return { valid: true };
    }

    case "positions":
    case "maxPositions": {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) {
        return { valid: false, error: "Max positions must be at least 1" };
      }
      return { valid: true };
    }

    case "window":
    case "timeWindowMs": {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) {
        return { valid: false, error: "Time window must be >= 0 (in milliseconds)" };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown setting: ${key}` };
  }
}

/**
 * Map CLI setting names to config keys
 */
export function normalizeSettingKey(key: string): keyof BotConfig | null {
  const mapping: Record<string, keyof BotConfig> = {
    risk: "riskMode",
    riskmode: "riskMode",
    entry: "entryThreshold",
    entrythreshold: "entryThreshold",
    maxentry: "maxEntryPrice",
    maxentryprice: "maxEntryPrice",
    stop: "stopLoss",
    stoploss: "stopLoss",
    spread: "maxSpread",
    maxspread: "maxSpread",
    balance: "paperBalance",
    paperbalance: "paperBalance",
    compound: "compoundLimit",
    compoundlimit: "compoundLimit",
    base: "baseBalance",
    basebalance: "baseBalance",
    positions: "maxPositions",
    maxpositions: "maxPositions",
    window: "timeWindowMs",
    timewindowms: "timeWindowMs",
  };

  return mapping[key.toLowerCase()] || null;
}

/**
 * Parse a value to the appropriate type for a config key
 */
export function parseConfigValue(key: keyof BotConfig, value: string): any {
  switch (key) {
    case "riskMode":
      return value as RiskMode;
    case "paperTrading":
      return value.toLowerCase() === "true";
    case "maxPositions":
    case "signatureType":
    case "timeWindowMs":
    case "pollIntervalMs":
      return parseInt(value, 10);
    default:
      return parseFloat(value);
  }
}

/**
 * Check if a setting requires a restart
 */
export function requiresRestart(key: keyof BotConfig): boolean {
  return RESTART_REQUIRED_SETTINGS.has(key);
}

/**
 * Format a config value for display
 */
export function formatConfigValue(key: keyof BotConfig, value: any): string {
  switch (key) {
    case "entryThreshold":
    case "maxEntryPrice":
    case "stopLoss":
    case "maxSpread":
      return `$${value.toFixed(2)}`;
    case "paperBalance":
    case "compoundLimit":
    case "baseBalance":
      return `$${value.toFixed(2)}`;
    case "timeWindowMs":
      return `${(value / 60000).toFixed(1)} min`;
    case "pollIntervalMs":
      return `${(value / 1000).toFixed(0)}s`;
    case "paperTrading":
      return value ? "enabled" : "disabled";
    default:
      return String(value);
  }
}
