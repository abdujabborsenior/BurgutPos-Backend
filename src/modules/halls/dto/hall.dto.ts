import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/transform.decorators';
import {
  ARCHIVE_STATUSES,
  type ArchiveStatus,
  PaginationQueryDto,
} from '../../../common/dto/pagination-query.dto';
import type { TableSortKey } from '../repo/tables.repository';

export class HallListQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';
}

export class CreateHallDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название зала' })
  @MaxLength(100, { message: 'Название зала — не более 100 символов' })
  name: string;

  /** Empty (null) means "as in the settings"; a number overrides it. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Процент должен быть числом' })
  @Min(0, { message: 'Процент не может быть отрицательным' })
  @Max(100, { message: 'Процент не может быть больше 100' })
  servicePercent?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class UpdateHallDto {
  /** Empty (null) means "as in the settings"; a number overrides it. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Процент должен быть числом' })
  @Min(0, { message: 'Процент не может быть отрицательным' })
  @Max(100, { message: 'Процент не может быть больше 100' })
  servicePercent?: number | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название зала' })
  @MaxLength(100, { message: 'Название зала — не более 100 символов' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TableListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hallId?: number;

  @IsOptional()
  @IsIn(['name', 'hall', 'sortOrder', 'seats', 'createdAt'])
  sortBy: TableSortKey = 'hall';
}

export class CreateTableDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите зал' })
  @Min(1, { message: 'Выберите зал' })
  hallId: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название стола' })
  @MaxLength(60, { message: 'Название стола — не более 60 символов' })
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Количество мест должно быть целым числом' })
  @Min(1, { message: 'Мест должно быть не меньше 1' })
  @Max(100, { message: 'Мест должно быть не больше 100' })
  seats?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class BulkCreateTablesDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите зал' })
  @Min(1, { message: 'Выберите зал' })
  hallId: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите префикс названия' })
  @MaxLength(50, { message: 'Префикс — не более 50 символов' })
  prefix: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Начальный номер — не меньше 1' })
  @Max(9999)
  from: number;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Конечный номер — не меньше 1' })
  @Max(9999)
  to: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  seats?: number | null;
}

export class UpdateTableDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Выберите зал' })
  @Min(1, { message: 'Выберите зал' })
  hallId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название стола' })
  @MaxLength(60, { message: 'Название стола — не более 60 символов' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Количество мест должно быть целым числом' })
  @Min(1, { message: 'Мест должно быть не меньше 1' })
  @Max(100, { message: 'Мест должно быть не больше 100' })
  seats?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
