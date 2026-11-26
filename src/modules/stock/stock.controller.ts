import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  ArchiveReceiptDto,
  BalanceQueryDto,
  CreateReceiptsDto,
  DishAdjustDto,
  DishWriteOffDto,
  IngredientAdjustDto,
  IngredientWriteOffDto,
  MovementListQueryDto,
  ReceiptListQueryDto,
  SetTrackingDto,
  TransferDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@ApiTags('Stock')
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('balance')
  @RequirePermissions(Permission.StockView)
  balance(@Query() query: BalanceQueryDto) {
    return this.stock.balance(query);
  }

  @Patch('dishes/:id/tracking')
  @RequirePermissions(Permission.StockManage)
  setTracking(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTrackingDto,
  ) {
    return this.stock.setTracking(id, dto);
  }

  @Post('dishes/:id/transfer')
  @RequirePermissions(Permission.StockManage)
  transfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.transferDish(id, dto, actor);
  }

  @Post('dishes/:id/write-off')
  @RequirePermissions(Permission.StockManage)
  writeOffDish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DishWriteOffDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.writeOffDish(id, dto, actor);
  }

  @Post('dishes/:id/adjust')
  @RequirePermissions(Permission.StockManage)
  adjustDish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DishAdjustDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.adjustDish(id, dto, actor);
  }

  @Post('ingredients/:id/write-off')
  @RequirePermissions(Permission.StockManage)
  writeOffIngredient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IngredientWriteOffDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.writeOffIngredient(id, dto, actor);
  }

  @Post('ingredients/:id/adjust')
  @RequirePermissions(Permission.StockManage)
  adjustIngredient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IngredientAdjustDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.adjustIngredient(id, dto, actor);
  }

  @Get('receipts')
  @RequirePermissions(Permission.StockView)
  receipts(@Query() query: ReceiptListQueryDto) {
    return this.stock.listReceipts(query);
  }

  @Post('receipts')
  @RequirePermissions(Permission.StockManage)
  createReceipts(
    @Body() dto: CreateReceiptsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.createReceipts(dto, actor);
  }

  @Post('receipts/:id/archive')
  @RequirePermissions(Permission.StockManage)
  archiveReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArchiveReceiptDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.stock.archiveReceipt(id, dto, actor);
  }

  @Get('movements')
  @RequirePermissions(Permission.StockView)
  movements(@Query() query: MovementListQueryDto) {
    return this.stock.listMovements(query);
  }
}
