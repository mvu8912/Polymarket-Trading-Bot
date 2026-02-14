# Polymarket Multi-Strategy Trading Platform

A modular, wallet-isolated trading system for Polymarket that supports multiple strategies running concurrently in LIVE or PAPER mode. Safety-first defaults keep PAPER trading on unless explicitly enabled.

## Features

- Strategy isolation per wallet (capital, risk, mode)
- Wallet-centric execution and order routing
- Concurrent scheduling and event-driven updates
- Risk engine with per-wallet limits and global kill switch
- Paper trading simulator with slippage + PnL tracking
- Pluggable strategy framework with six starter strategies
- CLI commands for operations and reporting

## Quick start

1. Install dependencies.
2. Configure wallets and strategies in `config.yaml`.
3. Start the bot using the CLI.

## CLI commands

- `bot start --config config.yaml`
- `bot stop`
- `bot status`
- `bot add-wallet --config config.yaml`
- `bot remove-wallet --id wallet_1 --config config.yaml`
- `bot list-strategies`
- `bot performance`
- `bot paper-report`

## Dashboard

The JSON dashboard is served at `http://localhost:3000/dashboard` by default when the bot is running.
Set `DASHBOARD_PORT` to override the port.

## Configuration

See `config.yaml` for an example layout. LIVE trading requires `ENABLE_LIVE_TRADING=true` in the environment.

## Safety notes

- Default mode is PAPER.
- LIVE wallets require explicit `ENABLE_LIVE_TRADING=true`.
- Secrets must be provided via environment variables only.
- Private keys are never logged.

## Project structure

The core modules live under `src/` and match the architecture described in the requirements. Each strategy implements the base interface and sends signals to the execution layer.

---

## Strategy: Filtered High-Probability Convergence

**File:** `src/strategies/convergence/filtered_high_prob_convergence.ts`

A rule-based, no-AI strategy that targets prediction markets where the leading outcome's probability is between 65–96% and market microstructure supports a favorable risk/return profile. It applies **7 cascading filters** before placing a single trade, then sizes conservatively via a composite **Setup Score**.

### Core Idea

Enter high-probability positions ONLY when:
1. Liquidity and depth are sufficient
2. The probability band avoids tiny-upside and low-conviction markets
3. Spreads are tight enough to trade profitably
4. The resolution horizon is short enough to recycle capital
5. No recent spike or elevated volatility (anti-chasing)
6. Orderbook flow/pressure supports the direction
7. Cluster/event exposure does not exceed caps

### Filter Pipeline

| # | Filter | Config Keys | Description |
|---|--------|------------|-------------|
| A | Liquidity | `min_liquidity_usd`, `min_depth_usd_within_1pct` | Minimum market liquidity + depth within 1% of mid |
| B | Probability Band | `min_prob`, `max_prob` | Leading outcome prob must be in [0.65, 0.96] |
| C | Spread | `max_spread_bps` | Bid-ask spread ≤ threshold (bps relative to mid) |
| D | Time-to-Resolution | `max_days_to_resolution` | Must have known endDate within max days |
| E | Anti-Chasing | `spike_pct`, `spike_lookback_minutes` | Rejects recent abnormal spikes + high volatility |
| F | Flow / Pressure | `min_imbalance`, `flow_lookback_minutes`, `min_net_buy_flow_usd` | Requires orderbook imbalance OR net buy flow |
| G | Cluster Exposure | `max_correlated_exposure_pct` | Caps exposure to correlated markets per event/series |

### Entry Logic

- **Passive limit orders** near best bid (+1 tick for queue priority)
- Does NOT cross the spread by default (post-only style)
- `allow_take_on_momentum: true` permits small taker fraction when flow is strong
- Unfilled orders cancelled after `ttl_seconds` and re-quoted

### Position Sizing

1. **Setup Score** [0–1] = 30% spread tightness + 25% depth + 25% order flow + 20% time-to-resolution
2. `position_usd = capital × base_risk_pct × setup_score`
3. Capped by `max_position_usd_per_market`
4. Per-market MLE ≤ `max_market_mle_pct` of capital
5. Total MLE ≤ `max_total_mle_pct` of capital
6. Max open positions: `max_total_open_positions`

### Exit Rules

| Rule | Trigger | Config Key |
|------|---------|-----------|
| Take Profit | Midprice rises by `take_profit_bps` | `take_profit_bps` (default 200) |
| Stop Loss | Midprice drops by `stop_loss_bps` | `stop_loss_bps` (default 150) |
| Time Exit | Position held > `time_exit_hours` | `time_exit_hours` (default 48) |
| Spread Widen | <1 day to resolution + spread > 2× max | `max_spread_bps` |

### Risk Controls

- Daily loss limit: `max_daily_loss_pct` (default 3%)
- Weekly drawdown: `max_weekly_drawdown_pct` (default 8%)
- Per-market MLE: `max_market_mle_pct` (default 5%)
- Total MLE: `max_total_mle_pct` (default 15%)
- Order rate: `max_orders_per_minute` (default 10)
- Cancel rate: `max_cancel_rate` (default 0.5)
- Global kill switch (external)
- 5-minute per-market cooldown

### Tuning Guide

| Goal | Adjust |
|------|--------|
| More trades | Widen `min_prob`–`max_prob`, increase `max_spread_bps`, lower `min_imbalance` |
| Fewer trades | Tighten probability band, lower `max_spread_bps` |
| Larger positions | Increase `base_risk_pct`, `max_position_usd_per_market` |
| Faster exits | Lower `time_exit_hours`, tighten `take_profit_bps` / `stop_loss_bps` |
| More conservative | Lower `max_market_mle_pct`, `max_total_mle_pct`, `max_daily_loss_pct` |

### Safety Defaults

- Strategy defaults to **PAPER** mode
- All 7 filters must pass — prefers "NO TRADE" when conditions aren't met
- Conservative sizing: 0.5% of capital × setup_score
- MLE capped at 5% per market, 15% total
- Daily loss halt at 3%, weekly at 8%
- No AI, no web research — all decisions explainable with market data + rules

### Sample Config

```yaml
# In config.yaml → strategy_config:
filtered_high_prob_convergence:
  enabled: true
  min_liquidity_usd: 10000
  min_prob: 0.65
  max_prob: 0.96
  max_spread_bps: 200
  max_days_to_resolution: 14
  base_risk_pct: 0.005
  take_profit_bps: 200
  stop_loss_bps: 150
  time_exit_hours: 48

# Wallet binding:
wallets:
  - id: wallet_convergence
    mode: PAPER
    strategy: filtered_high_prob_convergence
    capital: 2000
```

---

## Testing

Run unit tests with the configured test runner.

## Docker

A `Dockerfile` is provided for containerized deployment.

## Sample output

See `sample_logs.txt` for example logs from a simulated run.
