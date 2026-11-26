import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OrderType } from '../../../common/constants/enums';
import type { ReceiptLayout } from '../../../common/constants/receipt';
import { percentColumn } from '../../../database/decimal.transformer';

export const SETTINGS_ROW_ID = 1;

/** Single-row table with restaurant-wide settings. */
@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn({ type: 'int', default: SETTINGS_ROW_ID })
  id: number;

  @Column({ type: 'varchar', length: 120, default: 'BurgutPOS' })
  restaurantName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  /** Logo printed at the top of the guest bill (public upload URL). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  logoUrl: string | null;

  /** What the guest bill shows and how — see common/constants/receipt.ts. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  orderCheck: ReceiptLayout;

  /** The same for the kitchen ticket. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  dishCheck: ReceiptLayout;

  @Column({ type: 'text', nullable: true })
  receiptHeader: string | null;

  @Column({ type: 'text', nullable: true })
  receiptFooter: string | null;

  /** Service charge added to the bill, % of (subtotal − discount). */
  @Column(percentColumn)
  serviceChargePercent: number;

  /** Order channels the service charge applies to. */
  @Column({
    type: 'enum',
    enum: OrderType,
    enumName: 'order_type',
    array: true,
    default: [OrderType.Table],
  })
  serviceChargeOrderTypes: OrderType[];

  /**
   * Waiter's share, % of their dine-in sales that carry the service charge
   * (subtotal − discount, without the charge itself). Reporting only.
   */
  @Column(percentColumn)
  waiterCommissionPercent: number;

  /** When false, tracked dishes cannot be sold beyond their on-sale quantity. */
  @Column({ type: 'boolean', default: false })
  allowNegativeStock: boolean;

  @Column({ type: 'boolean', default: false })
  autoPrintKitchenTicket: boolean;

  @Column({ type: 'boolean', default: false })
  autoPrintReceipt: boolean;

  @Column({ type: 'int', nullable: true })
  updatedById: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
