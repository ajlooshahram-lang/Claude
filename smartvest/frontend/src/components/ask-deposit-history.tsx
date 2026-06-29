'use client';

import { Plus, ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react';
import { ASKAccount, ASK_DEPOSIT_LIMIT_2026 } from '@/lib/ask';

interface ASKDepositHistoryProps {
  account: ASKAccount;
  showAddDeposit: boolean;
  setShowAddDeposit: (v: boolean) => void;
  onAddDeposit: (e: React.FormEvent) => void;
  depositAmount: string;
  setDepositAmount: (v: string) => void;
  depositNote: string;
  setDepositNote: (v: string) => void;
  remainingRoom: number;
}

export function ASKDepositHistory({
  account, showAddDeposit, setShowAddDeposit, onAddDeposit,
  depositAmount, setDepositAmount, depositNote, setDepositNote,
  remainingRoom,
}: ASKDepositHistoryProps) {
  const totalDeposited = account.deposits.reduce((s, d) => s + d.amount, 0);
  const totalWithdrawn = account.withdrawals.reduce((s, w) => s + w.amount, 0);

  // Merge deposits and withdrawals into a timeline
  const timeline = [
    ...account.deposits.map(d => ({ ...d, type: 'deposit' as const })),
    ...account.withdrawals.map(w => ({ ...w, type: 'withdrawal' as const })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Total Deposited</p>
          <p className="text-sm font-bold font-tabular mt-1 text-[var(--primary)]">
            {totalDeposited.toLocaleString()} DKK
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Total Withdrawn</p>
          <p className="text-sm font-bold font-tabular mt-1 text-[var(--muted)]">
            {totalWithdrawn.toLocaleString()} DKK
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">Remaining Room</p>
          <p className="text-sm font-bold font-tabular mt-1 text-[var(--gain)]">
            {remainingRoom.toLocaleString()} DKK
          </p>
        </div>
      </div>


      {/* Add Deposit Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddDeposit(!showAddDeposit)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Log Deposit
        </button>
      </div>

      {/* Add Deposit Form */}
      {showAddDeposit && (
        <form onSubmit={onAddDeposit} className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--primary)]">Log New Deposit</p>
          {remainingRoom <= 0 && (
            <div className="rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30 p-2.5">
              <p className="text-[10px] text-[var(--warning)] font-medium">
                You&apos;ve reached the deposit limit ({ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK). 
                You cannot deposit more, but your account can still grow through returns.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              placeholder="Amount (DKK)"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
              required
              min="1"
              max={remainingRoom > 0 ? remainingRoom : undefined}
              step="1"
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={depositNote}
              onChange={e => setDepositNote(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
            />
          </div>
          {remainingRoom > 0 && (
            <p className="text-[10px] text-[var(--muted)]">
              Max deposit: {remainingRoom.toLocaleString()} DKK remaining of {ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK limit
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={remainingRoom <= 0}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white disabled:opacity-50"
            >
              Log Deposit
            </button>
            <button
              type="button"
              onClick={() => setShowAddDeposit(false)}
              className="px-4 py-2 rounded-lg text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}


      {/* Timeline */}
      {timeline.length === 0 ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <PiggyBank className="h-10 w-10 text-[var(--muted)] mx-auto mb-3" />
          <p className="text-sm font-medium">No deposits yet</p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Log your ASK deposits to track your limit usage.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)]">
            <h2 className="text-sm font-semibold">Transaction History</h2>
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {timeline.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    item.type === 'deposit'
                      ? 'bg-[var(--gain)]/10'
                      : 'bg-[var(--loss)]/10'
                  }`}>
                    {item.type === 'deposit'
                      ? <ArrowDownLeft className="h-4 w-4 text-[var(--gain)]" />
                      : <ArrowUpRight className="h-4 w-4 text-[var(--loss)]" />
                    }
                  </div>
                  <div>
                    <p className="text-xs font-medium">
                      {item.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">
                      {item.date}{item.note ? ` — ${item.note}` : ''}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold font-tabular ${
                  item.type === 'deposit' ? 'text-[var(--gain)]' : 'text-[var(--loss)]'
                }`}>
                  {item.type === 'deposit' ? '+' : '-'}{item.amount.toLocaleString()} DKK
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deposit Limit Info */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-start gap-3">
        <PiggyBank className="h-4 w-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
        <div className="text-[10px] text-[var(--muted)] leading-relaxed space-y-1">
          <p><strong>Deposit limit:</strong> The ASK has a lifetime cumulative deposit limit of {ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK (2026). This only counts money you put in — gains don&apos;t count toward the limit.</p>
          <p><strong>Withdrawals:</strong> You can withdraw at any time, but withdrawn amounts do NOT restore your deposit limit. Once deposited, that room is used permanently.</p>
          <p><strong>Annual increases:</strong> SKAT may increase the deposit limit each year. Check skat.dk for the latest limit.</p>
        </div>
      </div>
    </div>
  );
}
