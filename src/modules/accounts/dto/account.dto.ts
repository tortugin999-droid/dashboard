import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CURRENCY_RE } from '../../auth/dto/auth.dto';

export class CreateAccountDto {
  @ApiProperty({ example: 'Banco principal' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: ['CASH', 'BANK', 'WALLET'] })
  @IsIn(['CASH', 'BANK', 'WALLET'])
  type!: 'CASH' | 'BANK' | 'WALLET';

  @ApiProperty({ example: 'USD' })
  @Matches(CURRENCY_RE)
  currency!: string;

  @ApiProperty({ example: '1000.00', required: false })
  @IsOptional()
  @IsNumberString()
  initialBalance?: string;

  @ApiProperty({ example: '2026-11-01', required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  initialBalanceDate?: string;
}

export class UpdateAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false, description: 'Archivar en lugar de eliminar.' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ListAccountsQuery {
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @Matches(CURRENCY_RE)
  currency?: string;
}

export interface AccountDto {
  id: string;
  name: string;
  type: string;
  currency: string;
  initialBalance: string;
  initialBalanceDate: string;
  archived: boolean;
  currentBalance: string;
  createdAt: string;
  updatedAt: string;
}
