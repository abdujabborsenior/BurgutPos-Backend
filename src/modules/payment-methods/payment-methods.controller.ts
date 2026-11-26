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
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import {
  CreatePaymentMethodDto,
  PaymentMethodListQueryDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('Payment methods')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Get()
  @RequirePermissions(Permission.SettingsManage)
  list(@Query() query: PaymentMethodListQueryDto) {
    return this.methods.list(query);
  }

  @Get('options')
  @RequireAnyPermission(
    Permission.PosAccess,
    Permission.SettingsManage,
    Permission.ReportsView,
    Permission.DashboardView,
    Permission.ShiftsView,
  )
  options() {
    return this.methods.options();
  }

  @Post()
  @RequirePermissions(Permission.SettingsManage)
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.methods.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SettingsManage)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.methods.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.SettingsManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.methods.delete(id);
  }
}
