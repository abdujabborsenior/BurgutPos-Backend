import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { LoginEventType } from '../../../common/constants/enums';
import type { SortOrder } from '../../../common/dto/pagination-query.dto';
import { likeContains } from '../../../common/utils/strings';
import { BaseRepository } from '../../../database/base.repository';
import { LoginEvent } from '../entities/login-event.entity';

export type LoginEventSort = 'createdAt' | 'user';

export interface LoginEventFilter {
  page: number;
  limit: number;
  search?: string;
  userId?: number;
  type?: LoginEventType;
  from?: string;
  /** Exclusive upper bound, local wall-clock time. */
  until?: string;
  timeZone: string;
  sortBy: LoginEventSort;
  sortOrder: SortOrder;
}

@Injectable()
export class LoginEventsRepository extends BaseRepository<LoginEvent> {
  constructor(dataSource: DataSource) {
    super(dataSource, LoginEvent);
  }

  /** Never blocks signing in: the log is written, failures are swallowed by the caller. */
  async record(data: Pick<LoginEvent, 'userId' | 'type' | 'ip' | 'userAgent'>) {
    await this.repo.insert(this.repo.create(data));
  }

  async list(filter: LoginEventFilter): Promise<[LoginEvent[], number]> {
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoin('e.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.login']);

    if (filter.userId)
      qb.andWhere('e.userId = :userId', { userId: filter.userId });
    if (filter.type) qb.andWhere('e.type = :type', { type: filter.type });
    if (filter.search) {
      qb.andWhere('(u.fullName ILIKE :search OR u.login ILIKE :search)', {
        search: likeContains(filter.search),
      });
    }
    if (filter.from) {
      qb.andWhere(`e.createdAt >= CAST(:from AS timestamp) AT TIME ZONE :tz`, {
        from: filter.from,
        tz: filter.timeZone,
      });
    }
    if (filter.until) {
      qb.andWhere(`e.createdAt < CAST(:until AS timestamp) AT TIME ZONE :tz`, {
        until: filter.until,
        tz: filter.timeZone,
      });
    }

    const column = filter.sortBy === 'user' ? 'u.fullName' : 'e.createdAt';
    qb.orderBy(column, filter.sortOrder, 'NULLS LAST')
      .addOrderBy('e.id', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);
    return qb.getManyAndCount();
  }
}
