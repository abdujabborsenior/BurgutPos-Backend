import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  FRACTIONAL_DISH_UNITS,
  StockItemType,
  StockLocation,
  StockMovementType,
} from '../../common/constants/enums';
import {
  DISH_UNIT_LABELS,
  formatQuantity,
  INGREDIENT_UNIT_LABELS,
  LOCATION_LABELS,
} from '../../common/constants/labels';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { optionalDateRange } from '../../common/utils/date-range';
import {
  addQty,
  compare,
  isWhole,
  mulMoney,
  mulQty,
  qty,
  subQty,
} from '../../common/utils/money';
import { TransactionService } from '../../database/transaction/transaction.service';
import type { Dish } from '../menu/entities/dish.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import type {
  ArchiveReceiptDto,
  BalanceQueryDto,
  CreateReceiptsDto,
  DishAdjustDto,
  DishWriteOffDto,
  IngredientAdjustDto,
  IngredientWriteOffDto,
  MovementListQueryDto,
  ReceiptLineDto,
  ReceiptListQueryDto,
  SetTrackingDto,
  StockAdjustMode,
  TransferDto,
} from './dto/stock.dto';
import type { StockMovement } from './entities/stock-movement.entity';
import type { StockReceipt } from './entities/stock-receipt.entity';
import {
  type DishStockRow,
  type IngredientStockRow,
  StockLevelsRepository,
} from './repo/stock-levels.repository';
import {
  type NewMovement,
  StockMovementsRepository,
} from './repo/stock-movements.repository';
import { StockReceiptsRepository } from './repo/stock-receipts.repository';

export interface SaleLine {
  dishId: number;
  quantity: number;
}

export interface SaleContext {
  orderId: number;
  userId: number;
  comment?: string | null;
}

const other = (location: StockLocation): StockLocation =>
  location === StockLocation.Sale
    ? StockLocation.Warehouse
    : StockLocation.Sale;

const balanceAt = (row: DishStockRow, location: StockLocation): number =>
  location === StockLocation.Sale ? row.saleQty : row.warehouseQty;

@Injectable()
export class StockService {
  private readonly timeZone: string;

  constructor(
    private readonly levels: StockLevelsRepository,
    private readonly movements: StockMovementsRepository,
    private readonly receipts: StockReceiptsRepository,
    private readonly settings: SettingsService,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<AppConfig>('app').timezone;
  }

  // ────────────────────────────── Balance ──────────────────────────────

  async balance(query: BalanceQueryDto) {
    const [items, total] = await this.levels.balance({
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.categoryId,
      tracked: query.tracked,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'ASC',
    });
    return paginated(
      items.map((dish) => this.toBalanceView(dish)),
      total,
      query.page,
      query.limit,
    );
  }

  async setTracking(dishId: number, dto: SetTrackingDto) {
    await this.tx.run(async () => {
      const dish = await this.lockDish(dishId);
      this.assertDishActive(dish);
      if (dish.trackStock !== dto.trackStock) {
        await this.levels.updateDishFields(dishId, {
          trackStock: dto.trackStock,
        });
      }
    });
    this.realtime.invalidate(['stock', 'menu']);
    return this.dishView(dishId);
  }

  async transferDish(dishId: number, dto: TransferDto, actor: AuthUser) {
    const quantity = qty(dto.quantity);
    await this.tx.run(async () => {
      const dish = await this.lockDish(dishId);
      this.assertDishActive(dish);
      if (!dish.trackStock) {
        throw new ConflictException('Для перемещения включите учёт остатка');
      }
      this.assertDishQuantity(dish, quantity);
      const from = dto.from;
      const to = other(from);
      const available = balanceAt(dish, from);
      if (compare(available, quantity) < 0) {
        throw new ConflictException(
          `Недостаточно ${LOCATION_LABELS[from]}: доступно ${formatQuantity(available)} ${DISH_UNIT_LABELS[dish.unit]}`,
        );
      }
      const saleDelta = from === StockLocation.Warehouse ? quantity : -quantity;
      const row = await this.levels.changeDishQty(
        dishId,
        saleDelta,
        -saleDelta,
      );
      const comment = dto.comment ?? null;
      await this.movements.insert([
        this.dishMovement(
          dishId,
          StockMovementType.Transfer,
          from,
          -quantity,
          balanceAt(row, from),
          actor,
          comment,
        ),
        this.dishMovement(
          dishId,
          StockMovementType.Transfer,
          to,
          quantity,
          balanceAt(row, to),
          actor,
          comment,
        ),
      ]);
    });
    this.realtime.invalidate(['stock', 'menu']);
    return this.dishView(dishId);
  }

