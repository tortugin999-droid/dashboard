import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CURRENCY_RE } from '../../auth/dto/auth.dto';

export const AMOUNT_RE = /^\d+(\.\d{1,4})?$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTransactionDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] })
  @IsIn(['INCOME', 'EXPENSE'])
  type!: 'INCOME' | 'EXPENSE';

  @ApiProperty({ example: '1000.00' })
  @IsNumberString()
  @Matches(AMOUNT_RE, { message: 'amount debe ser un decimal positivo como "1000.00".' })
  amount!: string;

  @ApiProperty({ example: '2026-11-13' })
  @Matches(DAY_RE, { message: 'date debe ser YYYY-MM-DD.' })
  date!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class UpdateTransactionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class ListQueryBase {
  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  pageSize?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(CURRENCY_RE)
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ListTransactionsQuery extends ListQueryBase {
  @ApiProperty({ required: false, enum: ['INCOME', 'EXPENSE'] })
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';
}

export function toPagination(q: { page?: number; pageSize?: number }) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
