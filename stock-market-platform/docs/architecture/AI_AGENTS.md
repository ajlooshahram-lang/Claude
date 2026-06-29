# InvestorIQ — AI Agent Architecture

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Multi-Agent System Overview

InvestorIQ employs a **Router-Orchestrator-Specialist** pattern where specialized AI agents handle distinct analytical domains. The orchestrator coordinates agent execution, merges outputs, resolves conflicts, and applies explainability/compliance layers.

### 1.1 Architecture Diagram

```
                          User Query
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AI ORCHESTRATOR SERVICE                       │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. PREPROCESSOR                                           │   │
│  │    • Query normalization & entity extraction               │   │
│  │    • Symbol resolution (fuzzy match → canonical ticker)    │   │
│  │    • Conversation context injection                        │   │
│  │    • User profile enrichment (expertise, holdings)         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │ 2. INTENT CLASSIFIER & ROUTER                             │   │
│  │    • Classifies query into 1–4 intents                    │   │
│  │    • Maps intents → agent selection                       │   │
│  │    • Determines execution strategy (parallel/sequential)  │   │
│  │    • Allocates token budget per agent                     │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│         ┌────────────────────┼────────────────────┐              │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ AGENT POOL  │     │ AGENT POOL  │     │ AGENT POOL  │       │
│  │ (selected)  │     │ (selected)  │     │ (selected)  │       │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘       │
│         │                    │                    │              │
│         └────────────────────┼────────────────────┘              │
│                              │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │ 3. RESPONSE MERGER                                        │   │
│  │    • Deduplicate overlapping insights                     │   │
│  │    • Resolve contradictions (present both sides)          │   │
│  │    • Weight by confidence & relevance                     │   │
│  │    • Synthesize coherent narrative                        │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │ 4. EXPLAINABILITY & COMPLIANCE                            │   │
│  │    • Attach confidence score (weighted avg)               │   │
│  │    • Cite sources with timestamps                         │   │
│  │    • Generate "Why?" explanation                          │   │
│  │    • Append risk disclaimer                               │   │
│  │    • Verify no explicit buy/sell recommendations          │   │
│  │    • Suggest follow-up questions                          │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│                    Streamed Response (SSE)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Specifications

### 2.1 Investment Analyst Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.investment_analyst` |
| **Purpose** | Fundamental analysis, valuation, business model assessment |
| **LLM** | GPT-4o (primary), Claude 3.5 Sonnet (fallback) |
| **Temperature** | 0.3 (factual, conservative) |
| **Max Tokens** | 2000 |
| **Triggered By** | Intents: VALUATION, FUNDAMENTAL, EARNINGS, COMPARISON, THESIS |

**System Prompt (abbreviated):**
```
You are a senior equity research analyst at a top investment bank. 
Analyze companies using rigorous fundamental analysis. Always cite 
specific financial metrics, compare to industry peers, and assess 
competitive moats. Present bull/base/bear cases with probability 
estimates. Never make buy/sell recommendations — present analysis 
for the user to make their own informed decision.
```

**Context Injected:**
- Latest financial statements (income, balance sheet, cash flow)
- Peer comparison metrics (5 closest peers by sector + market cap)
- Historical valuation multiples (5-year range)
- Analyst consensus estimates
- Recent earnings results

**Output Schema:**
```typescript
interface AnalystOutput {
  summary: string;                    // 2-3 sentence overview
  businessModel: string;              // How the company makes money
  moatAssessment: 'none' | 'narrow' | 'wide';
  moatSources: string[];              // Brand, network effects, cost, switching, etc.
  growthDrivers: Array<{
    driver: string;
    impact: 'low' | 'medium' | 'high';
    timeframe: string;
    confidence: number;               // 0-100
  }>;
  risks: Array<{
    risk: string;
    probability: 'low' | 'medium' | 'high';
    severity: 'low' | 'medium' | 'high';
    mitigant: string;
  }>;
  valuation: {
    currentPE: number;
    historicalAvgPE: number;
    peerAvgPE: number;
    fairValueEstimate: { low: number; mid: number; high: number };
    methodology: string;
  };
  scenarios: {
    bull: { target: number; probability: number; assumptions: string[] };
    base: { target: number; probability: number; assumptions: string[] };
    bear: { target: number; probability: number; assumptions: string[] };
  };
  confidence: number;                 // 0-100 overall confidence
  dataSources: string[];
}
```

