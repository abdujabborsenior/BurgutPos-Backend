import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Hall } from './hall.entity';

@Entity('dining_tables')
@Index('uq_dining_tables_hall_name', ['hallId', 'name'], { unique: true })
export class DiningTable {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('ix_dining_tables_hall')
  @Column({ type: 'int' })
  hallId: number;

  @ManyToOne(() => Hall, (hall) => hall.tables, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'hall_id' })
  hall: Hall;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'int', nullable: true })
  seats: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

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
