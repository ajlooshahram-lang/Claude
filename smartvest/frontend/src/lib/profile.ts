/**
 * Risk Profile persistence layer.
 *
 * Stores the user's risk profile (from the quiz) in localStorage.
 * Persists across page refreshes and sessions.
 */

const STORAGE_KEY = 'smartvest_profile';

export type RiskProfile = 'Conservative' | 'Moderate' | 'Growth';

export interface UserProfile {
  riskProfile: RiskProfile;
  completedAt: string;  // ISO timestamp
  answers: number[];    // Raw answer indices for reference
}

export function getProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function hasCompletedQuiz(): boolean {
  return getProfile() !== null;
}

export function clearProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}
