import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { IdempotencyService } from '../../common/idempotency.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [TransfersController],
  providers: [TransfersService, IdempotencyService, PrismaService],
  exports: [TransfersService],
})
export class TransfersModule {}
