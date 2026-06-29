'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { hasCompletedQuiz } from '@/lib/profile';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!hasCompletedOnboarding()) {
      // First-time user: show onboarding
      router.replace('/welcome');
    } else if (!hasCompletedQuiz()) {
      // Onboarding done but no quiz yet: go to quiz
      router.replace('/onboarding');
    } else {
      // Returning user: go to portfolio
      router.replace('/portfolio');
    }
  }, [router]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <p className="text-sm text-[var(--muted)]">Loading...</p>
    </div>
  );
}
