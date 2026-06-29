'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ArrowRight, User, CheckCircle2, Bookmark, Target, DollarSign } from 'lucide-react';
import { completeOnboarding } from '@/lib/onboarding';

type Step = 1 | 2 | 3;

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');

  function handleFinish() {
    completeOnboarding(name || 'Investor');
    router.replace('/onboarding'); // Go to risk quiz
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center">
      <div className="max-w-md w-full">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s === step ? 'w-6 bg-[var(--primary)]' :
                s < step ? 'w-2 bg-[var(--primary)]/50' :
                'w-2 bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Step 1: What the app does */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
                <Shield className="h-10 w-10 text-[var(--primary)]" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Welcome to SmartVest</h1>
              <p className="text-sm text-[var(--foreground)]/70 mt-3 leading-relaxed max-w-sm mx-auto">
                SmartVest helps you find good stocks to invest in — even if you&apos;ve never invested before.
                It scores every stock for safety, value, and momentum, and explains everything in plain English so you always understand what you&apos;re doing with your money.
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Ask for name */}
        {step === 2 && (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
                <User className="h-10 w-10 text-[var(--accent)]" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold">What&apos;s your first name?</h1>
              <p className="text-sm text-[var(--muted)] mt-2">
                So the app can greet you personally
              </p>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              className="w-full max-w-xs mx-auto block rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 text-center text-lg font-medium outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted)]"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep(3); }}
            />
            <button
              onClick={() => setStep(3)}
              disabled={!name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setName('Investor'); setStep(3); }}
              className="block mx-auto text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Skip this step
            </button>
          </div>
        )}

        {/* Step 3: Three things to do first */}
        {step === 3 && (
          <div className="text-center space-y-6">
            <div>
              <h1 className="text-2xl font-bold">
                Welcome{name && name !== 'Investor' ? `, ${name}` : ''}! Here&apos;s your plan.
              </h1>
              <p className="text-sm text-[var(--muted)] mt-2">
                Three simple steps to get started
              </p>
            </div>

            <div className="space-y-3 text-left max-w-sm mx-auto">
              <StepCard
                number={1}
                icon={<Target className="h-5 w-5 text-[var(--gain)]" />}
                title="Complete your risk profile"
                description="5 quick questions so the app knows whether to show you safe stocks or growth stocks"
              />
              <StepCard
                number={2}
                icon={<Bookmark className="h-5 w-5 text-[var(--primary)]" />}
                title="Add stocks to your watchlist"
                description="Search for companies you know and save the ones you find interesting"
              />
              <StepCard
                number={3}
                icon={<DollarSign className="h-5 w-5 text-[var(--warning)]" />}
                title="Set your monthly budget"
                description="Tell the app how much you can invest each month — even 500 DKK is a great start"
              />
            </div>

            <button
              onClick={handleFinish}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <CheckCircle2 className="h-4 w-4" />
              Let&apos;s do it — start the risk quiz
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({ number, icon, title, description }: {
  number: number; icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
