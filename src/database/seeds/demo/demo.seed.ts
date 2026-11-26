/**
 * Realistic demo data for a fresh installation:
 *   • restaurant settings, preparation stations, halls and tables;
 *   • menu (16 categories, ~80 dishes) with recipes, ingredients and stock;
 *   • staff with roles (password 123456);
 *   • 30 days of history — daily shifts, ~1 200 orders, payments, discounts,
 *     cancellations, cash operations and weekly goods receipts;
 *   • today: an open shift with paid orders and occupied tables.
 *
 * Everything is created through the real services (all business rules apply)
 * and then moved back in time, so stock, cash and reports stay consistent.
 * Refuses to run when halls already exist.
 *
 *   npm run seed:demo
 */
import 'dotenv/config';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../../app.module';
import {
  CashOperationType,
  DiscountType,
  DishUnit,
  FRACTIONAL_DISH_UNITS,
  IngredientUnit,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  PrinterConnection,
  StockItemType,
  StockLocation,
} from '../../../common/constants/enums';
import { Permission } from '../../../common/constants/permissions';
import type { AuthUser } from '../../../common/types/auth-user';
import { addDays, todayInTimeZone } from '../../../common/utils/dates';
import type { AppConfig, AuthConfig } from '../../../config/configuration';
import { HallsService } from '../../../modules/halls/halls.service';
import { IngredientsService } from '../../../modules/ingredients/ingredients.service';
import { CategoriesService } from '../../../modules/menu/categories.service';
import { DishesService } from '../../../modules/menu/dishes.service';
import { OrdersService } from '../../../modules/orders/orders.service';
import { PaymentMethodsService } from '../../../modules/payment-methods/payment-methods.service';
import { PrintersService } from '../../../modules/printers/printers.service';
import { RolesService } from '../../../modules/roles/roles.service';
import { SettingsService } from '../../../modules/settings/settings.service';
import { ShiftsService } from '../../../modules/shifts/shifts.service';
import { StockService } from '../../../modules/stock/stock.service';
import { UsersService } from '../../../modules/users/users.service';
import {
  CANCEL_REASONS,
  CUSTOMERS,
  HALLS,
  INGREDIENTS,
  MENU,
  ORDER_CANCEL_REASONS,
  PRINTERS,
  STAFF,
  STAFF_PASSWORD,
  type DishSeed,
} from './catalog';
import { addMinutes, Random, zonedInstant } from './random';

type OrderDetail = Awaited<ReturnType<OrdersService['getDetail']>>;

const HISTORY_DAYS = 30;
const logger = new Logger('DemoSeed');
const say = (message: string) => process.stdout.write(`[demo] ${message}\n`);
const random = new Random(20261111);

interface DemoDish extends DishSeed {
  id: number;
  unit: DishUnit;
}

interface Staff {
  id: number;
  name: string;
  actor: AuthUser;
}

interface Context {
  timeZone: string;
  db: DataSource;
  owner: AuthUser;
  cashiers: Staff[];
  waiters: Staff[];
  tables: { id: number; name: string }[];
  dishes: DemoDish[];
  ingredients: { id: number; name: string; weekly: number; cost: number }[];
  methods: { id: number; name: string; type: string }[];
  services: {
    halls: HallsService;
    printers: PrintersService;
    categories: CategoriesService;
    dishes: DishesService;
    ingredients: IngredientsService;
    stock: StockService;
    users: UsersService;
    roles: RolesService;
    settings: SettingsService;
    shifts: ShiftsService;
    orders: OrdersService;
    methods: PaymentMethodsService;
  };
}

interface OrderTimeline {
  id: number;
  createdAt: Date;
  closedAt: Date | null;
  cancelledAt: Date | null;
  itemCancelledAt: Date;
}

// ─────────────────────────────── Catalogue ───────────────────────────────

async function seedCatalogue(ctx: Context, since: Date): Promise<void> {
  const { services, owner } = ctx;

  await services.settings.update(
    {
      restaurantName: 'BurgutPOS',
      address: 'г. Ташкент, ул. Амира Темура, 15',
      phone: '+998 71 200 15 15',
      receiptHeader: 'Добро пожаловать!',
      receiptFooter: 'Спасибо за визит! Ждём вас снова.',
      serviceChargePercent: 10,
      serviceChargeOrderTypes: [OrderType.Table],
      waiterCommissionPercent: 6,
    },
    owner,
  );

  const printerIds = new Map<string, number>();
  // Bills and receipts go to the cashier's printer, not to a kitchen station.
  for (const name of PRINTERS)
    printerIds.set(
      name,
      (await services.printers.create({ name, isDefault: name === 'KASSA' }))
        .id,
    );

  for (const hall of HALLS) {
    const created = await services.halls.createHall({ name: hall.name }, owner);
    for (const table of hall.tables) {
      const view = await services.halls.createTable(
        { hallId: created.id, name: table.name, seats: table.seats },
        owner,
      );
      if (!table.name.includes('ЗАХИРА'))
        ctx.tables.push({ id: view.id, name: view.name });
    }
  }

  const ingredientIds = new Map<string, number>();
  for (const ingredient of INGREDIENTS) {
    const view = await services.ingredients.create(
      {
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: Math.round(ingredient.weekly * 1.2),
        minQuantity: ingredient.min,
        costPrice: ingredient.cost,
      },
      owner,
    );
    ingredientIds.set(ingredient.name, view.id);
    ctx.ingredients.push({
      id: view.id,
      name: ingredient.name,
      weekly: ingredient.weekly,
      cost: ingredient.cost,
    });
  }
  // Opening stock counts belong to the day before the history starts.
  await ctx.db.query(`UPDATE stock_movements SET created_at = $1`, [since]);

  for (const group of MENU) {
    const category = await services.categories.create(
      { name: group.name },
      owner,
    );
    for (const dish of group.dishes) {
      const view = await services.dishes.create(
        {
          name: dish.name,
          categoryId: category.id,
          printerId: printerIds.get(group.printer) ?? null,
          price: dish.price,
          unit: dish.unit ?? DishUnit.Piece,
          trackStock: dish.tracked ?? false,
          ingredients: (dish.recipe ?? []).map(([name, quantity]) => ({
            ingredientId: ingredientIds.get(name) as number,
            quantity,
          })),
        },
        owner,
      );
      if (group.archived) await services.dishes.setActive(view.id, false);
      else
        ctx.dishes.push({
          ...dish,
          id: view.id,
          unit: dish.unit ?? DishUnit.Piece,
        });
    }
    if (group.archived) await services.categories.setActive(category.id, false);
  }
  // A dish on the stop-list, as in real life.
  const stopped = ctx.dishes.find((dish) => dish.name === 'Жигар');
  if (stopped) await services.dishes.setAvailability(stopped.id, false);

  const { items: roles } = await services.roles.list();
  for (const member of STAFF) {
    const role = roles.find((item) => item.name === member.role);
    if (!role) continue;
    const view = await services.users.create(
      {
        fullName: member.fullName,
        login: member.login,
        password: STAFF_PASSWORD,
        phone: member.phone,
        roleId: role.id,
      },
      owner,
    );
    const identity = await services.users.findIdentity(view.id);
    if (!identity) continue;
    const staff = {
      id: view.id,
      name: member.fullName,
      actor: UsersService.toAuthUser(identity, 'demo-seed'),
    };
    if (member.role === 'Кассир') ctx.cashiers.push(staff);
    if (member.role === 'Официант') ctx.waiters.push(staff);
  }

  ctx.methods = await services.methods.options();

  // The catalogue "existed" before the history begins.
  const created = addMinutes(since, -60 * 24 * 25);
  for (const table of [
    'printers',
    'halls',
    'dining_tables',
    'dish_categories',
    'dishes',
    'ingredients',
    'users',
    'roles',
    'payment_methods',
  ]) {
    await ctx.db.query(
      `UPDATE ${table} SET created_at = $1::timestamptz + (id * interval '17 minutes'), updated_at = $1::timestamptz + (id * interval '17 minutes')`,
      [created],
    );
  }
}

// ─────────────────────────────── Stock ───────────────────────────────

