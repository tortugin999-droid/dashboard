import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, ListAccountsQuery, UpdateAccountDto } from './dto/account.dto';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista de cuentas con saldo actual.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListAccountsQuery) {
    const rows = await this.accounts.list(user.id, query);
    return { data: await this.accounts.mapToDtos(user.id, rows), meta: { page: 1, pageSize: rows.length, total: rows.length } };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una cuenta.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const account = await this.accounts.create(user.id, dto, u.timezone);
    return this.accounts.toDto(account, (await this.accounts.mapToDtos(user.id, [account]))[0].currentBalance);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombra o archiva una cuenta. No se eliminan cuentas con historial.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    const account = await this.accounts.update(user.id, id, dto);
    return this.accounts.toDto(account, (await this.accounts.mapToDtos(user.id, [account]))[0].currentBalance);
  }
}
