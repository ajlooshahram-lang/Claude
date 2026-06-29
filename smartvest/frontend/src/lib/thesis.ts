/**
 * Investment Thesis Manager
 *
 * Stores and manages investment theses — the reasoning behind every buy decision.
 * After selling, compares actual outcome to original thesis and scores reasoning.
 */

const STORAGE_KEY = 'smartvest_theses';

export interface Thesis {
  id: string;
  symbol: string;
  stockName: string;
  createdAt: string;

  // The 4 required fields
  bullCase: string;       // Why I believe this stock will go up
  riskFactor: string;     // What specific risk could make me wrong
  stopLoss: string;       // At what price/condition I will sell if wrong
  takeProfit: string;     // At what price/condition I will take profit

  // Trade info
  buyPrice: number;
  shares: number;
  sector: string;

  // Status
  status: 'active' | 'closed';

  // Post-sell data (filled when sold)
  sellPrice?: number;
  sellDate?: string;
  sellReason?: string;     // Why did I actually sell?
  actualOutcome?: 'profit' | 'loss' | 'breakeven';
  returnPct?: number;

  // Scoring (0-10)
  thesisScore?: number;       // How well did my reasoning match reality?
  disciplineScore?: number;   // Did I follow my own rules (stop loss / take profit)?
  overallGrade?: string;      // A-F
  scoreExplanation?: string;
}

