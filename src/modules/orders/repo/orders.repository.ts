import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderStatus, OrderType } from '../../../common/constants/enums';
import type { SortOrder } from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { Order } from '../entities/order.entity';

export type OrderSortKey = 'createdAt' | 'closedAt' | 'total' | 'id';

export interface OrderListFilter {
  page: number;
  limit: number;
  search?: string;
  status?: OrderStatus;
  type?: OrderType;
  waiterId?: number;
  cashierId?: number;
  tableId?: number;
  hallId?: number;
  shiftId?: number;
  from?: string;
  /** Exclusive upper bound, local wall-clock time. */
  until?: string;
  /** Which timestamp the date range applies to. */
  dateField: 'createdAt' | 'closedAt';
  timeZone: string;
  sortBy: OrderSortKey;
  sortOrder: SortOrder;
}

@Injectable()
export class OrdersRepository extends BaseRepository<Order> {
  constructor(dataSource: DataSource) {
    super(dataSource, Order);
  }

  async insert(data: Partial<Order>): Promise<number> {
    const result = await this.repo.insert(this.repo.create(data));
    return (result.identifiers[0] as { id: number }).id;
  }

  findByIdForUpdate(id: number): Promise<Order | null> {
    return this.repo.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  findById(id: number): Promise<Order | null> {
    return this.repo.findOne({ where: { id } });
  }

  async update(id: number, patch: Partial<Order>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  /** Full order for the detail view (items and payments loaded separately). */
  findDetailed(id: number): Promise<Order | null> {
    return this.repo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.table', 't')
      .leftJoinAndSelect('t.hall', 'h')
      .leftJoin('o.waiter', 'w')
      .addSelect(['w.id', 'w.fullName'])
      .leftJoin('o.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .leftJoin('o.closedBy', 'clb')
      .addSelect(['clb.id', 'clb.fullName'])
      .leftJoin('o.cancelledBy', 'cnb')
      .addSelect(['cnb.id', 'cnb.fullName'])
      .leftJoin('o.reopenedBy', 'rb')
      .addSelect(['rb.id', 'rb.fullName'])
      .where('o.id = :id', { id })
      .getOne();
  }

  /** Whether another order is open at the table (the board shows one per table). */
  async hasOpenOrderAtTable(tableId: number, exceptId: number) {
    const [row] = await this.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM orders
                       WHERE table_id = $1 AND status = 'OPEN' AND id <> $2) AS found`,
      [tableId, exceptId],
    );
    return Boolean(row?.found);
  }

  /** Open orders that sit on tables, for the hall board. */
  findOpenTableOrders(): Promise<Order[]> {
    return this.repo
      .createQueryBuilder('o')
      .leftJoin('o.waiter', 'w')
      .addSelect(['w.id', 'w.fullName'])
      .where('o.status = :status', { status: OrderStatus.Open })
      .andWhere('o.tableId IS NOT NULL')
      .getMany();
  }

  async countOpenByType(): Promise<Record<OrderType, number>> {
    const rows = await this.query<{ type: OrderType; count: number }>(
      `SELECT type, COUNT(*)::int AS count FROM orders WHERE status = 'OPEN' GROUP BY type`,
    );
    const result = {
      [OrderType.Table]: 0,
      [OrderType.Takeaway]: 0,
      [OrderType.Delivery]: 0,
      [OrderType.Hall]: 0,
    };
    for (const row of rows) result[row.type] = Number(row.count);
    return result;
  }

  async countOpenForWaiter(waiterId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM orders WHERE status = 'OPEN' AND waiter_id = $1`,
      [waiterId],
    );
    return Number(row?.count ?? 0);
  }

  async itemCounts(orderIds: number[]): Promise<Map<number, number>> {
    if (!orderIds.length) return new Map();
    const rows = await this.query<{ order_id: number; count: string }>(
      `SELECT order_id, COALESCE(SUM(quantity), 0) AS count
         FROM order_items WHERE order_id = ANY($1::int[]) AND status = 'ACTIVE'
        GROUP BY order_id`,
      [orderIds],
    );
    return new Map(rows.map((row) => [row.order_id, Number(row.count)]));
  }

  async list(
    filter: OrderListFilter,
  ): Promise<{ items: Order[]; total: number; sum: number }> {
    const qb = this.repo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.table', 't')
      .leftJoinAndSelect('t.hall', 'h')
      .leftJoin('o.waiter', 'w')
      .addSelect(['w.id', 'w.fullName'])
      .leftJoin('o.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .leftJoin('o.closedBy', 'clb')
      .addSelect(['clb.id', 'clb.fullName']);

    if (filter.status)
      qb.andWhere('o.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('o.type = :type', { type: filter.type });
    if (filter.waiterId)
      qb.andWhere('o.waiterId = :waiterId', { waiterId: filter.waiterId });
    if (filter.cashierId)
      qb.andWhere('o.closedById = :cashierId', { cashierId: filter.cashierId });
    if (filter.tableId)
      qb.andWhere('o.tableId = :tableId', { tableId: filter.tableId });
    if (filter.hallId)
      qb.andWhere('t.hallId = :hallId', { hallId: filter.hallId });
    if (filter.shiftId)
      qb.andWhere('o.shiftId = :shiftId', { shiftId: filter.shiftId });
    if (filter.search) {
      const digits = filter.search.replace(/^[#№]/, '');
      if (/^\d+$/.test(digits) && digits.length <= 9) {
        qb.andWhere(
          '(o.number = :number OR o.id = :number OR o.customerPhone ILIKE :search)',
          { number: Number(digits), search: likeContains(digits) },
        );
      } else {
        qb.andWhere(
          '(o.customerName ILIKE :search OR o.customerPhone ILIKE :search OR o.deliveryAddress ILIKE :search OR o.comment ILIKE :search)',
          { search: likeContains(filter.search) },
        );
      }
    }
    const column =
      filter.dateField === 'closedAt' ? 'o.closedAt' : 'o.createdAt';
    if (filter.from) {
      qb.andWhere(`${column} >= CAST(:from AS timestamp) AT TIME ZONE :tz`, {
        from: filter.from,
        tz: filter.timeZone,
      });
    }
    if (filter.until) {
      qb.andWhere(`${column} < CAST(:until AS timestamp) AT TIME ZONE :tz`, {
        until: filter.until,
        tz: filter.timeZone,
      });
    }

    const totals = await qb
      .clone()
      .select('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(o.total), 0)', 'sum')
      .getRawOne<{ count: number; sum: string }>();

    const sortColumn: Record<OrderSortKey, string> = {
      createdAt: 'o.createdAt',
      closedAt: 'o.closedAt',
      total: 'o.total',
      id: 'o.id',
    };
    qb.orderBy(sortColumn[filter.sortBy], filter.sortOrder, 'NULLS LAST')
      .addOrderBy('o.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);

    return {
      items: await qb.getMany(),
      total: Number(totals?.count ?? 0),
      sum: Number(totals?.sum ?? 0),
    };
  }
}
