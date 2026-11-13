import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { DAY_RE } from '../transactions/dto/transaction.dto';
import { DashboardService, DashboardQuery } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Métricas del período: resultados, saldos, compromisos, reservas, series y recomendaciones.',
  })
  async get(@CurrentUser() user: AuthUser, @Query() q: DashboardQuery & Record<string, string>) {
    for (const [field, re] of [
      ['from', DAY_RE],
      ['to', DAY_RE],
      ['commitmentsThrough', DAY_RE],
    ] as const) {
      if (q[field] && !re.test(q[field])) {
        throw new Error(`${field} debe tener formato YYYY-MM-DD`);
      }
    }
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.dashboard.build(user.id, u.timezone, u.mainCurrency, q);
  }
}
