import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DishUnit } from '../../../common/constants/enums';
import {
  ToBoolean,
  Trim,
} from '../../../common/decorators/transform.decorators';
import {
  ARCHIVE_STATUSES,
  type ArchiveStatus,
  PaginationQueryDto,
} from '../../../common/dto/pagination-query.dto';
import type { DishSortKey } from '../repo/dishes.repository';

export const MAX_PRICE = 1_000_000_000;

export class DishListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ARCHIVE_STATUSES)
  status: ArchiveStatus = 'active';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  printerId?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsIn([
    'name',
    'sortOrder',
    'category',
    'price',
    'isAvailable',
    'saleQty',
    'createdAt',
  ])
  sortBy: DishSortKey = 'createdAt';
}

export class RecipeLineDto {
  @Type(() => Number)
  @IsInt({ message: 'Выберите ингредиент' })
  @Min(1, { message: 'Выберите ингредиент' })
  ingredientId: number;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Количество ингредиента — число' },
  )
  @Min(0.0001, { message: 'Количество ингредиента должно быть больше нуля' })
  @Max(100000, { message: 'Слишком большое количество ингредиента' })
  quantity: number;
}

export class CreateDishDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название блюда' })
  @MaxLength(150, { message: 'Название — не более 150 символов' })
  name: string;

  @Type(() => Number)
  @IsInt({ message: 'Выберите категорию' })
  @Min(1, { message: 'Выберите категорию' })
  categoryId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Некорректный принтер' })
  @Min(1, { message: 'Некорректный принтер' })
  printerId?: number | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Цена должна быть числом' })
  @Min(0, { message: 'Цена не может быть отрицательной' })
  @Max(MAX_PRICE, { message: 'Слишком большая цена' })
  price: number;

  @IsOptional()
  @IsEnum(DishUnit, { message: 'Некорректная единица измерения' })
  unit?: DishUnit;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0, { message: 'Порядок не может быть отрицательным' })
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'В техкарте не более 100 ингредиентов' })
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  ingredients?: RecipeLineDto[];
}

export class UpdateDishDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название блюда' })
  @MaxLength(150, { message: 'Название — не более 150 символов' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Выберите категорию' })
  @Min(1, { message: 'Выберите категорию' })
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Некорректный принтер' })
  @Min(1, { message: 'Некорректный принтер' })
  printerId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Цена должна быть числом' })
  @Min(0, { message: 'Цена не может быть отрицательной' })
  @Max(MAX_PRICE, { message: 'Слишком большая цена' })
  price?: number;

  @IsOptional()
  @IsEnum(DishUnit, { message: 'Некорректная единица измерения' })
  unit?: DishUnit;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Порядок должен быть целым числом' })
  @Min(0, { message: 'Порядок не может быть отрицательным' })
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'В техкарте не более 100 ингредиентов' })
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  ingredients?: RecipeLineDto[];
}

export class SetAvailabilityDto {
  @IsBoolean()
  isAvailable: boolean;
}
