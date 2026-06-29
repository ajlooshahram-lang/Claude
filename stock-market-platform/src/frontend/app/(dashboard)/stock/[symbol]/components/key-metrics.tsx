'use client';

interface Quote {
  symbol: string;
  price: number;
  marketCap: number;
  [key: string]: any;
}

// Mock fundamental metrics (production: fetched from /market/fundamentals/:symbol)
const MOCK_FUNDAMENTALS = {
  peRatio: 31.2,
  forwardPe: 28.8,
  pegRatio: 1.95,
  evEbitda: 24.3,
  dividendYield: 0.52,
  eps: 6.36,
  revenueGrowth: 4.8,
  roe: 147.0,
  netMargin: 25.3,
  debtEquity: 1.87,
  freeCashFlow: 101_200_000_000,
  beta: 1.24,
};

export function KeyMetrics({ quote }: { quote: Quote }) {
  const metrics = MOCK_FUNDAMENTALS;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Key Metrics
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="P/E Ratio" value={metrics.peRatio.toFixed(1)} tooltip="Price-to-Earnings: how much investors pay per $1 of earnings" />
        <MetricCard label="Forward P/E" value={metrics.forwardPe.toFixed(1)} tooltip="P/E based on next year's estimated earnings" />
        <MetricCard label="PEG Ratio" value={metrics.pegRatio.toFixed(2)} tooltip="P/E divided by growth rate. Below 1 = potentially undervalued" />
        <MetricCard label="EV/EBITDA" value={metrics.evEbitda.toFixed(1)} tooltip="Enterprise Value to EBITDA. Lower = potentially cheaper" />
        <MetricCard label="Dividend Yield" value={`${metrics.dividendYield.toFixed(2)}%`} tooltip="Annual dividend as % of stock price" />
        <MetricCard label="EPS" value={`$${metrics.eps.toFixed(2)}`} tooltip="Earnings Per Share (TTM)" />
        <MetricCard label="Revenue Growth" value={`${metrics.revenueGrowth.toFixed(1)}%`} tooltip="Year-over-year revenue growth rate" />
        <MetricCard label="ROE" value={`${metrics.roe.toFixed(0)}%`} tooltip="Return on Equity: profit generated per dollar of equity" />
        <MetricCard label="Net Margin" value={`${metrics.netMargin.toFixed(1)}%`} tooltip="Net income as % of revenue" />
        <MetricCard label="Debt/Equity" value={metrics.debtEquity.toFixed(2)} tooltip="Total debt divided by shareholder equity" />
        <MetricCard label="FCF" value={`$${(metrics.freeCashFlow / 1e9).toFixed(1)}B`} tooltip="Free Cash Flow: cash after capital expenditures" />
        <MetricCard label="Beta" value={metrics.beta.toFixed(2)} tooltip="Volatility vs. market. >1 = more volatile than S&P 500" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  return (
    <div className="group relative rounded-lg border border-border/50 bg-muted/30 p-3 transition-colors hover:bg-muted/60" title={tooltip}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold font-tabular">{value}</p>
    </div>
  );
}
