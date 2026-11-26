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
import { moneyColumn } from '../../../database/decimal.transformer';
import { PaymentMethod } from '../../payment-methods/entities/payment-method.entity';
import { Shift } from '../../shifts/entities/shift.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from './order.entity';

/**
 * Net amount collected by one payment method (change already deducted).
 * Append-only: when a paid order is returned to work its payments are not
 * deleted — a negative reversal (storno) row is written into the current
 * shift, so closed shifts never change.
 */
@Entity('payments')
@Check(
  'chk_payments_amount',
  `("is_reversal" AND "amount" < 0) OR (NOT "is_reversal" AND "amount" > 0)`,
)
@Index('ix_payments_created', ['createdAt'])
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('ix_payments_order')
  @Column({ type: 'int' })
  orderId: number;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Index('ix_payments_method')
  @Column({ type: 'int' })
  methodId: number;

  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'method_id' })
  method: PaymentMethod;

  @Column(moneyColumn)
  amount: number;

  /** Storno of earlier payments of the order (amount is negative). */
  @Column({ type: 'boolean', default: false })
  isReversal: boolean;

  @Index('ix_payments_shift')
  @Column({ type: 'int' })
  shiftId: number;

  @ManyToOne(() => Shift, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;

  @Index('ix_payments_cashier')
  @Column({ type: 'int' })
  cashierId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashier_id' })
  cashier: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
