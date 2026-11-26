import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DiscountType,
  OrderStatus,
  OrderType,
} from '../../../common/constants/enums';
import {
  ToBoolean,
  Trim,
} from '../../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  DATE_OR_DATE_TIME,
  DATE_OR_DATE_TIME_MESSAGE,
} from '../../../common/utils/date-range';
import { MAX_PRICE } from '../../menu/dto/dish.dto';
import type { OrderSortKey } from '../repo/orders.repository';

const PHONE_RE = /^\+?[0-9\s()-]{7,20}$/;
const MAX_LINE_QTY = 10_000;

export class OrderLineDto {
  @Type(() => Number)
  @IsInt({ message: 'Некорректное блюдо' })
  @Min(1, { message: 'Некорректное блюдо' })
  dishId: number;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Количество — число (до 3 знаков после запятой)' },
  )
  @Min(0.001, { message: 'Количество должно быть больше нуля' })
  @Max(MAX_LINE_QTY, { message: 'Слишком большое количество' })
  quantity: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255, { message: 'Комментарий к блюду — не более 255 символов' })
  comment?: string;
}

class OrderLinesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Добавьте хотя бы одно блюдо' })
  @ArrayMaxSize(200, { message: 'Слишком много позиций за один раз' })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];
}

export class CreateOrderDto extends OrderLinesDto {
  @IsEnum(OrderType, { message: 'Некорректный тип заказа' })
  type: OrderType;

  @ValidateIf((dto: CreateOrderDto) => dto.type === OrderType.Table)
  @Type(() => Number)
  @IsInt({ message: 'Выберите стол' })
  @Min(1, { message: 'Выберите стол' })
  tableId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Некорректный официант' })
  @Min(1, { message: 'Некорректный официант' })
  waiterId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Количество гостей — целое число' })
  @Min(1, { message: 'Гостей должно быть не меньше 1' })
  @Max(500, { message: 'Слишком много гостей' })
  guests?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120, { message: 'Имя клиента — не более 120 символов' })
  customerName?: string;

  @ValidateIf(
    (dto: CreateOrderDto) =>
      dto.type === OrderType.Delivery || dto.customerPhone !== undefined,
  )
  @Trim()
  @Matches(PHONE_RE, { message: 'Укажите корректный телефон клиента' })
  customerPhone?: string;

  @ValidateIf((dto: CreateOrderDto) => dto.type === OrderType.Delivery)
  @Trim()
  @IsString()
  @MinLength(3, { message: 'Укажите адрес доставки' })
  @MaxLength(500, { message: 'Адрес — не более 500 символов' })
  deliveryAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Стоимость доставки — число' })
  @Min(0, { message: 'Стоимость доставки не может быть отрицательной' })
  @Max(MAX_PRICE)
  deliveryFee?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class AddItemsDto extends OrderLinesDto {}

export class UpdateOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Количество гостей — целое число' })
  @Min(1, { message: 'Гостей должно быть не меньше 1' })
  @Max(500, { message: 'Слишком много гостей' })
  guests?: number | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120, { message: 'Имя клиента — не более 120 символов' })
  customerName?: string | null;

  @IsOptional()
  @Trim()
  @Matches(PHONE_RE, { message: 'Укажите корректный телефон клиента' })
  customerPhone?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Адрес — не более 500 символов' })
  deliveryAddress?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Стоимость доставки — число' })
  @Min(0, { message: 'Стоимость доставки не может быть отрицательной' })
  @Max(MAX_PRICE)
  deliveryFee?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string | null;
}

export class CancelItemDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Количество — число' })
  @Min(0.001, { message: 'Количество должно быть больше нуля' })
  @Max(MAX_LINE_QTY)
  quantity: number;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'Укажите причину отмены (минимум 3 символа)' })
  @MaxLength(500, { message: 'Причина — не более 500 символов' })
  reason: string;

  @IsOptional()
  @IsBoolean()
  returnToStock?: boolean;
}

export class CancelOrderDto {
  @Trim()
  @IsString()
  @MinLength(3, { message: 'Укажите причину отмены (минимум 3 символа)' })
  @MaxLength(500, { message: 'Причина — не более 500 символов' })
  reason: string;

  @IsOptional()
  @IsBoolean()
  returnToStock?: boolean;
}

export class ReopenOrderDto {
  @Trim()
  @IsString()
  @MinLength(3, { message: 'Укажите причину возврата (минимум 3 символа)' })
  @MaxLength(500, { message: 'Причина — не более 500 символов' })
  reason: string;
}

export class MoveOrderDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите стол' })
  @Min(1, { message: 'Выберите стол' })
  tableId: number;
}

export class ChangeWaiterDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите официанта' })
  @Min(1, { message: 'Выберите официанта' })
  waiterId: number;
}

export class DiscountDto {
  @ValidateIf((dto: DiscountDto) => dto.type !== null)
  @IsEnum(DiscountType, { message: 'Некорректный тип скидки' })
  type: DiscountType | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Размер скидки — число' })
  @Min(0, { message: 'Скидка не может быть отрицательной' })
  @Max(MAX_PRICE)
  value: number;
}

export class PaymentLineDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите способ оплаты' })
  @Min(1, { message: 'Выберите способ оплаты' })
  methodId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Сумма оплаты — число' })
  @Min(0.01, { message: 'Сумма оплаты должна быть больше нуля' })
  @Max(MAX_PRICE)
  amount: number;
}

export class PayOrderDto {
  @IsArray()
  @ArrayMaxSize(10, { message: 'Не более 10 способов оплаты' })
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments: PaymentLineDto[];
}

export class OrderListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  waiterId?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  to?: string;

  @IsOptional()
  @IsIn(['createdAt', 'closedAt', 'total', 'id'])
  sortBy: OrderSortKey = 'createdAt';
}

export class MergeOrderDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите заказ для объединения' })
  @Min(1, { message: 'Выберите заказ для объединения' })
  targetOrderId: number;
}
