/**
 * Mistake Pattern Detector
 *
 * Analyzes order history to identify repeated behavioral patterns.
 * When the user is about to do something that matches a known mistake,
 * shows a warning with a specific past example.
 *
 * Patterns detected:
 *   1. Selling winners too early (sold profitable stocks within 2 weeks)
 *   2. Holding losers too long (held losing stocks 3x longer than winners)
 *   3. Chasing momentum (bought stocks after big run-ups, then lost money)
 *   4. Revenge trading (bought again quickly after a loss on same stock)
 *   5. Size escalation (increasing position size after losses — doubling down)
 *
 * This is a MIRROR, not a block. Shows the pattern, doesn't prevent action.
 */

import { getOrders, Order } from './orders';

export interface MistakePattern {
  id: string;
  name: string;
  description: string;
  frequency: number;        // How many times detected in history
  lastOccurrence: string;   // Date of most recent instance
  example: {
    what: string;           // What you did
    outcome: string;        // What happened after
    cost: string;           // What it cost you (money or opportunity)
  };
}

export interface PreTradeWarning {
  pattern: string;
  severity: 'likely' | 'possible';
  message: string;
  historicalExample: string;
  whatHappenedLast: string;
}

/**
 * Analyze full order history and return detected patterns.
 */
export function detectMistakePatterns(): MistakePattern[] {
  const orders = getOrders();
  const patterns: MistakePattern[] = [];
  const buys = orders.filter(o => o.type === 'buy');
  const sells = orders.filter(o => o.type === 'sell');

  if (orders.length < 4) return patterns;

  // ─── 1. Selling Winners Too Early ────────────────────────────────────
  // Pattern: sold a profitable stock within 14 days
  const earlyWinnerSells: { sell: Order; buy: Order; days: number; gainPct: number }[] = [];
  for (const sell of sells) {
    const buy = buys.find(b => b.symbol === sell.symbol && b.pricePerShare < sell.pricePerShare);
    if (!buy) continue;
    const days = (new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000*60*60*24);
    const gainPct = ((sell.pricePerShare - buy.pricePerShare) / buy.pricePerShare) * 100;
    if (days < 14 && gainPct > 3) {
      earlyWinnerSells.push({ sell, buy, days: Math.round(days), gainPct });
    }
  }

  if (earlyWinnerSells.length >= 2) {
    const latest = earlyWinnerSells[0];
    patterns.push({
      id: 'sell_winners_early',
      name: 'Selling Winners Too Early',
      description: 'You tend to sell profitable stocks within days of buying them — locking in small gains but missing larger moves.',
      frequency: earlyWinnerSells.length,
      lastOccurrence: latest.sell.date,
      example: {
        what: `Sold ${latest.sell.symbol} after ${latest.days} days with a ${latest.gainPct.toFixed(1)}% gain.`,
        outcome: 'You took the quick profit, but stocks that are rising often continue rising for weeks or months.',
        cost: `If you'd held 30 more days, you might have captured a larger move. Small wins don't compound — big winners do.`,
      },
    });
  }

  // ─── 2. Holding Losers Too Long ──────────────────────────────────────
  // Pattern: held losing stocks significantly longer than winners before selling
  const loserHolds: { sell: Order; buy: Order; days: number; lossPct: number }[] = [];
  const winnerHolds: number[] = [];

  for (const sell of sells) {
    const buy = buys.find(b => b.symbol === sell.symbol);
    if (!buy) continue;
    const days = (new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000*60*60*24);
    const pct = ((sell.pricePerShare - buy.pricePerShare) / buy.pricePerShare) * 100;
    if (pct < -5) {
      loserHolds.push({ sell, buy, days: Math.round(days), lossPct: pct });
    } else if (pct > 3) {
      winnerHolds.push(days);
    }
  }

  if (loserHolds.length >= 2 && winnerHolds.length >= 1) {
    const avgWinnerHold = winnerHolds.reduce((a, b) => a + b, 0) / winnerHolds.length;
    const avgLoserHold = loserHolds.reduce((a, b) => a + b.days, 0) / loserHolds.length;
    if (avgLoserHold > avgWinnerHold * 2) {
      const worst = loserHolds.sort((a, b) => a.lossPct - b.lossPct)[0];
      patterns.push({
        id: 'hold_losers_long',
        name: 'Holding Losers Too Long',
        description: `You hold losing stocks ${(avgLoserHold / avgWinnerHold).toFixed(1)}x longer than winners. You're quick to take profits but slow to cut losses.`,
        frequency: loserHolds.length,
        lastOccurrence: worst.sell.date,
        example: {
          what: `Held ${worst.sell.symbol} for ${worst.days} days while it dropped ${Math.abs(worst.lossPct).toFixed(1)}%.`,
          outcome: 'You waited hoping for recovery while the loss deepened.',
          cost: `That money was trapped in a loser when it could have been in a winner. Your avg winner hold is only ${Math.round(avgWinnerHold)} days.`,
        },
      });
    }
  }

  // ─── 3. Chasing Momentum ─────────────────────────────────────────────
  // Pattern: bought a stock and it immediately dropped (bought at the top)
  const chaseBuys: { buy: Order; sell: Order; lossPct: number }[] = [];
  for (const buy of buys) {
    const laterSell = sells.find(s =>
      s.symbol === buy.symbol &&
      new Date(s.date) > new Date(buy.date) &&
      s.pricePerShare < buy.pricePerShare
    );
    if (laterSell) {
      const lossPct = ((laterSell.pricePerShare - buy.pricePerShare) / buy.pricePerShare) * 100;
      if (lossPct < -8) {
        chaseBuys.push({ buy, sell: laterSell, lossPct });
      }
    }
  }

  if (chaseBuys.length >= 2) {
    const worst = chaseBuys.sort((a, b) => a.lossPct - b.lossPct)[0];
    patterns.push({
      id: 'chase_momentum',
      name: 'Chasing Momentum',
      description: 'You buy stocks after they\'ve already run up, then lose money when they correct. You\'re arriving at the party after it\'s over.',
      frequency: chaseBuys.length,
      lastOccurrence: worst.buy.date,
      example: {
        what: `Bought ${worst.buy.symbol} at ${worst.buy.currency} ${worst.buy.pricePerShare.toFixed(2)} — it then dropped ${Math.abs(worst.lossPct).toFixed(1)}%.`,
        outcome: 'You bought excitement, not value. The stock had already moved before you arrived.',
        cost: `Lost ${Math.abs(worst.lossPct).toFixed(1)}% on this trade. FOMO buying is the most expensive emotion in investing.`,
      },
    });
  }

  // ─── 4. Revenge Trading ──────────────────────────────────────────────
  // Pattern: bought the same stock again within a week of selling it at a loss
  for (const sell of sells) {
    const buy = buys.find(b => b.symbol === sell.symbol && b.pricePerShare > sell.pricePerShare);
    if (!buy) continue;
    const rebuy = buys.find(b =>
      b.symbol === sell.symbol &&
      new Date(b.date) > new Date(sell.date) &&
      (new Date(b.date).getTime() - new Date(sell.date).getTime()) < 7 * 24 * 60 * 60 * 1000
    );
    if (rebuy) {
      patterns.push({
        id: 'revenge_trade',
        name: 'Revenge Trading',
        description: 'After selling at a loss, you bought the same stock back within a week — trying to "make it back."',
        frequency: 1,
        lastOccurrence: rebuy.date,
        example: {
          what: `Sold ${sell.symbol} at a loss, then bought it again ${Math.round((new Date(rebuy.date).getTime() - new Date(sell.date).getTime()) / (1000*60*60*24))} days later.`,
          outcome: 'Revenge trading is emotional, not rational. The stock doesn\'t know you lost money on it.',
          cost: 'Each revenge trade compounds the original mistake with fees, tax events, and more emotional pressure.',
        },
      });
      break; // Only report first instance
    }
  }

  // ─── 5. Size Escalation ──────────────────────────────────────────────
  // Pattern: position sizes getting larger over time (often after losses)
  if (buys.length >= 4) {
    const recentBuys = buys.slice(0, Math.floor(buys.length / 2));
    const earlyBuys = buys.slice(Math.floor(buys.length / 2));
    const avgRecent = recentBuys.reduce((s, b) => s + b.totalCost, 0) / recentBuys.length;
    const avgEarly = earlyBuys.reduce((s, b) => s + b.totalCost, 0) / earlyBuys.length;

    if (avgRecent > avgEarly * 1.8) {
      const biggest = recentBuys.sort((a, b) => b.totalCost - a.totalCost)[0];
      patterns.push({
        id: 'size_escalation',
        name: 'Size Escalation',
        description: `Your recent trades are ${(avgRecent / avgEarly).toFixed(1)}x larger than your early ones. You may be "betting bigger to win back losses."`,
        frequency: recentBuys.length,
        lastOccurrence: biggest.date,
        example: {
          what: `Largest recent buy: ${biggest.symbol} for ${biggest.currency} ${biggest.totalCost.toFixed(0)} (your early average was ${avgEarly.toFixed(0)}).`,
          outcome: 'Increasing size after losses amplifies risk. If this trade also loses, the damage is much worse.',
          cost: 'Professional traders do the opposite — they reduce size after losses to protect remaining capital.',
        },
      });
    }
  }

  return patterns;
}

