#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# broker-diff.sh — Monthly Brokerage Statement Reconciliation
#
# USAGE:
#   ./scripts/broker-diff.sh PORTFOLIO_VALUE REALIZED_GAINS [COST_BASIS]
#
# EXAMPLE:
#   ./scripts/broker-diff.sh 48250 3420 44830
#
# All values in whole DKK (kr). Negative realized gains = loss.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

exec node -e "
const fs = require('fs');
const path = require('path');

const BROKER_VALUE = parseInt(process.argv[1] || '0');
const BROKER_GAINS = parseInt(process.argv[2] || '0');
const BROKER_COST = process.argv[3] ? parseInt(process.argv[3]) : null;
const APP_EXPORT = path.join('$SCRIPT_DIR', 'app-portfolio-export.csv');
const RESULT_FILE = path.join('$SCRIPT_DIR', 'broker-diff-' + new Date().toISOString().slice(0,7) + '.txt');

// Parse app export
if (!fs.existsSync(APP_EXPORT)) {
  console.log('');
  console.log('ERROR: ' + APP_EXPORT + ' not found.');
  console.log('');
  console.log('Fill it with numbers from the SmartVest portfolio page:');
  console.log('  symbol,shares,avg_cost_per_share,current_price');
  console.log('  NOVO-B.CO,8,750.00,845.50');
  fs.writeFileSync(APP_EXPORT, 'symbol,shares,avg_cost_per_share,current_price\n# Fill from app\n');
  process.exit(2);
}

const lines = fs.readFileSync(APP_EXPORT, 'utf8').split('\n')
  .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('symbol'));

let appValue = 0, appCost = 0;
for (const line of lines) {
  const [sym, shares, cost, price] = line.split(',');
  const s = parseFloat(shares) || 0;
  const c = parseFloat(cost) || 0;
  const p = parseFloat(price) || 0;
  appValue += s * p;
  appCost += s * c;
}
const appGain = appValue - appCost;
const appValueR = Math.round(appValue);
const appCostR = Math.round(appCost);
const appGainR = Math.round(appGain);

// Compute diffs
const valueDiff = appValueR - BROKER_VALUE;
const valuePct = BROKER_VALUE !== 0 ? ((valueDiff / BROKER_VALUE) * 100).toFixed(2) : '0';
const absValuePct = Math.abs(parseFloat(valuePct));

let costDiff = null, costPct = null, absCostPct = null;
if (BROKER_COST !== null) {
  costDiff = appCostR - BROKER_COST;
  costPct = BROKER_COST !== 0 ? ((costDiff / BROKER_COST) * 100).toFixed(2) : '0';
  absCostPct = Math.abs(parseFloat(costPct));
}

// Output
const date = new Date().toISOString().slice(0, 10);
let hasProblem = false;
const out = [];

out.push('═══════════════════════════════════════════════════════════════');
out.push('  BROKER vs APP RECONCILIATION — ' + date);
out.push('═══════════════════════════════════════════════════════════════');
out.push('');
out.push('  Broker statement (you provided):');
out.push('    Portfolio value:  ' + BROKER_VALUE.toLocaleString() + ' kr');
out.push('    Realized gains:   ' + BROKER_GAINS.toLocaleString() + ' kr');
if (BROKER_COST !== null) out.push('    Cost basis:        ' + BROKER_COST.toLocaleString() + ' kr');
out.push('');
out.push('  App (from app-portfolio-export.csv):');
out.push('    Portfolio value:  ' + appValueR.toLocaleString() + ' kr');
out.push('    Unrealized gain:  ' + appGainR.toLocaleString() + ' kr');
if (BROKER_COST !== null) out.push('    Cost basis:        ' + appCostR.toLocaleString() + ' kr');
out.push('');
out.push('  ─────────────────────────────────────────────────────────────');
out.push('  DIFF:');
out.push('');

// Portfolio value
if (absValuePct > 2.0) {
  out.push('  ❌ Portfolio value:  broker=' + BROKER_VALUE + '  app=' + appValueR + '  diff=' + valueDiff + ' (' + valuePct + '%)');
  hasProblem = true;
} else if (absValuePct > 0.5) {
  out.push('  ⚠️  Portfolio value:  broker=' + BROKER_VALUE + '  app=' + appValueR + '  diff=' + valueDiff + ' (' + valuePct + '%) — minor lag');
} else {
  out.push('  ✅ Portfolio value:  broker=' + BROKER_VALUE + '  app=' + appValueR + '  diff=' + valueDiff + ' (' + valuePct + '%)');
}

// Realized vs unrealized explanation
out.push('');
out.push('  ℹ️  Realized gains:  broker=' + BROKER_GAINS + ' kr (from actual sells)');
out.push('      Unrealized gain: app=' + appGainR + ' kr (paper gain on current holdings)');
out.push('      These are DIFFERENT metrics. They match only if you sold everything.');

// Cost basis
if (BROKER_COST !== null) {
  out.push('');
  if (absCostPct > 1.0) {
    out.push('  ❌ Cost basis:       broker=' + BROKER_COST + '  app=' + appCostR + '  diff=' + costDiff + ' (' + costPct + '%)');
    out.push('     → Wrong avg cost entered for one or more holdings.');
    hasProblem = true;
  } else {
    out.push('  ✅ Cost basis:       broker=' + BROKER_COST + '  app=' + appCostR + '  diff=' + costDiff + ' (' + costPct + '%)');
  }
}

out.push('');
out.push('  ─────────────────────────────────────────────────────────────');
out.push('');

if (hasProblem) {
  out.push('  ❌ DISCREPANCY FOUND.');
  out.push('');
  out.push('  Common causes:');
  out.push('    • Wrong share count in app');
  out.push('    • Wrong average cost (per-share vs total confusion)');
  out.push('    • Price timing (app cache vs broker real-time)');
  out.push('    • Missing or phantom holding');
} else {
  out.push('  ✅ All values reconcile. Portfolio value within 2%, cost basis within 1%.');
}

out.push('');
out.push('  Saved to: ' + RESULT_FILE);
out.push('═══════════════════════════════════════════════════════════════');

const output = out.join('\n');
console.log(output);
fs.writeFileSync(RESULT_FILE, output);
process.exit(hasProblem ? 1 : 0);
" -- "$@"
