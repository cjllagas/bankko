import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { idParam } from '../common/paging';
import { CreateTransactionDto, ListTransactionsQueryDto, ReviewTransactionDto } from './transactions.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly txs: TransactionsService) {}

  // #21 POST /transactions - transfer or bill payment (customer). Needs an Idempotency-Key header.
  @Post()
  async create(
    @CurrentUser() auth: AuthUser, @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') key: string, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.txs.create(auth, dto, key, ip);
    if (out.replayed) { res.status(200); res.setHeader('Idempotent-Replayed', 'true'); } else res.status(201);
    return out.body;
  }

  // #22 GET /transactions (admin)
  @Roles('Admin') @Get()
  list(@Query() q: ListTransactionsQueryDto) { return this.txs.list(q); }

  // #26 GET /transactions/:transactionId/receipt (declared before :transactionId)
  @Get(':transactionId/receipt')
  receipt(@CurrentUser() auth: AuthUser, @Param('transactionId') id: string) { return this.txs.receipt(auth, idParam(id, 'Transaction')); }

  // #23 GET /transactions/:transactionId
  @Get(':transactionId')
  get(@CurrentUser() auth: AuthUser, @Param('transactionId') id: string) { return this.txs.get(auth, idParam(id, 'Transaction')); }

  // #24 PATCH /transactions/:transactionId (admin flags / clears)
  @Roles('Admin') @Patch(':transactionId')
  review(@CurrentUser() auth: AuthUser, @Param('transactionId') id: string, @Body() dto: ReviewTransactionDto, @ClientIp() ip: string) {
    return this.txs.review(auth, idParam(id, 'Transaction'), dto, ip);
  }
}

@Controller('accounts/:accountId/transactions')
export class AccountTransactionsController {
  constructor(private readonly txs: TransactionsService) {}

  // #25 GET /accounts/:accountId/transactions - history, including transfers the account received
  @Get()
  list(@CurrentUser() auth: AuthUser, @Param('accountId') id: string, @Query() q: ListTransactionsQueryDto) {
    return this.txs.listForAccount(auth, idParam(id, 'Account'), q);
  }
}
