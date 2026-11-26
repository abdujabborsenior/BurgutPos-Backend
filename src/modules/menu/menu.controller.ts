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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { IMAGE_MAX_BYTES } from '../media/image-storage.service';
import { CategoriesService } from './categories.service';
import { DishesService } from './dishes.service';
import {
  CategoryListQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import {
  CreateDishDto,
  DishListQueryDto,
  SetAvailabilityDto,
  UpdateDishDto,
} from './dto/dish.dto';

@ApiTags('Menu · Categories')
@Controller('dish-categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permission.MenuView)
  list(@Query() query: CategoryListQueryDto) {
    return this.categories.list(query);
  }

  @Get('options')
  @RequireAnyPermission(
    Permission.MenuView,
    Permission.StockView,
    Permission.ReportsView,
    Permission.PosAccess,
  )
  options() {
    return this.categories.options();
  }

  @Post()
  @RequirePermissions(Permission.MenuManage)
  create(@Body() dto: CreateCategoryDto, @CurrentUser() actor: AuthUser) {
    return this.categories.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.MenuManage)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MenuManage)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.categories.setActive(id, false);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MenuManage)
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.categories.setActive(id, true);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MenuManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categories.delete(id);
  }
}

@ApiTags('Menu · Dishes')
@Controller('dishes')
export class DishesController {
  constructor(private readonly dishes: DishesService) {}

  @Get()
  @RequirePermissions(Permission.MenuView)
  list(@Query() query: DishListQueryDto) {
    return this.dishes.list(query);
  }

  /** Active dishes for pickers. Declared before ':id' on purpose. */
  @Get('options')
  @RequireAnyPermission(
    Permission.MenuView,
    Permission.StockView,
    Permission.ReportsView,
  )
  options() {
    return this.dishes.options();
  }

  /** Menu tree for the order screen. Declared before ':id' on purpose. */
  @Get('pos-menu')
  @RequirePermissions(Permission.PosAccess)
  posMenu() {
    return this.dishes.posMenu();
  }

  @Get(':id')
  @RequireAnyPermission(Permission.MenuView, Permission.StockView)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.dishes.getDetail(id);
  }

  @Post()
  @RequirePermissions(Permission.MenuManage)
  create(@Body() dto: CreateDishDto, @CurrentUser() actor: AuthUser) {
    return this.dishes.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.MenuManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDishDto) {
    return this.dishes.update(id, dto);
  }

  @Patch(':id/availability')
  @RequirePermissions(Permission.MenuManage)
  setAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.dishes.setAvailability(id, dto.isAvailable);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MenuManage)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.dishes.setActive(id, false);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MenuManage)
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.dishes.setActive(id, true);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MenuManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.dishes.delete(id);
  }

  @Post(':id/image')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(Permission.MenuManage)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.dishes.uploadImage(id, file);
  }

  @Delete(':id/image')
  @RequirePermissions(Permission.MenuManage)
  removeImage(@Param('id', ParseIntPipe) id: number) {
    return this.dishes.removeImage(id);
  }
}
