/**
 * CLI Module
 * Interactive command interface for the trading bot
 */

export { parseCommand, isParseError, getSuggestions } from "./parser";
export type { ParsedCommand, ParseResult, ParseError, CommandType } from "./parser";

export { executeCommand } from "./executor";
export type { ExecuteOptions } from "./executor";

export type { CommandResult } from "./commands";
export { handleHelpCommand, getConfigSummary } from "./commands";

export {
  validateConfigValue,
  normalizeSettingKey,
  parseConfigValue,
  requiresRestart,
  formatConfigValue,
  HOT_RELOADABLE_SETTINGS,
  RESTART_REQUIRED_SETTINGS,
} from "./config-manager";

export {
  loadStoredConfig,
  saveStoredConfig,
  mergeWithStoredConfig,
  updateAndPersist,
  clearStoredConfig,
  getConfigFilePath,
} from "./config-store";
export type { StoredConfig } from "./config-store";

export {
  runBacktestCommand,
  getBacktestStatsCommand,
  fetchBacktestDataCommand,
} from "./backtest-runner";
export type { BacktestProgress, ProgressCallback } from "./backtest-runner";
