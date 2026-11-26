import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ALL_PERMISSIONS,
  normalizePermissions,
} from '../../common/constants/permissions';
import { AppEvent, type UserAccessRevokedEvent } from '../../common/events';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { hashPassword, verifyPassword } from '../../common/utils/password';
import { isForeignKeyViolation } from '../../common/utils/pg-errors';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RolesService } from '../roles/roles.service';
import type {
  CreateUserDto,
  UpdateUserDto,
  UserListQueryDto,
  UserOptionsQueryDto,
} from './dto/user.dto';
import type { User } from './entities/user.entity';
import { UsersRepository } from './repo/users.repository';

export interface UserView {
  id: number;
  fullName: string;
  login: string;
  phone: string | null;
  role: { id: number; name: string; permissionsCount: number } | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserOption {
  id: number;
  fullName: string;
  roleName: string | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly roles: RolesService,
    private readonly tx: TransactionService,
    private readonly events: EventEmitter2,
  ) {}

  static toView(user: User): UserView {
    return {
      id: user.id,
      fullName: user.fullName,
      login: user.login,
      phone: user.phone,
      role: user.role
        ? {
            id: user.role.id,
            name: user.role.name,
            // What the role actually grants, implied permissions included.
            permissionsCount: normalizePermissions(user.role.permissions)
              .length,
          }
        : null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async list(query: UserListQueryDto) {
    const [items, total] = await this.users.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      roleId: query.roleId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'ASC',
    });
    const counts = await this.users.countByStatus();
    return {
      ...paginated(
        items.map((user) => ({
          ...UsersService.toView(user),
          createdBy: user.createdBy,
        })),
        total,
        query.page,
        query.limit,
      ),
      counts,
      /** Denominator of the "7/27" badge. */
      permissionsTotal: ALL_PERMISSIONS.length,
    };
  }

  async getById(id: number): Promise<UserView> {
    const user = await this.users.findByIdWithRole(id);
    if (!user || user.isSuperadmin) {
      throw new NotFoundException('Сотрудник не найден');
    }
    return UsersService.toView(user);
  }

