import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { isForeignKeyViolation } from '../../common/utils/pg-errors';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  BulkCreateTablesDto,
  CreateHallDto,
  CreateTableDto,
  HallListQueryDto,
  TableListQueryDto,
  UpdateHallDto,
  UpdateTableDto,
} from './dto/hall.dto';
import type { DiningTable } from './entities/dining-table.entity';
import type { Hall } from './entities/hall.entity';
import { HallsRepository } from './repo/halls.repository';
import { TablesRepository } from './repo/tables.repository';

const MAX_BULK_TABLES = 100;

@Injectable()
export class HallsService {
  constructor(
    private readonly halls: HallsRepository,
    private readonly tables: TablesRepository,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
  ) {}

  // ─────────────────────────────── Halls ───────────────────────────────

  async listHalls(query: HallListQueryDto) {
    const items = await this.halls.list(query.status);
    return items.map((hall) => ({
      id: hall.id,
      name: hall.name,
      servicePercent: hall.servicePercent,
      sortOrder: hall.sortOrder,
      isActive: hall.isActive,
      tablesCount: hall.tablesCount,
      openOrdersCount: hall.openOrdersCount,
      createdAt: hall.createdAt,
      createdBy: hall.createdBy
        ? { id: hall.createdBy.id, fullName: hall.createdBy.fullName }
        : null,
    }));
  }

  async hallOptions() {
    const items = await this.halls.list('active');
    return items.map((hall) => ({ id: hall.id, name: hall.name }));
  }

  async getHall(id: number): Promise<Hall> {
    const hall = await this.halls.findById(id);
    if (!hall) throw new NotFoundException('Зал не найден');
    return hall;
  }

  async createHall(dto: CreateHallDto, actor: AuthUser): Promise<Hall> {
    if (await this.halls.nameExists(dto.name)) {
      throw new ConflictException('Зал с таким названием уже существует');
    }
    const hall = await this.halls.create({
      name: dto.name,
      servicePercent: dto.servicePercent ?? null,
      sortOrder: dto.sortOrder ?? (await this.halls.nextSortOrder()),
      createdById: actor.id,
    });
    this.realtime.invalidate(['board', 'halls']);
    return hall;
  }

