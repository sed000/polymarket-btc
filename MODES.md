# Risk Modes Comparison

This document explains the three trading modes and their differences.

---

## Quick Comparison

| Setting | Normal | Super-Risk | Dynamic-Risk |
|---------|--------|------------|--------------|
| Entry Threshold | $0.95 | $0.70 | $0.70 (adaptive) |
| Max Entry Price | $0.98 | $0.95 | $0.95 |
| Stop-Loss | Fixed $0.80 | Fixed $0.40 | 40% from entry |
| Stop-Loss Delay | 5 seconds | 0 (immediate) | 0 (immediate) |
| Profit Target | $0.99 | $0.98 | $0.98 |
| Max Spread | $0.03 | $0.05 | $0.05 |
| Time Window | 5 minutes | 15 minutes | 15 minutes |
| Uncertainty Exit | Yes | Yes | Yes |

---

## Normal Mode

**Philosophy:** Conservative, high-confidence trades only.

```
Entry:     $0.95 - $0.98 (very high confidence)
Stop-Loss: $0.80 (fixed price)
Delay:     5 seconds (filters whipsaws)
Target:    $0.99
```

**When to use:**
- You want safer trades
- You're OK with fewer opportunities
- You prefer waiting for high-probability setups

**Example trade:**
```
Enter UP at $0.96
Stop-loss at $0.80
Target at $0.99
Potential profit: $0.03/share
Potential loss: $0.16/share
Risk/Reward: 5.3:1 (bad ratio, but high win rate)
```

---

## Super-Risk Mode

**Philosophy:** Aggressive, take more trades with wider parameters.

```
Entry:     $0.70 - $0.95 (any reasonable signal)
Stop-Loss: $0.40 (fixed price, very wide)
Delay:     0 seconds (immediate execution)
Target:    $0.98
```

**When to use:**
- You want maximum opportunities
- You can handle larger drawdowns
- Markets are trending strongly

**Example trade:**
```
Enter UP at $0.75
Stop-loss at $0.40
Target at $0.98
Potential profit: $0.23/share
Potential loss: $0.35/share
Risk/Reward: 1.5:1
```

---

## Dynamic-Risk Mode

**Philosophy:** Adaptive strategy that adjusts based on performance.

```
Entry:     $0.70 - $0.85 (adapts to losses)
Stop-Loss: 40% drawdown from YOUR entry price
Delay:     0 seconds (immediate execution)
Target:    $0.98
```

**Key Features:**

### 1. Adaptive Entry Threshold
Your entry threshold increases after losses:

| Consecutive Losses | Entry Threshold |
|-------------------|-----------------|
| 0 | $0.70 |
| 1 | $0.75 |
| 2 | $0.80 |
| 3+ | $0.85 (max) |

After a win, it resets to $0.70.

### 2. Entry-Relative Stop-Loss
Stop-loss is calculated from YOUR entry price, not a fixed number:

```
Entry at $0.75 → Stop at $0.45 (75 × 0.60 = 45)
Entry at $0.80 → Stop at $0.48 (80 × 0.60 = 48)
Entry at $0.70 → Stop at $0.42 (70 × 0.60 = 42)
```

Formula: `stop_price = entry_price × (1 - 0.40)`

### 3. Uncertainty Exit
Exits early when market becomes 50-50:

```
You hold UP at $0.75
Market shifts: UP=$0.53, DOWN=$0.47
Both below $0.55 threshold → EXIT NOW at $0.53
```

This beats waiting for stop-loss at $0.45.

**When to use:**
- You want the bot to adapt to market conditions
- You've been having losing streaks
- You want protection against 50-50 markets

---

## Stop-Loss Comparison

### Fixed Stop-Loss (Normal & Super-Risk)
```
Stop-loss price is always the same regardless of entry.

Normal:     Always exits at $0.80
Super-Risk: Always exits at $0.40
```

### Dynamic Stop-Loss (Dynamic-Risk)
```
Stop-loss is relative to YOUR entry price.

Enter at $0.75 → Stop at $0.45 (40% loss)
Enter at $0.80 → Stop at $0.48 (40% loss)
Enter at $0.85 → Stop at $0.51 (40% loss)
```

**Why this matters:**

If you enter at $0.85 with a fixed $0.40 stop:
- You could lose 53% before stop triggers
- That's a huge loss!

With dynamic stop at 40%:
- Stop triggers at $0.51
- Maximum loss is always 40%

---

## Uncertainty Exit (All Modes)

When BOTH UP and DOWN prices fall below $0.55, the market is too close to call.

**Without uncertainty exit:**
```
Enter UP at $0.75
Market becomes 50-50 (UP=$0.52, DOWN=$0.48)
Wait... wait...
Stop-loss triggers at $0.45
Loss: $0.30/share
```

**With uncertainty exit:**
```
Enter UP at $0.75
Market becomes 50-50 (UP=$0.52, DOWN=$0.48)
Exit immediately at $0.52
Loss: $0.23/share (saved $0.07/share!)
```

**Configuration:**
```bash
UNCERTAINTY_THRESHOLD=0.55  # Both sides below this = uncertain
UNCERTAINTY_EXIT=true       # Enable/disable the feature
```

---

## Which Mode Should I Use?

| Situation | Recommended Mode |
|-----------|------------------|
| Starting out, want safety | Normal |
| Markets are trending strongly | Super-Risk |
| Having a losing streak | Dynamic-Risk |
| Want adaptive protection | Dynamic-Risk |
| Maximum opportunities | Super-Risk |
| Volatile/choppy markets | Dynamic-Risk |

---

## Environment Variables by Mode

### Normal Mode
```bash
RISK_MODE=normal
ENTRY_THRESHOLD=0.95
MAX_ENTRY_PRICE=0.98
STOP_LOSS=0.80
STOP_LOSS_DELAY_MS=5000
```

### Super-Risk Mode
```bash
RISK_MODE=super-risk
# Other settings are overridden automatically
```

### Dynamic-Risk Mode
```bash
RISK_MODE=dynamic-risk
UNCERTAINTY_THRESHOLD=0.55
UNCERTAINTY_EXIT=true
# Other settings are overridden automatically
```
