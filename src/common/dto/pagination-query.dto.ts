import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToUpper, Trim } from '../decorators/transform.decorators';

export type SortOrder = 'ASC' | 'DESC';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 10;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @ToUpper()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: SortOrder;
}

export const ARCHIVE_STATUSES = ['active', 'archived', 'all'] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];