---

### 2.2 Technical Analyst Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.technical_analyst` |
| **Purpose** | Chart analysis, pattern recognition, trend/momentum assessment |
| **LLM** | GPT-4o (primary) |
| **Temperature** | 0.2 (precise, numerical) |
| **Max Tokens** | 1500 |
| **Triggered By** | Intents: TECHNICAL, ENTRY_EXIT, CHART_PATTERN, MOMENTUM |

**Context Injected:**
- OHLCV data (last 252 trading days + last 20 intraday bars)
- Pre-computed indicators: RSI(14), MACD(12,26,9), SMA(20/50/200), Bollinger(20,2), ATR(14), VWAP
- Volume profile (20-day average, recent anomalies)
- Pattern detection results from ML service

**Output Schema:**
```typescript
interface TechnicalOutput {
  trendDirection: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  trendStrength: number;              // 0-100
  keyLevels: {
    support: number[];                // Nearest 3 support levels
    resistance: number[];             // Nearest 3 resistance levels
  };
  indicators: {
    rsi: { value: number; signal: 'oversold' | 'neutral' | 'overbought' };
    macd: { signal: 'bullish_cross' | 'bearish_cross' | 'neutral'; histogram: number };
    movingAverages: { position: string; goldenCross: boolean; deathCross: boolean };
    bollingerBands: { position: 'above_upper' | 'upper_half' | 'lower_half' | 'below_lower' };
  };
  patterns: Array<{
    pattern: string;                  // 'head_and_shoulders', 'double_bottom', etc.
    reliability: number;              // Historical win rate
    implication: 'bullish' | 'bearish';
    targetPrice: number;
  }>;
  outlook: {
    shortTerm: string;                // 1-5 days
    mediumTerm: string;               // 1-4 weeks
    signalStrength: number;           // 0-100 confluence score
  };
  entryZones: number[];
  exitZones: number[];
  stopLossLevel: number;
  confidence: number;
}
```

---

### 2.3 Quantitative Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.quantitative` |
| **Purpose** | Factor analysis, risk metrics, statistical modeling |
| **LLM** | GPT-4o + Python ML sidecar |
| **Temperature** | 0.1 (mathematical precision) |
| **Max Tokens** | 1500 |
| **Triggered By** | Intents: RISK, PORTFOLIO_ANALYSIS, FACTOR, CORRELATION, OPTIMIZATION |

**ML Services Used:**
- Factor Model Service (value, momentum, quality, size, volatility scores)
- Monte Carlo Service (return distribution simulation)
- Regime Detection Service (current market regime)

**Output Schema:**
```typescript
interface QuantOutput {
  factorExposure: {
    value: number;                    // -1 to +1
    momentum: number;
    quality: number;
    size: number;
    volatility: number;
    overallScore: number;             // Composite 0-100
  };
  riskMetrics: {
    beta: number;
    annualizedVolatility: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    valueAtRisk95: number;
  };
  returnDistribution: {
    expectedReturn: number;           // Annualized
    p10: number;                      // 10th percentile outcome
    p25: number;
    p50: number;                      // Median
    p75: number;
    p90: number;
    skewness: number;
    kurtosis: number;
  };
  correlations: Record<string, number>; // vs. major assets
  regime: {
    current: 'bull' | 'bear' | 'sideways' | 'crisis';
    confidence: number;
    implications: string;
  };
  peerRanking: {
    rank: number;
    outOf: number;
    percentile: number;
    rankingCriteria: string;
  };
  confidence: number;
}
```

---


### 2.4 News Intelligence Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.news_intelligence` |
| **Purpose** | News analysis, sentiment, event impact assessment |
| **LLM** | Claude 3.5 Sonnet (excellent at summarization) |
| **Temperature** | 0.3 |
| **Max Tokens** | 1200 |
| **Triggered By** | Intents: NEWS, SENTIMENT, EVENT, EARNINGS_REPORT, CATALYST |

**Context Injected:**
- Last 20 news articles mentioning the symbol (with sentiment pre-scored)
- Upcoming earnings date
- Recent insider transactions
- Analyst rating changes (last 30 days)
- Sector news headlines

