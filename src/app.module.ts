import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { config } from './config';
import { buildDataSourceOptions } from './database/typeorm.config';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { BillersModule } from './billers/billers.module';
import { PayeesModule } from './payees/payees.module';
import { TransactionsModule } from './transactions/transactions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { CredentialsModule } from './credentials/credentials.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions }),
    ThrottlerModule.forRoot([{ ttl: config.rateLimit.windowMs, limit: config.rateLimit.max }]),
    CoreModule,
    AuthModule,
    UsersModule,
    CredentialsModule,
    AccountsModule,
    BillersModule,
    PayeesModule,
    TransactionsModule,
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}
