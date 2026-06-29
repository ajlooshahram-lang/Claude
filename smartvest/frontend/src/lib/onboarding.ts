/**
 * Onboarding persistence.
 *
 * Tracks whether the user has completed the initial onboarding flow.
 * Also stores their first name for personalized greetings.
 */

const STORAGE_KEY = 'smartvest_onboarding';

export interface OnboardingData {
  completed: boolean;
  firstName: string;
  completedAt: string;
}

export function getOnboarding(): OnboardingData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function completeOnboarding(firstName: string): void {
  const data: OnboardingData = {
    completed: true,
    firstName: firstName.trim(),
    completedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function hasCompletedOnboarding(): boolean {
  const data = getOnboarding();
  return data?.completed === true;
}

export function getUserFirstName(): string {
  const data = getOnboarding();
  return data?.firstName || '';
}
