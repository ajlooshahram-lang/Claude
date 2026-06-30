/**
 * Annual Report Parser Engine
 *
 * Extracts structured financial metrics from uploaded PDF annual reports.
 * Uses text extraction + pattern matching to identify:
 * - Revenue and YoY growth
 * - Net profit margin (3-year trend)
 * - Debt-to-equity ratio
 * - Free cash flow
 * - Return on equity (ROE)
 * - Employee count and revenue/employee
 * - Forward guidance statements
 *
 * Architecture:
 *   PDF upload → text extraction → metric extraction → flag generation → AI summary
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedMetric {
  label: string;
  value: number | string | null;
  unit: string;
  previousYear?: number | string | null;
  yearOverYear?: number | null;     // % change
  trend?: 'improving' | 'stable' | 'declining';
  flag?: MetricFlag | null;
  source?: string;                   // Which section it was found in
}

export interface MetricFlag {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface ForwardGuidance {
  statement: string;
  category: 'revenue' | 'profit' | 'growth' | 'investment' | 'risk' | 'general';
}

export interface ParsedAnnualReport {
  companyName: string;
  reportYear: number;
  currency: string;
  metrics: {
    revenue: ExtractedMetric;
    revenueGrowth: ExtractedMetric;
    netProfitMargin: ExtractedMetric;
    netProfitMargin3yr: {
      year1: { year: number; value: number };
      year2: { year: number; value: number };
      year3: { year: number; value: number };
    } | null;
    debtToEquity: ExtractedMetric;
    freeCashFlow: ExtractedMetric;
    returnOnEquity: ExtractedMetric;
    employees: ExtractedMetric;
    revenuePerEmployee: ExtractedMetric;
  };
  forwardGuidance: ForwardGuidance[];
  flags: MetricFlag[];
  aiInterpretation: string;
  rawTextPreview: string;
  parsedAt: string;
  confidence: number;              // 0-1 how confident we are in extraction
}

export interface ParseProgress {
  stage: 'uploading' | 'extracting' | 'analyzing' | 'flagging' | 'interpreting' | 'complete';
  percent: number;
  message: string;
}


// ─── Text Extraction from PDF ────────────────────────────────────────────────

/**
 * Extract text from a PDF file using the browser's built-in capabilities.
 * In production, use pdf.js or a server-side parser for better accuracy.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  // For demo: use FileReader to get the raw bytes, then extract text patterns
  // In production: use pdf.js (Mozilla's PDF parser) or send to backend
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        // Text-based PDF
        resolve(cleanExtractedText(content));
      } else if (content instanceof ArrayBuffer) {
        // Binary PDF — extract what we can from the buffer
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const rawText = textDecoder.decode(content);
        // Extract readable strings from the binary data
        const readable = rawText.match(/[\x20-\x7E\xC0-\xFF]{4,}/g)?.join(' ') || '';
        resolve(cleanExtractedText(readable));
      } else {
        resolve('');
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xC0-\xFF.,;:!?()%€$£¥\-\n]/g, ' ')
    .trim();
}


// ─── Metric Extraction Engine ────────────────────────────────────────────────

/**
 * Extract financial metrics from the raw text.
 * Uses regex patterns and heuristics to find key numbers.
 */
