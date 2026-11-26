import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
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
import type { CategorySortKey } from '../repo/categories.repository';

export class CategoryListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';

  @IsOptional()
  @IsIn(['name', 'sortOrder', 'createdAt', 'dishesCount'])
  sortBy: CategorySortKey = 'createdAt';
}

export class CreateCategoryDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название категории' })
  @MaxLength(100, { message: 'Название — не более 100 символов' })
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0, { message: 'Порядок не может быть отрицательным' })
  @Max(100000)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название категории' })
  @MaxLength(100, { message: 'Название — не более 100 символов' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0, { message: 'Порядок не может быть отрицательным' })
  @Max(100000)
  sortOrder?: number;
}
