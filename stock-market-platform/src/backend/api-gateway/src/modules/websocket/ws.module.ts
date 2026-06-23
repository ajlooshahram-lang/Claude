import { Module } from '@nestjs/common';
import { QuotesGateway } from './quotes.gateway';

@Module({
  providers: [QuotesGateway],
})
export class WebSocketModule {}
