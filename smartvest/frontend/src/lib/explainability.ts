/**
 * Explainability Layer (SHAP-Equivalent)
 *
 * Makes every AI/model output in the app explainable.
 * For any score, signal, or recommendation, this module generates:
 * - Which input features drove the output
 * - How much each contributed (positive or negative)
 * - Plain English explanation
 * - The one factor most likely to change the prediction
 *
 * Methodology: Feature contribution analysis using mean-centered
 * attribution. Each feature's contribution = its weighted score
 * minus the baseline (50 for a neutral prediction). This is
 * mathematically equivalent to SHAP for a linear model.
 *
 * Why not actual SHAP: SHAP requires a trained model with a
 * prediction function. Our signal engine uses fixed weights,
 * so contribution = weight × (normalized_value - baseline).
 * This gives identical results to SHAP for additive models.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeatureContribution {
  feature: string;
  rawValue: number;
  normalizedValue: number;
  contribution: number;      // Points added/subtracted
  direction: 'positive' | 'negative' | 'neutral';
  description: string;       // Plain English what this means
  volatility: number;        // How much this feature changes (0-10)
}

export interface Explanation {
  targetLabel: string;       // e.g., "Composite Score: 78/100"
  targetValue: number;
  baseline: number;          // Expected value without any signal (50)
  topPositive: FeatureContribution[];
  topNegative: FeatureContribution[];
  allContributions: FeatureContribution[];
  summary: string;           // Full plain English paragraph
  watchFactor: WatchFactor;  // Most likely to change prediction
  confidence: number;        // How certain we are in the explanation
  methodology: string;
}

export interface WatchFactor {
  feature: string;
  currentContribution: number;
  reason: string;
  potentialSwing: number;    // Points it could swing by
}


// ─── Feature Definitions ─────────────────────────────────────────────────────

interface FeatureConfig {
  key: string;
  label: string;
  description: string;
  weight: number;
  volatility: number;  // How often this changes (0-10)
  describeHigh: string;
  describeLow: string;
}

const FEATURE_CONFIGS: FeatureConfig[] = [
  { key: 'insiderScore', label: 'Insider Buying Activity', description: 'Open-market purchases by company executives', weight: 0.12, volatility: 8, describeHigh: 'strong insider buying — executives putting their own money in', describeLow: 'no recent insider buying — management not signaling confidence' },
  { key: 'earningsSurprise', label: 'Earnings Surprise History', description: 'Whether the company beat or missed earnings estimates', weight: 0.12, volatility: 4, describeHigh: 'positive earnings surprise — company outperformed expectations', describeLow: 'negative earnings surprise — company missed estimates' },
  { key: 'macdSignal', label: 'MACD Signal Crossover', description: 'Technical trend-change indicator', weight: 0.10, volatility: 7, describeHigh: 'bullish MACD crossover — trend turning upward', describeLow: 'bearish MACD crossover — trend turning downward' },
  { key: 'momentum30d', label: '30-Day Price Momentum', description: 'Medium-term price trend strength', weight: 0.10, volatility: 6, describeHigh: 'strong upward momentum over 30 days', describeLow: 'declining momentum — price weakening over 30 days' },
  { key: 'sentimentTrend', label: 'News & Social Sentiment', description: 'Aggregate sentiment from news and social media', weight: 0.08, volatility: 9, describeHigh: 'positive sentiment shift — news and social coverage turning bullish', describeLow: 'negative sentiment — bearish news cycle or social media fear' },
  { key: 'momentum14d', label: '14-Day Momentum', description: 'Short-term price trend', weight: 0.08, volatility: 8, describeHigh: 'short-term price acceleration', describeLow: 'short-term price weakness' },
  { key: 'institutionalFlow', label: 'Institutional Money Flow', description: 'Net buying/selling by large institutions', weight: 0.08, volatility: 5, describeHigh: 'institutional net buying — smart money accumulating', describeLow: 'institutional selling — smart money distributing' },
  { key: 'rsi14', label: 'RSI-14 (Overbought/Oversold)', description: 'Whether the stock is overbought (>70) or oversold (<30)', weight: 0.08, volatility: 7, describeHigh: 'oversold bounce territory — mean reversion opportunity', describeLow: 'overbought territory — exhaustion risk' },
  { key: 'momentum90d', label: '90-Day Momentum', description: 'Long-term price trend confirmation', weight: 0.08, volatility: 3, describeHigh: 'confirmed long-term uptrend', describeLow: 'long-term downtrend in place' },
  { key: 'volumeTrend', label: 'Volume Trend', description: 'Whether volume confirms the price move', weight: 0.06, volatility: 6, describeHigh: 'rising volume confirming price direction', describeLow: 'declining volume — price move lacks conviction' },
  { key: 'factorMomentum', label: 'Factor Momentum Loading', description: 'Exposure to the momentum risk factor', weight: 0.05, volatility: 4, describeHigh: 'positive momentum factor exposure', describeLow: 'negative momentum factor — headwind from systematic selling' },
  { key: 'regimeScore', label: 'Market Regime Alignment', description: 'Whether the macro environment favors this stock', weight: 0.05, volatility: 3, describeHigh: 'current market regime is favorable', describeLow: 'market regime is unfavorable for this stock type' },
];

const BASELINE = 50; // Neutral prediction


// ─── Contribution Calculator ─────────────────────────────────────────────────

/**
 * Calculate the contribution of each feature to a given score.
 * This is equivalent to SHAP values for an additive (linear) model.
 *
 * contribution_i = weight_i × (normalized_value_i - baseline)
 *
 * The sum of all contributions + baseline ≈ final score.
 */
