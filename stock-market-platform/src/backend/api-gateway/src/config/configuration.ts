export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  environment: process.env.NODE_ENV ?? 'development',

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    publicKey: process.env.JWT_PUBLIC_KEY,
    issuer: process.env.JWT_ISSUER ?? 'investoriq',
    audience: process.env.JWT_AUDIENCE ?? 'investoriq-api',
  },

  services: {
    userService: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
    marketDataService: process.env.MARKET_DATA_SERVICE_URL ?? 'http://localhost:3002',
    portfolioService: process.env.PORTFOLIO_SERVICE_URL ?? 'http://localhost:3003',
    aiOrchestrator: process.env.AI_ORCHESTRATOR_URL ?? 'http://localhost:3004',
    alertService: process.env.ALERT_SERVICE_URL ?? 'http://localhost:3005',
    backtestService: process.env.BACKTEST_SERVICE_URL ?? 'http://localhost:3006',
    notificationService: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3007',
  },

  rateLimits: {
    free: { requestsPerMinute: 60, aiQueriesPerDay: 10 },
    pro: { requestsPerMinute: 600, aiQueriesPerDay: 100 },
    premium: { requestsPerMinute: 6000, aiQueriesPerDay: Infinity },
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3100'],
  },
});