  async updateHall(id: number, dto: UpdateHallDto): Promise<Hall> {
    await this.tx.run(async () => {
      const hall = await this.getHall(id);
      if (dto.name && (await this.halls.nameExists(dto.name, id))) {
        throw new ConflictException('Зал с таким названием уже существует');
      }
      if (dto.isActive === false && hall.isActive) {
        const open = await this.halls.countOpenOrders(id);
        if (open > 0) {
          throw new ConflictException(
            `В зале есть открытые заказы (${open}). Закройте их перед архивированием`,
          );
        }
      }
      await this.halls.update(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.servicePercent !== undefined
          ? { servicePercent: dto.servicePercent }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      });
    });
    this.realtime.invalidate(['board', 'halls']);
    return this.getHall(id);
  }

  async deleteHall(id: number): Promise<void> {
    await this.tx.run(async () => {
      await this.getHall(id);
      const tablesCount = await this.halls.countTables(id);
      if (tablesCount > 0) {
        throw new ConflictException(
          `В зале есть столы (${tablesCount}). Удалите или перенесите их, либо архивируйте зал`,
        );
      }
      await this.halls.delete(id);
    });
    this.realtime.invalidate(['board', 'halls']);
  }

  // ─────────────────────────────── Tables ──────────────────────────────

  async listTables(query: TableListQueryDto) {
    const [items, total] = await this.tables.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      hallId: query.hallId,
      status: query.status,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'ASC',
    });
    const counts = await this.tables.countByStatus();
    return {
      ...paginated(
        items.map((table) => this.toTableView(table)),
        total,
        query.page,
        query.limit,
      ),
      counts,
    };
  }

  async tableOptions() {
    const tables = await this.tables.findActiveOptions();
    return tables.map((table) => ({
      id: table.id,
      name: table.name,
      hallId: table.hallId,
      hallName: table.hall.name,
    }));
  }

  async getTable(id: number): Promise<DiningTable> {
    const table = await this.tables.findById(id);
    if (!table) throw new NotFoundException('Стол не найден');
    return table;
  }

  async createTable(dto: CreateTableDto, actor: AuthUser) {
    const id = await this.tx.run(async () => {
      await this.getHall(dto.hallId);
      if (await this.tables.nameExistsInHall(dto.hallId, dto.name)) {
        throw new ConflictException(
          'Стол с таким названием уже есть в этом зале',
        );
      }
      const table = await this.tables.create({
        hallId: dto.hallId,
        name: dto.name,
        seats: dto.seats ?? null,
        sortOrder:
          dto.sortOrder ?? (await this.tables.nextSortOrder(dto.hallId)),
        createdById: actor.id,
      });
      return table.id;
    });
    this.realtime.invalidate(['board', 'halls']);
    return this.toTableView(await this.getTable(id));
  }

  async bulkCreateTables(dto: BulkCreateTablesDto) {
    if (dto.from > dto.to) {
      throw new BadRequestException(
        'Начальный номер не может быть больше конечного',
      );
    }
    const count = dto.to - dto.from + 1;
    if (count > MAX_BULK_TABLES) {
      throw new BadRequestException(
        `За один раз можно создать не более ${MAX_BULK_TABLES} столов`,
      );
    }
    const result = await this.tx.run(async () => {
      await this.getHall(dto.hallId);
      const names = Array.from(
        { length: count },
        (_, i) => `${dto.prefix} ${dto.from + i}`,
      );
      const existing = new Set(
        (await this.tables.findExistingNames(dto.hallId, names)).map((n) =>
          n.toLowerCase(),
        ),
      );
      let sortOrder = await this.tables.nextSortOrder(dto.hallId);
      const rows = names
        .filter((name) => !existing.has(name.toLowerCase()))
        .map((name) => ({
          hallId: dto.hallId,
          name,
          seats: dto.seats ?? null,
          sortOrder: sortOrder++,
        }));
      const created = await this.tables.createMany(rows);
      return { created, skipped: count - created };
    });
    this.realtime.invalidate(['board', 'halls']);
    return result;
  }

  async updateTable(id: number, dto: UpdateTableDto) {
    await this.tx.run(async () => {
      const table = await this.getTable(id);
      const hallId = dto.hallId ?? table.hallId;
      if (dto.hallId !== undefined && dto.hallId !== table.hallId) {
        await this.getHall(dto.hallId);
      }
      const name = dto.name ?? table.name;
      if (
        (dto.name !== undefined || dto.hallId !== undefined) &&
        (await this.tables.nameExistsInHall(hallId, name, id))
      ) {
        throw new ConflictException(
          'Стол с таким названием уже есть в этом зале',
        );
      }
      if (
        dto.isActive === false &&
        table.isActive &&
        (await this.tables.hasOpenOrder(id))
      ) {
        throw new ConflictException(
          'На столе открыт заказ. Закройте его перед архивированием',
        );
      }
      await this.tables.update(id, {
        ...(dto.hallId !== undefined ? { hallId: dto.hallId } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      });
    });
    this.realtime.invalidate(['board', 'halls']);
    return this.toTableView(await this.getTable(id));
  }

  async deleteTable(id: number): Promise<void> {
    await this.getTable(id);
    try {
      await this.tables.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'У стола есть история заказов — его можно только архивировать',
        );
      }
      throw error;
    }
    this.realtime.invalidate(['board', 'halls']);
  }

  // ─────────────────────── Used by the orders module ───────────────────────

  /** Table that can host a new order: active and inside an active hall. */
  async getTableForOrder(id: number): Promise<DiningTable> {
    const table = await this.tables.findById(id);
    if (!table) throw new NotFoundException('Стол не найден');
    if (!table.isActive || !table.hall.isActive) {
      throw new BadRequestException('Стол недоступен для заказов');
    }
    return table;
  }

  activeHallsWithTables(): Promise<Hall[]> {
    return this.halls.findActiveWithTables();
  }

  private toTableView(table: DiningTable) {
    return {
      id: table.id,
      name: table.name,
      seats: table.seats,
      sortOrder: table.sortOrder,
      isActive: table.isActive,
      hall: {
        id: table.hall.id,
        name: table.hall.name,
        isActive: table.hall.isActive,
      },
      createdAt: table.createdAt,
      createdBy: table.createdBy
        ? { id: table.createdBy.id, fullName: table.createdBy.fullName }
        : null,
    };
  }
}
