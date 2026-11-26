import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SettingsRepository } from './repo/settings.repository';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [MediaModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository],
  exports: [SettingsService],
})
export class SettingsModule {}
