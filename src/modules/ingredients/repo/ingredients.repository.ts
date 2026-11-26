import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type {
  ArchiveStatus,
  SortOrder,
} from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { Ingredient } from '../entities/ingredient.entity';

export type IngredientSortKey =
  'name' | 'quantity' | 'minQuantity' | 'costPrice' | 'createdAt';

export interface IngredientListFilter {
  page: number;
  limit: number;
  search?: string;
  status: ArchiveStatus;
  lowStock?: boolean;
  sortBy: IngredientSortKey;
  sortOrder: SortOrder;
}

export interface IngredientWithUsage extends Ingredient {
  dishesCount: number;
}

@Injectable()
export class IngredientsRepository extends BaseRepository<Ingredient> {
  constructor(dataSource: DataSource) {
    super(dataSource, Ingredient);
  }

  async list(
    filter: IngredientListFilter,
  ): Promise<[IngredientWithUsage[], number]> {
    const qb = this.repo
      .createQueryBuilder('i')
      .leftJoin('i.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('dish_ingredients', 'di')
            .innerJoin('dishes', 'd', 'd.id = di.dish_id AND d.is_active')
            .where('di.ingredient_id = i.id'),
        'dishes_count',
      );
    if (filter.status === 'active') qb.andWhere('i.isActive = true');
    if (filter.status === 'archived') qb.andWhere('i.isActive = false');
    if (filter.lowStock) qb.andWhere('i.quantity <= i.minQuantity');
    if (filter.search)
      qb.andWhere('i.name ILIKE :search', {
        search: likeContains(filter.search),
      });

    const total = await qb.getCount();
    qb.orderBy(`i.${filter.sortBy}`, filter.sortOrder)
      .addOrderBy('i.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);
    const { entities, raw } = await qb.getRawAndEntities<{
      dishes_count: number;
    }>();
    return [
      entities.map((ingredient, i) => ({
        ...ingredient,
        dishesCount: Number(raw[i]?.dishes_count ?? 0),
      })),
      total,
    ];
  }

  async counts(): Promise<{
    active: number;
    archived: number;
    lowStock: number;
  }> {
    const [row] = await this.query<{
      active: number;
      archived: number;
      low_stock: number;
    }>(
      `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
              COUNT(*) FILTER (WHERE NOT is_active)::int AS archived,
              COUNT(*) FILTER (WHERE is_active AND quantity <= min_quantity)::int AS low_stock
         FROM ingredients`,
    );
    return {
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
      lowStock: Number(row?.low_stock ?? 0),
    };
  }

  findById(id: number): Promise<Ingredient | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIds(ids: number[]): Promise<Ingredient[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) } });
  }

  findActiveOptions(): Promise<Ingredient[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async nameExists(name: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('i')
      .where('lower(i.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('i.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async usage(
    id: number,
  ): Promise<{ recipes: number; movements: number; receipts: number }> {
    const [row] = await this.query<{
      recipes: number;
      movements: number;
      receipts: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM dish_ingredients di JOIN dishes d ON d.id = di.dish_id
                WHERE di.ingredient_id = $1 AND d.is_active)::int AS recipes,
              (SELECT COUNT(*) FROM stock_movements WHERE ingredient_id = $1)::int AS movements,
              (SELECT COUNT(*) FROM stock_receipts WHERE ingredient_id = $1)::int AS receipts`,
      [id],
    );
    return {
      recipes: Number(row?.recipes ?? 0),
      movements: Number(row?.movements ?? 0),
      receipts: Number(row?.receipts ?? 0),
    };
  }

  create(data: Partial<Ingredient>): Promise<Ingredient> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<Ingredient>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }
}
