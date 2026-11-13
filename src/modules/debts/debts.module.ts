import { Module } from '@nestjs/common';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { IdempotencyService } from '../../common/idempotency.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [DebtsController],
  providers: [DebtsService, IdempotencyService, PrismaService],
  exports: [DebtsService],
})
export class DebtsModule {}