export function extractMetrics(text: string, fileName: string): ParsedAnnualReport {
  const lowerText = text.toLowerCase();

  // Detect company name from filename or text
  const companyName = detectCompanyName(fileName, text);

  // Detect currency
  const currency = detectCurrency(text);

  // Detect report year
  const reportYear = detectReportYear(text);

  // Extract revenue
  const revenue = extractRevenue(text);
  const previousRevenue = extractPreviousRevenue(text);
  const revenueGrowthPct = (revenue && previousRevenue && previousRevenue > 0)
    ? ((revenue - previousRevenue) / previousRevenue) * 100
    : null;

  // Extract net income and calculate margin
  const netIncome = extractNetIncome(text);
  const netProfitMargin = (netIncome !== null && revenue)
    ? (netIncome / revenue) * 100
    : null;

  // Extract 3-year margin trend
  const marginTrend = extractMarginTrend(text, reportYear);

  // Extract debt and equity
  const totalDebt = extractNumber(text, [
    /total\s+(debt|liabilities)[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b|mio|mDKK)?/i,
    /debt[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b)?/i,
  ]);
  const totalEquity = extractNumber(text, [
    /total\s+(equity|shareholders.?\s*equity)[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b|mio)?/i,
    /equity[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b)?/i,
  ]);
  const debtToEquity = (totalDebt !== null && totalEquity && totalEquity > 0)
    ? totalDebt / totalEquity
    : null;

  // Extract free cash flow
  const freeCashFlow = extractNumber(text, [
    /free\s*cash\s*flow[:\s]*[\$€£]?([\-\d,.]+)\s*(million|billion|m|b|mio)?/i,
    /FCF[:\s]*[\$€£]?([\-\d,.]+)\s*(million|billion|m|b)?/i,
  ]);

  // Extract ROE
  const roe = extractPercentage(text, [
    /return\s*on\s*equity[:\s]*([\d.]+)\s*%/i,
    /ROE[:\s]*([\d.]+)\s*%/i,
  ]) || ((netIncome !== null && totalEquity && totalEquity > 0)
    ? (netIncome / totalEquity) * 100
    : null);

  // Extract employees
  const employees = extractEmployeeCount(text);
  const revenuePerEmployee = (revenue && employees)
    ? revenue / employees
    : null;

  // Extract forward guidance
  const forwardGuidance = extractForwardGuidance(text);

  // Build metrics
  const metrics = {
    revenue: buildMetric('Total Revenue', revenue, currency, previousRevenue),
    revenueGrowth: buildMetric('Revenue Growth (YoY)', revenueGrowthPct, '%', null),
    netProfitMargin: buildMetric('Net Profit Margin', netProfitMargin, '%', null),
    netProfitMargin3yr: marginTrend,
    debtToEquity: buildMetric('Debt-to-Equity Ratio', debtToEquity, 'x', null),
    freeCashFlow: buildMetric('Free Cash Flow', freeCashFlow, currency, null),
    returnOnEquity: buildMetric('Return on Equity (ROE)', roe, '%', null),
    employees: buildMetric('Number of Employees', employees, 'people', null),
    revenuePerEmployee: buildMetric('Revenue per Employee', revenuePerEmployee, currency, null),
  };

  // Generate flags
  const flags = generateFlags(metrics, revenueGrowthPct, netProfitMargin, debtToEquity, freeCashFlow, roe);

  // Generate AI interpretation
  const aiInterpretation = generateInterpretation(companyName, reportYear, metrics, flags, revenueGrowthPct, netProfitMargin, debtToEquity, freeCashFlow, roe);

  // Confidence score based on how many metrics we extracted
  const extractedCount = Object.values(metrics).filter(m => {
    if (m && typeof m === 'object' && 'value' in m) return m.value !== null;
    return m !== null;
  }).length;
  const confidence = Math.min(1, extractedCount / 8);

  return {
    companyName,
    reportYear,
    currency,
    metrics,
    forwardGuidance,
    flags,
    aiInterpretation,
    rawTextPreview: text.slice(0, 500),
    parsedAt: new Date().toISOString(),
    confidence,
  };
}


// ─── Helper Functions ────────────────────────────────────────────────────────

