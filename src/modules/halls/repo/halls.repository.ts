import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ArchiveStatus } from '../../../common/dto/pagination-query.dto';
import { BaseRepository } from '../../../database/base.repository';
import { Hall } from '../entities/hall.entity';

export interface HallWithCounts extends Hall {
  tablesCount: number;
  openOrdersCount: number;
}

@Injectable()
export class HallsRepository extends BaseRepository<Hall> {
  constructor(dataSource: DataSource) {
    super(dataSource, Hall);
  }

  async list(status: ArchiveStatus): Promise<HallWithCounts[]> {
    const qb = this.repo
      .createQueryBuilder('h')
      .leftJoin('h.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('dining_tables', 't')
            .where('t.hall_id = h.id AND t.is_active'),
        'tables_count',
      )
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('orders', 'o')
            .innerJoin('dining_tables', 'ot', 'ot.id = o.table_id')
            .where(`ot.hall_id = h.id AND o.status = 'OPEN'`),
        'open_orders_count',
      );
    if (status === 'active') qb.where('h.isActive = true');
    if (status === 'archived') qb.where('h.isActive = false');
    qb.orderBy('h.sortOrder', 'ASC').addOrderBy('h.name', 'ASC');

    const { entities, raw } = await qb.getRawAndEntities<{
      tables_count: number;
      open_orders_count: number;
    }>();
    return entities.map((hall, index) => ({
      ...hall,
      tablesCount: Number(raw[index]?.tables_count ?? 0),
      openOrdersCount: Number(raw[index]?.open_orders_count ?? 0),
    }));
  }

  findById(id: number): Promise<Hall | null> {
    return this.repo.findOne({ where: { id } });
  }

  async nameExists(name: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('h')
      .where('lower(h.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('h.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async countTables(hallId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM dining_tables WHERE hall_id = $1',
      [hallId],
    );
    return Number(row?.count ?? 0);
  }

  async countOpenOrders(hallId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM orders o JOIN dining_tables t ON t.id = o.table_id
        WHERE t.hall_id = $1 AND o.status = 'OPEN'`,
      [hallId],
    );
    return Number(row?.count ?? 0);
  }

  async nextSortOrder(): Promise<number> {
    const [row] = await this.query<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM halls',
    );
    return Number(row?.next ?? 1);
  }

  create(data: Partial<Hall>): Promise<Hall> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<Hall>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }

  /** Active halls with their active tables, in display order. */
  findActiveWithTables(): Promise<Hall[]> {
    return this.repo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.tables', 't', 't.isActive = true')
      .where('h.isActive = true')
      .orderBy('h.sortOrder', 'ASC')
      .addOrderBy('h.name', 'ASC')
      .addOrderBy('t.sortOrder', 'ASC')
      .addOrderBy('t.name', 'ASC')
      .getMany();
  }
}
