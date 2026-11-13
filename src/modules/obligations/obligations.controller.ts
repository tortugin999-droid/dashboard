import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { pageMeta } from '../../common/pagination';
import { CreateObligationDto, ListObligationsQuery, PayObligationDto, UpdateObligationDto } from './dto/obligation.dto';
import { toPagination } from '../transactions/dto/transaction.dto';
import { ObligationsService, obligationDto } from './obligations.service';

@ApiTags('obligations')
@Controller('obligations')
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get()
  @ApiOperation({ summary: 'Obligaciones generadas o manuales con estado derivado.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListObligationsQuery) {
    const p = toPagination(query);
    const { rows, total } = await this.obligations.list(user.id, query, p);
    return { data: rows, meta: pageMeta(p, total) };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una obligación manual (pago esperado o cobro esperado).' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateObligationDto) {
    return obligationDto(await this.obligations.create(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ajusta una obligación estimada sin tocar pagos realizados.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateObligationDto) {
    const o = await this.obligations.update(user.id, id, dto);
    return obligationDto(o);
  }

  @Post(':id/payments')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Paga (total o parcialmente) una obligación. Atómico y con Idempotency-Key.',
  })
  async pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PayObligationDto,
    @Req() req: Request,
  ) {
    const key = req.headers['idempotency-key'];
    const { body } = await this.obligations.pay(user.id, id, dto, typeof key === 'string' ? key : undefined);
    return body;
  }
}
