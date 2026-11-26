import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  DiscountType,
  OrderStatus,
  OrderType,
} from '../../../common/constants/enums';
import {
  moneyColumn,
  percentColumn,
} from '../../../database/decimal.transformer';
import { DiningTable } from '../../halls/entities/dining-table.entity';
import { Shift } from '../../shifts/entities/shift.entity';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';

@Entity('orders')
// A table can carry only one open order — the database guarantees it even
// when two terminals open the same table simultaneously.
@Index('uq_orders_open_table', ['tableId'], {
  unique: true,
  where: `"status" = 'OPEN' AND "table_id" IS NOT NULL`,
})
@Index('ix_orders_status_type', ['status', 'type'])
@Index('ix_orders_closed_at', ['closedAt'])
@Index('ix_orders_created_at', ['createdAt'])
// Guests and staff call orders by the daily number ("заказ №412"); it restarts
// every business day and must never repeat within one.
@Index('uq_orders_day_number', ['businessDate', 'number'], { unique: true })
@Check(
  'chk_orders_table_type',
  `("type" = 'TABLE' AND "table_id" IS NOT NULL) OR ("type" <> 'TABLE' AND "table_id" IS NULL)`,
)
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  /** Calendar day (business time zone) the order was opened on. */
  @Column({ type: 'date' })
  businessDate: string;

  /** Order number shown to people: sequential within `businessDate` (1, 2, 3 …). */
  @Column({ type: 'int' })
  number: number;

  @Column({ type: 'enum', enum: OrderType, enumName: 'order_type' })
  type: OrderType;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.Open,
  })
  status: OrderStatus;

  @Column({ type: 'int', nullable: true })
  tableId: number | null;

  @ManyToOne(() => DiningTable, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'table_id' })
  table: DiningTable | null;

  @Index('ix_orders_waiter')
  @Column({ type: 'int', nullable: true })
  waiterId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'waiter_id' })
  waiter: User | null;

  @Column({ type: 'int' })
  createdById: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Index('ix_orders_shift')
  @Column({ type: 'int' })
  shiftId: number;

  @ManyToOne(() => Shift, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;

  @Column({ type: 'int', nullable: true })
  guests: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  customerPhone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;

  /** Σ active items. */
  @Column(moneyColumn)
  subtotal: number;

  @Column({
    type: 'enum',
    enum: DiscountType,
    enumName: 'discount_type',
    nullable: true,
  })
  discountType: DiscountType | null;

  @Column(moneyColumn)
  discountValue: number;

  @Column(moneyColumn)
  discountAmount: number;

  /** Service charge rate snapshotted when the order was opened. */
  @Column(percentColumn)
  servicePercent: number;

  @Column(moneyColumn)
  serviceAmount: number;

  @Column(moneyColumn)
  deliveryFee: number;

  /** subtotal − discount + service + delivery fee. */
  @Column(moneyColumn)
  total: number;

  @Column(moneyColumn)
  paidAmount: number;

  /** Money handed over by the guest (≥ total when cash change was given). */
  @Column(moneyColumn)
  receivedAmount: number;

  @Column(moneyColumn)
  changeAmount: number;

  /** Waiter commission rate snapshotted at payment, so history never shifts. */
  @Column(percentColumn)
  waiterPercent: number;

  @Column({ type: 'timestamptz', nullable: true })
  precheckAt: Date | null;

  @Column({ type: 'int', default: 0 })
  precheckCount: number;

  @Column({ type: 'int', nullable: true })
  closedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closed_by_id' })
  closedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  cancelledById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelled_by_id' })
  cancelledBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason: string | null;

  /** Target order when this one was merged into another table's order. */
  @Column({ type: 'int', nullable: true })
  mergedIntoId: number | null;

  /**
   * Last time a paid order was returned to work: its payments were reversed
   * (storno rows) and it became open again.
   */
  @Column({ type: 'timestamptz', nullable: true })
  reopenedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  reopenedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reopened_by_id' })
  reopenedBy: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reopenReason: string | null;

  @Column({ type: 'int', default: 0 })
  reopenCount: number;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
