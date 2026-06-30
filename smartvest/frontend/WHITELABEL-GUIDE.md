# White-Label Deployment Guide

## Deploy Your Own Branded Investment Platform in Under 30 Minutes

This guide walks you through deploying your own fully branded version of this investment platform. **No coding experience required.** You will edit one configuration file and click a few buttons.

---

## What You Get

A professional investment platform with:
- Your own brand name, logo, and colors
- Your choice of which features to include
- Your preferred currency and market focus
- Your broker API connection
- Hosted on your own URL (e.g., `invest.yourcompany.com`)

---

## Prerequisites

Before starting, you need:

| Item | How to get it | Time |
|------|---------------|------|
| GitHub account | [github.com/signup](https://github.com/signup) | 2 min |
| Vercel account | [vercel.com/signup](https://vercel.com/signup) (sign up with GitHub) | 1 min |
| Your logo file | PNG or SVG, any size (optional) | — |
| Your brand colors | Pick at [coolors.co](https://coolors.co) (hex codes like `#3b82f6`) | 5 min |

**Total setup time: ~25 minutes**

---

## Step 1: Fork the Repository (3 minutes)

1. Go to the repository on GitHub
2. Click the **"Fork"** button (top right)
3. This creates your own copy — you can change anything without affecting the original
4. Your fork lives at `github.com/YOUR-USERNAME/Claude`

---

## Step 2: Edit the Configuration File (10 minutes)

This is the only file you need to change: **`smartvest/frontend/smartvest.config.ts`**

### How to edit on GitHub:

1. In your forked repo, navigate to `smartvest/frontend/smartvest.config.ts`
2. Click the **pencil icon** (Edit this file) in the top right
3. Make your changes (see sections below)
4. Click **"Commit changes"** at the bottom

### What to change:

#### A. Your Brand Name & Logo

```typescript
branding: {
  appName: 'YourAppName',              // ← Your app's name
  tagline: 'Smart Investing Made Easy', // ← Shown in browser tab
  logo: {
    type: 'url',                        // ← 'url', 'svg', or 'text'
    value: '/logo.png',                 // ← Path to your logo (see Step 3)
  },
  companyName: 'Your Company',
  companyUrl: 'https://yoursite.com',
  supportEmail: 'help@yoursite.com',
},
```

**Logo options:**
- `type: 'url'` → Put a logo file in `smartvest/frontend/public/logo.png`
- `type: 'text'` → Just shows your app name with a colored icon (simplest!)
- `type: 'svg'` → Paste SVG code directly (advanced)

#### B. Your Colors

```typescript
theme: {
  colors: {
    primary: '#3b82f6',      // ← Main brand color (buttons, links)
    primaryHover: '#2563eb', // ← Slightly darker version of primary
    secondary: '#8b5cf6',    // ← Accent color
    gain: '#22c55e',         // ← "Positive" color (green)
    loss: '#ef4444',         // ← "Negative" color (red)
    warning: '#f59e0b',      // ← Warning color (amber)
    // ... other colors control backgrounds, text, cards
  },
  defaultMode: 'dark',       // ← Start in 'dark' or 'light' mode
  allowThemeToggle: true,    // ← Let users switch modes?
},
```

**Popular color combinations:**

| Style | Primary | Secondary | Notes |
|-------|---------|-----------|-------|
| Professional Blue | `#3b82f6` | `#8b5cf6` | Default, trustworthy |
| Finance Green | `#059669` | `#0891b2` | Traditional finance |
| Modern Purple | `#7c3aed` | `#ec4899` | Trendy, younger audience |
| Minimalist Black | `#171717` | `#525252` | Ultra-clean |
| Bold Orange | `#ea580c` | `#dc2626` | High-energy |

#### C. Your Market & Currency

```typescript
locale: {
  defaultCurrency: 'USD',          // ← EUR, GBP, SEK, NOK, DKK, etc.
  currencySymbol: '$',             // ← Symbol shown next to numbers
  currencyPosition: 'before',      // ← '$100' vs '100 kr'
  defaultMarket: 'S&P 500',       // ← Default market/index
  country: 'United States',        // ← Your target country
  language: 'en',                  // ← UI language code
},
```

#### D. Which Features to Show

Set any feature to `false` to completely hide it:

```typescript
features: {
  dashboard: true,
  portfolio: true,
  search: true,
  watchlist: true,
  alerts: true,
  simulator: true,
  dcaCalculator: true,
  sectors: true,
  compare: true,
  planner: true,
  performance: true,
  orders: true,
  tax: true,
  ask: false,          // ← Danish-specific, disable for non-DK
  smartPicks: true,
  crashSim: true,
  backtest: true,
  behavior: true,
  reportCard: true,
  patterns: true,
  moneyFlow: true,
  glossary: true,
  reports: true,
  aiChat: false,       // ← Disable if no AI API key
  notifications: true,
  appLock: true,
},
```

**Tip:** For a simpler app, start with fewer features enabled. You can always turn them on later.

#### E. Broker Connection

```typescript
broker: {
  default: 'none',                 // ← 'saxo', 'nordnet', 'alpaca', etc.
  showBrokerSettings: true,
  availableBrokers: ['alpaca', 'interactive_brokers'],
},
```

Broker API keys are set as environment variables in Vercel (Step 5), never in this file.

---

## Step 3: Add Your Logo (2 minutes)

If you chose `logo.type: 'url'`:

1. In your fork, navigate to `smartvest/frontend/public/`
2. Click **"Add file"** → **"Upload files"**
3. Upload your logo as `logo.png` (or `logo.svg`)
4. Commit the change

**Recommended logo specs:**
- Size: 200×200 px minimum
- Format: PNG with transparent background, or SVG
- The logo will be displayed at 32×32 to 48×48 px

If you chose `logo.type: 'text'`, skip this step entirely.

---

## Step 4: Deploy on Vercel (5 minutes)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Find your forked repository and click **"Import"**
4. Configure the project:
   - **Framework Preset:** Next.js (should auto-detect)
   - **Root Directory:** Click "Edit" and set to `smartvest/frontend`
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `.next` (default)
5. Click **"Deploy"**

Vercel will build and deploy your app. This takes 1-2 minutes.

**Your app is now live** at `your-project.vercel.app`!

---

## Step 5: Set Environment Variables (3 minutes)

If you're connecting a broker API or AI service:

1. In your Vercel project, go to **Settings** → **Environment Variables**
2. Add the following (only the ones you need):

| Variable | Purpose | Example |
|----------|---------|---------|
| `BROKER_API_KEY` | Broker API authentication | `pk_live_abc123...` |
| `BROKER_API_SECRET` | Broker API secret | `sk_live_xyz789...` |
| `BROKER_ACCOUNT_ID` | Your broker account ID | `ACC-12345` |
| `OPENAI_API_KEY` | AI chat (if enabled) | `sk-proj-...` |
| `NEWS_API_KEY` | News feed (if enabled) | `abc123def456` |

3. Click **"Save"** and redeploy

**Important:** Never put API keys in the config file. Always use environment variables.

---

## Step 6: Custom Domain (5 minutes, optional)

To use your own domain (e.g., `invest.yourcompany.com`):

1. In Vercel, go to **Settings** → **Domains**
2. Enter your domain and click **"Add"**
3. Vercel will show you DNS records to add
4. Go to your domain registrar and add the records:
   - Usually a CNAME record pointing to `cname.vercel-dns.com`
5. Wait 1-5 minutes for DNS propagation
6. SSL certificate is automatic — your site will be HTTPS

---

## Quick Reference: File Architecture

```
smartvest/frontend/
├── smartvest.config.ts          ← THE ONLY FILE YOU EDIT
├── public/
│   ├── logo.png                 ← Your logo (optional)
│   ├── favicon.ico              ← Your favicon (optional)
│   └── manifest.json            ← PWA config
└── src/
    ├── app/                     ← Pages (business logic)
    ├── components/              ← UI components
    └── lib/
        └── white-label/         ← Config system (don't touch)
            ├── types.ts         ← Type definitions
            ├── config-context.tsx ← React context provider
            ├── theme-engine.ts  ← CSS variable generation
            └── nav-config.ts    ← Feature-flag navigation
```

**Rule: You should never need to edit anything in `src/`.** Everything visual is controlled by `smartvest.config.ts`.

---

## Examples: Ready-Made Configurations

### Swedish Market Focus (Nordnet Broker)

```typescript
const config = {
  branding: { appName: 'InvestSmart', tagline: 'Din aktieguide' },
  theme: { colors: { primary: '#0ea5e9', secondary: '#06b6d4' } },
  locale: {
    defaultCurrency: 'SEK', currencySymbol: 'kr',
    currencyPosition: 'after', defaultMarket: 'OMX Stockholm',
    country: 'Sweden', language: 'sv',
  },
  features: { ask: false },  // ASK is Danish-specific
  broker: { default: 'nordnet' },
};
```

### US Market Focus (Alpaca Broker)

```typescript
const config = {
  branding: { appName: 'StockPilot', tagline: 'AI-Powered Investing' },
  theme: { colors: { primary: '#059669', secondary: '#0891b2' } },
  locale: {
    defaultCurrency: 'USD', currencySymbol: '$',
    currencyPosition: 'before', defaultMarket: 'S&P 500',
    country: 'United States', language: 'en',
  },
  features: { ask: false, tax: false },
  broker: { default: 'alpaca' },
};
```

### Minimal Beginner Mode

```typescript
const config = {
  branding: { appName: 'EasyInvest', tagline: 'Start Investing Today' },
  features: {
    dashboard: true, portfolio: true, search: true,
    watchlist: true, glossary: true, smartPicks: true,
    // Everything else: false
    alerts: false, simulator: false, dcaCalculator: false,
    sectors: false, compare: false, planner: false,
    performance: false, orders: false, tax: false, ask: false,
    crashSim: false, backtest: false, behavior: false,
    reportCard: false, patterns: false, moneyFlow: false,
    reports: false, aiChat: false, notifications: false, appLock: false,
  },
};
```

---

## Updating Your Deployment

When you change `smartvest.config.ts` on GitHub, Vercel automatically rebuilds and redeploys. Changes go live in ~60 seconds.

**To update:**
1. Edit `smartvest.config.ts` on GitHub
2. Commit the change
3. Vercel deploys automatically — done!

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build fails | Check that your config file has no syntax errors. All strings need quotes, all colors need `#` prefix. |
| Logo not showing | Make sure the file is in `public/` and the path in config starts with `/` |
| Colors look wrong | Verify hex codes are 6 characters (e.g., `#3b82f6` not `#3b8`) |
| Features still showing | Clear your browser cache after deploying |
| Domain not working | DNS can take up to 48 hours. Usually 5-10 minutes. |
| Broker not connecting | Check environment variables are set in Vercel (not in the config file) |

---

## Support

- **Config reference:** See `src/lib/white-label/types.ts` for all available options
- **Color picker:** [coolors.co](https://coolors.co) or [tailwindcss.com/docs/colors](https://tailwindcss.com/docs/customizing-colors)
- **Vercel docs:** [vercel.com/docs](https://vercel.com/docs)

---

*Last updated: June 2026*
