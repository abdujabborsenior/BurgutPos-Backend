import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PrinterConnection } from '../../../common/constants/enums';

/** A preparation station (kitchen, bar, grill…) that receives order tickets. */
@Entity('printers')
// One station is the default: tickets without their own printer go there.
@Index('uq_printers_default', ['isDefault'], {
  unique: true,
  where: `"is_default"`,
})
export class Printer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: PrinterConnection,
    enumName: 'printer_connection',
    default: PrinterConnection.Lan,
  })
  connection: PrinterConnection;

  /** Address of a network printer; empty for a USB one. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  host: string | null;

  @Column({ type: 'int', nullable: true })
  port: number | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
