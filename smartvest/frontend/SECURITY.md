# Security Architecture

## Authentication

| Aspect | Before (v1) | After (v2) |
|--------|-------------|------------|
| Password hashing | SHA-256 + salt (client-side) | **bcrypt 10 rounds (server-side via Supabase)** |
| Session storage | sessionStorage (client) | **Supabase secure tokens (httpOnly)** |
| Session expiry | 24hr (client-checked) | **1hr access token + 7-day refresh token (server-validated)** |
| Token validation | Client-only (trust the browser) | **Server-side validation on every request** |
| Data isolation | Application-level namespacing | **Row Level Security (PostgreSQL-enforced)** |

## Data Isolation Proof

**Can a user see another user's portfolio by manipulating the browser console?**

**NO.** Here's why:

1. Every table has Row Level Security (RLS) enabled
2. Every SELECT policy is: `auth.uid() = user_id`
3. This is enforced by PostgreSQL itself, not by application code
4. Even if you call `supabase.from('holdings').select('*')` directly in the console, you ONLY get your own rows
5. The `user_id` column is set by the server based on the authenticated session — it cannot be spoofed

**Test it yourself:**
```javascript
// In browser console while logged in as User A:
const { data } = await supabase.from('holdings').select('*')
// → Returns ONLY User A's holdings

// Try to read User B's data:
const { data: hack } = await supabase.from('holdings').select('*').eq('user_id', 'user-b-uuid')
// → Returns EMPTY (RLS blocks it)

// Try to insert with someone else's user_id:
const { error } = await supabase.from('holdings').insert({ user_id: 'user-b-uuid', symbol: 'HACK', ... })
// → ERROR: new row violates RLS policy
```

## Session Security

- **Access token:** Valid for 1 hour. Stored in browser memory (not localStorage).
- **Refresh token:** Valid for 7 days. Used to get a new access token without re-login.
- **After 7 days of inactivity:** User must re-enter password.
- **Token refresh is automatic:** User stays logged in during active use.
- **signOut() clears all tokens** from browser storage.

## Password Requirements

- Minimum 8 characters (enforced both client and server-side)
- Hashed with **bcrypt (10 rounds)** by Supabase Auth
- Passwords are NEVER stored in plaintext, in transit, or in logs
- Rate limiting on login attempts (Supabase built-in)

## What's Still Needed for Production

1. **Email confirmation** — Enable in Supabase Auth settings
2. **Rate limiting** — Already built-in to Supabase (login throttling)
3. **2FA (TOTP)** — Available via Supabase Auth, not yet enabled
4. **HTTPS** — Enforced by Vercel automatically
5. **CSP headers** — Add Content-Security-Policy in next.config.js

## Fallback Mode

When `NEXT_PUBLIC_SUPABASE_URL` is not set:
- Auth falls back to the original localStorage-based system
- This is ONLY for local development
- **Never deploy to production without Supabase configured**
