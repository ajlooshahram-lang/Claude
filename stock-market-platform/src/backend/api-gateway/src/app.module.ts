import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProxyModule } from './modules/proxy/proxy.module';
import { WebSocketModule } from './modules/websocket/ws.module';
import { HealthModule } from './modules/health/health.module';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { LoggerMiddleware } from './middleware/logger.middleware';
import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 second
        limit: 20,   // 20 requests per second burst
      },
      {
        name: 'medium',
        ttl: 60000,  // 1 minute
        limit: 60,   // 60 requests per minute (free tier default)
      },
    ]),

    // Feature modules
    ProxyModule,
    WebSocketModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}
