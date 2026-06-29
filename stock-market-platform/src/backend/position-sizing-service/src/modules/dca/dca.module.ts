import { Module } from '@nestjs/common';
import { DCAController } from './dca.controller';
import { DCAService } from './dca.service';

@Module({
  controllers: [DCAController],
  providers: [DCAService],
  exports: [DCAService],
})
export class DCAModule {}
