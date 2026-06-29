# SmartVest Business Launch Checklist

## Complete Pre-Launch Requirements for a Financial Data Platform in Denmark

*Last updated: June 2026*

> **Important disclaimer:** This document provides general guidance based on publicly available regulatory information. It is NOT legal advice. Before launching, you MUST consult a Danish lawyer specializing in financial technology regulation, and a GDPR/data protection specialist. Regulatory interpretations can change, and your specific situation may differ.

---

## Table of Contents

1. [Legal & Regulatory Requirements](#1-legal--regulatory-requirements)
2. [GDPR Compliance](#2-gdpr-compliance)
3. [Terms of Service & Privacy Policy](#3-terms-of-service--privacy-policy)
4. [Security Requirements](#4-security-requirements)
5. [Customer Support Requirements](#5-customer-support-requirements)
6. [90-Day Go-to-Market Plan](#6-90-day-go-to-market-plan)

---

## 1. Legal & Regulatory Requirements

### Do You Need a Finanstilsynet License?

**Short answer: Almost certainly NO, but you must be extremely careful about what you say and how you say it.**

#### The Key Distinction

Danish financial regulation (implementing EU MiFID II) draws a sharp line between:

| Category | Licensed? | What it means |
|----------|-----------|---------------|
| **Investment advice** | YES — requires license | Telling a specific person to buy/sell a specific security based on their personal circumstances |
| **General financial information** | NO license needed | Providing data, scores, analysis tools, and educational content that users apply to their own decisions |
| **Portfolio management** | YES — requires license | Making investment decisions on behalf of another person |
| **Order execution** | YES — requires license | Actually executing trades on behalf of clients with their money |

#### Your Likely Classification: "Information Service Provider"

SmartVest as currently built falls under the **information-only exemption** if ALL of the following are true:

**LEGALLY REQUIRED — you MUST do these:**

- [ ] **Never give personalized investment recommendations.** "Smart Picks" must be clearly labeled as educational/informational, not personal advice tailored to the user.
- [ ] **Every page with analysis/scores must carry a disclaimer** stating: "This is not investment advice. Past performance does not guarantee future results. You should make your own investment decisions or consult a licensed advisor."
- [ ] **Never claim or imply** that following the app's signals will produce profits.
- [ ] **Never execute real trades with user money** unless you obtain a MiFID II license. The "orders" feature must clearly be for record-keeping/tracking purposes only (logging trades the user made elsewhere).
- [ ] **Register your business** with the Danish Business Authority (Erhvervsstyrelsen) — standard requirement for any Danish company.

**HIGH-RISK GRAY AREAS — get legal advice on these:**

- [ ] The "Smart Picks" feature could be interpreted as investment advice if it says "Buy NOVO-B.CO because of your risk profile." Reframe as: "Stocks scoring highly on our methodology: ..." without personal targeting.
- [ ] The "algorithmic strategy builder" (Institutional tier) is fine as backtesting/simulation but becomes problematic if it connects to real brokerage and auto-executes.
- [ ] Subscription tiers with "signals" (buy/hold/sell) — these are generally acceptable as generic analysis (like Morningstar ratings), NOT as personal recommendations. The distinction is whether it's personalized to the individual user's circumstances.

**WHEN YOU WOULD NEED A LICENSE:**

You would need a Finanstilsynet license if:
- You connect to a broker API and execute trades on the user's behalf
- You provide personalized recommendations considering the user's specific financial situation
- You manage money or assets on behalf of clients
- You operate as a "robo-advisor" that auto-rebalances portfolios

**BEST PRACTICE (not legally required but strongly recommended):**

- [ ] Write to Finanstilsynet (ftnet@ftnet.dk) describing your service and ask for written confirmation that you don't need a license. They have a duty to respond and this protects you.
- [ ] Add "SmartVest is not a licensed investment firm" to your About page and footer.
- [ ] Consider joining FinDK (Danish Fintech association) for regulatory guidance.

#### Business Registration

**LEGALLY REQUIRED:**

- [ ] Register an ApS (anpartsselskab) or IVS with Erhvervsstyrelsen — minimum capital 40,000 DKK for ApS
- [ ] Obtain CVR number
- [ ] Register for moms (VAT) if annual revenue exceeds 50,000 DKK — note: SaaS subscriptions to Danish consumers include 25% moms
- [ ] Digital bookkeeping system compliant with Bogføringsloven (the new Danish Bookkeeping Act effective 2025-2026)
- [ ] Keep financial records for 5 years per the Danish Bookkeeping Act

---

## 2. GDPR Compliance

### Data You Collect and Its Classification

| Data Category | Classification | Legal Basis |
|---------------|---------------|-------------|
| Email, name | Personal data | Consent (Art. 6(1)(a)) or Contract performance (Art. 6(1)(b)) |
| Password hash | Personal data | Contract performance |
| Portfolio holdings | Personal data (financial) | Contract performance |
| Watchlist | Personal data | Contract performance |
| Order history | Personal data (financial) | Contract performance + Legal obligation (bookkeeping) |
| Tax calculations | Personal data (financial) | Contract performance |
| IP address, login logs | Personal data | Legitimate interest (Art. 6(1)(f)) — security |
| Payment info (Stripe) | Not stored by you — Stripe is processor | N/A |

### What is LEGALLY REQUIRED Under GDPR

**These are legal obligations, not optional:**

#### A. Data Residency

- [ ] **Store data within the EU/EEA.** Choose Vercel's EU region (Frankfurt/ams1) or a provider with EU data centers. This is required because you process financial personal data.
- [ ] **If using third-party services** (Stripe, analytics, etc.), verify each has EU data processing or appropriate safeguards (Standard Contractual Clauses post-Schrems II).
- [ ] **Document all data transfers** outside the EU in your Records of Processing Activities (ROPA).

**Specific requirement for Denmark:** Datatilsynet has been strict about cloud storage. Ensure your cloud provider (Vercel, AWS, etc.) does not transfer data to the US without appropriate safeguards. Post-EU-US Data Privacy Framework (2023), transfers to US companies on the DPF list are acceptable.

#### B. Retention Policies

**LEGALLY REQUIRED retention periods:**

| Data | Retention | Reason |
|------|-----------|--------|
| Financial transaction records | 5 years from end of financial year | Danish Bookkeeping Act (Bogføringsloven) §12 |
| Tax-relevant records | 5 years | Skattekontrolloven (Tax Control Act) |
| Account data (name, email) | Until account deletion + 30 days | GDPR Art. 17 + legitimate business need |
| Security logs (login, IP) | 12 months | Legitimate interest for fraud prevention |
| Marketing consent records | Duration of consent + 2 years | Evidence of valid consent |
| API access logs | 12 months | Legitimate interest for rate limiting/abuse |
| Subscription/payment records | 5 years | Bookkeeping Act + VAT documentation |

**REQUIRED: Implement automatic deletion schedules.** Data must not be kept longer than necessary for its stated purpose.

#### C. Right to Erasure (Art. 17) Implementation

**LEGALLY REQUIRED — users must be able to delete their account and all data:**

- [ ] Provide a "Delete My Account" button in account settings
- [ ] Upon request, delete ALL personal data within 30 days (GDPR maximum)
- [ ] **Exception:** You MAY retain data required by law (bookkeeping records for 5 years). In this case, restrict processing (lock the data) rather than delete it.
- [ ] Confirm deletion to the user in writing (email)
- [ ] If data was shared with processors (Stripe, etc.), inform them of the deletion request
- [ ] Document the erasure in your ROPA

**Implementation in SmartVest:**
The `deleteUserAccount()` function in `auth.ts` and `purgeAllUserData()` in `user-data.ts` already handle the technical deletion. Before launch, add:
1. A 30-day confirmation email flow ("Are you sure?")
2. Retention of bookkeeping-required records in a locked/restricted state
3. Audit log of deletion requests

#### D. Records of Processing Activities (ROPA)

**LEGALLY REQUIRED for any organization processing personal data regularly:**

- [ ] Create and maintain a ROPA document listing:
  - Categories of data processed
  - Purposes for each category
  - Legal basis for each processing activity
  - Data retention periods
  - Categories of recipients (who you share data with)
  - Transfers to third countries
  - Technical and organizational security measures

#### E. Data Protection Impact Assessment (DPIA)

**LEGALLY REQUIRED if your processing is "likely to result in a high risk to the rights and freedoms of natural persons":**

- [ ] Financial data processing at scale likely qualifies. Conduct a DPIA before launch.
- [ ] Document: the processing, necessity, proportionality, risks to data subjects, and measures to mitigate risks.

#### F. Data Processing Agreements

**LEGALLY REQUIRED with every third-party that processes user data on your behalf:**

- [ ] Stripe (payment processing) — they provide a standard DPA
- [ ] Vercel (hosting) — they have a DPA available
- [ ] Any analytics provider
- [ ] Any email service provider
- [ ] Any market data API provider that receives user identifiers

#### G. Breach Notification

**LEGALLY REQUIRED:**

- [ ] Notify Datatilsynet within 72 hours of discovering a personal data breach
- [ ] Notify affected users "without undue delay" if the breach is likely to result in high risk
- [ ] Prepare a breach response plan BEFORE launch

### BEST PRACTICE (Not Legally Required but Strongly Recommended)

- [ ] Appoint a Data Protection Officer (DPO) — not strictly required for small companies, but recommended when processing financial data
- [ ] Conduct annual GDPR compliance audits
- [ ] Implement data minimization — don't collect what you don't need
- [ ] Offer data portability (GDPR Art. 20) — let users export all their data in machine-readable format (JSON/CSV)

---

## 3. Terms of Service & Privacy Policy

### Minimum Legal Requirements

Both documents are **LEGALLY REQUIRED** before you can process user data or accept payments.

### Privacy Policy — Must Include:

**LEGALLY REQUIRED contents (GDPR Articles 13-14):**

```
1. Identity and contact details of the controller (your company)
2. Contact details of your DPO (if appointed)
3. Purposes of processing and legal basis for each
4. Categories of personal data collected
5. Recipients or categories of recipients
6. Details of transfers to third countries
7. Retention periods for each data category
8. Data subject rights:
   - Right to access (Art. 15)
   - Right to rectification (Art. 16)
   - Right to erasure (Art. 17)
   - Right to restrict processing (Art. 18)
   - Right to data portability (Art. 20)
   - Right to object (Art. 21)
   - Right to withdraw consent
   - Right to lodge complaint with Datatilsynet
9. Whether provision of data is statutory/contractual requirement
10. Information about automated decision-making (if any)
```

### Terms of Service — Must Include:

**LEGALLY REQUIRED or necessary to protect you:**

```
1. Who you are (company details, CVR number, address)
2. What the service does and does NOT do
3. CRITICAL: "This service does NOT constitute investment advice"
4. User responsibilities (accurate info, password security)
5. Intellectual property (who owns what)
6. Payment terms and cancellation (consumer protection law requires
   clear refund/cancellation rights)
7. Limitation of liability (you are not liable for investment losses)
8. Disclaimer: "Past performance does not indicate future results"
9. Service availability (no uptime guarantee)
10. Termination conditions (both sides)
11. Governing law (Danish law) and dispute resolution
12. Age restriction (18+ for financial services)
```

### Danish-Specific Consumer Protection Requirements

**LEGALLY REQUIRED under Forbrugeraftaleloven (Consumer Contracts Act):**

- [ ] 14-day right of withdrawal for online purchases (but can be waived for digital content once access is granted — must be explicitly stated)
- [ ] Clear, upfront pricing including VAT (25% moms)
- [ ] Danish-language versions of key documents if targeting Danish consumers (best practice, arguably required under Marketing Practices Act)

### Plain Language Template Outline (Adapt with Your Lawyer)

Your privacy policy should read like:
```
What we collect: Your email, name, and the portfolio/watchlist data you enter.
Why: To provide the service you signed up for.
Who sees it: Only you. We use Stripe for payments (they never see your portfolio).
How long: Until you delete your account, except records we must keep for 5 years by law.
Your rights: You can download, correct, or delete your data anytime.
Security: Encrypted connections, hashed passwords, isolated user data.
Contact: [email] or Datatilsynet if we don't respond within 30 days.
```

---

## 4. Security Requirements

### LEGALLY REQUIRED (GDPR Art. 32 — "Appropriate Technical and Organizational Measures")

There is no specific checklist mandated by law. But GDPR requires "appropriate" security given the nature of the data. For financial personal data, the bar is HIGHER than for a blog.

**Minimum expected measures:**

- [ ] **Encryption in transit:** TLS 1.2+ on all connections (Vercel provides this automatically)
- [ ] **Encryption at rest:** Database encryption for stored personal data
- [ ] **Password hashing:** bcrypt or argon2 (NOT MD5/SHA-256 alone — the current SHA-256+salt in the demo is insufficient for production)
- [ ] **Access control:** Per-user data isolation (already implemented via user-data.ts)
- [ ] **Session management:** Secure, httpOnly cookies with appropriate expiry
- [ ] **Input validation:** Prevent XSS, SQL injection, CSRF
- [ ] **Dependency updates:** Regular security patches for npm packages
- [ ] **Logging:** Audit trail of access to personal data (who accessed what, when)

### BEST PRACTICE Before Launch (Strongly Recommended)

#### Penetration Testing

- [ ] **External penetration test** by a qualified firm before handling real user data
  - Recommended firms in Denmark/Nordics: Truesec, Nixu, Improsec
  - Budget: 50,000-150,000 DKK for a web app pentest
  - Timeline: 2-4 weeks for test + report
  - Focus areas: auth bypass, data isolation verification, API security
- [ ] **OWASP Top 10** review — ensure none of the top 10 web vulnerabilities exist
- [ ] **API security testing** — verify rate limiting, auth, and data isolation

#### Before Accepting Real User Data

- [ ] Replace localStorage with a proper database (PostgreSQL/Supabase recommended)
- [ ] Move password hashing to server-side with bcrypt (min 12 rounds) or argon2
- [ ] Implement CSRF protection on all state-changing endpoints
- [ ] Add Content Security Policy (CSP) headers
- [ ] Enable Vercel's DDoS protection and rate limiting
- [ ] Set up error monitoring (Sentry) that EXCLUDES personal data from error reports
- [ ] Implement API key rotation capability
- [ ] Add 2FA option for user accounts (TOTP-based)
- [ ] Write and test an incident response procedure

#### Production Infrastructure Checklist

- [ ] Move from localStorage demo to Supabase/PostgreSQL with Row-Level Security
- [ ] Use server-side sessions (not sessionStorage)
- [ ] Environment variables for all secrets (never in code)
- [ ] Separate staging and production environments
- [ ] Automated backups with encryption
- [ ] Uptime monitoring with alerting

---

## 5. Customer Support Requirements

### LEGALLY REQUIRED

- [ ] **Respond to GDPR data access requests within 30 days** (Art. 12(3))
- [ ] **Respond to erasure requests within 30 days**
- [ ] **Provide a contact email** in your privacy policy
- [ ] **Complaints handling process** for Forbrugerklagenævnet (Consumer Complaints Board) if revenue > 50,000 DKK from consumers

### BEST PRACTICE for a Financial App

**Minimum viable support stack for launch:**

| Channel | Response Time | Tools |
|---------|---------------|-------|
| Email (support@) | < 24 hours (business days) | Crisp, Intercom, or shared inbox |
| In-app help center | Self-service (immediate) | FAQ/knowledge base |
| Status page | Real-time | Instatus or Better Uptime |

**Content you need ready:**

- [ ] FAQ covering: "Is this investment advice?" (NO), "How is my data protected?", "How do I cancel?", "How do I delete my account?"
- [ ] Knowledge base articles for each feature
- [ ] Clear escalation path for complaints
- [ ] Canned responses for common GDPR requests (access, deletion, rectification)

**Financial app-specific requirements:**

- [ ] Never provide personal financial advice in support responses
- [ ] Train support staff (even if just yourself) to recognize and refuse requests for investment recommendations
- [ ] Document that support conversations are not investment advice

**Scaling plan (as you grow):**

- 0-100 users: Founder handles support via email
- 100-500 users: Add FAQ + chatbot for common questions
- 500-1000 users: Part-time support person or outsourced tier-1
- 1000+: Dedicated support with ticketing system

---

## 6. 90-Day Go-to-Market Plan

### Target Market

**Primary:** Beginner investors in Denmark (20-35 years old) who have or want an ASK/depot
**Secondary:** Scandinavian investors (Sweden, Norway) who are comfortable with English
**Market size:** ~500,000 Danes have an Aktiesparekonto; ~1.5M invest in stocks. Growing 15-20%/year.

### Pre-Launch (Days 1-14)

#### Week 1: Foundation

- [ ] Register ApS and obtain CVR number
- [ ] Set up business bank account (Lunar Business or Danske Bank)
- [ ] Finalize Terms of Service and Privacy Policy with lawyer
- [ ] Write to Finanstilsynet confirming no license needed (keep response)
- [ ] Set up company email (support@, legal@, hello@)
- [ ] Purchase domain and configure DNS
- [ ] Deploy production version on Vercel EU region
- [ ] Set up Stripe account with Danish entity
- [ ] Configure proper database (move from localStorage to Supabase)

#### Week 2: Pre-Launch Marketing

- [ ] Create landing page with waitlist signup (use existing app as demo)
- [ ] Set up social media: Twitter/X, LinkedIn, Reddit (r/dkfinance)
- [ ] Write 3-5 SEO-optimized blog posts:
  - "Hvad er en Aktiesparekonto? (Komplet guide 2026)"
  - "Aktieindkomst skat 2026: Sådan beregner du din skat"
  - "Begynderguide til investering i Danmark"
  - "ASK vs. frit depot: Hvad skal du vælge?"
  - "De bedste danske aktier for begyndere"
- [ ] Record 2-3 short product demo videos (< 90 seconds each)
- [ ] Reach out to Danish personal finance bloggers/YouTubers
- [ ] Post in r/dkfinance introducing the tool (be transparent about being the creator)

### Soft Launch (Days 15-30)

#### Week 3: Beta Release

- [ ] Launch to waitlist as "beta" (free access to Pro features for beta users)
- [ ] Cap at 50-100 beta users to manage support load
- [ ] Daily monitoring of errors, user behavior, and feedback
- [ ] Fix critical bugs within 24 hours
- [ ] Send welcome email series (4 emails over 2 weeks):
  1. "Welcome — here's how to set up your portfolio" (Day 0)
  2. "Did you know about the ASK tax advantage?" (Day 3)
  3. "Your first weekly report is ready" (Day 7)
  4. "How are we doing? Quick 2-minute survey" (Day 14)

#### Week 4: Iterate

- [ ] Analyze user drop-off points in onboarding
- [ ] Conduct 5-10 user interviews (15 min each) via Zoom
- [ ] Prioritize top 3 user-requested features for v1.1
- [ ] Start writing case study: "How I track my ASK with SmartVest"
- [ ] Implement feedback from beta users

### Public Launch (Days 31-60)

#### Week 5-6: Public Launch

- [ ] Remove beta restrictions — open registration to all
- [ ] Activate subscription payments (Free → Pro → Institutional)
- [ ] Launch pricing page and Stripe integration
- [ ] PR push:
  - Submit to Nordic Startup News, TechSavvy.media
  - Post on Hacker News ("Show HN: I built a Danish stock investment platform")
  - ProductHunt launch (coordinate with beta users for upvotes)
  - LinkedIn post from personal account (authentic, not salesy)
- [ ] Run first paid ads (small budget, 2,000-5,000 DKK):
  - Google Ads: "aktiesparekonto app", "investering app danmark"
  - Facebook/Instagram: target 25-35, interested in investing/finance
  - Reddit: sponsored post in r/dkfinance
- [ ] Enable Google Analytics (or Plausible for privacy-first)
- [ ] Set up conversion tracking (signup → Pro subscription)

#### Week 7-8: Growth

- [ ] Publish weekly newsletter (Danish personal finance insights)
- [ ] Guest post on Danish finance blogs (Pengepugeren, Frinans, etc.)
- [ ] Create comparison pages: "SmartVest vs Nordnet", "SmartVest vs Lunar Invest"
- [ ] SEO: Optimize for "investering app danmark", "aktie app", "ASK beregner"
- [ ] Start affiliate program for finance bloggers (30% recurring commission)
- [ ] Reach out to Danish podcasts (Pengepodcasten, Millionærklubben)

### Scale (Days 61-90)

#### Week 9-10: Expand

- [ ] Launch Swedish localization (market size: 2M+ stock investors)
- [ ] Partner with 1-2 Danish brokers for referral deals (Saxo, Nordnet)
- [ ] Introduce annual billing with 25% discount
- [ ] A/B test pricing (try 79 vs 99 vs 119 DKK for Pro)
- [ ] Add testimonials from beta users to landing page
- [ ] Apply to Y Combinator / Seedcamp / Nordic Makers if seeking funding
- [ ] Attend Copenhagen Fintech events (CPH Fintech, Money20/20)

#### Week 11-12: Optimize

- [ ] Analyze conversion funnel: Free → Pro conversion rate target: 5-10%
- [ ] Implement in-app upgrade prompts based on usage patterns
- [ ] Launch referral program ("Invite a friend, both get 1 month Pro free")
- [ ] Prepare press kit with screenshots, founder bio, company description
- [ ] Set 6-month revenue target and plan path to break-even
- [ ] Document learnings and plan Q2 roadmap

### Key Metrics to Track

| Metric | Target (Day 90) | Why it matters |
|--------|-----------------|----------------|
| Registered users | 500-1,000 | Market validation |
| DAU/MAU ratio | > 30% | Engagement/stickiness |
| Free → Pro conversion | 5-10% | Revenue viability |
| Monthly Recurring Revenue | 10,000-30,000 DKK | Business sustainability |
| Churn rate | < 5%/month | Product-market fit |
| NPS score | > 40 | User satisfaction |
| Support tickets/user | < 0.5/month | Product quality |
| Time to first value | < 5 minutes | Onboarding quality |

### Budget Estimate (90 Days)

| Category | Estimate (DKK) |
|----------|----------------|
| Company registration + lawyer | 15,000-25,000 |
| GDPR compliance (DPA review, DPIA) | 10,000-20,000 |
| Security audit / pentest | 50,000-100,000 |
| Hosting (Vercel Pro + Supabase) | 2,000-5,000 |
| Marketing (ads + content) | 10,000-20,000 |
| Stripe fees (2.9% + 2.50 DKK/transaction) | Variable |
| Misc (domain, email, tools) | 3,000-5,000 |
| **Total (conservative)** | **~100,000-175,000 DKK** |

---

## Summary: What is LEGALLY REQUIRED vs. Best Practice

### Legally Required (You Cannot Launch Without These)

1. ✅ Business registration (ApS/IVS + CVR)
2. ✅ Privacy policy meeting GDPR Art. 13-14 requirements
3. ✅ Terms of service with investment disclaimer
4. ✅ Explicit disclaimers on every page with financial analysis ("Not investment advice")
5. ✅ User consent for data processing (or legitimate basis documented)
6. ✅ Right to erasure implementation (delete account feature)
7. ✅ Data Processing Agreements with all sub-processors
8. ✅ Records of Processing Activities (ROPA)
9. ✅ 72-hour breach notification capability
10. ✅ Data residency within EU/EEA
11. ✅ VAT registration if revenue > 50,000 DKK
12. ✅ 5-year retention of financial records (Bookkeeping Act)
13. ✅ 14-day withdrawal right disclosure (Consumer Contracts Act)
14. ✅ "Appropriate" security measures (GDPR Art. 32) — encryption, access control, etc.

### Best Practice (Strongly Recommended But Not Strictly Required)

1. 🟡 Written confirmation from Finanstilsynet that no license is needed
2. 🟡 Penetration testing before launch
3. 🟡 Data Protection Impact Assessment
4. 🟡 DPO appointment
5. 🟡 2FA for user accounts
6. 🟡 Annual GDPR audit
7. 🟡 Data portability (export) feature
8. 🟡 Danish-language legal documents (arguably required, practically English is accepted for English-language apps)
9. 🟡 Cyber insurance
10. 🟡 Bug bounty program

---

## Sources & Further Reading

- [Finanstilsynet — Financial Supervisory Authority](https://www.finanstilsynet.dk)
- [Datatilsynet — Data Protection Authority](https://www.datatilsynet.dk)
- [Erhvervsstyrelsen — Danish Business Authority](https://erhvervsstyrelsen.dk)
- [Danish Bookkeeping Act (Bogføringsloven)](https://www.retsinformation.dk/eli/lta/2022/145)
- [Chambers Financial Services Regulation 2025 — Denmark](https://practiceguides.chambers.com/practice-guides/financial-services-regulation-2025/denmark)
- [GDPR Guide — Denmark (White & Case)](https://www.whitecase.com/insight-our-thinking/gdpr-guide-national-implementation-denmark)
- [Datatilsynet GDPR guidance](https://www.datatilsynet.dk/english)
- [EU-US Data Privacy Framework](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/eu-us-data-transfers_en)

Content was rephrased for compliance with licensing restrictions. All information should be independently verified with qualified legal counsel.

---

*This document was prepared June 2026. Regulations change. Verify all requirements with current sources before acting.*
