# InvestorIQ — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-06-22  
**Author:** Product & Engineering  
**Status:** Approved  

---

## 1. Product Vision

**InvestorIQ** transforms retail investing by giving ordinary investors access to institutional-grade AI analysis through an intuitive, educational interface. The platform functions as an AI-powered investment co-pilot that helps users make better decisions while remaining transparent about risks, reasoning, and limitations.

### 1.1 Mission Statement

Democratize sophisticated investment analysis by combining multi-agent AI, quantitative methods, and real-time market intelligence into a platform that educates while it advises.

### 1.2 Success Metrics (North Stars)

| Metric | 6-Month Target | 12-Month Target | 24-Month Target |
|--------|---------------|-----------------|-----------------|
| Monthly Active Users (MAU) | 10,000 | 50,000 | 200,000 |
| Paid Conversion Rate | 5% | 8% | 12% |
| User Retention (30-day) | 40% | 55% | 65% |
| NPS Score | 40+ | 50+ | 60+ |
| AI Query Satisfaction | 70% | 80% | 85% |
| Platform Uptime | 99.5% | 99.9% | 99.95% |

---

## 2. Target Users & Personas

### 2.1 Persona: Alex the Beginner

- **Age:** 25–35
- **Experience:** < 2 years investing
- **Portfolio:** $5K–50K
- **Behavior:** Invests via mobile, reads Reddit/Twitter, wants simple guidance
- **Pain Points:** Overwhelmed by jargon, scared of losing money, doesn't understand risk
- **Needs:** Plain-language explanations, guided portfolio building, safety guardrails, educational content
- **Success:** Feels confident making informed decisions; understands *why* something is recommended

### 2.2 Persona: Sarah the Intermediate

- **Age:** 30–50
- **Experience:** 3–10 years investing
- **Portfolio:** $50K–500K
- **Behavior:** Uses screeners, reads earnings reports, manages multiple accounts
- **Pain Points:** Too many tools, can't synthesize information efficiently, misses opportunities
- **Needs:** Advanced screening, scenario analysis, automated watchlists, technical + fundamental combined
- **Success:** Finds opportunities faster; makes data-driven decisions with confidence

### 2.3 Persona: Marcus the Advanced

- **Age:** 35–60
- **Experience:** 10+ years, may have finance background
- **Portfolio:** $500K–5M+
- **Behavior:** Builds models, backtests strategies, uses APIs, reads SEC filings
- **Pain Points:** Existing platforms lack AI depth, backtesting is cumbersome, no unified view
- **Needs:** Quantitative analytics, factor models, API access, custom strategies, alternative data
- **Success:** Generates alpha; automates analysis workflows; stress-tests portfolios rigorously

---

## 3. Feature Decomposition

### 3.1 Feature Priority Matrix

| Priority | Feature | Persona Target | Complexity | Business Value |
|----------|---------|---------------|------------|----------------|
| P0 (MVP) | AI Chat (Natural Language Investing) | All | High | Critical |
| P0 (MVP) | Stock Dashboard & Quotes | All | Medium | Critical |
| P0 (MVP) | Basic Portfolio Tracking | All | Medium | Critical |
| P0 (MVP) | Stock Screener (Fundamental) | Sarah, Marcus | Medium | High |
| P0 (MVP) | User Auth & Profiles | All | Low | Critical |
| P1 | AI Investment Thesis Generator | Sarah, Marcus | High | High |
| P1 | Technical Analysis Charts | Sarah, Marcus | Medium | High |
| P1 | Alert System (Price + Events) | All | Medium | High |
| P1 | News Intelligence Feed | All | Medium | High |
| P1 | Portfolio Risk Analysis | Sarah, Marcus | High | High |
| P2 | Backtesting Engine | Marcus | Very High | Medium |
| P2 | Advanced Screener (Technical + Quant) | Marcus | High | Medium |
| P2 | Macro Economics Dashboard | Sarah, Marcus | Medium | Medium |
| P2 | Personalization Engine | All | High | High |
| P2 | Educational Learning Paths | Alex | Medium | Medium |
| P3 | Brokerage Integration | All | Very High | High |
| P3 | API Access (Developer) | Marcus | High | Medium |
| P3 | Social/Community Features | All | Medium | Low |
| P3 | Mobile Native App | All | Very High | High |

