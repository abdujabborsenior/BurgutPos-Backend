import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderPrintKind } from '../../../common/constants/enums';
import { Printer } from '../../printers/entities/printer.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from './order.entity';

/**
 * One printed bill or receipt of an order — the "История печати чеков".
 * The browser does the printing; the server only learns about it, so a row
 * is written by the precheck command (bill) and by the receipt-print command.
 * Append-only. The printer name is copied, so the history keeps reading the
 * same after the printer is renamed or removed.
 */
@Entity('order_prints')
@Index('ix_order_prints_order', ['orderId', 'createdAt'])
export class OrderPrint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  orderId: number;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'enum', enum: OrderPrintKind, enumName: 'order_print_kind' })
  kind: OrderPrintKind;

  @Column({ type: 'int', nullable: true })
  printerId: number | null;

  @ManyToOne(() => Printer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'printer_id' })
  printer: Printer | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  printerName: string | null;

  @Column({ type: 'int', nullable: true })
  printedById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'printed_by_id' })
  printedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
