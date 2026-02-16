# Polymarket Trading Bot

Automated trading bot for Polymarket prediction markets with paper trading, backtesting, and live trading support.

**What It Does**
- Scans markets and places trades based on your config
- Supports `normal` and `ladder` modes
- Supports BTC `5m` and `15m` market families (configurable)
- Paper trading and real trading
- Backtesting and parameter optimization
- Stores trades and logs in SQLite

**Quick Start**
1. `bun install`
2. `bun dev`
3. Edit `trading.config.json` to tune thresholds, mode, and paper balance

**How To Use The Bot**
- Run in paper mode first (default) and watch the terminal UI
- Change `trading.paperTrading` to `false` for real trading
- Adjust `activeMode` and the values under `modes` to control entries/exits
- Config reloads automatically while the bot is running

**Configuration**
- The bot uses `trading.config.json` (auto-created if missing)
- Common settings:
- `trading.paperTrading`, `trading.paperBalance`, `trading.maxPositions`
- `market.timeframe` (`5m` or `15m`) for live trading market selection
- `activeMode` and `modes.normal` or `modes.ladder`
- `backtest` settings for historical runs (`backtest.mode` supports `normal` or `ladder`)
- `backtest.marketTimeframe` (`5m` or `15m`) as the default backtest market timeframe

**Environment Variables (Real Trading)**
- `PRIVATE_KEY` is required when `trading.paperTrading` is `false`
- Optional: `POLY_API_KEY`, `POLY_API_SECRET`, `POLY_API_PASSPHRASE` (auto-derived if not set)

**Commands**
- `bun start` run the bot
- `bun dev` run with auto-reload
- `bun run backtest:run` run a backtest
- `bun run backtest:run --market 5m` run a 5m backtest (CLI override)
- `bun run backtest:run --mode ladder` run a ladder-mode backtest
- `bun run backtest:optimize` optimize parameters
- `bun run db:paper` recent paper trades
- `bun run db:real` recent real trades
- `bun run db:paper:5m` recent paper trades from `trades_5m`
- `bun run db:real:5m` recent real trades from `trades_5m`
- `bun run db:stats:paper` paper trading stats
- `bun run db:stats:real` real trading stats
- `bun run db:stats:paper:5m` paper trading stats from `trades_5m`
- `bun run db:stats:real:5m` real trading stats from `trades_5m`

**Storage split by timeframe**
- Live DBs keep legacy 15m tables: `trades`, `activity_logs`, `ladder_market_locks`
- Live DBs store 5m data in: `trades_5m`, `activity_logs_5m`, `ladder_market_locks_5m`
- `backtest.db` keeps legacy 15m tables and stores 5m data in suffixed tables:
`price_history_5m`, `historical_markets_5m`, `backtest_runs_5m`, `backtest_trades_5m`
