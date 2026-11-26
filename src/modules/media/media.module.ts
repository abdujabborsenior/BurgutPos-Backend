import { Global, Module } from '@nestjs/common';
import { BunnyMediaStorage } from './bunny-storage.service';
import { ImageStorageService } from './image-storage.service';
import { LocalMediaStorage } from './local-storage.service';

/**
 * Both drivers are always constructed: the active one writes, and the other
 * stays available so pictures stored before a switch can still be deleted.
 */
@Global()
@Module({
  providers: [LocalMediaStorage, BunnyMediaStorage, ImageStorageService],
  exports: [ImageStorageService],
})
export class MediaModule {}
