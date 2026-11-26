import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type {
  ArchiveStatus,
  SortOrder,
} from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { DishIngredient } from '../entities/dish-ingredient.entity';
import { Dish } from '../entities/dish.entity';

export type DishSortKey =
  | 'name'
  | 'sortOrder'
  | 'category'
  | 'price'
  | 'isAvailable'
  | 'saleQty'
  | 'createdAt';

export interface DishListFilter {
  page: number;
  limit: number;
  search?: string;
  status: ArchiveStatus;
  categoryId?: number;
  printerId?: number;
  isAvailable?: boolean;
  sortBy: DishSortKey;
  sortOrder: SortOrder;
}

export interface DishWithCounts extends Dish {
  ingredientsCount: number;
}

const SORT_COLUMNS: Record<DishSortKey, string> = {
  name: 'd.name',
  sortOrder: 'd.sortOrder',
  category: 'c.name',
  price: 'd.price',
  isAvailable: 'd.isAvailable',
  saleQty: 'd.saleQty',
  createdAt: 'd.createdAt',
};

@Injectable()
export class DishesRepository extends BaseRepository<Dish> {
  constructor(dataSource: DataSource) {
    super(dataSource, Dish);
  }

  async list(filter: DishListFilter): Promise<[DishWithCounts[], number]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.category', 'c')
      .leftJoinAndSelect('d.printer', 'p')
      .leftJoin('d.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('dish_ingredients', 'di')
            .where('di.dish_id = d.id'),
        'ingredients_count',
      );

    if (filter.status === 'active') qb.andWhere('d.isActive = true');
    if (filter.status === 'archived') qb.andWhere('d.isActive = false');
    if (filter.categoryId)
      qb.andWhere('d.categoryId = :categoryId', {
        categoryId: filter.categoryId,
      });
    if (filter.printerId)
      qb.andWhere('d.printerId = :printerId', { printerId: filter.printerId });
    if (filter.isAvailable !== undefined) {
      qb.andWhere('d.isAvailable = :isAvailable', {
        isAvailable: filter.isAvailable,
      });
    }
    if (filter.search)
      qb.andWhere('d.name ILIKE :search', {
        search: likeContains(filter.search),
      });

    const total = await qb.getCount();
    if (filter.sortBy === 'saleQty') {
      // Untracked dishes have unlimited stock: they sort as "infinite".
      qb.orderBy('d.trackStock', filter.sortOrder === 'ASC' ? 'DESC' : 'ASC');
      qb.addOrderBy('d.saleQty', filter.sortOrder);
    } else {
      qb.orderBy(SORT_COLUMNS[filter.sortBy], filter.sortOrder);
    }
    qb.addOrderBy('d.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);

    const { entities, raw } = await qb.getRawAndEntities<{
      ingredients_count: number;
    }>();
    return [
      entities.map((dish, i) => ({
        ...dish,
        ingredientsCount: Number(raw[i]?.ingredients_count ?? 0),
      })),
      total,
    ];
  }

  async countByStatus(): Promise<{ active: number; archived: number }> {
    const [row] = await this.query<{ active: number; archived: number }>(
      `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
              COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
         FROM dishes`,
    );
    return {
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
    };
  }

  findDetailed(id: number): Promise<Dish | null> {
    return this.repo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.category', 'c')
      .leftJoinAndSelect('d.printer', 'p')
      .leftJoin('d.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .leftJoinAndSelect('d.ingredients', 'di')
      .leftJoinAndSelect('di.ingredient', 'i')
      .where('d.id = :id', { id })
      .orderBy('i.name', 'ASC')
      .getOne();
  }

  findById(id: number): Promise<Dish | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Dishes with the relations needed to snapshot an order line. */
  findForOrdering(ids: number[]): Promise<Dish[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({
      where: { id: In(ids) },
      relations: { category: true, printer: true },
    });
  }

  async nameExistsInCategory(
    categoryId: number,
    name: string,
    excludeId?: number,
  ): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.categoryId = :categoryId', { categoryId })
      .andWhere('lower(d.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('d.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async nextSortOrder(categoryId: number): Promise<number> {
    const [row] = await this.query<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM dishes WHERE category_id = $1',
      [categoryId],
    );
    return Number(row?.next ?? 1);
  }

  create(data: Partial<Dish>): Promise<Dish> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<Dish>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }

  async replaceIngredients(
    dishId: number,
    lines: { ingredientId: number; quantity: number }[],
  ): Promise<void> {
    const repo = this.manager.getRepository(DishIngredient);
    await repo.delete({ dishId });
    if (lines.length) {
      await repo.insert(lines.map((line) => repo.create({ dishId, ...line })));
    }
  }

  /** Recipe cost per unit (Σ ingredient cost × quantity) for dishes that have a recipe. */
  async recipeCosts(ids: number[]): Promise<Map<number, number>> {
    if (!ids.length) return new Map();
    const rows = await this.query<{ dish_id: number; cost: string }>(
      `SELECT di.dish_id, SUM(di.quantity * i.cost_price) AS cost
         FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id
        WHERE di.dish_id = ANY($1::int[])
        GROUP BY di.dish_id`,
      [ids],
    );
    return new Map(rows.map((row) => [row.dish_id, Number(row.cost)]));
  }

  /** Lightweight list of active dishes for pickers (receipts, filters). */
  findActiveOptions(): Promise<Dish[]> {
    return this.repo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.category', 'c')
      .where('d.isActive = true')
      .orderBy('d.name', 'ASC')
      .getMany();
  }

  /** Active categories with their active dishes for the order screen. */
  findPosMenu(): Promise<Dish[]> {
    return this.repo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.category', 'c')
      .where('d.isActive = true AND c.isActive = true')
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.name', 'ASC')
      .addOrderBy('d.sortOrder', 'ASC')
      .addOrderBy('d.name', 'ASC')
      .getMany();
  }
}
