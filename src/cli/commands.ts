/**
 * CLI Commands Implementation
 * Individual command handlers
 */

import type { Bot, BotConfig, RiskMode } from "../bot";
import { getTradeStats, getTotalPnL } from "../db";
import {
  validateConfigValue,
  normalizeSettingKey,
  parseConfigValue,
  requiresRestart,
  formatConfigValue,
} from "./config-manager";
import { updateAndPersist } from "./config-store";

export interface CommandResult {
  success: boolean;
  message: string;
  requiresRestart?: boolean;
  data?: any;
}

/**
 * Handle :set command
 */
export function handleSetCommand(
  bot: Bot,
  subcommand: string,
  args: string[]
): CommandResult {
  const value = args.join(" ");

  // Validate the setting
  const validation = validateConfigValue(subcommand, value);
  if (!validation.valid) {
    return { success: false, message: validation.error! };
  }

  // Normalize the key
  const configKey = normalizeSettingKey(subcommand);
  if (!configKey) {
    return { success: false, message: `Unknown setting: ${subcommand}` };
  }

  // Parse the value
  const parsedValue = parseConfigValue(configKey, value);

  // Check if this setting requires a restart
  const needsRestart = requiresRestart(configKey);

  // Update the bot config
  bot.updateConfig({ [configKey]: parsedValue });

  // Persist the change
  updateAndPersist(configKey, parsedValue);

  // Format the message
  const displayValue = formatConfigValue(configKey, parsedValue);
  let message = `${configKey} set to ${displayValue}`;

  if (needsRestart) {
    message += " (restart required to take effect)";
  }

  return {
    success: true,
    message,
    requiresRestart: needsRestart,
  };
}

/**
 * Handle :show config command
 */
export function handleShowConfigCommand(bot: Bot): CommandResult {
  const config = bot.getConfig();
  const state = bot.getState();

  const lines: string[] = [
    "Current Configuration:",
    "",
    `Risk Mode:       ${config.riskMode}`,
    `Paper Trading:   ${config.paperTrading ? "enabled" : "disabled"}`,
    `Paper Balance:   $${config.paperBalance.toFixed(2)}`,
    "",
    `Entry Threshold: $${config.entryThreshold.toFixed(2)}`,
    `Max Entry Price: $${config.maxEntryPrice.toFixed(2)}`,
    `Stop Loss:       $${config.stopLoss.toFixed(2)}`,
    `Max Spread:      $${config.maxSpread.toFixed(2)}`,
    "",
    `Max Positions:   ${config.maxPositions}`,
    `Compound Limit:  ${config.compoundLimit > 0 ? `$${config.compoundLimit.toFixed(2)}` : "disabled"}`,
    `Base Balance:    $${config.baseBalance.toFixed(2)}`,
    "",
    `Time Window:     ${(config.timeWindowMs / 60000).toFixed(1)} min`,
    `Poll Interval:   ${(config.pollIntervalMs / 1000).toFixed(0)}s`,
  ];

  // Add runtime state info
  if (config.riskMode === "dynamic-risk") {
    lines.push("");
    lines.push("Dynamic-Risk State:");
    lines.push(`  Consecutive Losses: ${state.consecutiveLosses}`);
    lines.push(`  Consecutive Wins:   ${state.consecutiveWins}`);
    const dynamicThreshold = Math.min(0.70 + state.consecutiveLosses * 0.05, 0.85);
    lines.push(`  Active Threshold:   $${dynamicThreshold.toFixed(2)}`);
  }

  return {
    success: true,
    message: lines.join("\n"),
    data: config,
  };
}

/**
 * Handle :show stats command
 */
export function handleShowStatsCommand(): CommandResult {
  const stats = getTradeStats();
  const totalPnL = getTotalPnL();

  const winRate = stats.total > 0 ? ((stats.wins / (stats.wins + stats.losses)) * 100) : 0;

  const lines: string[] = [
    "Trading Statistics:",
    "",
    `Total Trades:  ${stats.total}`,
    `Wins:          ${stats.wins}`,
    `Losses:        ${stats.losses}`,
    `Open:          ${stats.open}`,
    `Win Rate:      ${winRate.toFixed(1)}%`,
    "",
    `Total PnL:     $${totalPnL.toFixed(2)}`,
  ];

  return {
    success: true,
    message: lines.join("\n"),
    data: stats,
  };
}

/**
 * Handle :help command
 */
export function handleHelpCommand(): CommandResult {
  const lines: string[] = [
    "Available Commands:",
    "",
    "Configuration:",
    "  :set risk <mode>        Change risk mode (normal|super-risk|dynamic-risk|safe)",
    "  :set entry <price>      Set entry threshold (e.g., 0.95)",
    "  :set maxentry <price>   Set max entry price (e.g., 0.98)",
    "  :set stop <price>       Set stop-loss threshold (e.g., 0.80)",
    "  :set spread <price>     Set max spread (e.g., 0.03)",
    "  :set positions <n>      Set max concurrent positions",
    "  :set compound <amount>  Set compound limit (0 to disable)",
    "  :set base <amount>      Set base balance for compounding",
    "",
    "Information:",
    "  :show config            Display current configuration",
    "  :show stats             Display trading statistics",
    "",
    "Backtesting:",
    "  :backtest run [days]    Run backtest (default: 7 days)",
    "  :backtest stats         Show backtest data statistics",
    "  :backtest fetch [days]  Fetch historical data",
    "",
    "Other:",
    "  :help                   Show this help message",
    "  :quit                   Exit the application",
    "",
    "Keyboard Shortcuts:",
    "  :                       Enter command mode",
    "  Escape                  Cancel command mode",
    "  Enter                   Execute command",
  ];

  return {
    success: true,
    message: lines.join("\n"),
  };
}

/**
 * Get formatted config for display in header
 */
export function getConfigSummary(config: BotConfig): string {
  return `Entry: $${config.entryThreshold.toFixed(2)}-${config.maxEntryPrice.toFixed(2)} | Stop: $${config.stopLoss.toFixed(2)}`;
}
