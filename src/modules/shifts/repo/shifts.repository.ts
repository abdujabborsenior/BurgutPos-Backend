import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShiftStatus } from '../../../common/constants/enums';
import { BaseRepository } from '../../../database/base.repository';
import { Shift } from '../entities/shift.entity';

export interface ShiftListFilter {
  page: number;
  limit: number;
  status?: ShiftStatus;
  from?: string;
  /** Exclusive upper bound, local wall-clock time. */
  until?: string;
  timeZone: string;
}

export interface ShiftListRow extends Shift {
  liveRevenue: number;
  ordersCount: number;
}

export interface ShiftAggregates {
  paidCount: number;
  revenue: number;
  openCount: number;
  openTotal: number;
  cancelledCount: number;
  cancelledTotal: number;
  discounts: number;
  service: number;
  deliveryFees: number;
  guests: number;
  cashPayments: number;
  cashIn: number;
  cashOut: number;
  payments: { methodId: number; name: string; type: string; amount: number }[];
  byType: { type: string; count: number; total: number }[];
}

@Injectable()
export class ShiftsRepository extends BaseRepository<Shift> {
  constructor(dataSource: DataSource) {
    super(dataSource, Shift);
  }

  findOpen(): Promise<Shift | null> {
    return this.repo.findOne({
      where: { status: ShiftStatus.Open },
      relations: { openedBy: true },
    });
  }

  /**
   * Locks the open shift row. SHARE for operations that write into the shift
   * (orders, payments, cash operations); UPDATE for closing it — so a shift
   * can never close while a payment is being written into it.
   */
  findOpenLocked(mode: 'share' | 'update'): Promise<Shift | null> {
    return this.repo.findOne({
      where: { status: ShiftStatus.Open },
      lock: {
        mode: mode === 'share' ? 'pessimistic_read' : 'pessimistic_write',
      },
    });
  }

  findById(id: number): Promise<Shift | null> {
    return this.repo.findOne({
      where: { id },
      relations: { openedBy: true, closedBy: true },
    });
  }

  create(data: Partial<Shift>): Promise<Shift> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<Shift>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async list(filter: ShiftListFilter): Promise<[ShiftListRow[], number]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.openedBy', 'ob')
      .leftJoinAndSelect('s.closedBy', 'cb')
      .addSelect(
        (sub) =>
          sub
            .select('COALESCE(SUM(p.amount), 0)')
            .from('payments', 'p')
            .where('p.shift_id = s.id'),
        'live_revenue',
      )
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('orders', 'o')
            .where(`o.shift_id = s.id AND o.status = 'PAID'`),
        'orders_count',
      );
    if (filter.status)
      qb.andWhere('s.status = :status', { status: filter.status });
    if (filter.from) {
      qb.andWhere(`s.openedAt >= CAST(:from AS timestamp) AT TIME ZONE :tz`, {
        from: filter.from,
        tz: filter.timeZone,
      });
    }
    if (filter.until) {
      qb.andWhere(`s.openedAt < CAST(:until AS timestamp) AT TIME ZONE :tz`, {
        until: filter.until,
        tz: filter.timeZone,
      });
    }
    const total = await qb.getCount();
    qb.orderBy('s.openedAt', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);
    const { entities, raw } = await qb.getRawAndEntities<{
      live_revenue: string;
      orders_count: number;
    }>();
    return [
      entities.map((shift, i) => ({
        ...shift,
        liveRevenue: Number(raw[i]?.live_revenue ?? 0),
        ordersCount: Number(raw[i]?.orders_count ?? 0),
      })),
      total,
    ];
  }

  async countOpenOrders(): Promise<{ count: number; total: number }> {
    const [row] = await this.query<{ count: number; total: string }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total FROM orders WHERE status = 'OPEN'`,
    );
    return { count: Number(row?.count ?? 0), total: Number(row?.total ?? 0) };
  }

  async aggregates(shiftId: number): Promise<ShiftAggregates> {
    const [orders] = await this.query<Record<string, string | number>>(
      `SELECT COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid_count,
              COALESCE(SUM(total) FILTER (WHERE status = 'PAID'), 0) AS paid_total,
              COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
              COALESCE(SUM(total) FILTER (WHERE status = 'OPEN'), 0) AS open_total,
              COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_count,
              COALESCE(SUM(total) FILTER (WHERE status = 'CANCELLED'), 0) AS cancelled_total,
              COALESCE(SUM(discount_amount) FILTER (WHERE status = 'PAID'), 0) AS discounts,
              COALESCE(SUM(service_amount) FILTER (WHERE status = 'PAID'), 0) AS service,
              COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'PAID'), 0) AS delivery_fees,
              COALESCE(SUM(guests) FILTER (WHERE status = 'PAID'), 0)::int AS guests
         FROM orders WHERE shift_id = $1`,
      [shiftId],
    );
    const payments = await this.query<{
      id: number;
      name: string;
      type: string;
      amount: string;
    }>(
      `SELECT m.id, m.name, m.type, COALESCE(SUM(p.amount), 0) AS amount
         FROM payments p JOIN payment_methods m ON m.id = p.method_id
        WHERE p.shift_id = $1
        GROUP BY m.id
        ORDER BY m.sort_order, m.id`,
      [shiftId],
    );
    const [cash] = await this.query<{ cash_in: string; cash_out: string }>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'IN'), 0) AS cash_in,
              COALESCE(SUM(amount) FILTER (WHERE type = 'OUT'), 0) AS cash_out
         FROM cash_operations WHERE shift_id = $1`,
      [shiftId],
    );
    const byType = await this.query<{
      type: string;
      count: number;
      total: string;
    }>(
      `SELECT type, COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total
         FROM orders WHERE shift_id = $1 AND status = 'PAID'
        GROUP BY type ORDER BY type`,
      [shiftId],
    );

    const paymentRows = payments.map((p) => ({
      methodId: p.id,
      name: p.name,
      type: p.type,
      amount: Number(p.amount),
    }));
    return {
      paidCount: Number(orders?.paid_count ?? 0),
      revenue: paymentRows.reduce((sum, p) => sum + p.amount, 0),
      openCount: Number(orders?.open_count ?? 0),
      openTotal: Number(orders?.open_total ?? 0),
      cancelledCount: Number(orders?.cancelled_count ?? 0),
      cancelledTotal: Number(orders?.cancelled_total ?? 0),
      discounts: Number(orders?.discounts ?? 0),
      service: Number(orders?.service ?? 0),
      deliveryFees: Number(orders?.delivery_fees ?? 0),
      guests: Number(orders?.guests ?? 0),
      cashPayments: paymentRows
        .filter((p) => p.type === 'CASH')
        .reduce((sum, p) => sum + p.amount, 0),
      cashIn: Number(cash?.cash_in ?? 0),
      cashOut: Number(cash?.cash_out ?? 0),
      payments: paymentRows,
      byType: byType.map((row) => ({
        type: row.type,
        count: Number(row.count),
        total: Number(row.total),
      })),
    };
  }
}
