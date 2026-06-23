# InvestorIQ — Frontend Component Architecture

**Version:** 1.0  
**Date:** 2026-06-22  
**Status:** Approved  

---

## 1. Technology Foundation

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.x |
| UI Library | React | 18.x |
| Language | TypeScript | 5.4 |
| Styling | Tailwind CSS + shadcn/ui | 3.4 / latest |
| State (client) | Zustand | 4.x |
| State (server) | TanStack Query | 5.x |
| Charts | Lightweight Charts (TradingView) + Recharts | latest |
| Real-time | Socket.IO Client | 4.x |
| Forms | React Hook Form + Zod | 7.x / 3.x |
| Animation | Framer Motion | 11.x |
| Icons | Lucide React | latest |
| Testing | Vitest + Testing Library + Playwright | latest |

---

## 2. App Router Structure

```
src/frontend/
├── app/                              # Next.js App Router
│   ├── (auth)/                       # Auth group (no sidebar)
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── onboarding/page.tsx
│   │   └── layout.tsx                # Minimal layout (centered card)
│   ├── (dashboard)/                  # Main app group (with sidebar)
│   │   ├── layout.tsx                # Sidebar + Header + Main
│   │   ├── page.tsx                  # Dashboard home
│   │   ├── stock/[symbol]/
│   │   │   ├── page.tsx              # Stock detail page
│   │   │   ├── loading.tsx           # Streaming skeleton
│   │   │   └── components/           # Page-specific components
│   │   ├── portfolio/
│   │   │   ├── page.tsx              # Portfolio list
│   │   │   ├── [id]/page.tsx         # Portfolio detail
│   │   │   └── components/
│   │   ├── screener/
│   │   │   ├── page.tsx              # Stock screener
│   │   │   └── components/
│   │   ├── ai/
│   │   │   ├── page.tsx              # AI chat interface
│   │   │   ├── [conversationId]/page.tsx
│   │   │   └── components/
│   │   ├── alerts/
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   ├── backtest/
│   │   │   ├── page.tsx
│   │   │   ├── [runId]/page.tsx
│   │   │   └── components/
│   │   ├── news/
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── profile/page.tsx
│   │       ├── billing/page.tsx
│   │       └── notifications/page.tsx
│   ├── api/                          # API route handlers (BFF pattern)
│   │   ├── auth/[...nextauth]/route.ts
│   │   └── proxy/[...path]/route.ts  # Proxy to backend services
│   ├── layout.tsx                    # Root layout (providers, fonts)
│   ├── globals.css                   # Tailwind base + custom
│   └── not-found.tsx
├── components/                       # Shared components
│   ├── ui/                           # shadcn/ui primitives
│   ├── charts/                       # Chart components
│   ├── portfolio/                    # Portfolio feature components
│   ├── agents/                       # AI-related components
│   ├── screening/                    # Screener components
│   ├── alerts/                       # Alert components
│   ├── backtesting/                  # Backtest components
│   ├── layout/                       # Layout components
│   └── common/                       # Shared utility components
├── hooks/                            # Custom React hooks
├── lib/                              # Utilities, API clients, helpers
├── stores/                           # Zustand state stores
├── types/                            # TypeScript type definitions
├── styles/                           # Additional style files
└── public/                           # Static assets
```

---

## 3. Component Hierarchy

### 3.1 Layout Components

```
RootLayout
├── ThemeProvider (dark/light)
├── QueryClientProvider (TanStack)
├── WebSocketProvider (connection management)
├── AuthProvider (session state)
├── ToastProvider (notifications)
└── children

DashboardLayout
├── Sidebar
│   ├── Logo
│   ├── NavigationMenu
│   │   ├── NavItem (Dashboard)
│   │   ├── NavItem (Portfolio)
│   │   ├── NavItem (Screener)
│   │   ├── NavItem (AI Assistant)
│   │   ├── NavItem (Alerts)
│   │   ├── NavItem (Backtest)
│   │   ├── NavItem (News)
│   │   └── NavItem (Settings)
│   ├── QuickSearch (Cmd+K)
│   └── UserMenu (avatar, tier badge, logout)
├── Header
│   ├── Breadcrumbs
│   ├── MarketStatusBadge (open/closed)
│   ├── GlobalSearch
│   ├── NotificationBell (unread count)
│   └── ThemeToggle
├── MainContent (children)
└── MobileBottomNav (< 768px)
```

