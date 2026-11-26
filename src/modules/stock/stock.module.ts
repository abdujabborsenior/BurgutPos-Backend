import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { StockLevelsRepository } from './repo/stock-levels.repository';
import { StockMovementsRepository } from './repo/stock-movements.repository';
import { StockReceiptsRepository } from './repo/stock-receipts.repository';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [SettingsModule],
  controllers: [StockController],
  providers: [
    StockService,
    StockLevelsRepository,
    StockMovementsRepository,
    StockReceiptsRepository,
  ],
  exports: [StockService],
})
export class StockModule {}
