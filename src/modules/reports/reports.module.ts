import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BalanceService } from '../../common/balance.service';
import { PrismaService } from '../../common/prisma.service';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [BudgetsModule],
  controllers: [ReportsController],
  providers: [ReportsService, BalanceService, PrismaService],
})
export class ReportsModule {}
