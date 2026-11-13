import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './common/auth.guard';
import { CsrfGuard } from './common/csrf.guard';
import { WrapInterceptor } from './common/wrap.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HealthController } from './modules/health/health.controller';
import { PrismaService } from './common/prisma.service';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { RecurrencesModule } from './modules/recurrences/recurrences.module';
import { ObligationsModule } from './modules/obligations/obligations.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { DebtsModule } from './modules/debts/debts.module';
import { SavingsModule } from './modules/savings/savings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({
        throttlers: [{ limit: 300, ttl: 60_000 }],
      }),
    }),
    AuthModule,
    SettingsModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    TransfersModule,
    RecurrencesModule,
    ObligationsModule,
    BudgetsModule,
    DebtsModule,
    SavingsModule,
    DashboardModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: WrapInterceptor },
  ],
})
export class AppModule {}
