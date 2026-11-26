import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../database/decimal.transformer';
import { Ingredient } from '../../ingredients/entities/ingredient.entity';
import { Dish } from './dish.entity';

/** Recipe line (техкарта): how much of an ingredient one unit of a dish consumes. */
@Entity('dish_ingredients')
@Index('uq_dish_ingredients_pair', ['dishId', 'ingredientId'], { unique: true })
export class DishIngredient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  dishId: number;

  @ManyToOne(() => Dish, (dish) => dish.ingredients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dish_id' })
  dish: Dish;

  @Index('ix_dish_ingredients_ingredient')
  @Column({ type: 'int' })
  ingredientId: number;

  @ManyToOne(() => Ingredient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ingredient_id' })
  ingredient: Ingredient;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantity: number;
}
