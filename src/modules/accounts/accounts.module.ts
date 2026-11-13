import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { BalanceService } from '../../common/balance.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, BalanceService, PrismaService],
  exports: [AccountsService],
})
export class AccountsModule {}