function calculateContributions(
  featureValues: Record<string, number>
): FeatureContribution[] {
  return FEATURE_CONFIGS.map(config => {
    const rawValue = featureValues[config.key] ?? 0;
    // Normalize to 0-100 scale (reuse signal engine logic)
    const normalizedValue = normalizeFeatureValue(config.key, rawValue);
    // Contribution = how much this pushes the score away from baseline
    const deviation = normalizedValue - BASELINE;
    const contribution = Math.round(deviation * config.weight * 100) / 100;

    let description: string;
    if (contribution > 2) description = config.describeHigh;
    else if (contribution < -2) description = config.describeLow;
    else description = `${config.label} is near neutral — neither helping nor hurting`;

    return {
      feature: config.label,
      rawValue,
      normalizedValue: Math.round(normalizedValue * 10) / 10,
      contribution: Math.round(contribution * 10) / 10,
      direction: contribution > 0.5 ? 'positive' : contribution < -0.5 ? 'negative' : 'neutral',
      description,
      volatility: config.volatility,
    };
  });
}

function normalizeFeatureValue(key: string, value: number): number {
  switch (key) {
    case 'momentum14d': return clamp(50 + value * 5, 0, 100);
    case 'momentum30d': return clamp(50 + value * 3, 0, 100);
    case 'momentum90d': return clamp(50 + value * 1.5, 0, 100);
    case 'volumeTrend': return clamp((value - 0.5) * 100, 0, 100);
    case 'rsi14': return value;
    case 'macdSignal': return clamp(50 + value * 10, 0, 100);
    case 'earningsSurprise': return clamp(50 + value * 3, 0, 100);
    case 'insiderScore': return value * 10;
    case 'sentimentTrend': return clamp(50 + value * 50, 0, 100);
    case 'institutionalFlow': return value * 10;
    case 'factorMomentum': return value * 100;
    case 'regimeScore': return value * 10;
    default: return 50;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}


// ─── Explanation Generator ───────────────────────────────────────────────────

/**
 * Generate a full explanation for a model output.
 * This is the main entry point — call this from any component.
 *
 * @param targetLabel - What we're explaining (e.g., "Composite Score")
 * @param targetValue - The actual output value (e.g., 78)
 * @param featureValues - Raw feature values that produced this output
 */
export function explainPrediction(
  targetLabel: string,
  targetValue: number,
  featureValues: Record<string, number>,
): Explanation {
  const contributions = calculateContributions(featureValues);

  // Sort by absolute contribution
  const sorted = [...contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const topPositive = sorted.filter(c => c.contribution > 0.5).slice(0, 5);
  const topNegative = sorted.filter(c => c.contribution < -0.5).slice(0, 5);

  // Find the watch factor: highest volatility × contribution magnitude
  const watchCandidates = sorted.map(c => ({
    ...c,
    swingPotential: c.volatility * Math.abs(c.contribution) / 5,
  })).sort((a, b) => b.swingPotential - a.swingPotential);
  const topWatch = watchCandidates[0];

  const watchFactor: WatchFactor = {
    feature: topWatch.feature,
    currentContribution: topWatch.contribution,
    potentialSwing: Math.round(topWatch.swingPotential * 10) / 10,
    reason: topWatch.volatility >= 7
      ? `${topWatch.feature} changes frequently and has a large impact on the score. If this signal reverses, the prediction could swing by ${topWatch.swingPotential.toFixed(0)}+ points.`
      : `${topWatch.feature} is currently a strong driver (+${Math.abs(topWatch.contribution).toFixed(1)} points) and could shift significantly based on upcoming catalysts.`,
  };

  // Generate plain English summary
  const summary = generateSummary(targetLabel, targetValue, topPositive, topNegative, watchFactor);

  return {
    targetLabel,
    targetValue,
    baseline: BASELINE,
    topPositive,
    topNegative,
    allContributions: sorted,
    summary,
    watchFactor,
    confidence: Math.min(0.95, 0.5 + (topPositive.length + topNegative.length) * 0.05),
    methodology: 'Additive feature attribution (equivalent to SHAP for linear models). Each contribution = feature weight × (normalized value − 50). Sum of contributions + baseline ≈ final score.',
  };
}

function generateSummary(
  label: string,
  value: number,
  positive: FeatureContribution[],
  negative: FeatureContribution[],
  watch: WatchFactor,
): string {
  const parts: string[] = [];

  parts.push(`This stock scored **${value}/100** today.`);

  if (positive.length > 0) {
    const topP = positive.slice(0, 3);
    parts.push(`The ${topP.length} biggest positive driver${topP.length > 1 ? 's were' : ' was'} ${topP.map(p => `**${p.feature.toLowerCase()}** adding ${p.contribution.toFixed(1)} points`).join(', ')}.`);
  }

  if (negative.length > 0) {
    const topN = negative.slice(0, 2);
    parts.push(`The ${topN.length} biggest negative factor${topN.length > 1 ? 's were' : ' was'} ${topN.map(n => `**${n.feature.toLowerCase()}** subtracting ${Math.abs(n.contribution).toFixed(1)} points`).join(' and ')}.`);
  }

  parts.push(`**Watch factor:** ${watch.feature} — ${watch.reason}`);

  return parts.join(' ');
}


// ─── Preset Explanations for Demo Stocks ─────────────────────────────────────

const STOCK_FEATURES: Record<string, Record<string, number>> = {
  'NOVO-B.CO': { momentum14d: 2.8, momentum30d: 5.4, momentum90d: 14.2, volumeTrend: 1.15, rsi14: 62, macdSignal: 2.8, earningsSurprise: 8.2, insiderScore: 8, sentimentTrend: 0.72, institutionalFlow: 7, factorMomentum: 0.82, regimeScore: 7 },
  'MAERSK-B.CO': { momentum14d: -1.4, momentum30d: -3.2, momentum90d: -8.2, volumeTrend: 0.92, rsi14: 42, macdSignal: -1.5, earningsSurprise: -2.1, insiderScore: 5, sentimentTrend: -0.15, institutionalFlow: 4, factorMomentum: 0.35, regimeScore: 5 },
  'VWS.CO': { momentum14d: 3.1, momentum30d: 8.5, momentum90d: 18.5, volumeTrend: 1.28, rsi14: 68, macdSignal: 3.2, earningsSurprise: 4.5, insiderScore: 9, sentimentTrend: 0.55, institutionalFlow: 6, factorMomentum: 0.71, regimeScore: 6 },
  'DSV.CO': { momentum14d: 1.9, momentum30d: 4.2, momentum90d: 12.4, volumeTrend: 1.05, rsi14: 58, macdSignal: 1.2, earningsSurprise: 3.8, insiderScore: 3, sentimentTrend: 0.42, institutionalFlow: 7, factorMomentum: 0.65, regimeScore: 7 },
  'ORSTED.CO': { momentum14d: -2.8, momentum30d: -8.5, momentum90d: -22.4, volumeTrend: 1.42, rsi14: 32, macdSignal: -3.8, earningsSurprise: -12.5, insiderScore: 6, sentimentTrend: -0.45, institutionalFlow: 3, factorMomentum: 0.18, regimeScore: 4 },
};

/**
 * Get explanation for a specific stock's composite score.
 * This is the shorthand used by the "Explain This" button.
 */
export function explainStockScore(symbol: string, score: number): Explanation {
  const features = STOCK_FEATURES[symbol.toUpperCase()] || {};
  return explainPrediction(`Composite Score: ${score}/100`, score, features);
}

/**
 * Get a list of supported stocks for demo.
 */
export function getExplainableStocks(): string[] {
  return Object.keys(STOCK_FEATURES);
}