### 3.2 Dashboard Page Components

```
DashboardPage
├── WelcomeHeader (personalized greeting + quick stats)
├── MarketOverview
│   ├── IndexCards (S&P 500, NASDAQ, DJIA — real-time)
│   └── MarketStatusIndicator
├── PortfolioSnapshot
│   ├── TotalValueCard (real-time)
│   ├── DayChangeCard
│   ├── MiniAllocationChart (donut)
│   └── TopMovers (best/worst performers today)
├── AIInsightsPanel
│   ├── DailySummary (AI-generated market overview)
│   ├── ActionItems (portfolio advisor suggestions)
│   └── AskAIButton (quick access to chat)
├── WatchlistWidget
│   ├── WatchlistTabs
│   └── WatchlistTable (symbol, price, change, sparkline)
├── RecentAlerts
│   └── AlertCard[] (recent triggered alerts)
└── NewsFeed (top 5 articles with sentiment badges)
```

### 3.3 Stock Detail Page Components

```
StockDetailPage (params: { symbol })
├── StockHeader
│   ├── SymbolBadge + CompanyName
│   ├── CurrentPrice (real-time, large)
│   ├── ChangeIndicator ($ and %)
│   ├── MarketStatus
│   └── ActionButtons (Add to Portfolio, Set Alert, AI Analysis)
├── TabNavigation
│   ├── Tab: Overview (default)
│   ├── Tab: Financials
│   ├── Tab: Technical
│   ├── Tab: News
│   └── Tab: AI Thesis
├── [Tab: Overview]
│   ├── PriceChart (interactive, multi-timeframe)
│   │   ├── TimeframeSelector (1D, 1W, 1M, 3M, 6M, 1Y, 5Y, MAX)
│   │   ├── ChartTypeToggle (candle, line, area)
│   │   ├── IndicatorOverlays (user-configurable)
│   │   └── VolumeBarChart (below main chart)
│   ├── KeyMetricsGrid
│   │   ├── MetricCard (P/E)
│   │   ├── MetricCard (Market Cap)
│   │   ├── MetricCard (Div Yield)
│   │   ├── MetricCard (52W Range)
│   │   ├── MetricCard (Avg Volume)
│   │   └── MetricCard (EPS)
│   ├── CompanyProfile (sector, industry, description)
│   ├── AnalystConsensus (rating distribution bar)
│   └── QuickAISummary (3-sentence AI-generated summary)
├── [Tab: Financials]
│   ├── FinancialTabs (Income, Balance Sheet, Cash Flow)
│   ├── PeriodToggle (Annual / Quarterly / TTM)
│   └── FinancialTable (sortable, comparable periods)
├── [Tab: Technical]
│   ├── AdvancedChart (full-screen capable)
│   ├── IndicatorPanel (add/remove indicators)
│   ├── PatternDetection (AI-detected patterns highlighted)
│   └── TechnicalSummary (AI-generated technical outlook)
├── [Tab: News]
│   ├── NewsFilter (sentiment, date range)
│   └── NewsArticleList (with sentiment badges)
└── [Tab: AI Thesis]
    ├── GenerateThesisButton
    └── ThesisDisplay (structured investment thesis)
```

---


### 3.4 AI Chat Components