async function receiveGoods(
  ctx: Context,
  at: Date,
  first: boolean,
): Promise<void> {
  const tracked = ctx.dishes.filter((dish) => dish.tracked);
  const items = [
    ...tracked.map((dish) => ({
      itemType: StockItemType.Dish,
      dishId: dish.id,
      location: StockLocation.Sale,
      quantity: random.int(first ? 6 : 4, first ? 10 : 8) * 12,
      purchasePrice: Math.round((dish.price * 0.68) / 50) * 50,
    })),
    ...ctx.ingredients.map((ingredient) => ({
      itemType: StockItemType.Ingredient,
      ingredientId: ingredient.id,
      quantity: Math.round(ingredient.weekly * (0.9 + random.next() * 0.3)),
      purchasePrice: Math.round(
        ingredient.cost * (0.96 + random.next() * 0.08),
      ),
    })),
  ];
  const { ids } = await ctx.services.stock.createReceipts(
    { items, comment: first ? 'Начальный приход' : 'Еженедельная закупка' },
    ctx.owner,
  );
  // One warehouse delivery that is later moved to the bar — shows both locations.
  const water = tracked.find((dish) => dish.name.startsWith('Hydrolife'));
  if (water) {
    const extra = await ctx.services.stock.createReceipts(
      {
        items: [
          {
            itemType: StockItemType.Dish,
            dishId: water.id,
            location: StockLocation.Warehouse,
            quantity: 48,
            purchasePrice: 3200,
          },
        ],
      },
      ctx.owner,
    );
    ids.push(...extra.ids);
    await ctx.services.stock.transferDish(
      water.id,
      { from: StockLocation.Warehouse, quantity: 24 },
      ctx.owner,
    );
    await ctx.db.query(
      `UPDATE stock_movements SET created_at = $2 WHERE dish_id = $1 AND type = 'TRANSFER' AND created_at > $2`,
      [water.id, addMinutes(at, 20)],
    );
  }
  await ctx.db.query(
    `UPDATE stock_receipts SET created_at = $2 WHERE id = ANY($1::int[])`,
    [ids, at],
  );
  await ctx.db.query(
    `UPDATE stock_movements SET created_at = $2 WHERE receipt_id = ANY($1::int[])`,
    [ids, at],
  );
}

// ─────────────────────────────── Orders ───────────────────────────────

const ORDER_TYPES: { type: OrderType; weight: number }[] = [
  { type: OrderType.Table, weight: 70 },
  { type: OrderType.Takeaway, weight: 13 },
  { type: OrderType.Delivery, weight: 9 },
  { type: OrderType.Hall, weight: 8 },
];

/** What guests ask the kitchen for — printed on the kitchen ticket. */
const KITCHEN_NOTES = [
  'Без лука',
  'Острее',
  'Без соли',
  'Хорошо прожарить',
  'Без майонеза',
  'Соус отдельно',
  'Без сахара',
  'Со льдом',
];
const TABLE_NOTES = [
  'День рождения — вынести торт со свечой',
  'Гости спешат — подать побыстрее',
  'Постоянный гость — столик у окна',
];
const DELIVERY_NOTES = [
  'Позвонить за 10 минут до приезда',
  'Домофон не работает — позвонить',
  'Оставить у охраны',
];
const TAKEAWAY_NOTES = ['Упаковать горячее отдельно', 'Приборы на троих'];

function pickLines(ctx: Context, type: OrderType) {
  const count = type === OrderType.Table ? random.int(3, 7) : random.int(2, 4);
  const chosen = new Map<number, number>();
  const sellable = ctx.dishes.filter(
    (dish) => dish.pop > 0 && dish.name !== 'Жигар',
  );
  while (chosen.size < count) {
    const dish = random.weighted(sellable, (item) => item.pop);
    if (chosen.has(dish.id)) continue;
    chosen.set(
      dish.id,
      random.quantity(
        dish.qty ?? [1, 2],
        FRACTIONAL_DISH_UNITS.includes(dish.unit),
      ),
    );
  }
  // Now and then a guest asks the kitchen for something — it goes on the ticket.
  const lines: { dishId: number; quantity: number; comment?: string }[] = [
    ...chosen.entries(),
  ].map(([dishId, quantity]) =>
    random.chance(0.05)
      ? { dishId, quantity, comment: random.pick(KITCHEN_NOTES) }
      : { dishId, quantity },
  );
  // Bread and tea are on almost every table.
  if (type === OrderType.Table) {
    for (const name of ['Нон', 'Кўк чой']) {
      const dish = ctx.dishes.find((item) => item.name === name);
      if (dish && !chosen.has(dish.id) && random.chance(0.75))
        lines.push({ dishId: dish.id, quantity: random.int(1, 3) });
    }
  }
  return lines;
}

function buildPayments(ctx: Context, total: number) {
  const cash =
    ctx.methods.find((method) => method.type === 'CASH') ?? ctx.methods[0];
  const others = ctx.methods.filter((method) => method.id !== cash.id);
  if (total <= 0) return [];
  if (others.length && random.chance(0.05)) {
    const part = Math.min(total, Math.round((total * 0.4) / 1000) * 1000);
    const rest = Math.round((total - part) * 100) / 100;
    return rest > 0
      ? [
          { methodId: cash.id, amount: part },
          { methodId: random.pick(others).id, amount: rest },
        ]
      : [{ methodId: cash.id, amount: total }];
  }
  const method = random.weighted(ctx.methods, (item) =>
    item.type === 'CASH'
      ? 50
      : item.name === 'Uzcard'
        ? 18
        : item.name === 'Humo'
          ? 12
          : item.name === 'Click'
            ? 12
            : 8,
  );
  if (method.type === 'CASH' && random.chance(0.45)) {
    const received = Math.ceil(total / 10000) * 10000;
    return [
      { methodId: method.id, amount: received > total ? received : total },
    ];
  }
  return [{ methodId: method.id, amount: total }];
}

async function createOrder(
  ctx: Context,
  type: OrderType,
  cashier: Staff,
  waiter: Staff,
  tableId: number | null,
) {
  const customer = random.pick(CUSTOMERS);
  const creator =
    type === OrderType.Table || type === OrderType.Hall
      ? waiter.actor
      : cashier.actor;
  const build = (withTracked: boolean) => {
    const items = pickLines(ctx, type).filter(
      (line) =>
        withTracked ||
        !ctx.dishes.find((dish) => dish.id === line.dishId)?.tracked,
    );
    return {
      type,
      items: items.length
        ? items
        : [
            {
              dishId:
                ctx.dishes.find((dish) => dish.name === 'Нон')?.id ??
                ctx.dishes[0].id,
              quantity: 2,
            },
          ],
      ...(type === OrderType.Table
        ? { tableId: tableId as number, guests: random.int(1, 8) }
        : {}),
      ...(type === OrderType.Hall ? { guests: random.int(1, 3) } : {}),
      ...(type === OrderType.Delivery
        ? {
            customerName: customer.name,
            customerPhone: customer.phone,
            deliveryAddress: customer.address,
            deliveryFee: random.pick([10000, 15000, 20000]),
          }
        : {}),
      ...(type === OrderType.Takeaway && random.chance(0.5)
        ? { customerName: customer.name, customerPhone: customer.phone }
        : {}),
    };
  };
  try {
    return (await ctx.services.orders.create(build(true), creator)).order;
  } catch {
    // Out of a bottled drink this week — the guest takes something else.
    return (await ctx.services.orders.create(build(false), creator)).order;
  }
}

/**
 * Forces what is otherwise left to chance. Unset fields draw from `random`
 * exactly as before, so the regular simulation stays reproducible.
 */
interface OrderPlan {
  type?: OrderType;
  tableId?: number;
  cancelLine?: boolean;
  cancelOrder?: boolean;
}

