import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RiskModule } from './modules/risk/risk.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PortfoliosModule,
    PerformanceModule,
    RiskModule,
  ],
})
export class AppModule {}
