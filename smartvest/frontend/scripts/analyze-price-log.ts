#!/usr/bin/env npx tsx
/**
 * Price Integrity Log Analyzer
 *
 * Run after 2 weeks of daily price-integrity-check.ts to detect:
 * - Consistent drift (systematic error)
 * - Random spikes (caching bug)
 * - Staleness pattern (always stale at certain times)
 *
 * Usage: npx tsx scripts/analyze-price-log.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(__dirname, '..', 'price-integrity-log.csv');

interface LogEntry {
  date: string;
  time: string;
  symbol: string;
  appPrice: number;
  yahooPrice: number;
  difference: number;
  diffPct: number;
  verdict: string;
}

function parseCSV(): LogEntry[] {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('No log file found. Run price-integrity-check.ts first.');
    process.exit(1);
  }

  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l && !l.startsWith('date'));
  return lines.map(line => {
    const cols = line.split(',');
    return {
      date: cols[0],
      time: cols[1],
      symbol: cols[2],
      appPrice: parseFloat(cols[3]) || 0,
      yahooPrice: parseFloat(cols[4]) || 0,
      difference: parseFloat(cols[5]) || 0,
      diffPct: parseFloat(cols[6]) || 0,
      verdict: cols[11] || '',
    };
  }).filter(e => e.appPrice > 0 && e.yahooPrice > 0);
}

function analyze() {
  const entries = parseCSV();

  if (entries.length === 0) {
    console.log('No valid entries to analyze. Run the daily check for a few days first.');
    return;
  }

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Price Integrity Analysis                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Total entries: ${entries.length}`);
  console.log(`Date range: ${entries[0].date} → ${entries[entries.length - 1].date}`);
  console.log('');

  // Per-stock analysis
  const symbols = [...new Set(entries.map(e => e.symbol))];

  for (const symbol of symbols) {
    const stockEntries = entries.filter(e => e.symbol === symbol);
    const diffs = stockEntries.map(e => e.diffPct);
    const absDiffs = diffs.map(Math.abs);

    const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const avgAbsDiff = absDiffs.reduce((s, d) => s + d, 0) / absDiffs.length;
    const maxAbsDiff = Math.max(...absDiffs);
    const stdDev = Math.sqrt(diffs.map(d => (d - avgDiff) ** 2).reduce((s, d) => s + d, 0) / diffs.length);

    const warnings = stockEntries.filter(e => e.verdict === 'WARNING' || e.verdict === 'INVESTIGATE');

    console.log(`── ${symbol} (${stockEntries.length} data points) ──`);
    console.log(`   Mean difference:    ${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(4)}%`);
    console.log(`   Mean |difference|:  ${avgAbsDiff.toFixed(4)}%`);
    console.log(`   Max |difference|:   ${maxAbsDiff.toFixed(4)}%`);
    console.log(`   Std deviation:      ${stdDev.toFixed(4)}%`);
    console.log(`   Warning days:       ${warnings.length}/${stockEntries.length}`);
    console.log('');

    // Diagnosis
    if (avgAbsDiff < 0.5) {
      console.log(`   ✅ VERDICT: Excellent — prices match within 0.5%`);
    } else if (avgAbsDiff < 2.0 && stdDev < 1.0) {
      console.log(`   ✅ VERDICT: Normal free-tier lag (consistent small delay)`);
    } else if (stdDev > 3.0) {
      console.log(`   ❌ VERDICT: HIGH VARIANCE — possible caching bug`);
      console.log(`      Random large deviations suggest stale cache not refreshing`);
    } else if (Math.abs(avgDiff) > 2.0) {
      console.log(`   ⚠️  VERDICT: Systematic drift — prices consistently ${avgDiff > 0 ? 'higher' : 'lower'}`);
      console.log(`      May indicate different data sources or timezone issues`);
    } else {
      console.log(`   ⚠️  VERDICT: Moderate variance — monitor further`);
    }
    console.log('');
  }

  // Overall
  console.log('─────────────────────────────────────────────────────────────');
  const allAbsDiffs = entries.map(e => Math.abs(e.diffPct));
  const overallAvg = allAbsDiffs.reduce((s, d) => s + d, 0) / allAbsDiffs.length;
  const investigates = entries.filter(e => e.verdict === 'INVESTIGATE');

  if (overallAvg < 1.0 && investigates.length === 0) {
    console.log('✅ OVERALL: Prices are reliable. No caching bugs detected.');
  } else if (investigates.length > 0) {
    console.log(`⚠️  OVERALL: ${investigates.length} entries need investigation.`);
    console.log('   Days with large discrepancies:');
    for (const e of investigates) {
      console.log(`   ${e.date} ${e.symbol}: app=$${e.appPrice}, yahoo=$${e.yahooPrice} (${e.diffPct.toFixed(2)}%)`);
    }
  } else {
    console.log(`✅ OVERALL: Average drift ${overallAvg.toFixed(2)}% — acceptable for free tier.`);
  }
}

analyze();