**Output Schema:**
```typescript
interface NewsIntelOutput {
  summary: string;                    // Key recent developments
  sentiment: {
    overall: number;                  // -1.0 to +1.0
    trend: 'improving' | 'stable' | 'deteriorating';
    volumeOfCoverage: 'low' | 'normal' | 'high' | 'extreme';
  };
  keyEvents: Array<{
    event: string;
    date: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    sentiment: 'positive' | 'neutral' | 'negative';
    source: string;
  }>;
  upcomingCatalysts: Array<{
    catalyst: string;
    expectedDate: string;
    potentialImpact: string;
  }>;
  contradictions: Array<{            // When sources disagree
    topic: string;
    viewA: string;
    sourceA: string;
    viewB: string;
    sourceB: string;
  }>;
  insiderActivity: {
    recentTransactions: number;
    netDirection: 'buying' | 'selling' | 'mixed' | 'none';
    significance: string;
  };
  confidence: number;
}
```

---

### 2.5 Macro Economics Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.macro_economics` |
| **Purpose** | Macroeconomic context, sector implications, cycle positioning |
| **LLM** | GPT-4o |
| **Temperature** | 0.3 |
| **Max Tokens** | 1500 |
| **Triggered By** | Intents: MACRO, INTEREST_RATE, INFLATION, SECTOR_ROTATION, RECESSION |

**Context Injected:**
- Latest macro data: Fed Funds Rate, CPI, PPI, Unemployment, GDP, ISM PMI
- Yield curve (2Y, 5Y, 10Y, 30Y)
- DXY, major commodity prices
- Regime detection output
- Historical analogy data (current conditions matched to past periods)

**Output Schema:**
```typescript
interface MacroOutput {
  currentRegime: {
    cycle: 'early_expansion' | 'mid_expansion' | 'late_expansion' | 'slowdown' | 'contraction' | 'recovery';
    confidence: number;
    keyIndicators: string[];
  };
  outlook: {
    shortTerm: string;                // 1-3 months
    mediumTerm: string;               // 3-12 months
    risks: string[];
  };
  sectorImplications: Array<{
    sector: string;
    stance: 'overweight' | 'neutral' | 'underweight';
    rationale: string;
  }>;
  interestRateImpact: {
    currentPath: string;
    impactOnEquities: string;
    impactOnSector: string;           // Sector of queried stock
  };
  historicalAnalogy: {
    period: string;                   // "Q4 2018" or "2015-2016"
    similarity: number;               // 0-100
    whatHappenedThen: string;
    caveat: string;
  };
  countryAttractiveness: Array<{     // For international queries
    country: string;
    score: number;
    drivers: string[];
  }>;
  confidence: number;
}
```

---

### 2.6 Portfolio Advisor Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.portfolio_advisor` |
| **Purpose** | Portfolio diagnostics, rebalancing, goal alignment |
| **LLM** | GPT-4o |
| **Temperature** | 0.3 |
| **Max Tokens** | 1800 |
| **Triggered By** | Intents: PORTFOLIO_REVIEW, REBALANCE, DIVERSIFICATION, GOAL, RISK_REDUCE |

**Context Injected:**
- User's complete portfolio (holdings, weights, performance)
- User's investment profile (risk tolerance, goals, horizon)
- Portfolio risk metrics (pre-computed by quant service)
- Benchmark comparison data
- Market regime context

**Output Schema:**
```typescript
interface PortfolioAdvisorOutput {
  healthScore: number;                // 0-100
  diagnostics: {
    diversification: { score: number; issues: string[] };
    riskAlignment: { aligned: boolean; explanation: string };
    concentration: { topHolding: string; weight: number; concern: boolean };
    sectorBalance: { overweight: string[]; underweight: string[] };
    goalAlignment: { onTrack: boolean; projection: string };
  };
  recommendations: Array<{
    action: 'add' | 'reduce' | 'remove' | 'rebalance' | 'hedge';
    description: string;
    rationale: string;
    priority: 'low' | 'medium' | 'high';
    impact: string;
  }>;
  rebalancingSuggestion: {
    needed: boolean;
    urgency: 'low' | 'medium' | 'high';
    proposedChanges: Array<{
      symbol: string;
      currentWeight: number;
      targetWeight: number;
      action: 'buy' | 'sell';
    }>;
  };
  riskWarnings: string[];
  confidence: number;
}
```

---

### 2.7 Education Agent

