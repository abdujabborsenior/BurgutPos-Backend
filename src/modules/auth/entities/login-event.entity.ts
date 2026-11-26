import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LoginEventType } from '../../../common/constants/enums';
import { User } from '../../users/entities/user.entity';

/**
 * Who signed in or out, when, and from what. Append-only: the log answers
 * "who was at the till at 18:40" long after the session itself is gone.
 */
@Entity('login_events')
@Index('ix_login_events_created', ['createdAt'])
export class LoginEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('ix_login_events_user')
  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: LoginEventType, enumName: 'login_event_type' })
  type: LoginEventType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
