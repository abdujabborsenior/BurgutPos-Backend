import { Injectable } from '@nestjs/common';
import { DataSource, type SelectQueryBuilder } from 'typeorm';
import { StockItemType } from '../../../common/constants/enums';
import type { SortOrder } from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { StockReceipt } from '../entities/stock-receipt.entity';

export type ReceiptSortKey =
  'createdAt' | 'item' | 'quantity' | 'purchasePrice' | 'salePrice' | 'total';

export interface ReceiptListFilter {
  page: number;
  limit: number;
  search?: string;
  archived: boolean;
  itemType?: StockItemType;
  dishId?: number;
  ingredientId?: number;
  from?: string;
  /** Exclusive upper bound, local wall-clock time. */
  until?: string;
  timeZone: string;
  sortBy: ReceiptSortKey;
  sortOrder: SortOrder;
}

const SORT_COLUMNS: Record<ReceiptSortKey, string> = {
  createdAt: 'r.createdAt',
  item: 'COALESCE(d.name, i.name)',
  quantity: 'r.quantity',
  purchasePrice: 'r.purchasePrice',
  salePrice: 'r.salePrice',
  total: 'r.total',
};

@Injectable()
export class StockReceiptsRepository extends BaseRepository<StockReceipt> {
  constructor(dataSource: DataSource) {
    super(dataSource, StockReceipt);
  }

  private base(): SelectQueryBuilder<StockReceipt> {
    return this.repo
      .createQueryBuilder('r')
      .leftJoin('r.dish', 'd')
      .addSelect(['d.id', 'd.name', 'd.unit'])
      .leftJoin('r.ingredient', 'i')
      .addSelect(['i.id', 'i.name', 'i.unit'])
      .leftJoin('r.createdBy', 'u')
      .addSelect(['u.id', 'u.fullName'])
      .leftJoin('r.archivedBy', 'au')
      .addSelect(['au.id', 'au.fullName']);
  }

  private filtered(
    filter: Omit<ReceiptListFilter, 'page' | 'limit' | 'sortBy' | 'sortOrder'>,
  ) {
    const qb = this.base().where('r.isArchived = :archived', {
      archived: filter.archived,
    });

    if (filter.itemType)
      qb.andWhere('r.itemType = :itemType', { itemType: filter.itemType });
    if (filter.dishId)
      qb.andWhere('r.dishId = :dishId', { dishId: filter.dishId });
    if (filter.ingredientId) {
      qb.andWhere('r.ingredientId = :ingredientId', {
        ingredientId: filter.ingredientId,
      });
    }
    if (filter.search) {
      qb.andWhere(
        '(d.name ILIKE :search OR i.name ILIKE :search OR r.comment ILIKE :search)',
        {
          search: likeContains(filter.search),
        },
      );
    }
    if (filter.from) {
      qb.andWhere(`r.createdAt >= CAST(:from AS timestamp) AT TIME ZONE :tz`, {
        from: filter.from,
        tz: filter.timeZone,
      });
    }
    if (filter.until) {
      qb.andWhere(`r.createdAt < CAST(:until AS timestamp) AT TIME ZONE :tz`, {
        until: filter.until,
        tz: filter.timeZone,
      });
    }
    return qb;
  }

  async list(filter: ReceiptListFilter): Promise<[StockReceipt[], number]> {
    const qb = this.filtered(filter);
    const total = await qb.getCount();
    qb.orderBy(SORT_COLUMNS[filter.sortBy], filter.sortOrder, 'NULLS LAST')
      .addOrderBy('r.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);
    return [await qb.getMany(), total];
  }

  async summary(
    filter: Omit<ReceiptListFilter, 'page' | 'limit' | 'sortBy' | 'sortOrder'>,
  ): Promise<{ count: number; totalSum: number }> {
    const row = await this.filtered(filter)
      .select('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(r.total), 0)', 'sum')
      .getRawOne<{ count: number; sum: string }>();
    return { count: Number(row?.count ?? 0), totalSum: Number(row?.sum ?? 0) };
  }

  async insert(data: Partial<StockReceipt>): Promise<number> {
    const result = await this.repo.insert(this.repo.create(data));
    return (result.identifiers[0] as { id: number }).id;
  }

  findByIdForUpdate(id: number): Promise<StockReceipt | null> {
    return this.repo.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  findDetailed(id: number): Promise<StockReceipt | null> {
    return this.base().where('r.id = :id', { id }).getOne();
  }

  async archive(
    id: number,
    patch: Pick<StockReceipt, 'archivedAt' | 'archivedById' | 'archiveReason'>,
  ): Promise<void> {
    await this.repo.update({ id }, { ...patch, isArchived: true });
  }
}