export function getAllTheses(): Thesis[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveThesis(thesis: Thesis): void {
  const all = getAllTheses();
  const existing = all.findIndex(t => t.id === thesis.id);
  if (existing >= 0) {
    all[existing] = thesis;
  } else {
    all.push(thesis);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function createThesis(data: {
  symbol: string;
  stockName: string;
  bullCase: string;
  riskFactor: string;
  stopLoss: string;
  takeProfit: string;
  buyPrice: number;
  shares: number;
  sector: string;
}): Thesis {
  const thesis: Thesis = {
    id: `thesis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: 'active',
    ...data,
  };
  saveThesis(thesis);
  return thesis;
}

export function closeThesis(
  thesisId: string,
  sellData: {
    sellPrice: number;
    sellDate: string;
    sellReason: string;
  }
): Thesis | null {
  const all = getAllTheses();
  const thesis = all.find(t => t.id === thesisId);
  if (!thesis) return null;

  const returnPct = ((sellData.sellPrice - thesis.buyPrice) / thesis.buyPrice) * 100;
  const actualOutcome: 'profit' | 'loss' | 'breakeven' =
    returnPct > 1 ? 'profit' : returnPct < -1 ? 'loss' : 'breakeven';

  // Score the thesis
  const { thesisScore, disciplineScore, overallGrade, scoreExplanation } =
    scoreThesis(thesis, sellData.sellPrice, sellData.sellReason);

  thesis.status = 'closed';
  thesis.sellPrice = sellData.sellPrice;
  thesis.sellDate = sellData.sellDate;
  thesis.sellReason = sellData.sellReason;
  thesis.actualOutcome = actualOutcome;
  thesis.returnPct = Math.round(returnPct * 10) / 10;
  thesis.thesisScore = thesisScore;
  thesis.disciplineScore = disciplineScore;
  thesis.overallGrade = overallGrade;
  thesis.scoreExplanation = scoreExplanation;

  saveThesis(thesis);
  return thesis;
}

function scoreThesis(
  thesis: Thesis,
  sellPrice: number,
  sellReason: string,
): { thesisScore: number; disciplineScore: number; overallGrade: string; scoreExplanation: string } {
  const returnPct = ((sellPrice - thesis.buyPrice) / thesis.buyPrice) * 100;
  let thesisScore = 5; // Start neutral
  let disciplineScore = 5;
  const explanations: string[] = [];

  // Thesis accuracy scoring
  if (returnPct > 10) {
    thesisScore = 8;
    explanations.push('Your bull case played out — the stock gained significantly.');
  } else if (returnPct > 0) {
    thesisScore = 6;
    explanations.push('Your thesis was partially right — small gain.');
  } else if (returnPct > -5) {
    thesisScore = 4;
    explanations.push('Your thesis didn\'t play out but losses were limited.');
  } else if (returnPct > -15) {
    thesisScore = 3;
    explanations.push('Your bull case was wrong — the risk you identified (or another) materialized.');
  } else {
    thesisScore = 1;
    explanations.push('Significant loss. Your thesis was clearly wrong. Review what you missed.');
  }

  // Discipline scoring — did they follow their own rules?
  const stopLossLower = thesis.stopLoss.toLowerCase();
  const takeProfitLower = thesis.takeProfit.toLowerCase();
  const sellReasonLower = sellReason.toLowerCase();

  // Check if they mentioned following their stop loss or take profit
  if (returnPct < -10 && (
    sellReasonLower.includes('stop') ||
    sellReasonLower.includes('cut') ||
    sellReasonLower.includes('limit')
  )) {
    disciplineScore = 7;
    explanations.push('You followed your stop loss plan. Good discipline even though it hurts.');
  } else if (returnPct < -10) {
    disciplineScore = 3;
    explanations.push('You held past your stated exit point. Discipline needs work.');
  } else if (returnPct > 10 && (
    sellReasonLower.includes('target') ||
    sellReasonLower.includes('profit') ||
    sellReasonLower.includes('plan')
  )) {
    disciplineScore = 9;
    explanations.push('You took profit at your planned level. Excellent discipline.');
  } else if (returnPct > 0) {
    disciplineScore = 6;
    explanations.push('Profit taken but unclear if it matched your original plan.');
  } else {
    disciplineScore = 5;
  }

  // If sold due to panic
  if (sellReasonLower.includes('panic') || sellReasonLower.includes('scared') || sellReasonLower.includes('fear')) {
    disciplineScore = Math.max(1, disciplineScore - 3);
    explanations.push('Selling from emotion (panic/fear) rather than logic. Work on this.');
  }

  // Overall grade
  const avg = (thesisScore + disciplineScore) / 2;
  let overallGrade: string;
  if (avg >= 8) overallGrade = 'A';
  else if (avg >= 6.5) overallGrade = 'B';
  else if (avg >= 5) overallGrade = 'C';
  else if (avg >= 3.5) overallGrade = 'D';
  else overallGrade = 'F';

  return {
    thesisScore,
    disciplineScore,
    overallGrade,
    scoreExplanation: explanations.join(' '),
  };
}

export function getThesisStats(): {
  total: number;
  active: number;
  closed: number;
  avgThesisScore: number;
  avgDisciplineScore: number;
  winRate: number;
  avgGrade: string;
} {
  const all = getAllTheses();
  const closed = all.filter(t => t.status === 'closed');
  const wins = closed.filter(t => t.actualOutcome === 'profit');

  const avgThesis = closed.length > 0
    ? closed.reduce((sum, t) => sum + (t.thesisScore || 5), 0) / closed.length
    : 0;
  const avgDiscipline = closed.length > 0
    ? closed.reduce((sum, t) => sum + (t.disciplineScore || 5), 0) / closed.length
    : 0;

  const avg = (avgThesis + avgDiscipline) / 2;
  let avgGrade: string;
  if (avg >= 8) avgGrade = 'A';
  else if (avg >= 6.5) avgGrade = 'B';
  else if (avg >= 5) avgGrade = 'C';
  else if (avg >= 3.5) avgGrade = 'D';
  else if (avg > 0) avgGrade = 'F';
  else avgGrade = '-';

  return {
    total: all.length,
    active: all.filter(t => t.status === 'active').length,
    closed: closed.length,
    avgThesisScore: Math.round(avgThesis * 10) / 10,
    avgDisciplineScore: Math.round(avgDiscipline * 10) / 10,
    winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
    avgGrade,
  };
}

export function getActiveThesisForSymbol(symbol: string): Thesis | null {
  const all = getAllTheses();
  return all.find(t => t.symbol === symbol && t.status === 'active') || null;
}

export function deleteThesis(thesisId: string): void {
  const all = getAllTheses().filter(t => t.id !== thesisId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
