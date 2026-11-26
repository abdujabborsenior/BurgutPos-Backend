import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';
import {
  ToBoolean,
  Trim,
} from '../../../common/decorators/transform.decorators';
import {
  ARCHIVE_STATUSES,
  type ArchiveStatus,
  PaginationQueryDto,
} from '../../../common/dto/pagination-query.dto';
import type { UserSortKey } from '../repo/users.repository';

const LOGIN_RE = /^[A-Za-z0-9._-]+$/;
const PHONE_RE = /^\+?[0-9\s()-]{7,20}$/;

export class CreateUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите имя сотрудника' })
  @MaxLength(120, { message: 'Имя — не более 120 символов' })
  fullName: string;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'Логин — минимум 3 символа' })
  @MaxLength(64, { message: 'Логин — не более 64 символов' })
  @Matches(LOGIN_RE, {
    message:
      'Логин может содержать только латинские буквы, цифры, точку, дефис и подчёркивание',
  })
  login: string;

  @IsString()
  @MinLength(6, { message: 'Пароль — минимум 6 символов' })
  @MaxLength(128, { message: 'Пароль — не более 128 символов' })
  password: string;

  @IsOptional()
  @Trim()
  @Matches(PHONE_RE, { message: 'Некорректный номер телефона' })
  phone?: string;

  @Type(() => Number)
  @IsInt({ message: 'Выберите роль' })
  @Min(1, { message: 'Выберите роль' })
  roleId: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите имя сотрудника' })
  @MaxLength(120, { message: 'Имя — не более 120 символов' })
  fullName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3, { message: 'Логин — минимум 3 символа' })
  @MaxLength(64, { message: 'Логин — не более 64 символов' })
  @Matches(LOGIN_RE, {
    message:
      'Логин может содержать только латинские буквы, цифры, точку, дефис и подчёркивание',
  })
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Пароль — минимум 6 символов' })
  @MaxLength(128, { message: 'Пароль — не более 128 символов' })
  password?: string;

  @IsOptional()
  @Trim()
  @Matches(PHONE_RE, { message: 'Некорректный номер телефона' })
  phone?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Выберите роль' })
  @Min(1, { message: 'Выберите роль' })
  roleId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId?: number;

  @IsOptional()
  @IsIn(['fullName', 'login', 'role', 'createdAt', 'lastLoginAt'])
  sortBy: UserSortKey = 'fullName';
}

export class UserOptionsQueryDto {
  @IsOptional()
  @IsIn(ALL_PERMISSIONS)
  permission?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeSelf?: boolean;
}