function detectCompanyName(fileName: string, text: string): string {
  // Try filename first
  const fromFile = fileName.replace(/\.(pdf|PDF)$/, '').replace(/[-_]/g, ' ').replace(/\d{4}/g, '').replace(/annual\s*report/i, '').trim();
  if (fromFile.length > 2 && fromFile.length < 50) return fromFile;

  // Try common patterns in text
  const patterns = [
    /(?:annual report|årsrapport)\s+(?:\d{4}\s+)?(.{3,40}?)(?:\s+\d{4}|\n)/i,
    /^(.{3,30}?)\s+(?:A\/S|ApS|Inc|Corp|Ltd|plc|AB|ASA)/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return 'Unknown Company';
}

function detectCurrency(text: string): string {
  if (/DKK|kr\.|danish krone/i.test(text)) return 'DKK';
  if (/EUR|€/i.test(text)) return 'EUR';
  if (/USD|\$/i.test(text)) return 'USD';
  if (/SEK|swedish kron/i.test(text)) return 'SEK';
  if (/NOK|norwegian kron/i.test(text)) return 'NOK';
  if (/GBP|£/i.test(text)) return 'GBP';
  return 'DKK';
}

function detectReportYear(text: string): number {
  const match = text.match(/(?:annual report|årsrapport|fiscal year|fy)\s*(\d{4})/i)
    || text.match(/(\d{4})(?:\s*\/\s*\d{2,4})?(?:\s*annual)/i)
    || text.match(/\b(20[12]\d)\b/);
  return match ? parseInt(match[1]) : new Date().getFullYear() - 1;
}

function extractRevenue(text: string): number | null {
  return extractNumber(text, [
    /(?:total\s*)?revenue[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b|mio|mDKK|bn)?/i,
    /net\s*(?:revenue|sales|turnover)[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b|mio)?/i,
    /turnover[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b|mio)?/i,
    /omsætning[:\s]*[\$€£]?([\d,.]+)\s*(million|mio|mDKK)?/i,
  ]);
}

function extractPreviousRevenue(text: string): number | null {
  // Look for comparative figures
  const match = text.match(/(?:previous year|last year|20\d{2})[:\s]*revenue[:\s]*[\$€£]?([\d,.]+)\s*(million|billion|m|b|mio)?/i);
  if (match) return parseFinancialNumber(match[1], match[2]);
  return null;
}

function extractNetIncome(text: string): number | null {
  return extractNumber(text, [
    /net\s*(?:income|profit|result)[:\s]*[\$€£]?([\-\d,.]+)\s*(million|billion|m|b|mio)?/i,
    /(?:profit|result)\s*(?:for the (?:year|period)|after tax)[:\s]*[\$€£]?([\-\d,.]+)\s*(million|billion|m|b|mio)?/i,
    /årets resultat[:\s]*[\$€£]?([\-\d,.]+)\s*(million|mio)?/i,
  ]);
}

function extractEmployeeCount(text: string): number | null {
  const patterns = [
    /(?:number of |average |total )?employees?[:\s]*([\d,.]+)/i,
    /(?:antal )?medarbejdere[:\s]*([\d,.]+)/i,
    /headcount[:\s]*([\d,.]+)/i,
    /FTE[:\s]*([\d,.]+)/i,
    /([\d,.]+)\s*(?:full.?time )?employees/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const num = parseInt(m[1].replace(/[,.]/g, ''));
      if (num > 1 && num < 10000000) return num; // Sanity check
    }
  }
  return null;
}

function extractPercentage(text: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const numStr = m[1] || m[2];
      const unit = m[2] || m[3] || '';
      return parseFinancialNumber(numStr, unit);
    }
  }
  return null;
}

