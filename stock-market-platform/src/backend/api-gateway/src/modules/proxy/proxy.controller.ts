import { Controller, All, Req, Res, Param, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ProxyService } from './proxy.service';

// Route mapping: API path prefix → service name
const ROUTE_MAP: Record<string, string> = {
  auth: 'userService',
  users: 'userService',
  market: 'marketDataService',
  portfolios: 'portfolioService',
  ai: 'aiOrchestrator',
  alerts: 'alertService',
  backtest: 'backtestService',
  notifications: 'notificationService',
  screener: 'marketDataService', // Screener lives in market data service
};

@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  @All(':service/*')
  async proxy(
    @Param('service') servicePrefix: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const targetService = ROUTE_MAP[servicePrefix];
    if (!targetService) {
      return reply.status(404).send({
        errors: [{ code: 'NOT_FOUND', message: `Unknown route: /${servicePrefix}` }],
      });
    }

    // Build downstream path (strip the v1 prefix, keep service path)
    const fullPath = (request.url as string).replace(/^\/v1/, '');

    const result = await this.proxyService.forward(targetService, fullPath, {
      method: request.method,
      body: request.body,
      headers: {
        'x-request-id': request.headers['x-request-id'] as string,
        'x-user-id': (request as any).user?.sub ?? '',
        'x-user-tier': (request as any).user?.tier ?? 'free',
      },
    });

    return reply.status(result.statusCode).send(result.body);
  }
}
