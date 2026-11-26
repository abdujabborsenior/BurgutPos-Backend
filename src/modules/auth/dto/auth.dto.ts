import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LoginEventType } from '../../../common/constants/enums';
import { Trim } from '../../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  DATE_OR_DATE_TIME,
  DATE_OR_DATE_TIME_MESSAGE,
} from '../../../common/utils/date-range';
import type { LoginEventSort } from '../repo/login-events.repository';

export class LoginDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Введите логин' })
  @MaxLength(64)
  login: string;

  @IsString()
  @IsNotEmpty({ message: 'Введите пароль' })
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Введите текущий пароль' })
  currentPassword: string;

  @IsString()
  @MinLength(6, { message: 'Новый пароль — минимум 6 символов' })
  @MaxLength(128, { message: 'Пароль — не более 128 символов' })
  newPassword: string;
}

export class LoginEventListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LoginEventType)
  type?: LoginEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  to?: string;

  @IsOptional()
  @IsIn(['createdAt', 'user'])
  sortBy: LoginEventSort = 'createdAt';
}
