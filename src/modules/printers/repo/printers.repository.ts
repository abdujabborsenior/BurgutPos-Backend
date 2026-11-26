import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ArchiveStatus } from '../../../common/dto/pagination-query.dto';
import { BaseRepository } from '../../../database/base.repository';
import { Printer } from '../entities/printer.entity';

export interface PrinterWithUsage extends Printer {
  dishesCount: number;
}

@Injectable()
export class PrintersRepository extends BaseRepository<Printer> {
  constructor(dataSource: DataSource) {
    super(dataSource, Printer);
  }

  async list(status: ArchiveStatus): Promise<PrinterWithUsage[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('dishes', 'd')
            .where('d.printer_id = p.id AND d.is_active'),
        'dishes_count',
      );
    if (status === 'active') qb.where('p.isActive = true');
    if (status === 'archived') qb.where('p.isActive = false');
    qb.orderBy('p.sortOrder', 'ASC').addOrderBy('p.name', 'ASC');
    const { entities, raw } = await qb.getRawAndEntities<{
      dishes_count: number;
    }>();
    return entities.map((printer, i) => ({
      ...printer,
      dishesCount: Number(raw[i]?.dishes_count ?? 0),
    }));
  }

  findById(id: number): Promise<Printer | null> {
    return this.repo.findOne({ where: { id } });
  }

  async nameExists(name: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('lower(p.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('p.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async countDishes(printerId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM dishes WHERE printer_id = $1',
      [printerId],
    );
    return Number(row?.count ?? 0);
  }

  async nextSortOrder(): Promise<number> {
    const [row] = await this.query<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM printers',
    );
    return Number(row?.next ?? 1);
  }

  /** The active printer marked as default, if there is one. */
  findDefault(): Promise<Printer | null> {
    return this.repo.findOne({ where: { isDefault: true, isActive: true } });
  }

  /** Takes the "default" flag off every other printer. */
  async clearDefault(exceptId?: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ isDefault: false })
      .where('is_default = true')
      .andWhere(exceptId ? 'id <> :exceptId' : '1 = 1', { exceptId })
      .execute();
  }

  create(data: Partial<Printer>): Promise<Printer> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<Printer>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }
}
