import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  DISH_UNIT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from '../../common/constants/labels';
import { DishUnit, OrderType } from '../../common/constants/enums';
import { paginated } from '../../common/types/paginated';
import { resolveDateRange } from '../../common/utils/date-range';
import {
  formatDateTimeInZone,
  minuteInTimeZone,
} from '../../common/utils/dates';
import { money, subMoney, sumMoney } from '../../common/utils/money';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import type {
  CancellationsReportQueryDto,
  CategoryDishesQueryDto,
  DishesReportQueryDto,
  DishHistoryQueryDto,
  EmployeeOrdersQueryDto,
  OrdersReportQueryDto,
  ReportKind,
  ReportRangeQueryDto,
  ShiftsReportQueryDto,
  TablesReportQueryDto,
} from './dto/reports.dto';
import { ReportExcelService, type SheetSpec } from './report-excel.service';
import {
  type Range,
  rangeScope,
  ReportsRepository,
  type Scope,
  shiftScope,
} from './repo/reports.repository';

/** Which shift a shift-scoped report covers. */
type ShiftHeader = NonNullable<
  Awaited<ReturnType<ReportsRepository['shiftById']>>
>;

const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0;
/** Averages are shown in whole so'm. */
const avg = (sum: number, count: number) =>
  count > 0 ? Math.round(sum / count) : 0;
const EXPORT_LIMIT = 20000;
const ORDER_TYPES: OrderType[] = [
  OrderType.Table,
  OrderType.Takeaway,
  OrderType.Delivery,
  OrderType.Hall,
];

const sumBy = <T>(rows: readonly T[], pick: (row: T) => number) =>
  sumMoney(rows.map(pick));

/** Money columns of the cash reports: cash, card, transfer, other. */
const kindTotals = <
  T extends { cash: number; card: number; transfer: number; other: number },
>(
  rows: readonly T[],
) => ({
  cash: sumBy(rows, (row) => row.cash),
  card: sumBy(rows, (row) => row.card),
  transfer: sumBy(rows, (row) => row.transfer),
  other: sumBy(rows, (row) => row.other),
});

@Injectable()
export class ReportsService {
  private readonly timeZone: string;

  constructor(
    private readonly repo: ReportsRepository,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly excel: ReportExcelService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<AppConfig>('app').timezone;
  }

  private range(query: ReportRangeQueryDto): Range & { to: string } {
    const range = resolveDateRange(query, this.timeZone, 366);
    return { ...range, tz: this.timeZone };
  }

  /**
   * What the request asks for: a period, or one shift ("Отчёт по сменам").
   * The answer carries the bounds to echo back — for a shift, the hours it
   * actually ran — so every report states the period it covers the same way.
   */
  private async resolveScope(query: ReportRangeQueryDto): Promise<{
    scope: Scope;
    period: { from: string; to: string; shift: ShiftHeader | null };
  }> {
    if (query.shiftId === undefined) {
      const range = this.range(query);
      return {
        scope: rangeScope(range),
        period: { from: range.from, to: range.to, shift: null },
      };
    }
    const shift = await this.repo.shiftById(query.shiftId);
    if (!shift) throw new NotFoundException('Смена не найдена');
    const minute = (value: Date) => minuteInTimeZone(value, this.timeZone);
    return {
      scope: shiftScope(shift.id),
      period: {
        from: minute(shift.openedAt),
        // An open shift is still running: show it up to now.
        to: minute(shift.closedAt ?? new Date()),
        shift,
      },
    };
  }

  /** Rates shown in column titles ("Без 10%", "Доля 6%"). */
  private async rates() {
    const settings = await this.settings.get();
    return {
      service: settings.serviceChargePercent,
      waiter: settings.waiterCommissionPercent,
    };
  }

  // ─────────────────────────────── Reports ───────────────────────────────