function parseFinancialNumber(numStr: string, unit: string): number {
  // Handle European number format (1.234,56) vs US (1,234.56)
  let cleaned = numStr.replace(/\s/g, '');
  if (/,\d{2}$/.test(cleaned)) {
    // European: 1.234,56 → 1234.56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  const unitLower = (unit || '').toLowerCase();
  if (/billion|bn|b/i.test(unitLower)) num *= 1000000000;
  else if (/million|mio|m(?:dkk)?/i.test(unitLower)) num *= 1000000;

  return num;
}

function extractMarginTrend(text: string, reportYear: number): ParsedAnnualReport['metrics']['netProfitMargin3yr'] {
  // Try to find 3 years of margin data
  // This is a simplified heuristic — real implementation would use table parsing
  const margins: { year: number; value: number }[] = [];
  for (let y = reportYear; y >= reportYear - 2; y--) {
    const pattern = new RegExp(`${y}[^\\d]*(?:net\\s*(?:profit\\s*)?margin|profit margin)[:\\s]*(\\d+[.]?\\d*)\\s*%`, 'i');
    const m = text.match(pattern);
    if (m) margins.push({ year: y, value: parseFloat(m[1]) });
  }
  if (margins.length === 3) {
    return { year1: margins[2], year2: margins[1], year3: margins[0] };
  }
  return null;
}


// ─── Forward Guidance Extraction ─────────────────────────────────────────────

function extractForwardGuidance(text: string): ForwardGuidance[] {
  const guidance: ForwardGuidance[] = [];
  const guidancePatterns = [
    { regex: /(?:we expect|we anticipate|outlook for \d{4}|guidance|looking ahead|for the coming year|next year we)[^.]{10,150}\./gi, category: 'general' as const },
    { regex: /(?:revenue|sales|turnover) (?:is expected|are expected|will|should|guidance)[^.]{10,120}\./gi, category: 'revenue' as const },
    { regex: /(?:profit|margin|earnings) (?:is expected|are expected|will|guidance)[^.]{10,120}\./gi, category: 'profit' as const },
    { regex: /(?:invest|capex|capital expenditure|R&D) (?:is expected|will|plan to)[^.]{10,120}\./gi, category: 'investment' as const },
    { regex: /(?:growth|expand|increase|target) (?:of|in|our)[^.]{10,120}\./gi, category: 'growth' as const },
    { regex: /(?:risk|challenge|headwind|uncertain)[^.]{10,120}\./gi, category: 'risk' as const },
  ];

  for (const { regex, category } of guidancePatterns) {
    const matches = text.matchAll(regex);
    for (const m of matches) {
      const statement = m[0].trim();
      if (statement.length > 20 && statement.length < 200) {
        // Avoid duplicates
        if (!guidance.some(g => g.statement === statement)) {
          guidance.push({ statement, category });
        }
      }
    }
  }

  return guidance.slice(0, 8); // Cap at 8 guidance statements
}

// ─── Flag Generation ─────────────────────────────────────────────────────────

function generateFlags(
  metrics: ParsedAnnualReport['metrics'],
  revenueGrowth: number | null,
  netMargin: number | null,
  debtToEquity: number | null,
  fcf: number | null,
  roe: number | null,
): MetricFlag[] {
  const flags: MetricFlag[] = [];

  // Revenue declining
  if (revenueGrowth !== null && revenueGrowth < -5) {
    flags.push({ severity: 'critical', message: `Revenue declined ${Math.abs(revenueGrowth).toFixed(1)}% year-over-year. This suggests the company is losing market share or facing demand headwinds.` });
  } else if (revenueGrowth !== null && revenueGrowth < 0) {
    flags.push({ severity: 'warning', message: `Revenue declined slightly (${revenueGrowth.toFixed(1)}%). Worth monitoring — one flat year is normal, two in a row is concerning.` });
  }

  // Profit margin
  if (netMargin !== null && netMargin < 0) {
    flags.push({ severity: 'critical', message: `The company is losing money (net margin: ${netMargin.toFixed(1)}%). They spend more than they earn. This is unsustainable long-term unless they have a clear path to profitability.` });
  } else if (netMargin !== null && netMargin < 3) {
    flags.push({ severity: 'warning', message: `Very thin profit margins (${netMargin.toFixed(1)}%). Any small cost increase or revenue dip could push this into a loss. The business has little room for error.` });
  }

  // Debt-to-equity
  if (debtToEquity !== null && debtToEquity > 3) {
    flags.push({ severity: 'critical', message: `Very high debt-to-equity ratio (${debtToEquity.toFixed(2)}x). The company owes more than 3x what it owns. Rising interest rates or a revenue decline could create serious financial stress.` });
  } else if (debtToEquity !== null && debtToEquity > 1.5) {
    flags.push({ severity: 'warning', message: `Elevated debt-to-equity (${debtToEquity.toFixed(2)}x). Not alarming on its own, but keep an eye on whether debt is increasing or decreasing year-over-year.` });
  }

  // Negative free cash flow
  if (fcf !== null && fcf < 0) {
    flags.push({ severity: 'warning', message: `Negative free cash flow (${formatLargeNumber(fcf)}). The company is burning through cash. This is acceptable during heavy investment phases but concerning if it persists.` });
  }

  // Low or negative ROE
  if (roe !== null && roe < 0) {
    flags.push({ severity: 'critical', message: `Negative return on equity (${roe.toFixed(1)}%). Shareholders' investment is generating losses. This means the business destroyed value this year.` });
  } else if (roe !== null && roe < 8) {
    flags.push({ severity: 'info', message: `ROE of ${roe.toFixed(1)}% is below the 10-15% typically expected from a good business. Investors might get better returns elsewhere.` });
  }

  return flags;
}

// ─── AI Interpretation Generator ─────────────────────────────────────────────

function generateInterpretation(
  companyName: string,
  year: number,
  metrics: ParsedAnnualReport['metrics'],
  flags: MetricFlag[],
  revenueGrowth: number | null,
  netMargin: number | null,
  debtToEquity: number | null,
  fcf: number | null,
  roe: number | null,
): string {
  const parts: string[] = [];

  // Opening
  parts.push(`Based on ${companyName}'s ${year} annual report,`);

  // Revenue health
  if (revenueGrowth !== null) {
    if (revenueGrowth > 10) parts.push(`the business is growing strongly at ${revenueGrowth.toFixed(0)}% per year, which suggests healthy demand for their products or services.`);
    else if (revenueGrowth > 0) parts.push(`revenue grew modestly at ${revenueGrowth.toFixed(0)}%, indicating stable but not exceptional demand.`);
    else parts.push(`revenue declined ${Math.abs(revenueGrowth).toFixed(0)}%, which is a warning sign that demand may be weakening.`);
  } else {
    parts.push(`revenue figures could not be fully extracted from the document.`);
  }

  // Profitability
  if (netMargin !== null) {
    if (netMargin > 15) parts.push(`The company is highly profitable with ${netMargin.toFixed(0)}% net margins — for every 100 kr earned, ${netMargin.toFixed(0)} kr becomes pure profit.`);
    else if (netMargin > 5) parts.push(`Profitability is decent at ${netMargin.toFixed(0)}% net margins, though there's room for improvement.`);
    else if (netMargin > 0) parts.push(`Margins are thin at ${netMargin.toFixed(0)}%, leaving little buffer against unexpected costs.`);
    else parts.push(`The company is currently unprofitable, which means it's spending more than it earns.`);
  }

  // Financial health
  if (debtToEquity !== null) {
    if (debtToEquity < 0.5) parts.push(`The balance sheet is conservatively managed with low debt (${debtToEquity.toFixed(1)}x D/E), giving the company flexibility.`);
    else if (debtToEquity > 2) parts.push(`Debt levels are elevated (${debtToEquity.toFixed(1)}x D/E), which adds financial risk in a rising interest rate environment.`);
  }

  // Cash flow
  if (fcf !== null) {
    if (fcf > 0) parts.push(`Positive free cash flow of ${formatLargeNumber(fcf)} means the business generates real cash after paying all its bills and investments — this is a sign of genuine financial health.`);
    else parts.push(`Negative free cash flow means the company is currently consuming more cash than it generates, which cannot continue indefinitely.`);
  }

  // Overall verdict
  const criticalFlags = flags.filter(f => f.severity === 'critical').length;
  if (criticalFlags >= 2) {
    parts.push(`Overall, this report raises multiple serious concerns. A beginner investor should exercise extreme caution and understand the risks before considering this stock.`);
  } else if (criticalFlags === 1) {
    parts.push(`Overall, the company has one significant area of concern that deserves careful monitoring, but is not necessarily a dealbreaker if the underlying trend improves.`);
  } else if (flags.length === 0) {
    parts.push(`Overall, the financial picture looks healthy across key metrics. No major red flags were identified.`);
  } else {
    parts.push(`Overall, the company appears reasonably healthy with some areas to monitor. As always, diversification and patience are a beginner investor's best tools.`);
  }

  return parts.join(' ');
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────

function buildMetric(label: string, value: number | null, unit: string, previous: number | null): ExtractedMetric {
  let yearOverYear: number | null = null;
  let trend: ExtractedMetric['trend'] = undefined;

  if (value !== null && previous !== null && previous !== 0) {
    yearOverYear = ((value - previous) / Math.abs(previous)) * 100;
    trend = yearOverYear > 2 ? 'improving' : yearOverYear < -2 ? 'declining' : 'stable';
  }

  return { label, value, unit, previousYear: previous, yearOverYear, trend, flag: null };
}

export function formatLargeNumber(num: number): string {
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}
