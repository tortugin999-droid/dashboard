import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { pageMeta } from '../../common/pagination';
import { CreateAllocationDto, CreateSavingsGoalDto, ListSavingsQuery, UpdateSavingsGoalDto } from './dto/savings.dto';
import { toPagination } from '../transactions/dto/transaction.dto';
import { SavingsService, goalDto } from './savings.service';

@ApiTags('savings-goals')
@Controller('savings-goals')
export class SavingsController {
  constructor(private readonly savings: SavingsService) {}

  @Get()
  @ApiOperation({ summary: 'Metas de ahorro con progreso.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListSavingsQuery) {
    const p = toPagination(query);
    const { rows, total } = await this.savings.list(user.id, query, p);
    return { data: rows, meta: pageMeta(p, total) };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una meta de ahorro.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSavingsGoalDto) {
    return goalDto(await this.savings.create(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza una meta de ahorro.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSavingsGoalDto) {
    return goalDto(await this.savings.update(user.id, id, dto));
  }

  @Post(':id/allocations')
  @HttpCode(201)
  @ApiOperation({ summary: 'Reserva dinero para la meta (asignación virtual, no mueve cuentas).' })
  async allocate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateAllocationDto) {
    return this.savings.allocate(user.id, id, dto);
  }

  @Get(':id/allocations')
  @ApiOperation({ summary: 'Asignaciones de una meta.' })
  async allocations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.savings.listAllocations(user.id, id), meta: { page: 1, pageSize: 100, total: 0 } };
  }
}
