import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  OrderStatus,
  OrderType,
  PaymentMethodType,
} from '../../../common/constants/enums';
import {
  inLocalRange,
  num,
  SERVICE_BASE_SQL,
  WAITER_SHARE_SQL,
} from '../../../common/utils/sql';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { Order } from '../../orders/entities/order.entity';
import type {
  CancellationSort,
  DishReportSort,
  OrderReportSort,
} from '../dto/reports.dto';

/**
 * Report period as local wall-clock bounds [from, until) of time zone `tz`;
 * `fromDate`/`toDate` are the calendar days it touches.
 */
export interface Range {
  from: string;
  until: string;
  tz: string;
  fromDate: string;
  toDate: string;
}

/**
 * What a report covers. Either a period of time, or one cash shift — the
 * "Отчёт по сменам" section shows the very same reports for a single shift.
 *
 * In shift mode the scope is the shift the rows belong to: orders by
 * `orders.shift_id` (the shift they were opened in), money by
 * `payments.shift_id` (the shift whose drawer it went into). The two agree
 * for every order opened and paid in the same shift — the normal case.
 */
export type Scope = ({ kind: 'range' } & Range) | { kind: 'shift'; id: number };

export const rangeScope = (range: Range): Scope => ({
  kind: 'range',
  ...range,
});
export const shiftScope = (id: number): Scope => ({ kind: 'shift', id });

type Row = Record<string, unknown>;

/** Scope predicates and the parameter list they were built for. */
interface ScopeSql {
  params: unknown[];
  /** Appends a query parameter and returns its placeholder. */
  bind: (value: unknown) => string;
  /** Orders that produced revenue (alias `o`). */
  paid: string;
  /** Orders still waiting for payment (alias `o`). */
  pending: string;
  /** Payments, reversals included (alias `p`). */
  payments: string;
  /** Orders cancelled as a whole (alias `o`). */
  cancelledOrders: string;
  /** Cancelled lines (aliases `i` and `o`). */
  cancelledItems: string;
  /** Lines of the scope, each tagged paid / pending / cancelled. */
  itemLines: string;
}

/** Dine-in sales without the service charge — the base of the waiter's share. */
const SERVICE_BASE = SERVICE_BASE_SQL;

/** Payment-method types folded into the columns of the cash reports. */
const BY_KIND = `
  COALESCE(SUM(p.amount) FILTER (WHERE m.type = 'CASH'), 0) AS cash,
  COALESCE(SUM(p.amount) FILTER (WHERE m.type = 'CARD'), 0) AS card,
  COALESCE(SUM(p.amount) FILTER (WHERE m.type = 'ONLINE'), 0) AS transfer,
  COALESCE(SUM(p.amount) FILTER (WHERE m.type = 'OTHER'), 0) AS other`;

const LINE_SUMS = `
  COALESCE(SUM(l.quantity) FILTER (WHERE l.kind = 'paid'), 0) AS quantity,
  COALESCE(SUM(l.total) FILTER (WHERE l.kind = 'paid'), 0) AS revenue,
  COALESCE(SUM(l.cost) FILTER (WHERE l.kind = 'paid'), 0) AS cost,
  COALESCE(SUM(l.quantity) FILTER (WHERE l.kind = 'pending'), 0) AS pending_quantity,
  COALESCE(SUM(l.total) FILTER (WHERE l.kind = 'pending'), 0) AS pending_revenue,
  COALESCE(SUM(l.quantity) FILTER (WHERE l.kind = 'cancelled'), 0) AS cancelled_quantity,
  COALESCE(SUM(l.total) FILTER (WHERE l.kind = 'cancelled'), 0) AS cancelled_amount`;

const CATEGORY_ID = `COALESCE(c.id, l.category_id)`;
const CATEGORY_NAME = `COALESCE(c.name, l.category_name, 'Без категории')`;

/** Nullable text column (numbers are accepted as their decimal form). */
const str = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
};

const byKind = (row: Row) => ({
  cash: num(row.cash),
  card: num(row.card),
  transfer: num(row.transfer),
  other: num(row.other),
});

export interface MethodAmount {
  methodId: number;
  name: string;
  type: PaymentMethodType;
  amount: number;
}

export interface ShiftsFilter {
  /** Which moment of the shift the period applies to. */
  dateField?: 'opened' | 'closed' | 'overlap';
  cashierId?: number;
}

export interface OrdersReportFilter {
  dateField: 'createdAt' | 'closedAt';
  status?: OrderStatus;
  type?: OrderType;
  tableId?: number;
  hallId?: number;
  waiterId?: number;
  methodId?: number;
  search?: string;
  sortBy: OrderReportSort;
  sortOrder: 'ASC' | 'DESC';
  page: number;
  limit: number;
}

@Injectable()
export class ReportsRepository extends BaseRepository<Order> {
  constructor(dataSource: DataSource) {
    super(dataSource, Order);
  }

  /**
   * Builds the predicates of one query. Every query gets its own instance:
   * `bind` appends to that query's parameter list.
   */
  private scoped(scope: Scope): ScopeSql {
    const params: unknown[] =
      scope.kind === 'range' ? [scope.from, scope.until, scope.tz] : [scope.id];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const sql: Omit<ScopeSql, 'itemLines'> =
      scope.kind === 'range'
        ? {
            params,
            bind,
            paid: `o.status = 'PAID' AND ${inLocalRange('o.closed_at', 1, 2, 3)}`,
            pending: `o.status = 'OPEN' AND ${inLocalRange('o.created_at', 1, 2, 3)}`,
            payments: inLocalRange('p.created_at', 1, 2, 3),
            cancelledOrders: `o.status = 'CANCELLED' AND ${inLocalRange('o.cancelled_at', 1, 2, 3)}`,
            cancelledItems: inLocalRange('i.cancelled_at', 1, 2, 3),
          }
        : {
            params,
            bind,
            paid: `o.status = 'PAID' AND o.shift_id = $1`,
            pending: `o.status = 'OPEN' AND o.shift_id = $1`,
            payments: `p.shift_id = $1`,
            cancelledOrders: `o.status = 'CANCELLED' AND o.shift_id = $1`,
            cancelledItems: `o.shift_id = $1 AND i.cancelled_at IS NOT NULL`,
          };
    return {
      ...sql,
      itemLines: `
        SELECT i.id, i.order_id, i.dish_id, i.category_id, i.category_name, i.quantity, i.total,
               i.cost_price * i.quantity AS cost,
               CASE WHEN i.status = 'CANCELLED' THEN 'cancelled'
                    WHEN o.status = 'PAID' THEN 'paid'
                    ELSE 'pending' END AS kind
          FROM order_items i
          JOIN orders o ON o.id = i.order_id
         WHERE (i.status = 'ACTIVE' AND ((${sql.paid}) OR (${sql.pending})))
            OR (i.status = 'CANCELLED' AND ${sql.cancelledItems})`,
    };
  }

