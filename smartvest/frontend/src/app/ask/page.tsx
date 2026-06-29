'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Landmark, Plus, TrendingUp, PiggyBank, AlertTriangle,
  Trash2, RefreshCw, Info, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  getASKAccount, saveASKAccount, getASKSummary, addDeposit, addHolding,
  removeHolding, loadDemoData, ASKAccount, ASKHolding, ASKSummary,
  ASK_DEPOSIT_LIMIT_2026, ASK_TAX_RATE,
} from '@/lib/ask';
import { ASKDepositHistory } from '@/components/ask-deposit-history';
import { ASKComparison } from '@/components/ask-comparison';
import { ASKOptimizer } from '@/components/ask-optimizer';

type Tab = 'overview' | 'holdings' | 'deposits' | 'compare' | 'optimize';

export default function ASKPage() {
  const [account, setAccount] = useState<ASKAccount | null>(null);
  const [summary, setSummary] = useState<ASKSummary | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [showAddDeposit, setShowAddDeposit] = useState(false);

  // Form state for adding holdings
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newShares, setNewShares] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newPrice, setNewPrice] = useState('');

  // Form state for deposits
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');

  useEffect(() => {
    const acc = getASKAccount();
    setAccount(acc);
    setSummary(getASKSummary());
  }, []);


  function refresh() {
    setAccount(getASKAccount());
    setSummary(getASKSummary());
  }

  function handleLoadDemo() {
    loadDemoData();
    refresh();
  }

  function handleAddDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) return;
    addDeposit(amt, depositNote || undefined);
    setDepositAmount('');
    setDepositNote('');
    setShowAddDeposit(false);
    refresh();
  }

  function handleAddHolding(e: React.FormEvent) {
    e.preventDefault();
    const shares = parseFloat(newShares);
    const cost = parseFloat(newCost);
    const price = parseFloat(newPrice);
    if (!newSymbol || isNaN(shares) || isNaN(cost) || isNaN(price)) return;
    addHolding({
      symbol: newSymbol.toUpperCase(),
      name: newName || newSymbol.toUpperCase(),
      shares,
      avgCostPerShare: cost,
      currentPricePerShare: price,
      addedDate: new Date().toISOString().split('T')[0],
    });
    setNewSymbol(''); setNewName(''); setNewShares(''); setNewCost(''); setNewPrice('');
    setShowAddHolding(false);
    refresh();
  }

  function handleRemoveHolding(id: string) {
    removeHolding(id);
    refresh();
  }

  if (!account || !summary) return null;


  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'holdings', label: 'Holdings' },
    { id: 'deposits', label: 'Deposits' },
    { id: 'compare', label: 'ASK vs Depot' },
    { id: 'optimize', label: 'Optimize' },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-6 w-6 text-[var(--primary)]" />
            Aktiesparekonto (ASK)
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Your tax-advantaged stock savings account &mdash; 17% flat tax
          </p>
        </div>
        {account.holdings.length === 0 && account.deposits.length === 0 && (
          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Load Demo
          </button>
        )}
      </div>


      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Portfolio Value"
          value={`${summary.currentPortfolioValue.toLocaleString()} DKK`}
          sub={summary.unrealizedGain >= 0
            ? `+${summary.unrealizedGain.toLocaleString()} (${summary.unrealizedGainPct}%)`
            : `${summary.unrealizedGain.toLocaleString()} (${summary.unrealizedGainPct}%)`
          }
          color={summary.unrealizedGain >= 0 ? 'gain' : 'loss'}
        />
        <SummaryCard
          label="Deposit Room"
          value={`${summary.remainingDepositRoom.toLocaleString()} DKK`}
          sub={`${summary.depositUtilization}% of ${ASK_DEPOSIT_LIMIT_2026.toLocaleString()} used`}
          color="primary"
        />
        <SummaryCard
          label="Est. Annual Tax"
          value={`${summary.estimatedAnnualTax.toLocaleString()} DKK`}
          sub="17% lagerbeskatning"
          color="warning"
        />
        <SummaryCard
          label="Tax Saved vs Depot"
          value={`${summary.taxSavedVsRegular.toLocaleString()} DKK`}
          sub="vs 27/42% regular"
          color="gain"
        />
      </div>

      {/* Deposit Progress Bar */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">Deposit Limit Usage</span>
          <span className="text-xs text-[var(--muted)]">
            {summary.totalDeposited.toLocaleString()} / {ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK
          </span>
        </div>
        <div className="h-3 rounded-full bg-[var(--card-border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/60 transition-all duration-500"
            style={{ width: `${Math.min(100, summary.depositUtilization)}%` }}
          />
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-1.5">
          Lifetime cumulative deposits. Account growth beyond this limit is allowed.
        </p>
      </div>


      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab summary={summary} account={account} />}
      {activeTab === 'holdings' && (
        <HoldingsTab
          account={account}
          showAddHolding={showAddHolding}
          setShowAddHolding={setShowAddHolding}
          onAddHolding={handleAddHolding}
          onRemoveHolding={handleRemoveHolding}
          newSymbol={newSymbol} setNewSymbol={setNewSymbol}
          newName={newName} setNewName={setNewName}
          newShares={newShares} setNewShares={setNewShares}
          newCost={newCost} setNewCost={setNewCost}
          newPrice={newPrice} setNewPrice={setNewPrice}
        />
      )}
      {activeTab === 'deposits' && (
        <ASKDepositHistory
          account={account}
          showAddDeposit={showAddDeposit}
          setShowAddDeposit={setShowAddDeposit}
          onAddDeposit={handleAddDeposit}
          depositAmount={depositAmount}
          setDepositAmount={setDepositAmount}
          depositNote={depositNote}
          setDepositNote={setDepositNote}
          remainingRoom={summary.remainingDepositRoom}
        />
      )}
      {activeTab === 'compare' && <ASKComparison />}
      {activeTab === 'optimize' && <ASKOptimizer />}
    </div>
  );
}


// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ summary, account }: { summary: ASKSummary; account: ASKAccount }) {
  return (
    <div className="space-y-4">
      {/* Account Info */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <h2 className="text-sm font-semibold">Account Details</h2>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-[var(--muted)]">Broker</p>
            <p className="font-medium mt-0.5">{account.broker || 'Not set'}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Opened</p>
            <p className="font-medium mt-0.5">{account.createdDate}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Holdings</p>
            <p className="font-medium mt-0.5">{summary.holdingsCount} positions</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Cost Basis</p>
            <p className="font-medium mt-0.5">{summary.totalCostBasis.toLocaleString()} DKK</p>
          </div>
        </div>
      </div>

      {/* How ASK Works */}
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-[var(--primary)]" />
          How Aktiesparekonto Works
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 text-[11px] text-[var(--muted)] leading-relaxed">
          <div className="rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/20 p-3">
            <p className="font-semibold text-[var(--primary)] mb-1">17% Flat Tax</p>
            <p>All gains are taxed at just 17% — compared to 27-42% in a regular depot. The lower rate applies regardless of how large your gains are.</p>
          </div>
          <div className="rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/20 p-3">
            <p className="font-semibold text-[var(--warning)] mb-1">Lagerbeskatning</p>
            <p>Tax is calculated annually on Jan 1 based on value changes (mark-to-market). You pay tax even on unrealized gains each year.</p>
          </div>
          <div className="rounded-lg bg-[var(--gain)]/5 border border-[var(--gain)]/20 p-3">
            <p className="font-semibold text-[var(--gain)] mb-1">Deposit Limit</p>
            <p>Max {ASK_DEPOSIT_LIMIT_2026.toLocaleString()} DKK lifetime deposits (2026). Growth beyond this is fine — only deposits count toward the limit.</p>
          </div>
          <div className="rounded-lg bg-[var(--foreground)]/5 border border-[var(--card-border)] p-3">
            <p className="font-semibold mb-1">One Per Person</p>
            <p>Each CPR number can have exactly one ASK. It&apos;s linked to you personally. Choose your broker wisely.</p>
          </div>
        </div>
      </div>

      {/* Quick Tax Preview */}
      {summary.unrealizedGain !== 0 && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <h2 className="text-sm font-semibold mb-3">Tax Preview (This Year)</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Unrealized gain/loss</span>
              <span className={`font-tabular font-medium ${summary.unrealizedGain >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                {summary.unrealizedGain >= 0 ? '+' : ''}{summary.unrealizedGain.toLocaleString()} DKK
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Tax rate</span>
              <span className="font-tabular">17%</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[var(--card-border)] font-semibold">
              <span>Estimated tax liability</span>
              <span className="text-[var(--warning)] font-tabular">
                {summary.estimatedAnnualTax.toLocaleString()} DKK
              </span>
            </div>
          </div>
          <p className="text-[9px] text-[var(--muted)] mt-3">
            Based on current unrealized gains. Actual tax is calculated on Dec 31 portfolio value vs Jan 1 value, adjusted for deposits/withdrawals.
          </p>
        </div>
      )}
    </div>
  );
}


// ─── Holdings Tab ────────────────────────────────────────────────────────────

function HoldingsTab({
  account, showAddHolding, setShowAddHolding,
  onAddHolding, onRemoveHolding,
  newSymbol, setNewSymbol, newName, setNewName,
  newShares, setNewShares, newCost, setNewCost, newPrice, setNewPrice,
}: {
  account: ASKAccount;
  showAddHolding: boolean;
  setShowAddHolding: (v: boolean) => void;
  onAddHolding: (e: React.FormEvent) => void;
  onRemoveHolding: (id: string) => void;
  newSymbol: string; setNewSymbol: (v: string) => void;
  newName: string; setNewName: (v: string) => void;
  newShares: string; setNewShares: (v: string) => void;
  newCost: string; setNewCost: (v: string) => void;
  newPrice: string; setNewPrice: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Add Holding Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddHolding(!showAddHolding)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Holding
        </button>
      </div>

      {/* Add Holding Form */}
      {showAddHolding && (
        <form onSubmit={onAddHolding} className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--primary)]">Add New Holding</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" placeholder="Symbol (e.g. NOVO-B.CO)" value={newSymbol}
              onChange={e => setNewSymbol(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
              required
            />
            <input
              type="text" placeholder="Name (optional)" value={newName}
              onChange={e => setNewName(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
            />
            <input
              type="number" placeholder="Shares" value={newShares}
              onChange={e => setNewShares(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
              required min="0.01" step="0.01"
            />
            <input
              type="number" placeholder="Avg cost/share (DKK)" value={newCost}
              onChange={e => setNewCost(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
              required min="0.01" step="0.01"
            />
            <input
              type="number" placeholder="Current price/share (DKK)" value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
              required min="0.01" step="0.01"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--primary)] text-white">
              Add
            </button>
            <button type="button" onClick={() => setShowAddHolding(false)} className="px-4 py-2 rounded-lg text-xs text-[var(--muted)]">
              Cancel
            </button>
          </div>
        </form>
      )}


      {/* Holdings List */}
      {account.holdings.length === 0 ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <PiggyBank className="h-10 w-10 text-[var(--muted)] mx-auto mb-3" />
          <p className="text-sm font-medium">No holdings yet</p>
          <p className="text-xs text-[var(--muted)] mt-1">Add your ASK holdings to track performance and tax.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your ASK Holdings</h2>
            <span className="text-[10px] text-[var(--muted)]">{account.holdings.length} positions</span>
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {account.holdings.map(holding => {
              const value = holding.shares * holding.currentPricePerShare;
              const cost = holding.shares * holding.avgCostPerShare;
              const gain = value - cost;
              const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
              return (
                <div key={holding.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold truncate">{holding.symbol}</p>
                      <span className="text-[9px] text-[var(--muted)] truncate">{holding.name}</span>
                    </div>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5">
                      {holding.shares} shares @ {holding.avgCostPerShare.toFixed(0)} DKK avg
                    </p>
                  </div>
                  <div className="text-right mr-3">
                    <p className="text-xs font-medium font-tabular">{value.toLocaleString()} DKK</p>
                    <p className={`text-[10px] font-tabular flex items-center justify-end gap-0.5 ${gain >= 0 ? 'text-[var(--gain)]' : 'text-[var(--loss)]'}`}>
                      {gain >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {gain >= 0 ? '+' : ''}{gain.toFixed(0)} ({gainPct.toFixed(1)}%)
                    </p>
                  </div>
                  <button
                    onClick={() => onRemoveHolding(holding.id)}
                    className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--loss)] hover:bg-[var(--loss)]/10 transition-colors"
                    title="Remove holding"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Summary Card Component ──────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub: string;
  color: 'gain' | 'loss' | 'warning' | 'primary';
}) {
  const colorClass = {
    gain: 'text-[var(--gain)]',
    loss: 'text-[var(--loss)]',
    warning: 'text-[var(--warning)]',
    primary: 'text-[var(--primary)]',
  }[color];

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
      <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold font-tabular mt-1 ${colorClass}`}>{value}</p>
      <p className="text-[9px] text-[var(--muted)] mt-0.5">{sub}</p>
    </div>
  );
}
