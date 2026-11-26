import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  StockItemType,
  StockLocation,
  StockMovementType,
} from '../../../common/constants/enums';
import {
  ToBoolean,
  Trim,
} from '../../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  DATE_OR_DATE_TIME,
  DATE_OR_DATE_TIME_MESSAGE,
} from '../../../common/utils/date-range';
import { MAX_PRICE } from '../../menu/dto/dish.dto';
import type { BalanceSortKey } from '../repo/stock-levels.repository';
import type { ReceiptSortKey } from '../repo/stock-receipts.repository';

export const MAX_STOCK_QTY = 10_000_000;

const QuantityField = () => (target: object, key: string) => {
  Type(() => Number)(target, key);
  IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Количество должно быть числом (до 3 знаков после запятой)' },
  )(target, key);
  Max(MAX_STOCK_QTY, { message: 'Слишком большое количество' })(target, key);
};

export class BalanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  tracked?: boolean;

  @IsOptional()
  @IsIn(['name', 'saleQty', 'warehouseQty', 'totalQty', 'category'])
  sortBy: BalanceSortKey = 'name';
}

export class SetTrackingDto {
  @IsBoolean()
  trackStock: boolean;
}

export class TransferDto {
  @IsEnum(StockLocation, { message: 'Укажите, откуда переместить' })
  from: StockLocation;

  @QuantityField()
  @Min(0.001, { message: 'Количество должно быть больше нуля' })
  quantity: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class DishWriteOffDto {
  @IsEnum(StockLocation, { message: 'Укажите, откуда списать' })
  location: StockLocation;

  @QuantityField()
  @Min(0.001, { message: 'Количество должно быть больше нуля' })
  quantity: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите причину списания' })
  @MaxLength(500, { message: 'Причина — не более 500 символов' })
  reason: string;
}

export const STOCK_ADJUST_MODES = ['set', 'add', 'remove'] as const;
export type StockAdjustMode = (typeof STOCK_ADJUST_MODES)[number];

export class DishAdjustDto {
  /**
   * How the quantities below are read: `set` is the inventory count («Заменить»,
   * the old behaviour and the default), `add` and `remove` are deltas applied to
   * whatever the dish holds at the moment of the write. Deltas matter during
   * service: between opening the window and saving it the dish keeps selling, and
   * an absolute number computed in the browser would silently undo those sales.
   */
  @IsOptional()
  @IsIn(STOCK_ADJUST_MODES, { message: 'Некорректное действие с остатком' })
  mode: StockAdjustMode = 'set';

  /** Omitted — the on-sale quantity is left alone. */
  @IsOptional()
  @QuantityField()
  @Min(0, { message: 'Остаток не может быть отрицательным' })
  saleQty?: number;

  /** Omitted — the warehouse quantity is left alone. */
  @IsOptional()
  @QuantityField()
  @Min(0, { message: 'Остаток не может быть отрицательным' })
  warehouseQty?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class IngredientWriteOffDto {
  @QuantityField()
  @Min(0.001, { message: 'Количество должно быть больше нуля' })
  quantity: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите причину списания' })
  @MaxLength(500, { message: 'Причина — не более 500 символов' })
  reason: string;
}

export class IngredientAdjustDto {
  @QuantityField()
  @Min(0, { message: 'Остаток не может быть отрицательным' })
  quantity: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class ReceiptLineDto {
  @IsEnum(StockItemType, { message: 'Укажите тип позиции' })
  itemType: StockItemType;

  @ValidateIf((line: ReceiptLineDto) => line.itemType === StockItemType.Dish)
  @Type(() => Number)
  @IsInt({ message: 'Выберите позицию' })
  @Min(1, { message: 'Выберите позицию' })
  dishId?: number;

  @ValidateIf(
    (line: ReceiptLineDto) => line.itemType === StockItemType.Ingredient,
  )
  @Type(() => Number)
  @IsInt({ message: 'Выберите ингредиент' })
  @Min(1, { message: 'Выберите ингредиент' })
  ingredientId?: number;

  @IsOptional()
  @IsEnum(StockLocation, { message: 'Некорректное место хранения' })
  location?: StockLocation;

  @QuantityField()
  @Min(0.001, { message: 'Количество должно быть больше нуля' })
  quantity: number;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Цена закупки должна быть числом' },
  )
  @Min(0, { message: 'Цена закупки не может быть отрицательной' })
  @Max(MAX_PRICE, { message: 'Слишком большая цена' })
  purchasePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Цена продажи должна быть числом' },
  )
  @Min(0, { message: 'Цена продажи не может быть отрицательной' })
  @Max(MAX_PRICE, { message: 'Слишком большая цена' })
  salePrice?: number | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class CreateReceiptsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Добавьте хотя бы одну позицию' })
  @ArrayMaxSize(50, { message: 'Не более 50 позиций за раз' })
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  items: ReceiptLineDto[];

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Комментарий — не более 500 символов' })
  comment?: string;
}

export class ArchiveReceiptDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'Причина — не более 500 символов' })
  reason?: string;
}

export class ReceiptListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  archived: boolean = false;

  @IsOptional()
  @IsEnum(StockItemType)
  itemType?: StockItemType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dishId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ingredientId?: number;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  to?: string;

  @IsOptional()
  @IsIn([
    'createdAt',
    'item',
    'quantity',
    'purchasePrice',
    'salePrice',
    'total',
  ])
  sortBy: ReceiptSortKey = 'createdAt';
}

export class MovementListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StockItemType)
  itemType?: StockItemType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dishId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ingredientId?: number;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @IsOptional()
  @IsEnum(StockLocation)
  location?: StockLocation;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  to?: string;
}
