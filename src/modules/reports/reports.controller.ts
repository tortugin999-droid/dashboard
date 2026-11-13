import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { ReportsService, ReportQuery } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('cash-flow')
  @ApiOperation({ summary: 'Flujo de caja diario: resultado operativo vs flujo total de caja.' })
  async cashFlow(@CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.reports.cashFlow(user.id, q);
  }

  @Get('expenses-by-category')
  @ApiOperation({ summary: 'Gastos agrupados por categoría (por moneda, sin conversiones).' })
  async expensesByCategory(@CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.reports.expensesByCategory(user.id, q);
  }

  @Get('budget-performance')
  @ApiOperation({ summary: 'Cumplimiento de presupuestos por mes y moneda.' })
  async budgetPerformance(@CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.reports.budgetPerformance(user.id, q);
  }
}
