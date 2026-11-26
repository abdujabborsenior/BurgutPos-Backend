import { Module } from '@nestjs/common';
import { HallsModule } from '../halls/halls.module';
import { MenuModule } from '../menu/menu.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PrintersModule } from '../printers/printers.module';
import { SettingsModule } from '../settings/settings.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { StockModule } from '../stock/stock.module';
import { UsersModule } from '../users/users.module';
import { OrdersController, PosController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderCountersRepository } from './repo/order-counters.repository';
import { OrderItemsRepository } from './repo/order-items.repository';
import { OrderPrintsRepository } from './repo/order-prints.repository';
import { OrdersRepository } from './repo/orders.repository';
import { PaymentsRepository } from './repo/payments.repository';

@Module({
  imports: [
    HallsModule,
    MenuModule,
    StockModule,
    ShiftsModule,
    SettingsModule,
    UsersModule,
    PaymentMethodsModule,
    PrintersModule,
  ],
  controllers: [PosController, OrdersController],
  providers: [
    OrdersService,
    OrdersRepository,
    OrderItemsRepository,
    PaymentsRepository,
    OrderCountersRepository,
    OrderPrintsRepository,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
