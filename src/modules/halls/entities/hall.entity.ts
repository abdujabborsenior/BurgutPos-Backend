import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { percentColumn } from '../../../database/decimal.transformer';
import { User } from '../../users/entities/user.entity';
import { DiningTable } from './dining-table.entity';

@Entity('halls')
export class Hall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /**
   * Service charge of this hall, % of the bill. Empty means "as in the
   * settings" — the hall is the more specific rule and wins when it is set.
   */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: percentColumn.transformer,
  })
  servicePercent: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => DiningTable, (table) => table.hall)
  tables: DiningTable[];

  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
