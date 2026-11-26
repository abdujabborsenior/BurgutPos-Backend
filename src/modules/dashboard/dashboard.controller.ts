import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';
import {
  DashboardDateQueryDto,
  RevenueQueryDto,
  TopDishesQueryDto,
} from './dto/dashboard.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
@RequirePermissions(Permission.DashboardView)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Query() query: DashboardDateQueryDto) {
    return this.dashboard.summary(query);
  }

  @Get('revenue')
  revenue(@Query() query: RevenueQueryDto) {
    return this.dashboard.revenue(query);
  }

  @Get('top-dishes')
  topDishes(@Query() query: TopDishesQueryDto) {
    return this.dashboard.topDishes(query);
  }

  @Get('waiters')
  waiters(@Query() query: DashboardDateQueryDto) {
    return this.dashboard.waiters(query);
  }
}
