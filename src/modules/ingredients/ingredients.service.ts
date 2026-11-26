import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { isForeignKeyViolation } from '../../common/utils/pg-errors';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StockService } from '../stock/stock.service';
import type {
  CreateIngredientDto,
  IngredientListQueryDto,
  UpdateIngredientDto,
} from './dto/ingredient.dto';
import type { Ingredient } from './entities/ingredient.entity';
import {
  IngredientsRepository,
  type IngredientWithUsage,
} from './repo/ingredients.repository';

@Injectable()
export class IngredientsService {
  constructor(
    private readonly ingredients: IngredientsRepository,
    private readonly stock: StockService,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(query: IngredientListQueryDto) {
    const [items, total] = await this.ingredients.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      lowStock: query.lowStock,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'ASC',
    });
    return {
      ...paginated(
        items.map((i) => this.toView(i)),
        total,
        query.page,
        query.limit,
      ),
      counts: await this.ingredients.counts(),
    };
  }

  async options() {
    const items = await this.ingredients.findActiveOptions();
    return items.map(({ id, name, unit, costPrice }) => ({
      id,
      name,
      unit,
      costPrice,
    }));
  }

  async getById(id: number): Promise<Ingredient> {
    const ingredient = await this.ingredients.findById(id);
    if (!ingredient) throw new NotFoundException('Ингредиент не найден');
    return ingredient;
  }

  async create(dto: CreateIngredientDto, actor: AuthUser) {
    const id = await this.tx.run(async () => {
      if (await this.ingredients.nameExists(dto.name)) {
        throw new ConflictException(
          'Ингредиент с таким названием уже существует',
        );
      }
      const ingredient = await this.ingredients.create({
        name: dto.name,
        unit: dto.unit,
        quantity: 0,
        minQuantity: dto.minQuantity ?? 0,
        costPrice: dto.costPrice ?? 0,
        createdById: actor.id,
      });
      if (dto.quantity && dto.quantity > 0) {
        await this.stock.adjustIngredient(
          ingredient.id,
          { quantity: dto.quantity, comment: 'Начальный остаток' },
          actor,
        );
      }
      return ingredient.id;
    });
    this.realtime.invalidate(['stock']);
    return this.toView({ ...(await this.getById(id)), dishesCount: 0 });
  }

  async update(id: number, dto: UpdateIngredientDto) {
    await this.tx.run(async () => {
      const ingredient = await this.getById(id);
      if (dto.name && (await this.ingredients.nameExists(dto.name, id))) {
        throw new ConflictException(
          'Ингредиент с таким названием уже существует',
        );
      }
      if (dto.unit && dto.unit !== ingredient.unit) {
        const usage = await this.ingredients.usage(id);
        if (usage.movements > 0 || usage.receipts > 0 || usage.recipes > 0) {
          throw new ConflictException(
            'Единицу измерения нельзя изменить: ингредиент уже используется. Создайте новый ингредиент',
          );
        }
      }
      await this.ingredients.update(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.minQuantity !== undefined
          ? { minQuantity: dto.minQuantity }
          : {}),
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
      });
    });
    this.realtime.invalidate(['stock', 'menu']);
    return this.toView({ ...(await this.getById(id)), dishesCount: 0 });
  }

  async archive(id: number): Promise<void> {
    await this.tx.run(async () => {
      const ingredient = await this.getById(id);
      if (!ingredient.isActive) return;
      const usage = await this.ingredients.usage(id);
      if (usage.recipes > 0) {
        throw new ConflictException(
          `Ингредиент используется в техкартах (${usage.recipes}). Сначала уберите его из блюд`,
        );
      }
      await this.ingredients.update(id, { isActive: false });
    });
    this.realtime.invalidate(['stock', 'menu']);
  }

  async restore(id: number): Promise<void> {
    await this.getById(id);
    await this.ingredients.update(id, { isActive: true });
    this.realtime.invalidate(['stock', 'menu']);
  }

  async delete(id: number): Promise<void> {
    await this.getById(id);
    const usage = await this.ingredients.usage(id);
    if (usage.movements > 0 || usage.receipts > 0) {
      throw new ConflictException(
        'По ингредиенту есть движения на складе — его можно только архивировать',
      );
    }
    try {
      await this.ingredients.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Ингредиент используется в техкартах блюд');
      }
      throw error;
    }
    this.realtime.invalidate(['stock', 'menu']);
  }

  /** Validates recipe references: every id must be an existing active ingredient. */
  async assertUsable(ids: number[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) {
      throw new BadRequestException(
        'Ингредиент указан в техкарте несколько раз',
      );
    }
    const found = new Map(
      (await this.ingredients.findByIds(unique)).map((i) => [i.id, i]),
    );
    for (const id of unique) {
      const ingredient = found.get(id);
      if (!ingredient) throw new BadRequestException('Ингредиент не найден');
      if (!ingredient.isActive) {
        throw new BadRequestException(
          `Ингредиент «${ingredient.name}» находится в архиве`,
        );
      }
    }
  }

  private toView(ingredient: IngredientWithUsage) {
    return {
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      quantity: ingredient.quantity,
      minQuantity: ingredient.minQuantity,
      costPrice: ingredient.costPrice,
      isLow: ingredient.quantity <= ingredient.minQuantity,
      isActive: ingredient.isActive,
      dishesCount: ingredient.dishesCount,
      createdAt: ingredient.createdAt,
      createdBy: ingredient.createdBy
        ? {
            id: ingredient.createdBy.id,
            fullName: ingredient.createdBy.fullName,
          }
        : null,
    };
  }
}