---


## 4. Detailed Feature Requirements

### 4.1 AI Chat — Natural Language Investing (P0)

**Description:** Conversational AI interface allowing users to ask investment questions in natural language and receive comprehensive, sourced, explainable answers.

**User Stories:**

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-001 | As a user, I want to ask investment questions in plain English | AI responds within 5s; response is relevant and sourced |
| US-002 | As a user, I want to see the AI's reasoning and confidence level | Every response shows evidence, confidence %, sources |
| US-003 | As a beginner, I want complex concepts explained simply | AI detects user level and adapts language accordingly |
| US-004 | As a user, I want to compare multiple stocks conversationally | AI generates side-by-side comparison with pros/cons |
| US-005 | As a user, I want follow-up questions to maintain context | 10-message context window; references prior answers |
| US-006 | As a user, I want to see alternative viewpoints (bull/bear) | Every thesis includes bull case, bear case, and base case |

**Functional Requirements:**
- Streaming token delivery (typewriter effect)
- Multi-agent routing (investment, technical, macro questions)
- Response includes: answer, confidence score (0–100), sources, caveats
- Context-aware follow-ups (conversation memory)
- Suggested follow-up questions
- Copy, share, and save responses
- Feedback mechanism (thumbs up/down + optional comment)

**Non-Functional Requirements:**
- First token latency: < 2 seconds
- Full response: < 15 seconds (median)
- Concurrent AI queries: 500+ simultaneous
- Availability: 99.9%

---

### 4.2 Stock Dashboard & Quotes (P0)

**Description:** Real-time stock information display with price data, key metrics, charts, and quick AI summary.

**User Stories:**

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-010 | As a user, I want to search for any stock by ticker or name | Autocomplete with < 200ms latency; covers 50K+ symbols |
| US-011 | As a user, I want to see real-time price and change | Price updates within 1s (paid) / 15s (free) |
| US-012 | As a user, I want key financial metrics at a glance | P/E, EPS, Market Cap, Div Yield, 52W range visible |
| US-013 | As a user, I want interactive price charts | Candlestick, line, area; 1D to Max timeframes; zoom/pan |
| US-014 | As a user, I want a quick AI summary for any stock | 3-sentence AI-generated summary with sentiment score |

**Functional Requirements:**
- Symbol search with fuzzy matching and recent history
- Real-time WebSocket price feed (15s delay for free tier)
- Interactive TradingView-style charts (lightweight-charts library)
- Key metrics panel: P/E, PEG, EV/EBITDA, Revenue Growth, EPS, ROE, Debt/Equity, FCF
- Company profile: sector, industry, description, executives, peers
- Analyst consensus (if available from data provider)
- Related news feed (5 most recent)
- Quick AI Summary button (generates 3-sentence overview)

---

### 4.3 Portfolio Tracking (P0)

**Description:** Track one or more investment portfolios with performance metrics, allocation visualization, and gain/loss tracking.

**User Stories:**

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-020 | As a user, I want to create multiple portfolios | Create/edit/delete portfolios; up to 10 per free user |
| US-021 | As a user, I want to add holdings manually | Add ticker, quantity, cost basis, date |
| US-022 | As a user, I want to import holdings via CSV | Parse CSV with validation; handle common formats |
| US-023 | As a user, I want to see total portfolio value and P&L | Real-time total value, daily/total gain ($ and %) |
| US-024 | As a user, I want asset allocation visualization | Pie/donut chart by sector, geography, asset type |
| US-025 | As a user, I want historical performance chart | Portfolio value over time vs. benchmark (S&P 500) |
| US-026 | As a user, I want dividend tracking | Upcoming dividends, dividend income history, yield |

