import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { LoginEventType } from '../../common/constants/enums';
import { paginated } from '../../common/types/paginated';
import { optionalDateRange } from '../../common/utils/date-range';
import { describeDevice } from '../../common/utils/user-agent';
import type { LoginEventListQueryDto } from './dto/auth.dto';
import { LoginEventsRepository } from './repo/login-events.repository';

/** История входа: who signed in or out, when, and from what device. */
@Injectable()
export class LoginEventsService {
  private readonly logger = new Logger(LoginEventsService.name);
  private readonly timeZone: string;

  constructor(
    private readonly events: LoginEventsRepository,
    config: ConfigService,
  ) {
    this.timeZone = config.getOrThrow<AppConfig>('app').timezone;
  }

  /**
   * Writes one line of the log. Signing in or out must never fail because the
   * log could not be written, so problems are reported and swallowed.
   */
  async record(data: {
    userId: number;
    type: LoginEventType;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    try {
      await this.events.record(data);
    } catch (error) {
      this.logger.error(
        `Не удалось записать вход/выход сотрудника ${data.userId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async list(query: LoginEventListQueryDto) {
    const range = optionalDateRange(query);
    const [items, total] = await this.events.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      userId: query.userId,
      type: query.type,
      from: range.from,
      until: range.until,
      timeZone: this.timeZone,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'DESC',
    });
    return paginated(
      items.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        user: event.user
          ? {
              id: event.user.id,
              fullName: event.user.fullName,
              login: event.user.login,
            }
          : null,
        device: describeDevice(event.userAgent),
        userAgent: event.userAgent,
        ip: event.ip,
      })),
      total,
      query.page,
      query.limit,
    );
  }
}
