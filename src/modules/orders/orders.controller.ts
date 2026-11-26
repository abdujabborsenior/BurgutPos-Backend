import {
  Body,
  Controller,
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
  AddItemsDto,
  CancelItemDto,
  CancelOrderDto,
  ChangeWaiterDto,
  CreateOrderDto,
  DiscountDto,
  MergeOrderDto,
  MoveOrderDto,
  OrderListQueryDto,
  PayOrderDto,
  ReopenOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('POS')
@Controller('pos')
export class PosController {
  constructor(private readonly orders: OrdersService) {}

  @Get('board')
  @RequirePermissions(Permission.PosAccess)
  board() {
    return this.orders.board();
  }

  @Get('counters')
  @RequirePermissions(Permission.PosAccess)
  counters() {
    return this.orders.counters();
  }
}

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permission.PosAccess)
  list(@Query() query: OrderListQueryDto, @CurrentUser() actor: AuthUser) {
    return this.orders.list(query, actor);
  }

  @Get(':id')
  @RequirePermissions(Permission.PosAccess)
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.getDetail(id);
  }

  @Post()
  @RequirePermissions(Permission.OrdersCreate)
  create(@Body() dto: CreateOrderDto, @CurrentUser() actor: AuthUser) {
    return this.orders.create(dto, actor);
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersCreate)
  addItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddItemsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.addItems(id, dto, actor);
  }

  @Post(':id/items/:itemId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersCancelItems)
  cancelItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: CancelItemDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.cancelItem(id, itemId, dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.OrdersCreate)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.update(id, dto, actor);
  }

  @Post(':id/waiter')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersTransfer)
  changeWaiter(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeWaiterDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.changeWaiter(id, dto, actor);
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersTransfer)
  move(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.moveToTable(id, dto, actor);
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersTransfer)
  merge(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MergeOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.merge(id, dto, actor);
  }

  @Post(':id/discount')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersDiscount)
  discount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiscountDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.applyDiscount(id, dto, actor);
  }

  @Post(':id/precheck')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PosAccess)
  precheck(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.precheck(id, actor);
  }

  /**
   * The receipt of a paid order was printed (the browser prints) — adds it to
   * the order's print history. From the POS after payment and from reports.
   */
  @Post(':id/receipt-print')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission(Permission.PosAccess, Permission.ReportsView)
  receiptPrint(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.recordReceiptPrint(id, actor);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersPay)
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.pay(id, dto, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersCancel)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.cancel(id, dto, actor);
  }

  /** Returns a paid order to work: payments are reversed in the open shift. */
  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.OrdersReopen)
  reopen(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReopenOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orders.reopen(id, dto, actor);
  }
}
