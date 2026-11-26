import { Module } from '@nestjs/common';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsRepository } from './repo/payment-methods.repository';

@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService, PaymentMethodsRepository],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
