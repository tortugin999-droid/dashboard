import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { BalanceService } from '../../common/balance.service';
import { PrismaService } from '../../common/prisma.service';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [BudgetsModule],
  controllers: [DashboardController],
  providers: [DashboardService, BalanceService, PrismaService],
})
export class DashboardModule {}