async function simulateOrder(
  ctx: Context,
  day: string,
  minute: number,
  cashier: Staff,
  plan: OrderPlan = {},
): Promise<OrderTimeline> {
  const type =
    plan.type ?? random.weighted(ORDER_TYPES, (item) => item.weight).type;
  const waiter = random.pick(ctx.waiters);
  const tableId =
    type === OrderType.Table
      ? (plan.tableId ?? random.pick(ctx.tables).id)
      : null;
  let order: OrderDetail = await createOrder(
    ctx,
    type,
    cashier,
    waiter,
    tableId,
  );
  const createdAt = zonedInstant(
    day,
    Math.floor(minute / 60),
    minute % 60,
    ctx.timeZone,
  );
  const itemCancelledAt = addMinutes(createdAt, random.int(4, 18));

  if (plan.cancelLine ?? random.chance(0.06)) {
    const active = order.items.filter(
      (item) => item.status === OrderItemStatus.Active,
    );
    // A forced cancellation takes a whole line when no line has two portions,
    // but never the only one — the order would be left empty.
    const line =
      active.find((item) => item.quantity >= 2) ??
      (plan.cancelLine && active.length >= 2 ? active[0] : undefined);
    if (line) {
      order = await ctx.services.orders.cancelItem(
        order.id,
        line.id,
        {
          quantity: line.quantity >= 2 ? 1 : line.quantity,
          reason: random.pick(CANCEL_REASONS),
          returnToStock: random.chance(0.6),
        },
        cashier.actor,
      );
    }
  }

  if (plan.cancelOrder ?? random.chance(0.02)) {
    await ctx.services.orders.cancel(
      order.id,
      { reason: random.pick(ORDER_CANCEL_REASONS), returnToStock: true },
      cashier.actor,
    );
    return {
      id: order.id,
      createdAt,
      closedAt: null,
      cancelledAt: addMinutes(createdAt, random.int(6, 25)),
      itemCancelledAt,
    };
  }

  if (type === OrderType.Table && random.chance(0.5))
    await ctx.services.orders.precheck(order.id, cashier.actor);
  if (random.chance(0.07)) {
    order = await ctx.services.orders.applyDiscount(
      order.id,
      { type: DiscountType.Percent, value: random.pick([5, 10, 15]) },
      cashier.actor,
    );
  }
  await ctx.services.orders.pay(
    order.id,
    { payments: buildPayments(ctx, order.total) },
    cashier.actor,
  );

  const duration =
    type === OrderType.Table ? random.int(35, 115) : random.int(8, 40);
  const dayEnd = zonedInstant(day, 23, 55, ctx.timeZone);
  const closedAt = new Date(
    Math.min(addMinutes(createdAt, duration).getTime(), dayEnd.getTime()),
  );
  return {
    id: order.id,
    createdAt,
    closedAt,
    cancelledAt: null,
    itemCancelledAt,
  };
}

async function backdateOrders(
  ctx: Context,
  timelines: OrderTimeline[],
): Promise<void> {
  for (const t of timelines) {
    const end = t.closedAt ?? t.cancelledAt ?? t.createdAt;
    await ctx.db.query(
      `UPDATE orders SET created_at = $2, updated_at = $3,
              closed_at = CASE WHEN closed_at IS NULL THEN NULL ELSE $3::timestamptz END,
              cancelled_at = CASE WHEN cancelled_at IS NULL THEN NULL ELSE $4::timestamptz END,
              precheck_at = CASE WHEN precheck_at IS NULL THEN NULL ELSE $3::timestamptz - interval '4 minutes' END
        WHERE id = $1`,
      [t.id, t.createdAt, end, t.cancelledAt ?? t.itemCancelledAt],
    );
    await ctx.db.query(
      `UPDATE order_items SET created_at = $2,
              cancelled_at = CASE WHEN cancelled_at IS NULL THEN NULL ELSE $3::timestamptz END
        WHERE order_id = $1`,
      [t.id, t.createdAt, t.cancelledAt ?? t.itemCancelledAt],
    );
    await ctx.db.query(
      `UPDATE payments SET created_at = $2 WHERE order_id = $1`,
      [t.id, end],
    );
    // The bill printed by the precheck command — the same moment as precheck_at.
    await ctx.db.query(
      `UPDATE order_prints SET created_at = $2::timestamptz - interval '4 minutes' WHERE order_id = $1`,
      [t.id, end],
    );
    await ctx.db.query(
      `UPDATE stock_movements SET created_at = CASE WHEN type = 'SALE' THEN $2::timestamptz ELSE $3::timestamptz END
        WHERE order_id = $1`,
      [t.id, t.createdAt, t.cancelledAt ?? t.itemCancelledAt],
    );
  }
}

/** Realistic write-offs: some stock spoils, two ingredients end below the minimum. */
async function spoilage(ctx: Context, at: Date): Promise<void> {
  const before = await ctx.db.query<{ id: string }[]>(
    `SELECT COALESCE(MAX(id), 0) AS id FROM stock_movements`,
  );
  for (const [name, keep, reason] of [
    ['Лимон', 0.4, 'Испортился'],
    ['Қаймоқ', 0.6, 'Истёк срок годности'],
  ] as const) {
    const ingredient = ctx.ingredients.find((item) => item.name === name);
    if (!ingredient) continue;
    const [row] = await ctx.db.query<{ quantity: string }[]>(
      `SELECT quantity FROM ingredients WHERE id = $1`,
      [ingredient.id],
    );
    const quantity =
      Math.round((Number(row?.quantity ?? 0) - keep) * 1000) / 1000;
    if (quantity > 0)
      await ctx.services.stock.writeOffIngredient(
        ingredient.id,
        { quantity, reason },
        ctx.owner,
      );
  }
  const bottle = ctx.dishes.find((dish) => dish.name === 'Fanta SHISHALI');
  if (bottle) {
    await ctx.services.stock.writeOffDish(
      bottle.id,
      { location: StockLocation.Sale, quantity: 2, reason: 'Разбиты бутылки' },
      ctx.owner,
    );
  }
  await ctx.db.query(
    `UPDATE stock_movements SET created_at = $2 WHERE id > $1`,
    [before[0]?.id ?? '0', at],
  );
}

// ─────────────────────────────── Days ───────────────────────────────

async function simulateClosedDay(
  ctx: Context,
  day: string,
  receiveFirst: boolean,
): Promise<{ orders: number }> {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (receiveFirst || weekday === 1)
    await receiveGoods(
      ctx,
      zonedInstant(day, 8, 30, ctx.timeZone),
      receiveFirst,
    );

  const cashier = ctx.cashiers[weekday % ctx.cashiers.length];
  const shift = await ctx.services.shifts.open(
    { openingCash: 300000, comment: undefined },
    cashier.actor,
  );
  if (random.chance(0.25)) {
    await ctx.services.shifts.addCashOperation(
      { type: CashOperationType.In, amount: 200000, comment: 'Размен монет' },
      cashier.actor,
    );
  }

  const busy = weekday === 0 || weekday === 5 || weekday === 6;
  const count = busy ? random.int(46, 60) : random.int(30, 42);
  const minutes = Array.from({ length: count }, () =>
    random.int(10 * 60, 22 * 60 + 40),
  ).sort((a, b) => a - b);
  const timelines: OrderTimeline[] = [];
  for (const minute of minutes)
    timelines.push(await simulateOrder(ctx, day, minute, cashier));

  const current = await ctx.services.shifts.current();
  if (current && current.cash.expected > 2_500_000 && random.chance(0.6)) {
    const amount = Math.floor((current.cash.expected * 0.5) / 100000) * 100000;
    await ctx.services.shifts.addCashOperation(
      { type: CashOperationType.Out, amount, comment: 'Инкассация' },
      cashier.actor,
    );
  }
  const expected = (await ctx.services.shifts.current())?.cash.expected ?? 0;
  const difference = random.chance(0.8)
    ? 0
    : random.pick([-10000, -5000, -2000, 1000, 3000]);
  await ctx.services.shifts.close(
    {
      closingCash: Math.max(0, expected + difference),
      comment: difference ? 'Расхождение при пересчёте' : undefined,
    },
    cashier.actor,
  );

  await backdateOrders(ctx, timelines);
  const lastClose = Math.max(
    ...timelines.map((t) =>
      (t.closedAt ?? t.cancelledAt ?? t.createdAt).getTime(),
    ),
  );
  const openedAt = zonedInstant(day, 9, random.int(0, 25), ctx.timeZone);
  const closedAt = new Date(
    Math.max(
      lastClose + 10 * 60_000,
      zonedInstant(day, 23, 30, ctx.timeZone).getTime(),
    ),
  );
  await ctx.db.query(
    `UPDATE shifts SET opened_at = $2, closed_at = $3 WHERE id = $1`,
    [shift.id, openedAt, closedAt],
  );
  await ctx.db.query(
    `UPDATE cash_operations SET created_at = CASE WHEN type = 'IN' THEN $2::timestamptz ELSE $3::timestamptz END WHERE shift_id = $1`,
    [shift.id, addMinutes(openedAt, 10), addMinutes(closedAt, -20)],
  );
  return { orders: count };
}

