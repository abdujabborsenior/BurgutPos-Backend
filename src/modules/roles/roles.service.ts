import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_ROLES,
  normalizePermissions,
  PERMISSION_GROUPS,
} from '../../common/constants/permissions';
import type { AuthUser } from '../../common/types/auth-user';
import { TransactionService } from '../../database/transaction/transaction.service';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import type { Role } from './entities/role.entity';
import { RolesRepository } from './repo/roles.repository';

@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly tx: TransactionService,
  ) {}

  /** Every role — roles are not archived: one in use is kept, an unused one is deleted. */
  async list() {
    return { items: await this.roles.listWithUsage() };
  }

  permissionsCatalog() {
    return PERMISSION_GROUPS;
  }

  async getById(id: number): Promise<Role> {
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundException('Роль не найдена');
    return role;
  }

  async create(dto: CreateRoleDto, actor: AuthUser): Promise<Role> {
    if (await this.roles.nameExists(dto.name)) {
      throw new ConflictException('Роль с таким названием уже существует');
    }
    return this.roles.create({
      name: dto.name,
      description: dto.description ?? null,
      permissions: normalizePermissions(dto.permissions),
      createdById: actor.id,
    });
  }

  async update(id: number, dto: UpdateRoleDto): Promise<Role> {
    await this.getById(id);
    if (dto.name && (await this.roles.nameExists(dto.name, id))) {
      throw new ConflictException('Роль с таким названием уже существует');
    }
    await this.roles.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description || null }
        : {}),
      ...(dto.permissions !== undefined
        ? { permissions: normalizePermissions(dto.permissions) }
        : {}),
    });
    return this.getById(id);
  }

  async delete(id: number): Promise<void> {
    await this.tx.run(async () => {
      await this.getById(id);
      const usersCount = await this.roles.usersCount(id);
      if (usersCount > 0) {
        throw new ConflictException(
          `Роль назначена сотрудникам (${usersCount}). Сначала назначьте им другую роль`,
        );
      }
      await this.roles.delete(id);
    });
  }

  /** Creates the default roles on a fresh installation. */
  async ensureDefaults(): Promise<void> {
    if ((await this.roles.count()) > 0) return;
    for (const role of DEFAULT_ROLES) {
      // Created by the system itself: there is nobody signed in yet.
      await this.roles.create({ ...role, createdById: null });
    }
  }
}
