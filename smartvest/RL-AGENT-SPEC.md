# Reinforcement Learning Trading Agent — Technical Specification

## Overview

This document specifies a reinforcement learning (RL) trading agent that operates in **shadow portfolio mode only** (never touches real money). It is designed so that an ML engineer can implement it using the architecture described below.

**Status:** Specification complete. Frontend UI built. Backend not yet implemented.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Python Backend (FastAPI)                                │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  RL Agent    │    │  Market Env  │    │  Data     │ │
│  │  (PPO/SAC)   │◄──►│  (Gym)       │◄───│  Pipeline │ │
│  │  Stable-     │    │              │    │  (daily)  │ │
│  │  Baselines3  │    └──────────────┘    └───────────┘ │
│  └──────┬───────┘                                       │
│         │ Results                                        │
│         ▼                                               │
│  ┌──────────────┐                                       │
│  │  REST API    │──── GET /api/v1/rl-agent/results      │
│  │  (FastAPI)   │──── GET /api/v1/rl-agent/positions    │
│  │              │──── GET /api/v1/rl-agent/training      │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
         │
         │ HTTP
         ▼
┌─────────────────────────────────────────────────────────┐
│  Next.js Frontend                                        │
│  src/lib/shadow-portfolio.ts → src/app/shadow/page.tsx  │
└─────────────────────────────────────────────────────────┘
```

---

## 1. State Space (Observation)

The agent observes a 15-dimensional feature vector for each stock at each timestep:

| # | Feature | Source | Range |
|---|---------|--------|-------|
| 1 | 14-day price momentum | Price data | -50% to +50% |
| 2 | 30-day price momentum | Price data | -50% to +50% |
| 3 | 90-day price momentum | Price data | -100% to +200% |
| 4 | RSI-14 | Technical | 0-100 |
| 5 | MACD histogram | Technical | -10 to +10 |
| 6 | Volume ratio (vs 20d avg) | Volume data | 0-5 |
| 7 | Composite score | Signal engine | 0-100 |
| 8 | Signal direction | Signal engine | -1, 0, +1 |
| 9 | Sentiment score | NLP pipeline | -1 to +1 |
| 10 | Insider buying score | Insider monitor | 0-10 |
| 11 | Factor momentum beta | Factor model | -1 to +1 |
| 12 | Market regime | Regime classifier | 0-6 (encoded) |
| 13 | Alt data signal | Alt data pipeline | -1, 0, +1 |
| 14 | Bid-ask imbalance | Order book | 0-1 |
| 15 | Current position P&L | Portfolio | -100% to +500% |

**State shape:** `(num_stocks, 15)` — the agent sees all watchlist stocks simultaneously.

---

## 2. Action Space

**Discrete action space per stock:**

| Action | Description |
|--------|-------------|
| 0 | Hold (do nothing) |
| 1 | Buy 1% of portfolio |
| 2 | Buy 3% of portfolio |
| 3 | Buy 5% of portfolio |
| 4 | Buy 10% of portfolio |
| 5 | Sell 25% of position |
| 6 | Sell 50% of position |
| 7 | Sell 100% of position (close) |

**Total actions per step:** `8 × num_stocks`

**Constraints:**
- Maximum 10% of portfolio in any single stock
- Maximum 50% total deployment (conservative)
- No leverage (long only)
- No shorting (v1)

---

## 3. Reward Function

**Primary reward: Daily Sharpe Ratio (rolling 20-day window)**

```python
def calculate_reward(daily_returns, risk_free_rate=0.0001):
    if len(daily_returns) < 5:
        return 0

    excess_returns = daily_returns - risk_free_rate
    sharpe = np.mean(excess_returns) / (np.std(excess_returns) + 1e-8)

    # Penalties
    drawdown_penalty = max(0, -max_drawdown(daily_returns) - 0.05) * 2
    turnover_penalty = abs(position_change) * 0.001  # Penalize overtrading

    return sharpe - drawdown_penalty - turnover_penalty
