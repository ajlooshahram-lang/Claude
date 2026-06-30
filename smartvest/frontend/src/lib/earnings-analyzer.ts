/**
 * Earnings Call Transcript Analyzer
 *
 * Performs 5 analyses on any earnings call transcript:
 * 1. Extracts specific numerical guidance (revenue, margins, growth)
 * 2. Identifies top 3 risks mentioned (even buried ones)
 * 3. Detects sentiment shifts between prepared remarks and Q&A
 * 4. Flags defensive/evasive language patterns
 * 5. Compares narrative vs previous quarter
 *
 * Architecture:
 *   Paste/upload transcript → section splitting → parallel analysis → structured report
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NumericalGuidance {
  metric: string;
  value: string;
  context: string;
  confidence: 'explicit' | 'implied' | 'range';
  category: 'revenue' | 'margin' | 'growth' | 'capex' | 'other';
}

export interface IdentifiedRisk {
  title: string;
  quote: string;
  severity: 'high' | 'medium' | 'low';
  category: 'macro' | 'competitive' | 'operational' | 'regulatory' | 'financial';
  buried: boolean;
}

export interface SentimentShift {
  topic: string;
  preparedSentiment: number;
  qaSentiment: number;
  shift: number;
  interpretation: string;
}

export interface EvasiveFlag {
  quote: string;
  topic: string;
  pattern: string;
  severity: 'high' | 'medium';
  explanation: string;
}

export interface NarrativeChange {
  topic: string;
  previousStatement: string;
  currentStatement: string;
  changeType: 'softened' | 'strengthened' | 'reversed' | 'dropped' | 'new';
  significance: 'major' | 'minor';
}

export interface SectionSentiment {
  section: 'prepared' | 'qa';
  overallScore: number;
  positiveCount: number;
  negativeCount: number;
  hedgeCount: number;
  confidenceWords: number;
  uncertaintyWords: number;
}

export interface EarningsAnalysis {
  id: string;
  ticker: string;
  company: string;
  quarter: string;
  analyzedAt: string;
  transcriptLength: number;
  guidance: NumericalGuidance[];
  risks: IdentifiedRisk[];
  sentimentShifts: SentimentShift[];
  evasiveFlags: EvasiveFlag[];
  narrativeChanges: NarrativeChange[];
  preparedSentiment: SectionSentiment;
  qaSentiment: SectionSentiment;
  overallTone: 'very_positive' | 'positive' | 'neutral' | 'cautious' | 'negative';
  executiveSummary: string;
}

export interface PreviousTranscript {
  ticker: string;
  quarter: string;
  keyStatements: string[];
  guidanceGiven: NumericalGuidance[];
  savedAt: string;
}


// ─── Word Lists for Sentiment Analysis ───────────────────────────────────────

const POSITIVE_WORDS = new Set([
  'strong', 'growth', 'exceeded', 'beat', 'record', 'robust', 'confident',
  'momentum', 'accelerating', 'outperform', 'expand', 'improve', 'best',
  'outstanding', 'excellent', 'remarkable', 'impressive', 'ahead', 'upside',
  'optimistic', 'strength', 'opportunity', 'delivered', 'successful', 'proud',
  'thrive', 'innovative', 'breakthrough', 'milestone', 'transform',
]);

const NEGATIVE_WORDS = new Set([
  'decline', 'headwind', 'challenge', 'pressure', 'weak', 'uncertain',
  'risk', 'slowdown', 'difficult', 'miss', 'below', 'concern', 'soft',
  'disappointing', 'deteriorat', 'cautious', 'volatile', 'unfavorable',
  'downturn', 'contraction', 'impair', 'adverse', 'struggle', 'loss',
  'constraint', 'disruption', 'setback', 'negative', 'worse',
]);

const HEDGE_WORDS = new Set([
  'approximately', 'roughly', 'about', 'around', 'potentially', 'possibly',
  'might', 'could', 'may', 'likely', 'somewhat', 'relatively', 'largely',
  'generally', 'broadly', 'essentially', 'virtually', 'almost',
]);

const CONFIDENCE_WORDS = new Set([
  'will', 'committed', 'expect', 'confident', 'certain', 'clear',
  'definitely', 'absolutely', 'guaranteed', 'on track', 'executing',
]);

const UNCERTAINTY_WORDS = new Set([
  'uncertain', 'unclear', 'depends', 'hard to predict', 'difficult to say',
  'wait and see', 'remains to be seen', 'evolving', 'fluid', 'dynamic',
]);

const EVASIVE_PATTERNS = [
  { regex: /(?:as I mentioned|as we said|I think we covered that|we already addressed)/gi, pattern: 'Deflection', explanation: 'Redirects to a previous answer instead of addressing directly' },
  { regex: /(?:look|so look|well look|you know what)/gi, pattern: 'Filler/stalling', explanation: 'Uses filler language that buys time — common when crafting a careful response' },
  { regex: /(?:it's important to remember|let me put that in context|the way I think about it)/gi, pattern: 'Reframing', explanation: 'Reframes the question rather than answering it directly' },
  { regex: /(?:we don't comment on|we don't disclose|we're not going to get into|I can't speak to that)/gi, pattern: 'Refusal to answer', explanation: 'Directly refuses to address the topic — worth noting what they avoid' },
  { regex: /(?:going forward|on a go-forward basis|as we move forward)/gi, pattern: 'Future-shifting', explanation: 'Shifts focus to the future to avoid discussing current performance' },
  { regex: /(?:we feel good about|we're comfortable with|we're pleased with where we are)/gi, pattern: 'Vague reassurance', explanation: 'Provides emotional reassurance without specific data — often masks concern' },
  { regex: /(?:I want to be careful|I don't want to get ahead of|let me be thoughtful about)/gi, pattern: 'Deliberate hedging', explanation: 'Explicitly signals caution about the topic — there may be something they cannot disclose yet' },
  { regex: /(?:not something we're focused on|that's not how we think about it|we don't manage to that metric)/gi, pattern: 'Metric dismissal', explanation: "Dismisses an analyst's metric, which sometimes means the metric looks bad" },
];

// ─── Section Splitting ───────────────────────────────────────────────────────

interface TranscriptSections {
  prepared: string;
  qa: string;
  full: string;
}

function splitTranscript(text: string): TranscriptSections {
  const full = text;

  // Common patterns that separate prepared remarks from Q&A
  const qaSplitPatterns = [
    /(?:operator|moderator)[:\s]*(?:we will now|we'll now|let's now|at this time).{0,50}(?:question|Q&A)/i,
    /(?:Q&A|question.and.answer)\s*(?:session|period|portion)/i,
    /(?:operator|moderator)[:\s]*our first question/i,
    /(?:we are now ready for|let's open it up for)\s*questions/i,
    /={3,}\s*(?:Questions and Answers|Q&A)\s*={3,}/i,
  ];

  for (const pattern of qaSplitPatterns) {
    const match = text.search(pattern);
    if (match > text.length * 0.2) { // Q&A should be after at least 20% of transcript
      return {
        prepared: text.slice(0, match),
        qa: text.slice(match),
        full,
      };
    }
  }

  // Fallback: split at roughly 40% (most calls have ~40% prepared, ~60% Q&A)
  const splitPoint = Math.floor(text.length * 0.4);
  return {
    prepared: text.slice(0, splitPoint),
    qa: text.slice(splitPoint),
    full,
  };
}


// ─── Analysis Engines ────────────────────────────────────────────────────────

/**
 * 1. Extract numerical guidance from the transcript.
 */
