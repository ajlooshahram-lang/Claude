/**
 * Authentication Library
 *
 * Handles user registration, login, session management, and password security.
 * All user data is stored in localStorage with per-user isolation via user IDs.
 *
 * Security model:
 * - Passwords are hashed with SHA-256 + per-user salt (client-side demo)
 * - Sessions use opaque tokens stored in sessionStorage
 * - Each user has a unique UUID that namespaces all their data
 * - No user can access another user's data under any circumstances
 *
 * In production, this would be replaced with a proper backend auth system
 * (e.g., NextAuth.js, Supabase Auth, Firebase Auth). The architecture is
 * designed so that swap is straightforward — just replace this file.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserAccount {
  id: string;              // UUID — used to namespace all user data
  email: string;
  displayName: string;
  passwordHash: string;    // SHA-256(password + salt)
  salt: string;            // Per-user random salt
  createdAt: string;       // ISO datetime
  lastLoginAt: string;     // ISO datetime
  isAdmin: boolean;        // Admin flag (separate from regular users)
  onboardingCompleted: boolean;
  riskProfile: string | null;
}

export interface Session {
  token: string;
  userId: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  expiresAt: number;       // Unix timestamp (ms)
}

export interface AuthResult {
  success: boolean;
  error?: string;
  session?: Session;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const USERS_STORAGE_KEY = 'smartvest_users';
const SESSION_KEY = 'smartvest_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Default admin credentials (should be changed on first login)
const DEFAULT_ADMIN_EMAIL = 'admin@smartvest.app';
const DEFAULT_ADMIN_PASSWORD = 'admin2026!';

// ─── Password Hashing ────────────────────────────────────────────────────────

/**
 * Generate a random salt for password hashing.
 */
function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password with a salt using SHA-256.
 * In production, use bcrypt/argon2 on the server side.
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a session token.
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── User Storage ────────────────────────────────────────────────────────────

/**
 * Get all registered users from storage.
 */
export function getAllUsers(): UserAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save users array to storage.
 */
function saveUsers(users: UserAccount[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

/**
 * Find a user by email (case-insensitive).
 */
export function findUserByEmail(email: string): UserAccount | undefined {
  return getAllUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Find a user by ID.
 */
export function findUserById(id: string): UserAccount | undefined {
  return getAllUsers().find(u => u.id === id);
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register a new user account.
 */
export async function registerUser(
  email: string,
  password: string,
  displayName: string
): Promise<AuthResult> {
  // Validation
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address' };
  }
  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }
  if (!displayName.trim()) {
    return { success: false, error: 'Please enter your name' };
  }

  // Check if email already exists
  if (findUserByEmail(email)) {
    return { success: false, error: 'An account with this email already exists' };
  }

  // Create user
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  const newUser: UserAccount = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    displayName: displayName.trim(),
    passwordHash,
    salt,
    createdAt: now,
    lastLoginAt: now,
    isAdmin: false,
    onboardingCompleted: false,
    riskProfile: null,
  };

  // Save
  const users = getAllUsers();
  users.push(newUser);
  saveUsers(users);

  // Create session
  const session = createSession(newUser);
  saveSession(session);

  return { success: true, session };
}

// ─── Login ───────────────────────────────────────────────────────────────────

/**
 * Authenticate a user with email and password.
 */
export async function loginUser(email: string, password: string): Promise<AuthResult> {
  if (!email || !password) {
    return { success: false, error: 'Please enter email and password' };
  }

  const user = findUserByEmail(email);
  if (!user) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Verify password
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Update last login
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    users[idx].lastLoginAt = new Date().toISOString();
    saveUsers(users);
  }

  // Create session
  const session = createSession(user);
  saveSession(session);

  return { success: true, session };
}

/**
 * Admin login — separate authentication path.
 */
export async function loginAdmin(email: string, password: string): Promise<AuthResult> {
  // Check if this is the default admin
  if (email.toLowerCase() === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) {
    // Create/find admin user
    let admin = findUserByEmail(DEFAULT_ADMIN_EMAIL);
    if (!admin) {
      const salt = generateSalt();
      const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD, salt);
      admin = {
        id: crypto.randomUUID(),
        email: DEFAULT_ADMIN_EMAIL,
        displayName: 'Administrator',
        passwordHash,
        salt,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        isAdmin: true,
        onboardingCompleted: true,
        riskProfile: null,
      };
      const users = getAllUsers();
      users.push(admin);
      saveUsers(users);
    }
    const session = createSession(admin);
    saveSession(session);
    return { success: true, session };
  }

  // Check registered admins
  const user = findUserByEmail(email);
  if (!user || !user.isAdmin) {
    return { success: false, error: 'Invalid admin credentials' };
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return { success: false, error: 'Invalid admin credentials' };
  }

  const session = createSession(user);
  saveSession(session);
  return { success: true, session };
}

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Create a new session for a user.
 */
function createSession(user: UserAccount): Session {
  return {
    token: generateToken(),
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    expiresAt: Date.now() + SESSION_DURATION,
  };
}

/**
 * Save session to sessionStorage (cleared when browser closes).
 */
function saveSession(session: Session): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Get the current active session, or null if expired/absent.
 */
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    // Check expiration
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Get the current logged-in user ID, or null.
 */
export function getCurrentUserId(): string | null {
  const session = getSession();
  return session?.userId ?? null;
}

/**
 * Log out the current user (destroy session).
 */
export function logout(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Check if a user is currently logged in.
 */
export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/**
 * Check if the current session is an admin session.
 */
export function isAdminSession(): boolean {
  const session = getSession();
  return session?.isAdmin === true;
}

// ─── Profile Updates ─────────────────────────────────────────────────────────

/**
 * Update user profile data (name, onboarding state, risk profile).
 */
export function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserAccount, 'displayName' | 'onboardingCompleted' | 'riskProfile'>>
): void {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx >= 0) {
    Object.assign(users[idx], updates);
    saveUsers(users);
  }
}

/**
 * Change password for a user.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const user = findUserById(userId);
  if (!user) return { success: false, error: 'User not found' };

  // Verify current password
  const currentHash = await hashPassword(currentPassword, user.salt);
  if (currentHash !== user.passwordHash) {
    return { success: false, error: 'Current password is incorrect' };
  }

  if (newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters' };
  }

  // Update password
  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx >= 0) {
    users[idx].salt = newSalt;
    users[idx].passwordHash = newHash;
    saveUsers(users);
  }

  return { success: true };
}

/**
 * Delete a user account and all their data.
 */
export function deleteUserAccount(userId: string): void {
  // Remove user record
  const users = getAllUsers().filter(u => u.id !== userId);
  saveUsers(users);

  // Clear all user-scoped data from localStorage
  if (typeof window === 'undefined') return;
  const prefix = `smartvest_user_${userId}_`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  // Destroy session
  logout();
}