async function simulateToday(
  ctx: Context,
  day: string,
): Promise<{ paid: number; open: number }> {
  const now = new Date();
  const cashier = ctx.cashiers[0];
  const eightAm = zonedInstant(day, 8, 0, ctx.timeZone);
  const openedAt = new Date(
    Math.min(eightAm.getTime(), now.getTime() - 3 * 3600_000),
  );
  const shift = await ctx.services.shifts.open(
    { openingCash: 300000 },
    cashier.actor,
  );

  // Paid orders from 20 minutes after the opening until ~10 minutes ago, at
  // a lunchtime pace — so "Сегодня" in the reports is never an empty page.
  const midnight = zonedInstant(day, 0, 0, ctx.timeZone).getTime();
  const startMinute = Math.max(
    0,
    Math.ceil((openedAt.getTime() + 20 * 60_000 - midnight) / 60_000),
  );
  const endMinute = Math.floor(
    (now.getTime() - 10 * 60_000 - midnight) / 60_000,
  );
  const timelines: OrderTimeline[] = [];
  if (endMinute > startMinute) {
    const count = Math.min(
      60,
      Math.max(0, Math.round(((endMinute - startMinute) / 60) * 9)),
    );
    const minutes = Array.from({ length: count }, () =>
      random.int(startMinute, endMinute),
    ).sort((a, b) => a - b);
    for (const minute of minutes) {
      const timeline = await simulateOrder(ctx, day, minute, cashier);
      if (timeline.closedAt && timeline.closedAt > now)
        timeline.closedAt = addMinutes(now, -2);
      timelines.push(timeline);
    }
  }
  await backdateOrders(ctx, timelines);

  // Occupied tables and open orders, like a real evening in the hall.
  const byName = (name: string) =>
    ctx.tables.find((table) => table.name === name);
  const waiterByName = (name: string) =>
    ctx.waiters.find((waiter) => waiter.name === name) ?? ctx.waiters[0];
  const open: {
    type: OrderType;
    table?: string;
    waiter: string;
    precheck?: boolean;
  }[] = [
    {
      type: OrderType.Table,
      table: 'ДИВАН 1',
      waiter: 'Карима',
      precheck: true,
    },
    { type: OrderType.Table, table: 'ДИВАН 3', waiter: 'Озодбек' },
    { type: OrderType.Table, table: 'ДИВАН 5', waiter: 'Ойдиной' },
    { type: OrderType.Table, table: 'ДИВАН 7', waiter: 'Мохидил' },
    { type: OrderType.Table, table: 'СЎРИ 2', waiter: 'Карима' },
    {
      type: OrderType.Table,
      table: 'VIP 2',
      waiter: 'Мансур Рахимов',
      precheck: true,
    },
    { type: OrderType.Takeaway, waiter: 'Мохидил' },
    { type: OrderType.Delivery, waiter: 'Мохидил' },
    { type: OrderType.Hall, waiter: 'Шухрат Мирзаев' },
  ];
  let openCount = 0;
  for (const item of open) {
    const table = item.table ? byName(item.table) : undefined;
    if (item.table && !table) continue;
    const order = await createOrder(
      ctx,
      item.type,
      cashier,
      waiterByName(item.waiter),
      table?.id ?? null,
    );
    if (item.precheck)
      await ctx.services.orders.precheck(order.id, cashier.actor);
    const createdAt = new Date(
      Math.max(
        addMinutes(now, -random.int(8, 80)).getTime(),
        openedAt.getTime() + 60_000,
      ),
    );
    await ctx.db.query(
      `UPDATE orders SET created_at = $2, updated_at = $2,
              precheck_at = CASE WHEN precheck_at IS NULL THEN NULL ELSE $3::timestamptz END WHERE id = $1`,
      [order.id, createdAt, addMinutes(now, -3)],
    );
    await ctx.db.query(
      `UPDATE order_prints SET created_at = $2 WHERE order_id = $1`,
      [order.id, addMinutes(now, -3)],
    );
    await ctx.db.query(
      `UPDATE order_items SET created_at = $2 WHERE order_id = $1`,
      [order.id, createdAt],
    );
    await ctx.db.query(
      `UPDATE stock_movements SET created_at = $2 WHERE order_id = $1`,
      [order.id, createdAt],
    );
    openCount += 1;
  }

  await ctx.db.query(`UPDATE shifts SET opened_at = $2 WHERE id = $1`, [
    shift.id,
    openedAt,
  ]);
  await ctx.db.query(
    `UPDATE cash_operations SET created_at = $2 WHERE shift_id = $1`,
    [shift.id, addMinutes(openedAt, 10)],
  );
  return { paid: timelines.length, open: openCount };
}

// ─────────────────────────────── Catch-up ───────────────────────────────

/**
 * Rebuilds the working lists from a database this seed filled earlier: rows
 * are matched to `catalog.ts` by dish/ingredient name and staff login, so the
 * simulation keeps the same menu, people and tables. Only what is active and
 * on sale today is used — an archived waiter or a stop-listed dish stays out.
 */
async function loadCatalogue(ctx: Context): Promise<void> {
  const { db, services } = ctx;
  ctx.tables = await db.query<{ id: number; name: string }[]>(
    `SELECT id, name FROM dining_tables WHERE is_active AND name NOT LIKE '%ЗАХИРА%' ORDER BY id`,
  );

  const dishRows = await db.query<
    { id: number; name: string; unit: DishUnit; track_stock: boolean }[]
  >(
    `SELECT id, name, unit, track_stock FROM dishes WHERE is_active AND is_available`,
  );
  const dishByName = new Map(dishRows.map((row) => [row.name, row]));
  ctx.dishes = MENU.filter((group) => !group.archived).flatMap((group) =>
    group.dishes.flatMap((dish) => {
      const row = dishByName.get(dish.name);
      return row
        ? [{ ...dish, id: row.id, unit: row.unit, tracked: row.track_stock }]
        : [];
    }),
  );

  const ingredientRows = await db.query<{ id: number; name: string }[]>(
    `SELECT id, name FROM ingredients WHERE is_active`,
  );
  const ingredientByName = new Map(
    ingredientRows.map((row) => [row.name, row.id]),
  );
  ctx.ingredients = INGREDIENTS.flatMap((item) => {
    const id = ingredientByName.get(item.name);
    return id
      ? [{ id, name: item.name, weekly: item.weekly, cost: item.cost }]
      : [];
  });

  const staffRows = await db.query<{ id: number; login: string }[]>(
    `SELECT id, login FROM users WHERE is_active AND login = ANY($1::text[])`,
    [STAFF.map((member) => member.login)],
  );
  for (const member of STAFF) {
    if (member.role !== 'Кассир' && member.role !== 'Официант') continue;
    const row = staffRows.find((item) => item.login === member.login);
    const identity = row && (await services.users.findIdentity(row.id));
    if (!row || !identity) continue;
    const staff = {
      id: row.id,
      name: member.fullName,
      actor: UsersService.toAuthUser(identity, 'demo-seed'),
    };
    (member.role === 'Кассир' ? ctx.cashiers : ctx.waiters).push(staff);
  }

  ctx.methods = await services.methods.options();
}

/**
 * The day the seed left open (a shift with guests still at the tables):
 * everyone pays that evening and the shift is closed, as it would have been.
 */
async function finishOpenDay(
  ctx: Context,
  shift: { id: number; cashierId: number; day: string },
): Promise<number> {
  const cashier =
    ctx.cashiers.find((staff) => staff.id === shift.cashierId) ??
    ctx.cashiers[0];
  const open = await ctx.db.query<{ id: number; created_at: Date }[]>(
    `SELECT id, created_at FROM orders WHERE status = 'OPEN' AND shift_id = $1 ORDER BY created_at`,
    [shift.id],
  );
  const lastPay = zonedInstant(shift.day, 23, 20, ctx.timeZone);
  const timelines: OrderTimeline[] = [];
  for (const row of open) {
    const order = await ctx.services.orders.getDetail(row.id);
    await ctx.services.orders.pay(
      order.id,
      { payments: buildPayments(ctx, order.total) },
      cashier.actor,
    );
    const createdAt = new Date(row.created_at);
    timelines.push({
      id: order.id,
      createdAt,
      closedAt: new Date(
        Math.min(
          addMinutes(createdAt, random.int(25, 70)).getTime(),
          lastPay.getTime(),
        ),
      ),
      cancelledAt: null,
      itemCancelledAt: createdAt,
    });
  }
  await backdateOrders(ctx, timelines);

  const expected = (await ctx.services.shifts.current())?.cash.expected ?? 0;
  await ctx.services.shifts.close(
    { closingCash: Math.max(0, expected) },
    cashier.actor,
  );
  const lastClose = Math.max(
    0,
    ...timelines.map((t) => (t.closedAt ?? t.createdAt).getTime()),
  );
  const closedAt = new Date(
    Math.max(
      lastClose + 10 * 60_000,
      zonedInstant(shift.day, 23, 30, ctx.timeZone).getTime(),
    ),
  );
  await ctx.db.query(`UPDATE shifts SET closed_at = $2 WHERE id = $1`, [
    shift.id,
    closedAt,
  ]);
  return open.length;
}

