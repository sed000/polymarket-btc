# Risk Modes Comparison

This document explains the three trading modes available in the Polymarket BTC 15-minute trading bot.

## Quick Comparison

| Parameter | Normal | Super-Risk | Dynamic-Risk |
|-----------|--------|------------|--------------|
| Entry Threshold | User-defined (e.g. $0.95) | Fixed $0.70 | Adaptive $0.70–$0.85 |
| Max Entry Price | User-defined (e.g. $0.98) | $0.95 | $0.95 |
| Stop-Loss | User-defined (e.g. $0.80) | Fixed $0.40 | Entry-relative (32.5% drawdown) |
| Stop-Loss Delay | User-defined | 0ms (immediate) | 2000ms (confirmation) |
| Max Spread | User-defined | $0.05 | $0.05 |
| Profit Target | $0.99 | $0.98 | $0.98 |
| Time Window | User-defined | Full 15 min | Full 15 min |

---

## Normal Mode

**Philosophy:** Conservative, user-controlled parameters. Best for those who want full control over risk.

### Strategy
- Wait for high-confidence entries (e.g., price already at $0.95+)
- Tight stop-loss to protect capital
- Sell at $0.99 for maximum profit per trade
- Configurable confirmation delay to filter noise

### Parameters
```
entryThreshold:  User-defined (ENTRY_THRESHOLD env var)
maxEntryPrice:   User-defined (MAX_ENTRY_PRICE env var)
stopLoss:        User-defined (STOP_LOSS env var)
stopLossDelayMs: User-defined (STOP_LOSS_DELAY_MS env var)
maxSpread:       User-defined (MAX_SPREAD env var)
profitTarget:    $0.99 (fixed)
```

### When to Use
- You want predictable, controlled trading
- You prefer fewer trades with higher win rate
- You want to manually tune parameters based on market conditions

---

## Super-Risk Mode

**Philosophy:** Aggressive, high-frequency trading. Accepts more losses for more opportunities.

### Strategy
- Enter early at $0.70+ (when outcome is still uncertain)
- Immediate stop-loss execution (no delay) at $0.40
- Lower profit target ($0.98) to exit faster
- Wider spread tolerance for volatile conditions

### Parameters
```
entryThreshold:  $0.70 (fixed)
maxEntryPrice:   $0.95 (fixed)
stopLoss:        $0.40 (fixed)
stopLossDelayMs: 0ms (immediate execution)
maxSpread:       $0.05 (fixed)
profitTarget:    $0.98 (fixed)
timeWindow:      Full 15 minutes
```

### Risk Profile
- **Potential gain per trade:** ~$0.28 ($0.70 → $0.98)
- **Potential loss per trade:** ~$0.30 ($0.70 → $0.40)
- **Risk/Reward ratio:** ~1:1

### When to Use
- You want maximum trade frequency
- You're comfortable with higher volatility in results
- You believe early entries will win more than 50% of the time

---

## Dynamic-Risk Mode

**Philosophy:** Adaptive risk management. Learns from losses, protects during losing streaks.

### Strategy
- **Adaptive entry threshold:** Starts at $0.70, increases $0.05 per consecutive loss (caps at $0.85)
- **Entry-relative stop-loss:** 32.5% max drawdown from entry price (not a fixed level)
- **Whipsaw filter:** 2-second confirmation delay before executing stop-loss
- **Spread adjustment:** Wide spreads (>50% of max) require $0.03 higher entry

### Parameters
```
entryThreshold:     $0.70 base + ($0.05 × consecutiveLosses), max $0.85
maxEntryPrice:      $0.95 (fixed)
stopLoss:           entryPrice × 0.675 (32.5% below entry)
stopLossDelayMs:    2000ms (2 second confirmation)
maxSpread:          $0.05 (fixed)
profitTarget:       $0.98 (fixed)
timeWindow:         Full 15 minutes
maxDrawdownPercent: 32.5%
```

### Dynamic Entry Threshold

| Consecutive Losses | Entry Threshold |
|--------------------|-----------------|
| 0 | $0.70 |
| 1 | $0.75 |
| 2 | $0.80 |
| 3+ | $0.85 (capped) |

When a trade wins, the threshold resets to $0.70.

### Dynamic Stop-Loss Examples

| Entry Price | Stop-Loss (32.5% below) |
|-------------|-------------------------|
| $0.70 | $0.4725 |
| $0.75 | $0.5063 |
| $0.80 | $0.54 |
| $0.85 | $0.5738 |

### Why 2-Second Stop-Loss Delay?

The delay filters **whipsaws**—brief price dips that quickly recover:

1. Price drops below stop-loss → timer starts
2. If price **stays below** for 2 seconds → stop-loss executes
3. If price **recovers** within 2 seconds → stop-loss cancelled

This prevents getting stopped out on temporary volatility spikes that would have recovered, improving overall win rate at the cost of slightly larger losses when stops are legitimately hit.

### Spread-Based Threshold Adjustment

When spread exceeds 50% of max ($0.025):
- Entry threshold increases by $0.03
- Provides extra safety margin in low-liquidity conditions

Example: If base threshold is $0.75 and spread is $0.03 (>$0.025), effective threshold becomes $0.78.

### When to Use
- You want the bot to self-adjust during losing streaks
- You prefer position-relative risk management
- You want protection against whipsaw stop-outs

---

## Mode Selection Guide

```
┌─────────────────────────────────────────────────────────┐
│                    WHICH MODE?                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Want full control over parameters?                     │
│  └─→ NORMAL MODE                                        │
│                                                         │
│  Want maximum trade frequency, accept volatility?       │
│  └─→ SUPER-RISK MODE                                    │
│                                                         │
│  Want adaptive risk that learns from losses?            │
│  └─→ DYNAMIC-RISK MODE                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Configuration

Set the risk mode via environment variable:

```bash
# .env
RISK_MODE=normal        # Conservative, user-defined params
RISK_MODE=super-risk    # Aggressive, fixed params
RISK_MODE=dynamic-risk  # Adaptive, self-adjusting
```

Each mode uses a separate database for tracking:
- `trades_paper_normal.db` - Normal mode paper trades
- `trades_paper_risk.db` - Super-risk mode paper trades
- `trades_paper_dynamic.db` - Dynamic-risk mode paper trades
- `trades_real.db` - Real trading (all modes)
