import { Injectable } from '@nestjs/common';

export interface ComplianceResult {
  isCompliant: boolean;
  violations: string[];
  filteredContent: string;
}

const DISCLAIMER =
  'This analysis is for educational and informational purposes only. It does not constitute financial advice. Past performance does not guarantee future results.';

// Patterns that indicate explicit buy/sell directives (not allowed)
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\byou should (definitely |certainly )?(buy|sell|purchase)\b/i, label: 'explicit_buy_sell_directive' },
  { pattern: /\bI (strongly )?recommend (buying|selling)\b/i, label: 'explicit_recommendation' },
  { pattern: /\b(guaranteed|risk-free) (returns?|profit)\b/i, label: 'guaranteed_returns' },
  { pattern: /\bthis (stock )?will (definitely|certainly|surely) (go up|rise|increase|double)\b/i, label: 'certainty_claim' },
  { pattern: /\byou (must|need to) (buy|sell) (now|immediately)\b/i, label: 'urgency_directive' },
];

@Injectable()
export class ComplianceFilter {
  /**
   * Validate AI response content for compliance with the platform's
   * "no financial advice" policy. Detects explicit buy/sell directives,
   * guaranteed-return claims, and certainty language. Ensures the
   * disclaimer is present.
   */
  validate(content: string): ComplianceResult {
    const violations: string[] = [];

    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(label);
      }
    }

    let filteredContent = content;

    // Ensure disclaimer present
    if (!content.includes('does not constitute financial advice')) {
      filteredContent = `${filteredContent}\n\n*${DISCLAIMER}*`;
    }

    return {
      isCompliant: violations.length === 0,
      violations,
      filteredContent,
    };
  }
}
