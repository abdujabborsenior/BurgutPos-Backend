import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, LessThan, MoreThan, Not } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { Session } from '../entities/session.entity';

@Injectable()
export class SessionsRepository extends BaseRepository<Session> {
  constructor(dataSource: DataSource) {
    super(dataSource, Session);
  }

  create(
    data: Pick<
      Session,
      'userId' | 'tokenHash' | 'userAgent' | 'ip' | 'expiresAt'
    >,
  ) {
    return this.repo.save(
      this.repo.create({ ...data, lastUsedAt: new Date() }),
    );
  }

  /** Non-revoked, non-expired session. */
  findActive(id: string): Promise<Session | null> {
    return this.repo.findOne({
      where: { id, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
  }

  async touch(
    id: string,
    patch: Pick<Session, 'expiresAt' | 'lastUsedAt' | 'ip' | 'userAgent'>,
  ): Promise<void> {
    await this.repo.update({ id }, patch);
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(userId: number, exceptId?: string): Promise<void> {
    await this.repo.update(
      exceptId
        ? { userId, revokedAt: IsNull(), id: Not(exceptId) }
        : { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async deleteStale(before: Date): Promise<number> {
    const expired = await this.repo.delete({ expiresAt: LessThan(before) });
    const revoked = await this.repo.delete({ revokedAt: LessThan(before) });
    return (expired.affected ?? 0) + (revoked.affected ?? 0);
  }
}
