import { Module } from '@nestjs/common';
import { TradeInController } from './trade-in.controller';
import { TradeInManageController } from './trade-in-manage.controller';
import { TradeInService } from './trade-in.service';

@Module({
  controllers: [TradeInController, TradeInManageController],
  providers: [TradeInService],
  exports: [TradeInService],
})
export class TradeInModule {}
