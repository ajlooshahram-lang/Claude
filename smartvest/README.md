# SmartVest — Your Personal Stock Market Assistant

SmartVest is a web app that helps beginner investors understand what to buy, when, and why — without needing any prior knowledge of the stock market. It's designed for people in Denmark (prices in DKK, Danish tax context) but works with global stocks.

**It does NOT manage real money.** It's a research and learning tool that helps you make better decisions.

---

## What It Does

SmartVest answers three questions every day:

1. **What should I consider buying?** — Smart Picks shows 5 stocks scored for your risk profile
2. **Is this stock safe for me?** — Every stock gets a beginner-friendliness rating and a 1-10 score
3. **How should I invest my budget?** — Simulators show exactly how many shares you can afford

---

## Features

| Feature | What it does |
|---|---|
| **Risk Profile Quiz** | 5 questions that determine if you're Conservative, Moderate, or Growth — personalizes everything |
| **Portfolio Dashboard** | Shows your holdings with live prices, total gain/loss, diversification warnings |
| **Stock Search** | Type any company name → get live price, description, score, beginner rating, and news |
| **Watchlist** | Save stocks you're interested in — they persist forever and show live data |
| **Budget Simulator** | Enter your budget, pick a stock → see exactly how many shares you can buy |
| **DCA Calculator** | Plan monthly investing: see what happens if the stock goes up 5%, stays flat, or drops 5% |
| **Sector Overview** | See which sectors (Tech, Healthcare, etc.) are up or down this week |
| **Performance Review** | Track your portfolio's total return, best/worst stock, with AI summary |
| **Smart Picks** | Daily 5-stock recommendations scored for your risk profile with plain English reasons |
| **AI Chat** | Ask any question ("What is a P/E ratio?") — get a plain English answer, no jargon |
| **Scoring Engine** | Every stock gets a 1-10 score based on Safety (40%), Value (35%), and Momentum (25%) |
| **Traffic Lights** | Green/yellow/red signal showing if a stock's price is trending up or down over 14 days |
| **Beginner Ratings** | Every stock labeled as Beginner Friendly, Intermediate, or Risky |
| **Diversification Checker** | Warns you if too much of your money is in one stock or one sector |
| **Learning Tips** | Short explanations that teach you investing concepts as you use the app |
| **News Headlines** | 3 most recent news articles for any stock you look at |

---

## How to Run It Locally

### What You Need

