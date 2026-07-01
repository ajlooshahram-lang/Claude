#!/usr/bin/env npx tsx
/**
 * Data Verification — Check every row for internal consistency
 *
 * Catches:
 *   - Orders where total_value ≠ shares × price_per_share
 *   - Symbols with more shares sold than bought (orphaned FIFO)
 *   - Duplicate idempotency keys
 *   - ASK deposits that exceed the 174,200 limit
 *   - Holdings with zero or negative shares (schema violation)
 *   - Orders with future dates (clock error)
 *
 * USAGE:
 *   npx tsx scripts/verify-data.ts
 *
 * Can also compare against a previous backup:
 *   npx tsx scripts/verify-data.ts --compare scripts/backups/smartvest-backup-2026-06-01.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
  console.error('ERROR: Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('SmartVest Data Verification');
  console.log('===========================');
  console.log('');

  let issues = 0;

  // ─── Orders ────────────────────────────────────────────────────────────────

  const { data: orders } = await supabase.from('orders').select('*');
  const orderList = orders || [];
  console.log(`Orders: ${orderList.length} rows`);

  // Check 1: total_value consistency
  for (const o of orderList) {
    const computed = o.shares * o.price_per_share;
    const diff = Math.abs(o.total_value - computed);
    if (diff > 0.01) {
      console.log(`  ❌ Order ${o.id}: total_value=${o.total_value} but shares×price=${computed.toFixed(4)}`);
      issues++;
    }
  }

  // Check 2: duplicate idempotency keys
  const keys = orderList.map(o => o.idempotency_key).filter(Boolean);
  const keyCounts: Record<string, number> = {};
  for (const k of keys) { keyCounts[k] = (keyCounts[k] || 0) + 1; }
  for (const [k, count] of Object.entries(keyCounts)) {
    if (count > 1) {
      console.log(`  ❌ Duplicate idempotency_key: ${k} appears ${count} times`);
      issues++;
    }
  }

  // Check 3: more sold than bought per symbol
  const symbolTotals: Record<string, { bought: number; sold: number }> = {};
  for (const o of orderList) {
    if (!symbolTotals[o.symbol]) symbolTotals[o.symbol] = { bought: 0, sold: 0 };
    if (o.side === 'buy') symbolTotals[o.symbol].bought += o.shares;
    else symbolTotals[o.symbol].sold += o.shares;
  }
  for (const [sym, t] of Object.entries(symbolTotals)) {
    if (t.sold > t.bought) {
      console.log(`  ⚠️  ${sym}: sold ${t.sold} shares but only bought ${t.bought} (missing buy orders?)`);
      issues++;
    }
  }

  // Check 4: future-dated orders
  const now = Date.now();
  for (const o of orderList) {
    if (new Date(o.executed_at).getTime() > now + 24 * 60 * 60 * 1000) {
      console.log(`  ⚠️  Order ${o.id}: executed_at is in the future (${o.executed_at})`);
      issues++;
    }
  }

  console.log('');

  // ─── Holdings ──────────────────────────────────────────────────────────────

  const { data: holdings } = await supabase.from('holdings').select('*');
  const holdingList = holdings || [];
  console.log(`Holdings: ${holdingList.length} rows`);

  for (const h of holdingList) {
    if (h.shares <= 0) {
      console.log(`  ❌ Holding ${h.id} (${h.symbol}): shares=${h.shares} (should be > 0)`);
      issues++;
    }
    if (h.avg_cost_per_share < 0) {
      console.log(`  ❌ Holding ${h.id} (${h.symbol}): avg_cost=${h.avg_cost_per_share} (negative!)`);
      issues++;
    }
  }

  console.log('');

  // ─── ASK Deposits ──────────────────────────────────────────────────────────

  const { data: deposits } = await supabase.from('ask_deposits').select('*');
  const depositList = deposits || [];
  console.log(`ASK Deposits: ${depositList.length} rows`);

  const totalDeposited = depositList.reduce((sum, d) => sum + d.amount, 0);
  const ASK_LIMIT = 174200;
  if (totalDeposited > ASK_LIMIT) {
    console.log(`  ⚠️  Total deposited: ${totalDeposited.toLocaleString()} kr exceeds limit of ${ASK_LIMIT.toLocaleString()} kr`);
    issues++;
  } else {
    console.log(`  ✅ Total deposited: ${totalDeposited.toLocaleString()} kr (within ${ASK_LIMIT.toLocaleString()} limit)`);
  }

  console.log('');

  // ─── Compare against backup (if provided) ──────────────────────────────────

  const compareArg = process.argv.find(a => a.startsWith('--compare'));
  const compareFile = process.argv[process.argv.indexOf('--compare') + 1];

  if (compareFile && fs.existsSync(compareFile)) {
    console.log(`Comparing against backup: ${compareFile}`);
    console.log('');

    const backup = JSON.parse(fs.readFileSync(compareFile, 'utf8'));

    for (const table of ['orders', 'holdings', 'ask_deposits']) {
      const backupRows = backup.tables?.[table] || [];
      const currentRows = table === 'orders' ? orderList :
                          table === 'holdings' ? holdingList : depositList;

      const backupIds = new Set(backupRows.map((r: any) => r.id));
      const currentIds = new Set(currentRows.map((r: any) => r.id));

      const missing = backupRows.filter((r: any) => !currentIds.has(r.id));
      const added = currentRows.filter((r: any) => !backupIds.has(r.id));

      if (missing.length > 0) {
        console.log(`  ❌ ${table}: ${missing.length} rows in backup but MISSING from current DB:`);
        for (const r of missing.slice(0, 5)) {
          console.log(`     id=${r.id} symbol=${r.symbol || ''} ${r.amount ? 'amount=' + r.amount : ''}`);
        }
        if (missing.length > 5) console.log(`     ... and ${missing.length - 5} more`);
        issues += missing.length;
      }
      if (added.length > 0) {
        console.log(`  ℹ️  ${table}: ${added.length} rows added since backup (expected)`);
      }
      if (missing.length === 0 && added.length === 0) {
        console.log(`  ✅ ${table}: identical to backup`);
      }
    }
    console.log('');
  }

  // ─── Summary ───────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════');
  if (issues === 0) {
    console.log('✅ All data verified. No issues found.');
  } else {
    console.log(`❌ ${issues} issue${issues > 1 ? 's' : ''} found. Review above.`);
  }
  console.log('');
}

verify().catch(console.error);