```
AIChatPage
├── ConversationSidebar
│   ├── NewChatButton
│   ├── SearchConversations
│   └── ConversationList
│       └── ConversationItem[] (title, date, preview)
├── ChatInterface
│   ├── ChatHeader
│   │   ├── ConversationTitle (editable)
│   │   └── ConversationActions (share, export, delete)
│   ├── MessageList
│   │   ├── UserMessage
│   │   │   └── MessageContent (markdown rendered)
│   │   └── AssistantMessage
│   │       ├── MessageContent (streaming typewriter)
│   │       ├── AgentBadges (which agents contributed)
│   │       ├── ConfidenceIndicator (0-100 visual)
│   │       ├── SourcesList (expandable)
│   │       ├── SuggestedFollowups (clickable pills)
│   │       ├── FeedbackButtons (thumbs up/down)
│   │       └── Disclaimer (collapsible)
│   ├── ChatInput
│   │   ├── TextArea (auto-resize, max 2000 chars)
│   │   ├── ContextChips (attached symbols, portfolio)
│   │   ├── SendButton
│   │   └── QuickActions (Compare, Thesis, Portfolio Review)
│   └── TypingIndicator (while AI processing)
└── ContextPanel (collapsible right panel)
    ├── AttachedSymbols (mini quote cards)
    ├── AttachedPortfolio (mini summary)
    └── RelatedArticles
```

### 3.5 Portfolio Components

```
PortfolioPage
├── PortfolioSelector (tabs or dropdown for multiple portfolios)
├── PortfolioActions (Create, Import CSV, Export)
├── PortfolioSummaryCard
│   ├── TotalValue (animated counter)
│   ├── TotalGainLoss (color-coded)
│   ├── DayChange
│   └── BenchmarkComparison (vs SPY)
├── PerformanceChart
│   ├── PortfolioLine (primary)
│   ├── BenchmarkLine (secondary, dashed)
│   ├── TimeRangeSelector (1W, 1M, 3M, 6M, 1Y, YTD, Max)
│   └── GainLossAnnotations
├── AllocationSection
│   ├── AllocationDonut (sector)
│   ├── AllocationDonut (geography)
│   ├── AllocationDonut (asset type)
│   └── DiversificationScore (0-100 gauge)
├── HoldingsTable
│   ├── TableHeader (sortable columns)
│   ├── HoldingRow[]
│   │   ├── SymbolCell (logo + ticker + name)
│   │   ├── QuantityCell
│   │   ├── AvgCostCell
│   │   ├── CurrentPriceCell (real-time)
│   │   ├── MarketValueCell
│   │   ├── GainLossCell ($ and %, color-coded)
│   │   ├── WeightCell (% of portfolio)
│   │   ├── DayChangeCell
│   │   └── ActionsCell (edit, remove, view)
│   └── TableFooter (totals row)
├── DividendSection
│   ├── DividendCalendar (upcoming)
│   ├── DividendHistory (monthly income bar chart)
│   └── AnnualYield
└── RiskSection
    ├── RiskMetricsGrid (beta, Sharpe, VaR, drawdown)
    ├── CorrelationHeatmap
    └── ConcentrationWarnings
```

### 3.6 Screener Components

```
ScreenerPage
├── ScreenerHeader
│   ├── PresetSelector (dropdown: Value, Growth, Dividend, etc.)
│   ├── SaveButton
│   └── ResetButton
├── FilterPanel
│   ├── FilterSection (Fundamental)
│   │   ├── FilterRow (P/E: min–max slider)
│   │   ├── FilterRow (Revenue Growth: min–max)
│   │   ├── FilterRow (ROE: min)
│   │   └── AddFilterButton
│   ├── FilterSection (Technical)
│   │   ├── FilterRow (RSI: range)
│   │   ├── FilterRow (Above SMA 200: toggle)
│   │   └── AddFilterButton
│   ├── FilterSection (Other)
│   │   ├── FilterRow (Market Cap: range)
│   │   ├── FilterRow (Sector: multi-select)
│   │   └── FilterRow (Exchange: multi-select)
│   └── ApplyFiltersButton (with result count preview)
├── ResultsPanel
│   ├── ResultsHeader (X matches found, sort control)
│   ├── ResultsTable
│   │   ├── HeaderRow (sortable, configurable columns)
│   │   └── StockRow[] (clickable → stock detail)
│   ├── Pagination
│   └── ExportButton (CSV)
└── AIInsight (optional: "Based on your filters, here's what I notice...")
```

