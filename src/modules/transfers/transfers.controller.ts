import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { CreateTransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Transferencia atómica entre cuentas propias de la misma moneda. Soporta Idempotency-Key.',
  })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransferDto, @Req() req: Request) {
    const key = req.headers['idempotency-key'];
    const { body } = await this.transfers.create(
      user.id,
      dto,
      typeof key === 'string' ? key : undefined,
    );
    return body;
  }
}
