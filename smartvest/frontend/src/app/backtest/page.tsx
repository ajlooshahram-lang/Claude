import { ComingSoon } from '@/components/coming-soon';

export default function BacktestPage() {
  return (
    <ComingSoon
      featureName="Strategy Backtesting"
      description="Test investment strategies against historical market data to see how they would have performed. This requires years of actual price history that we do not currently have."
      requirements={[
        '5+ years of daily OHLCV data per stock (database storage needed)',
        'Historical data API — Polygon.io ($200/mo) or Alpha Vantage premium',
        'Walk-forward testing engine (prevents overfitting)',
        'Transaction cost modeling for realistic results',
      ]}
    />
  );
}