---

## 4. State Management Architecture

### 4.1 Zustand Stores

```typescript
// Store decomposition — separate stores for separate concerns

// 1. Auth Store
interface AuthStore {
  user: User | null;
  tier: UserTier;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

// 2. UI Store (layout, theme, modals)
interface UIStore {
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  activeModal: string | null;
  commandPaletteOpen: boolean;
  setTheme: (theme: string) => void;
  toggleSidebar: () => void;
  openModal: (id: string) => void;
  closeModal: () => void;
}

// 3. Real-Time Quotes Store (WebSocket-fed)
interface QuotesStore {
  quotes: Map<string, Quote>;
  subscriptions: Set<string>;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  updateQuote: (symbol: string, quote: Quote) => void;
}

// 4. AI Chat Store
interface AIChatStore {
  conversations: ConversationSummary[];
  activeConversation: Conversation | null;
  isStreaming: boolean;
  streamingContent: string;
  sendMessage: (message: string, context?: ChatContext) => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  newConversation: () => void;
}

// 5. Watchlist Store
interface WatchlistStore {
  watchlists: Watchlist[];
  activeWatchlist: string;
  addSymbol: (watchlistId: string, symbol: string) => void;
  removeSymbol: (watchlistId: string, symbol: string) => void;
}

// 6. Notification Store
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
}
```

### 4.2 TanStack Query — Server State

```typescript
// Query keys factory (consistent, type-safe)
export const queryKeys = {
  market: {
    quote: (symbol: string) => ['market', 'quote', symbol] as const,
    bars: (symbol: string, timeframe: string, range: string) =>
      ['market', 'bars', symbol, timeframe, range] as const,
    fundamentals: (symbol: string) => ['market', 'fundamentals', symbol] as const,
    search: (query: string) => ['market', 'search', query] as const,
    indicators: (symbol: string, indicators: string[]) =>
      ['market', 'indicators', symbol, ...indicators] as const,
  },
  portfolio: {
    all: () => ['portfolios'] as const,
    detail: (id: string) => ['portfolios', id] as const,
    performance: (id: string, range: string) => ['portfolios', id, 'performance', range] as const,
    risk: (id: string) => ['portfolios', id, 'risk'] as const,
  },
  screener: {
    results: (filters: ScreenerFilter[]) => ['screener', 'results', filters] as const,
    presets: () => ['screener', 'presets'] as const,
    saved: () => ['screener', 'saved'] as const,
  },
  ai: {
    conversations: () => ['ai', 'conversations'] as const,
    conversation: (id: string) => ['ai', 'conversation', id] as const,
  },
  alerts: {
    all: () => ['alerts'] as const,
    history: () => ['alerts', 'history'] as const,
  },
  news: {
    feed: (params: NewsParams) => ['news', 'feed', params] as const,
  },
} as const;

// Stale time configuration per data type
export const staleTimeConfig = {
  quotes: 15_000,         // 15 seconds (real-time via WS anyway)
  bars: 60_000,           // 1 minute
  fundamentals: 3600_000, // 1 hour (quarterly data)
  portfolio: 30_000,      // 30 seconds
  news: 60_000,           // 1 minute
  screener: 300_000,      // 5 minutes
  aiConversations: 0,     // Always fresh
};
```

---

## 5. Real-Time Architecture (WebSocket)

