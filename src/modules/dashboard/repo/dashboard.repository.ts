import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  inLocalDateRange,
  num,
  WAITER_SHARE_SQL,
} from '../../../common/utils/sql';
import { BaseRepository } from '../../../database/base.repository';
import { Order } from '../../orders/entities/order.entity';

@Injectable()
export class DashboardRepository extends BaseRepository<Order> {
  constructor(dataSource: DataSource) {
    super(dataSource, Order);
  }

  async paymentsByMethod(from: string, to: string, tz: string) {
    const rows = await this.query<{
      id: number;
      name: string;
      type: string;
      amount: string;
    }>(
      `SELECT m.id, m.name, m.type, COALESCE(SUM(p.amount), 0) AS amount
         FROM payment_methods m
         LEFT JOIN payments p ON p.method_id = m.id AND ${inLocalDateRange('p.created_at', 1, 2, 3)}
        GROUP BY m.id
       HAVING m.is_active OR COALESCE(SUM(p.amount), 0) > 0
        ORDER BY m.sort_order, m.id`,
      [from, to, tz],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      amount: num(row.amount),
    }));
  }

  async openOrders() {
    const [row] = await this.query<{ count: number; total: string }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total FROM orders WHERE status = 'OPEN'`,
    );
    return { count: num(row?.count), total: num(row?.total) };
  }

  async orderStats(from: string, to: string, tz: string) {
    const [paid] = await this.query<Record<string, string | number>>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(guests), 0)::int AS guests
         FROM orders o
        WHERE o.status = 'PAID' AND ${inLocalDateRange('o.closed_at', 1, 2, 3)}`,
      [from, to, tz],
    );
    const [cancelled] = await this.query<Record<string, string | number>>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total
         FROM orders o
        WHERE o.status = 'CANCELLED' AND ${inLocalDateRange('o.cancelled_at', 1, 2, 3)}`,
      [from, to, tz],
    );
    return {
      ordersCount: num(paid?.count),
      revenue: num(paid?.revenue),
      guests: num(paid?.guests),
      cancelled: { count: num(cancelled?.count), total: num(cancelled?.total) },
    };
  }

  async revenueByDay(from: string, to: string, tz: string) {
    const rows = await this.query<{
      date: string;
      amount: string;
      orders: number;
    }>(
      `WITH p AS (
         SELECT (created_at AT TIME ZONE $3)::date AS day, amount,
                CASE WHEN is_reversal THEN NULL ELSE order_id END AS order_id
           FROM payments
          WHERE ${inLocalDateRange('created_at', 1, 2, 3)}
       ), days AS (
         SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(p.amount), 0) AS amount,
              COUNT(DISTINCT p.order_id)::int AS orders
         FROM days d LEFT JOIN p ON p.day = d.day
        GROUP BY d.day ORDER BY d.day`,
      [from, to, tz],
    );
    return rows.map((row) => ({
      date: row.date,
      amount: num(row.amount),
      orders: num(row.orders),
    }));
  }

  async topDishes(
    from: string,
    to: string,
    tz: string,
    page: number,
    limit: number,
  ) {
    const base = `FROM order_items i
         JOIN orders o ON o.id = i.order_id
        WHERE o.status = 'PAID' AND i.status = 'ACTIVE' AND ${inLocalDateRange('o.closed_at', 1, 2, 3)}`;
    const [count] = await this.query<{ total: number }>(
      `SELECT COUNT(DISTINCT i.dish_id)::int AS total ${base}`,
      [from, to, tz],
    );
    const rows = await this.query<{
      id: number;
      name: string;
      quantity: string;
      amount: string;
    }>(
      `SELECT d.id, d.name, SUM(i.quantity) AS quantity, SUM(i.total) AS amount
         FROM (SELECT i.dish_id, i.quantity, i.total ${base}) i
         JOIN dishes d ON d.id = i.dish_id
        GROUP BY d.id
        ORDER BY quantity DESC, amount DESC, d.name
        LIMIT $4 OFFSET $5`,
      [from, to, tz, limit, (page - 1) * limit],
    );
    return {
      total: num(count?.total),
      items: rows.map((row) => ({
        dishId: row.id,
        name: row.name,
        quantity: num(row.quantity),
        amount: num(row.amount),
      })),
    };
  }

  async waiters(from: string, to: string, tz: string) {
    const rows = await this.query<Record<string, string | number>>(
      `WITH sales AS (
         SELECT o.waiter_id,
                COUNT(*)::int AS orders,
                SUM(o.subtotal - o.discount_amount) AS sales,
                SUM(o.total) AS revenue,
                SUM(${WAITER_SHARE_SQL}) AS commission
           FROM orders o
          WHERE o.status = 'PAID' AND o.waiter_id IS NOT NULL
            AND ${inLocalDateRange('o.closed_at', 1, 2, 3)}
          GROUP BY o.waiter_id
       )
       SELECT u.id, u.full_name,
              COALESCE(s.orders, 0) AS orders, COALESCE(s.sales, 0) AS sales,
              COALESCE(s.revenue, 0) AS revenue, COALESCE(s.commission, 0) AS commission
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN sales s ON s.waiter_id = u.id
        WHERE s.waiter_id IS NOT NULL
           OR (u.is_active AND NOT u.is_superadmin AND 'orders.serve' = ANY(r.permissions))
        ORDER BY commission DESC, sales DESC, u.full_name`,
      [from, to, tz],
    );
    return rows.map((row) => ({
      userId: num(row.id),
      fullName: String(row.full_name),
      ordersCount: num(row.orders),
      sales: num(row.sales),
      revenue: num(row.revenue),
      commission: num(row.commission),
    }));
  }
}
