/**
 * CLI Command Parser
 * Parses command strings into structured command objects
 */

export type CommandType =
  | "set"
  | "show"
  | "backtest"
  | "help"
  | "quit";

export interface ParsedCommand {
  type: CommandType;
  subcommand?: string;
  args: string[];
  raw: string;
}

export interface ParseError {
  error: true;
  message: string;
}

export type ParseResult = ParsedCommand | ParseError;

/**
 * Parse a command string into a structured command object
 * Command format: :<command> [subcommand] [args...]
 */
export function parseCommand(input: string): ParseResult {
  // Remove leading colon if present
  const trimmed = input.trim();
  const withoutColon = trimmed.startsWith(":") ? trimmed.slice(1) : trimmed;

  if (!withoutColon) {
    return { error: true, message: "Empty command" };
  }

  const parts = withoutColon.split(/\s+/);
  const command = parts[0].toLowerCase();
  const rest = parts.slice(1);

  switch (command) {
    case "set":
      if (rest.length < 2) {
        return { error: true, message: "Usage: :set <option> <value>" };
      }
      return {
        type: "set",
        subcommand: rest[0].toLowerCase(),
        args: rest.slice(1),
        raw: input,
      };

    case "show":
      if (rest.length < 1) {
        return { error: true, message: "Usage: :show <config|stats>" };
      }
      return {
        type: "show",
        subcommand: rest[0].toLowerCase(),
        args: rest.slice(1),
        raw: input,
      };

    case "backtest":
      return {
        type: "backtest",
        subcommand: rest[0]?.toLowerCase() || "help",
        args: rest.slice(1),
        raw: input,
      };

    case "help":
    case "h":
    case "?":
      return {
        type: "help",
        args: rest,
        raw: input,
      };

    case "quit":
    case "q":
    case "exit":
      return {
        type: "quit",
        args: [],
        raw: input,
      };

    default:
      return { error: true, message: `Unknown command: ${command}` };
  }
}

/**
 * Check if a parse result is an error
 */
export function isParseError(result: ParseResult): result is ParseError {
  return "error" in result && result.error === true;
}

/**
 * Get command suggestions based on partial input
 */
export function getSuggestions(partial: string): string[] {
  const commands = [
    "set risk",
    "set entry",
    "set stop",
    "set balance",
    "set maxentry",
    "set spread",
    "set compound",
    "set positions",
    "show config",
    "show stats",
    "backtest run",
    "backtest stats",
    "backtest fetch",
    "help",
    "quit",
  ];

  const normalized = partial.toLowerCase().replace(/^:/, "");
  if (!normalized) return commands.slice(0, 5);

  return commands.filter((cmd) => cmd.startsWith(normalized));
}
