import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  BulkCreateTablesDto,
  CreateHallDto,
  CreateTableDto,
  HallListQueryDto,
  TableListQueryDto,
  UpdateHallDto,
  UpdateTableDto,
} from './dto/hall.dto';
import { HallsService } from './halls.service';

const OPTION_READERS = [
  Permission.HallsManage,
  Permission.PosAccess,
  Permission.ReportsView,
] as const;

@ApiTags('Halls')
@Controller('halls')
export class HallsController {
  constructor(private readonly service: HallsService) {}

  @Get()
  @RequirePermissions(Permission.HallsManage)
  list(@Query() query: HallListQueryDto) {
    return this.service.listHalls(query);
  }

  @Get('options')
  @RequireAnyPermission(...OPTION_READERS)
  options() {
    return this.service.hallOptions();
  }

  @Post()
  @RequirePermissions(Permission.HallsManage)
  create(@Body() dto: CreateHallDto, @CurrentUser() actor: AuthUser) {
    return this.service.createHall(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.HallsManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHallDto) {
    return this.service.updateHall(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.HallsManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteHall(id);
  }
}

@ApiTags('Tables')
@Controller('tables')
export class TablesController {
  constructor(private readonly service: HallsService) {}

  @Get()
  @RequirePermissions(Permission.HallsManage)
  list(@Query() query: TableListQueryDto) {
    return this.service.listTables(query);
  }

  @Get('options')
  @RequireAnyPermission(...OPTION_READERS)
  options() {
    return this.service.tableOptions();
  }

  @Post()
  @RequirePermissions(Permission.HallsManage)
  create(@Body() dto: CreateTableDto, @CurrentUser() actor: AuthUser) {
    return this.service.createTable(dto, actor);
  }

  @Post('bulk')
  @RequirePermissions(Permission.HallsManage)
  bulkCreate(@Body() dto: BulkCreateTablesDto) {
    return this.service.bulkCreateTables(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.HallsManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTableDto) {
    return this.service.updateTable(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.HallsManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteTable(id);
  }
}
