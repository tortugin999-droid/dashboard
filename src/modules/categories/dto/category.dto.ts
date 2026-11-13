import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Alimentación' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] })
  @IsIn(['INCOME', 'EXPENSE'])
  kind!: 'INCOME' | 'EXPENSE';
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ListCategoriesQuery {
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  kind?: 'INCOME' | 'EXPENSE';

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
