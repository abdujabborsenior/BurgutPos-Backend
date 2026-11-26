import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { OrderPrint } from '../entities/order-print.entity';

@Injectable()
export class OrderPrintsRepository extends BaseRepository<OrderPrint> {
  constructor(dataSource: DataSource) {
    super(dataSource, OrderPrint);
  }

  async record(
    row: Pick<
      OrderPrint,
      'orderId' | 'kind' | 'printerId' | 'printerName' | 'printedById'
    >,
  ): Promise<void> {
    await this.repo.insert(this.repo.create(row));
  }

  /** The order's print history, oldest first, with who printed it. */
  findByOrder(orderId: number): Promise<OrderPrint[]> {
    return this.repo
      .createQueryBuilder('p')
      .leftJoin('p.printedBy', 'u')
      .addSelect(['u.id', 'u.fullName'])
      .where('p.orderId = :orderId', { orderId })
      .orderBy('p.createdAt', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .getMany();
  }
}
