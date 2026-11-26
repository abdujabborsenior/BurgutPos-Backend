import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  ArchiveStatus,
  SortOrder,
} from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { DiningTable } from '../entities/dining-table.entity';

export type TableSortKey =
  'name' | 'hall' | 'sortOrder' | 'seats' | 'createdAt';

export interface TableListFilter {
  page: number;
  limit: number;
  search?: string;
  hallId?: number;
  status: ArchiveStatus;
  sortBy: TableSortKey;
  sortOrder: SortOrder;
}

const SORT_COLUMNS: Record<TableSortKey, string> = {
  name: 't.name',
  hall: 'h.name',
  sortOrder: 't.sortOrder',
  seats: 't.seats',
  createdAt: 't.createdAt',
};

@Injectable()
export class TablesRepository extends BaseRepository<DiningTable> {
  constructor(dataSource: DataSource) {
    super(dataSource, DiningTable);
  }

  async list(filter: TableListFilter): Promise<[DiningTable[], number]> {
    const qb = this.repo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.hall', 'h');
    if (filter.status === 'active') qb.andWhere('t.isActive = true');
    if (filter.status === 'archived') qb.andWhere('t.isActive = false');
    if (filter.hallId)
      qb.andWhere('t.hallId = :hallId', { hallId: filter.hallId });
    if (filter.search) {
      qb.andWhere('(t.name ILIKE :search OR h.name ILIKE :search)', {
        search: likeContains(filter.search),
      });
    }
    qb.orderBy(SORT_COLUMNS[filter.sortBy], filter.sortOrder, 'NULLS LAST');
    if (filter.sortBy !== 'hall') qb.addOrderBy('h.sortOrder', 'ASC');
    qb.addOrderBy('t.sortOrder', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);
    return qb.getManyAndCount();
  }

  async countByStatus(): Promise<{ active: number; archived: number }> {
    const [row] = await this.query<{ active: number; archived: number }>(
      `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
              COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
         FROM dining_tables`,
    );
    return {
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
    };
  }

  findById(id: number): Promise<DiningTable | null> {
    return this.repo.findOne({ where: { id }, relations: { hall: true } });
  }

  findActiveOptions(): Promise<DiningTable[]> {
    return this.repo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.hall', 'h')
      .where('t.isActive = true AND h.isActive = true')
      .orderBy('h.sortOrder', 'ASC')
      .addOrderBy('t.sortOrder', 'ASC')
      .addOrderBy('t.name', 'ASC')
      .getMany();
  }

  async findExistingNames(hallId: number, names: string[]): Promise<string[]> {
    if (!names.length) return [];
    const rows = await this.query<{ name: string }>(
      'SELECT name FROM dining_tables WHERE hall_id = $1 AND lower(name) = ANY($2::text[])',
      [hallId, names.map((name) => name.toLowerCase())],
    );
    return rows.map((row) => row.name);
  }

  async nameExistsInHall(
    hallId: number,
    name: string,
    excludeId?: number,
  ): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.hallId = :hallId', { hallId })
      .andWhere('lower(t.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('t.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async hasOpenOrder(tableId: number): Promise<boolean> {
    const [row] = await this.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM orders WHERE table_id = $1 AND status = 'OPEN') AS exists`,
      [tableId],
    );
    return Boolean(row?.exists);
  }

  async nextSortOrder(hallId: number): Promise<number> {
    const [row] = await this.query<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM dining_tables WHERE hall_id = $1',
      [hallId],
    );
    return Number(row?.next ?? 1);
  }

  create(data: Partial<DiningTable>): Promise<DiningTable> {
    return this.repo.save(this.repo.create(data));
  }

  async createMany(rows: Partial<DiningTable>[]): Promise<number> {
    if (!rows.length) return 0;
    await this.repo.insert(rows.map((row) => this.repo.create(row)));
    return rows.length;
  }

  async update(id: number, patch: Partial<DiningTable>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }
}