  async writeOffDish(dishId: number, dto: DishWriteOffDto, actor: AuthUser) {
    const quantity = qty(dto.quantity);
    await this.tx.run(async () => {
      const dish = await this.lockDish(dishId);
      this.assertDishActive(dish);
      this.assertDishQuantity(dish, quantity);
      const available = balanceAt(dish, dto.location);
      if (compare(available, quantity) < 0) {
        throw new ConflictException(
          `Нельзя списать больше остатка: ${LOCATION_LABELS[dto.location]} ${formatQuantity(available)} ${DISH_UNIT_LABELS[dish.unit]}`,
        );
      }
      const row = await this.levels.changeDishQty(
        dishId,
        dto.location === StockLocation.Sale ? -quantity : 0,
        dto.location === StockLocation.Warehouse ? -quantity : 0,
      );
      await this.movements.insert([
        this.dishMovement(
          dishId,
          StockMovementType.WriteOff,
          dto.location,
          -quantity,
          balanceAt(row, dto.location),
          actor,
          dto.reason,
        ),
      ]);
    });
    this.realtime.invalidate(['stock', 'menu']);
    return this.dishView(dishId);
  }

  async adjustDish(dishId: number, dto: DishAdjustDto, actor: AuthUser) {
    const mode = dto.mode ?? 'set';
    if (dto.saleQty === undefined && dto.warehouseQty === undefined) {
      throw new BadRequestException('Укажите остаток');
    }
    await this.tx.run(async () => {
      const dish = await this.lockDish(dishId);
      this.assertDishActive(dish);
      // Targets are resolved under the row lock, so «добавить»/«убрать» count
      // from what the dish holds right now and never overwrite a sale that
      // landed while the window was open.
      const targetSale = this.resolveAdjustTarget(
        dish,
        mode,
        dish.saleQty,
        dto.saleQty,
        StockLocation.Sale,
      );
      const targetWarehouse = this.resolveAdjustTarget(
        dish,
        mode,
        dish.warehouseQty,
        dto.warehouseQty,
        StockLocation.Warehouse,
      );
      this.assertDishQuantity(dish, targetSale, true);
      this.assertDishQuantity(dish, targetWarehouse, true);
      const saleDelta = subQty(targetSale, dish.saleQty);
      const warehouseDelta = subQty(targetWarehouse, dish.warehouseQty);
      if (saleDelta === 0 && warehouseDelta === 0) return;

      const row = await this.levels.changeDishQty(
        dishId,
        saleDelta,
        warehouseDelta,
      );
      const comment = dto.comment ?? 'Инвентаризация';
      const rows: NewMovement[] = [];
      if (saleDelta !== 0) {
        rows.push(
          this.dishMovement(
            dishId,
            StockMovementType.Adjustment,
            StockLocation.Sale,
            saleDelta,
            row.saleQty,
            actor,
            comment,
          ),
        );
      }
      if (warehouseDelta !== 0) {
        rows.push(
          this.dishMovement(
            dishId,
            StockMovementType.Adjustment,
            StockLocation.Warehouse,
            warehouseDelta,
            row.warehouseQty,
            actor,
            comment,
          ),
        );
      }
      await this.movements.insert(rows);
    });
    this.realtime.invalidate(['stock', 'menu']);
    return this.dishView(dishId);
  }

