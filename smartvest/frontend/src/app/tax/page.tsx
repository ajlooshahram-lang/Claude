'use client';

import { useState, useEffect, useMemo } from 'react';
import { Receipt, AlertTriangle, Info } from 'lucide-react';
import { getOrders, Order } from '@/lib/orders';
import { calculateDanishTax, TaxEstimate, AccountType } from '@/lib/danish-tax';

export default function TaxPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [accountType, setAccountType] = useState<AccountType>('regular');
  const [isMarried, setIsMarried] = useState(false);

  useEffect(() => {
    setOrders(getOrders());
  }, []);

  // Calculate realized gains/losses from sell orders
  const { realizedGains, realizedLosses, trades } = useMemo(() => {
    const buys = orders.filter(o => o.type === 'buy');
    const sells = orders.filter(o => o.type === 'sell');

    let gains = 0;
    let losses = 0;
    const tradeList: { symbol: string; proceeds: number; cost: number; gain: number }[] = [];

    for (const sell of sells) {
      // Find matching buy (FIFO — first in, first out)
      const matchingBuy = buys.find(b => b.symbol === sell.symbol);
      const costBasis = matchingBuy ? matchingBuy.pricePerShare * sell.shares : sell.pricePerShare * sell.shares;
      const proceeds = sell.pricePerShare * sell.shares;
      const gain = proceeds - costBasis;

      if (gain > 0) gains += gain;
      else losses += Math.abs(gain);

      tradeList.push({ symbol: sell.symbol, proceeds, cost: costBasis, gain });
    }

    return { realizedGains: gains, realizedLosses: losses, trades: tradeList };
  }, [orders]);

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
          Tax Summary ({new Date().getFullYear()})
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