**Functional Requirements:**
- CRUD operations on portfolios and holdings
- CSV import with column mapping UI
- Real-time portfolio value calculation
- Performance: total return, annualized, daily/weekly/monthly/YTD
- Asset allocation: by sector, geography, market cap, asset type
- Benchmark comparison (customizable: SPY, QQQ, VTI, custom)
- Dividend calendar and income tracking
- Tax lot tracking (FIFO, LIFO, specific identification)
- Export to CSV/PDF

---

### 4.4 Stock Screener (P0)

**Description:** Filter and rank stocks across fundamental, technical, and quantitative criteria with saveable and schedulable scans.

**User Stories:**

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-030 | As a user, I want to filter stocks by financial metrics | At least 30 fundamental filters available |
| US-031 | As a user, I want preset screener templates | 10+ built-in templates (Value, Growth, Dividend, etc.) |
| US-032 | As a user, I want to save custom screens | Save, name, and re-run custom filter combinations |
| US-033 | As a user, I want to sort and rank results | Sort by any column; AI-generated quality score |
| US-034 | As a user, I want export and alert on screen results | Export CSV; alert when new stocks match criteria |

**Filter Categories:**

*Fundamental (30+ filters):*
- Valuation: P/E, Forward P/E, PEG, P/B, P/S, EV/EBITDA, EV/Revenue
- Growth: Revenue Growth (1Y, 3Y, 5Y), EPS Growth, FCF Growth
- Profitability: ROE, ROIC, ROA, Gross Margin, Net Margin, Operating Margin
- Financial Health: Debt/Equity, Current Ratio, Interest Coverage, Altman Z-Score
- Dividends: Yield, Payout Ratio, Growth Rate, Years of Consecutive Increase
- Size: Market Cap, Enterprise Value, Revenue

*Technical (15+ filters):*
- RSI (14), MACD Signal, Above/Below MA (50, 100, 200)
- 52-Week High/Low proximity, Volume vs. Average, ATR
- Breakout detection, Golden/Death cross

*Quantitative (10+ filters):*
- Sharpe Ratio, Sortino Ratio, Beta, Alpha
- Maximum Drawdown, Volatility, Momentum Score

---

### 4.5 User Authentication & Profiles (P0)

**User Stories:**

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-040 | As a user, I want to sign up with email or social login | Email/password, Google, Apple sign-in |
| US-041 | As a user, I want MFA for account security | TOTP and WebAuthn support |
| US-042 | As a user, I want to set my investment profile | Wizard: risk tolerance, goals, experience, preferences |
| US-043 | As a user, I want personalized experience based on profile | UI adapts complexity; AI adapts language level |

---


### 4.6 AI Investment Thesis Generator (P1)

**Description:** Generate comprehensive investment analysis for any stock, including valuation, growth drivers, risks, competitive position, and scenario outcomes.

**Output Structure:**
1. Executive Summary (3 sentences)
2. Company Overview & Business Model
3. Growth Drivers (3–5 catalysts)
4. Risk Factors (3–5 risks with probability estimates)
5. Competitive Position (moat assessment: none/narrow/wide)
6. Valuation Analysis (DCF, comparables, historical multiples)
7. Scenario Analysis:
   - Bull Case (probability, target price, key assumptions)
   - Base Case (probability, target price, key assumptions)
   - Bear Case (probability, target price, key assumptions)
8. Confidence Score (0–100) with explanation
9. Sources & Data Freshness

---

### 4.7 Technical Analysis Charts (P1)

**Indicators Supported:**
- Trend: SMA (20/50/100/200), EMA (12/26/50), VWAP, Ichimoku Cloud
- Momentum: RSI (14), MACD (12,26,9), Stochastic, CCI, Williams %R
- Volatility: Bollinger Bands (20,2), ATR (14), Keltner Channels
- Volume: OBV, VWAP, Volume Profile, A/D Line
- Fibonacci: Retracement, Extension, Fan
- Pattern Detection: Head & Shoulders, Double Top/Bottom, Triangles, Flags, Wedges

