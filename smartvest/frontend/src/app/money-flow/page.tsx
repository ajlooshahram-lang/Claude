import { ComingSoon } from '@/components/coming-soon';

export default function MoneyFlowPage() {
  return (
    <ComingSoon
      featureName="Money Flow Tracking"
      description="Tracks institutional buying and selling to show where large funds are deploying capital. This data comes from paid institutional data feeds that are not currently connected."
      requirements={[
        'Institutional flow data feed (Refinitiv, Bloomberg, or similar — $2,000+/mo)',
        '13F filing parser (SEC EDGAR — free but quarterly, 45-day delay)',
        'Dark pool volume data (Polygon or IEX Cloud)',
        'Real-time flow aggregation vs historical baseline',
      ]}
    />
  );
}
