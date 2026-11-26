import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { OrderCounter } from '../entities/order-counter.entity';

@Injectable()
export class OrderCountersRepository extends BaseRepository<OrderCounter> {
  constructor(dataSource: DataSource) {
    super(dataSource, OrderCounter);
  }

  /**
   * Draws the next order number of `day` (YYYY-MM-DD). One atomic upsert: the
   * counter row stays locked until the caller's transaction ends, so two
   * terminals can never get the same number and a rolled-back order does not
   * burn one.
   */
  async next(day: string): Promise<number> {
    const [row] = await this.query<{ last_number: number }>(
      `INSERT INTO order_counters (day, last_number) VALUES ($1, 1)
       ON CONFLICT (day) DO UPDATE SET last_number = order_counters.last_number + 1
       RETURNING last_number`,
      [day],
    );
    return Number(row.last_number);
  }
}
