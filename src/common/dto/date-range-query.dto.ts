import { IsOptional, Matches } from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeQueryDto {
  @IsOptional()
  @Matches(DATE_KEY, {
    message: 'Дата «from» должна быть в формате ГГГГ-ММ-ДД',
  })
  from?: string;

  @IsOptional()
  @Matches(DATE_KEY, { message: 'Дата «to» должна быть в формате ГГГГ-ММ-ДД' })
  to?: string;
}
