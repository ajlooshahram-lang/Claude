import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/quotes',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3100'],
    credentials: true,
  },
})
export class QuotesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(QuotesGateway.name);
  private readonly clientSubscriptions: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (!subscriptions) return;

    // TODO: Check tier limits (free: 10, pro: 50, premium: 500)
    const maxSymbols = 50; // Default to pro limit for now
    const symbols = data.symbols.slice(0, maxSymbols);

    for (const symbol of symbols) {
      subscriptions.add(symbol.toUpperCase());
      client.join(`quote:${symbol.toUpperCase()}`);
    }

    this.logger.debug(`Client ${client.id} subscribed to: ${symbols.join(', ')}`);
    return { event: 'subscribed', data: { symbols } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (!subscriptions) return;

    for (const symbol of data.symbols) {
      subscriptions.delete(symbol.toUpperCase());
      client.leave(`quote:${symbol.toUpperCase()}`);
    }

    return { event: 'unsubscribed', data: { symbols: data.symbols } };
  }

  /**
   * Called by market data service (via Redis pub/sub or internal event)
   * to broadcast quote updates to subscribed clients.
   */
  broadcastQuoteUpdate(symbol: string, quoteData: any) {
    this.server.to(`quote:${symbol}`).emit('quote:update', {
      symbol,
      ...quoteData,
      timestamp: Date.now(),
    });
  }
}