```

**Why Sharpe, not raw return:**
- Raw return rewards reckless risk-taking
- Sharpe rewards consistent, risk-adjusted gains
- Drawdown penalty prevents catastrophic losses
- Turnover penalty discourages churning (transaction cost proxy)

---

## 4. Environment (OpenAI Gym)

```python
class TradingEnv(gym.Env):
    def __init__(self, data, initial_cash=100000):
        self.data = data  # DataFrame with OHLCV + features
        self.initial_cash = initial_cash
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(num_stocks, 15)
        )
        self.action_space = spaces.MultiDiscrete([8] * num_stocks)

    def step(self, action):
        # Execute trades
        # Calculate reward (Sharpe)
        # Return next observation
        pass

    def reset(self):
        # Reset to random start point in training data
        pass
```

---

## 5. Training Procedure

| Parameter | Value |
|-----------|-------|
| Algorithm | PPO (Proximal Policy Optimization) |
| Library | Stable-Baselines3 |
| Episodes | 50,000 |
| Episode length | 252 days (1 trading year) |
| Training data | Jun 2021 — Dec 2025 (5 years) |
| Validation data | Jan 2026 — Mar 2026 |
| Test data (never seen) | Apr 2026 — present |
| Learning rate | 3e-4 (with cosine decay) |
| Batch size | 256 |
| GAE lambda | 0.95 |
| Clip range | 0.2 |
| Entropy coefficient | 0.01 |
| Network | MLP [256, 128, 64] |

**Walk-forward validation:** Retrain monthly on expanding window.

---

## 6. Evaluation Metrics

| Metric | Target | Minimum Acceptable |
|--------|--------|--------------------|
| Sharpe Ratio | > 1.5 | > 1.0 |
| Max Drawdown | < -8% | < -15% |
| Win Rate | > 55% | > 50% |
| Profit Factor | > 1.5 | > 1.2 |
| Avg Holding Period | 5-20 days | Any |
| Turnover | < 3x/year | < 5x |

---

## 7. Safety Controls

- **Shadow only:** Agent NEVER connects to a real broker
- **Position limits:** Max 10% per stock, 50% total deployed
- **Kill switch:** Auto-pause if drawdown exceeds -15%
- **Human override:** Any position can be manually closed
- **Transparency:** Every trade shows the exact signals that triggered it
- **Performance gate:** Agent must beat OMXC25 Sharpe on 6-month test before any consideration of live capital

---

## 8. API Contract

```
GET /api/v1/rl-agent/results
→ ShadowPortfolioState (positions, performance, comparisons)

GET /api/v1/rl-agent/positions
→ AgentPosition[] (current open positions with trigger signals)

GET /api/v1/rl-agent/training
→ TrainingInfo (episodes, convergence, status)

POST /api/v1/rl-agent/pause
→ Pauses the agent (stops opening new positions)

POST /api/v1/rl-agent/resume
→ Resumes the agent
```

---

## 9. Implementation Roadmap

| Week | Deliverable |
|------|-------------|
| 1 | Data pipeline: fetch 5yr OHLCV + compute features |
| 2 | Gym environment + reward function |
| 3 | Initial PPO training + hyperparameter search |
| 4 | Walk-forward validation + performance evaluation |
| 5 | FastAPI backend + shadow portfolio tracking |
| 6 | Connect to frontend + daily inference cron |

**Estimated cost:**
- GPU training: ~$50 (4hrs on p3.2xlarge)
- Data feed: $50-200/month (Polygon or Alpha Vantage)
- Hosting: $20-50/month (small EC2 for inference)
- Total: ~$300-500 to launch, ~$100-250/month ongoing

---

## 10. What NOT to Do

- ❌ Do NOT connect to a real broker before 6 months of shadow testing
- ❌ Do NOT trust backtested returns (overfitting is the #1 killer)
- ❌ Do NOT train on test data (walk-forward only)
- ❌ Do NOT optimize for raw return (use Sharpe)
- ❌ Do NOT allow leverage or shorting in v1
- ❌ Do NOT deploy without a kill switch

---

*This specification was prepared June 2026. Implementation requires a Python ML engineer with RL experience (Stable-Baselines3, gym environments, financial data pipelines).*
