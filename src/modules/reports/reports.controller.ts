import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CancellationsReportQueryDto,
  CategoryDishesQueryDto,
  DishesReportQueryDto,
  DishHistoryQueryDto,
  EmployeeOrdersQueryDto,
  OrdersReportQueryDto,
  type ReportKind,
  ReportRangeQueryDto,
  ShiftsReportQueryDto,
  TablesReportQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Reports')
@Controller('reports')
@RequirePermissions(Permission.ReportsView)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query() query: ReportRangeQueryDto) {
    return this.reports.summary(query);
  }

  @Get('orders')
  orders(@Query() query: OrdersReportQueryDto) {
    return this.reports.ordersReport(query);
  }

  @Get('tables')
  tables(@Query() query: TablesReportQueryDto) {
    return this.reports.tables(query);
  }

  @Get('employees')
  employees(@Query() query: ReportRangeQueryDto) {
    return this.reports.employees(query);
  }

  /** Bills of one employee row (drill-down on click). */
  @Get('employees/orders')
  employeeOrders(@Query() query: EmployeeOrdersQueryDto) {
    return this.reports.employeeOrders(query);
  }

  @Get('cashiers')
  cashiers(@Query() query: ReportRangeQueryDto) {
    return this.reports.cashiers(query);
  }

  @Get('shifts')
  shifts(@Query() query: ShiftsReportQueryDto) {
    return this.reports.shifts(query);
  }

  @Get('dishes')
  dishes(@Query() query: DishesReportQueryDto) {
    return this.reports.dishes(query);
  }

  /** Lines of one dish row (drill-down on click). */
  @Get('dishes/history')
  dishHistory(@Query() query: DishHistoryQueryDto) {
    return this.reports.dishHistory(query);
  }

  @Get('categories')
  categories(@Query() query: ReportRangeQueryDto) {
    return this.reports.categories(query);
  }

  /** Dishes of one category (drill-down) or of all of them (printed sheet). */
  @Get('categories/dishes')
  categoryDishes(@Query() query: CategoryDishesQueryDto) {
    return this.reports.categoryDishes(query);
  }

  @Get('cancellations')
  cancellations(@Query() query: CancellationsReportQueryDto) {
    return this.reports.cancellations(query);
  }

  // ─────────────────────────────── Excel ───────────────────────────────

  @Get('summary/export')
  exportSummary(@Query() query: ReportRangeQueryDto) {
    return this.file('summary', query);
  }

  @Get('orders/export')
  exportOrders(@Query() query: OrdersReportQueryDto) {
    return this.file('orders', query);
  }

  @Get('tables/export')
  exportTables(@Query() query: TablesReportQueryDto) {
    return this.file('tables', query);
  }

  @Get('employees/export')
  exportEmployees(@Query() query: ReportRangeQueryDto) {
    return this.file('employees', query);
  }

  @Get('cashiers/export')
  exportCashiers(@Query() query: ReportRangeQueryDto) {
    return this.file('cashiers', query);
  }

  @Get('shifts/export')
  exportShifts(@Query() query: ShiftsReportQueryDto) {
    return this.file('shifts', query);
  }

  @Get('dishes/export')
  exportDishes(@Query() query: DishesReportQueryDto) {
    return this.file('dishes', query);
  }

  @Get('categories/export')
  exportCategories(@Query() query: ReportRangeQueryDto) {
    return this.file('categories', query);
  }

  @Get('cancellations/export')
  exportCancellations(@Query() query: CancellationsReportQueryDto) {
    return this.file('cancellations', query);
  }

  /**
   * One order with lines and payments, for printing its receipt from the
   * report. Declared after "orders/export" so that path is never taken for an id.
   */
  @Get('orders/:id')
  orderDetail(@Param('id', ParseIntPipe) id: number) {
    return this.reports.orderDetail(id);
  }

  private async file(kind: ReportKind, query: object): Promise<StreamableFile> {
    const { buffer, fileName } = await this.reports.export(
      kind,
      query as Record<string, unknown>,
    );
    return new StreamableFile(buffer, {
      type: XLSX,
      // RFC 5987: a header carries only ASCII, so non-Latin names go encoded.
      disposition: `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      length: buffer.length,
    });
  }
}
