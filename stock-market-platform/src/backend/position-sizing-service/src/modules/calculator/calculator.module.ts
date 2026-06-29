import { Module } from '@nestjs/common';
import { CalculatorController } from './calculator.controller';
import { PositionSizingService } from './position-sizing.service';

@Module({
  controllers: [CalculatorController],
  providers: [PositionSizingService],
  exports: [PositionSizingService],
})
export class CalculatorModule {}
