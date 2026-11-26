import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BunnyConfig, MediaConfig } from '../../config/configuration';
import { MediaStorage } from './media-storage';

/** Bunny answers 201 to a stored file; anything else is a failed upload. */
const CREATED = 201;
const UPLOAD_TIMEOUT_MS = 20_000;

/**
 * Bunny Storage + pull zone. The API uploads to the storage endpoint with the
 * zone password and hands out the pull-zone URL, so the browser never talks to
 * storage.bunnycdn.com and the key never leaves the server.
 */
@Injectable()
export class BunnyMediaStorage extends MediaStorage {
  private readonly logger = new Logger(BunnyMediaStorage.name);
  private readonly bunny: BunnyConfig;
  /** Pull-zone origin without a trailing slash: the prefix of every URL. */
  private readonly base: string;

  constructor(config: ConfigService) {
    super();
    this.bunny = config.getOrThrow<MediaConfig>('media').bunny;
    this.base = this.bunny.pullZoneUrl.replace(/\/+$/, '');
  }

  /** `burgutpos/dishes/uuid.webp` — the path inside the storage zone. */
  private path(folder: string, fileName: string): string {
    const prefix = this.bunny.folder ? `${this.bunny.folder}/` : '';
    return `${prefix}${folder}/${fileName}`;
  }

  private endpoint(path: string): string {
    return `https://${this.bunny.storageHost}/${this.bunny.storageZone}/${path}`;
  }

  async save(bytes: Buffer, folder: string, fileName: string): Promise<string> {
    const path = this.path(folder, fileName);
    let response: Response;
    try {
      response = await fetch(this.endpoint(path), {
        method: 'PUT',
        headers: {
          AccessKey: this.bunny.accessKey,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Bunny upload failed: ${String(error)}`);
      throw new InternalServerErrorException(
        'Хранилище изображений недоступно. Попробуйте ещё раз',
      );
    }
    if (response.status !== CREATED) {
      // The body carries Bunny's own reason; it is for the log, not the user.
      this.logger.error(
        `Bunny upload rejected (${response.status}): ${(await response.text()).slice(0, 200)}`,
      );
      throw new InternalServerErrorException(
        'Не удалось сохранить изображение в хранилище',
      );
    }
    return `${this.base}/${path}`;
  }

  owns(publicUrl: string): boolean {
    return Boolean(this.base) && publicUrl.startsWith(`${this.base}/`);
  }

  /** Best effort: a picture left behind costs storage, a failed request must
   *  never break saving the dish that no longer points at it. */
  async remove(publicUrl: string): Promise<void> {
    const path = publicUrl.slice(this.base.length + 1);
    if (!path) return;
    try {
      const response = await fetch(this.endpoint(path), {
        method: 'DELETE',
        headers: { AccessKey: this.bunny.accessKey },
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!response.ok && response.status !== 404) {
        this.logger.warn(`Bunny delete ${path}: ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Bunny delete ${path} failed: ${String(error)}`);
    }
  }
}
