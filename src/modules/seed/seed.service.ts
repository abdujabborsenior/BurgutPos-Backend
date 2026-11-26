import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthConfig } from '../../config/configuration';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { RolesService } from '../roles/roles.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';

/**
 * Idempotent bootstrap data: settings row, default roles and payment methods
 * on a fresh database, and the superadmin account synchronised with .env.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly settings: SettingsService,
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.settings.ensureRow();
    await this.roles.ensureDefaults();
    await this.paymentMethods.ensureDefaults();
    await this.users.syncSuperadmin(
      this.config.getOrThrow<AuthConfig>('auth').superadmin,
    );
    this.logger.log('Bootstrap data verified');
  }
}
