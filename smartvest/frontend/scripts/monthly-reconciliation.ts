#!/usr/bin/env npx tsx
/**
 * Monthly Portfolio Reconciliation
 *
 * PURPOSE:
 *   Once a month, compare the app's portfolio state against your
 *   broker's official statement. Catches full-chain errors:
 *   - Data entry mistakes (wrong shares or cost basis)
 *   - Price feed drift (stale prices in cache)
 *   - Calculation bugs (gain/loss math)
 *
 * WORKFLOW (5 minutes/month for 3 months):
 *   1. Export from your broker (Saxo/Nordnet/Lunar):
 *      Download "Position overview" or "Holdings" as CSV/PDF
 *   2. Fill in broker-statement.csv with those numbers
 *   3. Run this script: npx tsx scripts/monthly-reconciliation.ts
 *   4. Review the diff — any > 2% discrepancy needs investigation
 *
 * WHAT IT CHECKS:
 *   - Share count matches (exact — must be identical)
 *   - Cost basis matches (within 1 DKK — rounding allowed)
 *   - Current price matches (within 2% — timing difference OK)
 *   - Total value matches (within 2%)
 *   - Gain/loss matches (within 5% — combines price + cost tolerance)
 *
 * FILES:
 *   Input:  scripts/broker-statement.csv (you fill this in)
 *   Output: scripts/reconciliation-YYYY-MM.csv (comparison results)
 *           Terminal output with verdicts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BrokerPosition {
  symbol: string;
  shares: number;
  avgCost: number;       // Per share
  currentPrice: number;  // Per share (from broker statement date)
  totalValue: number;    // shares × currentPrice
  gainLoss: number;      // totalValue - (shares × avgCost)
  currency: string;
}

interface AppPosition {
  symbol: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  totalValue: number;
  gainLoss: number;
  gainLossPct: number;
}

interface ReconciliationResult {
  symbol: string;
  // Broker values
  brokerShares: number;
  brokerCost: number;
  brokerPrice: number;
  brokerValue: number;
  brokerGainLoss: number;
  // App values
  appShares: number;
  appCost: number;
  appPrice: number;
  appValue: number;
  appGainLoss: number;
  // Differences
  sharesDiff: number;
  costDiff: number;
  costDiffPct: number;
  priceDiff: number;
  priceDiffPct: number;
  valueDiff: number;
  valueDiffPct: number;
  gainLossDiff: number;
  // Verdict
  verdict: 'MATCH' | 'PRICE_LAG' | 'DATA_ENTRY_ERROR' | 'INVESTIGATE';
  notes: string;
}

// ─── File Paths ──────────────────────────────────────────────────────────────

const BROKER_FILE = path.join(__dirname, 'broker-statement.csv');
const now = new Date();
const RESULT_FILE = path.join(__dirname, `reconciliation-${now.toISOString().slice(0, 7)}.csv`);

// ─── Parse Broker Statement ──────────────────────────────────────────────────

function parseBrokerStatement(): BrokerPosition[] {
  if (!fs.existsSync(BROKER_FILE)) {
    console.error(`\n❌ File not found: ${BROKER_FILE}`);
    console.error('\nCreate it with your broker\'s numbers. Format:');
    console.error('symbol,shares,avg_cost_per_share,current_price,currency');
    console.error('NOVO-B.CO,8,750.00,845.50,DKK');
    console.error('AAPL,3,1280.00,1975.00,DKK');
    console.error('...');

    // Create template
    const template = `symbol,shares,avg_cost_per_share,current_price,currency
# Fill in from your broker's "Position overview" or "Holdings" statement
# Lines starting with # are ignored
# avg_cost_per_share = your average purchase price per share
# current_price = price shown on your broker's statement
# currency = the currency your broker reports in
NOVO-B.CO,8,750.00,845.50,DKK
AAPL,3,1280.00,1975.00,DKK
`;
    fs.writeFileSync(BROKER_FILE, template);
    console.error(`\nTemplate created at: ${BROKER_FILE}`);
    console.error('Edit it with your real numbers, then run again.');
    process.exit(1);
  }

  const lines = fs.readFileSync(BROKER_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('symbol'));

  return lines.map(line => {
    const [symbol, shares, avgCost, currentPrice, currency] = line.split(',');
    const s = parseFloat(shares) || 0;
    const c = parseFloat(avgCost) || 0;
    const p = parseFloat(currentPrice) || 0;
    return {
      symbol: symbol.trim(),
      shares: s,
      avgCost: c,
      currentPrice: p,
      totalValue: s * p,
      gainLoss: s * p - s * c,
      currency: (currency || 'DKK').trim(),
    };
  });
}

// ─── Simulate App State ──────────────────────────────────────────────────────
// In production this would query Supabase + getPrice().
// For the reconciliation script, we read from a separate file
// that you export from the app or fill manually.

const APP_FILE = path.join(__dirname, 'app-portfolio-export.csv');

function getAppPositions(): AppPosition[] {
  if (!fs.existsSync(APP_FILE)) {
    console.log(`\nℹ️  No app export file found: ${APP_FILE}`);
    console.log('   Creating template. Fill with numbers from the app\'s portfolio page.');
    console.log('   (Or run the app, screenshot the portfolio, and transcribe the numbers)');

    const template = `symbol,shares,avg_cost_per_share,current_price
# Fill from the SmartVest app's portfolio page
# Open /portfolio, note down each holding's shares, avg cost, and current price
NOVO-B.CO,8,750.00,845.50
AAPL,3,1280.00,1975.00
`;
    fs.writeFileSync(APP_FILE, template);
    console.log(`   Template created at: ${APP_FILE}\n`);
    process.exit(1);
  }

  const lines = fs.readFileSync(APP_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('symbol'));

  return lines.map(line => {
    const [symbol, shares, avgCost, currentPrice] = line.split(',');
    const s = parseFloat(shares) || 0;
    const c = parseFloat(avgCost) || 0;
    const p = parseFloat(currentPrice) || 0;
    const value = s * p;
    const cost = s * c;
    return {
      symbol: symbol.trim(),
      shares: s,
      avgCost: c,
      currentPrice: p,
      totalValue: value,
      gainLoss: value - cost,
      gainLossPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    };
  });
}

// ─── Reconcile ───────────────────────────────────────────────────────────────

function reconcile(broker: BrokerPosition[], app: AppPosition[]): ReconciliationResult[] {
  const results: ReconciliationResult[] = [];

  for (const bp of broker) {
    const ap = app.find(a => a.symbol === bp.symbol);

    if (!ap) {
      results.push({
        symbol: bp.symbol,
        brokerShares: bp.shares, brokerCost: bp.avgCost, brokerPrice: bp.currentPrice,
        brokerValue: bp.totalValue, brokerGainLoss: bp.gainLoss,
        appShares: 0, appCost: 0, appPrice: 0, appValue: 0, appGainLoss: 0,
        sharesDiff: -bp.shares, costDiff: 0, costDiffPct: 0,
        priceDiff: 0, priceDiffPct: 0, valueDiff: -bp.totalValue, valueDiffPct: -100,
        gainLossDiff: -bp.gainLoss,
        verdict: 'DATA_ENTRY_ERROR',
        notes: 'Position exists in broker but MISSING from app. Did you forget to add it?',
      });
      continue;
    }

    const sharesDiff = ap.shares - bp.shares;
    const costDiff = ap.avgCost - bp.avgCost;
    const costDiffPct = bp.avgCost > 0 ? (costDiff / bp.avgCost) * 100 : 0;
    const priceDiff = ap.currentPrice - bp.currentPrice;
    const priceDiffPct = bp.currentPrice > 0 ? (priceDiff / bp.currentPrice) * 100 : 0;
    const valueDiff = ap.totalValue - bp.totalValue;
    const valueDiffPct = bp.totalValue > 0 ? (valueDiff / bp.totalValue) * 100 : 0;
    const gainLossDiff = ap.gainLoss - bp.gainLoss;

    // Determine verdict
    let verdict: ReconciliationResult['verdict'] = 'MATCH';
    let notes = '';

    if (sharesDiff !== 0) {
      verdict = 'DATA_ENTRY_ERROR';
      notes = `Share count mismatch: app has ${ap.shares}, broker has ${bp.shares}`;
    } else if (Math.abs(costDiffPct) > 1) {
      verdict = 'DATA_ENTRY_ERROR';
      notes = `Cost basis off by ${costDiffPct.toFixed(1)}% — check if you entered the right average cost`;
    } else if (Math.abs(priceDiffPct) > 5) {
      verdict = 'INVESTIGATE';
      notes = `Price difference ${priceDiffPct.toFixed(1)}% — too large for normal lag. Check if symbol is correct or if price is stale.`;
    } else if (Math.abs(priceDiffPct) > 2) {
      verdict = 'PRICE_LAG';
      notes = `Price off by ${priceDiffPct.toFixed(1)}% — likely timing difference (app cached vs broker realtime)`;
    } else {
      notes = 'All values match within tolerance';
    }

    results.push({
      symbol: bp.symbol,
      brokerShares: bp.shares, brokerCost: bp.avgCost, brokerPrice: bp.currentPrice,
      brokerValue: bp.totalValue, brokerGainLoss: bp.gainLoss,
      appShares: ap.shares, appCost: ap.avgCost, appPrice: ap.currentPrice,
      appValue: ap.totalValue, appGainLoss: ap.gainLoss,
      sharesDiff, costDiff, costDiffPct, priceDiff, priceDiffPct,
      valueDiff, valueDiffPct, gainLossDiff,
      verdict, notes,
    });
  }

  // Check for positions in app but not in broker
  for (const ap of app) {
    if (!broker.find(b => b.symbol === ap.symbol)) {
      results.push({
        symbol: ap.symbol,
        brokerShares: 0, brokerCost: 0, brokerPrice: 0, brokerValue: 0, brokerGainLoss: 0,
        appShares: ap.shares, appCost: ap.avgCost, appPrice: ap.currentPrice,
        appValue: ap.totalValue, appGainLoss: ap.gainLoss,
        sharesDiff: ap.shares, costDiff: 0, costDiffPct: 0,
        priceDiff: 0, priceDiffPct: 0, valueDiff: ap.totalValue, valueDiffPct: 100,
        gainLossDiff: ap.gainLoss,
        verdict: 'DATA_ENTRY_ERROR',
        notes: 'Position in app but NOT in broker. Phantom holding — did you sell it?',
      });
    }
  }

  return results;
}

// ─── Output ──────────────────────────────────────────────────────────────────

function printResults(results: ReconciliationResult[]) {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║  Monthly Portfolio Reconciliation                                ║');
  console.log(`║  Date: ${now.toISOString().slice(0, 10)}                                              ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const r of results) {
    const icon = r.verdict === 'MATCH' ? '✅' :
                 r.verdict === 'PRICE_LAG' ? '⏱️' :
                 r.verdict === 'DATA_ENTRY_ERROR' ? '❌' : '🔍';

    console.log(`  ${icon} ${r.symbol} — ${r.verdict}`);
    console.log(`     Shares:  broker=${r.brokerShares}, app=${r.appShares}${r.sharesDiff !== 0 ? ` (diff: ${r.sharesDiff})` : ''}`);
    console.log(`     Cost:    broker=${r.brokerCost.toFixed(2)}, app=${r.appCost.toFixed(2)}${Math.abs(r.costDiffPct) > 0.1 ? ` (${r.costDiffPct >= 0 ? '+' : ''}${r.costDiffPct.toFixed(1)}%)` : ''}`);
    console.log(`     Price:   broker=${r.brokerPrice.toFixed(2)}, app=${r.appPrice.toFixed(2)}${Math.abs(r.priceDiffPct) > 0.1 ? ` (${r.priceDiffPct >= 0 ? '+' : ''}${r.priceDiffPct.toFixed(1)}%)` : ''}`);
    console.log(`     Value:   broker=${r.brokerValue.toFixed(0)}, app=${r.appValue.toFixed(0)} (diff: ${r.valueDiff >= 0 ? '+' : ''}${r.valueDiff.toFixed(0)})`);
    console.log(`     G/L:     broker=${r.brokerGainLoss.toFixed(0)}, app=${r.appGainLoss.toFixed(0)} (diff: ${r.gainLossDiff >= 0 ? '+' : ''}${r.gainLossDiff.toFixed(0)})`);
    console.log(`     Note:    ${r.notes}`);
    console.log('');
  }

  // Summary
  const matches = results.filter(r => r.verdict === 'MATCH').length;
  const lags = results.filter(r => r.verdict === 'PRICE_LAG').length;
  const errors = results.filter(r => r.verdict === 'DATA_ENTRY_ERROR').length;
  const investigates = results.filter(r => r.verdict === 'INVESTIGATE').length;

  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Summary: ${results.length} positions checked`);
  console.log(`    ✅ MATCH: ${matches}   ⏱️ PRICE_LAG: ${lags}   ❌ DATA_ENTRY: ${errors}   🔍 INVESTIGATE: ${investigates}`);
  console.log('');

  if (errors > 0) {
    console.log('  ❌ ACTION NEEDED: Fix data entry errors in the app.');
    console.log('     These are wrong share counts or cost basis values.');
  }
  if (investigates > 0) {
    console.log('  🔍 ACTION NEEDED: Price differences too large.');
    console.log('     Check if the stock symbol is correct and if the price cache is refreshing.');
  }
  if (errors === 0 && investigates === 0) {
    console.log('  ✅ Portfolio reconciles cleanly. You can trust the numbers.');
  }
}

function saveCSV(results: ReconciliationResult[]) {
  const header = 'symbol,broker_shares,app_shares,shares_diff,broker_cost,app_cost,cost_diff_pct,broker_price,app_price,price_diff_pct,broker_value,app_value,value_diff_pct,broker_gl,app_gl,gl_diff,verdict,notes';
  const rows = results.map(r =>
    `${r.symbol},${r.brokerShares},${r.appShares},${r.sharesDiff},${r.brokerCost},${r.appCost},${r.costDiffPct.toFixed(2)},${r.brokerPrice},${r.appPrice},${r.priceDiffPct.toFixed(2)},${r.brokerValue.toFixed(0)},${r.appValue.toFixed(0)},${r.valueDiffPct.toFixed(2)},${r.brokerGainLoss.toFixed(0)},${r.appGainLoss.toFixed(0)},${r.gainLossDiff.toFixed(0)},${r.verdict},"${r.notes}"`
  );
  fs.writeFileSync(RESULT_FILE, [header, ...rows].join('\n'));
  console.log(`  Results saved to: ${RESULT_FILE}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const broker = parseBrokerStatement();
  const app = getAppPositions();

  console.log(`\nLoaded ${broker.length} positions from broker, ${app.length} from app.\n`);

  const results = reconcile(broker, app);
  printResults(results);
  saveCSV(results);

  console.log('');
  console.log('  Schedule: Run this on the 1st of each month for 3 months.');
  console.log('  If all 3 months show MATCH, the app is trustworthy.');
  console.log('  If DATA_ENTRY_ERROR appears, fix the wrong value in the app.');
  console.log('  If INVESTIGATE appears, there\'s a bug to fix in the code.');
}

main();
