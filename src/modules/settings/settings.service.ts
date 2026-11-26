import { Injectable } from '@nestjs/common';
import {
  defaultReceiptLayout,
  normalizeReceiptLayout,
  RECEIPT_LINES,
  type ReceiptKind,
} from '../../common/constants/receipt';
import type { AuthUser } from '../../common/types/auth-user';
import { ImageStorageService } from '../media/image-storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { UpdateSettingsDto } from './dto/settings.dto';
import type { AppSettings } from './entities/app-settings.entity';
import { SettingsRepository } from './repo/settings.repository';

export type SettingsView = Omit<AppSettings, 'id' | 'updatedById'>;

@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly images: ImageStorageService,
    private readonly realtime: RealtimeService,
  ) {}

  /** The lines each printed document can show, for the editor. */
  receiptLines() {
    return RECEIPT_LINES;
  }

  async get(): Promise<AppSettings> {
    let row = await this.settings.find();
    if (!row) {
      await this.settings.ensureRow();
      row = await this.settings.find();
    }
    if (!row) throw new Error('Settings row is missing');
    return row;
  }

  async view(): Promise<SettingsView> {
    const settings = await this.get();
    return {
      restaurantName: settings.restaurantName,
      address: settings.address,
      phone: settings.phone,
      logoUrl: settings.logoUrl,
      // Always answered against the catalog, whatever is in the column.
      orderCheck: normalizeReceiptLayout('orderCheck', settings.orderCheck),
      dishCheck: normalizeReceiptLayout('dishCheck', settings.dishCheck),
      receiptHeader: settings.receiptHeader,
      receiptFooter: settings.receiptFooter,
      serviceChargePercent: settings.serviceChargePercent,
      serviceChargeOrderTypes: settings.serviceChargeOrderTypes,
      waiterCommissionPercent: settings.waiterCommissionPercent,
      allowNegativeStock: settings.allowNegativeStock,
      autoPrintKitchenTicket: settings.autoPrintKitchenTicket,
      autoPrintReceipt: settings.autoPrintReceipt,
      updatedAt: settings.updatedAt,
    };
  }

  async update(dto: UpdateSettingsDto, actor: AuthUser): Promise<SettingsView> {
    await this.get();
    const patch: Partial<AppSettings> = { updatedById: actor.id };
    for (const [key, value] of Object.entries(dto) as [
      keyof UpdateSettingsDto,
      unknown,
    ][]) {
      if (value === undefined) continue;
      if (key === 'orderCheck' || key === 'dishCheck') {
        patch[key] = normalizeReceiptLayout(key, value);
        continue;
      }
      (patch as Record<string, unknown>)[key] = value === '' ? null : value;
    }
    await this.settings.update(patch);
    this.realtime.invalidate(['settings']);
    return this.view();
  }

  /** Replaces the logo; the previous file is removed only after the new one sticks. */
  async setLogo(
    file: Express.Multer.File | undefined,
    actor: AuthUser,
  ): Promise<SettingsView> {
    const current = await this.get();
    const url = await this.images.saveImage(file, 'logo');
    try {
      await this.settings.update({ logoUrl: url, updatedById: actor.id });
    } catch (error) {
      await this.images.remove(url);
      throw error;
    }
    await this.images.remove(current.logoUrl);
    this.realtime.invalidate(['settings']);
    return this.view();
  }

  async removeLogo(actor: AuthUser): Promise<SettingsView> {
    const current = await this.get();
    await this.settings.update({ logoUrl: null, updatedById: actor.id });
    await this.images.remove(current.logoUrl);
    this.realtime.invalidate(['settings']);
    return this.view();
  }

  /** Factory look of one document, for the "reset" button of the editor. */
  defaults(kind: ReceiptKind) {
    return defaultReceiptLayout(kind);
  }

  ensureRow(): Promise<void> {
    return this.settings.ensureRow();
  }
}