```typescript
// WebSocket connection manager with auto-reconnect
class WebSocketManager {
  private socket: Socket;
  private subscriptions: Map<string, Set<(data: any) => void>>;

  connect(token: string): void {
    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    this.socket.on('quote:update', (data: QuoteUpdate) => {
      // Update Zustand quotes store
      useQuotesStore.getState().updateQuote(data.symbol, data);
      // Invalidate TanStack Query if significantly stale
    });

    this.socket.on('alert:triggered', (data: AlertTrigger) => {
      useNotificationStore.getState().addNotification(data);
      toast.info(`Alert: ${data.ruleName}`);
    });

    this.socket.on('portfolio:updated', (data: PortfolioUpdate) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all() });
    });
  }

  subscribeQuotes(symbols: string[]): void {
    this.socket.emit('subscribe:quotes', { symbols });
  }

  unsubscribeQuotes(symbols: string[]): void {
    this.socket.emit('unsubscribe:quotes', { symbols });
  }
}
```

---

## 6. Chart Architecture

### 6.1 Price Chart (TradingView Lightweight Charts)

```typescript
// Wrapper component with full indicator support
interface PriceChartProps {
  symbol: string;
  timeframe: Timeframe;
  chartType: 'candlestick' | 'line' | 'area';
  indicators: IndicatorConfig[];
  height: number;
  interactive: boolean;          // Crosshair, zoom, pan
  showVolume: boolean;
  annotations?: ChartAnnotation[];
}

// Indicator overlay system
interface IndicatorConfig {
  id: string;
  type: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BOLLINGER' | 'VWAP' | 'ICHIMOKU';
  params: Record<string, number>;
  color: string;
  visible: boolean;
  pane: 'overlay' | 'below';    // Overlay on price or separate pane
}
```

### 6.2 Portfolio Visualization (Recharts)

```
Chart Components:
  - AllocationDonut       → Pie/Donut (sector, geo, type)
  - PerformanceLineChart  → Line (portfolio vs benchmark over time)
  - DividendBarChart      → Bar (monthly dividend income)
  - RiskReturnScatter     → Scatter (each holding: risk vs return)
  - CorrelationHeatmap    → Custom Heatmap (holding × holding)
  - DrawdownChart         → Area (negative: peak-to-trough)
  - MonteCarloFan         → Area (probability cones, 5th–95th percentile)
```

---

## 7. Design System

### 7.1 Color Palette

```css
/* Semantic colors (CSS variables) */
--color-gain: #10B981;          /* Green — positive returns */
--color-loss: #EF4444;          /* Red — negative returns */
--color-neutral: #6B7280;       /* Gray — unchanged */
--color-primary: #3B82F6;       /* Blue — actions, links */
--color-warning: #F59E0B;       /* Amber — warnings, caution */
--color-info: #06B6D4;          /* Cyan — informational */

/* Confidence score colors */
--confidence-high: #10B981;     /* 70-100: green */
--confidence-medium: #F59E0B;   /* 40-69: amber */
--confidence-low: #EF4444;      /* 0-39: red */

/* Chart colors (color-blind safe) */
--chart-1: #3B82F6;             /* Primary series */
--chart-2: #8B5CF6;             /* Secondary */
--chart-3: #EC4899;             /* Tertiary */
--chart-4: #F97316;             /* Quaternary */
--chart-5: #06B6D4;             /* Quinary */
```

### 7.2 Typography Scale

```css
--text-xs: 0.75rem;    /* 12px — labels, badges */
--text-sm: 0.875rem;   /* 14px — secondary text, table cells */
--text-base: 1rem;     /* 16px — body text */
--text-lg: 1.125rem;   /* 18px — card titles */
--text-xl: 1.25rem;    /* 20px — section headers */
--text-2xl: 1.5rem;    /* 24px — page titles */
--text-3xl: 1.875rem;  /* 30px — hero numbers (portfolio value) */
--text-4xl: 2.25rem;   /* 36px — large displays (current price) */

/* Monospace for numbers/data */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### 7.3 Responsive Breakpoints (Tailwind)

```
sm: 640px   — Mobile landscape / small tablets
md: 768px   — Tablets
lg: 1024px  — Laptops
xl: 1280px  — Desktops
2xl: 1536px — Large monitors

