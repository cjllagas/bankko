import { Module } from '@nestjs/common';
import { AccountTransactionsController, TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({ controllers: [TransactionsController, AccountTransactionsController], providers: [TransactionsService] })
export class TransactionsModule {}
