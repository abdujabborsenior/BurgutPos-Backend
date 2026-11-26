import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { MediaConfig } from '../../config/configuration';
import { BunnyMediaStorage } from './bunny-storage.service';
import { LocalMediaStorage } from './local-storage.service';
import type { MediaStorage } from './media-storage';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validates and re-encodes every upload, then hands the bytes to the configured
 * driver. Re-encoding with sharp applies EXIF orientation, strips metadata,
 * bounds the size and neutralises files that only pretend to be images — that
 * part is the same wherever the picture is finally kept.
 *
 * Deletion asks every driver, not just the active one: after a venue switches
 * to the CDN, the pictures uploaded before the switch still have to go away
 * when their dish does.
 */
@Injectable()
export class ImageStorageService {
  private readonly primary: MediaStorage;
  private readonly drivers: MediaStorage[];

  constructor(
    config: ConfigService,
    local: LocalMediaStorage,
    bunny: BunnyMediaStorage,
  ) {
    const media = config.getOrThrow<MediaConfig>('media');
    this.primary = media.driver === 'bunny' ? bunny : local;
    this.drivers = [local, bunny];
  }

  async saveImage(
    file: Express.Multer.File | undefined,
    folder: 'dishes' | 'logo',
  ): Promise<string> {
    if (!file) throw new BadRequestException('Выберите файл изображения');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Поддерживаются изображения JPG, PNG и WebP',
      );
    }
    if (file.size > IMAGE_MAX_BYTES) {
      throw new BadRequestException('Размер изображения — не более 5 МБ');
    }

    let output: Buffer;
    try {
      // A receipt logo is printed on 80 mm paper: narrow and light.
      const box = folder === 'logo' ? 480 : 800;
      output = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize(box, box, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Файл повреждён или не является изображением',
      );
    }

    return this.primary.save(output, folder, `${randomUUID()}.webp`);
  }

  /** Best-effort removal of a previously stored image, wherever it lives. */
  async remove(publicUrl: string | null | undefined): Promise<void> {
    if (!publicUrl) return;
    const owner = this.drivers.find((driver) => driver.owns(publicUrl));
    await owner?.remove(publicUrl);
  }
}
