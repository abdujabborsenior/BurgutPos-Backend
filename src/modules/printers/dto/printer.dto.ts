import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrinterConnection } from '../../../common/constants/enums';
import { Trim } from '../../../common/decorators/transform.decorators';
import {
  ARCHIVE_STATUSES,
  type ArchiveStatus,
} from '../../../common/dto/pagination-query.dto';

export class PrinterListQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';
}

/** IPv4 address or host name of a network printer. */
const HOST = /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,118}[a-zA-Z0-9])?$/;

export class CreatePrinterDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название принтера' })
  @MaxLength(60, { message: 'Название — не более 60 символов' })
  name: string;

  @IsOptional()
  @IsEnum(PrinterConnection, { message: 'Выберите тип подключения' })
  connection?: PrinterConnection;

  @IsOptional()
  @Trim()
  @Matches(HOST, { message: 'Укажите IP-адрес или имя принтера' })
  host?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порт — целое число' })
  @Min(1, { message: 'Порт — от 1 до 65535' })
  @Max(65535, { message: 'Порт — от 1 до 65535' })
  port?: number | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255, { message: 'Описание — не более 255 символов' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class UpdatePrinterDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название принтера' })
  @MaxLength(60, { message: 'Название — не более 60 символов' })
  name?: string;

  @IsOptional()
  @IsEnum(PrinterConnection, { message: 'Выберите тип подключения' })
  connection?: PrinterConnection;

  @IsOptional()
  @Trim()
  @Matches(HOST, { message: 'Укажите IP-адрес или имя принтера' })
  host?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порт — целое число' })
  @Min(1, { message: 'Порт — от 1 до 65535' })
  @Max(65535, { message: 'Порт — от 1 до 65535' })
  port?: number | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255, { message: 'Описание — не более 255 символов' })
  description?: string | null;

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
