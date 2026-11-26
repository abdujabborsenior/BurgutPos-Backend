import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DishUnit } from '../../../common/constants/enums';
import {
  moneyColumn,
  quantityColumn,
} from '../../../database/decimal.transformer';
import { Printer } from '../../printers/entities/printer.entity';
import { User } from '../../users/entities/user.entity';
import { DishCategory } from './dish-category.entity';
import { DishIngredient } from './dish-ingredient.entity';

@Entity('dishes')
export class Dish {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Index('ix_dishes_category')
  @Column({ type: 'int' })
  categoryId: number;

  @ManyToOne(() => DishCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: DishCategory;

  /** Station that prepares the dish and receives its ticket. */
  @Column({ type: 'int', nullable: true })
  printerId: number | null;

  @ManyToOne(() => Printer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'printer_id' })
  printer: Printer | null;

  @Column(moneyColumn)
  price: number;

  /** Last purchase price (resale goods) — snapshotted into sold items. */
  @Column(moneyColumn)
  costPrice: number;

  @Column({
    type: 'enum',
    enum: DishUnit,
    enumName: 'dish_unit',
    default: DishUnit.Piece,
  })
  unit: DishUnit;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Manual stop-list flag ("В наличии" / "Нет в наличии"). */
  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  /** When false the dish has unlimited stock (∞). */
  @Column({ type: 'boolean', default: false })
  trackStock: boolean;

  /** Quantity available for sale (bar, fridge, kitchen). */
  @Column(quantityColumn)
  saleQty: number;

  /** Quantity kept in the warehouse. */
  @Column(quantityColumn)
  warehouseQty: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => DishIngredient, (ingredient) => ingredient.dish)
  ingredients: DishIngredient[];

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
