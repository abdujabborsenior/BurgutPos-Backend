import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus, OrderType } from '../../../common/constants/enums';
import { ToUpper, Trim } from '../../../common/decorators/transform.decorators';
import {
  DATE_OR_DATE_TIME,
  DATE_OR_DATE_TIME_MESSAGE,
} from '../../../common/utils/date-range';

type SortOrder = 'ASC' | 'DESC';

/**
 * Report period: a day ("2026-11-11") or a minute of local time
 * ("2026-11-11T08:00"); `to` includes its last minute.
 */
export class ReportRangeQueryDto {
  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_OR_DATE_TIME, { message: DATE_OR_DATE_TIME_MESSAGE })
  to?: string;

  /**
   * One shift instead of a period ("Отчёт по сменам"): the report then covers
   * exactly that shift and the dates above are ignored.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shiftId?: number;
}

/** The list of shifts to pick from, and the period report "По сменам". */
export class ShiftsReportQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsIn(['opened', 'closed', 'overlap'])
  dateField?: 'opened' | 'closed' | 'overlap';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cashierId?: number;
}

export class PagedReportQueryDto extends ReportRangeQueryDto {
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
  limit: number = 20;
}

export const ORDER_REPORT_SORT = [
  'id',
  'number',
  'createdAt',
  'closedAt',
  'waiter',
  'closedBy',
  'shift',
  'items',
  'total',
] as const;
export type OrderReportSort = (typeof ORDER_REPORT_SORT)[number];

export class OrdersReportQueryDto extends PagedReportQueryDto {
  /** Which moment the period applies to: opening or closing of the order. */
  @IsOptional()
  @IsIn(['createdAt', 'closedAt'])
  dateField: 'createdAt' | 'closedAt' = 'createdAt';

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tableId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hallId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  waiterId?: number;

  /** Orders that hold money of this payment method. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  methodId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ORDER_REPORT_SORT)
  sortBy: OrderReportSort = 'createdAt';

  @IsOptional()
  @ToUpper()
  @IsIn(['ASC', 'DESC'])
  sortOrder: SortOrder = 'DESC';
}

export class TablesReportQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hallId?: number;
}

export const DISH_REPORT_SORT = [
  'quantity',
  'revenue',
  'profit',
  'name',
  'pending',
  'cancelled',
] as const;
export type DishReportSort = (typeof DISH_REPORT_SORT)[number];

export class DishesReportQueryDto extends PagedReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(DISH_REPORT_SORT)
  sortBy: DishReportSort = 'quantity';

  @IsOptional()
  @ToUpper()
  @IsIn(['ASC', 'DESC'])
  sortOrder: SortOrder = 'DESC';
}

export class CategoryDishesQueryDto extends ReportRangeQueryDto {
  /** One category (drill-down); all categories when omitted (print all). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

/** Lines of one row of «По блюдам» (click on the row). */
export class DishHistoryQueryDto extends PagedReportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dishId!: number;

  /** The category filter of the report, so the history adds up to the row. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

/** Orders of one row of «По сотрудникам» (click on the row). */
export class EmployeeOrdersQueryDto extends PagedReportQueryDto {
  /** The waiter's id, or `none` for the «Без официанта» row. */
  @Matches(/^(\d{1,9}|none)$/, {
    message: 'waiter: укажите id сотрудника или none',
  })
  waiter!: string;
}

export const CANCELLATION_SORT = [
  'cancelledAt',
  'orderNumber',
  'name',
  'quantity',
  'price',
  'amount',
] as const;
export type CancellationSort = (typeof CANCELLATION_SORT)[number];

export class CancellationsReportQueryDto extends PagedReportQueryDto {
  @IsOptional()
  @IsIn(['all', 'items', 'orders'])
  scope: 'all' | 'items' | 'orders' = 'all';

  /** Who cancelled. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  waiterId?: number;

  @IsOptional()
  @IsIn(CANCELLATION_SORT)
  sortBy: CancellationSort = 'cancelledAt';

  @IsOptional()
  @ToUpper()
  @IsIn(['ASC', 'DESC'])
  sortOrder: SortOrder = 'DESC';
}

export const REPORT_KINDS = [
  'summary',
  'orders',
  'tables',
  'employees',
  'cashiers',
  'shifts',
  'dishes',
  'categories',
  'cancellations',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