  async summary(query: ReportRangeQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const rates = await this.rates();
    const [totals, paymentMethods, byType, topDishes, employees] =
      await Promise.all([
        this.repo.totals(scope),
        this.repo.paymentMethods(scope),
        this.repo.byType(scope),
        this.repo.topDishes(scope),
        this.repo.employees(scope, rates.waiter),
      ]);
    const netSales = subMoney(totals.subtotal, totals.discounts);
    return {
      ...period,
      percent: rates,
      paymentMethods,
      totals: {
        ...totals,
        collected: sumBy(paymentMethods, (method) => method.amount),
        averageCheck: avg(totals.revenue, totals.ordersCount),
        netSales,
        grossProfit: subMoney(netSales, totals.itemsCost),
      },
      byType: ORDER_TYPES.map((type) => ({
        type,
        count: byType.get(type)?.count ?? 0,
        amount: byType.get(type)?.amount ?? 0,
      })),
      topDishes,
      waiters: employees
        .filter((row) => row.ordersCount > 0)
        .map((row) => ({
          userId: row.userId,
          fullName: row.fullName,
          ordersCount: row.ordersCount,
          share: row.share,
        })),
    };
  }

  async ordersReport(query: OrdersReportQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const result = await this.repo.orders(scope, {
      dateField: query.dateField,
      status: query.status,
      type: query.type,
      tableId: query.tableId,
      hallId: query.hallId,
      waiterId: query.waiterId,
      methodId: query.methodId,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    });
    const offset = (query.page - 1) * query.limit;
    return {
      ...period,
      dateField: query.dateField,
      ...paginated(
        result.items.map((item, index) => ({
          position: offset + index + 1,
          ...item,
        })),
        result.total,
        query.page,
        query.limit,
      ),
      totals: result.totals,
      paymentMethods: result.paymentMethods,
    };
  }

  /** Full order for the report's receipt print (viewers may lack POS access). */
  orderDetail(id: number) {
    return this.orders.getDetail(id);
  }

  async tables(query: TablesReportQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const items = await this.repo.tables(scope, query.hallId);
    const revenue = sumBy(items, (item) => item.revenue);
    const ordersCount = items.reduce((sum, item) => sum + item.ordersCount, 0);
    return {
      ...period,
      items: items.map((item) => ({
        ...item,
        averageCheck: avg(item.revenue, item.ordersCount),
        share: share(item.revenue, revenue),
      })),
      totals: {
        tablesCount: items.length,
        ordersCount,
        revenue,
        guests: items.reduce((sum, item) => sum + item.guests, 0),
        averageCheck: avg(revenue, ordersCount),
        pendingCount: items.reduce((sum, item) => sum + item.pendingCount, 0),
        pending: sumBy(items, (item) => item.pending),
      },
    };
  }

  async employees(query: ReportRangeQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const rates = await this.rates();
    const items = await this.repo.employees(scope, rates.waiter);
    const figures = (
      pick: (row: (typeof items)[number]) => {
        ordersCount: number;
        revenue: number;
        net: number;
        base: number;
        service: number;
        share: number;
      },
    ) => ({
      ordersCount: items.reduce((sum, row) => sum + pick(row).ordersCount, 0),
      revenue: sumBy(items, (row) => pick(row).revenue),
      net: sumBy(items, (row) => pick(row).net),
      base: sumBy(items, (row) => pick(row).base),
      service: sumBy(items, (row) => pick(row).service),
      share: sumBy(items, (row) => pick(row).share),
    });
    return {
      ...period,
      percent: rates,
      items,
      totals: {
        ...figures((row) => row),
        pending: figures((row) => row.pending),
      },
    };
  }

  /** Every line behind one row of «По блюдам», a page at a time. */
  async dishHistory(query: DishHistoryQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const result = await this.repo.dishHistory(
      scope,
      query.dishId,
      query.categoryId,
      query.page,
      query.limit,
    );
    return {
      ...period,
      ...paginated(result.items, result.total, query.page, query.limit),
      totals: result.totals,
    };
  }

  /** The bills behind one row of «По сотрудникам», a page at a time. */
  async employeeOrders(query: EmployeeOrdersQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const waiterId = query.waiter === 'none' ? null : Number(query.waiter);
    const result = await this.repo.employeeOrders(
      scope,
      waiterId,
      query.page,
      query.limit,
    );
    return {
      ...period,
      ...paginated(result.items, result.total, query.page, query.limit),
      totals: result.totals,
    };
  }

