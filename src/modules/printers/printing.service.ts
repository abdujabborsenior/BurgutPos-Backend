import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createConnection } from 'node:net';
import sharp from 'sharp';
import { PrinterConnection } from '../../common/constants/enums';
import { PAPER_DOTS, rasterJob, toRaster, type RasterPage } from './escpos';
import { PrintersService } from './printers.service';

/** Most pages one request may carry (a long kitchen order is a handful). */
export const PRINT_MAX_PAGES = 20;
/** Largest page picture accepted, bytes. */
export const PRINT_MAX_PAGE_BYTES = 4 * 1024 * 1024;

/** A printer that does not answer within this time is reported as offline. */
const CONNECT_TIMEOUT_MS = 4000;
/** Sending a long job must still finish in a sane time. */
const SEND_TIMEOUT_MS = 20000;

/**
 * Sends paper to network (LAN) printers straight from the server: the pages
 * come as pictures drawn by the browser, go out as ESC/POS raster on port
 * 9100. A USB printer is attached to a terminal, so it keeps printing through
 * that terminal's browser — the server cannot reach it.
 */
@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);
  /** One job at a time per printer: a printer serves one connection. */
  private readonly queues = new Map<number, Promise<unknown>>();

  constructor(private readonly printers: PrintersService) {}

  async printImages(
    printerId: number,
    files: Express.Multer.File[],
  ): Promise<{ printer: string; pages: number }> {
    const printer = await this.printers.getById(printerId);
    if (!printer.isActive) {
      throw new ConflictException(
        `Принтер «${printer.name}» находится в архиве`,
      );
    }
    if (printer.connection === PrinterConnection.Usb || !printer.host) {
      throw new ConflictException(
        `«${printer.name}» подключён по USB — он печатает через браузер терминала`,
      );
    }
    if (!files.length) throw new BadRequestException('Нет страниц для печати');
    if (files.some((file) => file.mimetype !== 'image/png')) {
      throw new BadRequestException(
        'Страницы печати принимаются в формате PNG',
      );
    }

    const pages = await Promise.all(
      files.map((file) => this.rasterize(file.buffer)),
    );
    const host = printer.host;
    const port = printer.port ?? 9100;
    await this.enqueue(printer.id, () =>
      this.send(host, port, rasterJob(pages), printer.name),
    );
    return { printer: printer.name, pages: pages.length };
  }

  /** A page picture → black and white dots exactly as wide as the paper. */
  private async rasterize(png: Buffer): Promise<RasterPage> {
    try {
      const { data, info } = await sharp(png)
        .flatten({ background: '#ffffff' })
        .resize({ width: PAPER_DOTS })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return toRaster(data, info.width, info.height, info.channels);
    } catch {
      throw new BadRequestException('Не удалось прочитать страницу печати');
    }
  }

  private enqueue<T>(printerId: number, job: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(printerId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(job);
    this.queues.set(printerId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(printerId) === next) this.queues.delete(printerId);
      });
    return next;
  }

  /** Opens port 9100, writes the job and waits until it is handed over. */
  private send(
    host: string,
    port: number,
    payload: Buffer,
    name: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = createConnection({ host, port });
      const finish = (error?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (!error) return resolve();
        this.logger.warn(`Печать на «${name}» (${host}:${port}): ${error}`);
        reject(
          new ServiceUnavailableException(
            `Принтер «${name}» (${host}:${port}) ${error}. Проверьте, что он включён и подключён к сети.`,
          ),
        );
      };
      socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish('не отвечает'));
      socket.on('error', (error: NodeJS.ErrnoException) =>
        finish(
          error.code === 'ECONNREFUSED'
            ? 'отклонил подключение'
            : error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH'
              ? 'недоступен в сети'
              : `недоступен (${error.code ?? error.message})`,
        ),
      );
      socket.once('connect', () => {
        socket.setTimeout(SEND_TIMEOUT_MS, () =>
          finish('не успел принять задание'),
        );
        socket.end(payload, () => finish());
      });
    });
  }
}