/**
 * `--catch-up`: brings a demo database seeded on an earlier day up to today —
 * finishes the day it was left on, simulates every missing day as a closed
 * shift and opens today's shift with paid and open orders. Nothing is deleted.
 */
async function catchUp(ctx: Context): Promise<void> {
  await loadCatalogue(ctx);
  if (
    !ctx.cashiers.length ||
    !ctx.waiters.length ||
    !ctx.dishes.length ||
    !ctx.tables.length ||
    !ctx.methods.length
  ) {
    logger.warn(
      'Справочники демо-данных не найдены — сначала заполните пустую базу: npm run seed:demo.',
    );
    return;
  }

  const today = todayInTimeZone(ctx.timeZone);
  const [state] = await ctx.db.query<
    {
      lastDay: string | null;
      shiftId: number | null;
      cashierId: number | null;
      shiftDay: string | null;
    }[]
  >(
    `SELECT (SELECT MAX(business_date)::text FROM orders) AS "lastDay",
            s.id AS "shiftId", s.opened_by_id AS "cashierId",
            (s.opened_at AT TIME ZONE $1)::date::text AS "shiftDay"
       FROM (SELECT 1) one
       LEFT JOIN shifts s ON s.status = 'OPEN'`,
    [ctx.timeZone],
  );

  if (state.shiftDay === today || (state.lastDay ?? '') >= today) {
    // Orders are up to date; still fill the history added to the app later.
    const enriched = await enrichDemo(ctx);
    const todayGaps = await fillTodayGaps(ctx);
    if (todayGaps.length) await renumberOrders(ctx);
    const logins = await backfillLogins(ctx);
    const prints = await backfillPrints(ctx);
    say(
      `Заказы уже доходят до сегодняшнего дня. Дополнено: входов сотрудников за ${logins} рабочих дней, строк истории печати ${prints}${enriched.length ? `; ${enriched.join(', ')}` : ''}${todayGaps.length ? `; сегодня: ${todayGaps.join(', ')}` : ''}.`,
    );
    return;
  }

  const started = Date.now();
  let next = state.lastDay ? addDays(state.lastDay, 1) : today;
  if (state.shiftId && state.cashierId && state.shiftDay) {
    const paid = await finishOpenDay(ctx, {
      id: state.shiftId,
      cashierId: state.cashierId,
      day: state.shiftDay,
    });
    say(`${state.shiftDay}: оплачено открытых заказов ${paid}, смена закрыта`);
    next = addDays(state.shiftDay, 1);
  }

  let total = 0;
  for (let day = next; day < today; day = addDays(day, 1)) {
    const { orders } = await simulateClosedDay(ctx, day, false);
    total += orders;
    say(`${day}: смена закрыта, заказов ${orders}`);
  }
  await spoilage(ctx, zonedInstant(addDays(today, -1), 22, 45, ctx.timeZone));
  // Delivered just before today's shift opens (simulateToday opens it at 8:00
  // or three hours ago, whichever is earlier).
  await morningDelivery(
    ctx,
    new Date(
      Math.min(
        zonedInstant(today, 7, 50, ctx.timeZone).getTime(),
        Date.now() - 3 * 3600_000 - 10 * 60_000,
      ),
    ),
  );
  const todayStats = await simulateToday(ctx, today);
  await openingChange(ctx);
  const enriched = await enrichDemo(ctx);
  const todayGaps = await fillTodayGaps(ctx);
  await renumberOrders(ctx);
  const logins = await backfillLogins(ctx);
  const prints = await backfillPrints(ctx);
  say(
    `Готово за ${Math.round((Date.now() - started) / 1000)} с: ${total} заказов за пропущенные дни, сегодня оплачено ${todayStats.paid} и открыто ${todayStats.open}, смена сегодня открыта; входов сотрудников добавлено за ${logins} рабочих дней, строк истории печати ${prints}${enriched.length ? `; ${enriched.join(', ')}` : ''}${todayGaps.length ? `; сегодня: ${todayGaps.join(', ')}` : ''}.`,
  );
}

/** A small morning delivery: fresh produce and a few crates of drinks. */
async function morningDelivery(ctx: Context, at: Date): Promise<void> {
  const produce = new Map<number, Context['ingredients'][number]>();
  while (produce.size < Math.min(6, ctx.ingredients.length)) {
    const item = random.pick(ctx.ingredients);
    produce.set(item.id, item);
  }
  const drinks = ctx.dishes.filter((dish) => dish.tracked);
  const crates = new Map<number, DemoDish>();
  while (crates.size < Math.min(3, drinks.length)) {
    const dish = random.pick(drinks);
    crates.set(dish.id, dish);
  }
  const items = [
    ...[...produce.values()].map((ingredient) => ({
      itemType: StockItemType.Ingredient,
      ingredientId: ingredient.id,
      quantity: Math.max(1, Math.round(ingredient.weekly / 6)),
      purchasePrice: Math.round(
        ingredient.cost * (0.97 + random.next() * 0.06),
      ),
    })),
    ...[...crates.values()].map((dish) => ({
      itemType: StockItemType.Dish,
      dishId: dish.id,
      location: StockLocation.Sale,
      quantity: 24,
      purchasePrice: Math.round((dish.price * 0.68) / 50) * 50,
    })),
  ];
  if (!items.length) return;
  const { ids } = await ctx.services.stock.createReceipts(
    { items, comment: 'Утренняя поставка' },
    ctx.owner,
  );
  await ctx.db.query(
    `UPDATE stock_receipts SET created_at = $2 WHERE id = ANY($1::int[])`,
    [ids, at],
  );
  await ctx.db.query(
    `UPDATE stock_movements SET created_at = $2 WHERE receipt_id = ANY($1::int[])`,
    [ids, at],
  );
}

/** Change for the drawer, put in right after today's shift opened. */
async function openingChange(ctx: Context): Promise<void> {
  const [shift] = await ctx.db.query<
    { id: number; openedAt: Date; cashierId: number }[]
  >(
    `SELECT id, opened_at AS "openedAt", opened_by_id AS "cashierId" FROM shifts WHERE status = 'OPEN'`,
  );
  if (!shift) return;
  const cashier =
    ctx.cashiers.find((staff) => staff.id === shift.cashierId) ??
    ctx.cashiers[0];
  await ctx.services.shifts.addCashOperation(
    { type: CashOperationType.In, amount: 200000, comment: 'Размен монет' },
    cashier.actor,
  );
  await ctx.db.query(
    `UPDATE cash_operations SET created_at = $2 WHERE shift_id = $1`,
    [shift.id, addMinutes(new Date(shift.openedAt), 12)],
  );
}

/**
 * Today's shift has to fill every report, not only sales. At the lunchtime
 * pace of simulateToday (~25 orders) a cancelled line (6 %), a cancelled
 * order (2 %) or a counter order is pure luck, so «По отменам» and «Зал»
 * were empty for «Сегодня». Each missing kind is added once: cancelled lines
 * in several orders, two cancelled orders, counter orders, a cash
 * withdrawal and an order brought back with «Восстановить». Every part
 * checks today's shift first, so a rerun the same day adds nothing.
 * Returns what was added, for the summary line.
 */