  async cashiers(query: ReportRangeQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const items = await this.repo.cashiers(scope);
    return {
      ...period,
      items,
      totals: {
        paymentsCount: items.reduce((sum, item) => sum + item.paymentsCount, 0),
        revenue: sumBy(items, (item) => item.revenue),
        ...kindTotals(items),
      },
    };
  }

  async shifts(query: ShiftsReportQueryDto) {
    const range = this.range(query);
    const shifts = await this.repo.shifts(range, {
      dateField: query.dateField,
      cashierId: query.cashierId,
    });
    const items = shifts.map((shift) => ({
      ...shift,
      difference:
        shift.expectedCash !== null && shift.countedCash !== null
          ? subMoney(shift.countedCash, shift.expectedCash)
          : null,
    }));
    return {
      from: range.from,
      to: range.to,
      shift: null,
      items,
      totals: {
        paymentsCount: items.reduce((sum, item) => sum + item.paymentsCount, 0),
        ordersCount: items.reduce((sum, item) => sum + item.ordersCount, 0),
        revenue: sumBy(items, (item) => item.revenue),
        pending: sumBy(items, (item) => item.pending),
        pendingCount: items.reduce((sum, item) => sum + item.pendingCount, 0),
        ...kindTotals(items),
      },
    };
  }

  async dishes(query: DishesReportQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const result = await this.repo.dishes(scope, {
      categoryId: query.categoryId,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    });
    const offset = (query.page - 1) * query.limit;
    return {
      ...period,
      ...paginated(
        result.items.map((item, index) => ({
          position: offset + index + 1,
          ...item,
          averagePrice: item.quantity ? money(item.revenue / item.quantity) : 0,
          profit: subMoney(item.revenue, item.cost),
          share: share(item.revenue, result.totals.revenue),
        })),
        result.total,
        query.page,
        query.limit,
      ),
      totals: {
        ...result.totals,
        profit: subMoney(result.totals.revenue, result.totals.cost),
      },
    };
  }

  async categories(query: ReportRangeQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const items = await this.repo.categories(scope);
    const revenue = sumBy(items, (item) => item.revenue);
    return {
      ...period,
      items: items.map((item) => ({
        ...item,
        profit: subMoney(item.revenue, item.cost),
        share: share(item.revenue, revenue),
      })),
      totals: {
        categoriesCount: items.length,
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        revenue,
        cost: sumBy(items, (item) => item.cost),
        pendingQuantity: items.reduce(
          (sum, item) => sum + item.pendingQuantity,
          0,
        ),
        pendingRevenue: sumBy(items, (item) => item.pendingRevenue),
      },
    };
  }