**AI Technical Summary:** Auto-generated technical outlook including trend direction, key levels, and signal confluence.

---

### 4.8 Alert System (P1)

**Alert Types:**
| Type | Description | Example |
|------|-------------|---------|
| Price | Target price reached | AAPL crosses $200 |
| % Change | Daily/weekly % threshold | TSLA drops > 5% in a day |
| Technical Signal | Indicator triggers | RSI crosses below 30 |
| Earnings | Upcoming earnings | MSFT reports in 3 days |
| News Sentiment | Sentiment shift | NVDA sentiment turns negative |
| Portfolio | Portfolio threshold | Total portfolio down > 3% |
| Insider | Insider transaction | CEO sells > $1M |
| Analyst | Rating change | Upgrade/downgrade detected |

**Delivery Channels:** In-app (real-time), Email (batch/immediate), Push notification (PWA)

**Alert Management:** Create, edit, pause, delete, snooze, cooldown period, max alerts/day

---

### 4.9 News Intelligence Feed (P1)

**Capabilities:**
- Real-time news aggregation from multiple sources
- AI-powered summarization (1-sentence and 3-sentence modes)
- Sentiment scoring per article (-1.0 to +1.0)
- Entity extraction (stocks mentioned, people, events)
- Impact estimation (low/medium/high/critical)
- Contradiction detection across sources
- Personalized feed based on watchlist and portfolio

---

### 4.10 Portfolio Risk Analysis (P1)

**Metrics Computed:**
- Portfolio Beta, Sharpe Ratio, Sortino Ratio
- Value at Risk (VaR): 95% and 99% confidence
- Maximum Drawdown (historical and simulated)
- Concentration risk (single stock, sector, geography)
- Correlation matrix (portfolio holdings)
- Stress testing (recession, rate hike, sector crash scenarios)
- Diversification score (0–100)

**Visualization:**
- Risk/return scatter plot
- Correlation heatmap
- Drawdown chart
- Monte Carlo fan chart (probability cones)
- Efficient frontier with current portfolio position

---

### 4.11 Backtesting Engine (P2)

**Strategy Builder:**
- Visual drag-and-drop condition builder (no code required)
- Entry conditions, exit conditions, position sizing rules
- Supported: technical indicators, fundamental filters, time-based rules
- Multi-asset strategies supported

**Backtest Configuration:**
- Date range: any period with available data (max 30 years)
- Initial capital, commission model, slippage model
- Reinvestment rules (dividends, partial)
- Benchmark comparison

**Output Metrics:**
- CAGR, Total Return, Sharpe, Sortino, Calmar
- Max Drawdown, Average Drawdown, Recovery Time
- Win Rate, Profit Factor, Average Win/Loss
- Monthly/yearly return heatmap
- Trade log with entry/exit reasoning

**Advanced:**
- Walk-forward optimization
- Out-of-sample validation
- Parameter sensitivity analysis
- Monte Carlo simulation on equity curve

---

### 4.12 Macro Economics Dashboard (P2)

**Data Points:**
- US: Fed Funds Rate, CPI, PPI, PCE, Unemployment, GDP, ISM PMI
- Global: ECB rates, BOJ rates, BOE rates, China PMI
- Commodities: Oil (WTI/Brent), Gold, Copper, Natural Gas
- Fixed Income: US 10Y, 2Y-10Y spread, HY spread
- Currencies: DXY, EUR/USD, USD/JPY, GBP/USD

**AI Analysis:**
- Current regime classification (expansion/slowdown/contraction/recovery)
- Sector rotation implications
- Historical analogy matching ("current conditions most resemble Q3 2018")
- Forward indicators summary

---

## 5. MVP Definition

### 5.1 MVP Scope (12-Week Build)

