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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(Permission.TeamView)
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions(Permission.TeamView)
  permissions() {
    return this.roles.permissionsCatalog();
  }

  @Post()
  @RequirePermissions(Permission.TeamManage)
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.roles.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.TeamManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.TeamManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roles.delete(id);
  }
}
