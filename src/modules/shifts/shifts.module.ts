import { Module } from '@nestjs/common';
import { CashOperationsRepository } from './repo/cash-operations.repository';
import { ShiftsRepository } from './repo/shifts.repository';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftsRepository, CashOperationsRepository],
  exports: [ShiftsService],
})
export class ShiftsModule {}
