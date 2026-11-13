import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AMOUNT_RE, DAY_RE } from '../../transactions/dto/transaction.dto';

export class CreateTransferDto {
  @ApiProperty()
  @IsString()
  fromAccountId!: string;

  @ApiProperty()
  @IsString()
  toAccountId!: string;

  @ApiProperty({ example: '250.00' })
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
  description?: string;
}
