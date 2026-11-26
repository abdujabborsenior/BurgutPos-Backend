import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  CategoryListQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import type { DishCategory } from './entities/dish-category.entity';
import {
  CategoriesRepository,
  type CategoryWithCounts,
} from './repo/categories.repository';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categories: CategoriesRepository,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(query: CategoryListQueryDto) {
    const [items, total] = await this.categories.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'DESC',
    });
    return {
      ...paginated(
        items.map((c) => this.toView(c)),
        total,
        query.page,
        query.limit,
      ),
      counts: await this.categories.countByStatus(),
    };
  }

  async options() {
    const items = await this.categories.findActiveOptions();
    return items.map(({ id, name }) => ({ id, name }));
  }

  async getById(id: number): Promise<DishCategory> {
    const category = await this.categories.findById(id);
    if (!category) throw new NotFoundException('Категория не найдена');
    return category;
  }

  /** Category a dish can be placed in. */
  async assertUsable(id: number): Promise<DishCategory> {
    const category = await this.getById(id);
    if (!category.isActive) {
      throw new ConflictException(
        `Категория «${category.name}» находится в архиве`,
      );
    }
    return category;
  }

  async create(dto: CreateCategoryDto, actor: AuthUser) {
    if (await this.categories.nameExists(dto.name)) {
      throw new ConflictException('Категория с таким названием уже существует');
    }
    const category = await this.categories.create({
      name: dto.name,
      sortOrder: dto.sortOrder ?? (await this.categories.nextSortOrder()),
      createdById: actor.id,
    });
    this.realtime.invalidate(['menu']);
    return this.toView({
      ...(await this.getById(category.id)),
      dishesCount: 0,
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.getById(id);
    if (dto.name && (await this.categories.nameExists(dto.name, id))) {
      throw new ConflictException('Категория с таким названием уже существует');
    }
    await this.categories.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    });
    this.realtime.invalidate(['menu']);
    const category = await this.getById(id);
    return this.toView({
      ...category,
      dishesCount: await this.categories.countDishes(id, true),
    });
  }

  async setActive(id: number, isActive: boolean): Promise<void> {
    await this.getById(id);
    await this.categories.update(id, { isActive });
    this.realtime.invalidate(['menu', 'stock']);
  }

  async delete(id: number): Promise<void> {
    await this.tx.run(async () => {
      await this.getById(id);
      const dishes = await this.categories.countDishes(id);
      if (dishes > 0) {
        throw new ConflictException(
          `В категории есть блюда (${dishes}). Перенесите их в другую категорию или оставьте категорию в архиве`,
        );
      }
      await this.categories.delete(id);
    });
    this.realtime.invalidate(['menu']);
  }

  private toView(category: CategoryWithCounts) {
    return {
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      dishesCount: category.dishesCount,
      createdAt: category.createdAt,
      createdBy: category.createdBy
        ? { id: category.createdBy.id, fullName: category.createdBy.fullName }
        : null,
    };
  }
}
