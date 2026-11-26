import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { Payment } from '../entities/payment.entity';

@Injectable()
export class PaymentsRepository extends BaseRepository<Payment> {
  constructor(dataSource: DataSource) {
    super(dataSource, Payment);
  }

  async insertMany(rows: Partial<Payment>[]): Promise<void> {
    if (!rows.length) return;
    await this.repo.insert(rows.map((row) => this.repo.create(row)));
  }

  /** What the order currently holds per method: payments minus reversals. */
  async netByMethod(orderId: number): Promise<Map<number, number>> {
    const rows = await this.query<{ method_id: number; amount: string }>(
      `SELECT method_id, SUM(amount) AS amount FROM payments
        WHERE order_id = $1 GROUP BY method_id HAVING SUM(amount) <> 0
        ORDER BY method_id`,
      [orderId],
    );
    return new Map(rows.map((row) => [row.method_id, Number(row.amount)]));
  }

  findByOrder(orderId: number): Promise<Payment[]> {
    return this.repo
      .createQueryBuilder('p')
      .innerJoin('p.method', 'm')
      .addSelect(['m.id', 'm.name', 'm.type'])
      .leftJoin('p.cashier', 'c')
      .addSelect(['c.id', 'c.fullName'])
      .where('p.orderId = :orderId', { orderId })
      .orderBy('p.id', 'ASC')
      .getMany();
  }
}