async function fillTodayGaps(ctx: Context): Promise<string[]> {
  const today = todayInTimeZone(ctx.timeZone);
  const [shift] = await ctx.db.query<
    { id: number; openedAt: Date; cashierId: number }[]
  >(
    `SELECT id, opened_at AS "openedAt", opened_by_id AS "cashierId"
       FROM shifts
      WHERE status = 'OPEN' AND (opened_at AT TIME ZONE $1)::date::text = $2`,
    [ctx.timeZone, today],
  );
  if (!shift) return [];
  const cashier =
    ctx.cashiers.find((staff) => staff.id === shift.cashierId) ??
    ctx.cashiers[0];
  const [have] = await ctx.db.query<
    {
      lines: number;
      orders: number;
      hall: number;
      cashOut: number;
      reopened: number;
    }[]
  >(
    `SELECT
       (SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.shift_id = $1 AND o.status <> 'CANCELLED' AND i.status = 'CANCELLED')::int AS lines,
       (SELECT COUNT(*) FROM orders WHERE shift_id = $1 AND status = 'CANCELLED')::int AS orders,
       (SELECT COUNT(*) FROM orders WHERE shift_id = $1 AND type = 'HALL' AND status = 'PAID')::int AS hall,
       (SELECT COUNT(*) FROM cash_operations WHERE shift_id = $1 AND type = 'OUT')::int AS "cashOut",
       (SELECT COUNT(*) FROM orders WHERE shift_id = $1 AND reopen_count > 0)::int AS reopened`,
    [shift.id],
  );

  const added: string[] = [];
  const plans: OrderPlan[] = [];
  if (have.lines < 3) {
    plans.push(
      { type: OrderType.Table, cancelLine: true },
      { type: OrderType.Table, cancelLine: true },
      { type: OrderType.Takeaway, cancelLine: true },
      { type: OrderType.Delivery, cancelLine: true },
    );
    added.push('отменённые позиции');
  }
  if (have.orders === 0) {
    plans.push(
      { type: OrderType.Table, cancelOrder: true },
      { type: OrderType.Takeaway, cancelOrder: true },
    );
    added.push('отменённые заказы');
  }
  if (have.hall === 0) {
    plans.push(
      { type: OrderType.Hall },
      { type: OrderType.Hall },
      { type: OrderType.Hall, cancelLine: true },
    );
    added.push('заказы «Зал»');
  }

  if (plans.length) {
    // Each simulated order is settled at once, so its table is free again
    // for the next; only tables with a guest sitting right now are skipped.
    const busy = new Set(
      (
        await ctx.db.query<{ tableId: number }[]>(
          `SELECT table_id AS "tableId" FROM orders WHERE status = $1 AND table_id IS NOT NULL`,
          [OrderStatus.Open],
        )
      ).map((row) => row.tableId),
    );
    const free = ctx.tables.filter((table) => !busy.has(table.id));
    const now = new Date();
    const midnight = zonedInstant(today, 0, 0, ctx.timeZone).getTime();
    const from = Math.ceil(
      (new Date(shift.openedAt).getTime() + 20 * 60_000 - midnight) / 60_000,
    );
    const to = Math.max(
      from + 1,
      Math.floor((now.getTime() - 10 * 60_000 - midnight) / 60_000),
    );
    const minutes = plans.map(() => random.int(from, to)).sort((a, b) => a - b);
    const latest = addMinutes(now, -2);
    const timelines: OrderTimeline[] = [];
    for (const [index, plan] of plans.entries()) {
      const atTable = plan.type === OrderType.Table && free.length > 0;
      const timeline = await simulateOrder(
        ctx,
        today,
        minutes[index],
        cashier,
        atTable
          ? { ...plan, tableId: random.pick(free).id }
          : {
              ...plan,
              type:
                plan.type === OrderType.Table ? OrderType.Takeaway : plan.type,
            },
      );
      // Nothing may happen later than now.
      for (const key of ['closedAt', 'cancelledAt', 'itemCancelledAt'] as const)
        if (timeline[key] && timeline[key] > latest) timeline[key] = latest;
      timelines.push(timeline);
    }
    await backdateOrders(ctx, timelines);
  }

  if (have.cashOut === 0) {
    const expected = (await ctx.services.shifts.current())?.cash.expected ?? 0;
    const operation =
      expected > 1_500_000
        ? {
            amount: Math.floor((expected * 0.5) / 100000) * 100000,
            comment: 'Инкассация',
          }
        : expected >= 150000
          ? { amount: 150000, comment: 'Закупка: хлеб и зелень' }
          : null;
    if (operation) {
      await ctx.services.shifts.addCashOperation(
        { type: CashOperationType.Out, ...operation },
        cashier.actor,
      );
      await ctx.db.query(
        `UPDATE cash_operations SET created_at = $2 WHERE shift_id = $1 AND type = 'OUT'`,
        [shift.id, addMinutes(new Date(), -25)],
      );
      added.push('изъятие из кассы');
    }
  }

  if (have.reopened === 0) {
    // Not a table order: reopening one needs its table to be free.
    const [paid] = await ctx.db.query<{ id: number }[]>(
      `SELECT id FROM orders
        WHERE shift_id = $1 AND status = $2 AND type <> 'TABLE'
        ORDER BY closed_at DESC LIMIT 1`,
      [shift.id, OrderStatus.Paid],
    );
    if (paid) {
      await ctx.services.orders.reopen(
        paid.id,
        { reason: 'Ошиблись способом оплаты' },
        ctx.owner,
      );
      const order = await ctx.services.orders.getDetail(paid.id);
      const used = order.payments.find((payment) => !payment.isReversal)?.method
        .id;
      const other =
        ctx.methods.find((method) => method.id !== used) ?? ctx.methods[0];
      await ctx.services.orders.pay(
        order.id,
        { payments: [{ methodId: other.id, amount: order.total }] },
        cashier.actor,
      );
      added.push('восстановленный заказ');
    }
  }
  return added;
}

const TERMINAL_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const TABLET_AGENT =
  'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * Staff sign-ins for every working day that has none yet: a cashier comes in
 * before opening the shift (at the till), a waiter before their first order
 * (on a tablet); on a finished day both sign out after their last action.
 * A person-day that already has an event is skipped, so it is safe to rerun.
 * Returns how many person-days were filled.
 */
async function backfillLogins(ctx: Context): Promise<number> {
  const today = todayInTimeZone(ctx.timeZone);
  const cashierIds = new Set(ctx.cashiers.map((staff) => staff.id));
  const days = await ctx.db.query<
    { userId: number; day: string; firstAt: Date; lastAt: Date }[]
  >(
    `WITH activity AS (
       SELECT opened_by_id AS user_id, (opened_at AT TIME ZONE $1)::date AS day,
              opened_at AS first_at, COALESCE(closed_at, opened_at) AS last_at
         FROM shifts
       UNION ALL
       SELECT waiter_id, business_date, created_at,
              COALESCE(closed_at, cancelled_at, created_at)
         FROM orders
        WHERE waiter_id IS NOT NULL
     )
     SELECT a.user_id AS "userId", a.day::text AS day,
            MIN(a.first_at) AS "firstAt", MAX(a.last_at) AS "lastAt"
       FROM activity a
       JOIN users u ON u.id = a.user_id AND NOT u.is_superadmin
      WHERE NOT EXISTS (
              SELECT 1 FROM login_events e
               WHERE e.user_id = a.user_id
                 AND (e.created_at AT TIME ZONE $1)::date = a.day)
      GROUP BY a.user_id, a.day
      ORDER BY a.day, a.user_id`,
    [ctx.timeZone],
  );
  for (const row of days) {
    const atTill = cashierIds.has(row.userId);
    const ip = atTill ? '192.168.1.10' : `192.168.1.${30 + (row.userId % 60)}`;
    const agent = atTill ? TERMINAL_AGENT : TABLET_AGENT;
    await ctx.db.query(
      `INSERT INTO login_events (user_id, type, ip, user_agent, created_at) VALUES ($1, 'IN', $2, $3, $4)`,
      [
        row.userId,
        ip,
        agent,
        addMinutes(new Date(row.firstAt), -random.int(5, 25)),
      ],
    );
    if (row.day < today) {
      await ctx.db.query(
        `INSERT INTO login_events (user_id, type, ip, user_agent, created_at) VALUES ($1, 'OUT', $2, $3, $4)`,
        [
          row.userId,
          ip,
          agent,
          addMinutes(new Date(row.lastAt), random.int(3, 15)),
        ],
      );
    }
  }
  await ctx.db.query(
    `UPDATE users u SET last_login_at = e.at
       FROM (SELECT user_id, MAX(created_at) AS at FROM login_events WHERE type = 'IN' GROUP BY user_id) e
      WHERE e.user_id = u.id AND NOT u.is_superadmin`,
  );
  return days.length;
}

/**
 * Print history for orders that have none of a kind yet: the bill when the
 * order has a precheck time (printed by its waiter), the receipt of a paid
 * order at closing (by the cashier who closed it), both on the default
 * printer. Demo data only — real history is never made up. Safe to rerun.
 * Returns the number of rows added.
 */
