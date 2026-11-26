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
import { Role } from '../../roles/entities/role.entity';

@Entity('users')
// Case-insensitive uniqueness is enforced by a functional index created in a
// migration (lower(login)); TypeORM must not try to manage it.
@Index('uq_users_login_lower', { synchronize: false })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 64 })
  login: string;

  @Column({ type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Index('ix_users_role')
  @Column({ type: 'int', nullable: true })
  roleId: number | null;

  @ManyToOne(() => Role, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role: Role | null;

  /** The system owner account; credentials are managed through .env only. */
  @Column({ type: 'boolean', default: false })
  isSuperadmin: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
