import { ComingSoon } from '@/components/coming-soon';

export default function SmartPicksPage() {
  return (
    <ComingSoon
      featureName="Smart Picks"
      description="AI-powered stock recommendations based on your risk profile and portfolio gaps. This feature requires a real scoring model trained on historical data — not hardcoded suggestions."
      requirements={[
        'Real-time price data API (Alpha Vantage connected but needs historical)',
        'Trained scoring model on 3+ years of data (Python backend)',
        'Backtested accuracy validation (currently no real backtest exists)',
        'Risk-profile-aware filtering (needs real user portfolio data)',
      ]}
    />
  );
}