/**
 * Check if a proposed action matches a known mistake pattern.
 * Call this before confirming a buy or sell.
 */
export function checkPreTradeWarning(
  action: 'buy' | 'sell',
  symbol: string,
  price: number,
): PreTradeWarning | null {
  const patterns = detectMistakePatterns();
  const orders = getOrders();
  const buys = orders.filter(o => o.type === 'buy');
  const sells = orders.filter(o => o.type === 'sell');

  if (action === 'sell') {
    // Check: selling a winner too early?
    const hasEarlyWinPattern = patterns.find(p => p.id === 'sell_winners_early');
    const matchingBuy = buys.find(b => b.symbol === symbol);
    if (hasEarlyWinPattern && matchingBuy) {
      const days = (Date.now() - new Date(matchingBuy.date).getTime()) / (1000*60*60*24);
      const gainPct = ((price - matchingBuy.pricePerShare) / matchingBuy.pricePerShare) * 100;
      if (days < 14 && gainPct > 3) {
        return {
          pattern: 'Selling Winners Too Early',
          severity: 'likely',
          message: `You're about to sell ${symbol} after only ${Math.round(days)} days with a ${gainPct.toFixed(1)}% gain. You've done this ${hasEarlyWinPattern.frequency} times before.`,
          historicalExample: hasEarlyWinPattern.example.what,
          whatHappenedLast: hasEarlyWinPattern.example.outcome,
        };
      }
    }
  }

  if (action === 'buy') {
    // Check: revenge trading?
    const recentSell = sells.find(s =>
      s.symbol === symbol &&
      (Date.now() - new Date(s.date).getTime()) < 7 * 24 * 60 * 60 * 1000
    );
    const wasProfitable = recentSell && buys.find(b => b.symbol === symbol && b.pricePerShare < (recentSell?.pricePerShare || 0));
    if (recentSell && !wasProfitable) {
      return {
        pattern: 'Revenge Trading',
        severity: 'likely',
        message: `You sold ${symbol} at a loss ${Math.round((Date.now() - new Date(recentSell.date).getTime()) / (1000*60*60*24))} days ago and now you're buying it back. This looks like revenge trading.`,
        historicalExample: `Previously: sold at loss then immediately rebought — the stock doesn't know you lost money on it.`,
        whatHappenedLast: 'Revenge trades compound the original mistake with extra fees and emotional pressure.',
      };
    }

    // Check: chasing momentum (buying after a stock already ran up)?
    const hasChasePattern = patterns.find(p => p.id === 'chase_momentum');
    if (hasChasePattern && hasChasePattern.frequency >= 2) {
      return {
        pattern: 'Possible Momentum Chasing',
        severity: 'possible',
        message: `You've lost money ${hasChasePattern.frequency} times buying stocks that had already run up. Make sure you're buying this because of value, not excitement.`,
        historicalExample: hasChasePattern.example.what,
        whatHappenedLast: hasChasePattern.example.outcome,
      };
    }
  }

  return null;
}
