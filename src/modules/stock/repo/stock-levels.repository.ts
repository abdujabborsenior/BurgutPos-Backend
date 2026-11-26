import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DishUnit, IngredientUnit } from '../../../common/constants/enums';
import type { SortOrder } from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { Dish } from '../../menu/entities/dish.entity';

export interface DishStockRow {
  id: number;
  name: string;
  unit: DishUnit;
  trackStock: boolean;
  saleQty: number;
  warehouseQty: number;
  isActive: boolean;
  price: number;
  costPrice: number;
}

export interface IngredientStockRow {
  id: number;
  name: string;
  unit: IngredientUnit;
  quantity: number;
  isActive: boolean;
  costPrice: number;
}

export type BalanceSortKey =
  'name' | 'saleQty' | 'warehouseQty' | 'totalQty' | 'category';

export interface BalanceFilter {
  page: number;
  limit: number;
  search?: string;
  categoryId?: number;
  tracked?: boolean;
  sortBy: BalanceSortKey;
  sortOrder: SortOrder;
}

interface RawDishRow {
  id: number;
  name: string;
  unit: DishUnit;
  track_stock: boolean;
  sale_qty: string;
  warehouse_qty: string;
  is_active: boolean;
  price: string;
  cost_price: string;
}

interface RawIngredientRow {
  id: number;
  name: string;
  unit: IngredientUnit;
  quantity: string;
  is_active: boolean;
  cost_price: string;
}

const DISH_COLUMNS =
  'id, name, unit, track_stock, sale_qty, warehouse_qty, is_active, price, cost_price';
const INGREDIENT_COLUMNS = 'id, name, unit, quantity, is_active, cost_price';

const toDish = (row: RawDishRow): DishStockRow => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  trackStock: row.track_stock,
  saleQty: Number(row.sale_qty),
  warehouseQty: Number(row.warehouse_qty),
  isActive: row.is_active,
  price: Number(row.price),
  costPrice: Number(row.cost_price),
});

const toIngredient = (row: RawIngredientRow): IngredientStockRow => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  quantity: Number(row.quantity),
  isActive: row.is_active,
  costPrice: Number(row.cost_price),
});

const BALANCE_SORT: Record<BalanceSortKey, string> = {
  name: 'd.name',
  saleQty: 'd.saleQty',
  warehouseQty: 'd.warehouseQty',
  totalQty: '(d.sale_qty + d.warehouse_qty)',
  category: 'c.name',
};

/**
 * Quantity columns of dishes and ingredients. All mutations are single atomic
 * UPDATE … RETURNING statements: no read-modify-write races are possible.
 * Callers must touch rows in ascending id order (dishes, then ingredients).
 */
@Injectable()
export class StockLevelsRepository extends BaseRepository<Dish> {
  constructor(dataSource: DataSource) {
    super(dataSource, Dish);
  }

  // ─────────────────────────────── Dishes ───────────────────────────────

  async findDish(id: number): Promise<DishStockRow | null> {
    const [row] = await this.query<RawDishRow>(
      `SELECT ${DISH_COLUMNS} FROM dishes WHERE id = $1`,
      [id],
    );
    return row ? toDish(row) : null;
  }

  async lockDish(id: number): Promise<DishStockRow | null> {
    const [row] = await this.query<RawDishRow>(
      `SELECT ${DISH_COLUMNS} FROM dishes WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return row ? toDish(row) : null;
  }

  async changeDishQty(
    id: number,
    saleDelta: number,
    warehouseDelta: number,
  ): Promise<DishStockRow> {
    const [row] = await this.query<RawDishRow>(
      `UPDATE dishes
          SET sale_qty = sale_qty + $2::numeric, warehouse_qty = warehouse_qty + $3::numeric
        WHERE id = $1
    RETURNING ${DISH_COLUMNS}`,
      [id, saleDelta, warehouseDelta],
    );
    return toDish(row);
  }

  /** Changes on-sale stock only when the dish is tracked; null otherwise. */
  async changeTrackedSaleQty(
    id: number,
    delta: number,
  ): Promise<DishStockRow | null> {
    const rows = await this.query<RawDishRow>(
      `UPDATE dishes SET sale_qty = sale_qty + $2::numeric
        WHERE id = $1 AND track_stock
    RETURNING ${DISH_COLUMNS}`,
      [id, delta],
    );
    return rows[0] ? toDish(rows[0]) : null;
  }

  async updateDishFields(
    id: number,
    patch: { trackStock?: boolean; costPrice?: number; price?: number },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    if (patch.trackStock !== undefined) {
      params.push(patch.trackStock);
      sets.push(`track_stock = $${params.length}`);
    }
    if (patch.costPrice !== undefined) {
      params.push(patch.costPrice);
      sets.push(`cost_price = $${params.length}`);
    }
    if (patch.price !== undefined) {
      params.push(patch.price);
      sets.push(`price = $${params.length}`);
    }
    if (!sets.length) return;
    await this.query(
      `UPDATE dishes SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
      params,
    );
  }

  async balance(filter: BalanceFilter): Promise<[Dish[], number]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.category', 'c')
      .where('d.isActive = true');
    if (filter.categoryId)
      qb.andWhere('d.categoryId = :categoryId', {
        categoryId: filter.categoryId,
      });
    if (filter.tracked !== undefined)
      qb.andWhere('d.trackStock = :tracked', { tracked: filter.tracked });
    if (filter.search)
      qb.andWhere('d.name ILIKE :search', {
        search: likeContains(filter.search),
      });
    const total = await qb.getCount();
    qb.orderBy(BALANCE_SORT[filter.sortBy], filter.sortOrder)
      .addOrderBy('d.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);
    return [await qb.getMany(), total];
  }

  // ───────────────────────────── Ingredients ─────────────────────────────

  async findIngredient(id: number): Promise<IngredientStockRow | null> {
    const [row] = await this.query<RawIngredientRow>(
      `SELECT ${INGREDIENT_COLUMNS} FROM ingredients WHERE id = $1`,
      [id],
    );
    return row ? toIngredient(row) : null;
  }

  async lockIngredient(id: number): Promise<IngredientStockRow | null> {
    const [row] = await this.query<RawIngredientRow>(
      `SELECT ${INGREDIENT_COLUMNS} FROM ingredients WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return row ? toIngredient(row) : null;
  }

  async changeIngredientQty(
    id: number,
    delta: number,
  ): Promise<IngredientStockRow | null> {
    const rows = await this.query<RawIngredientRow>(
      `UPDATE ingredients SET quantity = quantity + $2::numeric
        WHERE id = $1
    RETURNING ${INGREDIENT_COLUMNS}`,
      [id, delta],
    );
    return rows[0] ? toIngredient(rows[0]) : null;
  }

  async setIngredientCost(id: number, costPrice: number): Promise<void> {
    await this.query(
      'UPDATE ingredients SET cost_price = $2, updated_at = now() WHERE id = $1',
      [id, costPrice],
    );
  }

  // ─────────────────────────────── Recipes ───────────────────────────────

  async recipeLines(
    dishIds: number[],
  ): Promise<{ dishId: number; ingredientId: number; quantity: number }[]> {
    if (!dishIds.length) return [];
    const rows = await this.query<{
      dish_id: number;
      ingredient_id: number;
      quantity: string;
    }>(
      'SELECT dish_id, ingredient_id, quantity FROM dish_ingredients WHERE dish_id = ANY($1::int[])',
      [dishIds],
    );
    return rows.map((row) => ({
      dishId: row.dish_id,
      ingredientId: row.ingredient_id,
      quantity: Number(row.quantity),
    }));
  }
}
