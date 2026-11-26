import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { IngredientsRepository } from './repo/ingredients.repository';

@Module({
  imports: [StockModule],
  controllers: [IngredientsController],
  providers: [IngredientsService, IngredientsRepository],
  exports: [IngredientsService],
})
export class IngredientsModule {}