**Included (P0 features):**
1. User authentication (email + Google OAuth)
2. Investment profile wizard
3. AI Chat with multi-agent responses
4. Stock dashboard with real-time quotes
5. Interactive price charts (basic indicators: SMA, RSI, MACD)
6. Stock screener (fundamental filters, 10 presets)
7. Portfolio tracking (manual entry + CSV import)
8. Portfolio performance vs. benchmark
9. Basic alert system (price alerts, email delivery)
10. News feed with AI summaries
11. Mobile-responsive PWA
12. Dark/light mode

**Excluded from MVP:**
- Brokerage integration
- Backtesting engine
- API access
- Advanced quant features (factor models, Monte Carlo)
- Native mobile apps
- Social features
- Macro dashboard (simplified version only)

### 5.2 MVP Success Criteria

| Criteria | Target |
|----------|--------|
| User sign-ups (first 30 days) | 1,000+ |
| Daily Active Users (DAU) | 200+ |
| AI queries/day | 2,000+ |
| AI satisfaction rating | > 70% positive |
| Page load time (P95) | < 3 seconds |
| Zero critical security vulnerabilities | Pass |
| Uptime | > 99.5% |

---

## 6. Monetization Model

### 6.1 Tier Structure

| Feature | Free | Pro ($19/mo) | Premium ($49/mo) |
|---------|------|-------------|-----------------|
| AI queries/day | 10 | 100 | Unlimited |
| Real-time data | 15-min delay | Real-time | Real-time |
| Portfolios | 2 | 10 | Unlimited |
| Screener filters | Basic (15) | All (55+) | All + custom |
| Alerts | 5 | 50 | Unlimited |
| Backtesting | — | Basic (5Y) | Full (30Y) + walk-forward |
| API access | — | — | Full REST + WebSocket |
| AI Thesis depth | Summary only | Full thesis | Full + scenarios |
| Export | — | CSV | CSV + PDF reports |
| Support | Community | Email (24h) | Priority (4h) |

### 6.2 Revenue Projections

| Month | Users | Paid (8%) | MRR | ARR |
|-------|-------|-----------|-----|-----|
| 6 | 10,000 | 800 | $22,400 | $269K |
| 12 | 50,000 | 4,000 | $112,000 | $1.34M |
| 24 | 200,000 | 24,000 | $672,000 | $8.06M |

---

## 7. Compliance & Legal Requirements

### 7.1 Mandatory Disclaimers

Every AI output must include:
> "This analysis is for educational and informational purposes only. It does not constitute financial advice. Past performance does not guarantee future results. Always conduct your own research and consult a qualified financial advisor."

### 7.2 Regulatory Considerations

- **Not a registered investment advisor** — platform provides tools and analysis, not personalized advice
- **Data attribution** — all market data properly attributed per provider licenses
- **GDPR compliance** — EU users have full data rights (access, portability, erasure)
- **CCPA compliance** — California consumer privacy rights
- **SOC 2 Type II** — target within 18 months of launch
- **No order execution** — platform does not execute trades (information only)

### 7.3 Risk Disclosures

- Prominent risk warnings on all AI-generated content
- User must acknowledge risk disclosure during onboarding
- Clear labeling: "AI Analysis" vs. "Market Data" vs. "User Input"
- No guarantees of accuracy; confidence scores are estimates
- Historical performance clearly labeled as historical

---

## 8. User Experience Requirements

### 8.1 Design Principles

1. **Clarity over density** — progressive disclosure; show less by default, more on demand
2. **Education embedded** — every metric has a tooltip explaining what it means and why it matters
3. **Transparent AI** — always show why the AI reached its conclusion
4. **Actionable insights** — every analysis ends with "what you could do next"
5. **Fail gracefully** — if data is unavailable, say so clearly; never show stale data without labeling

### 8.2 Responsive Breakpoints

