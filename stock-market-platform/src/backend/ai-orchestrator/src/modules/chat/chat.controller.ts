import { Controller, Post, Body, Req, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { OrchestratorService, OrchestratorInput } from '../../orchestration/orchestrator.service';
import { ComplianceFilter } from '../../evaluation/compliance-filter';

interface ChatRequestDto {
  message: string;
  conversationId?: string;
  context?: {
    symbols?: string[];
    portfolioId?: string;
  };
}

@Controller('ai')
export class ChatController {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly complianceFilter: ComplianceFilter,
  ) {}

  /**
   * POST /ai/chat — Streams an AI response via Server-Sent Events (SSE).
   * The orchestrator routes to specialist agents, merges their outputs,
   * and streams tokens to the client. A compliance disclaimer is always
   * appended.
   */
  @Post('chat')
  async chat(
    @Body() body: ChatRequestDto,
    @Req() req: any,
    @Res() reply: FastifyReply,
  ) {
    const input: OrchestratorInput = {
      message: body.message,
      userId: req.headers['x-user-id'] ?? 'anonymous',
      userTier: req.headers['x-user-tier'] ?? 'free',
      conversationId: body.conversationId,
      context: body.context,
    };

    // Set up SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      let fullContent = '';
      for await (const chunk of this.orchestrator.processQuery(input)) {
        fullContent += chunk;
        reply.raw.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      // Final compliance check on assembled content
      const compliance = this.complianceFilter.validate(fullContent);
      if (!compliance.isCompliant) {
        reply.raw.write(
          `event: metadata\ndata: ${JSON.stringify({ complianceFlags: compliance.violations })}\n\n`,
        );
      }

      reply.raw.write(`event: done\ndata: ${JSON.stringify({ complete: true })}\n\n`);
    } catch (error: any) {
      reply.raw.write(
        `event: error\ndata: ${JSON.stringify({ message: 'An error occurred processing your request' })}\n\n`,
      );
    } finally {
      reply.raw.end();
    }
  }
}
