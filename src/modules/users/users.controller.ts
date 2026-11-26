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
  CreateUserDto,
  UpdateUserDto,
  UserListQueryDto,
  UserOptionsQueryDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.TeamView)
  list(@Query() query: UserListQueryDto) {
    return this.users.list(query);
  }

  @Get('options')
  @RequireAnyPermission(
    Permission.PosAccess,
    Permission.TeamView,
    Permission.ReportsView,
    Permission.StockView,
  )
  options(@Query() query: UserOptionsQueryDto) {
    return this.users.options(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.TeamView)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.getById(id);
  }

  @Post()
  @RequirePermissions(Permission.TeamManage)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.TeamManage)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.TeamManage)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.delete(id, actor);
  }
}
