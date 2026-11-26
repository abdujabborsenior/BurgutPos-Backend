import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderItemStatus } from '../../../common/constants/enums';
import { BaseRepository } from '../../../database/base.repository';
import { OrderItem } from '../entities/order-item.entity';

@Injectable()
export class OrderItemsRepository extends BaseRepository<OrderItem> {
  constructor(dataSource: DataSource) {
    super(dataSource, OrderItem);
  }

  async insertMany(rows: Partial<OrderItem>[]): Promise<number[]> {
    if (!rows.length) return [];
    const result = await this.repo.insert(
      rows.map((row) => this.repo.create(row)),
    );
    return result.identifiers.map(
      (identifier) => (identifier as { id: number }).id,
    );
  }

  findByOrder(orderId: number): Promise<OrderItem[]> {
    return this.repo
      .createQueryBuilder('i')
      .leftJoin('i.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .leftJoin('i.cancelledBy', 'cnb')
      .addSelect(['cnb.id', 'cnb.fullName'])
      .where('i.orderId = :orderId', { orderId })
      .orderBy('i.createdAt', 'ASC')
      .addOrderBy('i.id', 'ASC')
      .getMany();
  }

  findByIdForUpdate(id: number): Promise<OrderItem | null> {
    return this.repo.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  findActiveByOrder(orderId: number): Promise<OrderItem[]> {
    return this.repo.find({
      where: { orderId, status: OrderItemStatus.Active },
      order: { id: 'ASC' },
    });
  }

  async sumActive(orderId: number): Promise<number> {
    const [row] = await this.query<{ sum: string }>(
      `SELECT COALESCE(SUM(total), 0) AS sum FROM order_items WHERE order_id = $1 AND status = 'ACTIVE'`,
      [orderId],
    );
    return Number(row?.sum ?? 0);
  }

  async countActive(orderId: number): Promise<number> {
    const [row] = await this.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1 AND status = 'ACTIVE'`,
      [orderId],
    );
    return Number(row?.count ?? 0);
  }

  async update(id: number, patch: Partial<OrderItem>): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async cancelActive(
    orderId: number,
    patch: Pick<
      OrderItem,
      'cancelledById' | 'cancelledAt' | 'cancelReason' | 'stockReturned'
    >,
  ): Promise<void> {
    await this.repo.update(
      { orderId, status: OrderItemStatus.Active },
      { ...patch, status: OrderItemStatus.Cancelled },
    );
  }

  /** Moves every line of one order into another (table merge). */
  async moveAll(fromOrderId: number, toOrderId: number): Promise<void> {
    await this.repo.update({ orderId: fromOrderId }, { orderId: toOrderId });
  }
}
