import { Module } from '@nestjs/common';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { RolesModule } from '../roles/roles.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { SeedService } from './seed.service';

@Module({
  imports: [UsersModule, RolesModule, SettingsModule, PaymentMethodsModule],
  providers: [SeedService],
})
export class SeedModule {}
