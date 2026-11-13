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
  Min,
  MinLength,
} from 'class-validator';
import { AMOUNT_RE, DAY_RE, ListQueryBase } from '../../transactions/dto/transaction.dto';

export class CreateObligationDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'Alquiler noviembre' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @ApiProperty({ enum: ['PAYABLE', 'RECEIVABLE'], required: false })
  @IsOptional()
  @IsIn(['PAYABLE', 'RECEIVABLE'])
  direction?: 'PAYABLE' | 'RECEIVABLE';

  @ApiProperty({ example: '350.00' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount!: string;

  @ApiProperty({ example: '2026-11-30' })
  @Matches(DAY_RE)
  dueDate!: string;
}

export class UpdateObligationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description?: string;

  @ApiProperty({ required: false, description: 'Ajusta el importe estimado sin tocar pagos ya realizados.' })
  @IsOptional()
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false, enum: ['CANCELLED'] })
  @IsOptional()
  @IsIn(['CANCELLED'])
  status?: 'CANCELLED';
}

export class PayObligationDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ example: '50.00' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount!: string;

  @ApiProperty({ example: '2026-11-13' })
  @Matches(DAY_RE)
  date!: string;
}

export class ListObligationsQuery extends ListQueryBase {
  @ApiProperty({ required: false, enum: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'])
  status?: string;

  @ApiProperty({ required: false, enum: ['PAYABLE', 'RECEIVABLE'] })
  @IsOptional()
  @IsIn(['PAYABLE', 'RECEIVABLE'])
  direction?: string;
}
