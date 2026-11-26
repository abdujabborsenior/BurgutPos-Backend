import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  DiscountType,
  FRACTIONAL_DISH_UNITS,
  OrderItemStatus,
  OrderPrintKind,
  OrderStatus,
  OrderType,
  PaymentMethodType,
} from '../../common/constants/enums';
import { Permission } from '../../common/constants/permissions';
import { type AuthUser, hasPermission } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { optionalDateRange } from '../../common/utils/date-range';
import { dateInTimeZone } from '../../common/utils/dates';
import { isUniqueViolation } from '../../common/utils/pg-errors';
import {
  addMoney,
  compare,
  isWhole,
  money,
  mulMoney,
  qty,
  subMoney,
  subQty,
  sumMoney,
} from '../../common/utils/money';
import { TransactionService } from '../../database/transaction/transaction.service';
import { HallsService } from '../halls/halls.service';
import { DishesService } from '../menu/dishes.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { PrintersService } from '../printers/printers.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { ShiftsService } from '../shifts/shifts.service';
import { StockService } from '../stock/stock.service';
import { UsersService } from '../users/users.service';
import type {
  AddItemsDto,
  CancelItemDto,
  CancelOrderDto,
  ChangeWaiterDto,
  CreateOrderDto,
  DiscountDto,
  MergeOrderDto,
  MoveOrderDto,
  OrderLineDto,
  OrderListQueryDto,
  PayOrderDto,
  ReopenOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import type { OrderItem } from './entities/order-item.entity';
import type { OrderPrint } from './entities/order-print.entity';
import type { Order } from './entities/order.entity';
import type { Payment } from './entities/payment.entity';
import { calculateOrderTotals } from './order-calculator';
import { OrderCountersRepository } from './repo/order-counters.repository';
import { OrderItemsRepository } from './repo/order-items.repository';
import { OrderPrintsRepository } from './repo/order-prints.repository';
import { OrdersRepository } from './repo/orders.repository';
import { PaymentsRepository } from './repo/payments.repository';

const userRef = (user: { id: number; fullName: string } | null | undefined) =>
  user ? { id: user.id, fullName: user.fullName } : null;

const formatSum = (value: number) =>
  `${Math.round(value)
    .toLocaleString('ru-RU')
    .replace(/\u00a0/g, ' ')} сум`;

@Injectable()
export class OrdersService {
  private readonly timeZone: string;

  constructor(
    private readonly orders: OrdersRepository,
    private readonly items: OrderItemsRepository,
    private readonly payments: PaymentsRepository,
    private readonly orderNumbers: OrderCountersRepository,
    private readonly prints: OrderPrintsRepository,
    private readonly printers: PrintersService,
    private readonly halls: HallsService,
    private readonly dishes: DishesService,
    private readonly stock: StockService,
    private readonly shifts: ShiftsService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<AppConfig>('app').timezone;
  }

  // ───────────────────────────── Board & lists ─────────────────────────────

  async board() {
    const [halls, openOrders] = await Promise.all([
      this.halls.activeHallsWithTables(),
      this.orders.findOpenTableOrders(),
    ]);
    const counts = await this.orders.itemCounts(
      openOrders.map((order) => order.id),
    );
    const byTable = new Map(openOrders.map((order) => [order.tableId, order]));
    return halls.map((hall) => ({
      id: hall.id,
      name: hall.name,
      tables: (hall.tables ?? []).map((table) => {
        const order = byTable.get(table.id);
        return {
          id: table.id,
          name: table.name,
          seats: table.seats,
          order: order
            ? {
                id: order.id,
                number: order.number,
                createdAt: order.createdAt,
                total: order.total,
                guests: order.guests,
                itemsCount: counts.get(order.id) ?? 0,
                precheckAt: order.precheckAt,
                precheckCount: order.precheckCount,
                waiter: userRef(order.waiter),
              }
            : null,
        };
      }),
    }));
  }

  counters() {
    return this.orders.countOpenByType();
  }

  async list(query: OrderListQueryDto, actor: AuthUser) {
    const range = optionalDateRange(query);
    const { items, total, sum } = await this.orders.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      type: query.type,
      waiterId: query.mine ? actor.id : query.waiterId,
      from: range.from,
      until: range.until,
      dateField: 'createdAt',
      timeZone: this.timeZone,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'DESC',
    });
    const counts = await this.orders.itemCounts(items.map((order) => order.id));
    return {
      ...paginated(
        items.map((order) => this.toListView(order, counts.get(order.id) ?? 0)),
        total,
        query.page,
        query.limit,
      ),
      sum,
    };
  }

  async getDetail(id: number) {
    const order = await this.orders.findDetailed(id);
    if (!order) throw new NotFoundException('Заказ не найден');
    const [items, payments, prints] = await Promise.all([
      this.items.findByOrder(id),
      this.payments.findByOrder(id),
      this.prints.findByOrder(id),
    ]);
    return this.toDetailView(order, items, payments, prints);
  }

  // ─────────────────────────────── Commands ───────────────────────────────

  async create(dto: CreateOrderDto, actor: AuthUser) {
    if (dto.type !== OrderType.Table && dto.tableId !== undefined) {
      throw new BadRequestException(
        'Стол указывается только для заказов за столом',
      );
    }
    if (
      dto.type !== OrderType.Delivery &&
      (dto.deliveryAddress || dto.deliveryFee)
    ) {
      throw new BadRequestException(
        'Адрес и стоимость доставки указываются только для доставки',
      );
    }

    const { orderId, addedItemIds } = await this.tx.run(async () => {
      const shift = await this.shifts.requireOpenShift();
      const table =
        dto.type === OrderType.Table
          ? await this.halls.getTableForOrder(dto.tableId as number)
          : null;
      const waiterId = await this.resolveWaiter(dto.waiterId, actor);
      const settings = await this.settings.get();
      // The hall is the more specific rule: its own percent (0 included)
      // overrides the general setting for orders at its tables.
      const servicePercent =
        table?.hall.servicePercent ??
        (settings.serviceChargeOrderTypes.includes(dto.type)
          ? settings.serviceChargePercent
          : 0);
      const businessDate = dateInTimeZone(new Date(), this.timeZone);
      const number = await this.orderNumbers.next(businessDate);

      // The partial unique index uq_orders_open_table rejects a second open
      // order on the same table even under concurrent requests.
      const id = await this.orders.insert({
        businessDate,
        number,
        type: dto.type,
        status: OrderStatus.Open,
        tableId: table?.id ?? null,
        waiterId,
        createdById: actor.id,
        shiftId: shift.id,
        guests: dto.guests ?? null,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        deliveryAddress:
          dto.type === OrderType.Delivery
            ? (dto.deliveryAddress ?? null)
            : null,
        deliveryFee:
          dto.type === OrderType.Delivery ? money(dto.deliveryFee ?? 0) : 0,
        comment: dto.comment ?? null,
        servicePercent,
      });
      const order = await this.lockOpenOrder(id);
      const added = await this.appendItems(order, dto.items, actor);
      this.notify();
      return { orderId: id, addedItemIds: added };
    });
    return { order: await this.getDetail(orderId), addedItemIds };
  }

  async addItems(orderId: number, dto: AddItemsDto, actor: AuthUser) {
    const addedItemIds = await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      const added = await this.appendItems(order, dto.items, actor);
      this.notify();
      return added;
    });
    return { order: await this.getDetail(orderId), addedItemIds };
  }

  async cancelItem(
    orderId: number,
    itemId: number,
    dto: CancelItemDto,
    actor: AuthUser,
  ) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      const item = await this.items.findByIdForUpdate(itemId);
      if (!item || item.orderId !== orderId)
        throw new NotFoundException('Позиция не найдена');
      if (item.status !== OrderItemStatus.Active) {
        throw new ConflictException('Позиция уже отменена');
      }
      const quantity = qty(dto.quantity);
      if (compare(quantity, item.quantity) > 0) {
        throw new BadRequestException('Нельзя отменить больше, чем заказано');
      }
      if (!FRACTIONAL_DISH_UNITS.includes(item.unit) && !isWhole(quantity)) {
        throw new BadRequestException('Укажите целое количество');
      }
      const returnToStock = dto.returnToStock ?? true;
      const cancellation = {
        cancelledById: actor.id,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
        stockReturned: returnToStock,
      };

      if (compare(quantity, item.quantity) === 0) {
        await this.items.update(item.id, {
          ...cancellation,
          status: OrderItemStatus.Cancelled,
        });
      } else {
        // Partial cancellation splits the line: the active remainder keeps the
        // original id, the cancelled part becomes its own line for reporting.
        const remaining = subQty(item.quantity, quantity);
        await this.items.update(item.id, {
          quantity: remaining,
          total: mulMoney(item.price, remaining),
        });
        await this.items.insertMany([
          {
            ...this.cloneLine(item),
            quantity,
            total: mulMoney(item.price, quantity),
            status: OrderItemStatus.Cancelled,
            ...cancellation,
          },
        ]);
      }

      if (returnToStock) {
        await this.stock.returnFromSale([{ dishId: item.dishId, quantity }], {
          orderId,
          userId: actor.id,
          comment: dto.reason,
        });
      }
      await this.recalculate(order, { resetPrecheck: true });
      this.notify();
    });
    return this.getDetail(orderId);
  }

  async update(orderId: number, dto: UpdateOrderDto, actor: AuthUser) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      const isDelivery = order.type === OrderType.Delivery;
      if (!isDelivery && (dto.deliveryAddress || dto.deliveryFee)) {
        throw new BadRequestException(
          'Адрес и стоимость доставки указываются только для доставки',
        );
      }
      if (isDelivery && dto.deliveryAddress === null) {
        throw new BadRequestException('Укажите адрес доставки');
      }
      if (isDelivery && dto.customerPhone === null) {
        throw new BadRequestException('Укажите телефон клиента');
      }

      const patch: Partial<Order> = {};
      if (dto.guests !== undefined) patch.guests = dto.guests ?? null;
      if (dto.customerName !== undefined)
        patch.customerName = dto.customerName || null;
      if (dto.customerPhone !== undefined)
        patch.customerPhone = dto.customerPhone || null;
      if (dto.comment !== undefined) patch.comment = dto.comment || null;
      if (isDelivery && dto.deliveryAddress)
        patch.deliveryAddress = dto.deliveryAddress;
      if (isDelivery && dto.deliveryFee !== undefined)
        patch.deliveryFee = money(dto.deliveryFee);
      if (Object.keys(patch).length) await this.orders.update(orderId, patch);
      if (patch.deliveryFee !== undefined) {
        Object.assign(order, patch);
        await this.recalculate(order, { resetPrecheck: true });
      }
      this.notify();
    });
    return this.getDetail(orderId);
  }

  async changeWaiter(orderId: number, dto: ChangeWaiterDto, actor: AuthUser) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      if (order.waiterId === dto.waiterId) return;
      if (
        !(await this.users.isActiveWithPermission(
          dto.waiterId,
          Permission.OrdersServe,
        ))
      ) {
        throw new BadRequestException(
          'Выбранный сотрудник не может обслуживать заказы',
        );
      }
      await this.orders.update(orderId, { waiterId: dto.waiterId });
      this.notify();
    });
    return this.getDetail(orderId);
  }

  async moveToTable(orderId: number, dto: MoveOrderDto, actor: AuthUser) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      if (order.type !== OrderType.Table) {
        throw new BadRequestException(
          'Перенос на другой стол доступен только для заказов за столом',
        );
      }
      if (order.tableId === dto.tableId) {
        throw new BadRequestException('Заказ уже находится за этим столом');
      }
      const table = await this.halls.getTableForOrder(dto.tableId);
      await this.orders.update(orderId, { tableId: table.id });
      this.notify();
    });
    return this.getDetail(orderId);
  }

  /** Joins tables: moves every line of this order into the target order. */
  async merge(orderId: number, dto: MergeOrderDto, actor: AuthUser) {
    if (orderId === dto.targetOrderId) {
      throw new BadRequestException('Нельзя объединить заказ с самим собой');
    }
    await this.tx.run(async () => {
      // Lock both rows in ascending id order to rule out deadlocks.
      const [firstId, secondId] = [orderId, dto.targetOrderId].sort(
        (a, b) => a - b,
      );
      const first = await this.lockOpenOrder(firstId);
      const second = await this.lockOpenOrder(secondId);
      const source = first.id === orderId ? first : second;
      const target = first.id === orderId ? second : first;
      this.assertCanModify(source, actor);
      this.assertCanModify(target, actor);

      await this.items.moveAll(source.id, target.id);
      const guests =
        source.guests || target.guests
          ? (source.guests ?? 0) + (target.guests ?? 0)
          : null;
      await this.orders.update(target.id, { guests });
      target.guests = guests;
      await this.recalculate(target, { resetPrecheck: true });
      await this.orders.update(source.id, {
        status: OrderStatus.Merged,
        mergedIntoId: target.id,
        subtotal: 0,
        discountAmount: 0,
        serviceAmount: 0,
        total: 0,
        closedAt: new Date(),
        closedById: actor.id,
      });
      this.notify();
    });
    return this.getDetail(dto.targetOrderId);
  }

  async applyDiscount(orderId: number, dto: DiscountDto, actor: AuthUser) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      const value = money(dto.value);
      const remove = dto.type === null || value === 0;
      if (!remove && dto.type === DiscountType.Percent && value > 100) {
        throw new BadRequestException('Скидка не может превышать 100%');
      }
      if (
        !remove &&
        dto.type === DiscountType.Amount &&
        compare(value, order.subtotal) > 0
      ) {
        throw new BadRequestException('Скидка не может превышать сумму заказа');
      }
      order.discountType = remove ? null : dto.type;
      order.discountValue = remove ? 0 : value;
      await this.orders.update(orderId, {
        discountType: order.discountType,
        discountValue: order.discountValue,
      });
      await this.recalculate(order, { resetPrecheck: true });
      this.notify();
    });
    return this.getDetail(orderId);
  }

  async precheck(orderId: number, actor: AuthUser) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      if ((await this.items.countActive(orderId)) === 0) {
        throw new ConflictException('В заказе нет позиций');
      }
      await this.orders.update(orderId, {
        precheckAt: new Date(),
        precheckCount: order.precheckCount + 1,
      });
      await this.logPrint(orderId, OrderPrintKind.Precheck, actor);
      this.notify();
    });
    return this.getDetail(orderId);
  }

  /**
   * The receipt of a paid order went to the printer — right after payment or
   * reprinted later from the order or the reports. The browser prints; this
   * only adds the line to the order's print history.
   */
  async recordReceiptPrint(orderId: number, actor: AuthUser) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Заказ не найден');
    if (order.status !== OrderStatus.Paid) {
      throw new ConflictException(
        'Чек печатается только для оплаченного заказа',
      );
    }
    await this.logPrint(orderId, OrderPrintKind.Receipt, actor);
    return this.getDetail(orderId);
  }

  /** A history line: what, by whom and on which printer (its name is copied). */
  private async logPrint(
    orderId: number,
    kind: OrderPrintKind,
    actor: AuthUser,
  ) {
    const printer = await this.printers.defaultPrinter();
    await this.prints.record({
      orderId,
      kind,
      printerId: printer?.id ?? null,
      printerName: printer?.name ?? null,
      printedById: actor.id,
    });
  }

  async pay(orderId: number, dto: PayOrderDto, actor: AuthUser) {
    const settings = await this.settings.get();
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      const shift = await this.shifts.requireOpenShift();
      if ((await this.items.countActive(orderId)) === 0) {
        throw new ConflictException(
          'В заказе нет позиций. Отмените пустой заказ',
        );
      }

      const total = order.total;
      const methods = await this.paymentMethods.getActiveByIds(
        dto.payments.map((payment) => payment.methodId),
      );
      const lines = dto.payments.map((payment) => ({
        methodId: payment.methodId,
        isCash: methods.get(payment.methodId)?.type === PaymentMethodType.Cash,
        amount: money(payment.amount),
      }));
      const received = sumMoney(lines.map((line) => line.amount));
      if (total > 0 && lines.length === 0) {
        throw new BadRequestException('Укажите способ оплаты');
      }
      if (compare(received, total) < 0) {
        throw new BadRequestException(
          `Недостаточно средств: к оплате ${formatSum(total)}, внесено ${formatSum(received)}`,
        );
      }
      const change = subMoney(received, total);
      const cashReceived = sumMoney(
        lines.filter((l) => l.isCash).map((l) => l.amount),
      );
      if (compare(change, cashReceived) > 0) {
        throw new BadRequestException(
          'Сдача выдаётся только наличными: безналичная оплата превышает сумму к оплате',
        );
      }

      // Change is taken back from cash lines (last first); payments store net amounts.
      let remainingChange = change;
      for (
        let index = lines.length - 1;
        index >= 0 && remainingChange > 0;
        index -= 1
      ) {
        const line = lines[index];
        if (!line.isCash) continue;
        const deducted = Math.min(line.amount, remainingChange);
        line.amount = subMoney(line.amount, deducted);
        remainingChange = subMoney(remainingChange, deducted);
      }
      const byMethod = new Map<number, number>();
      for (const line of lines) {
        if (line.amount <= 0) continue;
        byMethod.set(
          line.methodId,
          addMoney(byMethod.get(line.methodId) ?? 0, line.amount),
        );
      }
      await this.payments.insertMany(
        [...byMethod.entries()].map(([methodId, amount]) => ({
          orderId,
          methodId,
          amount,
          shiftId: shift.id,
          cashierId: actor.id,
        })),
      );
      await this.orders.update(orderId, {
        status: OrderStatus.Paid,
        paidAmount: total,
        receivedAmount: received,
        changeAmount: change,
        waiterPercent: settings.waiterCommissionPercent,
        closedAt: new Date(),
        closedById: actor.id,
      });
      this.notify(['dashboard', 'shift']);
    });
    return this.getDetail(orderId);
  }

  async cancel(orderId: number, dto: CancelOrderDto, actor: AuthUser) {
    await this.tx.run(async () => {
      const order = await this.lockOpenOrder(orderId);
      this.assertCanModify(order, actor);
      const active = await this.items.findActiveByOrder(orderId);
      const returnToStock = dto.returnToStock ?? true;
      if (active.length && returnToStock) {
        await this.stock.returnFromSale(
          active.map((item) => ({
            dishId: item.dishId,
            quantity: item.quantity,
          })),
          { orderId, userId: actor.id, comment: dto.reason },
        );
      }
      const now = new Date();
      await this.items.cancelActive(orderId, {
        cancelledById: actor.id,
        cancelledAt: now,
        cancelReason: dto.reason,
        stockReturned: returnToStock,
      });
      // Totals are kept as a snapshot of the order at the moment of cancellation.
      await this.orders.update(orderId, {
        status: OrderStatus.Cancelled,
        cancelledAt: now,
        cancelledById: actor.id,
        cancelReason: dto.reason,
      });
      this.notify(['dashboard', 'shift']);
    });
    return this.getDetail(orderId);
  }

  /**
   * Returns a paid order to work: a wrong payment method, the guest orders
   * more, or a refund (reopen, then cancel). Payments are never deleted —
   * each method's net amount is reversed by a negative row in the open
   * shift, so closed shifts keep their figures and the current drawer is
   * corrected by exactly what is given back.
   */
  async reopen(orderId: number, dto: ReopenOrderDto, actor: AuthUser) {
    const tableBusy = new ConflictException(
      'За этим столом уже открыт другой заказ — сначала закройте или перенесите его',
    );
    await this.tx.run(async () => {
      const order = await this.orders.findByIdForUpdate(orderId);
      if (!order) throw new NotFoundException('Заказ не найден');
      if (order.status !== OrderStatus.Paid) {
        throw new ConflictException(
          order.status === OrderStatus.Open
            ? 'Заказ уже открыт'
            : 'Вернуть в работу можно только оплаченный заказ',
        );
      }
      this.assertCanModify(order, actor);
      const shift = await this.shifts.requireOpenShift();
      if (
        order.tableId !== null &&
        (await this.orders.hasOpenOrderAtTable(order.tableId, order.id))
      ) {
        throw tableBusy;
      }

      const held = await this.payments.netByMethod(orderId);
      await this.payments.insertMany(
        [...held.entries()]
          .filter(([, amount]) => amount > 0)
          .map(([methodId, amount]) => ({
            orderId,
            methodId,
            amount: money(-amount),
            isReversal: true,
            shiftId: shift.id,
            cashierId: actor.id,
          })),
      );
      try {
        await this.orders.update(orderId, {
          status: OrderStatus.Open,
          paidAmount: 0,
          receivedAmount: 0,
          changeAmount: 0,
          waiterPercent: 0,
          closedAt: null,
          closedById: null,
          precheckAt: null,
          reopenedAt: new Date(),
          reopenedById: actor.id,
          reopenReason: dto.reason,
          reopenCount: order.reopenCount + 1,
        });
      } catch (error) {
        // Lost the race for the table to an order opened a moment ago.
        if (isUniqueViolation(error, 'uq_orders_open_table')) throw tableBusy;
        throw error;
      }
      this.notify(['dashboard', 'shift']);
    });
    return this.getDetail(orderId);
  }

  // ─────────────────────────────── Internals ───────────────────────────────

  private async appendItems(
    order: Order,
    lines: OrderLineDto[],
    actor: AuthUser,
  ) {
    const dishes = await this.dishes.findForOrdering(
      lines.map((line) => line.dishId),
    );
    const prepared = lines.map((line) => {
      const dish = dishes.get(line.dishId);
      if (!dish) throw new BadRequestException('Блюдо не найдено');
      if (!dish.isActive || !dish.category.isActive) {
        throw new ConflictException(`«${dish.name}» больше нет в меню`);
      }
      if (!dish.isAvailable) {
        throw new ConflictException(`«${dish.name}» сейчас нет в наличии`);
      }
      const quantity = qty(line.quantity);
      if (!FRACTIONAL_DISH_UNITS.includes(dish.unit) && !isWhole(quantity)) {
        throw new BadRequestException(
          `«${dish.name}» продаётся поштучно — укажите целое количество`,
        );
      }
      return { dish, quantity, comment: line.comment ?? null };
    });

    await this.stock.consumeForSale(
      prepared.map((line) => ({
        dishId: line.dish.id,
        quantity: line.quantity,
      })),
      { orderId: order.id, userId: actor.id },
    );
    const costs = await this.dishes.unitCosts(dishes.values());
    const ids = await this.items.insertMany(
      prepared.map(({ dish, quantity, comment }) => ({
        orderId: order.id,
        dishId: dish.id,
        name: dish.name,
        categoryId: dish.categoryId,
        categoryName: dish.category.name,
        printerId: dish.printerId,
        printerName: dish.printer?.name ?? null,
        unit: dish.unit,
        price: dish.price,
        costPrice: costs.get(dish.id) ?? dish.costPrice,
        quantity,
        total: mulMoney(dish.price, quantity),
        comment,
        status: OrderItemStatus.Active,
        createdById: actor.id,
      })),
    );
    await this.recalculate(order, { resetPrecheck: true });
    return ids;
  }

  private async recalculate(
    order: Order,
    options: { resetPrecheck?: boolean } = {},
  ) {
    const subtotal = await this.items.sumActive(order.id);
    const totals = calculateOrderTotals({
      subtotal,
      discountType: order.discountType,
      discountValue: order.discountValue,
      servicePercent: order.servicePercent,
      deliveryFee: order.deliveryFee,
    });
    const patch: Partial<Order> = { ...totals };
    if (options.resetPrecheck && order.precheckAt) patch.precheckAt = null;
    await this.orders.update(order.id, patch);
    Object.assign(order, patch);
  }

  private async lockOpenOrder(id: number): Promise<Order> {
    const order = await this.orders.findByIdForUpdate(id);
    if (!order) throw new NotFoundException('Заказ не найден');
    if (order.status === OrderStatus.Paid)
      throw new ConflictException('Заказ уже оплачен');
    if (order.status === OrderStatus.Cancelled)
      throw new ConflictException('Заказ отменён');
    if (order.status === OrderStatus.Merged) {
      throw new ConflictException(
        `Заказ объединён с заказом #${order.mergedIntoId}`,
      );
    }
    return order;
  }

  /** Waiters work only with their own orders unless allowed to manage all. */
  private assertCanModify(order: Order, actor: AuthUser): void {
    if (hasPermission(actor, Permission.OrdersManageAll)) return;
    const ownsOrder =
      order.waiterId === actor.id ||
      (order.waiterId === null && order.createdById === actor.id);
    if (!ownsOrder) throw new ForbiddenException('Это заказ другого официанта');
  }

  private async resolveWaiter(requested: number | undefined, actor: AuthUser) {
    const actorServes =
      !actor.isSuperadmin && actor.permissions.includes(Permission.OrdersServe);
    if (requested === undefined) return actorServes ? actor.id : null;
    if (
      requested !== actor.id &&
      !hasPermission(actor, Permission.OrdersManageAll)
    ) {
      throw new ForbiddenException(
        'Недостаточно прав, чтобы назначить другого официанта',
      );
    }
    if (
      !(await this.users.isActiveWithPermission(
        requested,
        Permission.OrdersServe,
      ))
    ) {
      throw new BadRequestException(
        'Выбранный сотрудник не может обслуживать заказы',
      );
    }
    return requested;
  }

  private cloneLine(item: OrderItem): Partial<OrderItem> {
    return {
      orderId: item.orderId,
      dishId: item.dishId,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      printerId: item.printerId,
      printerName: item.printerName,
      unit: item.unit,
      price: item.price,
      costPrice: item.costPrice,
      comment: item.comment,
      createdById: item.createdById,
    };
  }

  private notify(extra: ('dashboard' | 'shift')[] = []) {
    this.realtime.invalidate(['board', 'orders', 'counters', ...extra]);
  }

  private toListView(order: Order, itemsCount: number) {
    return {
      id: order.id,
      number: order.number,
      businessDate: order.businessDate,
      shiftId: order.shiftId,
      type: order.type,
      status: order.status,
      table: order.table
        ? {
            id: order.table.id,
            name: order.table.name,
            hall: order.table.hall
              ? { id: order.table.hall.id, name: order.table.hall.name }
              : null,
          }
        : null,
      waiter: userRef(order.waiter),
      createdBy: userRef(order.createdBy),
      closedBy: userRef(order.closedBy),
      guests: order.guests,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      comment: order.comment,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      serviceAmount: order.serviceAmount,
      deliveryFee: order.deliveryFee,
      total: order.total,
      itemsCount,
      precheckAt: order.precheckAt,
      precheckCount: order.precheckCount,
      reopenCount: order.reopenCount,
      createdAt: order.createdAt,
      closedAt: order.closedAt,
    };
  }

  private toDetailView(
    order: Order,
    items: OrderItem[],
    payments: Payment[],
    prints: OrderPrint[],
  ) {
    return {
      ...this.toListView(
        order,
        items
          .filter((item) => item.status === OrderItemStatus.Active)
          .reduce((sum, item) => sum + item.quantity, 0),
      ),
      discountType: order.discountType,
      discountValue: order.discountValue,
      servicePercent: order.servicePercent,
      paidAmount: order.paidAmount,
      receivedAmount: order.receivedAmount,
      changeAmount: order.changeAmount,
      cancelledAt: order.cancelledAt,
      cancelledBy: userRef(order.cancelledBy),
      cancelReason: order.cancelReason,
      mergedIntoId: order.mergedIntoId,
      reopenedAt: order.reopenedAt,
      reopenedBy: userRef(order.reopenedBy),
      reopenReason: order.reopenReason,
      updatedAt: order.updatedAt,
      items: items.map((item) => ({
        id: item.id,
        dishId: item.dishId,
        name: item.name,
        categoryName: item.categoryName,
        printerId: item.printerId,
        printerName: item.printerName,
        unit: item.unit,
        price: item.price,
        quantity: item.quantity,
        total: item.total,
        comment: item.comment,
        status: item.status,
        createdAt: item.createdAt,
        createdBy: userRef(item.createdBy),
        cancelledAt: item.cancelledAt,
        cancelledBy: userRef(item.cancelledBy),
        cancelReason: item.cancelReason,
        stockReturned: item.stockReturned,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        method: {
          id: payment.method.id,
          name: payment.method.name,
          type: payment.method.type,
        },
        amount: payment.amount,
        isReversal: payment.isReversal,
        createdAt: payment.createdAt,
        cashier: userRef(payment.cashier),
      })),
      prints: prints.map((print) => ({
        id: print.id,
        kind: print.kind,
        printerName: print.printerName,
        printedBy: userRef(print.printedBy),
        createdAt: print.createdAt,
      })),
    };
  }
}