| Attribute | Value |
|-----------|-------|
| **ID** | `agent.education` |
| **Purpose** | Explain concepts, adapt to user level, teach through context |
| **LLM** | Claude 3.5 Sonnet (excellent at clear explanations) |
| **Temperature** | 0.5 (creative explanations) |
| **Max Tokens** | 1000 |
| **Triggered By** | Intents: EXPLAIN, LEARN, WHAT_IS, HOW_DOES, DEFINITION |

**Output Schema:**
```typescript
interface EducationOutput {
  explanation: string;                // Adapted to user expertise level
  analogy: string;                    // Real-world analogy for complex concepts
  examples: string[];                 // Concrete examples
  relatedConcepts: string[];          // "You might also want to learn about..."
  practicalApplication: string;       // How this applies to their investing
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
}
```

---

## 3. Orchestration Logic

### 3.1 Intent Classification

The intent classifier maps natural language queries to one or more intents:

```typescript
enum QueryIntent {
  // Fundamental
  VALUATION = 'valuation',
  FUNDAMENTAL = 'fundamental',
  EARNINGS = 'earnings',
  COMPARISON = 'comparison',
  THESIS = 'thesis',

  // Technical
  TECHNICAL = 'technical',
  ENTRY_EXIT = 'entry_exit',
  CHART_PATTERN = 'chart_pattern',
  MOMENTUM = 'momentum',

  // Quantitative
  RISK = 'risk',
  PORTFOLIO_ANALYSIS = 'portfolio_analysis',
  FACTOR = 'factor',
  CORRELATION = 'correlation',
  OPTIMIZATION = 'optimization',

  // News & Events
  NEWS = 'news',
  SENTIMENT = 'sentiment',
  EVENT = 'event',
  EARNINGS_REPORT = 'earnings_report',
  CATALYST = 'catalyst',

  // Macro
  MACRO = 'macro',
  INTEREST_RATE = 'interest_rate',
  INFLATION = 'inflation',
  SECTOR_ROTATION = 'sector_rotation',
  RECESSION = 'recession',

  // Portfolio
  PORTFOLIO_REVIEW = 'portfolio_review',
  REBALANCE = 'rebalance',
  DIVERSIFICATION = 'diversification',
  GOAL = 'goal',
  RISK_REDUCE = 'risk_reduce',

  // Education
  EXPLAIN = 'explain',
  LEARN = 'learn',
  WHAT_IS = 'what_is',
  HOW_DOES = 'how_does',
  DEFINITION = 'definition',
}
```

### 3.2 Intent → Agent Routing Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ROUTING MATRIX                                     │
├──────────────────────────┬──────────────────────────────────────────┤
│ Query Example             │ Agents Selected                          │
├──────────────────────────┼──────────────────────────────────────────┤
│ "Is NVDA overvalued?"    │ Analyst + Quant                          │
│ "AAPL technical setup"   │ Technical                                │
│ "Compare MSFT vs GOOG"  │ Analyst + Quant + Technical              │
│ "Portfolio too risky?"   │ Portfolio Advisor + Quant                │
│ "Impact of rate hike"   │ Macro + News                             │
│ "What is P/E ratio?"    │ Education                                │
│ "TSLA news and outlook" │ News + Analyst + Technical               │
│ "Best dividend stocks"  │ Analyst + Quant (screener mode)          │
│ "Recession risk?"       │ Macro + Portfolio Advisor                 │
│ "Full thesis on AMD"    │ Analyst + Technical + Quant + News        │
└──────────────────────────┴──────────────────────────────────────────┘
```

### 3.3 Execution Strategy

```typescript
interface ExecutionPlan {
  agents: AgentSelection[];
  strategy: 'parallel' | 'sequential' | 'fan_out_fan_in';
  tokenBudget: number;               // Total tokens allocated
  timeoutMs: number;                  // Maximum wall-clock time
  priority: 'low' | 'normal' | 'high';
}

// Most queries use parallel execution for minimum latency
// Sequential only when Agent B needs Agent A's output:
//   Example: Portfolio Advisor needs Quant risk metrics first