  async writeOffIngredient(
    ingredientId: number,
    dto: IngredientWriteOffDto,
    actor: AuthUser,
  ) {
    const quantity = qty(dto.quantity);
    await this.tx.run(async () => {
      const ingredient = await this.lockIngredient(ingredientId);
      this.assertIngredientActive(ingredient);
      if (compare(ingredient.quantity, quantity) < 0) {
        throw new ConflictException(
          `Нельзя списать больше остатка: ${formatQuantity(Math.max(ingredient.quantity, 0))} ${INGREDIENT_UNIT_LABELS[ingredient.unit]}`,
        );
      }
      const row = await this.levels.changeIngredientQty(
        ingredientId,
        -quantity,
      );
      await this.movements.insert([
        this.ingredientMovement(
          ingredientId,
          StockMovementType.WriteOff,
          -quantity,
          row?.quantity ?? 0,
          actor.id,
          dto.reason,
        ),
      ]);
    });
    this.realtime.invalidate(['stock']);
  }

  /** Sets an absolute ingredient quantity (inventory count or initial stock). */
  async adjustIngredient(
    ingredientId: number,
    dto: IngredientAdjustDto,
    actor: AuthUser,
  ) {
    const target = qty(dto.quantity);
    await this.tx.run(async () => {
      const ingredient = await this.lockIngredient(ingredientId);
      this.assertIngredientActive(ingredient);
      const delta = subQty(target, ingredient.quantity);
      if (delta === 0) return;
      const row = await this.levels.changeIngredientQty(ingredientId, delta);
      await this.movements.insert([
        this.ingredientMovement(
          ingredientId,
          StockMovementType.Adjustment,
          delta,
          row?.quantity ?? target,
          actor.id,
          dto.comment ?? 'Инвентаризация',
        ),
      ]);
    });
    this.realtime.invalidate(['stock']);
  }

  // ────────────────────────────── Receipts ──────────────────────────────

  async listReceipts(query: ReceiptListQueryDto) {
    const range = optionalDateRange(query);
    const filter = {
      search: query.search,
      archived: query.archived,
      itemType: query.itemType,
      dishId: query.dishId,
      ingredientId: query.ingredientId,
      from: range.from,
      until: range.until,
      timeZone: this.timeZone,
    };
    const [items, total] = await this.receipts.list({
      ...filter,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'DESC',
    });
    const summary = await this.receipts.summary(filter);
    return {
      ...paginated(
        items.map((r) => this.toReceiptView(r)),
        total,
        query.page,
        query.limit,
      ),
      summary,
    };
  }

  async createReceipts(dto: CreateReceiptsDto, actor: AuthUser) {
    for (const line of dto.items) {
      if (
        line.itemType === StockItemType.Ingredient &&
        (line.location || line.salePrice != null)
      ) {
        throw new BadRequestException(
          'Для ингредиентов не указываются место хранения и цена продажи',
        );
      }
    }
    // Lock order: dishes by id, then ingredients by id — same as every other
    // path. Results are reported back in the order the lines were submitted.
    const order = dto.items
      .map((line, index) => ({ line, index }))
      .sort((a, b) => {
        if (a.line.itemType !== b.line.itemType) {
          return a.line.itemType === StockItemType.Dish ? -1 : 1;
        }
        const idA = a.line.dishId ?? a.line.ingredientId ?? 0;
        const idB = b.line.dishId ?? b.line.ingredientId ?? 0;
        return idA - idB || a.index - b.index;
      });

    const ids = await this.tx.run(async () => {
      const created = new Array<number>(dto.items.length);
      for (const { line, index } of order) {
        created[index] =
          line.itemType === StockItemType.Dish
            ? await this.receiveDish(line, dto.comment, actor)
            : await this.receiveIngredient(line, dto.comment, actor);
      }
      return created;
    });
    this.realtime.invalidate(['stock', 'menu']);
    return { created: ids.length, ids };
  }

