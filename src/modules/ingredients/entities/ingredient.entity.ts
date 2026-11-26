import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IngredientUnit } from '../../../common/constants/enums';
import {
  moneyColumn,
  quantityColumn,
} from '../../../database/decimal.transformer';
import { User } from '../../users/entities/user.entity';

@Entity('ingredients')
export class Ingredient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: IngredientUnit, enumName: 'ingredient_unit' })
  unit: IngredientUnit;

  /** Current stock. May go negative: recipes are approximate by nature. */
  @Column(quantityColumn)
  quantity: number;

  /** Low-stock threshold. */
  @Column(quantityColumn)
  minQuantity: number;

  /** Last purchase price per unit. */
  @Column(moneyColumn)
  costPrice: number;

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