function buildExecutionPlan(intents: QueryIntent[], userTier: string): ExecutionPlan {
  const agents = selectAgents(intents);
  const hasDependency = checkDependencies(agents);

  return {
    agents,
    strategy: hasDependency ? 'sequential' : 'parallel',
    tokenBudget: userTier === 'free' ? 3000 : userTier === 'pro' ? 6000 : 10000,
    timeoutMs: 15000,
    priority: agents.length > 3 ? 'high' : 'normal',
  };
}
```

### 3.4 Response Merging Algorithm

```typescript
class ResponseMerger {
  merge(agentOutputs: AgentOutput[]): MergedResponse {
    // 1. Extract key claims from each agent
    const claims = this.extractClaims(agentOutputs);

    // 2. Detect contradictions
    const contradictions = this.detectContradictions(claims);

    // 3. Weight by confidence and relevance
    const weightedClaims = this.applyWeights(claims, agentOutputs);

    // 4. Build narrative structure
    const narrative = this.buildNarrative(weightedClaims, contradictions);

    // 5. Compute aggregate confidence
    const confidence = this.computeConfidence(agentOutputs);

    // 6. Collect all sources
    const sources = this.collectSources(agentOutputs);

    return {
      content: narrative,
      confidence,
      sources,
      agentsUsed: agentOutputs.map(a => a.agentId),
      contradictions: contradictions.map(c => ({
        topic: c.topic,
        perspectives: c.perspectives,
      })),
      suggestedFollowups: this.generateFollowups(narrative, agentOutputs),
    };
  }

  private computeConfidence(outputs: AgentOutput[]): number {
    // Weighted average: higher weight for agents with more relevant data
    const weights = outputs.map(o => o.relevanceScore);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return outputs.reduce(
      (sum, o, i) => sum + (o.confidence * weights[i] / totalWeight), 0
    );
  }
}
```

---

## 4. Context Assembly & Data Pipeline

### 4.1 Context Window Management

```
Total Context Budget: ~32K tokens (GPT-4o) or ~100K tokens (Claude 3.5)