async function backfillPrints(ctx: Context): Promise<number> {
  const bills = await ctx.db.query<unknown[]>(
    `INSERT INTO order_prints (order_id, kind, printer_id, printer_name, printed_by_id, created_at)
     SELECT o.id, 'PRECHECK'::order_print_kind, p.id, p.name,
            COALESCE(o.waiter_id, o.created_by_id), o.precheck_at
       FROM orders o
       LEFT JOIN printers p ON p.is_default AND p.is_active
      WHERE o.precheck_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM order_prints x
                         WHERE x.order_id = o.id AND x.kind = 'PRECHECK'::order_print_kind)
     RETURNING id`,
  );
  const receipts = await ctx.db.query<unknown[]>(
    `INSERT INTO order_prints (order_id, kind, printer_id, printer_name, printed_by_id, created_at)
     SELECT o.id, 'RECEIPT'::order_print_kind, p.id, p.name,
            o.closed_by_id, o.closed_at + interval '20 seconds'
       FROM orders o
       LEFT JOIN printers p ON p.is_default AND p.is_active
      WHERE o.status = 'PAID' AND o.closed_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM order_prints x
                         WHERE x.order_id = o.id AND x.kind = 'RECEIPT'::order_print_kind)
     RETURNING id`,
  );
  return bills.length + receipts.length;
}

// ─────────────────────────────── Enrichment ───────────────────────────────

/**
 * States the app supports that the daily simulation never reaches: comments
 * for the kitchen, printer addresses, a seasonal hall kept in the archive, a
 * manager, an unused trainee role and a former waiter, an archived
 * ingredient, orders brought back with «Восстановить» and two merged orders.
 * Each part looks first, so a rerun adds nothing twice. Returns what was
 * added, for the summary line.
 */
async function enrichDemo(ctx: Context): Promise<string[]> {
  const parts: [string, (ctx: Context) => Promise<boolean>][] = [
    ['комментарии к заказам и блюдам', addComments],
    ['адреса принтеров', configurePrinters],
    ['архивный зал', addSeasonalHall],
    ['менеджер, роль стажёра и бывший сотрудник', addTeamVariety],
    ['архивный ингредиент', addArchivedIngredient],
    ['восстановленные заказы', reopenSomeOrders],
    ['объединённый заказ', mergeTwoOrders],
  ];
  const added: string[] = [];
  for (const [label, part] of parts) if (await part(ctx)) added.push(label);
  return added;
}

const exists = async (ctx: Context, sql: string, params: unknown[] = []) =>
  (
    await ctx.db.query<{ found: boolean }[]>(
      `SELECT EXISTS (${sql}) AS found`,
      params,
    )
  )[0].found;

/** Comments on past orders and lines (new orders get them from pickLines). */
async function addComments(ctx: Context): Promise<boolean> {
  if (
    (await exists(
      ctx,
      `SELECT 1 FROM order_items WHERE comment IS NOT NULL`,
    )) ||
    (await exists(ctx, `SELECT 1 FROM orders WHERE comment IS NOT NULL`))
  )
    return false;
  await ctx.db.query(
    `UPDATE order_items SET comment = ($1::text[])[1 + id % array_length($1::text[], 1)]
      WHERE id % 13 = 0`,
    [KITCHEN_NOTES],
  );
  await ctx.db.query(
    `UPDATE orders SET comment = CASE type
        WHEN 'DELIVERY' THEN ($1::text[])[1 + id % array_length($1::text[], 1)]
        WHEN 'TABLE' THEN ($2::text[])[1 + id % array_length($2::text[], 1)]
        ELSE ($3::text[])[1 + id % array_length($3::text[], 1)] END
      WHERE id % 9 = 0`,
    [DELIVERY_NOTES, TABLE_NOTES, TAKEAWAY_NOTES],
  );
  return true;
}

/** Kitchen printers on the network, the bar printer plugged into its terminal. */
async function configurePrinters(ctx: Context): Promise<boolean> {
  const printers = await ctx.db.query<
    {
      id: number;
      name: string;
      connection: PrinterConnection;
      host: string | null;
    }[]
  >(
    `SELECT id, name, connection, host FROM printers WHERE is_active ORDER BY id`,
  );
  if (
    printers.some(
      (printer) => printer.host || printer.connection === PrinterConnection.Usb,
    )
  )
    return false;
  for (const [index, printer] of printers.entries()) {
    await ctx.services.printers.update(
      printer.id,
      printer.name === 'БАР'
        ? { connection: PrinterConnection.Usb, host: null, port: null }
        : {
            connection: PrinterConnection.Lan,
            host: `192.168.1.${101 + index}`,
            port: 9100,
          },
    );
  }
  return printers.length > 0;
}

/** A summer terrace closed for the season: its hall and tables are archived. */
async function addSeasonalHall(ctx: Context): Promise<boolean> {
  const name = 'Летняя терраса';
  const halls = await ctx.services.halls.listHalls({ status: 'all' });
  if (halls.some((hall) => hall.name === name)) return false;
  const hall = await ctx.services.halls.createHall({ name }, ctx.owner);
  const tableIds: number[] = [];
  for (let n = 1; n <= 4; n += 1) {
    const table = await ctx.services.halls.createTable(
      { hallId: hall.id, name: `ТЕРРАСА ${n}`, seats: 4 },
      ctx.owner,
    );
    tableIds.push(table.id);
  }
  for (const id of tableIds)
    await ctx.services.halls.updateTable(id, { isActive: false });
  await ctx.services.halls.updateHall(hall.id, { isActive: false });
  // Opened in May, closed at the start of October.
  const opened = zonedInstant('2026-05-15', 10, 0, ctx.timeZone);
  const closed = zonedInstant('2026-10-01', 11, 0, ctx.timeZone);
  await ctx.db.query(
    `UPDATE halls SET created_at = $2, updated_at = $3 WHERE id = $1`,
    [hall.id, opened, closed],
  );
  await ctx.db.query(
    `UPDATE dining_tables SET created_at = $2, updated_at = $3 WHERE id = ANY($1::int[])`,
    [tableIds, opened, closed],
  );
  return true;
}

/** A manager (reports, stock, menu — no till), a trainee role nobody has yet and a former waiter. */
async function addTeamVariety(ctx: Context): Promise<boolean> {
  const { services, owner } = ctx;
  const { items: roles } = await services.roles.list();
  let added = false;
  let managerId = roles.find((role) => role.name === 'Менеджер')?.id;
  if (!managerId) {
    managerId = (
      await services.roles.create(
        {
          name: 'Менеджер',
          description: 'Отчёты, склад и меню — без работы на кассе',
          permissions: [
            Permission.DashboardView,
            Permission.ReportsView,
            Permission.ShiftsView,
            Permission.MenuView,
            Permission.MenuManage,
            Permission.StockView,
            Permission.StockManage,
            Permission.TeamView,
          ],
        },
        owner,
      )
    ).id;
    added = true;
  }
  if (!roles.some((role) => role.name === 'Стажёр')) {
    await services.roles.create(
      {
        name: 'Стажёр',
        description: 'Первая неделя: только приём заказов',
        permissions: [
          Permission.PosAccess,
          Permission.OrdersCreate,
          Permission.OrdersServe,
        ],
      },
      owner,
    );
    added = true;
  }
  const waiterRoleId = roles.find((role) => role.name === 'Официант')?.id;
  const people = [
    {
      login: 'nodira',
      fullName: 'Нодира Каримова',
      phone: '+998 90 555 41 17',
      roleId: managerId,
      isActive: true,
    },
    {
      login: 'dilshod',
      fullName: 'Дилшод Тошпулатов',
      phone: '+998 93 210 08 64',
      roleId: waiterRoleId,
      isActive: false,
    },
  ];
  for (const person of people) {
    if (!person.roleId) continue;
    if (
      await exists(ctx, `SELECT 1 FROM users WHERE login = $1`, [person.login])
    )
      continue;
    await services.users.create(
      { ...person, roleId: person.roleId, password: STAFF_PASSWORD },
      owner,
    );
    added = true;
  }
  return added;
}

/** An ingredient the kitchen stopped buying — kept in the archive. */
async function addArchivedIngredient(ctx: Context): Promise<boolean> {
  const name = 'Кунжут';
  if (await exists(ctx, `SELECT 1 FROM ingredients WHERE name = $1`, [name]))
    return false;
  const view = await ctx.services.ingredients.create(
    {
      name,
      unit: IngredientUnit.Kilogram,
      quantity: 0,
      minQuantity: 0,
      costPrice: 58000,
    },
    ctx.owner,
  );
  await ctx.services.ingredients.archive(view.id);
  return true;
}

