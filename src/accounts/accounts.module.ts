import { Module } from '@nestjs/common';
import { AccountsController, UserAccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({ controllers: [AccountsController, UserAccountsController], providers: [AccountsService] })
export class AccountsModule {}
