import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VnpayProvider } from './providers/vnpay.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, VnpayProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
