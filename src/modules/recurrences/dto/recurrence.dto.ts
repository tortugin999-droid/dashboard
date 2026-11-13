import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { AMOUNT_RE, DAY_RE, ListQueryBase } from '../../transactions/dto/transaction.dto';

export class CreateRecurrenceDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'Alquiler' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @ApiProperty({ enum: ['PAYABLE', 'RECEIVABLE'] })
  @IsIn(['PAYABLE', 'RECEIVABLE'])
  direction!: 'PAYABLE' | 'RECEIVABLE';

  @ApiProperty({ enum: ['ONCE', 'WEEKLY', 'EVERY_TWO_WEEKS', 'TWICE_MONTHLY', 'MONTHLY'] })
  @IsIn(['ONCE', 'WEEKLY', 'EVERY_TWO_WEEKS', 'TWICE_MONTHLY', 'MONTHLY'])
  frequency!: 'ONCE' | 'WEEKLY' | 'EVERY_TWO_WEEKS' | 'TWICE_MONTHLY' | 'MONTHLY';

  @ApiProperty({ example: '350.00' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount!: string;

  @ApiProperty({ example: '2026-11-01' })
  @Matches(DAY_RE)
  startDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  endDate?: string;

  @ApiProperty({ required: false, description: 'Solo TWICE_MONTHLY: primer día del mes (1..31).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyDay1?: number;

  @ApiProperty({
    required: false,
    description: 'Solo TWICE_MONTHLY: segundo día (1..31). Si se omite, la segunda ocurrencia es el último día del mes.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyDay2?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRecurrenceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description?: string;

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
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyDay1?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyDay2?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class GenerateRecurrencesDto {
  @ApiProperty({ example: '2026-12-31', description: 'Genera ocurrencias con vencimiento hasta esta fecha (inclusive).' })
  @Matches(DAY_RE)
  through!: string;
}

export class ListRecurrencesQuery extends ListQueryBase {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  active?: boolean;
}
