import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'Correo electrónico inválido.' })
  @MaxLength(200)
  email!: string;

  @ApiProperty({ example: 's3cret-Passw0rd', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail({}, { message: 'Correo electrónico inválido.' })
  email!: string;

  @ApiProperty({ example: 's3cret-Passw0rd' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export const CURRENCY_RE = /^[A-Z]{3}$/;

export class UpdateSettingsDto {
  @ApiProperty({ example: 'USD', required: false })
  @Matches(CURRENCY_RE, { message: 'Moneda inválida: usa código ISO 4217 de 3 letras.' })
  mainCurrency?: string;

  @ApiProperty({ example: 'America/Caracas', required: false })
  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_+0-9\-]+$/, { message: 'Zona horaria IANA inválida.' })
  timezone?: string;

  @ApiProperty({ example: 'Ana Pérez', required: false })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'es', required: false })
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, { message: 'Locale inválido (ej. es, es-VE).' })
  locale?: string;
}
