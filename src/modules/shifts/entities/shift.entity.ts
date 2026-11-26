import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ShiftStatus } from '../../../common/constants/enums';
import {
  decimalTransformer,
  moneyColumn,
} from '../../../database/decimal.transformer';
import { User } from '../../users/entities/user.entity';

/** Restaurant-wide cash shift. Only one shift can be open at a time. */
@Entity('shifts')
@Index('uq_shifts_single_open', ['status'], {
  unique: true,
  where: `"status" = 'OPEN'`,
})
export class Shift {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: ShiftStatus,
    enumName: 'shift_status',
    default: ShiftStatus.Open,
  })
  status: ShiftStatus;

  @Column({ type: 'int' })
  openedById: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'opened_by_id' })
  openedBy: User;

  @Index('ix_shifts_opened_at')
  @CreateDateColumn({ type: 'timestamptz' })
  openedAt: Date;

  @Column(moneyColumn)
  openingCash: number;

  @Column({ type: 'int', nullable: true })
  closedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closed_by_id' })
  closedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** Cash counted in the drawer at closing. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  closingCash: number | null;

  /** Cash the system expected at closing (snapshot). */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  expectedCash: number | null;

  /** Revenue of the shift at closing (snapshot). */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  revenue: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  openComment: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  closeComment: string | null;
}
