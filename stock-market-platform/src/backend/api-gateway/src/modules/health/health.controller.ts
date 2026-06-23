import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    // TODO: Check Redis, downstream services
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        redis: 'ok',
        services: 'ok',
      },
    };
  }
}
