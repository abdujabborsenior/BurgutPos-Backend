import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethodType } from '../../../common/constants/enums';
import { Trim } from '../../../common/decorators/transform.decorators';
import {
  ARCHIVE_STATUSES,
  type ArchiveStatus,
} from '../../../common/dto/pagination-query.dto';

export class PaymentMethodListQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';
}

export class CreatePaymentMethodDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название способа оплаты' })
  @MaxLength(60, { message: 'Название — не более 60 символов' })
  name: string;

  @IsEnum(PaymentMethodType, { message: 'Выберите тип способа оплаты' })
  type: PaymentMethodType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название способа оплаты' })
  @MaxLength(60, { message: 'Название — не более 60 символов' })
  name?: string;

  @IsOptional()
  @IsEnum(PaymentMethodType, { message: 'Выберите тип способа оплаты' })
  type?: PaymentMethodType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
