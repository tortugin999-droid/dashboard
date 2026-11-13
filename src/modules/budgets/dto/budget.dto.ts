import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AMOUNT_RE, ListQueryBase } from '../../transactions/dto/transaction.dto';

export const MONTH_RE = /^\d{4}-\d{2}$/;

export class CreateBudgetDto {
  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ example: '2026-11', description: 'Mes del presupuesto (YYYY-MM).' })
  @Matches(MONTH_RE, { message: 'month debe ser YYYY-MM.' })
  month!: string;

  @ApiProperty({ example: '500.00' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount!: string;

  @ApiProperty({ example: 'USD', required: false, description: 'Por defecto, la moneda principal del usuario.' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class UpdateBudgetDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(MONTH_RE)
  month?: string;
}

export class ListBudgetsQuery extends ListQueryBase {
  @ApiProperty({ required: false, example: '2026-11' })
  @IsOptional()
  @Matches(MONTH_RE)
  month?: string;
}
