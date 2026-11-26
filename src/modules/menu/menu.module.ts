import { Module } from '@nestjs/common';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { PrintersModule } from '../printers/printers.module';
import { CategoriesService } from './categories.service';
import { DishesService } from './dishes.service';
import { CategoriesController, DishesController } from './menu.controller';
import { CategoriesRepository } from './repo/categories.repository';
import { DishesRepository } from './repo/dishes.repository';

@Module({
  imports: [PrintersModule, IngredientsModule],
  controllers: [CategoriesController, DishesController],
  providers: [
    CategoriesService,
    DishesService,
    CategoriesRepository,
    DishesRepository,
  ],
  exports: [DishesService, CategoriesService],
})
export class MenuModule {}
