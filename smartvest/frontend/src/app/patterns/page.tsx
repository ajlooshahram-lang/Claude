import { ComingSoon } from '@/components/coming-soon';

export default function PatternsPage() {
  return (
    <ComingSoon
      featureName="Pattern Recognition"
      description="Automatically identifies technical chart patterns (head and shoulders, double bottoms, etc.) and their historical reliability. This requires real candlestick data and a validated pattern detection algorithm."
      requirements={[
        'Real intraday/daily candlestick data (OHLCV)',
        'Pattern detection algorithm validated on historical data',
        'Statistical significance testing for each pattern',
        'False positive rate disclosure (most patterns fail >50% of the time)',
      ]}
    />
  );
}