  async options(query: UserOptionsQueryDto): Promise<UserOption[]> {
    const users = await this.users.findOptionsWithPermission(query.permission);
    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      roleName: user.role?.name ?? null,
    }));
  }

  async create(dto: CreateUserDto, actor: AuthUser): Promise<UserView> {
    const id = await this.tx.run(async () => {
      await this.roles.getById(dto.roleId);
      if (await this.users.loginExists(dto.login)) {
        throw new ConflictException('Этот логин уже занят');
      }
      const user = await this.users.create({
        fullName: dto.fullName,
        login: dto.login,
        passwordHash: await hashPassword(dto.password),
        phone: dto.phone ?? null,
        roleId: dto.roleId,
        isActive: dto.isActive ?? true,
        isSuperadmin: false,
        createdById: actor.id,
      });
      return user.id;
    });
    return this.getById(id);
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    actor: AuthUser,
  ): Promise<UserView> {
    await this.tx.run(async () => {
      const user = await this.users.findByIdWithRole(id);
      if (!user || user.isSuperadmin) {
        throw new NotFoundException('Сотрудник не найден');
      }
      if (dto.isActive === false && id === actor.id) {
        throw new BadRequestException(
          'Нельзя деактивировать собственную учётную запись',
        );
      }
      if (dto.roleId !== undefined) await this.roles.getById(dto.roleId);
      if (
        dto.login !== undefined &&
        (await this.users.loginExists(dto.login, id))
      ) {
        throw new ConflictException('Этот логин уже занят');
      }

      const patch: Partial<User> = {};
      if (dto.fullName !== undefined) patch.fullName = dto.fullName;
      if (dto.login !== undefined) patch.login = dto.login;
      if (dto.phone !== undefined) patch.phone = dto.phone || null;
      if (dto.roleId !== undefined) patch.roleId = dto.roleId;
      if (dto.isActive !== undefined) patch.isActive = dto.isActive;
      if (dto.password !== undefined) {
        patch.passwordHash = await hashPassword(dto.password);
      }
      if (Object.keys(patch).length) await this.users.update(id, patch);

      const credentialsChanged =
        dto.password !== undefined ||
        (dto.login !== undefined && dto.login !== user.login);
      if (credentialsChanged || dto.isActive === false) {
        this.revokeAccessAfterCommit({
          userId: id,
          exceptSessionId: id === actor.id ? actor.sessionId : undefined,
        });
      }
    });
    return this.getById(id);
  }

  async delete(id: number, actor: AuthUser): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException(
        'Нельзя удалить собственную учётную запись',
      );
    }
    const user = await this.users.findByIdWithRole(id);
    if (!user || user.isSuperadmin) {
      throw new NotFoundException('Сотрудник не найден');
    }
    try {
      await this.users.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Сотрудник связан с заказами или операциями. Деактивируйте его вместо удаления',
        );
      }
      throw error;
    }
    this.revokeAccessAfterCommit({ userId: id });
  }

  // ───────────────────────── Authentication helpers ─────────────────────────

  findForLogin(login: string): Promise<User | null> {
    return this.users.findWithSecretByLogin(login);
  }

  findIdentity(id: number): Promise<User | null> {
    return this.users.findByIdWithRole(id);
  }

  markLoggedIn(id: number): Promise<void> {
    return this.users.touchLastLogin(id);
  }

  setPasswordHash(id: number, passwordHash: string): Promise<void> {
    return this.users.update(id, { passwordHash });
  }

  static toAuthUser(user: User, sessionId: string): AuthUser {
    return {
      id: user.id,
      fullName: user.fullName,
      login: user.login,
      isSuperadmin: user.isSuperadmin,
      roleId: user.roleId,
      roleName: user.isSuperadmin ? 'Суперадмин' : (user.role?.name ?? null),
      permissions: user.isSuperadmin
        ? ALL_PERMISSIONS
        : normalizePermissions(user.role?.permissions ?? []),
      sessionId,
    };
  }

  /** True when the user holds the permission through their role (no superadmin bypass). */
  async isActiveWithPermission(
    userId: number,
    permission: string,
  ): Promise<boolean> {
    const user = await this.users.findByIdWithRole(userId);
    if (!user || !user.isActive || user.isSuperadmin) return false;
    return normalizePermissions(user.role?.permissions ?? []).includes(
      permission as AuthUser['permissions'][number],
    );
  }

  async getFullName(userId: number): Promise<string | null> {
    const user = await this.users.findByIdWithRole(userId);
    return user?.fullName ?? null;
  }

  /**
   * Keeps the superadmin account in sync with .env on every boot:
   * login, display name and password always match the environment.
   */
  async syncSuperadmin(config: {
    login: string;
    password: string;
    fullName: string;
  }): Promise<void> {
    await this.tx.run(async () => {
      const existing = await this.users.findSuperadminWithSecret();
      if (!existing) {
        if (await this.users.loginExists(config.login)) {
          throw new Error(
            `SUPERADMIN_LOGIN "${config.login}" is already used by a regular user`,
          );
        }
        await this.users.create({
          fullName: config.fullName,
          login: config.login,
          passwordHash: await hashPassword(config.password),
          isSuperadmin: true,
          isActive: true,
          roleId: null,
        });
        this.logger.log(`Superadmin "${config.login}" created`);
        return;
      }

      const patch: Partial<User> = {};
      if (existing.login !== config.login) {
        if (await this.users.loginExists(config.login, existing.id)) {
          throw new Error(
            `SUPERADMIN_LOGIN "${config.login}" is already used by a regular user`,
          );
        }
        patch.login = config.login;
      }
      if (existing.fullName !== config.fullName)
        patch.fullName = config.fullName;
      if (!existing.isActive) patch.isActive = true;
      if (!(await verifyPassword(config.password, existing.passwordHash))) {
        patch.passwordHash = await hashPassword(config.password);
      }
      if (!Object.keys(patch).length) return;

      await this.users.update(existing.id, patch);
      if (patch.passwordHash || patch.login) {
        this.revokeAccessAfterCommit({ userId: existing.id });
      }
      this.logger.log('Superadmin credentials synchronised with environment');
    });
  }

  private revokeAccessAfterCommit(event: UserAccessRevokedEvent): void {
    this.tx.afterCommit(() => {
      this.events.emit(AppEvent.UserAccessRevoked, event);
    });
  }
}