/**
 * «Восстановить» in today's shift: one order paid with the wrong method and
 * one where the guest ordered more after paying. Their money is reversed
 * (storno) in the open shift and each is paid again — as at a real till.
 */
async function reopenSomeOrders(ctx: Context): Promise<boolean> {
  if (await exists(ctx, `SELECT 1 FROM orders WHERE reopen_count > 0`))
    return false;
  const [shift] = await ctx.db.query<{ cashierId: number }[]>(
    `SELECT opened_by_id AS "cashierId" FROM shifts WHERE status = 'OPEN'`,
  );
  if (!shift) return false;
  const cashier =
    ctx.cashiers.find((staff) => staff.id === shift.cashierId) ??
    ctx.cashiers[0];
  // Not table orders: reopening one needs its table to be free.
  const candidates = await ctx.db.query<{ id: number }[]>(
    `SELECT o.id FROM orders o
       JOIN shifts s ON s.id = o.shift_id AND s.status = 'OPEN'
      WHERE o.status = $1 AND o.type <> 'TABLE'
      ORDER BY o.closed_at DESC LIMIT 2`,
    [OrderStatus.Paid],
  );
  if (candidates.length < 2) return false;
  const [wrongMethod, moreFood] = candidates;

  await ctx.services.orders.reopen(
    wrongMethod.id,
    { reason: 'Ошиблись способом оплаты' },
    ctx.owner,
  );
  const first = await ctx.services.orders.getDetail(wrongMethod.id);
  const usedMethod = first.payments.find((payment) => !payment.isReversal)
    ?.method.id;
  const other =
    ctx.methods.find((method) => method.id !== usedMethod) ?? ctx.methods[0];
  await ctx.services.orders.pay(
    first.id,
    { payments: [{ methodId: other.id, amount: first.total }] },
    cashier.actor,
  );

  await ctx.services.orders.reopen(
    moreFood.id,
    { reason: 'Гость дозаказал десерт' },
    ctx.owner,
  );
  const dessert =
    ctx.dishes.find((dish) => dish.name === 'Чизкейк') ??
    ctx.dishes.find((dish) => !dish.tracked);
  if (dessert) {
    await ctx.services.orders.addItems(
      moreFood.id,
      { items: [{ dishId: dessert.id, quantity: 1 }] },
      cashier.actor,
    );
  }
  const second = await ctx.services.orders.getDetail(moreFood.id);
  await ctx.services.orders.pay(
    second.id,
    { payments: buildPayments(ctx, second.total) },
    cashier.actor,
  );
  return true;
}

/** Two tables pushed together: a new table order is merged into an open one. */
async function mergeTwoOrders(ctx: Context): Promise<boolean> {
  if (
    await exists(ctx, `SELECT 1 FROM orders WHERE status = $1`, [
      OrderStatus.Merged,
    ])
  )
    return false;
  const [target] = await ctx.db.query<
    { id: number; waiterId: number | null }[]
  >(
    `SELECT o.id, o.waiter_id AS "waiterId" FROM orders o
       JOIN shifts s ON s.id = o.shift_id AND s.status = 'OPEN'
      WHERE o.status = $1 AND o.type = 'TABLE'
      ORDER BY o.created_at LIMIT 1`,
    [OrderStatus.Open],
  );
  if (!target) return false;
  const busy = new Set(
    (
      await ctx.db.query<{ tableId: number }[]>(
        `SELECT table_id AS "tableId" FROM orders WHERE status = $1 AND table_id IS NOT NULL`,
        [OrderStatus.Open],
      )
    ).map((row) => row.tableId),
  );
  const free = ctx.tables.find((table) => !busy.has(table.id));
  if (!free) return false;
  const waiter =
    ctx.waiters.find((staff) => staff.id === target.waiterId) ?? ctx.waiters[0];
  const source = await createOrder(
    ctx,
    OrderType.Table,
    ctx.cashiers[0],
    waiter,
    free.id,
  );
  await ctx.services.orders.merge(
    source.id,
    { targetOrderId: target.id },
    ctx.owner,
  );
  return true;
}

// ─────────────────────────────── Entry point ───────────────────────────────

async function buildContext(app: INestApplicationContext): Promise<Context> {
  const config = app.get(ConfigService);
  const users = app.get(UsersService);
  const login = config.getOrThrow<AuthConfig>('auth').superadmin.login;
  const owner = await users.findForLogin(login);
  if (!owner)
    throw new Error('Superadmin is missing — start the API once first');
  const identity = await users.findIdentity(owner.id);
  if (!identity) throw new Error('Superadmin is missing');
  return {
    timeZone: config.getOrThrow<AppConfig>('app').timezone,
    db: app.get(DataSource),
    owner: UsersService.toAuthUser(identity, 'demo-seed'),
    cashiers: [],
    waiters: [],
    tables: [],
    dishes: [],
    ingredients: [],
    methods: [],
    services: {
      halls: app.get(HallsService),
      printers: app.get(PrintersService),
      categories: app.get(CategoriesService),
      dishes: app.get(DishesService),
      ingredients: app.get(IngredientsService),
      stock: app.get(StockService),
      users,
      roles: app.get(RolesService),
      settings: app.get(SettingsService),
      shifts: app.get(ShiftsService),
      orders: app.get(OrdersService),
      methods: app.get(PaymentMethodsService),
    },
  };
}

/**
 * Orders were created "now" and back-dated afterwards, so their daily numbers
 * all belong to the seeding day: number them again by the day they now carry.
 */
async function renumberOrders(ctx: Context): Promise<void> {
  // Negative ids first, so the unique (business_date, number) never collides midway.
  await ctx.db.query(`UPDATE orders SET number = -id`);
  await ctx.db.query(
    `UPDATE orders SET business_date = (created_at AT TIME ZONE $1)::date`,
    [ctx.timeZone],
  );
  await ctx.db.query(
    `UPDATE orders o SET number = n.rn
       FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY business_date ORDER BY created_at, id) AS rn
               FROM orders) n
      WHERE n.id = o.id`,
  );
  await ctx.db.query(`DELETE FROM order_counters`);
  await ctx.db.query(
    `INSERT INTO order_counters (day, last_number)
     SELECT business_date, MAX(number) FROM orders GROUP BY business_date`,
  );
}

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const ctx = await buildContext(app);
    if (process.argv.includes('--catch-up')) {
      await catchUp(ctx);
      return;
    }
    if ((await ctx.services.halls.listHalls({ status: 'all' })).length > 0) {
      logger.warn('В базе уже есть залы — демо-данные не добавлены повторно.');
      return;
    }
    if (await ctx.services.shifts.currentStatus()) {
      logger.warn(
        'Есть открытая смена — закройте её или используйте пустую базу.',
      );
      return;
    }

    const today = todayInTimeZone(ctx.timeZone);
    const firstDay = addDays(today, -HISTORY_DAYS);
    const started = Date.now();
    say('Создаю справочники: залы, столы, меню, склад, сотрудники…');
    await seedCatalogue(
      ctx,
      zonedInstant(addDays(firstDay, -1), 18, 0, ctx.timeZone),
    );

    let totalOrders = 0;
    for (let offset = HISTORY_DAYS; offset >= 1; offset -= 1) {
      const day = addDays(today, -offset);
      const { orders } = await simulateClosedDay(
        ctx,
        day,
        offset === HISTORY_DAYS,
      );
      totalOrders += orders;
      say(`${day}: смена закрыта, заказов ${orders}`);
    }
    await spoilage(ctx, zonedInstant(addDays(today, -1), 22, 45, ctx.timeZone));
    const todayStats = await simulateToday(ctx, today);
    await enrichDemo(ctx);
    await fillTodayGaps(ctx);
    await renumberOrders(ctx);
    // Staff sign-ins for every working day (also sets users.last_login_at).
    await backfillLogins(ctx);
    await backfillPrints(ctx);
    say(
      `Готово за ${Math.round((Date.now() - started) / 1000)} с: ${totalOrders + todayStats.paid} оплаченных/отменённых заказов за ${HISTORY_DAYS} дней и сегодня, ${todayStats.open} открытых заказов, смена сегодня открыта.`,
    );
    say(
      `Пароль сотрудников: ${STAFF_PASSWORD} (логины: ${STAFF.map((member) => member.login).join(', ')})`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  logger.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
