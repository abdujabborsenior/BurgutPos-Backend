import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrinterConnection } from '../../common/constants/enums';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  CreatePrinterDto,
  PrinterListQueryDto,
  UpdatePrinterDto,
} from './dto/printer.dto';
import type { Printer } from './entities/printer.entity';
import { PrintersRepository } from './repo/printers.repository';

/** Standard port of an ESC/POS network printer. */
const DEFAULT_PORT = 9100;

@Injectable()
export class PrintersService {
  constructor(
    private readonly printers: PrintersRepository,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
  ) {}

  list(query: PrinterListQueryDto) {
    return this.printers.list(query.status);
  }

  /**
   * Active printers to pick from and to print on: the terminal needs to know
   * whether a printer is on the network (the server sends to it) or on USB
   * (the terminal's browser prints), and which one takes bills and receipts.
   */
  async options() {
    const items = await this.printers.list('active');
    return items.map((printer) => ({
      id: printer.id,
      name: printer.name,
      connection: printer.connection,
      isDefault: printer.isDefault,
    }));
  }

  /** Where bills and receipts go — the active default printer, if any. */
  async defaultPrinter(): Promise<{ id: number; name: string } | null> {
    const printer = await this.printers.findDefault();
    return printer ? { id: printer.id, name: printer.name } : null;
  }

  async getById(id: number): Promise<Printer> {
    const printer = await this.printers.findById(id);
    if (!printer) throw new NotFoundException('Принтер не найден');
    return printer;
  }

  /** Validates a printer reference coming from a dish form. */
  async assertUsable(id: number): Promise<Printer> {
    const printer = await this.getById(id);
    if (!printer.isActive) {
      throw new ConflictException('Выбранный принтер находится в архиве');
    }
    return printer;
  }

  /**
   * A network printer needs an address, a USB one has none: the pair is
   * resolved here so the stored row can never say "USB at 192.168.0.5".
   */
  private connectionPatch(
    connection: PrinterConnection,
    host: string | null | undefined,
    port: number | null | undefined,
  ) {
    if (connection === PrinterConnection.Usb) {
      return { connection, host: null, port: null };
    }
    const address = host?.trim() || null;
    if (!address) {
      throw new BadRequestException('Укажите IP-адрес сетевого принтера');
    }
    return { connection, host: address, port: port ?? DEFAULT_PORT };
  }

  async create(dto: CreatePrinterDto): Promise<Printer> {
    const id = await this.tx.run(async () => {
      if (await this.printers.nameExists(dto.name)) {
        throw new ConflictException('Принтер с таким названием уже существует');
      }
      // Only one station can be the default; the index enforces it, we keep
      // the switch friendly by clearing the previous one first.
      if (dto.isDefault) await this.printers.clearDefault();
      const printer = await this.printers.create({
        name: dto.name,
        description: dto.description ?? null,
        ...this.connectionPatch(
          dto.connection ?? PrinterConnection.Lan,
          dto.host,
          dto.port,
        ),
        isDefault: dto.isDefault ?? false,
        sortOrder: dto.sortOrder ?? (await this.printers.nextSortOrder()),
      });
      return printer.id;
    });
    this.realtime.invalidate(['printers']);
    return this.getById(id);
  }

  async update(id: number, dto: UpdatePrinterDto): Promise<Printer> {
    await this.tx.run(async () => {
      const printer = await this.getById(id);
      if (dto.name && (await this.printers.nameExists(dto.name, id))) {
        throw new ConflictException('Принтер с таким названием уже существует');
      }
      const connection = dto.connection ?? printer.connection;
      const touchesConnection =
        dto.connection !== undefined ||
        dto.host !== undefined ||
        dto.port !== undefined;
      if (dto.isDefault) await this.printers.clearDefault(id);
      // An archived printer cannot stay the default one.
      const isDefault = dto.isActive === false ? false : dto.isDefault;
      await this.printers.update(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description || null }
          : {}),
        ...(touchesConnection
          ? this.connectionPatch(
              connection,
              dto.host !== undefined ? dto.host : printer.host,
              dto.port !== undefined ? dto.port : printer.port,
            )
          : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      });
    });
    this.realtime.invalidate(['printers', 'menu']);
    return this.getById(id);
  }

  async delete(id: number): Promise<void> {
    await this.tx.run(async () => {
      await this.getById(id);
      const dishes = await this.printers.countDishes(id);
      if (dishes > 0) {
        throw new ConflictException(
          `Принтер назначен блюдам (${dishes}). Переназначьте их или архивируйте принтер`,
        );
      }
      await this.printers.delete(id);
    });
    this.realtime.invalidate(['printers']);
  }
}
