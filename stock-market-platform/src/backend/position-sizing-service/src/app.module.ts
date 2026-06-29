import { Module } from '@nestjs/common';
import { CalculatorModule } from './modules/calculator/calculator.module';
import { DCAModule } from './modules/dca/dca.module';

@Module({
  imports: [CalculatorModule, DCAModule],
})
export class AppModule {}
