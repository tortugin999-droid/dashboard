import { Module } from '@nestjs/common';
import { RecurrencesController } from './recurrences.controller';
import { RecurrencesService } from './recurrences.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [RecurrencesController],
  providers: [RecurrencesService, PrismaService],
  exports: [RecurrencesService],
})
export class RecurrencesModule {}
