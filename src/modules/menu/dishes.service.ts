import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FRACTIONAL_DISH_UNITS } from '../../common/constants/enums';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { isWhole, money, mulMoney, sumMoney } from '../../common/utils/money';
import { isForeignKeyViolation } from '../../common/utils/pg-errors';
import { TransactionService } from '../../database/transaction/transaction.service';
import { IngredientsService } from '../ingredients/ingredients.service';
import { ImageStorageService } from '../media/image-storage.service';
import { PrintersService } from '../printers/printers.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CategoriesService } from './categories.service';
import type {
  CreateDishDto,
  DishListQueryDto,
  UpdateDishDto,
} from './dto/dish.dto';
import type { Dish } from './entities/dish.entity';
import {
  DishesRepository,
  type DishWithCounts,
} from './repo/dishes.repository';

@Injectable()
export class DishesService {
  constructor(
    private readonly dishes: DishesRepository,
    private readonly categories: CategoriesService,
    private readonly printers: PrintersService,
    private readonly ingredients: IngredientsService,
    private readonly images: ImageStorageService,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(query: DishListQueryDto) {
    const [items, total] = await this.dishes.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      categoryId: query.categoryId,
      printerId: query.printerId,
      isAvailable: query.isAvailable,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'DESC',
    });
    return {
      ...paginated(
        items.map((dish) => this.toListView(dish)),
        total,
        query.page,
        query.limit,
      ),
      counts: await this.dishes.countByStatus(),
    };
  }

  async getDetail(id: number) {
    const dish = await this.dishes.findDetailed(id);
    if (!dish) throw new NotFoundException('Блюдо не найдено');
    const ingredients = (dish.ingredients ?? []).map((line) => ({
      ingredientId: line.ingredientId,
      name: line.ingredient.name,
      unit: line.ingredient.unit,
      isActive: line.ingredient.isActive,
      quantity: line.quantity,
      costPrice: line.ingredient.costPrice,
    }));
    return {
      ...this.toListView({ ...dish, ingredientsCount: ingredients.length }),
      ingredients,
      recipeCost: sumMoney(
        ingredients.map((line) => mulMoney(line.quantity, line.costPrice)),
      ),
    };
  }

  async create(dto: CreateDishDto, actor: AuthUser) {
    const id = await this.tx.run(async () => {
      await this.categories.assertUsable(dto.categoryId);
      if (dto.printerId) await this.printers.assertUsable(dto.printerId);
      if (await this.dishes.nameExistsInCategory(dto.categoryId, dto.name)) {
        throw new ConflictException(
          'Блюдо с таким названием уже есть в этой категории',
        );
      }
      const recipe = dto.ingredients ?? [];
      if (recipe.length)
        await this.ingredients.assertUsable(recipe.map((l) => l.ingredientId));

      const dish = await this.dishes.create({
        name: dto.name,
        categoryId: dto.categoryId,
        printerId: dto.printerId ?? null,
        price: dto.price,
        unit: dto.unit,
        sortOrder:
          dto.sortOrder ?? (await this.dishes.nextSortOrder(dto.categoryId)),
        isAvailable: dto.isAvailable ?? true,
        trackStock: dto.trackStock ?? false,
        createdById: actor.id,
      });
      if (recipe.length) await this.dishes.replaceIngredients(dish.id, recipe);
      return dish.id;
    });
    this.realtime.invalidate(['menu', 'stock']);
    return this.getDetail(id);
  }

  async update(id: number, dto: UpdateDishDto) {
    await this.tx.run(async () => {
      const dish = await this.getEntity(id);
      const categoryId = dto.categoryId ?? dish.categoryId;
      if (dto.categoryId !== undefined && dto.categoryId !== dish.categoryId) {
        await this.categories.assertUsable(dto.categoryId);
      }
      if (dto.printerId) await this.printers.assertUsable(dto.printerId);
      const name = dto.name ?? dish.name;
      if (
        (dto.name !== undefined || dto.categoryId !== undefined) &&
        (await this.dishes.nameExistsInCategory(categoryId, name, id))
      ) {
        throw new ConflictException(
          'Блюдо с таким названием уже есть в этой категории',
        );
      }
      if (
        dto.unit !== undefined &&
        !FRACTIONAL_DISH_UNITS.includes(dto.unit) &&
        (!isWhole(dish.saleQty) || !isWhole(dish.warehouseQty))
      ) {
        throw new ConflictException(
          'Нельзя перевести блюдо в штучный учёт: остаток содержит дробное количество. Сначала проведите инвентаризацию',
        );
      }
      if (dto.ingredients?.length) {
        await this.ingredients.assertUsable(
          dto.ingredients.map((line) => line.ingredientId),
        );
      }

      await this.dishes.update(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.printerId !== undefined
          ? { printerId: dto.printerId ?? null }
          : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isAvailable !== undefined
          ? { isAvailable: dto.isAvailable }
          : {}),
        ...(dto.trackStock !== undefined ? { trackStock: dto.trackStock } : {}),
      });
      if (dto.ingredients !== undefined) {
        await this.dishes.replaceIngredients(id, dto.ingredients);
      }
    });
    this.realtime.invalidate(['menu', 'stock']);
    return this.getDetail(id);
  }

  async setAvailability(id: number, isAvailable: boolean) {
    await this.getEntity(id);
    await this.dishes.update(id, { isAvailable });
    this.realtime.invalidate(['menu']);
    return this.getDetail(id);
  }

  async setActive(id: number, isActive: boolean): Promise<void> {
    await this.getEntity(id);
    await this.dishes.update(id, { isActive });
    this.realtime.invalidate(['menu', 'stock']);
  }

  async delete(id: number): Promise<void> {
    const dish = await this.getEntity(id);
    try {
      await this.dishes.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Блюдо использовалось в заказах или приходах — его можно только архивировать',
        );
      }
      throw error;
    }
    await this.images.remove(dish.imageUrl);
    this.realtime.invalidate(['menu', 'stock']);
  }

  async uploadImage(id: number, file: Express.Multer.File | undefined) {
    const dish = await this.getEntity(id);
    const url = await this.images.saveImage(file, 'dishes');
    try {
      await this.dishes.update(id, { imageUrl: url });
    } catch (error) {
      await this.images.remove(url);
      throw error;
    }
    await this.images.remove(dish.imageUrl);
    this.realtime.invalidate(['menu']);
    return this.getDetail(id);
  }

  async removeImage(id: number) {
    const dish = await this.getEntity(id);
    if (dish.imageUrl) {
      await this.dishes.update(id, { imageUrl: null });
      await this.images.remove(dish.imageUrl);
      this.realtime.invalidate(['menu']);
    }
    return this.getDetail(id);
  }

  async options() {
    const dishes = await this.dishes.findActiveOptions();
    return dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      unit: dish.unit,
      price: dish.price,
      costPrice: dish.costPrice,
      categoryId: dish.categoryId,
      categoryName: dish.category.name,
      trackStock: dish.trackStock,
      saleQty: dish.saleQty,
      warehouseQty: dish.warehouseQty,
    }));
  }

  /** Menu tree for the order screen: active categories → active dishes. */
  async posMenu() {
    const dishes = await this.dishes.findPosMenu();
    const categories = new Map<
      number,
      {
        id: number;
        name: string;
        dishes: ReturnType<DishesService['toPosDish']>[];
      }
    >();
    for (const dish of dishes) {
      let category = categories.get(dish.categoryId);
      if (!category) {
        category = {
          id: dish.category.id,
          name: dish.category.name,
          dishes: [],
        };
        categories.set(dish.categoryId, category);
      }
      category.dishes.push(this.toPosDish(dish));
    }
    return [...categories.values()];
  }

  /** Dishes for order lines, keyed by id (with category and printer loaded). */
  async findForOrdering(ids: number[]): Promise<Map<number, Dish>> {
    const dishes = await this.dishes.findForOrdering([...new Set(ids)]);
    return new Map(dishes.map((dish) => [dish.id, dish]));
  }

  /**
   * Unit cost snapshotted into sold lines: the recipe cost for dishes with a
   * recipe (кухня), otherwise the last purchase price (resale goods).
   */
  async unitCosts(dishes: Iterable<Dish>): Promise<Map<number, number>> {
    const list = [...dishes];
    const recipe = await this.dishes.recipeCosts(list.map((dish) => dish.id));
    return new Map(
      list.map((dish) => [
        dish.id,
        money(recipe.get(dish.id) ?? dish.costPrice),
      ]),
    );
  }

  private async getEntity(id: number): Promise<Dish> {
    const dish = await this.dishes.findById(id);
    if (!dish) throw new NotFoundException('Блюдо не найдено');
    return dish;
  }

  private toPosDish(dish: Dish) {
    return {
      id: dish.id,
      name: dish.name,
      price: dish.price,
      unit: dish.unit,
      imageUrl: dish.imageUrl,
      isAvailable: dish.isAvailable,
      trackStock: dish.trackStock,
      saleQty: dish.saleQty,
    };
  }

  private toListView(dish: DishWithCounts) {
    return {
      id: dish.id,
      name: dish.name,
      category: {
        id: dish.category.id,
        name: dish.category.name,
        isActive: dish.category.isActive,
      },
      printer: dish.printer
        ? { id: dish.printer.id, name: dish.printer.name }
        : null,
      price: dish.price,
      costPrice: dish.costPrice,
      unit: dish.unit,
      sortOrder: dish.sortOrder,
      isAvailable: dish.isAvailable,
      trackStock: dish.trackStock,
      saleQty: dish.saleQty,
      warehouseQty: dish.warehouseQty,
      imageUrl: dish.imageUrl,
      isActive: dish.isActive,
      ingredientsCount: dish.ingredientsCount,
      createdAt: dish.createdAt,
      updatedAt: dish.updatedAt,
      createdBy: dish.createdBy
        ? { id: dish.createdBy.id, fullName: dish.createdBy.fullName }
        : null,
    };
  }
}
