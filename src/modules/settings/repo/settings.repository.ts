import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { AppSettings, SETTINGS_ROW_ID } from '../entities/app-settings.entity';

@Injectable()
export class SettingsRepository extends BaseRepository<AppSettings> {
  constructor(dataSource: DataSource) {
    super(dataSource, AppSettings);
  }

  find(): Promise<AppSettings | null> {
    return this.repo.findOne({ where: { id: SETTINGS_ROW_ID } });
  }

  /** Inserts the settings row if it does not exist yet (idempotent). */
  async ensureRow(): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(AppSettings)
      .values({ id: SETTINGS_ROW_ID })
      .orIgnore()
      .execute();
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    await this.repo.update({ id: SETTINGS_ROW_ID }, patch);
  }
}