Layout behavior:
  < md:  Single column, bottom nav, full-width cards
  md-lg: Two columns, collapsible sidebar, stacked panels
  ≥ lg:  Full layout, persistent sidebar, multi-panel
  ≥ xl:  Full layout + additional context panels
```

---

## 8. Performance Optimization

### 8.1 Code Splitting Strategy

```
Route-based splitting (automatic with Next.js App Router):
  - Each page is a separate chunk
  - Shared layout components in common chunk

Component-level splitting (dynamic import):
  - AdvancedChart (heavy TradingView lib): lazy loaded
  - BacktestBuilder (complex drag-and-drop): lazy loaded
  - CorrelationHeatmap (D3-based): lazy loaded
  - MonteCarloVisualization: lazy loaded
  - PDFExporter: lazy loaded on demand

Library splitting:
  - Chart libraries loaded only on pages that use them
  - Socket.IO loaded only after auth (not on login page)
```

### 8.2 Data Loading Patterns

```typescript
// Parallel data fetching with React Suspense
// Stock detail page loads all data in parallel:
async function StockPage({ params }: { params: { symbol: string } }) {
  const [quote, fundamentals, news] = await Promise.all([
    getQuote(params.symbol),
    getFundamentals(params.symbol),
    getNews({ symbols: [params.symbol], limit: 5 }),
  ]);

  return (
    <>
      <StockHeader quote={quote} />
      <Suspense fallback={<ChartSkeleton />}>
        <PriceChartSection symbol={params.symbol} />
      </Suspense>
      <KeyMetrics fundamentals={fundamentals} />
      <Suspense fallback={<NewsSkeleton />}>
        <NewsSection articles={news} />
      </Suspense>
    </>
  );
}
```

### 8.3 Bundle Size Targets

| Chunk | Target (gzipped) |
|-------|-------------------|
| Initial JS | < 100KB |
| Route chunks (avg) | < 50KB |
| Chart library (lazy) | < 80KB |
| Total CSS | < 30KB |
| Total (FCP) | < 150KB |

---

## 9. Accessibility (WCAG 2.1 AA)

### 9.1 Key Requirements

```
- All interactive elements: keyboard focusable (tab order)
- Focus indicators: visible 3px ring on all focusable elements
- Color contrast: ≥ 4.5:1 text, ≥ 3:1 large text/graphics
- Charts: data table alternative available (toggle)
- Price changes: not conveyed by color alone (▲▼ arrows + text)
- Announcements: aria-live regions for real-time updates
- Skip navigation: link to main content
- Reduced motion: respect prefers-reduced-motion
- Screen reader: all images have alt text, ARIA labels on icons
```

### 9.2 Chart Accessibility

```typescript
// Every chart has a toggleable data table view
interface AccessibleChartProps {
  data: ChartDataPoint[];
  chartComponent: React.ReactNode;
  tableColumns: Column[];
  ariaLabel: string;
  description: string;
}

function AccessibleChart({ data, chartComponent, tableColumns, ariaLabel, description }: AccessibleChartProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div role="figure" aria-label={ariaLabel} aria-describedby="chart-desc">
      <p id="chart-desc" className="sr-only">{description}</p>
      <button onClick={() => setShowTable(!showTable)} aria-pressed={showTable}>
        {showTable ? 'Show Chart' : 'Show Data Table'}
      </button>
      {showTable ? <DataTable columns={tableColumns} data={data} /> : chartComponent}
    </div>
  );
}
```

---

## 10. PWA Configuration

```json
// next.config.js — PWA plugin configuration
{
  "name": "InvestorIQ",
  "short_name": "InvestorIQ",
  "description": "AI-powered investment co-pilot",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#3B82F6",
  "background_color": "#0F172A",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}

// Service Worker strategy:
// - Cache-first for static assets (JS, CSS, images)
// - Network-first for API calls (fall back to cached data if offline)
// - Background sync for portfolio updates when reconnected
```

---

*End of Frontend Component Architecture Document*
