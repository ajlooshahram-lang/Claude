#!/usr/bin/env npx tsx
/**
 * Data Export / Backup
 *
 * Exports all your financial data from Supabase to a local JSON file.
 * Run monthly (or before any risky operation) to have your own backup
 * that's independent of Supabase's backup schedule.
 *
 * USAGE:
 *   npx tsx scripts/export-backup.ts
 *
 * OUTPUT:
 *   scripts/backups/smartvest-backup-YYYY-MM-DD.json
 *
 * RESTORE:
 *   If data is lost, you have the JSON. Manually re-enter from it,
 *   or use the verify-data.ts script to compare against current DB.
 *
 * REQUIRES:
 *   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 *   (must be logged in — the script uses your auth token)
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

async function exportAll() {
  console.log('SmartVest Data Export');
  console.log('====================');
  console.log('');

  const tables = ['holdings', 'orders', 'watchlist', 'alerts', 'tax_records', 'ask_deposits'];
  const backup: Record<string, any[]> = {};
  let totalRows = 0;

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`  ❌ ${table}: ${error.message}`);
      backup[table] = [];
    } else {
      backup[table] = data || [];
      totalRows += (data || []).length;
      console.log(`  ✅ ${table}: ${(data || []).length} rows`);
    }
  }

  // Write to file
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = `smartvest-backup-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(backupDir, filename);

  const output = {
    exportedAt: new Date().toISOString(),
    supabaseUrl: supabaseUrl.replace(/https:\/\/([^.]+)\.supabase\.co/, 'https://*****.supabase.co'),
    totalRows,
    tables: backup,
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log('');
  console.log(`Exported ${totalRows} rows to: ${filepath}`);
  console.log(`File size: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
}

exportAll().catch(console.error);
