/**
 * Nordic Market Module
 *
 * Full support for stocks listed on:
 * - Nasdaq Copenhagen (OMX C25) — DKK
 * - Nasdaq Stockholm (OMX S30) — SEK
 * - Nasdaq Helsinki (OMX H25) — EUR
 * - Oslo Børs (OBX) — NOK
 *
 * Features:
 * - Local currency pricing with DKK conversion
 * - Nordic-specific volatility scoring adjustments
 * - Market hours with public holiday calendars
 * - Index comparison (OMXC25, OMXS30, OMXH25, OBX)
 * - Top movers per exchange
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type NordicExchange = 'copenhagen' | 'stockholm' | 'helsinki' | 'oslo';

export interface NordicIndex {
  exchange: NordicExchange;
  symbol: string;
  name: string;
  country: string;
  currency: string;
  currentValue: number;
  dayChange: number;
  dayChangePct: number;
  weekChangePct: number;
  monthChangePct: number;
  ytdChangePct: number;
  constituents: number;
}

export interface NordicStock {
  symbol: string;
  name: string;
  exchange: NordicExchange;
  currency: string;
  currentPrice: number;
  priceDKK: number;
  dayChange: number;
  dayChangePct: number;
  volume: number;
  marketCap: number;
  sector: string;
  beginnerScore: number;
  adjustedScore: number;
  volatilityProfile: 'low' | 'moderate' | 'high';
}

export interface NordicHoliday {
  date: string;
  name: string;
  nameLocal: string;
  country: string;
  exchange: NordicExchange;
  halfDay: boolean;
}

export interface MarketStatus {
  exchange: NordicExchange;
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
  reason?: string;
}

export interface NordicOverview {
  indices: NordicIndex[];
  topMovers: Record<NordicExchange, NordicStock[]>;
  marketStatus: MarketStatus[];
  upcomingHolidays: NordicHoliday[];
  lastUpdated: string;
}


// ─── FX Rates (vs DKK) ──────────────────────────────────────────────────────

export const FX_RATES: Record<string, number> = {
  DKK: 1,
  SEK: 0.645,    // 1 SEK = 0.645 DKK
  NOK: 0.652,    // 1 NOK = 0.652 DKK
  EUR: 7.46,     // 1 EUR = 7.46 DKK (pegged)
  USD: 6.82,     // 1 USD = 6.82 DKK
  GBP: 8.65,     // 1 GBP = 8.65 DKK
};

export function convertToDKK(amount: number, currency: string): number {
  return Math.round(amount * (FX_RATES[currency] || 1) * 100) / 100;
}

export function formatLocalPrice(price: number, currency: string): string {
  const decimals = price > 1000 ? 0 : price > 100 ? 1 : 2;
  return `${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

// ─── Exchange Metadata ───────────────────────────────────────────────────────

export const EXCHANGE_INFO: Record<NordicExchange, { name: string; country: string; currency: string; flag: string; timezone: string; openTime: string; closeTime: string }> = {
  copenhagen: { name: 'Nasdaq Copenhagen', country: 'Denmark', currency: 'DKK', flag: '🇩🇰', timezone: 'Europe/Copenhagen', openTime: '09:00', closeTime: '17:00' },
  stockholm: { name: 'Nasdaq Stockholm', country: 'Sweden', currency: 'SEK', flag: '🇸🇪', timezone: 'Europe/Stockholm', openTime: '09:00', closeTime: '17:30' },
  helsinki: { name: 'Nasdaq Helsinki', country: 'Finland', currency: 'EUR', flag: '🇫🇮', timezone: 'Europe/Helsinki', openTime: '10:00', closeTime: '18:30' },
  oslo: { name: 'Oslo Børs', country: 'Norway', currency: 'NOK', flag: '🇳🇴', timezone: 'Europe/Oslo', openTime: '09:00', closeTime: '16:20' },
};

// ─── Volatility Scoring Adjustments ──────────────────────────────────────────

/**
 * Nordic large-caps have different volatility profiles than US stocks.
 * Danish/Swedish blue chips are typically lower-beta, lower-vol than
 * equivalent US companies — this should be reflected in beginner scores.
 *
 * Adjustment factors:
 *  - Large-cap Nordic (C25, S30): +5 to +10 beginner score (more stable)
 *  - Mid-cap Nordic: +0 to +3
 *  - Small-cap Nordic: -5 (less liquid, higher vol)
 *  - Norwegian oil stocks: -3 (commodity-driven volatility)
 *  - Finnish forestry/shipping: -2 (cyclical)
 */
