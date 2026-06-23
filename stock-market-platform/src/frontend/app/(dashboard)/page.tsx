import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">Good morning</h1>
        <p className="text-muted-foreground">Here&apos;s your market overview for today.</p>
      </div>

      {/* Market indices */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IndexCard name="S&P 500" value="5,234.18" change="+0.87%" positive />
        <IndexCard name="NASDAQ" value="16,742.39" change="+1.24%" positive />
        <IndexCard name="DOW" value="39,512.84" change="-0.12%" positive={false} />
        <IndexCard name="Russell 2000" value="2,089.45" change="+0.53%" positive />
      </div>

      {/* Portfolio snapshot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Portfolio Performance</h2>
          <div className="flex items-baseline gap-4 mb-6">
            <span className="text-3xl font-bold font-tabular">$127,432.18</span>
            <span className="text-gain text-sm font-medium">+$2,341.56 (+1.87%) today</span>
          </div>
          <div className="h-64 flex items-center justify-center rounded-lg bg-muted/50">
            <p className="text-muted-foreground">Performance chart renders here</p>
          </div>
        </div>

        {/* AI Insights */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            AI Insights
          </h2>
          <div className="space-y-4">
            <InsightCard
              title="Portfolio Health"
              description="Your portfolio is well-diversified across 8 sectors. Consider adding international exposure."
              type="info"
            />
            <InsightCard
              title="Earnings Alert"
              description="MSFT reports earnings on Thursday. Your position represents 12% of portfolio."
              type="warning"
            />
            <InsightCard
              title="Opportunity"
              description="3 stocks in your watchlist hit their target entry zones today."
              type="success"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function IndexCard({ name, value, change, positive }: {
  name: string; value: string; change: string; positive: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{name}</p>
      <p className="text-xl font-semibold font-tabular mt-1">{value}</p>
      <div className={`flex items-center gap-1 mt-1 text-sm ${positive ? 'text-gain' : 'text-loss'}`}>
        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span className="font-tabular">{change}</span>
      </div>
    </div>
  );
}

function InsightCard({ title, description, type }: {
  title: string; description: string; type: 'info' | 'warning' | 'success';
}) {
  const colors = {
    info: 'border-l-primary',
    warning: 'border-l-yellow-500',
    success: 'border-l-green-500',
  };
  return (
    <div className={`border-l-4 ${colors[type]} rounded-r-lg bg-muted/50 p-3`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
