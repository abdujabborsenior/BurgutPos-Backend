import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardDateQueryDto {
  @IsOptional()
  @Matches(DATE_KEY, { message: 'Дата должна быть в формате ГГГГ-ММ-ДД' })
  date?: string;
}

export class RevenueQueryDto extends DashboardDateQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([3, 7, 10, 14, 20, 30, 60, 90])
  days: number = 7;
}

export class TopDishesQueryDto extends DashboardDateQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
