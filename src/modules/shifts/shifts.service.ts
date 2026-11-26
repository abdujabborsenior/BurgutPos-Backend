import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { CashOperationType, ShiftStatus } from '../../common/constants/enums';
import type { AuthUser } from '../../common/types/auth-user';
import { paginated } from '../../common/types/paginated';
import { optionalDateRange } from '../../common/utils/date-range';
import { addMoney, compare, money, subMoney } from '../../common/utils/money';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  CashOperationDto,
  CloseShiftDto,
  OpenShiftDto,
  ShiftListQueryDto,
} from './dto/shift.dto';
import type { Shift } from './entities/shift.entity';
import { CashOperationsRepository } from './repo/cash-operations.repository';
import {
  type ShiftAggregates,
  ShiftsRepository,
} from './repo/shifts.repository';

const userRef = (user: { id: number; fullName: string } | null | undefined) =>
  user ? { id: user.id, fullName: user.fullName } : null;

@Injectable()
export class ShiftsService {
  private readonly timeZone: string;

  constructor(
    private readonly shifts: ShiftsRepository,
    private readonly cashOperations: CashOperationsRepository,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<AppConfig>('app').timezone;
  }

  /** Lightweight status for every POS terminal. */
  async currentStatus() {
    const shift = await this.shifts.findOpen();
    return shift
      ? {
          id: shift.id,
          openedAt: shift.openedAt,
          openedBy: userRef(shift.openedBy),
        }
      : null;
  }

  async current() {
    const shift = await this.shifts.findOpen();
    return shift ? this.detail(shift.id) : null;
  }

  async getById(id: number) {
    return this.detail(id);
  }

  async list(query: ShiftListQueryDto) {
    const range = optionalDateRange(query);
    const [items, total] = await this.shifts.list({
      page: query.page,
      limit: query.limit,
      status: query.status,
      from: range.from,
      until: range.until,
      timeZone: this.timeZone,
    });
    return paginated(
      items.map((shift) => ({
        id: shift.id,
        status: shift.status,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        openedBy: userRef(shift.openedBy),
        closedBy: userRef(shift.closedBy),
        openingCash: shift.openingCash,
        closingCash: shift.closingCash,
        expectedCash: shift.expectedCash,
        cashDifference:
          shift.closingCash !== null && shift.expectedCash !== null
            ? subMoney(shift.closingCash, shift.expectedCash)
            : null,
        revenue: shift.revenue ?? shift.liveRevenue,
        ordersCount: shift.ordersCount,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async open(dto: OpenShiftDto, actor: AuthUser) {
    const shift = await this.tx.run(async () => {
      if (await this.shifts.findOpen())
        throw new ConflictException('Смена уже открыта');
      return this.shifts.create({
        status: ShiftStatus.Open,
        openedById: actor.id,
        openingCash: money(dto.openingCash),
        openComment: dto.comment ?? null,
      });
    });
    this.realtime.invalidate(['shift', 'dashboard']);
    return this.detail(shift.id);
  }

  async close(dto: CloseShiftDto, actor: AuthUser) {
    const shiftId = await this.tx.run(async () => {
      const shift = await this.shifts.findOpenLocked('update');
      if (!shift) throw new ConflictException('Нет открытой смены');
      const open = await this.shifts.countOpenOrders();
      if (open.count > 0) {
        throw new ConflictException(
          `Есть незакрытые заказы (${open.count}). Закройте или отмените их перед закрытием смены`,
        );
      }
      const aggregates = await this.shifts.aggregates(shift.id);
      await this.shifts.update(shift.id, {
        status: ShiftStatus.Closed,
        closedAt: new Date(),
        closedById: actor.id,
        closingCash: money(dto.closingCash),
        expectedCash: this.expectedCash(shift, aggregates),
        revenue: money(aggregates.revenue),
        closeComment: dto.comment ?? null,
      });
      return shift.id;
    });
    this.realtime.invalidate(['shift', 'dashboard', 'counters']);
    return this.detail(shiftId);
  }

  async addCashOperation(dto: CashOperationDto, actor: AuthUser) {
    const shiftId = await this.tx.run(async () => {
      // UPDATE lock: serialises concurrent withdrawals against the same drawer.
      const shift = await this.shifts.findOpenLocked('update');
      if (!shift) throw new ConflictException('Нет открытой смены');
      if (dto.type === CashOperationType.Out) {
        const expected = this.expectedCash(
          shift,
          await this.shifts.aggregates(shift.id),
        );
        if (compare(dto.amount, expected) > 0) {
          throw new ConflictException(
            `В кассе недостаточно наличных: ожидается ${expected.toLocaleString('ru-RU')} сум`,
          );
        }
      }
      await this.cashOperations.create({
        shiftId: shift.id,
        type: dto.type,
        amount: money(dto.amount),
        comment: dto.comment,
        createdById: actor.id,
      });
      return shift.id;
    });
    this.realtime.invalidate(['shift']);
    return this.detail(shiftId);
  }

  /**
   * Returns the open shift and holds a SHARE lock on it until the caller's
   * transaction ends, so the shift cannot be closed underneath an order or
   * payment that is being written into it.
   */
  async requireOpenShift(): Promise<Shift> {
    const shift = await this.shifts.findOpenLocked('share');
    if (!shift) {
      throw new ConflictException({
        message: 'Смена не открыта. Откройте смену, чтобы продолжить',
        code: 'SHIFT_CLOSED',
      });
    }
    return shift;
  }

  private expectedCash(shift: Shift, aggregates: ShiftAggregates): number {
    return money(
      subMoney(
        addMoney(
          addMoney(shift.openingCash, aggregates.cashPayments),
          aggregates.cashIn,
        ),
        aggregates.cashOut,
      ),
    );
  }

  private async detail(id: number) {
    const shift = await this.shifts.findById(id);
    if (!shift) throw new NotFoundException('Смена не найдена');
    const aggregates = await this.shifts.aggregates(id);
    const operations = await this.cashOperations.listByShift(id);
    const expected =
      shift.status === ShiftStatus.Closed && shift.expectedCash !== null
        ? shift.expectedCash
        : this.expectedCash(shift, aggregates);

    return {
      id: shift.id,
      status: shift.status,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openedBy: userRef(shift.openedBy),
      closedBy: userRef(shift.closedBy),
      openComment: shift.openComment,
      closeComment: shift.closeComment,
      summary: {
        ordersCount: aggregates.paidCount,
        revenue: money(aggregates.revenue),
        averageCheck: aggregates.paidCount
          ? Math.round(aggregates.revenue / aggregates.paidCount)
          : 0,
        guests: aggregates.guests,
        discounts: aggregates.discounts,
        service: aggregates.service,
        deliveryFees: aggregates.deliveryFees,
        openOrders: {
          count: aggregates.openCount,
          total: aggregates.openTotal,
        },
        cancelledOrders: {
          count: aggregates.cancelledCount,
          total: aggregates.cancelledTotal,
        },
        payments: aggregates.payments,
        byType: aggregates.byType,
      },
      cash: {
        opening: shift.openingCash,
        payments: money(aggregates.cashPayments),
        in: aggregates.cashIn,
        out: aggregates.cashOut,
        expected,
        counted: shift.closingCash,
        difference:
          shift.closingCash !== null
            ? subMoney(shift.closingCash, expected)
            : null,
      },
      cashOperations: operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        amount: operation.amount,
        comment: operation.comment,
        createdAt: operation.createdAt,
        createdBy: userRef(operation.createdBy),
      })),
    };
  }
}
