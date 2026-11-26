import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  ArchiveStatus,
  SortOrder,
} from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { User } from '../entities/user.entity';

/** A user row plus the colleague who created the account. */
export interface UserWithAuthor extends User {
  createdBy: { id: number; fullName: string } | null;
}

export type UserSortKey =
  'fullName' | 'login' | 'role' | 'createdAt' | 'lastLoginAt';

export interface UserListFilter {
  page: number;
  limit: number;
  search?: string;
  status: ArchiveStatus;
  roleId?: number;
  sortBy: UserSortKey;
  sortOrder: SortOrder;
}

const SORT_COLUMNS: Record<UserSortKey, string> = {
  fullName: 'u.fullName',
  login: 'u.login',
  role: 'r.name',
  createdAt: 'u.createdAt',
  lastLoginAt: 'u.lastLoginAt',
};

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource) {
    super(dataSource, User);
  }

  /** Includes the password hash — for credential checks only. */
  findWithSecretByLogin(login: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.role', 'r')
      .where('lower(u.login) = lower(:login)', { login })
      .getOne();
  }

  findSuperadminWithSecret(): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.isSuperadmin = true')
      .orderBy('u.id', 'ASC')
      .getOne();
  }

  findByIdWithRole(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id }, relations: { role: true } });
  }

  async loginExists(login: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('u')
      .where('lower(u.login) = lower(:login)', { login });
    if (excludeId) qb.andWhere('u.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async list(filter: UserListFilter): Promise<[UserWithAuthor[], number]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .leftJoin('users', 'cb', 'cb.id = u.created_by_id')
      .addSelect(['cb.id AS cb_id', 'cb.full_name AS cb_full_name'])
      .where('u.isSuperadmin = false');

    if (filter.status === 'active') qb.andWhere('u.isActive = true');
    if (filter.status === 'archived') qb.andWhere('u.isActive = false');
    if (filter.roleId)
      qb.andWhere('u.roleId = :roleId', { roleId: filter.roleId });
    if (filter.search) {
      qb.andWhere(
        '(u.fullName ILIKE :search OR u.login ILIKE :search OR u.phone ILIKE :search)',
        { search: likeContains(filter.search) },
      );
    }

    qb.orderBy(SORT_COLUMNS[filter.sortBy], filter.sortOrder, 'NULLS LAST')
      .addOrderBy('u.id', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);
    const total = await qb.getCount();
    const { entities, raw } = await qb.getRawAndEntities<{
      cb_id: number | null;
      cb_full_name: string | null;
    }>();
    const items = entities.map((user, index) => ({
      ...user,
      createdBy:
        raw[index]?.cb_id === null || raw[index]?.cb_id === undefined
          ? null
          : {
              id: Number(raw[index].cb_id),
              fullName: String(raw[index].cb_full_name),
            },
    }));
    return [items, total];
  }

  async countByStatus(): Promise<{ active: number; archived: number }> {
    const [row] = await this.query<{ active: number; archived: number }>(
      `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
              COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
         FROM users WHERE NOT is_superadmin`,
    );
    return {
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
    };
  }

  /** Active, non-system users holding the given permission through their role. */
  findOptionsWithPermission(permission?: string): Promise<User[]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'r')
      .where('u.isActive = true')
      .andWhere('u.isSuperadmin = false');
    if (permission)
      qb.andWhere(':permission = ANY(r.permissions)', { permission });
    return qb.orderBy('u.fullName', 'ASC').getMany();
  }

  create(data: Partial<User>): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<User>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }

  async touchLastLogin(id: number): Promise<void> {
    await this.repo.update({ id }, { lastLoginAt: new Date() });
  }
}
