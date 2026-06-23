import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { OrchestratorService } from '../../orchestration/orchestrator.service';
import { IntentClassifier } from '../../orchestration/intent-classifier';
import { AgentRouter } from '../../orchestration/agent-router';
import { ContextAssembler } from '../../orchestration/context-assembler';
import { ResponseMerger } from '../../orchestration/response-merger';
import { ComplianceFilter } from '../../evaluation/compliance-filter';
import { InvestmentAnalystAgent } from '../../agents/investment-analyst.agent';

@Module({
  controllers: [ChatController],
  providers: [
    OrchestratorService,
    IntentClassifier,
    AgentRouter,
    ContextAssembler,
    ResponseMerger,
    ComplianceFilter,
    InvestmentAnalystAgent,
  ],
})
export class ChatModule {}
