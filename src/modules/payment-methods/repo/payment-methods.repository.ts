import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { ArchiveStatus } from '../../../common/dto/pagination-query.dto';
import { BaseRepository } from '../../../database/base.repository';
import { PaymentMethod } from '../entities/payment-method.entity';

export interface PaymentMethodWithUsage extends PaymentMethod {
  paymentsCount: number;
}

@Injectable()
export class PaymentMethodsRepository extends BaseRepository<PaymentMethod> {
  constructor(dataSource: DataSource) {
    super(dataSource, PaymentMethod);
  }

  async list(status: ArchiveStatus): Promise<PaymentMethodWithUsage[]> {
    const qb = this.repo
      .createQueryBuilder('m')
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('payments', 'p')
            .where('p.method_id = m.id'),
        'payments_count',
      );
    if (status === 'active') qb.where('m.isActive = true');
    if (status === 'archived') qb.where('m.isActive = false');
    qb.orderBy('m.sortOrder', 'ASC').addOrderBy('m.id', 'ASC');
    const { entities, raw } = await qb.getRawAndEntities<{
      payments_count: number;
    }>();
    return entities.map((method, i) => ({
      ...method,
      paymentsCount: Number(raw[i]?.payments_count ?? 0),
    }));
  }

  findById(id: number): Promise<PaymentMethod | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIds(ids: number[]): Promise<PaymentMethod[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) } });
  }

  async nameExists(name: string, excludeId?: number): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('m')
      .where('lower(m.name) = lower(:name)', { name });
    if (excludeId) qb.andWhere('m.id <> :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async countPayments(methodId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM payments WHERE method_id = $1',
      [methodId],
    );
    return Number(row?.count ?? 0);
  }

  countActive(): Promise<number> {
    return this.repo.count({ where: { isActive: true } });
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  async nextSortOrder(): Promise<number> {
    const [row] = await this.query<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM payment_methods',
    );
    return Number(row?.next ?? 1);
  }

  create(data: Partial<PaymentMethod>): Promise<PaymentMethod> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, patch: Partial<PaymentMethod>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete({ id });
  }
}
