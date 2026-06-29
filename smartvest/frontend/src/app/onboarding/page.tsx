'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ArrowRight, CheckCircle2 } from 'lucide-react';
import { saveProfile, RiskProfile } from '@/lib/profile';

// ─── Quiz Data ───────────────────────────────────────────────────────────────

interface Question {
  question: string;
  options: { text: string; points: number }[];
}

const QUESTIONS: Question[] = [
  {
    question: "If a stock you bought dropped 20% in one week, what would you do?",
    options: [
      { text: "Sell immediately — I can't afford to lose more", points: 1 },
      { text: "Feel nervous but hold and wait for recovery", points: 2 },
      { text: "Buy more — it's now cheaper!", points: 3 },
    ],
  },
  {
    question: "How long do you plan to keep your money invested?",
    options: [
      { text: "Less than 1 year — I might need it soon", points: 1 },
      { text: "1 to 3 years", points: 2 },
      { text: "3+ years — I'm in it for the long run", points: 3 },
    ],
  },
  {
    question: "What matters most to you?",
    options: [
      { text: "Protecting my money — I don't want to lose anything", points: 1 },
      { text: "Steady growth with some safety net", points: 2 },
      { text: "Maximum growth — I'll accept the ups and downs", points: 3 },
    ],
  },
  {
    question: "How much of your savings are you investing?",
    options: [
      { text: "A large portion — this is most of my spare money", points: 1 },
      { text: "A moderate amount — I still have a safety buffer", points: 2 },
      { text: "A small portion — I can afford to lose it all", points: 3 },
    ],
  },
  {
    question: "How would you describe your investing experience?",
    options: [
      { text: "I've never invested before", points: 1 },
      { text: "I understand the basics but haven't done much", points: 2 },
      { text: "I've invested before and I'm comfortable with risk", points: 3 },
    ],
  },
];

// ─── Scoring Logic ───────────────────────────────────────────────────────────
// Total points range: 5 (all conservative answers) to 15 (all aggressive)
//   5-8  → Conservative
//   9-11 → Moderate
//  12-15 → Growth

function calculateProfile(answers: number[]): RiskProfile {
  const total = answers.reduce((sum, idx, qIdx) => {
    return sum + QUESTIONS[qIdx].options[idx].points;
  }, 0);

  if (total <= 8) return 'Conservative';
  if (total <= 11) return 'Moderate';
  return 'Growth';
}

const PROFILE_INFO: Record<RiskProfile, { color: string; emoji: string; description: string }> = {
  Conservative: {
    color: 'text-[var(--gain)]',
    emoji: '🛡️',
    description: "You prioritize protecting your money. We'll focus on stable, low-risk stocks with steady dividends. Slower growth, but you'll sleep well at night.",
  },
  Moderate: {
    color: 'text-[var(--primary)]',
    emoji: '⚖️',
    description: "You want a balance of safety and growth. We'll mix stable dividend stocks with some higher-growth opportunities. A sensible middle ground.",
  },
  Growth: {
    color: 'text-[var(--warning)]',
    emoji: '🚀',
    description: "You're comfortable with bigger swings for bigger potential gains. We'll still warn you about extreme risks, but won't hold you back from opportunities.",
  },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<RiskProfile | null>(null);

  function handleAnswer(optionIndex: number) {
    const newAnswers = [...answers, optionIndex];
    setAnswers(newAnswers);

    if (currentQ < QUESTIONS.length - 1) {
      // Next question
      setCurrentQ(currentQ + 1);
    } else {
      // Quiz complete — calculate and save
      const profile = calculateProfile(newAnswers);
      setResult(profile);
      saveProfile({
        riskProfile: profile,
        completedAt: new Date().toISOString(),
        answers: newAnswers,
      });
    }
  }

  function handleFinish() {
    router.push('/portfolio');
  }

  // ─── Result Screen ───
  if (result) {
    const info = PROFILE_INFO[result];
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-2xl bg-white/5 flex items-center justify-center text-4xl">
              {info.emoji}
            </div>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)] mb-1">Your investor profile</p>
            <h1 className={`text-3xl font-bold ${info.color}`}>{result}</h1>
          </div>
          <p className="text-sm text-[var(--foreground)]/70 leading-relaxed">
            {info.description}
          </p>
          <button
            onClick={handleFinish}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <CheckCircle2 className="h-4 w-4" />
            Start Using SmartVest
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-[10px] text-[var(--muted)]">
            You can change this later in Settings.
          </p>
        </div>
      </div>
    );
  }

  // ─── Quiz Screen ───
  const q = QUESTIONS[currentQ];
  const progress = ((currentQ) / QUESTIONS.length) * 100;

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-[var(--primary)]" />
            </div>
          </div>
          <h1 className="text-xl font-bold">Risk Profile Quiz</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            5 quick questions so we can personalize your experience
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-[var(--muted)] mb-1">
            <span>Question {currentQ + 1} of {QUESTIONS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <p className="text-base font-medium leading-relaxed mb-5">
            {q.question}
          </p>
          <div className="space-y-3">
            {q.options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                className="w-full text-left rounded-lg border border-[var(--card-border)] px-4 py-3.5 text-sm hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 transition-colors"
              >
                {option.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
