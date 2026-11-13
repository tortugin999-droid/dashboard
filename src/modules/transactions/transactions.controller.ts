import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { pageMeta } from '../../common/pagination';
import { CreateTransactionDto, ListTransactionsQuery, toPagination, UpdateTransactionDto } from './dto/transaction.dto';
import { TransactionsService, transactionDto } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de movimientos realizados.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListTransactionsQuery) {
    const p = toPagination(query);
    const { rows, total } = await this.transactions.list(user.id, query, p);
    return { data: rows, meta: pageMeta(p, total) };
  }

  @Post()
  @ApiOperation({ summary: 'Registra un ingreso o gasto realizado. La moneda se deriva de la cuenta.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransactionDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const t = await this.transactions.create(user.id, dto, u.timezone);
    return transactionDto(t);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un movimiento.' })
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const t = await this.transactions.getOwned(user.id, id);
    return transactionDto(t, { accountName: t.account.name, categoryName: t.category?.name ?? null });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Corrige un movimiento propio no generado por otro módulo.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const t = await this.transactions.update(user.id, id, dto, u.timezone);
    return transactionDto(t);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina un movimiento no vinculado. 204 sin cuerpo.' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() _req: Request) {
    await this.transactions.remove(user.id, id);
    return undefined;
  }
}
