import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DishUnit, OrderItemStatus } from '../../../common/constants/enums';
import {
  moneyColumn,
  quantityColumn,
} from '../../../database/decimal.transformer';
import { Dish } from '../../menu/entities/dish.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from './order.entity';

/**
 * Order line. Dish attributes are snapshotted so that later menu edits never
 * rewrite history. Lines are never edited in place after being sent: a
 * cancellation either flips the status or splits the line.
 */
@Entity('order_items')
@Check('chk_order_items_quantity', `"quantity" > 0`)
@Index('ix_order_items_status_cancelled', ['status', 'cancelledAt'])
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('ix_order_items_order')
  @Column({ type: 'int' })
  orderId: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Index('ix_order_items_dish')
  @Column({ type: 'int' })
  dishId: number;

  @ManyToOne(() => Dish, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'dish_id' })
  dish: Dish;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  categoryName: string | null;

  @Column({ type: 'int', nullable: true })
  printerId: number | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  printerName: string | null;

  @Column({ type: 'enum', enum: DishUnit, enumName: 'dish_unit' })
  unit: DishUnit;

  @Column(moneyColumn)
  price: number;

  @Column(moneyColumn)
  costPrice: number;

  @Column(quantityColumn)
  quantity: number;

  @Column(moneyColumn)
  total: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  comment: string | null;

  @Column({
    type: 'enum',
    enum: OrderItemStatus,
    enumName: 'order_item_status',
    default: OrderItemStatus.Active,
  })
  status: OrderItemStatus;

  @Column({ type: 'int' })
  createdById: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'int', nullable: true })
  cancelledById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelled_by_id' })
  cancelledBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason: string | null;

  /** Whether stock was returned when the line was cancelled. */
  @Column({ type: 'boolean', nullable: true })
  stockReturned: boolean | null;
}
