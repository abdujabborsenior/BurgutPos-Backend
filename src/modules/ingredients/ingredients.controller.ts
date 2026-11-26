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
  CreateIngredientDto,
  IngredientListQueryDto,
  UpdateIngredientDto,
} from './dto/ingredient.dto';
import { IngredientsService } from './ingredients.service';

@ApiTags('Ingredients')
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get()
  @RequirePermissions(Permission.StockView)
  list(@Query() query: IngredientListQueryDto) {
    return this.ingredients.list(query);
  }

  @Get('options')
  @RequireAnyPermission(Permission.StockView, Permission.MenuView)
  options() {
    return this.ingredients.options();
  }

  @Post()
  @RequirePermissions(Permission.StockManage)
  create(@Body() dto: CreateIngredientDto, @CurrentUser() actor: AuthUser) {
    return this.ingredients.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.StockManage)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.ingredients.update(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StockManage)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.ingredients.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StockManage)
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.ingredients.restore(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StockManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ingredients.delete(id);
  }
}
