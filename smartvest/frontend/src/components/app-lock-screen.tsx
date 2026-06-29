'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Fingerprint, Lock } from 'lucide-react';
import {
  isLockEnabled, isPINSet, shouldLock, verifyPIN,
  recordActivity, isBiometricSupported, authenticateWithBiometric,
  setPIN,
} from '@/lib/app-lock';

/**
 * AppLockScreen — overlays the entire app when locked.
 *
 * Shows after 5 minutes of inactivity.
 * User unlocks via:
 *   1. Fingerprint/face (WebAuthn) if supported
 *   2. 4-digit PIN (always available as fallback)
 *
 * If no PIN is set, shows a one-time setup screen.
 */
export function AppLockScreen() {
  const [locked, setLocked] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const activityTimer = useRef<NodeJS.Timeout | null>(null);

  // Check lock state on mount
  useEffect(() => {
    if (!isLockEnabled()) {
      // If lock not enabled but PIN is set, still check
      if (!isPINSet()) return;
    }

    setBiometricAvailable(isBiometricSupported());

    if (shouldLock()) {
      setLocked(true);
    }

    // Track activity: reset timer on any interaction
    function handleActivity() {
      recordActivity();
    }

    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);

    // Check lock status periodically
    activityTimer.current = setInterval(() => {
      if (shouldLock() && !locked) {
        setLocked(true);
      }
    }, 30000); // Check every 30 seconds

    // Record initial activity
    recordActivity();

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      if (activityTimer.current) clearInterval(activityTimer.current);
    };
  }, [locked]);

  function handleUnlockWithPIN() {
    if (verifyPIN(pin)) {
      setLocked(false);
      setPin('');
      setError('');
      recordActivity();
    } else {
      setError('Wrong PIN. Try again.');
      setPin('');
    }
  }

  async function handleUnlockWithBiometric() {
    const success = await authenticateWithBiometric();
    if (success) {
      setLocked(false);
      recordActivity();
    } else {
      setError('Biometric failed. Use your PIN instead.');
    }
  }

  function handleSetupPIN(newPin: string) {
    setPIN(newPin);
    setShowSetup(false);
    setLocked(false);
    recordActivity();
  }

  // Not locked → render nothing (app shows normally)
  if (!locked && !showSetup) return null;

  // PIN setup (first time)
  if (showSetup || (locked && !isPINSet())) {
    return <PINSetup onComplete={handleSetupPIN} />;
  }

  // Lock screen
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--background)]">
      <div className="max-w-xs w-full text-center space-y-6 px-4">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-[var(--primary)]" />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold">SmartVest Locked</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Locked after 5 minutes of inactivity
          </p>
        </div>

        {/* Biometric button */}
        {biometricAvailable && (
          <button
            onClick={handleUnlockWithBiometric}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 py-3 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors"
          >
            <Fingerprint className="h-5 w-5" />
            Unlock with Fingerprint
          </button>
        )}

        {/* PIN input */}
        <div>
          <p className="text-xs text-[var(--muted)] mb-2">
            {biometricAvailable ? 'Or enter your PIN:' : 'Enter your 4-digit PIN:'}
          </p>
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-12 w-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${
                  pin.length > i
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--card-border)]'
                }`}
              >
                {pin.length > i ? '•' : ''}
              </div>
            ))}
          </div>

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-2 mt-4 max-w-[200px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, i) => {
              if (key === null) return <div key={i} />;
              if (key === 'del') {
                return (
                  <button
                    key={i}
                    onClick={() => setPin(p => p.slice(0, -1))}
                    className="h-12 rounded-lg bg-white/5 text-sm text-[var(--muted)] hover:bg-white/10"
                  >
                    ←
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => {
                    const next = pin + key.toString();
                    setPin(next);
                    if (next.length === 4) {
                      // Auto-submit on 4th digit
                      setTimeout(() => {
                        if (verifyPIN(next)) {
                          setLocked(false);
                          setPin('');
                          setError('');
                          recordActivity();
                        } else {
                          setError('Wrong PIN. Try again.');
                          setPin('');
                        }
                      }, 200);
                    }
                  }}
                  className="h-12 rounded-lg bg-white/5 text-lg font-medium hover:bg-white/10 transition-colors"
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-[var(--loss)]">{error}</p>
        )}
      </div>
    </div>
  );
}

// ─── PIN Setup Screen ────────────────────────────────────────────────────────

function PINSetup({ onComplete }: { onComplete: (pin: string) => void }) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleDigit(digit: number) {
    const next = pin + digit.toString();
    setPin(next);

    if (next.length === 4) {
      if (step === 'enter') {
        setFirstPin(next);
        setPin('');
        setStep('confirm');
      } else {
        if (next === firstPin) {
          onComplete(next);
        } else {
          setError('PINs don\'t match. Start over.');
          setPin('');
          setStep('enter');
          setFirstPin('');
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--background)]">
      <div className="max-w-xs w-full text-center space-y-6 px-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-[var(--primary)]" />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold">Set Up App Lock</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {step === 'enter'
              ? 'Choose a 4-digit PIN to protect your app'
              : 'Enter the same PIN again to confirm'
            }
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-12 w-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${
                pin.length > i
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--card-border)]'
              }`}
            >
              {pin.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, i) => {
            if (key === null) return <div key={i} />;
            if (key === 'del') {
              return (
                <button key={i} onClick={() => setPin(p => p.slice(0, -1))}
                  className="h-12 rounded-lg bg-white/5 text-sm text-[var(--muted)]">←</button>
              );
            }
            return (
              <button key={i} onClick={() => handleDigit(key as number)}
                className="h-12 rounded-lg bg-white/5 text-lg font-medium hover:bg-white/10">
                {key}
              </button>
            );
          })}
        </div>

        {error && <p className="text-xs text-[var(--loss)]">{error}</p>}
      </div>
    </div>
  );
}
