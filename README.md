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

### Database
- `bun run db:paper` - View paper trading results
- `bun run db:risk` - View risk mode results
- `bun run db:real` - View real trading results
- `bun run db:stats:*` - View statistics for each mode

### Backtesting
- `bun run backtest:run` - Run backtest
- `bun run backtest:optimize` - Optimize parameters
- `bun run backtest:stats` - View backtest statistics

## Configuration

Set up your environment variables for Polymarket API access before running in real mode.
