import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  StockItemType,
  StockLocation,
  StockMovementType,
} from '../../../common/constants/enums';
import { decimalTransformer } from '../../../database/decimal.transformer';
import { Ingredient } from '../../ingredients/entities/ingredient.entity';
import { Dish } from '../../menu/entities/dish.entity';
import { User } from '../../users/entities/user.entity';

/** Append-only stock ledger (История). Every quantity change writes a row. */
@Entity('stock_movements')
@Index('ix_stock_movements_created', ['createdAt'])
@Index('ix_stock_movements_dish', ['dishId', 'createdAt'])
@Index('ix_stock_movements_ingredient', ['ingredientId', 'createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: StockItemType, enumName: 'stock_item_type' })
  itemType: StockItemType;

  @Column({ type: 'int', nullable: true })
  dishId: number | null;

  @ManyToOne(() => Dish, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dish_id' })
  dish: Dish | null;

  @Column({ type: 'int', nullable: true })
  ingredientId: number | null;

  @ManyToOne(() => Ingredient, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingredient_id' })
  ingredient: Ingredient | null;

  @Column({
    type: 'enum',
    enum: StockMovementType,
    enumName: 'stock_movement_type',
  })
  type: StockMovementType;

  @Column({
    type: 'enum',
    enum: StockLocation,
    enumName: 'stock_location',
    nullable: true,
  })
  location: StockLocation | null;

  /** Signed delta. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: decimalTransformer,
  })
  quantity: number;

  /** Balance of the affected location right after the movement. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: decimalTransformer,
  })
  balanceAfter: number;

  @Index('ix_stock_movements_order')
  @Column({ type: 'int', nullable: true })
  orderId: number | null;

  @Column({ type: 'int', nullable: true })
  receiptId: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;

  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
