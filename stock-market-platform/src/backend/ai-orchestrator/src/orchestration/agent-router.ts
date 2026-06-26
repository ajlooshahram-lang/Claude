import { Injectable } from '@nestjs/common';
import { QueryIntent } from './intent-classifier';
import { BaseAgent } from '../agents/base-agent';
import { InvestmentAnalystAgent } from '../agents/investment-analyst.agent';
import { TechnicalAnalystAgent } from '../agents/technical-analyst.agent';
import { QuantitativeAgent } from '../agents/quantitative.agent';
import { NewsIntelligenceAgent } from '../agents/news-intelligence.agent';
import { MacroEconomicsAgent } from '../agents/macro-economics.agent';
import { PortfolioAdvisorAgent } from '../agents/portfolio-advisor.agent';
import { EducationAgent } from '../agents/education.agent';

// Maps intents to the agent IDs that should handle them
const INTENT_AGENT_MAP: Record<string, string[]> = {
  [QueryIntent.VALUATION]: ['agent.investment_analyst', 'agent.quantitative'],
  [QueryIntent.FUNDAMENTAL]: ['agent.investment_analyst'],
  [QueryIntent.EARNINGS]: ['agent.investment_analyst', 'agent.news_intelligence'],
  [QueryIntent.COMPARISON]: ['agent.investment_analyst', 'agent.quantitative', 'agent.technical_analyst'],
  [QueryIntent.THESIS]: ['agent.investment_analyst', 'agent.technical_analyst', 'agent.quantitative', 'agent.news_intelligence'],
  [QueryIntent.TECHNICAL]: ['agent.technical_analyst'],
  [QueryIntent.ENTRY_EXIT]: ['agent.technical_analyst'],
  [QueryIntent.CHART_PATTERN]: ['agent.technical_analyst'],
  [QueryIntent.MOMENTUM]: ['agent.technical_analyst', 'agent.quantitative'],
  [QueryIntent.RISK]: ['agent.quantitative', 'agent.portfolio_advisor'],
  [QueryIntent.PORTFOLIO_ANALYSIS]: ['agent.portfolio_advisor', 'agent.quantitative'],
  [QueryIntent.FACTOR]: ['agent.quantitative'],
  [QueryIntent.CORRELATION]: ['agent.quantitative'],
  [QueryIntent.NEWS]: ['agent.news_intelligence'],
  [QueryIntent.SENTIMENT]: ['agent.news_intelligence'],
  [QueryIntent.EVENT]: ['agent.news_intelligence', 'agent.investment_analyst'],
  [QueryIntent.MACRO]: ['agent.macro_economics', 'agent.news_intelligence'],
  [QueryIntent.INTEREST_RATE]: ['agent.macro_economics'],
  [QueryIntent.SECTOR_ROTATION]: ['agent.macro_economics', 'agent.quantitative'],
  [QueryIntent.PORTFOLIO_REVIEW]: ['agent.portfolio_advisor', 'agent.quantitative'],
  [QueryIntent.REBALANCE]: ['agent.portfolio_advisor'],
  [QueryIntent.DIVERSIFICATION]: ['agent.portfolio_advisor', 'agent.quantitative'],
  [QueryIntent.EXPLAIN]: ['agent.education'],
  [QueryIntent.LEARN]: ['agent.education'],
  [QueryIntent.WHAT_IS]: ['agent.education'],
};

@Injectable()
export class AgentRouter {
  private readonly agentRegistry: Map<string, BaseAgent> = new Map();

  constructor(
    investmentAnalyst: InvestmentAnalystAgent,
    technicalAnalyst: TechnicalAnalystAgent,
    quantitative: QuantitativeAgent,
    newsIntelligence: NewsIntelligenceAgent,
    macroEconomics: MacroEconomicsAgent,
    portfolioAdvisor: PortfolioAdvisorAgent,
    education: EducationAgent,
  ) {
    this.register(investmentAnalyst);
    this.register(technicalAnalyst);
    this.register(quantitative);
    this.register(newsIntelligence);
    this.register(macroEconomics);
    this.register(portfolioAdvisor);
    this.register(education);
  }

  private register(agent: BaseAgent): void {
    this.agentRegistry.set(agent.id, agent);
  }

  /**
   * Select agents to handle the given intents.
   * Deduplicates agents that appear for multiple intents.
   * Limits to max 4 agents per query (for latency/cost management).
   */
  selectAgents(intents: QueryIntent[]): BaseAgent[] {
    const agentIds = new Set<string>();

    for (const intent of intents) {
      const mappedAgents = INTENT_AGENT_MAP[intent] ?? [];
      mappedAgents.forEach((id) => agentIds.add(id));
    }

    const selected: BaseAgent[] = [];
    for (const id of agentIds) {
      const agent = this.agentRegistry.get(id);
      if (agent) selected.push(agent);
    }

    // Cap at 4 agents max to control latency and cost
    if (selected.length > 4) {
      return selected.slice(0, 4);
    }

    // Fallback: if no agents matched, use education agent
    if (selected.length === 0) {
      const fallback = this.agentRegistry.get('agent.education');
      if (fallback) selected.push(fallback);
    }

    return selected;
  }

  getRegisteredAgents(): string[] {
    return Array.from(this.agentRegistry.keys());
  }
}
