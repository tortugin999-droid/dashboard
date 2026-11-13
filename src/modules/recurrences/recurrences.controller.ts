import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { pageMeta } from '../../common/pagination';
import { CreateRecurrenceDto, GenerateRecurrencesDto, ListRecurrencesQuery, UpdateRecurrenceDto } from './dto/recurrence.dto';
import { toPagination } from '../transactions/dto/transaction.dto';
import { RecurrencesService, recurrenceDto } from './recurrences.service';

@ApiTags('recurrences')
@Controller('recurrences')
export class RecurrencesController {
  constructor(private readonly recurrences: RecurrencesService) {}

  @Get()
  @ApiOperation({ summary: 'Programaciones recurrentes del usuario.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListRecurrencesQuery) {
    const p = toPagination(query);
    const { rows, total } = await this.recurrences.list(user.id, query, p);
    return { data: rows, meta: pageMeta(p, total) };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una programación recurrente (ingreso o gasto esperado).' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecurrenceDto) {
    return recurrenceDto(await this.recurrences.create(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ajusta una programación. Afecta solo a ocurrencias futuras.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRecurrenceDto) {
    const r = await this.recurrences.update(user.id, id, dto);
    return recurrenceDto({ ...r, account: undefined, category: undefined });
  }

  @Post(':id/generate')
  @ApiOperation({ summary: 'Genera obligaciones idempotentemente hasta la fecha indicada.' })
  async generate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GenerateRecurrencesDto) {
    return this.recurrences.generate(user.id, id, dto.through);
  }

  @Post('generate-all')
  @ApiOperation({ summary: 'Genera obligaciones de todas las programaciones activas.' })
  async generateAll(@CurrentUser() user: AuthUser, @Body() dto: GenerateRecurrencesDto) {
    return { results: await this.recurrences.generateAll(user.id, dto.through) };
  }
}
