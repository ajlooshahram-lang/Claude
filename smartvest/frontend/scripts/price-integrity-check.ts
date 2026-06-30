#!/usr/bin/env npx tsx
/**
 * Price Integrity Check — Daily Logger
 *
 * PURPOSE:
 *   Runs once daily for 2 weeks. Compares the app's Alpha Vantage prices
 *   against Yahoo Finance for the same 3 stocks. Logs results to a CSV
 *   so you can spot drift patterns, caching bugs, or stale data.
 *
 * USAGE:
 *   npx tsx scripts/price-integrity-check.ts
 *
 * AUTOMATE (run daily at 17:00 CET, after US market open):
 *   crontab -e
 *   0 17 * * 1-5 cd /path/to/smartvest/frontend && npx tsx scripts/price-integrity-check.ts
 *
 * WHAT TO LOOK FOR AFTER 2 WEEKS:
 *   - If difference is consistently < 2%: normal free-tier lag (acceptable)
 *   - If difference is randomly large some days: caching bug
 *   - If one stock is always off but others are fine: symbol mapping issue
 *   - If staleness says "15 min ago" but difference is 5%+: cache not refreshing
 *
 * REQUIRES:
 *   NEXT_PUBLIC_ALPHA_VANTAGE_KEY in .env.local (same key the app uses)
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const STOCKS = ['AAPL', 'MSFT', 'IBM']; // 3 stocks to track
const LOG_FILE = path.join(__dirname, '..', 'price-integrity-log.csv');
const AV_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY || '';

// ─── Alpha Vantage (same endpoint the app uses) ─────────────────────────────

async function fetchAlphaVantage(symbol: string): Promise<{
  price: number; change: number; changePct: number; source: string;
} | null> {
  if (!AV_KEY) {
    console.error('ERROR: NEXT_PUBLIC_ALPHA_VANTAGE_KEY not set. Add it to .env.local');
    return null;
  }

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json['Note']) { console.warn('Rate limited:', json['Note']); return null; }
    if (json['Error Message']) { console.warn('AV Error:', json['Error Message']); return null; }

    const gq = json['Global Quote'];
    if (!gq || !gq['05. price']) return null;

    return {
      price: parseFloat(gq['05. price']) || 0,
      change: parseFloat(gq['09. change']) || 0,
      changePct: parseFloat(gq['10. change percent']?.replace('%', '') || '0') || 0,
      source: 'alpha_vantage',
    };
  } catch (err) {
    console.error(`AV fetch failed for ${symbol}:`, err);
    return null;
  }
}

// ─── Yahoo Finance (cross-reference source) ──────────────────────────────────

async function fetchYahooFinance(symbol: string): Promise<{
  price: number; change: number; changePct: number; source: string;
} | null> {
  try {
    // Yahoo Finance v8 API (public, no key needed)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SmartVest-IntegrityCheck/1.0' },
    });

    if (!res.ok) {
      // Fallback: try v7 quote endpoint
      return await fetchYahooQuote(symbol);
    }

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return await fetchYahooQuote(symbol);

    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return { price, change, changePct, source: 'yahoo_chart' };
  } catch {
    return await fetchYahooQuote(symbol);
  }
}

async function fetchYahooQuote(symbol: string): Promise<{
  price: number; change: number; changePct: number; source: string;
} | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SmartVest-IntegrityCheck/1.0' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const priceData = json?.quoteSummary?.result?.[0]?.price;
    if (!priceData) return null;

    const price = priceData.regularMarketPrice?.raw || 0;
    const change = priceData.regularMarketChange?.raw || 0;
    const changePct = priceData.regularMarketChangePercent?.raw
      ? priceData.regularMarketChangePercent.raw * 100
      : 0;

    return { price, change, changePct, source: 'yahoo_quote' };
  } catch {
    return null;
  }
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function ensureLogFile() {
  if (!fs.existsSync(LOG_FILE)) {
    const header = 'date,time_utc,symbol,app_price,yahoo_price,difference,diff_pct,app_change_pct,yahoo_change_pct,app_source,yahoo_source,verdict\n';
    fs.writeFileSync(LOG_FILE, header);
    console.log(`Created log file: ${LOG_FILE}`);
  }
}

function appendLog(row: string) {
  fs.appendFileSync(LOG_FILE, row + '\n');
}

function verdict(diffPct: number): string {
  const abs = Math.abs(diffPct);
  if (abs < 0.5) return 'MATCH';
  if (abs < 2.0) return 'OK_LAG';
  if (abs < 5.0) return 'WARNING';
  return 'INVESTIGATE';
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  SmartVest Price Integrity Check                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].split('.')[0];

  console.log(`Date: ${dateStr} ${timeStr} UTC`);
  console.log(`Stocks: ${STOCKS.join(', ')}`);
  console.log(`Log file: ${LOG_FILE}`);
  console.log('');

  if (!AV_KEY) {
    console.error('ERROR: Set NEXT_PUBLIC_ALPHA_VANTAGE_KEY in .env.local first.');
    console.error('Get a free key at: https://www.alphavantage.co/support/#api-key');
    process.exit(1);
  }

  ensureLogFile();

  for (const symbol of STOCKS) {
    console.log(`── ${symbol} ──`);

    // Fetch from both sources
    const av = await fetchAlphaVantage(symbol);

    // Wait 13 seconds between AV calls to respect 5/min limit
    if (symbol !== STOCKS[STOCKS.length - 1]) {
      console.log('   (waiting 13s for rate limit...)');
    }

    const yahoo = await fetchYahooFinance(symbol);

    if (!av) {
      console.log(`   App (Alpha Vantage): FAILED`);
      appendLog(`${dateStr},${timeStr},${symbol},,,,,,,,FAILED,AV_FAILED`);
    } else if (!yahoo) {
      console.log(`   App (Alpha Vantage): $${av.price.toFixed(2)} (${av.changePct >= 0 ? '+' : ''}${av.changePct.toFixed(2)}%)`);
      console.log(`   Yahoo Finance:       FAILED (API may be blocked)`);
      appendLog(`${dateStr},${timeStr},${symbol},${av.price},,,,${av.changePct},,${av.source},,YAHOO_FAILED`);
    } else {
      const diff = av.price - yahoo.price;
      const diffPct = yahoo.price > 0 ? (diff / yahoo.price) * 100 : 0;
      const v = verdict(diffPct);

      console.log(`   App (Alpha Vantage): $${av.price.toFixed(2)} (${av.changePct >= 0 ? '+' : ''}${av.changePct.toFixed(2)}%)`);
      console.log(`   Yahoo Finance:       $${yahoo.price.toFixed(2)} (${yahoo.changePct >= 0 ? '+' : ''}${yahoo.changePct.toFixed(2)}%)`);
      console.log(`   Difference:          $${diff.toFixed(2)} (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(3)}%) → ${v}`);

      appendLog(`${dateStr},${timeStr},${symbol},${av.price},${yahoo.price},${diff.toFixed(4)},${diffPct.toFixed(4)},${av.changePct},${yahoo.changePct},${av.source},${yahoo.source},${v}`);
    }
    console.log('');

    // Rate limit pause between Alpha Vantage calls
    if (symbol !== STOCKS[STOCKS.length - 1]) {
      await new Promise(r => setTimeout(r, 13000));
    }
  }

  // Print summary from log
  console.log('─────────────────────────────────────────────────────────────');
  console.log('Log appended to: ' + LOG_FILE);
  console.log('');

  // Count days logged
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l && !l.startsWith('date'));
  const days = new Set(lines.map(l => l.split(',')[0]));
  console.log(`Progress: ${days.size}/14 days logged`);

  if (days.size >= 14) {
    console.log('');
    console.log('🎉 2 weeks complete! Analyze your log:');
    console.log('   - Open price-integrity-log.csv in Excel/Sheets');
    console.log('   - Check "verdict" column for INVESTIGATE entries');
    console.log('   - Chart diff_pct over time to spot drift patterns');
    console.log('   - Consistent < 2% = normal lag (free tier)');
    console.log('   - Random spikes > 5% = potential caching bug');
  } else {
    console.log(`Run this script daily for ${14 - days.size} more days.`);
  }
}

main().catch(console.error);
