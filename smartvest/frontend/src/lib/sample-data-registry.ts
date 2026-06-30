/**
 * Sample Data Registry
 *
 * Tracks which pages/features use sample data and what feed
 * would make them real. Used by the SampleDataBanner component
 * to display honest labels on every affected page.
 *
 * When a real data source is connected, remove the entry from
 * this registry and the label disappears automatically.
 */

export interface SampleDataEntry {
  path: string;
  feedName: string;
  description: string;
  realWhen: string;  // What needs to happen to make this real
}

/**
 * Every page that currently shows hardcoded/sample data.
 * When a feed is connected, remove its entry here.
 */
export const SAMPLE_DATA_PAGES: SampleDataEntry[] = [
  { path: '/sectors', feedName: 'Sector ETF prices', description: 'Sector performance numbers are sample data', realWhen: 'Connect price API for XLK, XLV, XLF, XLE, etc.' },
  { path: '/compare', feedName: 'Stock fundamentals', description: 'Comparison metrics are sample data', realWhen: 'Connect Financial Modeling Prep or similar fundamentals API' },
  { path: '/performance', feedName: 'Historical portfolio NAV', description: 'Attribution numbers are sample data', realWhen: 'Store daily portfolio value in database + real benchmark prices' },
  { path: '/competitors', feedName: 'Competitor financials', description: 'Revenue, margins, P/E are sample data', realWhen: 'Connect fundamentals API (Financial Modeling Prep free tier available)' },
  { path: '/insiders', feedName: 'SEC/PDMR filings', description: 'Insider transactions are sample data', realWhen: 'Connect SEC EDGAR API (free) or OpenInsider' },
  { path: '/nordic', feedName: 'Nordic exchange prices', description: 'Stock prices and index values are sample data', realWhen: 'Connect Nasdaq Nordic data feed or compatible price API' },
  { path: '/news', feedName: 'News articles', description: 'News stories are sample data', realWhen: 'Connect NewsAPI ($99/mo) or Finnhub (free tier available)' },
  { path: '/alt-data', feedName: 'Alternative data feeds', description: 'Google Trends, web traffic, app ranks, job postings are sample data', realWhen: 'Connect SerpApi ($50/mo), SimilarWeb, AppFollow, Indeed scraping' },
  { path: '/order-book', feedName: 'Level 2 market data', description: 'Order book snapshots are simulated', realWhen: 'Connect Polygon Level 2 ($200/mo) or broker API' },
  { path: '/anomalies', feedName: 'Real-time signal feeds', description: 'Signal readings are sample data', realWhen: 'Connect all 15 signal sources (price, volume, sentiment, etc.)' },
  { path: '/predictions', feedName: 'Historical signal data', description: 'Signal values are sample data. Backtested accuracy numbers are estimated, not validated.', realWhen: 'Compute signals from real price/volume data + validate accuracy on holdout set' },
  { path: '/scenarios', feedName: 'Calibrated sensitivity factors', description: 'Asset sensitivities are estimated, not calibrated on real data', realWhen: 'Calibrate factor betas from 5+ years of daily returns (Python backend)' },
  { path: '/benchmark', feedName: 'Historical index data', description: 'Monthly benchmark returns are generated, not from real OMXC25/pension data', realWhen: 'Connect historical OMXC25, MSCI World, ATP pension, and CPI data' },
  { path: '/reports', feedName: 'Portfolio market data', description: 'Numbers inside reports are sample data', realWhen: 'Connect price API + store real portfolio history in database' },
  { path: '/ai-chat', feedName: 'Live portfolio data', description: 'Answers based on demo portfolio, not your real holdings', realWhen: 'Query real holdings from Supabase database + live prices' },
  { path: '/crash-sim', feedName: 'User portfolio data', description: 'Applies real historical drawdowns to sample portfolio', realWhen: 'Run against your actual holdings stored in database' },
];

/**
 * Check if a given path has sample data.
 */
export function hasSampleData(path: string): SampleDataEntry | null {
  return SAMPLE_DATA_PAGES.find(p => path === p.path || path.startsWith(p.path + '/')) || null;
}

/**
 * Get all pages with sample data (for admin/audit purposes).
 */
export function getAllSampleDataPages(): SampleDataEntry[] {
  return SAMPLE_DATA_PAGES;
}
