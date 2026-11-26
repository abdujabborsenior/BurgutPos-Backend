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
import { StockItemType, StockLocation } from '../../../common/constants/enums';
import {
  decimalTransformer,
  moneyColumn,
  quantityColumn,
} from '../../../database/decimal.transformer';
import { Ingredient } from '../../ingredients/entities/ingredient.entity';
import { Dish } from '../../menu/entities/dish.entity';
import { User } from '../../users/entities/user.entity';

/** Goods receipt (Приход). Archiving reverses its stock effect. */
@Entity('stock_receipts')
@Check(
  'chk_stock_receipts_item',
  `("item_type" = 'DISH' AND "dish_id" IS NOT NULL AND "ingredient_id" IS NULL AND "location" IS NOT NULL)
   OR ("item_type" = 'INGREDIENT' AND "ingredient_id" IS NOT NULL AND "dish_id" IS NULL AND "location" IS NULL)`,
)
@Check('chk_stock_receipts_quantity', `"quantity" > 0`)
@Index('ix_stock_receipts_created', ['createdAt'])
export class StockReceipt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: StockItemType, enumName: 'stock_item_type' })
  itemType: StockItemType;

  @Index('ix_stock_receipts_dish')
  @Column({ type: 'int', nullable: true })
  dishId: number | null;

  @ManyToOne(() => Dish, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'dish_id' })
  dish: Dish | null;

  @Index('ix_stock_receipts_ingredient')
  @Column({ type: 'int', nullable: true })
  ingredientId: number | null;

  @ManyToOne(() => Ingredient, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ingredient_id' })
  ingredient: Ingredient | null;

  @Column({
    type: 'enum',
    enum: StockLocation,
    enumName: 'stock_location',
    nullable: true,
  })
  location: StockLocation | null;

  @Column(quantityColumn)
  quantity: number;

  @Column(moneyColumn)
  purchasePrice: number;

  /** Dish sale price at the moment of receipt (dishes only). */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  salePrice: number | null;

  @Column(moneyColumn)
  total: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;

  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  archivedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'archived_by_id' })
  archivedBy: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  archiveReason: string | null;
}
