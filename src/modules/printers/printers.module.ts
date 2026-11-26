import { Module } from '@nestjs/common';
import { PrintersController } from './printers.controller';
import { PrintersService } from './printers.service';
import { PrintingService } from './printing.service';
import { PrintersRepository } from './repo/printers.repository';

@Module({
  controllers: [PrintersController],
  providers: [PrintersService, PrintingService, PrintersRepository],
  exports: [PrintersService],
})
export class PrintersModule {}
