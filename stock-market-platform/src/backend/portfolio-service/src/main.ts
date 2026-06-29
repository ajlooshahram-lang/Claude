import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Portfolio-Service');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3003;
  await app.listen(port, '0.0.0.0');
  logger.log(`Portfolio Service running on port ${port}`);
}

bootstrap();