function extractGuidance(text: string): NumericalGuidance[] {
  const guidance: NumericalGuidance[] = [];

  const patterns: { regex: RegExp; category: NumericalGuidance['category']; metricName: string }[] = [
    { regex: /(?:revenue|sales|turnover)\s*(?:guidance|outlook|expectation|target|forecast)[:\s]*(?:of\s*)?\$?([\d,.]+)\s*(billion|million|%|percent|bps)?/gi, category: 'revenue', metricName: 'Revenue' },
    { regex: /(?:expect|guide|target|forecast)\s*(?:revenue|sales|top.?line)\s*(?:of|to be|at|around|approximately)\s*\$?([\d,.]+)\s*(billion|million|%|percent)?/gi, category: 'revenue', metricName: 'Revenue' },
    { regex: /(?:revenue|organic)\s*growth\s*(?:of|at|around|between)\s*([\d,.]+)\s*(?:to\s*([\d,.]+)\s*)?(%|percent)/gi, category: 'growth', metricName: 'Revenue Growth' },
    { regex: /(?:operating|gross|net|EBITDA)\s*margin\s*(?:of|at|around|between|approximately)\s*([\d,.]+)\s*(?:to\s*([\d,.]+)\s*)?(%|percent|bps|basis points)/gi, category: 'margin', metricName: 'Operating Margin' },
    { regex: /(?:EPS|earnings per share)\s*(?:guidance|outlook|expectation|range)[:\s]*\$?([\d,.]+)\s*(?:to\s*\$?([\d,.]+))?/gi, category: 'other', metricName: 'EPS' },
    { regex: /(?:capex|capital expenditure|capital spending)\s*(?:of|at|around|approximately|between)\s*\$?([\d,.]+)\s*(billion|million)?/gi, category: 'capex', metricName: 'CapEx' },
    { regex: /(?:free cash flow|FCF)\s*(?:of|at|around|approximately|between)\s*\$?([\d,.]+)\s*(billion|million)?/gi, category: 'other', metricName: 'Free Cash Flow' },
    { regex: /(?:full.?year|fy\d{2,4}|annual)\s*(?:revenue|sales)\s*(?:of|at)\s*\$?([\d,.]+)\s*(billion|million)?/gi, category: 'revenue', metricName: 'Full-Year Revenue' },
    { regex: /(?:expect|anticipate|project)\s*(?:to\s*)?(?:grow|increase|improve)\s*(?:by\s*)?([\d,.]+)\s*(%|percent|bps)/gi, category: 'growth', metricName: 'Expected Growth' },
  ];

  for (const { regex, category, metricName } of patterns) {
    const matches = text.matchAll(regex);
    for (const m of matches) {
      const fullMatch = m[0];
      const value = m[2] ? `${m[1]} to ${m[2]}` : m[1];
      const unit = m[3] || m[2] || '';

      // Get surrounding context (±100 chars)
      const idx = text.indexOf(fullMatch);
      const context = text.slice(Math.max(0, idx - 50), Math.min(text.length, idx + fullMatch.length + 80)).trim();

      const confidence: NumericalGuidance['confidence'] = m[2] ? 'range' : (
        /expect|guide|target|forecast/i.test(fullMatch) ? 'explicit' : 'implied'
      );

      guidance.push({
        metric: metricName + (unit ? ` (${unit})` : ''),
        value: value + (unit && !value.includes(unit) ? ` ${unit}` : ''),
        context: context.replace(/\s+/g, ' '),
        confidence,
        category,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return guidance.filter(g => {
    const key = `${g.metric}:${g.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 15);
}


/**
 * 2. Identify the top 3 risks mentioned in the transcript.
 */
function identifyRisks(text: string): IdentifiedRisk[] {
  const risks: IdentifiedRisk[] = [];
  const lowerText = text.toLowerCase();

  const riskPatterns: { regex: RegExp; category: IdentifiedRisk['category']; title: string }[] = [
    // Macro risks
    { regex: /(?:macro(?:economic)?|economic)\s*(?:uncertainty|headwind|pressure|environment|slowdown|downturn|recession)[^.]{0,100}\./gi, category: 'macro', title: 'Macroeconomic Headwinds' },
    { regex: /(?:interest rate|inflation|currency|FX|exchange rate)\s*(?:impact|pressure|headwind|risk|challenge)[^.]{0,100}\./gi, category: 'macro', title: 'Interest Rate / Inflation Risk' },
    { regex: /(?:geopolitical|trade war|tariff|sanction|conflict)[^.]{0,100}\./gi, category: 'macro', title: 'Geopolitical Risk' },

    // Competitive risks
    { regex: /(?:competitive|competition|competitor|market share|pricing pressure)[^.]{0,120}\./gi, category: 'competitive', title: 'Competitive Pressure' },
    { regex: /(?:customer churn|attrition|losing customer|customer loss)[^.]{0,100}\./gi, category: 'competitive', title: 'Customer Retention Risk' },

    // Operational risks
    { regex: /(?:supply chain|supply constraint|shortage|inventory|logistics)[^.]{0,100}\./gi, category: 'operational', title: 'Supply Chain Disruption' },
    { regex: /(?:talent|hiring|retention|employee|headcount|layoff|restructur)[^.]{0,100}\./gi, category: 'operational', title: 'Workforce / Talent Risk' },
    { regex: /(?:execution risk|integration|transition|migration)[^.]{0,100}\./gi, category: 'operational', title: 'Execution Risk' },

    // Regulatory risks
    { regex: /(?:regulat|compliance|litigation|lawsuit|legal|investigation)[^.]{0,100}\./gi, category: 'regulatory', title: 'Regulatory / Legal Risk' },

    // Financial risks
    { regex: /(?:debt|leverage|liquidity|covenant|refinanc|credit)[^.]{0,100}(?:risk|concern|pressure|challenge)[^.]{0,50}\./gi, category: 'financial', title: 'Balance Sheet / Debt Risk' },
    { regex: /(?:cash burn|negative free cash flow|cash position)[^.]{0,100}\./gi, category: 'financial', title: 'Cash Flow Risk' },
  ];

  for (const { regex, category, title } of riskPatterns) {
    const matches = text.matchAll(regex);
    for (const m of matches) {
      const quote = m[0].trim();
      if (quote.length > 30 && quote.length < 250) {
        // Check if this is buried (far from beginning, or in Q&A)
        const position = text.indexOf(quote) / text.length;
        const buried = position > 0.7 || /Q&A|question/i.test(text.slice(Math.max(0, text.indexOf(quote) - 200), text.indexOf(quote)));

        risks.push({
          title,
          quote: quote.slice(0, 200),
          severity: buried ? 'high' : 'medium',
          category,
          buried,
        });
      }
    }
  }

  // Score and rank: buried = higher priority, then by position (later = more buried)
  risks.sort((a, b) => {
    if (a.buried !== b.buried) return a.buried ? -1 : 1;
    return 0;
  });

  // Deduplicate by category, keep top 3
  const seen = new Set<string>();
  return risks.filter(r => {
    if (seen.has(r.category)) return false;
    seen.add(r.category);
    return true;
  }).slice(0, 3);
}


/**
 * 3. Analyze sentiment for a section of text.
 */
function analyzeSentiment(text: string, section: 'prepared' | 'qa'): SectionSentiment {
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  let hedgeCount = 0;
  let confidenceCount = 0;
  let uncertaintyCount = 0;

  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, '');
    if (POSITIVE_WORDS.has(cleaned)) positiveCount++;
    if (NEGATIVE_WORDS.has(cleaned)) negativeCount++;
    if (HEDGE_WORDS.has(cleaned)) hedgeCount++;
    if (CONFIDENCE_WORDS.has(cleaned)) confidenceCount++;
    if (UNCERTAINTY_WORDS.has(cleaned)) uncertaintyCount++;
  }

  // Normalize by text length (per 1000 words)
  const len = Math.max(1, words.length / 1000);
  const score = ((positiveCount - negativeCount) / len) / 10; // -1 to 1 range roughly

  return {
    section,
    overallScore: Math.max(-1, Math.min(1, score)),
    positiveCount,
    negativeCount,
    hedgeCount,
    confidenceWords: confidenceCount,
    uncertaintyWords: uncertaintyCount,
  };
}

/**
 * 3b. Detect sentiment shifts between prepared and Q&A.
 */
function detectSentimentShifts(prepared: string, qa: string): SentimentShift[] {
  const shifts: SentimentShift[] = [];

  // Topic-based sentiment comparison
  const topics = [
    { name: 'Revenue/Growth', keywords: /revenue|growth|sales|top.?line|organic/gi },
    { name: 'Margins/Profitability', keywords: /margin|profit|cost|expense|efficiency/gi },
    { name: 'Competition/Market', keywords: /compet|market share|pricing|customer/gi },
    { name: 'Guidance/Outlook', keywords: /guidance|outlook|expect|forecast|next quarter/gi },
    { name: 'Operations/Execution', keywords: /execution|operation|supply|deliver|ship/gi },
  ];

  for (const topic of topics) {
    // Extract sentences about this topic from each section
    const prepSentences = prepared.split(/[.!?]/).filter(s => topic.keywords.test(s));
    const qaSentences = qa.split(/[.!?]/).filter(s => topic.keywords.test(s));

    if (prepSentences.length > 0 && qaSentences.length > 0) {
      const prepText = prepSentences.join('. ');
      const qaText = qaSentences.join('. ');

      const prepSent = analyzeSentiment(prepText, 'prepared');
      const qaSent = analyzeSentiment(qaText, 'qa');
      const shift = qaSent.overallScore - prepSent.overallScore;

      if (Math.abs(shift) > 0.15) { // Only report meaningful shifts
        let interpretation = '';
        if (shift < -0.3) interpretation = `Management was significantly more cautious about ${topic.name.toLowerCase()} when pressed by analysts. Their prepared remarks painted a rosier picture than what emerged under questioning.`;
        else if (shift < -0.15) interpretation = `Tone on ${topic.name.toLowerCase()} became slightly more guarded in Q&A. Analysts may have probed an area of genuine concern.`;
        else if (shift > 0.3) interpretation = `Management became more enthusiastic about ${topic.name.toLowerCase()} in Q&A — possibly because analyst questions let them elaborate on genuine strengths.`;
        else interpretation = `Slight positive shift on ${topic.name.toLowerCase()} during Q&A, suggesting analysts' questions validated management's thesis.`;

        shifts.push({
          topic: topic.name,
          preparedSentiment: Math.round(prepSent.overallScore * 100) / 100,
          qaSentiment: Math.round(qaSent.overallScore * 100) / 100,
          shift: Math.round(shift * 100) / 100,
          interpretation,
        });
      }
    }
  }

  return shifts.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
}


/**
 * 4. Flag defensive or evasive language.
 */
function flagEvasiveLanguage(text: string): EvasiveFlag[] {
  const flags: EvasiveFlag[] = [];

  for (const { regex, pattern, explanation } of EVASIVE_PATTERNS) {
    const matches = text.matchAll(regex);
    for (const m of matches) {
      const idx = m.index || 0;
      // Get surrounding context
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + m[0].length + 100);
      const context = text.slice(start, end).trim().replace(/\s+/g, ' ');

      // Determine topic from context
      const topicMatch = context.match(/(?:about|regarding|on|around)\s+([\w\s]{3,30}?)(?:\s*[,.]|\s+(?:we|I|the))/i);
      const topic = topicMatch ? topicMatch[1].trim() : 'Unspecified topic';

      flags.push({
        quote: context.slice(0, 180),
        topic,
        pattern,
        severity: /refusal|hedging|dismissal/i.test(pattern) ? 'high' : 'medium',
        explanation,
      });
    }
  }

  // Deduplicate by pattern within same topic
  const seen = new Set<string>();
  return flags.filter(f => {
    const key = `${f.pattern}:${f.topic.slice(0, 20)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/**
 * 5. Compare narrative vs previous quarter.
 */
function compareNarrative(
  currentGuidance: NumericalGuidance[],
  currentText: string,
  previousTranscript: PreviousTranscript | null
): NarrativeChange[] {
  if (!previousTranscript) return [];

  const changes: NarrativeChange[] = [];

  // Compare guidance numbers
  for (const prev of previousTranscript.guidanceGiven) {
    const current = currentGuidance.find(g =>
      g.category === prev.category && g.metric.toLowerCase().includes(prev.metric.toLowerCase().split(' ')[0])
    );

    if (current) {
      // Guidance was updated
      if (current.value !== prev.value) {
        const prevNum = parseFloat(prev.value.replace(/[^0-9.]/g, ''));
        const currNum = parseFloat(current.value.replace(/[^0-9.]/g, ''));
        const changeType: NarrativeChange['changeType'] =
          currNum < prevNum ? 'softened' : currNum > prevNum ? 'strengthened' : 'reversed';

        changes.push({
          topic: current.metric,
          previousStatement: `${prev.metric}: ${prev.value}`,
          currentStatement: `${current.metric}: ${current.value}`,
          changeType,
          significance: Math.abs(currNum - prevNum) / prevNum > 0.1 ? 'major' : 'minor',
        });
      }
    } else {
      // Previous guidance was dropped (not mentioned this quarter)
      changes.push({
        topic: prev.metric,
        previousStatement: `Previously guided: ${prev.value}`,
        currentStatement: 'No guidance provided this quarter',
        changeType: 'dropped',
        significance: 'major',
      });
    }
  }

  // Check for new guidance not present last quarter
  for (const curr of currentGuidance) {
    const existed = previousTranscript.guidanceGiven.some(p =>
      p.category === curr.category && p.metric.toLowerCase().includes(curr.metric.toLowerCase().split(' ')[0])
    );
    if (!existed) {
      changes.push({
        topic: curr.metric,
        previousStatement: 'Not previously guided',
        currentStatement: `New guidance: ${curr.value}`,
        changeType: 'new',
        significance: 'minor',
      });
    }
  }

  return changes;
}


// ─── Executive Summary Generator ─────────────────────────────────────────────

function generateExecutiveSummary(analysis: Omit<EarningsAnalysis, 'executiveSummary'>): string {
  const parts: string[] = [];

  // Guidance overview
  if (analysis.guidance.length > 0) {
    const revenueGuidance = analysis.guidance.find(g => g.category === 'revenue');
    if (revenueGuidance) parts.push(`Management guided ${revenueGuidance.metric.toLowerCase()} of ${revenueGuidance.value}.`);
    else parts.push(`Management provided ${analysis.guidance.length} specific numerical targets.`);
  } else {
    parts.push(`No specific numerical guidance was provided, which itself may be notable.`);
  }

  // Sentiment
  const sentShift = analysis.preparedSentiment.overallScore - analysis.qaSentiment.overallScore;
  if (sentShift > 0.2) parts.push(`Tone noticeably shifted more cautious during analyst Q&A compared to prepared remarks — management may be more worried than they initially let on.`);
  else if (sentShift < -0.2) parts.push(`Interestingly, management sounded more positive during Q&A than in prepared remarks, suggesting genuine confidence when pressed.`);
  else parts.push(`Tone was consistent between prepared remarks and Q&A, suggesting management's messaging was authentic.`);

  // Risks
  if (analysis.risks.length > 0) {
    const topRisk = analysis.risks[0];
    parts.push(`The most significant risk mentioned was ${topRisk.title.toLowerCase()}${topRisk.buried ? ' (buried in the Q&A section rather than addressed upfront)' : ''}.`);
  }

  // Evasion
  if (analysis.evasiveFlags.length > 3) {
    parts.push(`Management showed ${analysis.evasiveFlags.length} instances of defensive or evasive language, which is above average and may indicate discomfort with certain topics.`);
  } else if (analysis.evasiveFlags.length > 0) {
    parts.push(`Some defensive language was detected (${analysis.evasiveFlags.length} instance${analysis.evasiveFlags.length > 1 ? 's' : ''}) but within normal range for an earnings call.`);
  }

  // Narrative changes
  const majorChanges = analysis.narrativeChanges.filter(c => c.significance === 'major');
  if (majorChanges.length > 0) {
    const softened = majorChanges.filter(c => c.changeType === 'softened' || c.changeType === 'dropped');
    if (softened.length > 0) parts.push(`Notably, management softened or dropped ${softened.length} previous commitment${softened.length > 1 ? 's' : ''} from last quarter — this is a bearish signal.`);
  }

  return parts.join(' ');
}

// ─── Main Analyzer ───────────────────────────────────────────────────────────

/**
 * Run the complete earnings call analysis.
 * This is the main entry point.
 */
export function analyzeEarningsCall(
  transcript: string,
  ticker: string,
  company: string,
  quarter: string,
  previousTranscript?: PreviousTranscript | null,
): EarningsAnalysis {
  const sections = splitTranscript(transcript);

  // 1. Extract guidance
  const guidance = extractGuidance(sections.full);

  // 2. Identify risks
  const risks = identifyRisks(sections.full);

  // 3. Sentiment analysis
  const preparedSentiment = analyzeSentiment(sections.prepared, 'prepared');
  const qaSentiment = analyzeSentiment(sections.qa, 'qa');
  const sentimentShifts = detectSentimentShifts(sections.prepared, sections.qa);

  // 4. Evasive language
  const evasiveFlags = flagEvasiveLanguage(sections.qa); // Focus on Q&A where evasion is most revealing

  // 5. Narrative comparison
  const narrativeChanges = compareNarrative(guidance, sections.full, previousTranscript || null);

  // Overall tone
  const avgSentiment = (preparedSentiment.overallScore + qaSentiment.overallScore) / 2;
  const overallTone: EarningsAnalysis['overallTone'] =
    avgSentiment > 0.5 ? 'very_positive' :
    avgSentiment > 0.2 ? 'positive' :
    avgSentiment > -0.1 ? 'neutral' :
    avgSentiment > -0.3 ? 'cautious' : 'negative';

  const partial = {
    id: crypto.randomUUID(),
    ticker: ticker.toUpperCase(),
    company,
    quarter,
    analyzedAt: new Date().toISOString(),
    transcriptLength: transcript.length,
    guidance,
    risks,
    sentimentShifts,
    evasiveFlags,
    narrativeChanges,
    preparedSentiment,
    qaSentiment,
    overallTone,
    executiveSummary: '',
  };

  // Generate executive summary last (uses all other analyses)
  partial.executiveSummary = generateExecutiveSummary(partial);

  return partial as EarningsAnalysis;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

import { getUserData, setUserData } from './user-data';

const ANALYSES_KEY = 'earnings_analyses' as any;
const PREV_TRANSCRIPTS_KEY = 'earnings_previous' as any;

export function getSavedAnalyses(): EarningsAnalysis[] {
  return getUserData<EarningsAnalysis[]>(ANALYSES_KEY) || [];
}

export function saveAnalysis(analysis: EarningsAnalysis): void {
  const existing = getSavedAnalyses();
  existing.unshift(analysis);
  setUserData(ANALYSES_KEY, existing.slice(0, 30));

  // Also save as "previous" for this ticker for future comparisons
  const prev: PreviousTranscript = {
    ticker: analysis.ticker,
    quarter: analysis.quarter,
    keyStatements: analysis.guidance.map(g => `${g.metric}: ${g.value}`),
    guidanceGiven: analysis.guidance,
    savedAt: new Date().toISOString(),
  };
  const prevList = getUserData<PreviousTranscript[]>(PREV_TRANSCRIPTS_KEY) || [];
  prevList.unshift(prev);
  setUserData(PREV_TRANSCRIPTS_KEY, prevList.slice(0, 20));
}

export function getPreviousTranscript(ticker: string): PreviousTranscript | null {
  const list = getUserData<PreviousTranscript[]>(PREV_TRANSCRIPTS_KEY) || [];
  return list.find(p => p.ticker.toUpperCase() === ticker.toUpperCase()) || null;
}

export function deleteAnalysis(id: string): void {
  const existing = getSavedAnalyses().filter(a => a.id !== id);
  setUserData(ANALYSES_KEY, existing);
}
