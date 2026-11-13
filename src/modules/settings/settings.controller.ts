import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { UpdateSettingsDto } from '../auth/dto/auth.dto';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Configuración del usuario.' })
  async get(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      mainCurrency: u.mainCurrency,
      timezone: u.timezone,
      locale: u.locale,
      name: u.name,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Actualiza moneda principal, zona horaria, nombre o locale.' })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    const u = await this.prisma.user.update({ where: { id: user.id }, data: dto });
    return {
      mainCurrency: u.mainCurrency,
      timezone: u.timezone,
      locale: u.locale,
      name: u.name,
    };
  }
}
