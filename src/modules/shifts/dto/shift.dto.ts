import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CashOperationType,
  ShiftStatus,
} from '../../../common/constants/enums';
import { Trim } from '../../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  DATE_OR_DATE_TIME,
  DATE_OR_DATE_TIME_MESSAGE,
} from '../../../common/utils/date-range';
import { MAX_PRICE } from '../../menu/dto/dish.dto';

export class OpenShiftDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Сумма должна быть числом' })
  @Min(0, { message: 'Сумма не может быть отрицательной' })
  @Max(MAX_PRICE, { message: 'Слишком большая сумма' })
  openingCash: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Сумма должна быть числом' })
  @Min(0, { message: 'Сумма не может быть отрицательной' })
  @Max(MAX_PRICE, { message: 'Слишком большая сумма' })
  closingCash: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class CashOperationDto {
  @IsEnum(CashOperationType, { message: 'Выберите тип операции' })
  type: CashOperationType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Сумма должна быть числом' })
  @Min(0.01, { message: 'Сумма должна быть больше нуля' })
  @Max(MAX_PRICE, { message: 'Слишком большая сумма' })
  amount: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите комментарий к операции' })
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment: string;
}

export class ShiftListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  to?: string;
}
