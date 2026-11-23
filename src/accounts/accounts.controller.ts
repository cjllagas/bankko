import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { idParam } from '../common/paging';
import { config } from '../config';
import { ListAccountsQueryDto, LookupQueryDto, OpenAccountDto, UpdateAccountStatusDto, UserAccountsQueryDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  // #7 POST /accounts (customer)
  @Post()
  open(@CurrentUser() auth: AuthUser, @Body() dto: OpenAccountDto, @ClientIp() ip: string) { return this.accounts.open(auth, dto, ip); }

  // #31 GET /accounts/lookup?accountNumber=  (declared before :accountId so "lookup" is not read as an id)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: config.rateLimit.max, ttl: config.rateLimit.windowMs } })
  @Get('lookup')
  lookup(@CurrentUser() auth: AuthUser, @Query() q: LookupQueryDto) { return this.accounts.lookup(auth, q); }

  // #8 GET /accounts (admin)
  @Roles('Admin')
  @Get()
  list(@Query() q: ListAccountsQueryDto) { return this.accounts.list(q); }

  // #9 GET /accounts/:accountId (owner or admin)
  @Get(':accountId')
  get(@CurrentUser() auth: AuthUser, @Param('accountId') id: string) { return this.accounts.get(auth, idParam(id, 'Account')); }

  // #10 PATCH /accounts/:accountId (admin)
  @Roles('Admin')
  @Patch(':accountId')
  update(@CurrentUser() auth: AuthUser, @Param('accountId') id: string, @Body() dto: UpdateAccountStatusDto, @ClientIp() ip: string) {
    return this.accounts.updateStatus(auth, idParam(id, 'Account'), dto, ip);
  }
}

@Controller('users/:userId/accounts')
export class UserAccountsController {
  constructor(private readonly accounts: AccountsService) {}

  // #11 GET /users/:userId/accounts (owner or admin)
  @Get()
  list(@CurrentUser() auth: AuthUser, @Param('userId') id: string, @Query() q: UserAccountsQueryDto) {
    return this.accounts.listForUser(auth, idParam(id, 'User'), q);
  }
}