  async archiveReceipt(id: number, dto: ArchiveReceiptDto, actor: AuthUser) {
    const settings = await this.settings.get();
    await this.tx.run(async () => {
      const receipt = await this.receipts.findByIdForUpdate(id);
      if (!receipt) throw new NotFoundException('Приход не найден');
      if (receipt.isArchived)
        throw new ConflictException('Приход уже в архиве');
      const quantity = receipt.quantity;
      const comment = dto.reason
        ? `Отмена прихода: ${dto.reason}`
        : 'Отмена прихода';

      if (
        receipt.itemType === StockItemType.Dish &&
        receipt.dishId &&
        receipt.location
      ) {
        const dish = await this.lockDish(receipt.dishId);
        const location = receipt.location;
        const available = balanceAt(dish, location);
        if (!settings.allowNegativeStock && compare(available, quantity) < 0) {
          throw new ConflictException(
            `Недостаточно остатка для отмены прихода «${dish.name}»: ${LOCATION_LABELS[location]} ${formatQuantity(available)} ${DISH_UNIT_LABELS[dish.unit]}`,
          );
        }
        const row = await this.levels.changeDishQty(
          dish.id,
          location === StockLocation.Sale ? -quantity : 0,
          location === StockLocation.Warehouse ? -quantity : 0,
        );
        await this.movements.insert([
          {
            ...this.dishMovement(
              dish.id,
              StockMovementType.ReceiptCancel,
              location,
              -quantity,
              balanceAt(row, location),
              actor,
              comment,
            ),
            receiptId: receipt.id,
          },
        ]);
      } else if (receipt.ingredientId) {
        const ingredient = await this.lockIngredient(receipt.ingredientId);
        const row = await this.levels.changeIngredientQty(
          ingredient.id,
          -quantity,
        );
        await this.movements.insert([
          {
            ...this.ingredientMovement(
              ingredient.id,
              StockMovementType.ReceiptCancel,
              -quantity,
              row?.quantity ?? 0,
              actor.id,
              comment,
            ),
            receiptId: receipt.id,
          },
        ]);
      }

      await this.receipts.archive(id, {
        archivedAt: new Date(),
        archivedById: actor.id,
        archiveReason: dto.reason ?? null,
      });
    });
    this.realtime.invalidate(['stock', 'menu']);
    const receipt = await this.receipts.findDetailed(id);
    return receipt ? this.toReceiptView(receipt) : null;
  }

  // ────────────────────────────── History ──────────────────────────────

