import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { paginated } from '../../common/types/paginated';
import { addDays, isDateKey, todayInTimeZone } from '../../common/utils/dates';
import { sumMoney } from '../../common/utils/money';
import { SettingsService } from '../settings/settings.service';
import type {
  DashboardDateQueryDto,
  RevenueQueryDto,
  TopDishesQueryDto,
} from './dto/dashboard.dto';
import { DashboardRepository } from './repo/dashboard.repository';

@Injectable()
export class DashboardService {
  private readonly timeZone: string;

  constructor(
    private readonly repo: DashboardRepository,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<AppConfig>('app').timezone;
  }

  async summary(query: DashboardDateQueryDto) {
    const date = this.resolveDate(query.date);
    const [methods, pending, stats] = await Promise.all([
      this.repo.paymentsByMethod(date, date, this.timeZone),
      this.repo.openOrders(),
      this.repo.orderStats(date, date, this.timeZone),
    ]);
    const total = sumMoney(methods.map((method) => method.amount));
    return {
      date,
      paymentMethods: methods,
      total,
      pending,
      ordersCount: stats.ordersCount,
      averageCheck: stats.ordersCount
        ? Math.round(stats.revenue / stats.ordersCount)
        : 0,
      guests: stats.guests,
      cancelled: stats.cancelled,
    };
  }

  async revenue(query: RevenueQueryDto) {
    const to = this.resolveDate(query.date);
    const from = addDays(to, -(query.days - 1));
    const items = await this.repo.revenueByDay(from, to, this.timeZone);
    return {
      from,
      to,
      days: query.days,
      total: sumMoney(items.map((item) => item.amount)),
      items,
    };
  }

  async topDishes(query: TopDishesQueryDto) {
    const date = this.resolveDate(query.date);
    const { items, total } = await this.repo.topDishes(
      date,
      date,
      this.timeZone,
      query.page,
      query.limit,
    );
    const offset = (query.page - 1) * query.limit;
    return paginated(
      items.map((item, index) => ({ position: offset + index + 1, ...item })),
      total,
      query.page,
      query.limit,
    );
  }

  async waiters(query: DashboardDateQueryDto) {
    const date = this.resolveDate(query.date);
    const [items, settings] = await Promise.all([
      this.repo.waiters(date, date, this.timeZone),
      this.settings.get(),
    ]);
    return {
      date,
      percent: settings.waiterCommissionPercent,
      totalCommission: sumMoney(items.map((item) => item.commission)),
      items,
    };
  }

  private resolveDate(date: string | undefined): string {
    const today = todayInTimeZone(this.timeZone);
    if (!date) return today;
    if (!isDateKey(date)) throw new BadRequestException('Некорректная дата');
    if (date > today)
      throw new BadRequestException('Дата не может быть в будущем');
    return date;
  }
}
