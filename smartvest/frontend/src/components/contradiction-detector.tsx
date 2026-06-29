'use client';

import { AlertCircle } from 'lucide-react';

/**
 * Contradiction Detector
 *
 * Scans four scoring systems for logical conflicts:
 *   1. Beginner Score (Beginner Friendly / Intermediate / Risky)
 *   2. Traffic Light (Up / Flat / Down — 14-day trend)
 *   3. SmartVest Score (1-10 composite)
 *   4. Risk Profile filter (Conservative / Moderate / Growth)
 *
 * Flags contradictions with plain English explanations so the user
 * THINKS about the signals rather than blindly following one.
 */

interface SignalInputs {
  beginnerRating: 'Beginner Friendly' | 'Intermediate' | 'Risky' | null;
  trafficLight: 'up' | 'down' | 'flat' | null;
  trafficLightPct: number | null;
  smartScore: number | null;
  smartScoreLabel: string | null;
  safetyScore: number | null;
  momentumScore: number | null;
  valueScore: number | null;
  userProfile: 'Conservative' | 'Moderate' | 'Growth' | null;
  stockName: string;
}

interface Contradiction {
  title: string;
  explanation: string;
  thinkAbout: string;
}

export function detectContradictions(inputs: SignalInputs): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const { beginnerRating, trafficLight, trafficLightPct, smartScore, safetyScore, momentumScore, valueScore, userProfile, stockName } = inputs;

  // ─── 1. Beginner Friendly + Red Signal ─────────────────────────────────
  if (beginnerRating === 'Beginner Friendly' && trafficLight === 'down') {
    contradictions.push({
      title: 'Safe stock, but price is falling',
      explanation: `${stockName} is rated "Beginner Friendly" (low volatility, stable company) but its price has dropped ${Math.abs(trafficLightPct || 0).toFixed(1)}% over the last 14 days. A safe stock can still have bad weeks — the "Beginner Friendly" label means it's unlikely to crash 50%, not that it never goes down.`,
      thinkAbout: 'Is this a temporary dip in a quality company (potential buying opportunity), or the start of a real problem? Check the news and the reason WHY it\'s dropping.',
    });
  }

  // ─── 2. Risky stock + Green Signal ─────────────────────────────────────
  if (beginnerRating === 'Risky' && trafficLight === 'up' && (trafficLightPct || 0) > 5) {
    contradictions.push({
      title: 'Risky stock with strong momentum',
      explanation: `${stockName} is labeled "Risky" (high volatility) but it's up ${(trafficLightPct || 0).toFixed(1)}% in 14 days. This is exactly how volatile stocks work — they swing hard in both directions. Today's +10% can be next week's -15%.`,
      thinkAbout: 'Are you tempted to buy because it\'s going up? That\'s FOMO. The "Risky" label exists because this stock can reverse just as fast. Only invest money you can watch drop 30% without panicking.',
    });
  }

  // ─── 3. High Score + Red Signal ────────────────────────────────────────
  if (smartScore !== null && smartScore >= 7 && trafficLight === 'down') {
    contradictions.push({
      title: 'High quality stock in a downtrend',
      explanation: `${stockName} scores ${smartScore}/10 (${inputs.smartScoreLabel}) meaning it's a fundamentally strong company — but the price is trending down. Good companies can have bad months. The score measures quality; the signal measures recent price direction. They measure different things.`,
      thinkAbout: 'A high-quality stock at a temporarily low price can be a great buying opportunity — IF the fundamentals haven\'t changed. Or the market might know something the score doesn\'t. Research why it\'s dropping.',
    });
  }

  // ─── 4. Low Score + Appears in Smart Picks ─────────────────────────────
  // (Can't directly detect "in picks" here, but can flag low score + high momentum)
  if (smartScore !== null && smartScore < 5 && momentumScore !== null && momentumScore >= 8) {
    contradictions.push({
      title: 'Low overall score but strong momentum',
      explanation: `${stockName} only scores ${smartScore}/10 overall (pulled down by safety or value concerns), but momentum is ${momentumScore}/10. This stock is riding a wave — the price is going up — but our scoring engine thinks it's not a fundamentally good pick.`,
      thinkAbout: 'Momentum can carry a stock for weeks or months, but eventually fundamentals matter. Are you buying a quality company or just chasing a rising price? If the momentum stops, what\'s left?',
    });
  }

  // ─── 5. Conservative Profile + Risky Stock ─────────────────────────────
  if (userProfile === 'Conservative' && beginnerRating === 'Risky') {
    contradictions.push({
      title: 'This stock doesn\'t match your profile',
      explanation: `You told us you're a Conservative investor (safety first), but ${stockName} is rated "Risky." This doesn't mean you CAN'T buy it — but it means bigger swings than you said you're comfortable with.`,
      thinkAbout: 'If this stock drops 30% next month, will you panic-sell? If yes, it\'s probably too risky for you regardless of its other qualities. Stick to your profile unless you have a very specific reason.',
    });
  }

  // ─── 6. Growth Profile + Flat/Down Signal ──────────────────────────────
  if (userProfile === 'Growth' && trafficLight !== 'up' && smartScore !== null && smartScore >= 7) {
    contradictions.push({
      title: 'Good stock but no momentum',
      explanation: `As a Growth investor, you prioritize momentum — but ${stockName} is ${trafficLight === 'down' ? 'trending down' : 'flat'} despite scoring ${smartScore}/10 overall. It's a quality company that's not moving right now.`,
      thinkAbout: 'Growth investors usually want stocks already moving up. But buying quality before momentum kicks in can mean getting a better price. Are you patient enough to wait for this one to turn?',
    });
  }

  // ─── 7. High Safety + Low Value (expensive safe stock) ─────────────────
  if (safetyScore !== null && safetyScore >= 8 && valueScore !== null && valueScore < 4) {
    contradictions.push({
      title: 'Safe but expensive',
      explanation: `${stockName} is very safe (safety ${safetyScore}/10) but expensive (value ${valueScore}/10). You're paying a premium for stability. There's nothing wrong with that — but you might get less growth than expected because the price already reflects the quality.`,
      thinkAbout: 'Is paying more for safety worth it to you? If you\'re a Conservative investor, probably yes. If you want growth, an expensive safe stock might underperform.',
    });
  }

  // ─── 8. Beginner Friendly + High Score BUT Conservative says avoid ─────
  if (beginnerRating === 'Intermediate' && smartScore !== null && smartScore >= 7 && userProfile === 'Conservative' && safetyScore !== null && safetyScore < 7) {
    contradictions.push({
      title: 'Good score but your profile suggests caution',
      explanation: `${stockName} scores well overall (${smartScore}/10) but its safety score (${safetyScore}/10) is moderate — and you identified as Conservative. The overall score is boosted by value or momentum, not safety.`,
      thinkAbout: 'A high total score doesn\'t always mean "safe." Check which pillar is driving the score. For your profile, safety should be the priority over value or momentum.',
    });
  }

  return contradictions;
}

// ─── UI Component ────────────────────────────────────────────────────────────

export function ContradictionDetector({ signals }: { signals: SignalInputs }) {
  const contradictions = detectContradictions(signals);

  if (contradictions.length === 0) return null;

  return (
    <div className="mx-6 my-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-xs font-semibold text-[var(--accent)]">
          {contradictions.length} Signal Conflict{contradictions.length > 1 ? 's' : ''} — Think Before You Act
        </span>
      </div>

      {contradictions.map((c, i) => (
        <div key={i} className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
          <p className="text-xs font-semibold text-[var(--accent)]">{c.title}</p>
          <p className="text-[11px] text-[var(--foreground)]/70 mt-1.5 leading-relaxed">
            {c.explanation}
          </p>
          <div className="mt-2 pt-2 border-t border-[var(--accent)]/10">
            <p className="text-[10px] text-[var(--foreground)]/50">
              <strong>Think about:</strong> {c.thinkAbout}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