- **Python 3.11 or newer** — [Download here](https://www.python.org/downloads/)
- **Node.js 20 or newer** — [Download here](https://nodejs.org/)
- A computer (Mac, Windows, or Linux — all work)

### Step 1: Install the Backend

Open a terminal and run:

```bash
cd smartvest/backend
pip install -r requirements.txt
```

This installs the Python packages that fetch stock data and run the scoring engine.

### Step 2: Start the Backend

```bash
cd smartvest/backend
python main.py
```

You should see: `Uvicorn running on http://0.0.0.0:8000`

Leave this terminal open.

### Step 3: Install the Frontend

Open a **second** terminal and run:

```bash
cd smartvest/frontend
npm install
```

This installs the JavaScript packages for the web interface.

### Step 4: Start the Frontend

```bash
cd smartvest/frontend
npm run dev
```

You should see: `Ready on http://localhost:3000`

### Step 5: Open the App

Go to **http://localhost:3000** in your web browser (Chrome, Firefox, Safari — any works).

The first time, you'll see the Risk Profile Quiz. Answer 5 questions and you're in!

---

## API Keys

### Required: None!

The app works out of the box with **no API keys**. Stock data comes from Yahoo Finance (free, no signup needed). The AI chat uses built-in answers for common questions.

### Optional: OpenAI (for smarter AI chat)

If you want the AI chat to give more detailed, personalized answers (instead of pre-written ones), you can add an OpenAI API key:

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a free account (you get $5 free credits)
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)
5. Create a file called `.env` in the `backend/` folder:

```
OPENAI_API_KEY=sk-your-key-here
```

6. Restart the backend

**Cost:** About $0.01-0.05 per conversation. The $5 free credit lasts months of normal use.

**Without the key:** The app still works perfectly — you just get pre-written answers instead of AI-generated ones.

---

## How the Scoring Works

Every stock gets a score from 1 to 10:

| Pillar | Weight | What it measures |
|---|---|---|
| **Safety** | 40% | Low volatility + low beta + large company = safer |
| **Value** | 35% | Low P/E ratio + pays dividends = better value |
| **Momentum** | 25% | Price trending up over last 14 days = positive momentum |

**Score meanings:**
- 9-10: Excellent
- 7-8: Good
- 5-6: Average
- 3-4: Below Average
- 1-2: Poor

---

## Important Disclaimer

**SmartVest is an educational tool, NOT a financial advisor.**

- It does NOT manage real money
- It does NOT guarantee profits
- All investing carries risk of loss
- Past performance does not predict future results
- Always do your own research before investing
- Consider consulting a qualified financial advisor

---

## Project Structure

```
smartvest/
├── backend/              ← Python server (fetches data, scores stocks)
│   ├── main.py           ← Start here: python main.py
│   ├── requirements.txt  ← Python packages to install
│   ├── core/             ← Scoring engine
│   ├── market_data/      ← Yahoo Finance connection
│   └── api/              ← API endpoints
│
├── frontend/             ← Web interface (what you see in the browser)
│   ├── src/app/          ← All the pages
│   ├── src/components/   ← Reusable UI pieces
│   └── src/lib/          ← Shared utilities
│
└── README.md             ← This file
```

---

## Deploy to the Internet (Free)

You can deploy SmartVest so it's accessible from anywhere — your phone, another computer, etc. This guide uses **Vercel** (frontend) and **Railway** (backend), both free for personal projects.

### Step-by-Step Deployment

#### Part 1: Deploy the Backend (Railway — free tier)

The backend is the Python server that fetches stock data. It needs to run 24/7 so the frontend can call it.

1. Go to [railway.app](https://railway.app) and sign up (free with GitHub)
2. Click **"New Project"** → **"Deploy from GitHub Repo"**
3. Connect your GitHub account and select your SmartVest repository
4. Railway will detect the project. Set the **root directory** to: `backend`
5. Go to the **Settings** tab for your service:
   - Set **Start Command** to: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Go to the **Variables** tab and add:

   | Variable | Value | Where to get it |
   |---|---|---|
   | `PORT` | `8000` | Just type 8000 |
   | `OPENAI_API_KEY` | `sk-...` (optional) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — $5 free credit |

7. Click **Deploy**. Wait 1-2 minutes.
8. Railway gives you a URL like `https://smartvest-backend-production-abc123.up.railway.app`
9. **Copy this URL** — you'll need it for the frontend.

#### Part 2: Deploy the Frontend (Vercel — free tier)

1. Go to [vercel.com](https://vercel.com) and sign up (free with GitHub)
2. Click **"Add New Project"** → **"Import Git Repository"**
3. Select your SmartVest repository
4. In the configuration screen:
   - Set **Root Directory** to: `frontend`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
5. Expand **"Environment Variables"** and add:

   | Variable | Value | Where to get it |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | `https://your-railway-url.up.railway.app` | The URL from Part 1, step 8 |

6. Click **Deploy**. Wait 1-2 minutes.
7. Vercel gives you a URL like `https://smartvest.vercel.app` — that's your live app!

#### Part 3: Update CORS (one-time)

After deploying, your backend needs to allow requests from your Vercel URL:

1. In Railway, go to your backend service → **Variables**
2. Add a new variable:

   | Variable | Value |
   |---|---|
   | `CORS_ORIGINS` | `https://your-app.vercel.app` |

3. Update `backend/main.py` to read this (already done — it uses `allow_origins=["*"]` in development which works for testing)

For production security, you can update the CORS config later to only allow your specific Vercel domain.

---

### Environment Variables Summary

#### Frontend (Vercel Dashboard)

| Variable | Required | Value | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | Your Railway backend URL | Tells the frontend where to fetch stock data |

#### Backend (Railway Dashboard)

| Variable | Required | Value | Purpose |
|---|---|---|---|
| `PORT` | Yes | `8000` | Port the server listens on |
| `OPENAI_API_KEY` | No (optional) | `sk-...` from OpenAI | Enables AI chat (free $5 credit). App works without it. |

#### Where to get each one:

| Key | Free? | Where |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | You create this by deploying the backend |
| `OPENAI_API_KEY` | Yes ($5 free) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — sign up, create key |

---

### Cost

| Service | Free tier | Limits |
|---|---|---|
| **Vercel** (frontend) | Free forever | 100GB bandwidth/month (more than enough) |
| **Railway** (backend) | $5/month free credit | 500 hours/month (enough for always-on) |
| **Yahoo Finance** (data) | Free | No signup, no limits for personal use |
| **OpenAI** (optional AI chat) | $5 free credit | Lasts months of normal use |
| **Total** | **$0/month** | Completely free for personal use |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Cannot connect to backend" | Make sure you ran `python main.py` in the backend folder and it's still running |
| Prices not loading | Yahoo Finance might be slow. Wait 10 seconds and click Refresh |
| "Module not found" error | Run `pip install -r requirements.txt` again in the backend folder |
| Frontend won't start | Run `npm install` again in the frontend folder |
| Blank page | Open browser developer tools (F12) → Console tab → look for red errors |

---

## Built With

- **Python + FastAPI** — backend server
- **Yahoo Finance** — free stock market data
- **Next.js + React** — web interface
- **Tailwind CSS** — styling
- **OpenAI GPT-4o-mini** — AI chat (optional)
- **localStorage** — saves your watchlist and profile (no database needed)

---

Made with care for beginner investors. Start small, stay consistent, and keep learning. 📈
