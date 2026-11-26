import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportExcelService } from './report-excel.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './repo/reports.repository';

@Module({
  imports: [OrdersModule, SettingsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, ReportExcelService],
})
export class ReportsModule {}