| Breakpoint | Target | Layout |
|------------|--------|--------|
| < 640px | Mobile phone | Single column, bottom nav |
| 640–1024px | Tablet | Two columns, collapsible sidebar |
| 1024–1440px | Laptop | Full layout, sidebar + main |
| > 1440px | Desktop/Monitor | Full layout with additional panels |

### 8.3 Accessibility Requirements (WCAG 2.1 AA)

- All interactive elements keyboard-accessible
- Color contrast ratio ≥ 4.5:1 (text), ≥ 3:1 (large text/graphics)
- Screen reader compatible (ARIA labels on all dynamic content)
- Charts have data table alternatives
- Reduced motion option for animations
- Focus indicators on all interactive elements
- Alt text on all images

---

## 9. Data Requirements

### 9.1 Market Data Freshness

| Data Type | Free Tier | Pro Tier | Premium Tier |
|-----------|-----------|----------|-------------|
| Stock quotes | 15-min delay | Real-time | Real-time |
| Options data | EOD | 15-min | Real-time |
| News | 30-min delay | Real-time | Real-time |
| Fundamentals | Quarterly update | Quarterly | Quarterly |
| Analyst estimates | Weekly | Daily | Daily |

### 9.2 Coverage Requirements (MVP)

- US equities: NYSE, NASDAQ, AMEX (8,000+ symbols)
- ETFs: All US-listed ETFs (3,000+)
- Major indices: S&P 500, NASDAQ 100, DJIA, Russell 2000
- Crypto: Top 20 by market cap
- Forex: Major pairs (10)

### 9.3 Post-MVP Coverage Expansion

- European equities (London, Frankfurt, Paris, Amsterdam, Nordic)
- ADRs and international listings
- Mutual funds
- REITs (detailed)
- Commodities (futures)
- Fixed income (government bonds)

---

## 10. Integration Requirements

### 10.1 MVP Integrations

| Integration | Purpose | Priority |
|-------------|---------|----------|
| Polygon.io | Primary market data (real-time + historical) | P0 |
| Alpha Vantage | Fallback data + fundamentals | P0 |
| Finnhub | News + sentiment + insider trades | P0 |
| FRED (St. Louis Fed) | Macro economic data | P1 |
| OpenAI API | Primary LLM provider | P0 |
| Anthropic API | Secondary LLM provider | P0 |
| SendGrid | Transactional email | P0 |
| Auth0 | Authentication provider | P0 |

### 10.2 Post-MVP Integrations

| Integration | Purpose | Priority |
|-------------|---------|----------|
| Plaid | Brokerage account linking | P3 |
| SEC EDGAR | Filings (10-K, 10-Q, 8-K) | P2 |
| Financial Modeling Prep | Extended fundamentals | P2 |
| Twelve Data | Technical indicators API | P2 |
| Web push (FCM) | Push notifications | P2 |
| Stripe | Payment processing | P1 |

---

## 11. Post-MVP Roadmap

### Phase 2 (Months 4–6): Intelligence Layer
- Full AI Investment Thesis Generator
- Advanced technical analysis (all indicators + AI pattern detection)
- Portfolio risk analysis (VaR, Monte Carlo, stress tests)
- Macro economics dashboard
- Enhanced alerts (technical signals, sentiment, portfolio thresholds)

### Phase 3 (Months 7–9): Power Features
- Backtesting engine (visual builder + Python API)
- Advanced screener (quantitative + custom formulas)
- Factor model rankings
- Educational learning paths
- Personalization engine (adaptive UI + recommendations)

### Phase 4 (Months 10–12): Scale & Monetize
- Brokerage integration (Plaid)
- API access for developers
- Premium PDF report generation
- Multi-currency support
- European market coverage
- Native mobile app (React Native)

### Phase 5 (Year 2): Platform
- Social features (idea sharing, strategy marketplace)
- Advisor tools (for RIAs managing client portfolios)
- Institutional API tier
- Alternative data integrations
- Multi-language support (10 languages)

---

*End of Product Requirements Document*
