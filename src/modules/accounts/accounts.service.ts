import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Account } from '@prisma/client';
import { BalanceService } from '../../common/balance.service';
import { dayKey, D, money, todayInTz } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { AccountDto, CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  toDto(a: Account, currentBalance: string): AccountDto {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      initialBalance: money(a.initialBalance),
      initialBalanceDate: dayKey(a.initialBalanceDate),
      archived: a.archived,
      currentBalance,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  async mapToDtos(userId: string, accounts: Account[]): Promise<AccountDto[]> {
    const balances = await this.balance.getBalances(userId, accounts);
    return accounts.map((a) => this.toDto(a, money(balances.get(a.id) ?? D(0))));
  }

  async list(userId: string, query: { archived?: boolean; currency?: string }) {
    return this.prisma.account.findMany({
      where: {
        userId,
        ...(query.archived === undefined ? {} : { archived: query.archived }),
        ...(query.currency ? { currency: query.currency } : {}),
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateAccountDto, timezone: string) {
    const initialBalanceDate = dto.initialBalanceDate ?? todayInTz(timezone);
    return this.prisma.account.create({
      data: {
        userId,
        name: dto.name.trim(),
        type: dto.type,
        currency: dto.currency,
        initialBalance: dto.initialBalance ?? '0',
        initialBalanceDate: new Date(`${initialBalanceDate}T00:00:00.000Z`),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    if (dto.archived === false && account.archived) {
      // reactivar es válido
    }
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async getOwned(userId: string, id: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    return account;
  }

  async assertCurrencyMatches(account: Account, currency: string, what: string): Promise<void> {
    if (account.currency !== currency) {
      throw new BadRequestException(
        `La moneda de ${what} (${account.currency}) no coincide con la moneda esperada (${currency}).`,
      );
    }
  }
}
