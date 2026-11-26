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
import { CashOperationType } from '../../../common/constants/enums';
import { moneyColumn } from '../../../database/decimal.transformer';
import { User } from '../../users/entities/user.entity';
import { Shift } from './shift.entity';

/** Cash deposit / withdrawal from the drawer during a shift (внесение / изъятие). */
@Entity('cash_operations')
@Check('chk_cash_operations_amount', `"amount" > 0`)
export class CashOperation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('ix_cash_operations_shift')
  @Column({ type: 'int' })
  shiftId: number;

  @ManyToOne(() => Shift, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;

  @Column({
    type: 'enum',
    enum: CashOperationType,
    enumName: 'cash_operation_type',
  })
  type: CashOperationType;

  @Column(moneyColumn)
  amount: number;

  @Column({ type: 'varchar', length: 500 })
  comment: string;

  @Column({ type: 'int' })
  createdById: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
