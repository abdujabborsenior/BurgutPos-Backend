import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IngredientUnit } from '../../../common/constants/enums';
import {
  ToBoolean,
  Trim,
} from '../../../common/decorators/transform.decorators';
import {
  ARCHIVE_STATUSES,
  type ArchiveStatus,
  PaginationQueryDto,
} from '../../../common/dto/pagination-query.dto';
import { MAX_PRICE } from '../../menu/dto/dish.dto';
import { MAX_STOCK_QTY } from '../../stock/dto/stock.dto';
import type { IngredientSortKey } from '../repo/ingredients.repository';

export class IngredientListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional()
  @IsIn(['name', 'quantity', 'minQuantity', 'costPrice', 'createdAt'])
  sortBy: IngredientSortKey = 'name';
}

export class CreateIngredientDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название ингредиента' })
  @MaxLength(100, { message: 'Название — не более 100 символов' })
  name: string;

  @IsEnum(IngredientUnit, { message: 'Выберите единицу измерения' })
  unit: IngredientUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Начальный остаток — число' })
  @Min(0, { message: 'Остаток не может быть отрицательным' })
  @Max(MAX_STOCK_QTY)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Минимальный остаток — число' })
  @Min(0, { message: 'Минимальный остаток не может быть отрицательным' })
  @Max(MAX_STOCK_QTY)
  minQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Цена — число' })
  @Min(0, { message: 'Цена не может быть отрицательной' })
  @Max(MAX_PRICE)
  costPrice?: number;
}

export class UpdateIngredientDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название ингредиента' })
  @MaxLength(100, { message: 'Название — не более 100 символов' })
  name?: string;

  @IsOptional()
  @IsEnum(IngredientUnit, { message: 'Выберите единицу измерения' })
  unit?: IngredientUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Минимальный остаток — число' })
  @Min(0, { message: 'Минимальный остаток не может быть отрицательным' })
  @Max(MAX_STOCK_QTY)
  minQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Цена — число' })
  @Min(0, { message: 'Цена не может быть отрицательной' })
  @Max(MAX_PRICE)
  costPrice?: number;
}
