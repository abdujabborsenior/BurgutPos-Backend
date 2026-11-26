import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Last order number issued per business day. Incremented with a single
 * upsert, so concurrent terminals can never draw the same number.
 */
@Entity('order_counters')
export class OrderCounter {
  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ type: 'int' })
  lastNumber: number;
}
