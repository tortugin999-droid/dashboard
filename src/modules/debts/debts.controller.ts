import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { pageMeta } from '../../common/pagination';
import { CreateDebtDto, CreateDebtPaymentDto, ListDebtsQuery, UpdateDebtDto } from './dto/debt.dto';
import { toPagination } from '../transactions/dto/transaction.dto';
import { DebtsService, debtDto, debtPaymentDto } from './debts.service';

@ApiTags('debts')
@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  @ApiOperation({ summary: 'Deudas: dinero que debo y dinero que me deben.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListDebtsQuery) {
    const p = toPagination(query);
    const { rows, total } = await this.debts.list(user.id, query, p);
    return { data: rows, meta: pageMeta(p, total) };
  }

  @Post()
  @ApiOperation({ summary: 'Registra una deuda. Con cuenta de desembolso crea un LOAN_DISBURSEMENT (no es ingreso).' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateDebtDto) {
    return debtDto(await this.debts.create(user.id, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de deuda con su calendario de abonos.' })
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const debt = await this.debts.getOwned(user.id, id);
    return { ...debtDto(debt), payments: await this.debts.listPayments(user.id, id) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza datos o estado de una deuda.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDebtDto) {
    return debtDto(await this.debts.update(user.id, id, dto));
  }

  @Post(':id/payments')
  @HttpCode(201)
  @ApiOperation({ summary: 'Abono a deuda (capital + intereses + cargos). Atómico y con Idempotency-Key.' })
  async pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateDebtPaymentDto,
    @Req() req: Request,
  ) {
    const key = req.headers['idempotency-key'];
    const { body } = await this.debts.pay(user.id, id, dto, typeof key === 'string' ? key : undefined);
    return body;
  }
}
