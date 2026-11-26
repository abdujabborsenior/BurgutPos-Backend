import { Module } from '@nestjs/common';
import { HallsController, TablesController } from './halls.controller';
import { HallsService } from './halls.service';
import { HallsRepository } from './repo/halls.repository';
import { TablesRepository } from './repo/tables.repository';

@Module({
  controllers: [HallsController, TablesController],
  providers: [HallsService, HallsRepository, TablesRepository],
  exports: [HallsService],
})
export class HallsModule {}
