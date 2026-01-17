# Polymarket Trading Bot

Automated trading bot for Polymarket prediction markets with backtesting capabilities.

## Features

- Automated market scanning and trade execution
- Backtesting engine with historical data analysis
- Paper trading and risk simulation modes
- Real-time trade tracking with SQLite database
- WebSocket integration for live market data

## Setup

```bash
bun install
bun dev
```

## Commands

### Trading
- `bun start` - Run the bot
- `bun dev` - Run with auto-reload
- `bun run web` - Run the web UI (builds frontend if needed)
- `bun run web:build` - Build web assets only

### Database
- `bun run db:paper` - View paper trading results
- `bun run db:risk` - View risk mode results
- `bun run db:real` - View real trading results
- `bun run db:stats:*` - View statistics for each mode

### Backtesting
- `bun run backtest:run` - Run backtest
- `bun run backtest:optimize` - Optimize parameters
- `bun run backtest:stats` - View backtest statistics

## Web UI

Start the web console with:

```bash
bun run web
```

The server defaults to `http://localhost:5175`. You can override the port with:

```bash
WEB_PORT=8080 bun run web
```

The UI exposes live trading controls, backtesting workflows, and a strategy builder. Strategy application is limited to paper trading mode for safety.

## Configuration

Set up your environment variables for Polymarket API access before running in real mode.