  /** Dishes grouped by category — the "eye" drill-down and the printed sheet. */
  async categoryDishes(query: CategoryDishesQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const rows = await this.repo.categoryDishes(scope, query.categoryId);
    const groups = new Map<
      string,
      {
        categoryId: number | null;
        name: string;
        dishes: Omit<(typeof rows)[number], 'categoryId' | 'categoryName'>[];
      }
    >();
    for (const { categoryId, categoryName, ...dish } of rows) {
      const key = `${categoryId ?? 'none'}:${categoryName}`;
      const group = groups.get(key) ?? {
        categoryId,
        name: categoryName,
        dishes: [],
      };
      group.dishes.push(dish);
      groups.set(key, group);
    }
    const categories = [...groups.values()]
      .map((group) => ({
        ...group,
        quantity: group.dishes.reduce((sum, dish) => sum + dish.quantity, 0),
        revenue: sumBy(group.dishes, (dish) => dish.revenue),
        pendingQuantity: group.dishes.reduce(
          (sum, dish) => sum + dish.pendingQuantity,
          0,
        ),
        pendingRevenue: sumBy(group.dishes, (dish) => dish.pendingRevenue),
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.pendingRevenue - a.pendingRevenue ||
          a.name.localeCompare(b.name, 'ru'),
      );
    return {
      ...period,
      categories,
      totals: {
        quantity: categories.reduce((sum, group) => sum + group.quantity, 0),
        revenue: sumBy(categories, (group) => group.revenue),
        pendingRevenue: sumBy(categories, (group) => group.pendingRevenue),
      },
    };
  }

  async cancellations(query: CancellationsReportQueryDto) {
    const { scope, period } = await this.resolveScope(query);
    const result = await this.repo.cancellations(scope, {
      scope: query.scope,
      userId: query.userId,
      waiterId: query.waiterId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    });
    const offset = (query.page - 1) * query.limit;
    return {
      ...period,
      ...paginated(
        result.items.map((item, index) => ({
          position: offset + index + 1,
          ...item,
        })),
        result.total,
        query.page,
        query.limit,
      ),
      totals: result.totals,
    };
  }

  // ─────────────────────────────── Export ───────────────────────────────

  async export(kind: ReportKind, query: Record<string, unknown>) {
    const { period } = await this.resolveScope(query);
    const label = (value: string) =>
      formatDateTimeInZone(
        new Date(`${value}:00Z`),
        'UTC', // already local wall-clock time
      );
    const subtitle = period.shift
      ? `Смена №${period.shift.id} · ${period.shift.openedBy} · ${label(period.from)} — ${label(period.to)}`
      : `Период: ${label(period.from)} — ${label(period.to)}`;
    const dt = (value: unknown) =>
      formatDateTimeInZone(value as Date | string | null, this.timeZone);
    const all = { ...query, page: 1, limit: EXPORT_LIMIT };
    const kinds = [
      { header: 'Наличными', key: 'cash', kind: 'money' as const },
      { header: 'Картой', key: 'card', kind: 'money' as const },
      { header: 'Переводом', key: 'transfer', kind: 'money' as const },
      { header: 'Другое', key: 'other', kind: 'money' as const },
    ];
    let sheets: SheetSpec[];

    switch (kind) {
      case 'summary': {
        const data = await this.summary(query);
        const t = data.totals;
        // A shift runs for hours, not days: the per-day sheet is a period thing.
        const byDay = period.shift
          ? []
          : await this.repo.byDay(this.range(query));
        sheets = [
          {
            name: 'Итоговый',
            title: 'Итоговый отчёт',
            subtitle,
            columns: [
              { header: 'Показатель', key: 'label', width: 34 },
              { header: 'Значение', key: 'value', width: 20, kind: 'money' },
            ],
            rows: [
              { label: 'Оплачено (по способам оплаты)', value: t.collected },
              { label: 'Ожидает оплаты', value: t.pending.amount },
              { label: 'Выручка (оплаченные заказы)', value: t.revenue },
              { label: 'Количество заказов', value: t.ordersCount },
              { label: 'Средний чек', value: t.averageCheck },
              { label: 'Гостей', value: t.guests },
              { label: 'Сумма позиций', value: t.subtotal },
              { label: 'Скидки', value: t.discounts },
              { label: 'Обслуживание', value: t.service },
              { label: 'Доставка', value: t.deliveryFees },
              { label: 'Себестоимость', value: t.itemsCost },
              { label: 'Валовая прибыль', value: t.grossProfit },
              {
                label: `Доля официантов (${data.percent.waiter}%)`,
                value: t.waiterCommission,
              },
              {
                label: 'Отменено заказов (шт.)',
                value: t.cancelledOrders.count,
              },
              {
                label: 'Отменено заказов (сумма)',
                value: t.cancelledOrders.amount,
              },
              {
                label: 'Отменено позиций (сумма)',
                value: t.cancelledItems.amount,
              },
            ],
          },
          {
            name: 'Способы оплаты',
            title: 'Способы оплаты',
            subtitle,
            columns: [
              { header: 'Способ оплаты', key: 'name', width: 26 },
              { header: 'Заказов', key: 'ordersCount', kind: 'number' },
              { header: 'Сумма', key: 'amount', kind: 'money', width: 18 },
            ],
            rows: data.paymentMethods,
            totals: { name: 'Итого', amount: t.collected },
          },
          {
            name: 'Типы заказов',
            title: 'Типы заказов',
            subtitle,
            columns: [
              { header: 'Тип', key: 'label', width: 20 },
              { header: 'Заказов', key: 'count', kind: 'number' },
              { header: 'Сумма', key: 'amount', kind: 'money', width: 18 },
            ],
            rows: [
              ...data.byType.map((row) => ({
                ...row,
                label: ORDER_TYPE_LABELS[row.type],
              })),
              {
                label: 'Отменено',
                count: t.cancelledOrders.count,
                amount: t.cancelledOrders.amount,
              },
            ],
          },
          {
            name: 'Топ блюд',
            title: 'Топ блюд',
            subtitle,
            columns: [
              { header: '№', key: 'position', kind: 'number', width: 6 },
              { header: 'Блюдо', key: 'name', width: 34 },
              { header: 'Кол-во', key: 'quantity', kind: 'quantity' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 18 },
            ],
            rows: data.topDishes.map((dish, index) => ({
              ...dish,
              position: index + 1,
            })),
          },
          {
            name: 'Официанты',
            title: `Официанты — доля ${data.percent.waiter}%`,
            subtitle,
            columns: [
              { header: 'Сотрудник', key: 'fullName', width: 28 },
              { header: 'Заказов', key: 'ordersCount', kind: 'number' },
              { header: 'Доля', key: 'share', kind: 'money', width: 18 },
            ],
            rows: data.waiters.map((row) => ({
              ...row,
              fullName: row.fullName ?? 'Без официанта',
            })),
            totals: { fullName: 'Итого', share: t.waiterCommission },
          },
          ...(byDay.length
            ? [
                {
                  name: 'По дням',
                  title: 'Выручка по дням',
                  subtitle,
                  columns: [
                    { header: 'Дата', key: 'date', width: 14 },
                    {
                      header: 'Заказов',
                      key: 'count',
                      kind: 'number' as const,
                    },
                    {
                      header: 'Выручка',
                      key: 'amount',
                      kind: 'money' as const,
                      width: 18,
                    },
                  ],
                  rows: byDay.map((row) => ({
                    ...row,
                    date: row.date.split('-').reverse().join('.'),
                  })),
                },
              ]
            : []),
        ];
        break;
      }
      case 'orders': {
        const data = await this.ordersReport(
          all as unknown as OrdersReportQueryDto,
        );
        sheets = [
          {
            name: 'Заказы',
            title: 'Отчёт по заказам',
            subtitle: `${subtitle} · ${data.dateField === 'closedAt' ? 'по закрытию' : 'по открытию'}`,
            columns: [
              { header: 'ID', key: 'id', width: 9, kind: 'number' },
              { header: 'Номер', key: 'number', width: 9, kind: 'number' },
              { header: 'Тип', key: 'type', width: 12 },
              { header: 'Статус', key: 'status', width: 12 },
              { header: 'Стол', key: 'table', width: 18 },
              { header: 'Открыт', key: 'createdAt', width: 18 },
              { header: 'Закрыт', key: 'closedAt', width: 18 },
              { header: 'Официант', key: 'waiter', width: 20 },
              { header: 'Закрыл', key: 'closedBy', width: 20 },
              { header: 'Смена №', key: 'shiftId', width: 9, kind: 'number' },
              { header: 'Блюд', key: 'itemsCount', kind: 'quantity' },
              { header: 'Сумма', key: 'total', kind: 'money' },
              { header: 'Тип оплаты', key: 'payments', width: 30 },
            ],
            rows: data.items.map((order) => ({
              ...order,
              type: ORDER_TYPE_LABELS[order.type],
              status: ORDER_STATUS_LABELS[order.status],
              table: order.table?.name ?? '',
              createdAt: dt(order.createdAt),
              closedAt: dt(order.closedAt ?? order.cancelledAt),
              waiter: order.waiter?.fullName ?? '',
              closedBy: order.closedBy ?? order.cancelledBy ?? '',
              payments: order.payments
                .map((payment) => `${payment.name}: ${payment.amount}`)
                .join('; '),
            })),
            totals: {
              id: 'Итого',
              itemsCount: data.totals.itemsCount,
              total: data.totals.revenue,
            },
          },
        ];
        break;
      }
      case 'tables': {
        const data = await this.tables(query);
        sheets = [
          {
            name: 'По столам',
            title: 'Отчёт по столам',
            subtitle,
            columns: [
              { header: 'Стол', key: 'tableName', width: 20 },
              { header: 'Зал', key: 'hallName', width: 26 },
              { header: 'Заказов', key: 'ordersCount', kind: 'number' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 18 },
              { header: 'Ожидает оплаты', key: 'pending', kind: 'money' },
              { header: 'Средний чек', key: 'averageCheck', kind: 'money' },
              { header: 'Гостей', key: 'guests', kind: 'number' },
              {
                header: 'Среднее время, мин',
                key: 'averageMinutes',
                kind: 'number',
              },
            ],
            rows: data.items,
            totals: {
              tableName: 'Итого',
              ordersCount: data.totals.ordersCount,
              revenue: data.totals.revenue,
              pending: data.totals.pending,
              averageCheck: data.totals.averageCheck,
              guests: data.totals.guests,
            },
          },
        ];
        break;
      }
      case 'employees': {
        const data = await this.employees(query);
        const { service, waiter } = data.percent;
        sheets = [
          {
            name: 'По сотрудникам',
            title: 'Отчёт по сотрудникам',
            subtitle,
            columns: [
              { header: 'Сотрудник', key: 'fullName', width: 26 },
              { header: 'Заказов', key: 'ordersCount', kind: 'number' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 16 },
              { header: `Без ${service}%`, key: 'net', kind: 'money' },
              {
                header: `Без ${service}% и С собой`,
                key: 'base',
                kind: 'money',
                width: 20,
              },
              {
                header: `${service}% от базы`,
                key: 'service',
                kind: 'money',
              },
              { header: `Доля ${waiter}%`, key: 'share', kind: 'money' },
              {
                header: 'Ожидает оплаты',
                key: 'pendingRevenue',
                kind: 'money',
              },
            ],
            rows: data.items.map((item) => ({
              ...item,
              fullName: item.fullName ?? 'Без официанта',
              pendingRevenue: item.pending.revenue,
            })),
            totals: {
              fullName: 'Итого',
              ...data.totals,
              pendingRevenue: data.totals.pending.revenue,
            },
          },
        ];
        break;
      }
      case 'cashiers': {
        const data = await this.cashiers(query);
        sheets = [
          {
            name: 'По кассирам',
            title: 'Отчёт по кассирам',
            subtitle,
            columns: [
              { header: 'Кассир', key: 'fullName', width: 26 },
              { header: 'Платежей', key: 'paymentsCount', kind: 'number' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 18 },
              ...kinds,
            ],
            rows: data.items,
            totals: { fullName: 'Итого', ...data.totals },
          },
        ];
        break;
      }
      case 'shifts': {
        const data = await this.shifts(query);
        sheets = [
          {
            name: 'По сменам',
            title: 'Отчёт по сменам',
            subtitle,
            columns: [
              { header: '№ смены', key: 'id', kind: 'number', width: 10 },
              { header: 'Кассир', key: 'openedBy', width: 20 },
              { header: 'Открыта', key: 'openedAt', width: 18 },
              { header: 'Закрыта', key: 'closedAt', width: 18 },
              { header: 'Статус', key: 'status', width: 12 },
              { header: 'Платежей', key: 'paymentsCount', kind: 'number' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 18 },
              { header: 'Ожидает оплаты', key: 'pending', kind: 'money' },
              ...kinds,
              {
                header: 'Ожидалось в кассе',
                key: 'expectedCash',
                kind: 'money',
                width: 18,
              },
              { header: 'Фактически', key: 'countedCash', kind: 'money' },
              { header: 'Расхождение', key: 'difference', kind: 'money' },
            ],
            rows: data.items.map((item) => ({
              ...item,
              openedAt: dt(item.openedAt),
              closedAt: dt(item.closedAt),
              status: item.status === 'OPEN' ? 'Открыта' : 'Закрыта',
            })),
            totals: { id: 'Итого', ...data.totals },
          },
        ];
        break;
      }
      case 'dishes': {
        const data = await this.dishes(all as unknown as DishesReportQueryDto);
        sheets = [
          {
            name: 'По блюдам',
            title: 'Отчёт по блюдам',
            subtitle,
            columns: [
              { header: '№', key: 'position', kind: 'number', width: 6 },
              { header: 'Блюдо', key: 'name', width: 32 },
              { header: 'Категория', key: 'categoryName', width: 22 },
              { header: 'Ед.', key: 'unit', width: 8 },
              { header: 'Оплачено, кол-во', key: 'quantity', kind: 'quantity' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 16 },
              {
                header: 'Ожидает, кол-во',
                key: 'pendingQuantity',
                kind: 'quantity',
              },
              {
                header: 'Ожидает, сумма',
                key: 'pendingRevenue',
                kind: 'money',
              },
              {
                header: 'Отменено, кол-во',
                key: 'cancelledQuantity',
                kind: 'quantity',
              },
              {
                header: 'Отменено, сумма',
                key: 'cancelledAmount',
                kind: 'money',
              },
              { header: 'Себестоимость', key: 'cost', kind: 'money' },
              { header: 'Прибыль', key: 'profit', kind: 'money' },
            ],
            rows: data.items.map((item) => ({
              ...item,
              unit: DISH_UNIT_LABELS[item.unit as DishUnit] ?? item.unit,
            })),
            totals: { name: 'Итого', ...data.totals },
          },
        ];
        break;
      }
      case 'categories': {
        const data = await this.categoryDishes(query);
        sheets = [
          {
            name: 'По категориям',
            title: 'Отчёт по категориям',
            subtitle,
            columns: [
              { header: 'Категория / блюдо', key: 'name', width: 34 },
              { header: 'Кол-во', key: 'quantity', kind: 'quantity' },
              { header: 'Выручка', key: 'revenue', kind: 'money', width: 18 },
              {
                header: 'Ожидает, кол-во',
                key: 'pendingQuantity',
                kind: 'quantity',
              },
              {
                header: 'Ожидает, сумма',
                key: 'pendingRevenue',
                kind: 'money',
              },
            ],
            rows: data.categories.flatMap((group) => [
              { ...group, name: group.name.toUpperCase() },
              ...group.dishes.map((dish) => ({
                ...dish,
                name: `    ${dish.name}`,
              })),
            ]),
            totals: {
              name: 'Итого',
              quantity: data.totals.quantity,
              revenue: data.totals.revenue,
              pendingRevenue: data.totals.pendingRevenue,
            },
          },
        ];
        break;
      }
      case 'cancellations': {
        const data = await this.cancellations(
          all as unknown as CancellationsReportQueryDto,
        );
        sheets = [
          {
            name: 'Отмены',
            title: 'Отчёт по отменам',
            subtitle,
            columns: [
              { header: 'Номер заказа', key: 'orderNumber', kind: 'number' },
              { header: 'Блюдо', key: 'name', width: 28 },
              { header: 'Кол-во', key: 'quantity', kind: 'quantity' },
              { header: 'Цена', key: 'price', kind: 'money' },
              { header: 'Сумма потерь', key: 'amount', kind: 'money' },
              { header: 'Сотрудник', key: 'cancelledBy', width: 20 },
              { header: 'Дата отмены', key: 'cancelledAt', width: 18 },
              { header: 'Причина', key: 'reason', width: 30 },
              { header: 'Официант', key: 'waiter', width: 20 },
              { header: 'Отмена заказа', key: 'orderCancelled', width: 14 },
            ],
            rows: data.items.map((item) => ({
              ...item,
              cancelledAt: dt(item.cancelledAt),
              orderCancelled: item.orderCancelled ? 'Да' : 'Нет',
            })),
            totals: {
              orderNumber: 'Итого',
              quantity: data.totals.quantity,
              amount: data.totals.amount,
            },
          },
        ];
        break;
      }
      default:
        throw new BadRequestException('Неизвестный отчёт');
    }

    const stamp = (value: string) =>
      value.replace(/[-:]/g, '').replace('T', '-');
    return {
      buffer: await this.excel.build(sheets),
      // ASCII only: the name travels in a Content-Disposition header.
      fileName: period.shift
        ? `${kind}_shift-${period.shift.id}.xlsx`
        : `${kind}_${stamp(period.from)}_${stamp(period.to)}.xlsx`,
    };
  }
}