export function getVolatilityAdjustment(symbol: string, exchange: NordicExchange, marketCap: number): {
  adjustment: number;
  profile: NordicStock['volatilityProfile'];
  reason: string;
} {
  const isLargeCap = marketCap > 100000000000; // >100B DKK equivalent
  const isMidCap = marketCap > 20000000000;

  // Nordic large-cap stability bonus
  if (isLargeCap && (exchange === 'copenhagen' || exchange === 'stockholm')) {
    return { adjustment: 8, profile: 'low', reason: 'Nordic large-cap with historically lower volatility than US equivalents' };
  }
  if (isLargeCap && exchange === 'helsinki') {
    return { adjustment: 5, profile: 'low', reason: 'Finnish large-cap with moderate stability' };
  }
  if (isLargeCap && exchange === 'oslo') {
    // Check for oil/energy
    if (['EQNR.OL', 'AKRBP.OL', 'DNO.OL'].includes(symbol)) {
      return { adjustment: -3, profile: 'high', reason: 'Norwegian oil stock — commodity-driven volatility adds risk' };
    }
    return { adjustment: 4, profile: 'moderate', reason: 'Norwegian large-cap with commodity exposure' };
  }

  // Mid-caps
  if (isMidCap) {
    return { adjustment: 2, profile: 'moderate', reason: 'Nordic mid-cap with moderate liquidity' };
  }

  // Small-caps
  return { adjustment: -5, profile: 'high', reason: 'Nordic small-cap — lower liquidity means higher volatility and wider spreads' };
}


// ─── Public Holidays 2026 ────────────────────────────────────────────────────

