/**
 * CLI Command Executor
 * Routes parsed commands to their handlers
 */

import type { Bot } from "../bot";
import { parseCommand, isParseError, type ParsedCommand } from "./parser";
import {
  handleSetCommand,
  handleShowConfigCommand,
  handleShowStatsCommand,
  handleHelpCommand,
  type CommandResult,
} from "./commands";
import {
  runBacktestCommand,
  getBacktestStatsCommand,
  fetchBacktestDataCommand,
  type ProgressCallback,
} from "./backtest-runner";

export interface ExecuteOptions {
  onProgress?: ProgressCallback;
  onQuit?: () => void;
}

/**
 * Execute a command string
 */
export async function executeCommand(
  input: string,
  bot: Bot,
  options: ExecuteOptions = {}
): Promise<CommandResult> {
  const parsed = parseCommand(input);

  if (isParseError(parsed)) {
    return {
      success: false,
      message: parsed.message,
    };
  }

  return executeHandlers(parsed, bot, options);
}

/**
 * Execute a parsed command
 */
async function executeHandlers(
  command: ParsedCommand,
  bot: Bot,
  options: ExecuteOptions
): Promise<CommandResult> {
  switch (command.type) {
    case "set":
      return handleSetCommand(bot, command.subcommand!, command.args);

    case "show":
      return handleShowCommand(command.subcommand!, bot);

    case "backtest":
      return handleBacktestCommand(command.subcommand!, command.args, options);

    case "help":
      return handleHelpCommand();

    case "quit":
      options.onQuit?.();
      return {
        success: true,
        message: "Exiting...",
      };

    default:
      return {
        success: false,
        message: `Unknown command type: ${command.type}`,
      };
  }
}

/**
 * Handle :show subcommands
 */
function handleShowCommand(
  subcommand: string,
  bot: Bot
): CommandResult {
  switch (subcommand) {
    case "config":
    case "settings":
    case "c":
      return handleShowConfigCommand(bot);

    case "stats":
    case "statistics":
    case "s":
      return handleShowStatsCommand();

    default:
      return {
        success: false,
        message: `Unknown show option: ${subcommand}. Try: config, stats`,
      };
  }
}

/**
 * Handle :backtest subcommands
 */
async function handleBacktestCommand(
  subcommand: string,
  args: string[],
  options: ExecuteOptions
): Promise<CommandResult> {
  const days = args.length > 0 ? parseInt(args[0], 10) : 7;

  switch (subcommand) {
    case "run":
    case "r":
      return runBacktestCommand(
        isNaN(days) ? 7 : days,
        options.onProgress
      );

    case "stats":
    case "s":
      return getBacktestStatsCommand();

    case "fetch":
    case "f":
      return fetchBacktestDataCommand(
        isNaN(days) ? 7 : days,
        options.onProgress
      );

    case "help":
    case "h":
    default:
      return {
        success: true,
        message: [
          "Backtest Commands:",
          "",
          "  :backtest run [days]    Run backtest (default: 7 days)",
          "  :backtest stats         Show cached data statistics",
          "  :backtest fetch [days]  Fetch historical data",
          "",
          "Examples:",
          "  :backtest run 14        Run backtest for last 14 days",
          "  :backtest fetch 30      Fetch 30 days of historical data",
        ].join("\n"),
      };
  }
}