Allocation:
┌────────────────────────────────────┬──────────────────┐
│ Component                          │ Token Budget     │
├────────────────────────────────────┼──────────────────┤
│ System prompt (agent persona)      │ ~500 tokens      │
│ User profile & preferences         │ ~200 tokens      │
│ Conversation history (last 5 msgs) │ ~1000 tokens     │
│ Market data context                │ ~3000 tokens     │
│ Fundamental data (structured)      │ ~2000 tokens     │
│ News summaries                     │ ~1500 tokens     │
│ Query-specific enrichment          │ ~2000 tokens     │
│ Reserved for response              │ ~2000 tokens     │
├────────────────────────────────────┼──────────────────┤
│ TOTAL PER AGENT                    │ ~12,200 tokens   │
└────────────────────────────────────┴──────────────────┘
```

### 4.2 Data Freshness Requirements

| Data Type | Max Staleness for AI Context |
|-----------|------------------------------|
| Current price | 60 seconds |
| Daily bars | Current day |
| Fundamentals | End of last quarter |
| News | 24 hours |
| Analyst ratings | 7 days |
| Insider trades | 3 days |
| Macro data | Latest release |

---

## 5. LLM Provider Strategy

### 5.1 Provider Selection Logic

```typescript
interface LLMProviderConfig {
  primary: 'openai' | 'anthropic';
  fallback: 'anthropic' | 'openai' | 'local';
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

const PROVIDER_ROUTING: Record<string, LLMProviderConfig> = {
  'agent.investment_analyst': {
    primary: 'openai', model: 'gpt-4o',
    fallback: 'anthropic', temperature: 0.3, maxTokens: 2000, timeout: 12000,
  },
  'agent.technical_analyst': {
    primary: 'openai', model: 'gpt-4o',
    fallback: 'anthropic', temperature: 0.2, maxTokens: 1500, timeout: 10000,
  },
  'agent.quantitative': {
    primary: 'openai', model: 'gpt-4o',
    fallback: 'anthropic', temperature: 0.1, maxTokens: 1500, timeout: 10000,
  },
  'agent.news_intelligence': {
    primary: 'anthropic', model: 'claude-3-5-sonnet',
    fallback: 'openai', temperature: 0.3, maxTokens: 1200, timeout: 8000,
  },
  'agent.macro_economics': {
    primary: 'openai', model: 'gpt-4o',
    fallback: 'anthropic', temperature: 0.3, maxTokens: 1500, timeout: 10000,
  },
  'agent.portfolio_advisor': {
    primary: 'openai', model: 'gpt-4o',
    fallback: 'anthropic', temperature: 0.3, maxTokens: 1800, timeout: 12000,
  },
  'agent.education': {
    primary: 'anthropic', model: 'claude-3-5-sonnet',
    fallback: 'openai', temperature: 0.5, maxTokens: 1000, timeout: 8000,
  },
  // Intent classifier uses cheaper model
  'orchestrator.classifier': {
    primary: 'openai', model: 'gpt-4o-mini',
    fallback: 'anthropic', temperature: 0.0, maxTokens: 200, timeout: 3000,
  },
  // Response merger
  'orchestrator.merger': {
    primary: 'openai', model: 'gpt-4o',
    fallback: 'anthropic', temperature: 0.2, maxTokens: 3000, timeout: 12000,
  },
};
```

### 5.2 Cost Optimization

```
Strategy                          | Savings
──────────────────────────────────┼─────────
Semantic cache (15-25% hit rate)  | ~20% of LLM costs
GPT-4o-mini for classification    | 90% cheaper than GPT-4o for routing
Structured output (JSON mode)     | Fewer tokens wasted on formatting
Token budget limits per agent     | Prevents runaway costs
Batch non-urgent requests (news)  | Lower per-token cost
Local LLM for low-complexity      | $0 marginal cost
Response caching (popular stocks) | Major savings on AAPL, TSLA, etc.
```

**Estimated LLM Cost per Query:**
- Simple (1 agent): $0.02–0.04
- Medium (2-3 agents): $0.05–0.10
- Complex (4 agents + merger): $0.10–0.20

---

## 6. Quality & Evaluation

### 6.1 Agent Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Response relevance | > 85% | User feedback + auto-eval |
| Factual accuracy | > 95% | Spot-check against verified data |
| Source citation rate | 100% | Automated check (every claim sourced) |
| Hallucination rate | < 2% | Numbers compared to actual data |
| Disclaimer compliance | 100% | Rule-based verification |
| Latency (first token) | < 2s | P95 measurement |
| Latency (full response) | < 12s | P95 measurement |

### 6.2 Evaluation Pipeline

```
1. AUTOMATED CHECKS (every response):
   - All numbers match injected data (no hallucinated metrics)
   - Disclaimer appended
   - No explicit "buy" or "sell" language
   - Confidence score within valid range
   - Sources array non-empty

2. LLM-AS-JUDGE (sampled 10%):
   - Separate evaluation LLM scores relevance, accuracy, helpfulness
   - Flags potential issues for human review

3. USER FEEDBACK LOOP:
   - Thumbs up/down on every response
   - Optional text feedback
   - Aggregated weekly quality reports
   - Low-scoring responses queued for prompt improvement

4. A/B TESTING:
   - New prompt versions tested on 5% traffic
   - Statistical significance required before full rollout
```

### 6.3 Guardrails & Safety

```typescript
class ComplianceFilter {
  validate(response: string): ComplianceResult {
    return {
      hasBuySellLanguage: this.checkBuySell(response),
      hasDisclaimer: this.checkDisclaimer(response),
      hasUnsourcedClaims: this.checkSources(response),
      hasSpecificTargetWithoutCaveat: this.checkTargets(response),
      isCompliant: true, // all checks must pass
    };
  }