  // ─────────────────────────────── Summary ───────────────────────────────

  /** Net money per payment method by payment time (reversals included). */
  async paymentMethods(scope: Scope) {
    const s = this.scoped(scope);
    const rows = await this.query<Row>(
      `WITH per_order AS (
         SELECT p.method_id, p.order_id, SUM(p.amount) AS net
           FROM payments p WHERE ${s.payments}
          GROUP BY p.method_id, p.order_id
       ), per_method AS (
         SELECT method_id, SUM(net) AS amount, COUNT(*) FILTER (WHERE net > 0)::int AS orders
           FROM per_order GROUP BY method_id
       )
       SELECT m.id, m.name, m.type, COALESCE(pm.amount, 0) AS amount, COALESCE(pm.orders, 0) AS orders
         FROM payment_methods m
         LEFT JOIN per_method pm ON pm.method_id = m.id
        WHERE m.is_active OR pm.method_id IS NOT NULL
        ORDER BY m.sort_order, m.id`,
      s.params,
    );
    return rows.map((row) => ({
      methodId: num(row.id),
      name: String(row.name),
      type: row.type as PaymentMethodType,
      amount: num(row.amount),
      ordersCount: num(row.orders),
    }));
  }

  async totals(scope: Scope) {
    const s = this.scoped(scope);
    const [orders] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(o.total), 0) AS revenue,
              COALESCE(SUM(o.subtotal), 0) AS subtotal,
              COALESCE(SUM(o.discount_amount), 0) AS discounts,
              COALESCE(SUM(o.service_amount), 0) AS service,
              COALESCE(SUM(o.delivery_fee), 0) AS delivery_fees,
              COALESCE(SUM(o.guests), 0)::int AS guests,
              COALESCE(SUM(${SERVICE_BASE}), 0) AS base,
              COALESCE(SUM(${WAITER_SHARE_SQL}), 0) AS commission
         FROM orders o WHERE ${s.paid}`,
      s.params,
    );
    const [items] = await this.query<Row>(
      `SELECT COALESCE(SUM(i.quantity), 0) AS quantity,
              COALESCE(SUM(i.cost_price * i.quantity), 0) AS cost
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE i.status = 'ACTIVE' AND ${s.paid}`,
      s.params,
    );
    const [pending] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total), 0) AS amount
         FROM orders o WHERE ${s.pending}`,
      s.params,
    );
    const [cancelledOrders] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(o.total), 0) AS amount
         FROM orders o
        WHERE ${s.cancelledOrders}`,
      s.params,
    );
    const [cancelledItems] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(i.quantity), 0) AS quantity,
              COALESCE(SUM(i.total), 0) AS amount
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE i.status = 'CANCELLED' AND o.status <> 'CANCELLED'
          AND ${s.cancelledItems}`,
      s.params,
    );
    return {
      ordersCount: num(orders?.count),
      revenue: num(orders?.revenue),
      subtotal: num(orders?.subtotal),
      discounts: num(orders?.discounts),
      service: num(orders?.service),
      deliveryFees: num(orders?.delivery_fees),
      guests: num(orders?.guests),
      waiterBase: num(orders?.base),
      waiterCommission: num(orders?.commission),
      itemsQuantity: num(items?.quantity),
      itemsCost: num(items?.cost),
      pending: { count: num(pending?.count), amount: num(pending?.amount) },
      cancelledOrders: {
        count: num(cancelledOrders?.count),
        amount: num(cancelledOrders?.amount),
      },
      cancelledItems: {
        count: num(cancelledItems?.count),
        quantity: num(cancelledItems?.quantity),
        amount: num(cancelledItems?.amount),
      },
    };
  }

  async byType(scope: Scope) {
    const s = this.scoped(scope);
    const rows = await this.query<Row>(
      `SELECT o.type, COUNT(*)::int AS count, SUM(o.total) AS amount
         FROM orders o WHERE ${s.paid}
        GROUP BY o.type`,
      s.params,
    );
    return new Map(
      rows.map((row) => [
        row.type as OrderType,
        { count: num(row.count), amount: num(row.amount) },
      ]),
    );
  }

  async byDay(range: Range) {
    const s = this.scoped(rangeScope(range));
    const rows = await this.query<Row>(
      `WITH days AS (SELECT generate_series(${s.bind(range.fromDate)}::date, ${s.bind(range.toDate)}::date, interval '1 day')::date AS day),
            o AS (SELECT (o.closed_at AT TIME ZONE $3)::date AS day, o.total
                    FROM orders o WHERE ${s.paid})
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COUNT(o.total)::int AS count,
              COALESCE(SUM(o.total), 0) AS amount
         FROM days d LEFT JOIN o ON o.day = d.day
        GROUP BY d.day ORDER BY d.day`,
      s.params,
    );
    return rows.map((row) => ({
      date: String(row.date),
      count: num(row.count),
      amount: num(row.amount),
    }));
  }

  /** Every dish sold in the period, best sellers first. */
  async topDishes(scope: Scope) {
    const s = this.scoped(scope);
    const rows = await this.query<Row>(
      `SELECT d.id, d.name, d.unit, SUM(i.quantity) AS quantity, SUM(i.total) AS revenue
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
         JOIN dishes d ON d.id = i.dish_id
        WHERE i.status = 'ACTIVE' AND ${s.paid}
        GROUP BY d.id
        ORDER BY quantity DESC, revenue DESC, d.name`,
      s.params,
    );
    return rows.map((row) => ({
      dishId: num(row.id),
      name: String(row.name),
      unit: String(row.unit),
      quantity: num(row.quantity),
      revenue: num(row.revenue),
    }));
  }

  // ─────────────────────────────── Orders ───────────────────────────────

  async orders(scope: Scope, filter: OrdersReportFilter) {
    const s = this.scoped(scope);
    const { params, bind } = s;
    const where: string[] = [
      scope.kind === 'shift'
        ? `o.shift_id = $1`
        : filter.dateField === 'closedAt'
          ? // Cancelled orders have no closing time: they close when cancelled.
            `((o.closed_at IS NOT NULL AND ${inLocalRange('o.closed_at', 1, 2, 3)})
              OR (o.closed_at IS NULL AND o.status = 'CANCELLED' AND ${inLocalRange('o.cancelled_at', 1, 2, 3)}))`
          : inLocalRange('o.created_at', 1, 2, 3),
      // Merged orders handed their lines to another order: not orders of their own.
      filter.status
        ? `o.status = ${bind(filter.status)}`
        : `o.status <> 'MERGED'`,
    ];
    if (filter.type) where.push(`o.type = ${bind(filter.type)}`);
    if (filter.tableId) where.push(`o.table_id = ${bind(filter.tableId)}`);
    if (filter.hallId) where.push(`t.hall_id = ${bind(filter.hallId)}`);
    if (filter.waiterId) where.push(`o.waiter_id = ${bind(filter.waiterId)}`);
    if (filter.methodId) {
      where.push(`EXISTS (SELECT 1 FROM payments p
                           WHERE p.order_id = o.id AND p.method_id = ${bind(filter.methodId)}
                           GROUP BY p.order_id HAVING SUM(p.amount) > 0)`);
    }
    if (filter.search) {
      const digits = filter.search.replace(/^[#№]/, '');
      if (/^\d{1,9}$/.test(digits)) {
        const number = bind(Number(digits));
        where.push(
          `(o.number = ${number} OR o.id = ${number} OR o.customer_phone ILIKE ${bind(likeContains(digits))})`,
        );
      } else {
        const search = bind(likeContains(filter.search));
        where.push(
          `(o.customer_name ILIKE ${search} OR o.customer_phone ILIKE ${search}
            OR o.delivery_address ILIKE ${search} OR o.comment ILIKE ${search})`,
        );
      }
    }
    const from = `FROM orders o
         LEFT JOIN dining_tables t ON t.id = o.table_id
         LEFT JOIN halls h ON h.id = t.hall_id
         LEFT JOIN users w ON w.id = o.waiter_id
         LEFT JOIN users cb ON cb.id = o.closed_by_id
         LEFT JOIN users xb ON xb.id = o.cancelled_by_id
        WHERE ${where.join(' AND ')}`;

    const [totals] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE o.status = 'PAID')::int AS paid,
              COUNT(*) FILTER (WHERE o.status = 'OPEN')::int AS open,
              COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::int AS cancelled,
              COALESCE(SUM(o.total) FILTER (WHERE o.status = 'PAID'), 0) AS revenue,
              COALESCE(SUM(o.total) FILTER (WHERE o.status = 'OPEN'), 0) AS pending,
              COALESCE(SUM(o.total) FILTER (WHERE o.status = 'CANCELLED'), 0) AS cancelled_amount,
              COALESCE((SELECT SUM(i.quantity) FROM order_items i
                         WHERE i.status = 'ACTIVE' AND i.order_id IN (SELECT o.id ${from})), 0) AS items
         ${from}`,
      params,
    );
    const methods = await this.query<Row>(
      `WITH f AS (SELECT o.id ${from}),
            pm AS (SELECT p.method_id, SUM(p.amount) AS amount
                     FROM payments p JOIN f ON f.id = p.order_id
                    GROUP BY p.method_id)
       SELECT m.id, m.name, m.type, COALESCE(pm.amount, 0) AS amount
         FROM payment_methods m LEFT JOIN pm ON pm.method_id = m.id
        WHERE m.is_active OR COALESCE(pm.amount, 0) <> 0
        ORDER BY m.sort_order, m.id`,
      params,
    );

    const direction = filter.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const order: Record<OrderReportSort, string> = {
      id: `o.id ${direction}`,
      number: `o.business_date ${direction}, o.number ${direction}`,
      createdAt: `o.created_at ${direction}`,
      closedAt: `COALESCE(o.closed_at, o.cancelled_at) ${direction} NULLS LAST`,
      waiter: `w.full_name ${direction} NULLS LAST`,
      closedBy: `COALESCE(cb.full_name, xb.full_name) ${direction} NULLS LAST`,
      shift: `o.shift_id ${direction}`,
      items: `items ${direction}`,
      total: `o.total ${direction}`,
    };
    const rows = await this.query<Row>(
      `SELECT o.id, o.number, o.business_date::text AS business_date, o.type, o.status,
              o.created_at, o.closed_at, o.cancelled_at, o.shift_id, o.guests, o.reopen_count,
              o.subtotal, o.discount_amount, o.service_amount, o.delivery_fee, o.total,
              o.customer_name, o.customer_phone,
              t.name AS table_name, h.name AS hall_name,
              w.id AS waiter_id, w.full_name AS waiter_name,
              cb.full_name AS closed_by, xb.full_name AS cancelled_by,
              COALESCE((SELECT SUM(i.quantity) FROM order_items i
                         WHERE i.order_id = o.id AND i.status = 'ACTIVE'), 0) AS items,
              COALESCE((SELECT json_agg(json_build_object('methodId', m.id, 'name', m.name,
                                                          'type', m.type, 'amount', x.amount)
                                        ORDER BY m.sort_order, m.id)
                          FROM (SELECT p.method_id, SUM(p.amount) AS amount FROM payments p
                                 WHERE p.order_id = o.id
                                 GROUP BY p.method_id HAVING SUM(p.amount) <> 0) x
                          JOIN payment_methods m ON m.id = x.method_id), '[]'::json) AS payments
         ${from}
        ORDER BY ${order[filter.sortBy]}, o.id DESC
        LIMIT ${bind(filter.limit)} OFFSET ${bind((filter.page - 1) * filter.limit)}`,
      params,
    );

    return {
      total: num(totals?.count),
      totals: {
        count: num(totals?.count),
        paidCount: num(totals?.paid),
        openCount: num(totals?.open),
        cancelledCount: num(totals?.cancelled),
        revenue: num(totals?.revenue),
        pending: num(totals?.pending),
        cancelledAmount: num(totals?.cancelled_amount),
        itemsCount: num(totals?.items),
      },
      paymentMethods: methods.map((row): MethodAmount => ({
        methodId: num(row.id),
        name: String(row.name),
        type: row.type as PaymentMethodType,
        amount: num(row.amount),
      })),
      items: rows.map((row) => ({
        id: num(row.id),
        number: num(row.number),
        businessDate: String(row.business_date),
        type: row.type as OrderType,
        status: row.status as OrderStatus,
        table:
          row.table_name === null
            ? null
            : { name: str(row.table_name) ?? '', hallName: str(row.hall_name) },
        createdAt: row.created_at as Date,
        closedAt: (row.closed_at as Date | null) ?? null,
        cancelledAt: (row.cancelled_at as Date | null) ?? null,
        shiftId: num(row.shift_id),
        waiter:
          row.waiter_id === null
            ? null
            : { id: num(row.waiter_id), fullName: String(row.waiter_name) },
        closedBy: str(row.closed_by),
        cancelledBy: str(row.cancelled_by),
        customerName: str(row.customer_name),
        customerPhone: str(row.customer_phone),
        guests: row.guests === null ? null : num(row.guests),
        itemsCount: num(row.items),
        subtotal: num(row.subtotal),
        discountAmount: num(row.discount_amount),
        serviceAmount: num(row.service_amount),
        deliveryFee: num(row.delivery_fee),
        total: num(row.total),
        reopenCount: num(row.reopen_count),
        payments: (row.payments as MethodAmount[]).map((payment) => ({
          ...payment,
          amount: num(payment.amount),
        })),
      })),
    };
  }

  // ─────────────────────────────── Tables ───────────────────────────────

  async tables(scope: Scope, hallId?: number) {
    const s = this.scoped(scope);
    const hall = hallId ? `AND h.id = ${s.bind(hallId)}` : '';
    const rows = await this.query<Row>(
      `WITH paid AS (
         SELECT o.table_id, COUNT(*)::int AS orders, SUM(o.total) AS revenue,
                COALESCE(SUM(o.guests), 0)::int AS guests,
                AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 60) AS minutes
           FROM orders o WHERE o.table_id IS NOT NULL AND ${s.paid}
          GROUP BY o.table_id
       ), pending AS (
         SELECT o.table_id, COUNT(*)::int AS orders, SUM(o.total) AS amount
           FROM orders o WHERE o.table_id IS NOT NULL AND ${s.pending}
          GROUP BY o.table_id
       )
       SELECT t.id, t.name, h.id AS hall_id, h.name AS hall_name,
              COALESCE(paid.orders, 0) AS orders, COALESCE(paid.revenue, 0) AS revenue,
              COALESCE(paid.guests, 0) AS guests, COALESCE(ROUND(paid.minutes), 0)::int AS minutes,
              COALESCE(pending.orders, 0) AS pending_orders, COALESCE(pending.amount, 0) AS pending
         FROM dining_tables t
         JOIN halls h ON h.id = t.hall_id
         LEFT JOIN paid ON paid.table_id = t.id
         LEFT JOIN pending ON pending.table_id = t.id
        WHERE (paid.table_id IS NOT NULL OR pending.table_id IS NOT NULL) ${hall}
        ORDER BY revenue DESC, pending DESC, t.name`,
      s.params,
    );
    return rows.map((row) => ({
      tableId: num(row.id),
      tableName: String(row.name),
      hallId: num(row.hall_id),
      hallName: String(row.hall_name),
      ordersCount: num(row.orders),
      revenue: num(row.revenue),
      guests: num(row.guests),
      averageMinutes: num(row.minutes),
      pendingCount: num(row.pending_orders),
      pending: num(row.pending),
    }));
  }

  // ────────────────────────────── Employees ──────────────────────────────

  /**
   * Per waiter: revenue, revenue without the service charge, the service
   * base (dine-in sales), the service charge and the waiter's share — for
   * paid orders and, separately, for orders still waiting for payment (their
   * share uses today's rate `currentRate`, paid ones the snapshotted one).
   */
  async employees(scope: Scope, currentRate: number) {
    const s = this.scoped(scope);
    const rate = s.bind(currentRate);
    const rows = await this.query<Row>(
      `WITH scoped AS (
         SELECT o.waiter_id, o.status, o.total, o.service_amount,
                ${SERVICE_BASE} AS base,
                CASE WHEN o.status = 'PAID' THEN o.waiter_percent ELSE ${rate}::numeric END AS rate
           FROM orders o
          WHERE (${s.paid}) OR (${s.pending})
       )
       SELECT s.waiter_id, u.full_name, r.name AS role_name,
              COUNT(*) FILTER (WHERE s.status = 'PAID')::int AS orders,
              COALESCE(SUM(s.total) FILTER (WHERE s.status = 'PAID'), 0) AS revenue,
              COALESCE(SUM(s.total - s.service_amount) FILTER (WHERE s.status = 'PAID'), 0) AS net,
              COALESCE(SUM(s.base) FILTER (WHERE s.status = 'PAID'), 0) AS base,
              COALESCE(SUM(s.service_amount) FILTER (WHERE s.status = 'PAID'), 0) AS service,
              COALESCE(SUM(ROUND(s.base * s.rate / 100, 2)) FILTER (WHERE s.status = 'PAID'), 0) AS share,
              COUNT(*) FILTER (WHERE s.status = 'OPEN')::int AS p_orders,
              COALESCE(SUM(s.total) FILTER (WHERE s.status = 'OPEN'), 0) AS p_revenue,
              COALESCE(SUM(s.total - s.service_amount) FILTER (WHERE s.status = 'OPEN'), 0) AS p_net,
              COALESCE(SUM(s.base) FILTER (WHERE s.status = 'OPEN'), 0) AS p_base,
              COALESCE(SUM(s.service_amount) FILTER (WHERE s.status = 'OPEN'), 0) AS p_service,
              COALESCE(SUM(ROUND(s.base * s.rate / 100, 2)) FILTER (WHERE s.status = 'OPEN'), 0) AS p_share
         FROM scoped s
         LEFT JOIN users u ON u.id = s.waiter_id
         LEFT JOIN roles r ON r.id = u.role_id
        GROUP BY s.waiter_id, u.full_name, r.name
        ORDER BY share DESC, revenue DESC, u.full_name NULLS LAST`,
      s.params,
    );
    const figures = (row: Row, prefix: '' | 'p_') => ({
      ordersCount: num(row[`${prefix}orders`]),
      revenue: num(row[`${prefix}revenue`]),
      net: num(row[`${prefix}net`]),
      base: num(row[`${prefix}base`]),
      service: num(row[`${prefix}service`]),
      share: num(row[`${prefix}share`]),
    });
    return rows.map((row) => ({
      userId: row.waiter_id === null ? null : num(row.waiter_id),
      fullName: str(row.full_name),
      roleName: str(row.role_name),
      ...figures(row, ''),
      pending: figures(row, 'p_'),
    }));
  }

  /**
   * The orders behind one row of `employees`: the same paid + pending orders
   * of the waiter (or of no waiter), newest first, each with its active lines
   * — the bills shown when the row is clicked. Paid orders are dated by their
   * closing, pending ones by their opening, as the report itself counts them.
   */
  async employeeOrders(
    scope: Scope,
    waiterId: number | null,
    page: number,
    limit: number,
  ) {
    const s = this.scoped(scope);
    const waiter =
      waiterId === null
        ? `o.waiter_id IS NULL`
        : `o.waiter_id = ${s.bind(waiterId)}`;
    const where = `((${s.paid}) OR (${s.pending})) AND ${waiter}`;
    const [totals] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE o.status = 'PAID')::int AS paid,
              COUNT(*) FILTER (WHERE o.status = 'OPEN')::int AS open,
              COALESCE(SUM(o.total) FILTER (WHERE o.status = 'PAID'), 0) AS revenue,
              COALESCE(SUM(o.total) FILTER (WHERE o.status = 'OPEN'), 0) AS pending
         FROM orders o WHERE ${where}`,
      s.params,
    );
    const rows = await this.query<Row>(
      `SELECT o.id, o.number, o.type, o.status, o.created_at, o.closed_at, o.guests,
              o.subtotal, o.discount_amount, o.service_percent, o.service_amount,
              o.delivery_fee, o.total, t.name AS table_name, h.name AS hall_name,
              COALESCE((SELECT json_agg(json_build_object(
                                 'id', i.id, 'name', i.name, 'unit', i.unit,
                                 'quantity', i.quantity, 'price', i.price, 'total', i.total)
                                ORDER BY i.created_at, i.id)
                          FROM order_items i
                         WHERE i.order_id = o.id AND i.status = 'ACTIVE'), '[]'::json) AS lines
         FROM orders o
         LEFT JOIN dining_tables t ON t.id = o.table_id
         LEFT JOIN halls h ON h.id = t.hall_id
        WHERE ${where}
        ORDER BY COALESCE(o.closed_at, o.created_at) DESC, o.id DESC
        LIMIT ${s.bind(limit)} OFFSET ${s.bind((page - 1) * limit)}`,
      s.params,
    );
    return {
      total: num(totals?.count),
      totals: {
        ordersCount: num(totals?.paid),
        revenue: num(totals?.revenue),
        pendingCount: num(totals?.open),
        pending: num(totals?.pending),
      },
      items: rows.map((row) => ({
        id: num(row.id),
        number: num(row.number),
        type: row.type as OrderType,
        status: row.status as OrderStatus,
        table:
          row.table_name === null
            ? null
            : { name: str(row.table_name) ?? '', hallName: str(row.hall_name) },
        guests: row.guests === null ? null : num(row.guests),
        /** When the bill counts in the report: paid at closing, pending at opening. */
        at: ((row.closed_at as Date | null) ?? row.created_at) as Date,
        subtotal: num(row.subtotal),
        discountAmount: num(row.discount_amount),
        servicePercent: num(row.service_percent),
        serviceAmount: num(row.service_amount),
        deliveryFee: num(row.delivery_fee),
        total: num(row.total),
        lines: (
          row.lines as {
            id: number;
            name: string;
            unit: string;
            quantity: unknown;
            price: unknown;
            total: unknown;
          }[]
        ).map((line) => ({
          id: num(line.id),
          name: line.name,
          unit: line.unit,
          quantity: num(line.quantity),
          price: num(line.price),
          total: num(line.total),
        })),
      })),
    };
  }

  // ────────────────────────────── Cashiers ──────────────────────────────

  /** Money taken by each cashier in the period, by method type. */
  async cashiers(scope: Scope) {
    const s = this.scoped(scope);
    const rows = await this.query<Row>(
      `WITH per_order AS (
         SELECT p.cashier_id, p.order_id, SUM(p.amount) AS net, ${BY_KIND}
           FROM payments p JOIN payment_methods m ON m.id = p.method_id
          WHERE ${s.payments}
          GROUP BY p.cashier_id, p.order_id
       )
       SELECT po.cashier_id, u.full_name,
              COUNT(*) FILTER (WHERE po.net > 0)::int AS payments,
              SUM(po.net) AS revenue, SUM(po.cash) AS cash, SUM(po.card) AS card,
              SUM(po.transfer) AS transfer, SUM(po.other) AS other
         FROM per_order po JOIN users u ON u.id = po.cashier_id
        GROUP BY po.cashier_id, u.full_name
        ORDER BY revenue DESC, u.full_name`,
      s.params,
    );
    return rows.map((row) => ({
      cashierId: num(row.cashier_id),
      fullName: String(row.full_name),
      paymentsCount: num(row.payments),
      revenue: num(row.revenue),
      ...byKind(row),
    }));
  }

  // ─────────────────────────────── Shifts ───────────────────────────────

  /** Header of a shift report: which shift it is and who ran it. */
  async shiftById(id: number) {
    const [row] = await this.query<Row>(
      `SELECT s.id, s.status, s.opened_at, s.closed_at,
              ob.full_name AS opened_by, cb.full_name AS closed_by
         FROM shifts s
         JOIN users ob ON ob.id = s.opened_by_id
         LEFT JOIN users cb ON cb.id = s.closed_by_id
        WHERE s.id = $1`,
      [id],
    );
    if (!row) return null;
    return {
      id: num(row.id),
      status: String(row.status),
      openedAt: row.opened_at as Date,
      closedAt: (row.closed_at as Date | null) ?? null,
      openedBy: String(row.opened_by),
      closedBy: str(row.closed_by),
    };
  }

  /**
   * Shifts of the period: those open at any moment of it (`overlap`, what the
   * period report shows) or those opened / closed inside it — the two choices
   * of "Фильтр по времени" when picking a shift.
   */
  async shifts(range: Range, filter: ShiftsFilter = {}) {
    const params: unknown[] = [range.from, range.until, range.tz];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const period =
      filter.dateField === 'opened'
        ? inLocalRange('s.opened_at', 1, 2, 3)
        : filter.dateField === 'closed'
          ? inLocalRange('s.closed_at', 1, 2, 3)
          : `s.opened_at < ($2::timestamp AT TIME ZONE $3)
             AND (s.closed_at IS NULL OR s.closed_at >= ($1::timestamp AT TIME ZONE $3))`;
    // The cashier of a shift is the person who opened it.
    const cashier = filter.cashierId
      ? `AND s.opened_by_id = ${bind(filter.cashierId)}`
      : '';
    const shifts = await this.query<Row>(
      `SELECT s.id, s.status, s.opened_at, s.closed_at, s.opening_cash, s.closing_cash,
              s.expected_cash, ob.id AS opened_by_id, ob.full_name AS opened_by,
              cb.full_name AS closed_by
         FROM shifts s
         JOIN users ob ON ob.id = s.opened_by_id
         LEFT JOIN users cb ON cb.id = s.closed_by_id
        WHERE (${period}) ${cashier}
        ORDER BY s.opened_at DESC`,
      params,
    );
    const ids = shifts.map((shift) => num(shift.id));
    if (!ids.length) return [];
    const money = await this.query<Row>(
      `WITH per_order AS (
         SELECT p.shift_id, p.order_id, SUM(p.amount) AS net, ${BY_KIND}
           FROM payments p JOIN payment_methods m ON m.id = p.method_id
          WHERE p.shift_id = ANY($1::int[])
          GROUP BY p.shift_id, p.order_id
       )
       SELECT shift_id, COUNT(*) FILTER (WHERE net > 0)::int AS payments,
              SUM(net) AS revenue, SUM(cash) AS cash, SUM(card) AS card,
              SUM(transfer) AS transfer, SUM(other) AS other
         FROM per_order GROUP BY shift_id`,
      [ids],
    );
    const orders = await this.query<Row>(
      `SELECT shift_id,
              COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid,
              COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open,
              COALESCE(SUM(total) FILTER (WHERE status = 'OPEN'), 0) AS pending
         FROM orders WHERE shift_id = ANY($1::int[])
        GROUP BY shift_id`,
      [ids],
    );
    const moneyBy = new Map(money.map((row) => [num(row.shift_id), row]));
    const ordersBy = new Map(orders.map((row) => [num(row.shift_id), row]));
    return shifts.map((shift) => {
      const id = num(shift.id);
      const cash = moneyBy.get(id) ?? {};
      const counts = ordersBy.get(id) ?? {};
      return {
        id,
        status: String(shift.status),
        openedAt: shift.opened_at as Date,
        closedAt: (shift.closed_at as Date | null) ?? null,
        openedById: num(shift.opened_by_id),
        openedBy: String(shift.opened_by),
        closedBy: str(shift.closed_by),
        openingCash: num(shift.opening_cash),
        expectedCash:
          shift.expected_cash === null ? null : num(shift.expected_cash),
        countedCash:
          shift.closing_cash === null ? null : num(shift.closing_cash),
        paymentsCount: num(cash.payments),
        ordersCount: num(counts.paid),
        revenue: num(cash.revenue),
        ...byKind(cash),
        pendingCount: num(counts.open),
        pending: num(counts.pending),
      };
    });
  }

  // ─────────────────────────────── Dishes ───────────────────────────────

  async dishes(
    scope: Scope,
    filter: {
      categoryId?: number;
      search?: string;
      sortBy: DishReportSort;
      sortOrder: 'ASC' | 'DESC';
      page: number;
      limit: number;
    },
  ) {
    const s = this.scoped(scope);
    const { params, bind } = s;
    const lineFilter = filter.categoryId
      ? `WHERE l.category_id = ${bind(filter.categoryId)}`
      : '';
    const dishFilter = filter.search
      ? `WHERE d.name ILIKE ${bind(likeContains(filter.search))}`
      : '';
    const grouped = `
      WITH lines AS (${s.itemLines}),
      grouped AS (SELECT l.dish_id, ${LINE_SUMS} FROM lines l ${lineFilter} GROUP BY l.dish_id)
      SELECT g.*, d.name, d.unit, c.name AS category_name
        FROM grouped g
        JOIN dishes d ON d.id = g.dish_id
        LEFT JOIN dish_categories c ON c.id = d.category_id
        ${dishFilter}`;
    const [totals] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE x.revenue > 0 OR x.quantity > 0)::int AS sold,
              COUNT(*) FILTER (WHERE x.pending_quantity > 0)::int AS pending_dishes,
              COALESCE(SUM(x.quantity), 0) AS quantity, COALESCE(SUM(x.revenue), 0) AS revenue,
              COALESCE(SUM(x.cost), 0) AS cost,
              COALESCE(SUM(x.pending_quantity), 0) AS pending_quantity,
              COALESCE(SUM(x.pending_revenue), 0) AS pending_revenue,
              COALESCE(SUM(x.cancelled_quantity), 0) AS cancelled_quantity,
              COALESCE(SUM(x.cancelled_amount), 0) AS cancelled_amount
         FROM (${grouped}) x`,
      params,
    );
    const direction = filter.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const order: Record<DishReportSort, string> = {
      quantity: `x.quantity ${direction}, x.revenue ${direction}`,
      revenue: `x.revenue ${direction}`,
      profit: `(x.revenue - x.cost) ${direction}`,
      name: `x.name ${direction}`,
      pending: `x.pending_revenue ${direction}`,
      cancelled: `x.cancelled_amount ${direction}`,
    };
    const rows = await this.query<Row>(
      `SELECT * FROM (${grouped}) x
        ORDER BY ${order[filter.sortBy]}, x.name, x.dish_id
        LIMIT ${bind(filter.limit)} OFFSET ${bind((filter.page - 1) * filter.limit)}`,
      params,
    );
    return {
      total: num(totals?.count),
      totals: {
        dishesCount: num(totals?.count),
        soldDishes: num(totals?.sold),
        pendingDishes: num(totals?.pending_dishes),
        quantity: num(totals?.quantity),
        revenue: num(totals?.revenue),
        cost: num(totals?.cost),
        pendingQuantity: num(totals?.pending_quantity),
        pendingRevenue: num(totals?.pending_revenue),
        cancelledQuantity: num(totals?.cancelled_quantity),
        cancelledAmount: num(totals?.cancelled_amount),
      },
      items: rows.map((row) => ({
        dishId: num(row.dish_id),
        name: String(row.name),
        categoryName: str(row.category_name),
        unit: String(row.unit),
        quantity: num(row.quantity),
        revenue: num(row.revenue),
        cost: num(row.cost),
        pendingQuantity: num(row.pending_quantity),
        pendingRevenue: num(row.pending_revenue),
        cancelledQuantity: num(row.cancelled_quantity),
        cancelledAmount: num(row.cancelled_amount),
      })),
    };
  }

  // ───────────────────────────── Categories ─────────────────────────────

  /**
   * Every line of one dish behind its row in `dishes` — paid, still pending
   * and cancelled, from the very same `itemLines` (and the same category
   * filter), so the history always adds up to the row. Newest first.
   */
  async dishHistory(
    scope: Scope,
    dishId: number,
    categoryId: number | undefined,
    page: number,
    limit: number,
  ) {
    const s = this.scoped(scope);
    const category = categoryId
      ? `AND l.category_id = ${s.bind(categoryId)}`
      : '';
    const mine = `
      WITH lines AS (${s.itemLines}),
      mine AS (SELECT l.* FROM lines l WHERE l.dish_id = ${s.bind(dishId)} ${category})`;
    const [totals] = await this.query<Row>(
      `${mine} SELECT COUNT(*)::int AS count, ${LINE_SUMS} FROM mine l`,
      s.params,
    );
    const rows = await this.query<Row>(
      `${mine}
       SELECT l.kind, i.id, i.quantity, i.unit, i.total, i.created_at,
              i.cancelled_at, i.cancel_reason,
              o.id AS order_id, o.number, o.type,
              t.name AS table_name, h.name AS hall_name,
              ab.full_name AS added_by, w.full_name AS waiter_name,
              xb.full_name AS cancelled_by
         FROM mine l
         JOIN order_items i ON i.id = l.id
         JOIN orders o ON o.id = i.order_id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         LEFT JOIN halls h ON h.id = t.hall_id
         LEFT JOIN users ab ON ab.id = i.created_by_id
         LEFT JOIN users w ON w.id = o.waiter_id
         LEFT JOIN users xb ON xb.id = i.cancelled_by_id
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT ${s.bind(limit)} OFFSET ${s.bind((page - 1) * limit)}`,
      s.params,
    );
    return {
      total: num(totals?.count),
      totals: {
        quantity: num(totals?.quantity),
        revenue: num(totals?.revenue),
        pendingQuantity: num(totals?.pending_quantity),
        pendingRevenue: num(totals?.pending_revenue),
        cancelledQuantity: num(totals?.cancelled_quantity),
        cancelledAmount: num(totals?.cancelled_amount),
      },
      items: rows.map((row) => ({
        id: num(row.id),
        kind: row.kind as 'paid' | 'pending' | 'cancelled',
        createdAt: row.created_at as Date,
        cancelledAt: (row.cancelled_at as Date | null) ?? null,
        cancelReason: str(row.cancel_reason),
        cancelledBy: str(row.cancelled_by),
        orderId: num(row.order_id),
        orderNumber: num(row.number),
        orderType: row.type as OrderType,
        table:
          row.table_name === null
            ? null
            : { name: str(row.table_name) ?? '', hallName: str(row.hall_name) },
        addedBy: str(row.added_by),
        waiter: str(row.waiter_name),
        unit: String(row.unit),
        quantity: num(row.quantity),
        total: num(row.total),
      })),
    };
  }

  /** Categories as they were when the dish was ordered (line snapshot). */
  async categories(scope: Scope) {
    const s = this.scoped(scope);
    const rows = await this.query<Row>(
      `WITH lines AS (${s.itemLines})
       SELECT ${CATEGORY_ID} AS id, ${CATEGORY_NAME} AS name, ${LINE_SUMS},
              COUNT(DISTINCT l.dish_id) FILTER (WHERE l.kind = 'paid')::int AS dishes
         FROM lines l LEFT JOIN dish_categories c ON c.id = l.category_id
        GROUP BY 1, 2
       HAVING COUNT(*) FILTER (WHERE l.kind <> 'cancelled') > 0
        ORDER BY revenue DESC, pending_revenue DESC, name`,
      s.params,
    );
    return rows.map((row) => ({
      categoryId: row.id === null ? null : num(row.id),
      name: String(row.name),
      quantity: num(row.quantity),
      revenue: num(row.revenue),
      cost: num(row.cost),
      pendingQuantity: num(row.pending_quantity),
      pendingRevenue: num(row.pending_revenue),
      dishesCount: num(row.dishes),
    }));
  }

  /** Dishes of one or every category: drill-down and the printed sheet. */
  async categoryDishes(scope: Scope, categoryId?: number) {
    const s = this.scoped(scope);
    const only = categoryId ? `AND ${CATEGORY_ID} = ${s.bind(categoryId)}` : '';
    const rows = await this.query<Row>(
      `WITH lines AS (${s.itemLines})
       SELECT ${CATEGORY_ID} AS category_id, ${CATEGORY_NAME} AS category_name,
              d.id AS dish_id, d.name, d.unit, ${LINE_SUMS}
         FROM lines l
         JOIN dishes d ON d.id = l.dish_id
         LEFT JOIN dish_categories c ON c.id = l.category_id
        WHERE l.kind <> 'cancelled' ${only}
        GROUP BY 1, 2, d.id, d.name, d.unit
        ORDER BY quantity DESC, pending_quantity DESC, d.name`,
      s.params,
    );
    return rows.map((row) => ({
      categoryId: row.category_id === null ? null : num(row.category_id),
      categoryName: String(row.category_name),
      dishId: num(row.dish_id),
      name: String(row.name),
      unit: String(row.unit),
      quantity: num(row.quantity),
      revenue: num(row.revenue),
      pendingQuantity: num(row.pending_quantity),
      pendingRevenue: num(row.pending_revenue),
    }));
  }

  // ──────────────────────────── Cancellations ────────────────────────────

  async cancellations(
    scope: Scope,
    filter: {
      scope: 'all' | 'items' | 'orders';
      userId?: number;
      waiterId?: number;
      sortBy: CancellationSort;
      sortOrder: 'ASC' | 'DESC';
      page: number;
      limit: number;
    },
  ) {
    const s = this.scoped(scope);
    const { params, bind } = s;
    const where = [`i.status = 'CANCELLED'`, s.cancelledItems];
    if (filter.scope === 'items') where.push(`o.status <> 'CANCELLED'`);
    if (filter.scope === 'orders') where.push(`o.status = 'CANCELLED'`);
    if (filter.userId) where.push(`i.cancelled_by_id = ${bind(filter.userId)}`);
    if (filter.waiterId) where.push(`o.waiter_id = ${bind(filter.waiterId)}`);
    const from = `FROM order_items i
         JOIN orders o ON o.id = i.order_id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         LEFT JOIN users cu ON cu.id = i.cancelled_by_id
         LEFT JOIN users w ON w.id = o.waiter_id
        WHERE ${where.join(' AND ')}`;
    const [totals] = await this.query<Row>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(i.quantity), 0) AS quantity,
              COALESCE(SUM(i.total), 0) AS amount, COUNT(DISTINCT o.id)::int AS orders
         ${from}`,
      params,
    );
    const direction = filter.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const order: Record<CancellationSort, string> = {
      cancelledAt: `i.cancelled_at ${direction}`,
      orderNumber: `o.business_date ${direction}, o.number ${direction}`,
      name: `i.name ${direction}`,
      quantity: `i.quantity ${direction}`,
      price: `i.price ${direction}`,
      amount: `i.total ${direction}`,
    };
    const rows = await this.query<Row>(
      `SELECT i.id, i.cancelled_at, i.name, i.quantity, i.unit, i.price, i.total, i.cancel_reason,
              i.stock_returned, o.id AS order_id, o.number AS order_number,
              o.business_date::text AS business_date, o.type AS order_type,
              o.status AS order_status, t.name AS table_name,
              cu.full_name AS cancelled_by, w.full_name AS waiter
         ${from}
        ORDER BY ${order[filter.sortBy]}, i.id DESC
        LIMIT ${bind(filter.limit)} OFFSET ${bind((filter.page - 1) * filter.limit)}`,
      params,
    );
    return {
      total: num(totals?.count),
      totals: {
        lines: num(totals?.count),
        quantity: num(totals?.quantity),
        amount: num(totals?.amount),
        orders: num(totals?.orders),
      },
      items: rows.map((row) => ({
        id: num(row.id),
        cancelledAt: row.cancelled_at as Date,
        name: String(row.name),
        quantity: num(row.quantity),
        unit: String(row.unit),
        price: num(row.price),
        amount: num(row.total),
        reason: str(row.cancel_reason),
        stockReturned:
          row.stock_returned === null ? null : Boolean(row.stock_returned),
        orderId: num(row.order_id),
        orderNumber: num(row.order_number),
        orderDate: String(row.business_date),
        orderType: row.order_type as OrderType,
        orderCancelled: row.order_status === 'CANCELLED',
        tableName: str(row.table_name),
        cancelledBy: str(row.cancelled_by),
        waiter: str(row.waiter),
      })),
    };
  }
}
