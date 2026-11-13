import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { pageMeta } from '../../common/pagination';
import { CreateBudgetDto, ListBudgetsQuery, UpdateBudgetDto } from './dto/budget.dto';
import { toPagination } from '../transactions/dto/transaction.dto';
import { BudgetsService, budgetDto } from './budgets.service';

@ApiTags('budgets')
@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Presupuestos por categoría y mes.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListBudgetsQuery) {
    const p = toPagination(query);
    const { rows, total } = await this.budgets.list(user.id, query, p);
    return { data: rows, meta: pageMeta(p, total) };
  }

  @Post()
  @ApiOperation({ summary: 'Crea un presupuesto mensual para una categoría de gasto.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBudgetDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return budgetDto(await this.budgets.create(user.id, dto, u.mainCurrency));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ajusta el importe o el mes de un presupuesto.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBudgetDto) {
    return budgetDto(await this.budgets.update(user.id, id, dto));
  }
}
