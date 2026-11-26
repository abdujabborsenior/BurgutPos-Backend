import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  StockItemType,
  StockLocation,
  StockMovementType,
} from '../../../common/constants/enums';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { StockMovement } from '../entities/stock-movement.entity';

export interface MovementListFilter {
  page: number;
  limit: number;
  search?: string;
  itemType?: StockItemType;
  dishId?: number;
  ingredientId?: number;
  type?: StockMovementType;
  location?: StockLocation;
  userId?: number;
  orderId?: number;
  from?: string;
  /** Exclusive upper bound, local wall-clock time. */
  until?: string;
  timeZone: string;
}

export type NewMovement = Pick<
  StockMovement,
  'itemType' | 'type' | 'quantity' | 'balanceAfter'
> &
  Partial<
    Pick<
      StockMovement,
      | 'dishId'
      | 'ingredientId'
      | 'location'
      | 'orderId'
      | 'receiptId'
      | 'comment'
      | 'createdById'
    >
  >;

@Injectable()
export class StockMovementsRepository extends BaseRepository<StockMovement> {
  constructor(dataSource: DataSource) {
    super(dataSource, StockMovement);
  }

  async insert(rows: NewMovement[]): Promise<void> {
    if (!rows.length) return;
    await this.repo.insert(
      rows.map((row) =>
        this.repo.create({
          dishId: null,
          ingredientId: null,
          location: null,
          orderId: null,
          receiptId: null,
          comment: null,
          createdById: null,
          ...row,
        }),
      ),
    );
  }

  /** Daily numbers (#412) of the orders behind sale movements, by order id. */
  async orderNumbers(orderIds: number[]): Promise<Map<number, number>> {
    if (!orderIds.length) return new Map();
    const rows = await this.query<{ id: number; number: number }>(
      `SELECT id, number FROM orders WHERE id = ANY($1::int[])`,
      [orderIds],
    );
    return new Map(rows.map((row) => [Number(row.id), Number(row.number)]));
  }

  async list(filter: MovementListFilter): Promise<[StockMovement[], number]> {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoin('m.dish', 'd')
      .addSelect(['d.id', 'd.name', 'd.unit'])
      .leftJoin('m.ingredient', 'i')
      .addSelect(['i.id', 'i.name', 'i.unit'])
      .leftJoin('m.createdBy', 'u')
      .addSelect(['u.id', 'u.fullName']);

    if (filter.itemType)
      qb.andWhere('m.itemType = :itemType', { itemType: filter.itemType });
    if (filter.dishId)
      qb.andWhere('m.dishId = :dishId', { dishId: filter.dishId });
    if (filter.ingredientId) {
      qb.andWhere('m.ingredientId = :ingredientId', {
        ingredientId: filter.ingredientId,
      });
    }
    if (filter.type) qb.andWhere('m.type = :type', { type: filter.type });
    if (filter.location)
      qb.andWhere('m.location = :location', { location: filter.location });
    if (filter.userId)
      qb.andWhere('m.createdById = :userId', { userId: filter.userId });
    if (filter.orderId)
      qb.andWhere('m.orderId = :orderId', { orderId: filter.orderId });
    if (filter.search) {
      qb.andWhere('(d.name ILIKE :search OR i.name ILIKE :search)', {
        search: likeContains(filter.search),
      });
    }
    if (filter.from) {
      qb.andWhere(`m.createdAt >= CAST(:from AS timestamp) AT TIME ZONE :tz`, {
        from: filter.from,
        tz: filter.timeZone,
      });
    }
    if (filter.until) {
      qb.andWhere(`m.createdAt < CAST(:until AS timestamp) AT TIME ZONE :tz`, {
        until: filter.until,
        tz: filter.timeZone,
      });
    }

    qb.orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);
    return qb.getManyAndCount();
  }
}
