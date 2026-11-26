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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import {
  CreatePrinterDto,
  PrinterListQueryDto,
  UpdatePrinterDto,
} from './dto/printer.dto';
import { PrintersService } from './printers.service';
import {
  PRINT_MAX_PAGE_BYTES,
  PRINT_MAX_PAGES,
  PrintingService,
} from './printing.service';

@ApiTags('Printers')
@Controller('printers')
export class PrintersController {
  constructor(
    private readonly printers: PrintersService,
    private readonly printing: PrintingService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SettingsManage)
  list(@Query() query: PrinterListQueryDto) {
    return this.printers.list(query);
  }

  @Get('options')
  @RequireAnyPermission(
    Permission.MenuView,
    Permission.SettingsManage,
    Permission.PosAccess,
  )
  options() {
    return this.printers.options();
  }

  @Post()
  @RequirePermissions(Permission.SettingsManage)
  create(@Body() dto: CreatePrinterDto) {
    return this.printers.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SettingsManage)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePrinterDto) {
    return this.printers.update(id, dto);
  }

  /**
   * Prints pages (PNG pictures drawn by the browser) on a network printer.
   * Everyone who prints — the till, reports, the printer settings — may send.
   */
  @Post(':id/print')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @RequireAnyPermission(
    Permission.PosAccess,
    Permission.ReportsView,
    Permission.SettingsManage,
  )
  @UseInterceptors(
    FilesInterceptor('pages', PRINT_MAX_PAGES, {
      limits: { fileSize: PRINT_MAX_PAGE_BYTES, files: PRINT_MAX_PAGES },
    }),
  )
  print(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.printing.printImages(id, files ?? []);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.SettingsManage)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.printers.delete(id);
  }
}
