import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IMAGE_MAX_BYTES } from '../media/image-storage.service';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Readable by every signed-in user: the POS needs receipt texts and rates. */
  @Get()
  get() {
    return this.settings.view();
  }

  /** The lines the printed documents can show — drives the receipt editor. */
  @Get('receipt-lines')
  receiptLines() {
    return this.settings.receiptLines();
  }

  @Patch()
  @RequirePermissions(Permission.SettingsManage)
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() actor: AuthUser) {
    return this.settings.update(dto, actor);
  }

  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(Permission.SettingsManage)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    }),
  )
  uploadLogo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.settings.setLogo(file, actor);
  }

  @Delete('logo')
  @RequirePermissions(Permission.SettingsManage)
  removeLogo(@CurrentUser() actor: AuthUser) {
    return this.settings.removeLogo(actor);
  }
}
