import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumberString, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AMOUNT_RE, DAY_RE, ListQueryBase } from '../../transactions/dto/transaction.dto';

export class CreateDebtDto {
  @ApiProperty({ enum: ['I_OWE', 'OWED_TO_ME'], description: 'I_OWE: dinero que debo. OWED_TO_ME: dinero que me deben.' })
  @IsIn(['I_OWE', 'OWED_TO_ME'])
  direction!: 'I_OWE' | 'OWED_TO_ME';

  @ApiProperty({ example: 'Banco X / Juan' })
  @IsString()
  @Matches(/^.{1,100}$/s)
  counterparty!: string;

  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ example: '5000.00', description: 'Capital original.' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  originalPrincipal!: string;

  @ApiProperty({ required: false, example: '0.12', description: 'Tasa anual informativa (0..1). No se calcula amortización automática.' })
  @IsOptional()
  @IsNumberString()
  interestRate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  dueDate?: string;

  @ApiProperty({ required: false, description: 'Cantidad de cuotas pactadas (calendario manual).' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'installments debe ser un entero.' })
  @IsInt()
  @Min(0)
  @Max(1200)
  installments?: number;

  @ApiProperty({
    required: false,
    description:
      'Solo I_OWE: cuenta donde se acredita el desembolso. Crea un movimiento LOAN_DISBURSEMENT (afecta caja, no es ingreso ganado).',
  })
  @IsOptional()
  @IsString()
  disbursementAccountId?: string;
}

export class UpdateDebtDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DAY_RE)
  dueDate?: string;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'SETTLED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'SETTLED', 'CANCELLED'])
  status?: 'ACTIVE' | 'SETTLED' | 'CANCELLED';
}

export class CreateDebtPaymentDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ example: '200.00', description: 'Abono a capital.' })
  @IsNumberString()
  @Matches(AMOUNT_RE)
  principalAmount!: string;

  @ApiProperty({ required: false, example: '15.00' })
  @IsOptional()
  @IsNumberString()
  @Matches(AMOUNT_RE)
  interestAmount?: string;

  @ApiProperty({ required: false, example: '2.50' })
  @IsOptional()
  @IsNumberString()
  @Matches(AMOUNT_RE)
  feeAmount?: string;

  @ApiProperty({ example: '2026-11-13' })
  @Matches(DAY_RE)
  date!: string;
}

export class ListDebtsQuery extends ListQueryBase {
  @ApiProperty({ required: false, enum: ['ACTIVE', 'SETTLED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'SETTLED', 'CANCELLED'])
  status?: string;

  @ApiProperty({ required: false, enum: ['I_OWE', 'OWED_TO_ME'] })
  @IsOptional()
  @IsIn(['I_OWE', 'OWED_TO_ME'])
  direction?: string;
}