  private checkBuySell(text: string): boolean {
    const forbidden = [
      /you should (buy|sell)/i,
      /I recommend (buying|selling)/i,
      /definitely (buy|sell)/i,
      /must (buy|sell)/i,
    ];
    return forbidden.some(r => r.test(text));
  }
}
```

---

## 7. Scaling & Performance

### 7.1 Concurrency Model

```
Concurrent AI Requests:
  Free tier:   1 concurrent (queue if busy)
  Pro tier:    3 concurrent
  Premium:     10 concurrent

Agent Pool:
  - Max 30 agent workers (K8s pods)
  - Each worker handles 5 concurrent agent calls
  - Total system capacity: 150 concurrent agent executions
  - With 2.5 agents/query average: ~60 concurrent user queries

Scaling trigger: queue depth > 10 → add pod (30s spin-up)
```

### 7.2 Latency Breakdown (Target P95)

```
Query preprocessing:     50ms
Intent classification:   300ms (GPT-4o-mini)
Context assembly:        200ms (parallel DB + cache reads)
Agent execution:         3-8s (LLM inference, parallelized)
Response merging:        500ms
Compliance check:        50ms
─────────────────────────────────
Total (simple query):    ~4s
Total (complex query):   ~10s
First token streaming:   ~1.5s (classifier + first agent token)
```

---

## 8. Agent Interaction Sequence Diagram

```
User                Gateway        Orchestrator      Agents (parallel)     Data Layer
 │                    │                │                    │                  │
 │─── "Is NVDA       │                │                    │                  │
 │    overvalued?" ──▶│                │                    │                  │
 │                    │── POST /ai ───▶│                    │                  │
 │                    │                │── classify ───────▶│ (GPT-4o-mini)    │
 │                    │                │◀── intents ────────│                  │
 │                    │                │                    │                  │
 │                    │                │── fetch context ──────────────────────▶│
 │                    │                │◀── market data ───────────────────────│
 │                    │                │                    │                  │
 │                    │                │── [parallel] ─────▶│                  │
 │                    │                │   Analyst Agent    │                  │
 │                    │                │   Quant Agent      │                  │
 │                    │                │   News Agent       │                  │
 │                    │                │                    │                  │
 │◀─── SSE: first ───│◀── stream ────│◀── tokens ────────│                  │
 │     tokens         │                │                    │                  │
 │                    │                │                    │                  │
 │◀─── SSE: more ────│◀──────────────│◀── complete ──────│                  │
 │     tokens         │                │                    │                  │
 │                    │                │── merge outputs ──▶│ (GPT-4o)         │
 │                    │                │◀── merged ────────│                  │
 │                    │                │                    │                  │
 │◀─── SSE: final ───│◀──────────────│── compliance ─────▶│ (rule-based)     │
 │     + metadata     │                │◀── pass ──────────│                  │
 │                    │                │                    │                  │
 │◀─── SSE: done ────│◀──────────────│── store ──────────────────────────────▶│
 │                    │                │                    │                  │
```

---

*End of AI Agent Architecture Document*



---

# APPENDIX A — Full 15-Agent Research Ecosystem (v2)

The master research vision expands the agent roster to a comprehensive ecosystem. Every investment opportunity is evaluated by the relevant subset of these agents, whose findings are reconciled by the orchestrator into one unified, explainable report.

## A.1 Agent Roster & Implementation Status

| # | Agent | Domain | Status | Backing Service |
|---|-------|--------|:------:|-----------------|
| 1 | **Fundamental Analysis** | Financial statements, business model, moat | ✅ Implemented | `investment-analyst.agent.ts` |
| 2 | **Technical Analysis** | Price action, indicators, patterns | ✅ Implemented | `technical-analyst.agent.ts` |
| 3 | **Quantitative Analysis** | Factors, risk metrics, distributions | ✅ Implemented | `quantitative.agent.ts` + `factor-model` |
| 4 | **Valuation** | DCF, DDM, comparables, Monte Carlo | ◑ Service ready | `valuation` service ✅ |
| 5 | **Macroeconomic** | Cycle, rates, sector implications | ✅ Implemented | `macro-economics.agent.ts` |
| 6 | **Earnings Analysis** | Earnings quality, surprises, guidance | ○ Specified | (roadmap) |
| 7 | **Risk Analysis** | VaR, drawdown, stress, concentration | ◑ Partial | `risk.service.ts` ✅ + quant |
| 8 | **Options Analysis** | IV, skew, flow, positioning | ○ Specified | (roadmap) |
| 9 | **Sector Rotation** | Cycle-based sector positioning | ○ Specified | (roadmap, uses macro) |
| 10 | **Portfolio Optimization** | Diversification, weights, rebalance | ✅ Implemented | `portfolio-advisor.agent.ts` |
| 11 | **Sentiment Analysis** | News/social sentiment scoring | ◑ Partial | within `news-intelligence` |
| 12 | **News Intelligence** | Event detection, summarization | ✅ Implemented | `news-intelligence.agent.ts` |
| 13 | **Insider Trading** | Insider buy/sell signal analysis | ○ Specified | (roadmap) |
| 14 | **Institutional Ownership** | 13F flow, smart-money tracking | ○ Specified | (roadmap) |
| 15 | **ESG Analysis** | Environmental, social, governance | ○ Specified | (roadmap) |
| + | **Education** | Adaptive concept explanation | ✅ Implemented | `education.agent.ts` |
| + | **Investment Score** | Explainable multi-factor scoring | ✅ Service ready | `investment-score` service ✅ |

✅ Implemented · ◑ Partial/service-ready · ○ Specified for build-out

## A.2 New Agent Specifications

### Valuation AI (#4)
- **Purpose:** Run intrinsic-value models and reconcile them into a fair-value range.
- **Backing:** `valuation` microservice (DCF two-stage + Gordon terminal, DDM, comparables, Monte Carlo, sensitivity grid). 16 passing tests.
- **Output:** Fair-value range (bear/base/bull from Monte Carlo p10/p50/p90), upside/downside vs. current price, % of value from terminal (fragility flag), sensitivity table, and the explicit assumptions used.
- **Explainability:** Returns every assumption (WACC, growth, terminal growth) and the full sensitivity grid so users see how fragile the valuation is.

### Earnings Analysis AI (#6)
- **Purpose:** Assess earnings quality and event risk around reports.
- **Inputs:** Historical surprises, estimate dispersion, guidance trends, accruals, revenue recognition signals.
- **Output:** Earnings quality score, surprise probability, guidance trajectory, "what to watch this quarter."

### Risk Analysis AI (#7)
- **Purpose:** Quantify and explain downside risk at security and portfolio level.
- **Backing:** `risk.service.ts` (beta, Sharpe, Sortino, max drawdown, VaR 95/99, HHI concentration, correlation matrix).
- **Output:** Risk metrics with plain-language interpretation, stress-scenario impacts, concentration warnings.

### Options Analysis AI (#8)
- **Purpose:** Read the options market for positioning and implied expectations.
- **Inputs:** Implied volatility surface, put/call skew, open-interest flow, term structure.
- **Output:** Implied move, sentiment from positioning, unusual-activity flags, IV rank/percentile.

### Sector Rotation AI (#9)
- **Purpose:** Position the cycle and identify favored/disfavored sectors.
- **Backing:** Consumes Macro agent + relative-strength quant signals.
- **Output:** Cycle phase, overweight/underweight sectors with rationale, rotation signals.

### Insider Trading AI (#13)
- **Purpose:** Interpret Form 4 insider transactions as a confidence signal.
- **Inputs:** Insider buys/sells, cluster detection, transaction size vs. holdings, role of insider.
- **Output:** Net insider direction, significance, notable cluster activity.

### Institutional Ownership AI (#14)
- **Purpose:** Track "smart money" via 13F filings.
- **Inputs:** Institutional ownership %, quarter-over-quarter changes, notable fund entries/exits.
- **Output:** Ownership trend, concentration, recent accumulation/distribution by major holders.

### ESG Analysis AI (#15)
- **Purpose:** Evaluate environmental, social, and governance factors.
- **Inputs:** Emissions/intensity, board independence, controversies, governance structure.
- **Output:** E/S/G sub-scores, material controversies, governance red flags — clearly labeled as one input among many, not a moral verdict.

## A.3 Unified Report Assembly

When a user requests full analysis, the orchestrator:

1. **Selects** the relevant agents for the query (routing matrix §3.2) plus always-on Valuation + Investment Score for a full company review.
2. **Executes** independent agents in parallel; dependent ones (e.g., Sector Rotation needs Macro) sequentially.
3. **Reconciles** outputs in the Response Merger — surfacing agreement, and where agents **disagree**, presenting both sides explicitly (e.g., "Fundamentals are strong (score 78) but Technicals are bearish (downtrend below 200-DMA)").
4. **Synthesizes** a unified report structured as:
   - Investment Score (with category breakdown)
   - Fair-value range (Valuation agent)
   - Bull / Base / Bear cases
   - Key strengths and risks (ranked, sourced)
   - Confidence level and data coverage
   - "What could change the outlook"
   - Disclaimer

## A.4 Cross-Agent Contradiction Handling

A core differentiator: when agents conflict, InvestorIQ **shows the tension** rather than averaging it away.

```
Example reconciliation:
  Fundamental:  Score 78 — strong margins, low debt, double-digit growth
  Valuation:    Overvalued — trading at p85 of historical EV/EBITDA
  Technical:    Bearish — below 200-DMA, negative MACD
  News:         Positive sentiment (+0.4), upcoming product catalyst

  → Unified narrative: "A high-quality business (fundamentals 78/100) that
    appears expensively priced and is in a short-term downtrend. The
    long-term quality case and the near-term valuation/technical caution
    are both valid — your time horizon determines which matters more."
```

This honest presentation of conflicting evidence — with confidence and sources — is what no incumbent platform delivers and what makes InvestorIQ a genuine research mentor rather than a black-box rating.

---

*End of Appendix A — Full 15-Agent Research Ecosystem*
