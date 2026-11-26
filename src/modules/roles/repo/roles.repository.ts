import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { Role } from '../entities/role.entity';

export interface RoleWithUsage extends Role {
  usersCount: number;
}

@Injectable()
export class RolesRepository extends BaseRepository<Role> {
  constructor(dataSource: DataSource) {
    super(dataSource, Role);
  }

  async listWithUsage(): Promise<RoleWithUsage[]> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoin('r.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('users', 'u')
            .where('u.role_id = r.id'),
        'users_count',
      );
    const { entities, raw } = await qb
      .orderBy('r.name', 'ASC')
      .getRawAndEntities<{ users_count: number }>();
    return entities.map((role, index) => ({
      ...role,
      usersCount: Number(raw[index]?.users_count ?? 0),
    }));
  }

  findById(id: number): Promise<Role | null> {
    return this.repo.findOne({ where: { id } });
  }

  async nameExists(name: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('lower(r.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('r.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  async usersCount(roleId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE role_id = $1',
      [roleId],
    );
    return Number(row?.count ?? 0);
  }

  create(
    data: Pick<Role, 'name' | 'description' | 'permissions' | 'createdById'>,
  ): Promise<Role> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    patch: Partial<Pick<Role, 'name' | 'description' | 'permissions'>>,
  ): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }
}
