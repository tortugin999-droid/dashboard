import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AMOUNT_RE, DAY_RE, ListQueryBase } from '../../transactions/dto/transaction.dto';

export class CreateSavingsGoalDto {
  @ApiProperty({ example: 'Fondo de emergencia' })
  @IsString()
  @Matches(/^.{1,100}$/s)
  name!: string;

  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ example: '5000.00' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  targetAmount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  deadline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateSavingsGoalDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^.{1,100}$/s)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  @Matches(AMOUNT_RE)
  targetAmount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  deadline?: string;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'ACHIEVED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'ACHIEVED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ACHIEVED' | 'ARCHIVED';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateAllocationDto {
  @ApiProperty({ example: '250.00', description: 'Reserva asignada a la meta. Es virtual: no mueve cuentas.' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  amount!: string;

  @ApiProperty({ example: '2026-11-13' })
  @Matches(DAY_RE)
  date!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ListSavingsQuery extends ListQueryBase {
  @ApiProperty({ required: false, enum: ['ACTIVE', 'ACHIEVED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'ACHIEVED', 'ARCHIVED'])
  status?: string;
}
