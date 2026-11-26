import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { AuthConfig } from '../../config/configuration';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginEventsController } from './login-events.controller';
import { LoginEventsService } from './login-events.service';
import { LoginEventsRepository } from './repo/login-events.repository';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { SessionsRepository } from './repo/sessions.repository';

@Module({
  imports: [
    UsersModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        return {
          secret: auth.accessSecret,
          signOptions: {
            expiresIn: auth.accessTtl as unknown as number,
            algorithm: 'HS256',
          },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController, LoginEventsController],
  providers: [
    AuthService,
    SessionsRepository,
    LoginEventsService,
    LoginEventsRepository,
    LoginThrottlerGuard,
    // Order matters: authenticate first, then authorise.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
