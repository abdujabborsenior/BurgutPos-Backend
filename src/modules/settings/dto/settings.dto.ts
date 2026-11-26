import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderType } from '../../../common/constants/enums';
import {
  Trim,
  TrimMultiline,
} from '../../../common/decorators/transform.decorators';

export class UpdateSettingsDto {
  /**
   * Look of the guest bill / kitchen ticket, by line key. Whatever arrives is
   * normalised against the catalog, so only known lines and offered sizes are
   * ever stored.
   */
  @IsOptional()
  @IsObject({ message: 'Настройки чека — объект' })
  orderCheck?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'Настройки чека — объект' })
  dishCheck?: Record<string, unknown>;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название заведения' })
  @MaxLength(120, { message: 'Название — не более 120 символов' })
  restaurantName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255, { message: 'Адрес — не более 255 символов' })
  address?: string | null;

  @IsOptional()
  @Trim()
  @Matches(/^\+?[0-9\s()-]{7,20}$/, { message: 'Некорректный номер телефона' })
  phone?: string | null;

  @IsOptional()
  @TrimMultiline()
  @IsString()
  @MaxLength(500, { message: 'Шапка чека — не более 500 символов' })
  receiptHeader?: string | null;

  @IsOptional()
  @TrimMultiline()
  @IsString()
  @MaxLength(500, { message: 'Подвал чека — не более 500 символов' })
  receiptFooter?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Процент обслуживания — число' },
  )
  @Min(0, { message: 'Процент обслуживания не может быть отрицательным' })
  @Max(100, { message: 'Процент обслуживания — не более 100' })
  serviceChargePercent?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(OrderType, { each: true, message: 'Неизвестный тип заказа' })
  serviceChargeOrderTypes?: OrderType[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Процент официанта — число' })
  @Min(0, { message: 'Процент официанта не может быть отрицательным' })
  @Max(100, { message: 'Процент официанта — не более 100' })
  waiterCommissionPercent?: number;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPrintKitchenTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPrintReceipt?: boolean;
}
