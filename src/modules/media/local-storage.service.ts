import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import type { MediaConfig } from '../../config/configuration';
import { MediaStorage } from './media-storage';
import { writeFile } from 'node:fs/promises';

export const LOCAL_PREFIX = '/uploads';

/** Images on the machine that runs the API, served by the API itself. */
@Injectable()
export class LocalMediaStorage extends MediaStorage {
  private readonly logger = new Logger(LocalMediaStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = config.getOrThrow<MediaConfig>('media').uploadDir;
  }

  async save(bytes: Buffer, folder: string, fileName: string): Promise<string> {
    const directory = join(this.root, folder);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), bytes);
    return `${LOCAL_PREFIX}/${folder}/${fileName}`;
  }

  owns(publicUrl: string): boolean {
    return publicUrl.startsWith(`${LOCAL_PREFIX}/`);
  }

  async remove(publicUrl: string): Promise<void> {
    // Never let a stored path walk out of the upload directory.
    const relative = normalize(publicUrl.slice(LOCAL_PREFIX.length + 1));
    if (relative.startsWith('..') || relative.includes(`..${sep}`)) return;
    try {
      await unlink(join(this.root, relative));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT')
        this.logger.warn(`Failed to remove ${publicUrl}: ${code}`);
    }
  }
}
