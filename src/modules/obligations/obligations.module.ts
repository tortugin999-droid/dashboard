import { Module } from '@nestjs/common';
import { ObligationsController } from './obligations.controller';
import { ObligationsService } from './obligations.service';
import { IdempotencyService } from '../../common/idempotency.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [ObligationsController],
  providers: [ObligationsService, IdempotencyService, PrismaService],
  exports: [ObligationsService],
})
export class ObligationsModule {}