export const NORDIC_HOLIDAYS_2026: NordicHoliday[] = [
  // Denmark 🇩🇰
  { date: '2026-01-01', name: "New Year's Day", nameLocal: 'Nytårsdag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-04-02', name: 'Maundy Thursday', nameLocal: 'Skærtorsdag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-04-03', name: 'Good Friday', nameLocal: 'Langfredag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-04-06', name: 'Easter Monday', nameLocal: '2. Påskedag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-05-01', name: 'Great Prayer Day', nameLocal: 'Store Bededag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-05-14', name: 'Ascension Day', nameLocal: 'Kristi Himmelfartsdag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-05-25', name: 'Whit Monday', nameLocal: '2. Pinsedag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-06-05', name: 'Constitution Day', nameLocal: 'Grundlovsdag', country: 'Denmark', exchange: 'copenhagen', halfDay: true },
  { date: '2026-12-24', name: 'Christmas Eve', nameLocal: 'Juleaftensdag', country: 'Denmark', exchange: 'copenhagen', halfDay: true },
  { date: '2026-12-25', name: 'Christmas Day', nameLocal: 'Juledag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-12-26', name: '2nd Christmas Day', nameLocal: '2. Juledag', country: 'Denmark', exchange: 'copenhagen', halfDay: false },
  { date: '2026-12-31', name: "New Year's Eve", nameLocal: 'Nytårsaftensdag', country: 'Denmark', exchange: 'copenhagen', halfDay: true },

  // Sweden 🇸🇪
  { date: '2026-01-01', name: "New Year's Day", nameLocal: 'Nyårsdagen', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-01-06', name: 'Epiphany', nameLocal: 'Trettondedag jul', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-04-03', name: 'Good Friday', nameLocal: 'Långfredagen', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-04-06', name: 'Easter Monday', nameLocal: 'Annandag påsk', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-05-01', name: 'May Day', nameLocal: 'Första maj', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-05-14', name: 'Ascension Day', nameLocal: 'Kristi himmelsfärdsdag', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-06-06', name: 'National Day', nameLocal: 'Sveriges nationaldag', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-06-19', name: 'Midsummer Eve', nameLocal: 'Midsommarafton', country: 'Sweden', exchange: 'stockholm', halfDay: true },
  { date: '2026-12-24', name: 'Christmas Eve', nameLocal: 'Julafton', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-12-25', name: 'Christmas Day', nameLocal: 'Juldagen', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-12-26', name: "Boxing Day", nameLocal: 'Annandag jul', country: 'Sweden', exchange: 'stockholm', halfDay: false },
  { date: '2026-12-31', name: "New Year's Eve", nameLocal: 'Nyårsafton', country: 'Sweden', exchange: 'stockholm', halfDay: true },

  // Norway 🇳🇴
  { date: '2026-01-01', name: "New Year's Day", nameLocal: 'Første nyttårsdag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-04-02', name: 'Maundy Thursday', nameLocal: 'Skjærtorsdag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-04-03', name: 'Good Friday', nameLocal: 'Langfredag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-04-06', name: 'Easter Monday', nameLocal: '2. Påskedag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-05-01', name: 'May Day', nameLocal: 'Arbeidernes dag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-05-14', name: 'Ascension Day', nameLocal: 'Kristi himmelfartsdag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-05-17', name: 'Constitution Day', nameLocal: 'Grunnlovsdagen', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-05-25', name: 'Whit Monday', nameLocal: '2. Pinsedag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-12-25', name: 'Christmas Day', nameLocal: 'Første juledag', country: 'Norway', exchange: 'oslo', halfDay: false },
  { date: '2026-12-26', name: '2nd Christmas Day', nameLocal: 'Andre juledag', country: 'Norway', exchange: 'oslo', halfDay: false },

  // Finland 🇫🇮
  { date: '2026-01-01', name: "New Year's Day", nameLocal: 'Uudenvuodenpäivä', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-01-06', name: 'Epiphany', nameLocal: 'Loppiainen', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-04-03', name: 'Good Friday', nameLocal: 'Pitkäperjantai', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-04-06', name: 'Easter Monday', nameLocal: '2. pääsiäispäivä', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-05-01', name: 'May Day', nameLocal: 'Vappu', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-05-14', name: 'Ascension Day', nameLocal: 'Helatorstai', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-06-19', name: 'Midsummer Eve', nameLocal: 'Juhannusaatto', country: 'Finland', exchange: 'helsinki', halfDay: true },
  { date: '2026-12-06', name: 'Independence Day', nameLocal: 'Itsenäisyyspäivä', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-12-24', name: 'Christmas Eve', nameLocal: 'Jouluaatto', country: 'Finland', exchange: 'helsinki', halfDay: true },
  { date: '2026-12-25', name: 'Christmas Day', nameLocal: 'Joulupäivä', country: 'Finland', exchange: 'helsinki', halfDay: false },
  { date: '2026-12-26', name: "St. Stephen's Day", nameLocal: 'Tapaninpäivä', country: 'Finland', exchange: 'helsinki', halfDay: false },
];


// ─── Index Data ──────────────────────────────────────────────────────────────

const NORDIC_INDICES: NordicIndex[] = [
  { exchange: 'copenhagen', symbol: 'OMXC25', name: 'OMX Copenhagen 25', country: 'Denmark', currency: 'DKK', currentValue: 2834.12, dayChange: 12.56, dayChangePct: 0.45, weekChangePct: 1.2, monthChangePct: 3.8, ytdChangePct: 14.2, constituents: 25 },
  { exchange: 'stockholm', symbol: 'OMXS30', name: 'OMX Stockholm 30', country: 'Sweden', currency: 'SEK', currentValue: 2654.78, dayChange: -8.34, dayChangePct: -0.31, weekChangePct: 0.8, monthChangePct: 2.1, ytdChangePct: 11.5, constituents: 30 },
  { exchange: 'helsinki', symbol: 'OMXH25', name: 'OMX Helsinki 25', country: 'Finland', currency: 'EUR', currentValue: 5123.45, dayChange: 34.21, dayChangePct: 0.67, weekChangePct: -0.4, monthChangePct: 1.5, ytdChangePct: 8.2, constituents: 25 },
  { exchange: 'oslo', symbol: 'OBX', name: 'OBX Total Return', country: 'Norway', currency: 'NOK', currentValue: 1345.67, dayChange: -5.89, dayChangePct: -0.44, weekChangePct: -1.1, monthChangePct: -0.8, ytdChangePct: 6.4, constituents: 25 },
];

// ─── Top Movers Data ─────────────────────────────────────────────────────────

const TOP_MOVERS: Record<NordicExchange, NordicStock[]> = {
  copenhagen: [
    { symbol: 'VWS.CO', name: 'Vestas Wind', exchange: 'copenhagen', currency: 'DKK', currentPrice: 158, priceDKK: 158, dayChange: 4.8, dayChangePct: 3.14, volume: 2840000, marketCap: 190000000000, sector: 'Energy', beginnerScore: 58, adjustedScore: 66, volatilityProfile: 'moderate' },
    { symbol: 'NOVO-B.CO', name: 'Novo Nordisk', exchange: 'copenhagen', currency: 'DKK', currentPrice: 845, priceDKK: 845, dayChange: 12.8, dayChangePct: 1.54, volume: 4200000, marketCap: 3420000000000, sector: 'Healthcare', beginnerScore: 87, adjustedScore: 95, volatilityProfile: 'low' },
    { symbol: 'DSV.CO', name: 'DSV', exchange: 'copenhagen', currency: 'DKK', currentPrice: 1523, priceDKK: 1523, dayChange: 28.5, dayChangePct: 1.91, volume: 890000, marketCap: 355000000000, sector: 'Industrials', beginnerScore: 74, adjustedScore: 82, volatilityProfile: 'low' },
    { symbol: 'ORSTED.CO', name: 'Ørsted', exchange: 'copenhagen', currency: 'DKK', currentPrice: 412, priceDKK: 412, dayChange: -8.2, dayChangePct: -1.95, volume: 1560000, marketCap: 172000000000, sector: 'Energy', beginnerScore: 35, adjustedScore: 40, volatilityProfile: 'high' },
    { symbol: 'CARL-B.CO', name: 'Carlsberg', exchange: 'copenhagen', currency: 'DKK', currentPrice: 945, priceDKK: 945, dayChange: -8.4, dayChangePct: -0.88, volume: 670000, marketCap: 128000000000, sector: 'Consumer', beginnerScore: 62, adjustedScore: 70, volatilityProfile: 'low' },
  ],
  stockholm: [
    { symbol: 'ERIC-B.ST', name: 'Ericsson B', exchange: 'stockholm', currency: 'SEK', currentPrice: 82.5, priceDKK: 53.2, dayChange: 3.2, dayChangePct: 4.03, volume: 18500000, marketCap: 275000000000, sector: 'Technology', beginnerScore: 55, adjustedScore: 63, volatilityProfile: 'moderate' },
    { symbol: 'VOLV-B.ST', name: 'Volvo B', exchange: 'stockholm', currency: 'SEK', currentPrice: 285, priceDKK: 183.8, dayChange: 6.5, dayChangePct: 2.33, volume: 8400000, marketCap: 580000000000, sector: 'Industrials', beginnerScore: 72, adjustedScore: 80, volatilityProfile: 'low' },
    { symbol: 'ATCO-A.ST', name: 'Atlas Copco A', exchange: 'stockholm', currency: 'SEK', currentPrice: 192, priceDKK: 123.8, dayChange: 2.8, dayChangePct: 1.48, volume: 5200000, marketCap: 725000000000, sector: 'Industrials', beginnerScore: 78, adjustedScore: 86, volatilityProfile: 'low' },
    { symbol: 'SEB-A.ST', name: 'SEB A', exchange: 'stockholm', currency: 'SEK', currentPrice: 165, priceDKK: 106.4, dayChange: -3.2, dayChangePct: -1.90, volume: 4100000, marketCap: 345000000000, sector: 'Financials', beginnerScore: 60, adjustedScore: 68, volatilityProfile: 'moderate' },
    { symbol: 'HM-B.ST', name: 'H&M B', exchange: 'stockholm', currency: 'SEK', currentPrice: 178, priceDKK: 114.8, dayChange: -4.5, dayChangePct: -2.47, volume: 6800000, marketCap: 290000000000, sector: 'Consumer', beginnerScore: 52, adjustedScore: 57, volatilityProfile: 'moderate' },
  ],
  helsinki: [
    { symbol: 'NOKIA.HE', name: 'Nokia', exchange: 'helsinki', currency: 'EUR', currentPrice: 4.85, priceDKK: 36.2, dayChange: 0.18, dayChangePct: 3.85, volume: 28000000, marketCap: 27000000000, sector: 'Technology', beginnerScore: 45, adjustedScore: 50, volatilityProfile: 'moderate' },
    { symbol: 'SAMPO.HE', name: 'Sampo', exchange: 'helsinki', currency: 'EUR', currentPrice: 42.8, priceDKK: 319.3, dayChange: 0.92, dayChangePct: 2.20, volume: 1800000, marketCap: 23000000000, sector: 'Financials', beginnerScore: 65, adjustedScore: 70, volatilityProfile: 'low' },
    { symbol: 'UPM.HE', name: 'UPM-Kymmene', exchange: 'helsinki', currency: 'EUR', currentPrice: 28.4, priceDKK: 211.9, dayChange: 0.45, dayChangePct: 1.61, volume: 2400000, marketCap: 15200000000, sector: 'Materials', beginnerScore: 48, adjustedScore: 46, volatilityProfile: 'moderate' },
    { symbol: 'FORTUM.HE', name: 'Fortum', exchange: 'helsinki', currency: 'EUR', currentPrice: 15.2, priceDKK: 113.4, dayChange: -0.35, dayChangePct: -2.25, volume: 3200000, marketCap: 13500000000, sector: 'Utilities', beginnerScore: 42, adjustedScore: 44, volatilityProfile: 'high' },
    { symbol: 'NESTE.HE', name: 'Neste', exchange: 'helsinki', currency: 'EUR', currentPrice: 18.9, priceDKK: 141.0, dayChange: -0.82, dayChangePct: -4.16, volume: 4800000, marketCap: 14500000000, sector: 'Energy', beginnerScore: 38, adjustedScore: 36, volatilityProfile: 'high' },
  ],
  oslo: [
    { symbol: 'EQNR.OL', name: 'Equinor', exchange: 'oslo', currency: 'NOK', currentPrice: 312, priceDKK: 203.4, dayChange: 8.5, dayChangePct: 2.80, volume: 5600000, marketCap: 890000000000, sector: 'Energy', beginnerScore: 58, adjustedScore: 55, volatilityProfile: 'high' },
    { symbol: 'DNB.OL', name: 'DNB Bank', exchange: 'oslo', currency: 'NOK', currentPrice: 225, priceDKK: 146.7, dayChange: 3.2, dayChangePct: 1.44, volume: 3200000, marketCap: 340000000000, sector: 'Financials', beginnerScore: 62, adjustedScore: 66, volatilityProfile: 'moderate' },
    { symbol: 'MOWI.OL', name: 'Mowi (Marine Harvest)', exchange: 'oslo', currency: 'NOK', currentPrice: 185, priceDKK: 120.6, dayChange: 4.8, dayChangePct: 2.66, volume: 2100000, marketCap: 95000000000, sector: 'Consumer', beginnerScore: 52, adjustedScore: 54, volatilityProfile: 'moderate' },
    { symbol: 'TEL.OL', name: 'Telenor', exchange: 'oslo', currency: 'NOK', currentPrice: 128, priceDKK: 83.5, dayChange: -1.2, dayChangePct: -0.93, volume: 2800000, marketCap: 185000000000, sector: 'Telecom', beginnerScore: 64, adjustedScore: 68, volatilityProfile: 'low' },
    { symbol: 'AKRBP.OL', name: 'Aker BP', exchange: 'oslo', currency: 'NOK', currentPrice: 245, priceDKK: 159.7, dayChange: -8.4, dayChangePct: -3.31, volume: 1900000, marketCap: 145000000000, sector: 'Energy', beginnerScore: 42, adjustedScore: 39, volatilityProfile: 'high' },
  ],
};

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get full Nordic market overview.
 */
export function getNordicOverview(): NordicOverview {
  const today = new Date().toISOString().split('T')[0];
  const upcoming = NORDIC_HOLIDAYS_2026
    .filter(h => h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const marketStatus: MarketStatus[] = Object.entries(EXCHANGE_INFO).map(([key, info]) => {
    const exchange = key as NordicExchange;
    const isHoliday = NORDIC_HOLIDAYS_2026.some(h => h.date === today && h.exchange === exchange && !h.halfDay);
    const now = new Date();
    const hour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const [openH] = info.openTime.split(':').map(Number);
    const [closeH] = info.closeTime.split(':').map(Number);
    const isOpen = !isWeekend && !isHoliday && hour >= openH && hour < closeH;

    return {
      exchange,
      isOpen,
      nextOpen: isOpen ? 'Now' : `${info.openTime} CET`,
      nextClose: isOpen ? `${info.closeTime} CET` : '—',
      reason: isHoliday ? 'Public holiday' : isWeekend ? 'Weekend' : undefined,
    };
  });

  return {
    indices: NORDIC_INDICES,
    topMovers: TOP_MOVERS,
    marketStatus,
    upcomingHolidays: upcoming,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get all stocks on a specific exchange.
 */
export function getExchangeStocks(exchange: NordicExchange): NordicStock[] {
  return TOP_MOVERS[exchange] || [];
}

/**
 * Check if a specific exchange is open right now.
 */
export function isExchangeOpen(exchange: NordicExchange): boolean {
  const info = EXCHANGE_INFO[exchange];
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const today = now.toISOString().split('T')[0];
  const isHoliday = NORDIC_HOLIDAYS_2026.some(h => h.date === today && h.exchange === exchange && !h.halfDay);
  if (isHoliday) return false;

  const hour = now.getHours();
  const minute = now.getMinutes();
  const [openH, openM] = info.openTime.split(':').map(Number);
  const [closeH, closeM] = info.closeTime.split(':').map(Number);
  const nowMinutes = hour * 60 + minute;
  return nowMinutes >= openH * 60 + openM && nowMinutes < closeH * 60 + closeM;
}
