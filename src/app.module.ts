import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HallsModule } from './modules/halls/halls.module';
import { HealthModule } from './modules/health/health.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { MediaModule } from './modules/media/media.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { PrintersModule } from './modules/printers/printers.module';
import { RealtimeCoreModule } from './modules/realtime/realtime-core.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SeedModule } from './modules/seed/seed.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { StockModule } from './modules/stock/stock.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
      load: [() => loadConfig()],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RealtimeCoreModule,
    MediaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    SettingsModule,
    PaymentMethodsModule,
    PrintersModule,
    HallsModule,
    StockModule,
    IngredientsModule,
    MenuModule,
    ShiftsModule,
    OrdersModule,
    DashboardModule,
    ReportsModule,
    RealtimeModule,
    HealthModule,
    SeedModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
