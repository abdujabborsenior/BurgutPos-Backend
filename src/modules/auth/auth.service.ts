import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import type { AuthConfig } from '../../config/configuration';
import { AppEvent, type UserAccessRevokedEvent } from '../../common/events';
import type { AuthUser } from '../../common/types/auth-user';
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../../common/utils/password';
import type { User } from '../users/entities/user.entity';
import { LoginEventType } from '../../common/constants/enums';
import { UsersService } from '../users/users.service';
import { LoginEventsService } from './login-events.service';
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import {
  composeRefreshToken,
  generateSecret,
  hashesEqual,
  hashSecret,
  parseRefreshToken,
} from './refresh-token';
import { SessionsRepository } from './repo/sessions.repository';

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface ProfileView {
  id: number;
  fullName: string;
  login: string;
  isSuperadmin: boolean;
  role: { id: number; name: string } | null;
  permissions: string[];
}

export interface AuthResult {
  accessToken: string;
  user: ProfileView;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface AccessPayload {
  sub: number;
  sid: string;
}

const UNAUTHORIZED = 'Сессия истекла. Войдите снова';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authConfig: AuthConfig;

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsRepository,
    private readonly loginEvents: LoginEventsService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.authConfig = config.getOrThrow<AuthConfig>('auth');
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<AuthResult> {
    const user = await this.users.findForLogin(dto.login);
    const valid = user
      ? await verifyPassword(dto.password, user.passwordHash)
      : await verifyAgainstDummy(dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    this.assertCanSignIn(user);

    const secret = generateSecret();
    const expiresAt = this.refreshExpiry();
    const session = await this.sessions.create({
      userId: user.id,
      tokenHash: hashSecret(secret),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });
    await this.users.markLoggedIn(user.id);
    await this.loginEvents.record({
      userId: user.id,
      type: LoginEventType.In,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.result(
      user,
      session.id,
      composeRefreshToken(session.id, secret),
      expiresAt,
    );
  }

  /**
   * Issues a new access token for a valid refresh cookie. The refresh token is
   * not rotated (no cross-tab races); expiry slides forward on every use and
   * the session can be revoked server-side at any moment.
   */
  async refresh(rawToken: unknown, meta: ClientMeta): Promise<AuthResult> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) throw new UnauthorizedException(UNAUTHORIZED);

    const session = await this.sessions.findActive(parsed.sessionId);
    if (
      !session ||
      !hashesEqual(hashSecret(parsed.secret), session.tokenHash)
    ) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const user = await this.users.findIdentity(session.userId);
    try {
      if (!user) throw new UnauthorizedException(UNAUTHORIZED);
      this.assertCanSignIn(user);
    } catch (error) {
      await this.sessions.revoke(session.id);
      throw error;
    }

    const expiresAt = this.refreshExpiry();
    await this.sessions.touch(session.id, {
      expiresAt,
      lastUsedAt: new Date(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.result(
      user,
      session.id,
      composeRefreshToken(session.id, parsed.secret),
      expiresAt,
    );
  }

  async logout(rawToken: unknown, meta: ClientMeta): Promise<void> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) return;
    const session = await this.sessions.findActive(parsed.sessionId);
    if (session && hashesEqual(hashSecret(parsed.secret), session.tokenHash)) {
      await this.sessions.revoke(session.id);
      await this.loginEvents.record({
        userId: session.userId,
        type: LoginEventType.Out,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
  }

  /** Validates an access token and resolves the live identity behind it. */
  async authenticate(accessToken: string): Promise<AuthUser> {
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(accessToken);
    } catch {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    if (typeof payload.sub !== 'number' || typeof payload.sid !== 'string') {
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const [user, session] = await Promise.all([
      this.users.findIdentity(payload.sub),
      this.sessions.findActive(payload.sid),
    ]);
    if (!user || !session || session.userId !== user.id || !user.isActive) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    if (!user.isSuperadmin && !user.roleId) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    return UsersService.toAuthUser(user, session.id);
  }

  async profile(authUser: AuthUser): Promise<ProfileView> {
    const user = await this.users.findIdentity(authUser.id);
    if (!user) throw new UnauthorizedException(UNAUTHORIZED);
    return this.toProfile(user);
  }

  async changePassword(
    authUser: AuthUser,
    dto: ChangePasswordDto,
  ): Promise<void> {
    if (authUser.isSuperadmin) {
      throw new BadRequestException(
        'Пароль суперадмина задаётся в файле окружения (.env)',
      );
    }
    const user = await this.users.findForLogin(authUser.login);
    if (
      !user ||
      !(await verifyPassword(dto.currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'Новый пароль должен отличаться от текущего',
      );
    }
    await this.users.setPasswordHash(
      user.id,
      await hashPassword(dto.newPassword),
    );
    await this.sessions.revokeAllForUser(user.id, authUser.sessionId);
  }

  @OnEvent(AppEvent.UserAccessRevoked, { async: true, promisify: true })
  async onAccessRevoked(event: UserAccessRevokedEvent): Promise<void> {
    try {
      await this.sessions.revokeAllForUser(event.userId, event.exceptSessionId);
    } catch (error) {
      this.logger.error('Failed to revoke sessions', error as Error);
    }
  }

  @Cron('0 30 4 * * *', { name: 'sessions-cleanup' })
  async cleanupSessions(): Promise<void> {
    const before = new Date(Date.now() - 7 * 86_400_000);
    const removed = await this.sessions.deleteStale(before);
    if (removed) this.logger.log(`Removed ${removed} stale sessions`);
  }

  private assertCanSignIn(user: User): void {
    if (!user.isActive) {
      throw new ForbiddenException(
        'Учётная запись отключена. Обратитесь к администратору',
      );
    }
    if (!user.isSuperadmin && !user.roleId) {
      throw new ForbiddenException(
        'Сотруднику не назначена роль. Обратитесь к администратору',
      );
    }
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.authConfig.refreshTtlDays * 86_400_000);
  }

  private async result(
    user: User,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthResult> {
    const payload: AccessPayload = { sub: user.id, sid: sessionId };
    const accessToken = await this.jwt.signAsync(payload);
    const identity = (await this.users.findIdentity(user.id)) ?? user;
    return {
      accessToken,
      user: this.toProfile(identity),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private toProfile(user: User): ProfileView {
    const auth = UsersService.toAuthUser(user, '');
    return {
      id: user.id,
      fullName: user.fullName,
      login: user.login,
      isSuperadmin: user.isSuperadmin,
      role: user.isSuperadmin
        ? null
        : user.role
          ? { id: user.role.id, name: user.role.name }
          : null,
      permissions: auth.permissions,
    };
  }
}
