'use client';

import { useState, useEffect, useMemo } from 'react';
import { Receipt, AlertTriangle, Info } from 'lucide-react';
import { getOrders } from '@/lib/supabase';
import { calculateDanishTax, TaxEstimate, AccountType } from '@/lib/danish-tax';

export default function TaxPage() {
  const [orders, setOrders] = useState<{ side: string; symbol: string; shares: number; price_per_share: number; account_type: string; executed_at: string }[]>([]);
  const [accountType, setAccountType] = useState<AccountType>('regular');
  const [isMarried, setIsMarried] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      try {
        const data = await getOrders();
        setOrders(data.map(o => ({
          side: o.side,
          symbol: o.symbol,
          shares: o.shares,
          price_per_share: o.price_per_share,
          account_type: o.account_type || 'regular',
          executed_at: o.executed_at || o.created_at,
        })));
      } catch {}
      setLoading(false);
    }
    loadOrders();
  }, []);

  // Filter orders by account type AND tax year
  const filteredOrders = useMemo(() =>
    orders.filter(o => {
      if (o.account_type !== accountType) return false;
      // Filter by tax year using executed_at timestamp
      const orderYear = new Date(o.executed_at).getFullYear();
      return orderYear === taxYear;
    }),
    [orders, accountType, taxYear]
  );

  // Calculate realized gains/losses from sell orders using proper FIFO
  // IMPORTANT: Buys from ALL years provide cost basis (FIFO spans years),
  // but only sells in the selected tax year create taxable events.
  const { realizedGains, realizedLosses, trades } = useMemo(() => {
    // Build FIFO lot queue from ALL buys for this account type (any year)
    // CRITICAL: Sort by executed_at ASCENDING so oldest buys are consumed first.
    const allBuysForAccount = orders
      .filter(o => o.account_type === accountType && o.side === 'buy')
      .sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime());

    const lots: Record<string, { price: number; remaining: number }[]> = {};
    for (const o of allBuysForAccount) {
      if (!lots[o.symbol]) lots[o.symbol] = [];
      lots[o.symbol].push({ price: o.price_per_share, remaining: o.shares });
    }

    // CRITICAL: Replay all PRIOR-YEAR sells to consume their lots first.
    // Without this, the current year would reuse cost basis that was already
    // consumed by sells in previous years (overstating or understating gains).
    const priorYearSells = orders
      .filter(o => o.account_type === accountType && o.side === 'sell' &&
        new Date(o.executed_at).getFullYear() < taxYear)
      .sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime());

    for (const priorSell of priorYearSells) {
      let sharesToConsume = priorSell.shares;
      const symbolLots = lots[priorSell.symbol] || [];
      while (sharesToConsume > 0 && symbolLots.length > 0) {
        const lot = symbolLots[0];
        const matched = Math.min(sharesToConsume, lot.remaining);
        lot.remaining -= matched;
        sharesToConsume -= matched;
        if (lot.remaining <= 0) symbolLots.shift();
      }
    }

    // NOW process current-year sells against the REMAINING lots
    let gains = 0;
    let losses = 0;
    const tradeList: { symbol: string; proceeds: number; cost: number; gain: number }[] = [];

    // Only sells in the selected tax year generate taxable events
    const sells = filteredOrders.filter(o => o.side === 'sell');

    for (const sell of sells) {
      const proceeds = sell.price_per_share * sell.shares;
      let costBasis = 0;
      let sharesToMatch = sell.shares;
      const symbolLots = lots[sell.symbol] || [];

      // Consume lots in FIFO order
      while (sharesToMatch > 0 && symbolLots.length > 0) {
        const lot = symbolLots[0];
        const matched = Math.min(sharesToMatch, lot.remaining);
        costBasis += matched * lot.price;
        lot.remaining -= matched;
        sharesToMatch -= matched;
        // Remove fully consumed lots
        if (lot.remaining <= 0) symbolLots.shift();
      }

      // If no matching buys found (sold without recorded buy), use sell price as cost
      // This means 0 gain — conservative (won't overstate tax)
      if (sharesToMatch > 0) {
        costBasis += sharesToMatch * sell.price_per_share;
      }

      const gain = proceeds - costBasis;
      if (gain > 0) gains += gain;
      else losses += Math.abs(gain);

      tradeList.push({ symbol: sell.symbol, proceeds, cost: costBasis, gain });
    }

    return { realizedGains: gains, realizedLosses: losses, trades: tradeList };
  }, [filteredOrders, orders, accountType]);

  const taxEstimate = useMemo(() =>
    calculateDanishTax(realizedGains, realizedLosses, accountType, isMarried),
    [realizedGains, realizedLosses, accountType, isMarried]
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="h-6 w-6 text-[var(--primary)]" />
          Tax Summary ({taxYear})
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Estimated Danish capital gains tax (aktieindkomst)
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-[var(--warning)]">This is an estimate — not official tax advice</p>
          <p className="text-[10px] text-[var(--foreground)]/60 mt-1 leading-relaxed">
            These calculations are based on standard Danish aktieindkomst rules and may not reflect your specific situation.
            Currency conversions, dividend tax, loss carry-forward from previous years, and other factors may affect your actual liability.
            Always consult SKAT.dk or a qualified tax advisor before filing.
          </p>
        </div>
      </div>

      {/* Account type selector */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <p className="text-xs font-medium mb-3">Account Type</p>
        <div className="flex gap-3">
          <button
            onClick={() => setAccountType('regular')}
            className={`flex-1 rounded-lg border py-2.5 text-xs font-medium transition-colors ${
              accountType === 'regular'
                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'border-[var(--card-border)] text-[var(--muted)]'
            }`}
          >
            Regular Depot
            <span className="block text-[9px] mt-0.5 opacity-70">27% / 42% progressive</span>
          </button>
          <button
            onClick={() => setAccountType('ask')}
            className={`flex-1 rounded-lg border py-2.5 text-xs font-medium transition-colors ${
              accountType === 'ask'
                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'border-[var(--card-border)] text-[var(--muted)]'
            }`}
          >
            ASK (Aktiesparekonto)
            <span className="block text-[9px] mt-0.5 opacity-70">17% flat rate</span>
          </button>
        </div>
        {accountType === 'regular' && (
          <label className="flex items-center gap-2 mt-3 text-[10px] text-[var(--muted)]">
            <input type="checkbox" checked={isMarried} onChange={(e) => setIsMarried(e.target.checked)} className="accent-[var(--primary)]" />
            Married (doubles the 27% threshold to 158,800 DKK)
          </label>
        )}

        {/* Tax year selector */}
        <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
          <p className="text-[10px] text-[var(--muted)] mb-1.5">Tax Year</p>
          <div className="flex gap-2">
            {[new Date().getFullYear() - 1, new Date().getFullYear()].map((y) => (
              <button
                key={y}
                onClick={() => setTaxYear(y)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  taxYear === y
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--card-border)] text-[var(--muted)]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-[var(--muted)] mt-1.5">
            Only orders with an execution date in {taxYear} are included. If a trade is in the wrong year, edit its date in the order history.
          </p>
        </div>
      </div>

      {/* No sells yet */}
      {trades.length === 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm font-medium">No realized gains or losses yet</p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Tax is only owed when you <strong>sell</strong> a stock at a profit. Log your sells in the{' '}
            <a href="/orders" className="text-[var(--primary)] hover:underline">Order History</a> to see your tax estimate.
          </p>
        </div>
      )}

      {/* Tax Summary Cards */}
      {trades.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TaxCard label="Realized Gains" value={`${taxEstimate.grossGain.toLocaleString()} DKK`} color="gain" />
            <TaxCard label="Realized Losses" value={`-${taxEstimate.totalLosses.toLocaleString()} DKK`} color="loss" />
            <TaxCard label="Net Taxable" value={`${taxEstimate.taxableGain.toLocaleString()} DKK`} color="neutral" />
            <TaxCard label="Estimated Tax" value={`${taxEstimate.totalTax.toLocaleString()} DKK`} color="warning" />
          </div>

          {/* Detailed breakdown */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
            <h2 className="text-sm font-semibold">Tax Breakdown</h2>

            {accountType === 'regular' ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Gains taxed at 27% (first {isMarried ? '158,800' : '79,400'} DKK)</span>
                  <span className="font-tabular">{taxEstimate.taxAtLowRate.toLocaleString()} DKK</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Gains taxed at 42% (above threshold)</span>
                  <span className="font-tabular">{taxEstimate.taxAtHighRate.toLocaleString()} DKK</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[var(--card-border)] font-semibold">
                  <span>Total estimated tax</span>
                  <span className="text-[var(--warning)] font-tabular">{taxEstimate.totalTax.toLocaleString()} DKK</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Effective tax rate</span>
                  <span className="font-tabular">{taxEstimate.effectiveRate}%</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[var(--card-border)]">
                  <span className="font-medium">Net profit (what you keep)</span>
                  <span className="font-bold text-[var(--gain)] font-tabular">{taxEstimate.netProfit.toLocaleString()} DKK</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Flat 17% on all gains</span>
                  <span className="font-tabular">{taxEstimate.totalTax.toLocaleString()} DKK</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[var(--card-border)]">
                  <span className="font-medium">Net profit (what you keep)</span>
                  <span className="font-bold text-[var(--gain)] font-tabular">{taxEstimate.netProfit.toLocaleString()} DKK</span>
                </div>
              </div>
            )}

            {taxEstimate.lossCarryForward > 0 && (
              <div className="rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/20 p-3 mt-3">
                <p className="text-[10px] text-[var(--primary)]">
                  You have <strong>{taxEstimate.lossCarryForward.toLocaleString()} DKK</strong> in losses that can offset future gains (loss carry-forward).
                </p>
              </div>
            )}
          </div>

          {/* Individual trades */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--card-border)]">
              <h2 className="text-sm font-semibold">Realized Trades This Year</h2>
            </div>
            <div className="divide-y divide-[var(--card-border)]">
              {trades.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 text-xs">
                  <div>
                    <p className="font-medium">{t.symbol}</p>
                    <p className="text-[9px] text-[var(--muted)]">Cost: {t.cost.toFixed(0)} → Sold: {t.proceeds.toFixed(0)}</p>
                  </div>
                  <span className={`font-tabular font-medium ${t.gain >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                    {t.gain >= 0 ? '+' : ''}{t.gain.toFixed(0)} DKK
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
            <div className="text-[10px] text-[var(--muted)] leading-relaxed space-y-1">
              <p><strong>When do I pay?</strong> Tax on aktieindkomst is reported on your annual tax return (årsopgørelse) and collected by SKAT the following year.</p>
              <p><strong>What about dividends?</strong> Dividend tax (udbytteskat) is usually withheld automatically at 27% by your broker. This page only covers capital gains from selling.</p>
              <p><strong>ASK advantage:</strong> The Aktiesparekonto is taxed at only 17% but has a deposit limit (currently 174,200 DKK). Consider using it for your highest-growth investments.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TaxCard({ label, value, color }: { label: string; value: string; color: 'gain' | 'loss' | 'warning' | 'neutral' }) {
  const colorClass = {
    gain: 'text-[var(--gain)]',
    loss: 'text-[var(--loss)]',
    warning: 'text-[var(--warning)]',
    neutral: 'text-[var(--foreground)]',
  }[color];

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
      <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold font-tabular mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}
