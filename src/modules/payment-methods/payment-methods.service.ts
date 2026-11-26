import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethodType } from '../../common/constants/enums';
import { TransactionService } from '../../database/transaction/transaction.service';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  CreatePaymentMethodDto,
  PaymentMethodListQueryDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';
import type { PaymentMethod } from './entities/payment-method.entity';
import { PaymentMethodsRepository } from './repo/payment-methods.repository';

const DEFAULT_METHODS: { name: string; type: PaymentMethodType }[] = [
  { name: 'Наличные', type: PaymentMethodType.Cash },
  { name: 'Uzcard', type: PaymentMethodType.Card },
  { name: 'Humo', type: PaymentMethodType.Card },
  { name: 'Click', type: PaymentMethodType.Online },
  { name: 'Payme', type: PaymentMethodType.Online },
];

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly methods: PaymentMethodsRepository,
    private readonly tx: TransactionService,
    private readonly realtime: RealtimeService,
  ) {}

  list(query: PaymentMethodListQueryDto) {
    return this.methods.list(query.status);
  }

  async options() {
    const items = await this.methods.list('active');
    return items.map(({ id, name, type }) => ({ id, name, type }));
  }

  async getById(id: number): Promise<PaymentMethod> {
    const method = await this.methods.findById(id);
    if (!method) throw new NotFoundException('Способ оплаты не найден');
    return method;
  }

  /** Resolves methods for a payment; every id must be an active method. */
  async getActiveByIds(ids: number[]): Promise<Map<number, PaymentMethod>> {
    const unique = [...new Set(ids)];
    const found = await this.methods.findByIds(unique);
    const map = new Map(found.map((method) => [method.id, method]));
    for (const id of unique) {
      const method = map.get(id);
      if (!method) throw new BadRequestException('Способ оплаты не найден');
      if (!method.isActive) {
        throw new BadRequestException(
          `Способ оплаты «${method.name}» в архиве`,
        );
      }
    }
    return map;
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    if (await this.methods.nameExists(dto.name)) {
      throw new ConflictException(
        'Способ оплаты с таким названием уже существует',
      );
    }
    const method = await this.methods.create({
      name: dto.name,
      type: dto.type,
      sortOrder: dto.sortOrder ?? (await this.methods.nextSortOrder()),
    });
    this.realtime.invalidate(['payment-methods']);
    return method;
  }

  async update(
    id: number,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    await this.tx.run(async () => {
      const method = await this.getById(id);
      if (dto.name && (await this.methods.nameExists(dto.name, id))) {
        throw new ConflictException(
          'Способ оплаты с таким названием уже существует',
        );
      }
      if (dto.type !== undefined && dto.type !== method.type) {
        if ((await this.methods.countPayments(id)) > 0) {
          throw new ConflictException(
            'Тип нельзя изменить: способом уже принимались оплаты. Создайте новый способ оплаты',
          );
        }
      }
      if (
        dto.isActive === false &&
        method.isActive &&
        (await this.methods.countActive()) <= 1
      ) {
        throw new ConflictException(
          'Должен остаться хотя бы один активный способ оплаты',
        );
      }
      await this.methods.update(id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      });
    });
    this.realtime.invalidate(['payment-methods']);
    return this.getById(id);
  }

  async delete(id: number): Promise<void> {
    await this.tx.run(async () => {
      const method = await this.getById(id);
      if ((await this.methods.countPayments(id)) > 0) {
        throw new ConflictException(
          'Способом оплаты уже принимались оплаты — его можно только архивировать',
        );
      }
      if (method.isActive && (await this.methods.countActive()) <= 1) {
        throw new ConflictException(
          'Должен остаться хотя бы один активный способ оплаты',
        );
      }
      await this.methods.delete(id);
    });
    this.realtime.invalidate(['payment-methods']);
  }

  async ensureDefaults(): Promise<void> {
    if ((await this.methods.count()) > 0) return;
    let sortOrder = 1;
    for (const method of DEFAULT_METHODS) {
      await this.methods.create({ ...method, sortOrder: sortOrder++ });
    }
  }
}
