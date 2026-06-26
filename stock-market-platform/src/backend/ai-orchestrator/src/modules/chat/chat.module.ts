import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { OrchestratorService } from '../../orchestration/orchestrator.service';
import { IntentClassifier } from '../../orchestration/intent-classifier';
import { AgentRouter } from '../../orchestration/agent-router';
import { ContextAssembler } from '../../orchestration/context-assembler';
import { ResponseMerger } from '../../orchestration/response-merger';
import { ComplianceFilter } from '../../evaluation/compliance-filter';
// Providers
import { OpenAIProvider } from '../../providers/openai.provider';
import { AnthropicProvider } from '../../providers/anthropic.provider';
import { LLMRegistry } from '../../providers/llm-registry';
// Agents
import { InvestmentAnalystAgent } from '../../agents/investment-analyst.agent';
import { TechnicalAnalystAgent } from '../../agents/technical-analyst.agent';
import { QuantitativeAgent } from '../../agents/quantitative.agent';
import { NewsIntelligenceAgent } from '../../agents/news-intelligence.agent';
import { MacroEconomicsAgent } from '../../agents/macro-economics.agent';
import { PortfolioAdvisorAgent } from '../../agents/portfolio-advisor.agent';
import { EducationAgent } from '../../agents/education.agent';

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
  providers: [
    // LLM layer
    OpenAIProvider,
    AnthropicProvider,
    LLMRegistry,
    // Orchestration
    OrchestratorService,
    IntentClassifier,
    AgentRouter,
    ContextAssembler,
    ResponseMerger,
    ComplianceFilter,
    // Specialist agents (all 7)
    InvestmentAnalystAgent,
    TechnicalAnalystAgent,
    QuantitativeAgent,
    NewsIntelligenceAgent,
    MacroEconomicsAgent,
    PortfolioAdvisorAgent,
    EducationAgent,
  ],
})
export class ChatModule {}
