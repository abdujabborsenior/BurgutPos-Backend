import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  ArchiveStatus,
  SortOrder,
} from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { DishCategory } from '../entities/dish-category.entity';

export type CategorySortKey =
  'name' | 'sortOrder' | 'createdAt' | 'dishesCount';

export interface CategoryListFilter {
  page: number;
  limit: number;
  search?: string;
  status: ArchiveStatus;
  sortBy: CategorySortKey;
  sortOrder: SortOrder;
}

export interface CategoryWithCounts extends DishCategory {
  dishesCount: number;
}

@Injectable()
export class CategoriesRepository extends BaseRepository<DishCategory> {
  constructor(dataSource: DataSource) {
    super(dataSource, DishCategory);
  }

  async list(
    filter: CategoryListFilter,
  ): Promise<[CategoryWithCounts[], number]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('dishes', 'd')
            .where('d.category_id = c.id AND d.is_active'),
        'dishes_count',
      );
    if (filter.status === 'active') qb.andWhere('c.isActive = true');
    if (filter.status === 'archived') qb.andWhere('c.isActive = false');
    if (filter.search)
      qb.andWhere('c.name ILIKE :search', {
        search: likeContains(filter.search),
      });

    const total = await qb.getCount();
    if (filter.sortBy === 'dishesCount') {
      qb.orderBy('dishes_count', filter.sortOrder);
    } else {
      qb.orderBy(`c.${filter.sortBy}`, filter.sortOrder);
    }
    qb.addOrderBy('c.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);

    const { entities, raw } = await qb.getRawAndEntities<{
      dishes_count: number;
    }>();
    return [
      entities.map((category, i) => ({
        ...category,
        dishesCount: Number(raw[i]?.dishes_count ?? 0),
      })),
      total,
    ];
  }

  async countByStatus(): Promise<{ active: number; archived: number }> {
    const [row] = await this.query<{ active: number; archived: number }>(
      `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
              COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
         FROM dish_categories`,
    );
    return {
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
    };
  }

  findById(id: number): Promise<DishCategory | null> {
    return this.repo.findOne({ where: { id }, relations: { createdBy: true } });
  }

  findActiveOptions(): Promise<DishCategory[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async nameExists(name: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('lower(c.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('c.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async countDishes(categoryId: number, activeOnly = false): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM dishes WHERE category_id = $1 ${activeOnly ? 'AND is_active' : ''}`,
      [categoryId],
    );
    return Number(row?.count ?? 0);
  }

  async nextSortOrder(): Promise<number> {
    const [row] = await this.query<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM dish_categories',
    );
    return Number(row?.next ?? 1);
  }

  create(data: Partial<DishCategory>): Promise<DishCategory> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<DishCategory>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }
}