  async listMovements(query: MovementListQueryDto) {
    const range = optionalDateRange(query);
    const [items, total] = await this.movements.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      itemType: query.itemType,
      dishId: query.dishId,
      ingredientId: query.ingredientId,
      type: query.type,
      location: query.location,
      userId: query.userId,
      orderId: query.orderId,
      from: range.from,
      until: range.until,
      timeZone: this.timeZone,
    });
    const numbers = await this.movements.orderNumbers([
      ...new Set(
        items.map((m) => m.orderId).filter((id): id is number => id !== null),
      ),
    ]);
    return paginated(
      items.map((m) => ({
        ...this.toMovementView(m),
        orderNumber:
          m.orderId === null ? null : (numbers.get(m.orderId) ?? null),
      })),
      total,
      query.page,
      query.limit,
    );
  }

  // ─────────────────────── Sales (used by the orders module) ───────────────────────

  /**
   * Deducts stock for sold lines: on-sale quantity of tracked dishes and the
   * ingredients of their recipes. Must run inside the order's transaction,
   * after the order row has been locked.
   */
  async consumeForSale(lines: SaleLine[], context: SaleContext): Promise<void> {
    const settings = await this.settings.get();
    const byDish = this.aggregate(lines);
    const rows: NewMovement[] = [];

    for (const [dishId, quantity] of byDish) {
      const row = await this.levels.changeTrackedSaleQty(dishId, -quantity);
      if (!row) continue;
      if (row.saleQty < 0 && !settings.allowNegativeStock) {
        const available = Math.max(addQty(row.saleQty, quantity), 0);
        throw new ConflictException(
          `Недостаточно остатка «${row.name}»: в продаже ${formatQuantity(available)} ${DISH_UNIT_LABELS[row.unit]}`,
        );
      }
      rows.push({
        itemType: StockItemType.Dish,
        dishId,
        type: StockMovementType.Sale,
        location: StockLocation.Sale,
        quantity: -quantity,
        balanceAfter: row.saleQty,
        orderId: context.orderId,
        createdById: context.userId,
        comment: context.comment ?? null,
      });
    }

    for (const [ingredientId, quantity] of await this.ingredientNeeds(byDish)) {
      const row = await this.levels.changeIngredientQty(
        ingredientId,
        -quantity,
      );
      if (!row) continue;
      rows.push({
        itemType: StockItemType.Ingredient,
        ingredientId,
        type: StockMovementType.Sale,
        quantity: -quantity,
        balanceAfter: row.quantity,
        orderId: context.orderId,
        createdById: context.userId,
        comment: context.comment ?? null,
      });
    }
    await this.movements.insert(rows);
    if (rows.length) this.realtime.invalidate(['stock']);
  }

  /** Returns stock of cancelled lines (inverse of consumeForSale). */
  async returnFromSale(lines: SaleLine[], context: SaleContext): Promise<void> {
    const byDish = this.aggregate(lines);
    const rows: NewMovement[] = [];

    for (const [dishId, quantity] of byDish) {
      const row = await this.levels.changeTrackedSaleQty(dishId, quantity);
      if (!row) continue;
      rows.push({
        itemType: StockItemType.Dish,
        dishId,
        type: StockMovementType.SaleReturn,
        location: StockLocation.Sale,
        quantity,
        balanceAfter: row.saleQty,
        orderId: context.orderId,
        createdById: context.userId,
        comment: context.comment ?? null,
      });
    }
    for (const [ingredientId, quantity] of await this.ingredientNeeds(byDish)) {
      const row = await this.levels.changeIngredientQty(ingredientId, quantity);
      if (!row) continue;
      rows.push({
        itemType: StockItemType.Ingredient,
        ingredientId,
        type: StockMovementType.SaleReturn,
        quantity,
        balanceAfter: row.quantity,
        orderId: context.orderId,
        createdById: context.userId,
        comment: context.comment ?? null,
      });
    }
    await this.movements.insert(rows);
    if (rows.length) this.realtime.invalidate(['stock']);
  }

  // ───────────────────────────── Internals ─────────────────────────────

  private async receiveDish(
    line: ReceiptLineDto,
    fallbackComment: string | undefined,
    actor: AuthUser,
  ) {
    const dishId = line.dishId as number;
    const quantity = qty(line.quantity);
    const dish = await this.lockDish(dishId);
    this.assertDishActive(dish);
    this.assertDishQuantity(dish, quantity);
    const location = line.location ?? StockLocation.Warehouse;

    const row = await this.levels.changeDishQty(
      dishId,
      location === StockLocation.Sale ? quantity : 0,
      location === StockLocation.Warehouse ? quantity : 0,
    );
    const salePrice = line.salePrice ?? dish.price;
    await this.levels.updateDishFields(dishId, {
      costPrice: line.purchasePrice,
      ...(dish.trackStock ? {} : { trackStock: true }),
      ...(line.salePrice != null && compare(line.salePrice, dish.price) !== 0
        ? { price: line.salePrice }
        : {}),
    });
    const comment = line.comment ?? fallbackComment ?? null;
    const receiptId = await this.receipts.insert({
      itemType: StockItemType.Dish,
      dishId,
      ingredientId: null,
      location,
      quantity,
      purchasePrice: line.purchasePrice,
      salePrice,
      total: mulMoney(quantity, line.purchasePrice),
      comment,
      createdById: actor.id,
    });
    await this.movements.insert([
      {
        ...this.dishMovement(
          dishId,
          StockMovementType.Receipt,
          location,
          quantity,
          balanceAt(row, location),
          actor,
          comment,
        ),
        receiptId,
      },
    ]);
    return receiptId;
  }

  private async receiveIngredient(
    line: ReceiptLineDto,
    fallbackComment: string | undefined,
    actor: AuthUser,
  ) {
    const ingredientId = line.ingredientId as number;
    const quantity = qty(line.quantity);
    const ingredient = await this.lockIngredient(ingredientId);
    this.assertIngredientActive(ingredient);
    const row = await this.levels.changeIngredientQty(ingredientId, quantity);
    await this.levels.setIngredientCost(ingredientId, line.purchasePrice);
    const comment = line.comment ?? fallbackComment ?? null;
    const receiptId = await this.receipts.insert({
      itemType: StockItemType.Ingredient,
      dishId: null,
      ingredientId,
      location: null,
      quantity,
      purchasePrice: line.purchasePrice,
      salePrice: null,
      total: mulMoney(quantity, line.purchasePrice),
      comment,
      createdById: actor.id,
    });
    await this.movements.insert([
      {
        ...this.ingredientMovement(
          ingredientId,
          StockMovementType.Receipt,
          quantity,
          row?.quantity ?? quantity,
          actor.id,
          comment,
        ),
        receiptId,
      },
    ]);
    return receiptId;
  }

  /** Sums quantities per dish and returns entries sorted by dish id (lock order). */
  private aggregate(lines: SaleLine[]): Map<number, number> {
    const totals = new Map<number, number>();
    for (const line of lines) {
      totals.set(
        line.dishId,
        addQty(totals.get(line.dishId) ?? 0, line.quantity),
      );
    }
    return new Map([...totals.entries()].sort(([a], [b]) => a - b));
  }

  private async ingredientNeeds(
    byDish: Map<number, number>,
  ): Promise<Map<number, number>> {
    const recipe = await this.levels.recipeLines([...byDish.keys()]);
    const needs = new Map<number, number>();
    for (const line of recipe) {
      const dishQty = byDish.get(line.dishId) ?? 0;
      needs.set(
        line.ingredientId,
        addQty(
          needs.get(line.ingredientId) ?? 0,
          mulQty(line.quantity, dishQty),
        ),
      );
    }
    return new Map(
      [...needs.entries()]
        .filter(([, quantity]) => quantity > 0)
        .sort(([a], [b]) => a - b),
    );
  }

  private async lockDish(id: number): Promise<DishStockRow> {
    const dish = await this.levels.lockDish(id);
    if (!dish) throw new NotFoundException('Позиция не найдена');
    return dish;
  }

  private async lockIngredient(id: number): Promise<IngredientStockRow> {
    const ingredient = await this.levels.lockIngredient(id);
    if (!ingredient) throw new NotFoundException('Ингредиент не найден');
    return ingredient;
  }

  private assertDishActive(dish: DishStockRow): void {
    if (!dish.isActive)
      throw new ConflictException(`Позиция «${dish.name}» находится в архиве`);
  }

  private assertIngredientActive(ingredient: IngredientStockRow): void {
    if (!ingredient.isActive) {
      throw new ConflictException(
        `Ингредиент «${ingredient.name}» находится в архиве`,
      );
    }
  }

  private assertDishQuantity(
    dish: DishStockRow,
    quantity: number,
    allowZero = false,
  ): void {
    if (!allowZero && quantity <= 0) {
      throw new BadRequestException('Количество должно быть больше нуля');
    }
    if (!FRACTIONAL_DISH_UNITS.includes(dish.unit) && !isWhole(quantity)) {
      throw new BadRequestException(
        `«${dish.name}» учитывается поштучно — укажите целое количество`,
      );
    }
  }

  /**
   * What a location must hold after the adjustment. An omitted input leaves it
   * untouched — that is how «Изменить остаток» changes the sale quantity without
   * echoing back a warehouse number it read minutes ago. A «убрать» that would go
   * below zero is refused by name instead of being clamped, so taking away more
   * than there is never quietly turns into zeroing the dish.
   */
  private resolveAdjustTarget(
    dish: DishStockRow,
    mode: StockAdjustMode,
    current: number,
    input: number | undefined,
    location: StockLocation,
  ): number {
    if (input === undefined) return current;
    const value = qty(input);
    if (mode === 'set') return value;
    if (mode === 'add') return addQty(current, value);
    const target = subQty(current, value);
    if (target < 0) {
      throw new BadRequestException(
        `Нельзя убрать больше остатка: ${LOCATION_LABELS[location]} ${formatQuantity(current)} ${DISH_UNIT_LABELS[dish.unit]}`,
      );
    }
    return target;
  }

  private dishMovement(
    dishId: number,
    type: StockMovementType,
    location: StockLocation,
    quantity: number,
    balanceAfter: number,
    actor: AuthUser,
    comment: string | null,
  ): NewMovement {
    return {
      itemType: StockItemType.Dish,
      dishId,
      type,
      location,
      quantity,
      balanceAfter,
      createdById: actor.id,
      comment,
    };
  }

  private ingredientMovement(
    ingredientId: number,
    type: StockMovementType,
    quantity: number,
    balanceAfter: number,
    userId: number,
    comment: string | null,
  ): NewMovement {
    return {
      itemType: StockItemType.Ingredient,
      ingredientId,
      type,
      quantity,
      balanceAfter,
      createdById: userId,
      comment,
    };
  }

  private async dishView(dishId: number) {
    const dish = await this.levels.findDish(dishId);
    if (!dish) throw new NotFoundException('Позиция не найдена');
    return {
      id: dish.id,
      name: dish.name,
      unit: dish.unit,
      trackStock: dish.trackStock,
      saleQty: dish.saleQty,
      warehouseQty: dish.warehouseQty,
      totalQty: addQty(dish.saleQty, dish.warehouseQty),
    };
  }

  private toBalanceView(dish: Dish) {
    return {
      id: dish.id,
      name: dish.name,
      unit: dish.unit,
      category: { id: dish.category.id, name: dish.category.name },
      trackStock: dish.trackStock,
      isAvailable: dish.isAvailable,
      saleQty: dish.saleQty,
      warehouseQty: dish.warehouseQty,
      totalQty: addQty(dish.saleQty, dish.warehouseQty),
    };
  }

  private toReceiptView(receipt: StockReceipt) {
    const item = receipt.dish ?? receipt.ingredient;
    return {
      id: receipt.id,
      itemType: receipt.itemType,
      item: item ? { id: item.id, name: item.name, unit: item.unit } : null,
      location: receipt.location,
      quantity: receipt.quantity,
      purchasePrice: receipt.purchasePrice,
      salePrice: receipt.salePrice,
      total: receipt.total,
      comment: receipt.comment,
      createdAt: receipt.createdAt,
      createdBy: receipt.createdBy
        ? { id: receipt.createdBy.id, fullName: receipt.createdBy.fullName }
        : null,
      isArchived: receipt.isArchived,
      archivedAt: receipt.archivedAt,
      archivedBy: receipt.archivedBy
        ? { id: receipt.archivedBy.id, fullName: receipt.archivedBy.fullName }
        : null,
      archiveReason: receipt.archiveReason,
    };
  }

  private toMovementView(movement: StockMovement) {
    const item = movement.dish ?? movement.ingredient;
    return {
      id: movement.id,
      createdAt: movement.createdAt,
      itemType: movement.itemType,
      item: item ? { id: item.id, name: item.name, unit: item.unit } : null,
      type: movement.type,
      location: movement.location,
      quantity: movement.quantity,
      balanceAfter: movement.balanceAfter,
      orderId: movement.orderId,
      receiptId: movement.receiptId,
      comment: movement.comment,
      createdBy: movement.createdBy
        ? { id: movement.createdBy.id, fullName: movement.createdBy.fullName }
        : null,
    };
  }
}
