import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  CashOperationDto,
  CloseShiftDto,
  OpenShiftDto,
  ShiftListQueryDto,
} from './dto/shift.dto';
import { ShiftsService } from './shifts.service';

@ApiTags('Shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  /** Any signed-in user: the POS must know whether a shift is open. */
  @Get('current/status')
  currentStatus() {
    return this.shifts.currentStatus();
  }

  @Get('current')
  @RequirePermissions(Permission.ShiftsView)
  current() {
    return this.shifts.current();
  }

  @Post('open')
  @RequirePermissions(Permission.ShiftsManage)
  open(@Body() dto: OpenShiftDto, @CurrentUser() actor: AuthUser) {
    return this.shifts.open(dto, actor);
  }

  @Post('current/close')
  @RequirePermissions(Permission.ShiftsManage)
  close(@Body() dto: CloseShiftDto, @CurrentUser() actor: AuthUser) {
    return this.shifts.close(dto, actor);
  }

  @Post('current/cash-operations')
  @RequirePermissions(Permission.ShiftsManage)
  cashOperation(@Body() dto: CashOperationDto, @CurrentUser() actor: AuthUser) {
    return this.shifts.addCashOperation(dto, actor);
  }

  @Get()
  @RequirePermissions(Permission.ShiftsView)
  list(@Query() query: ShiftListQueryDto) {
    return this.shifts.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.ShiftsView)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.shifts.getById(id);
  }
}
