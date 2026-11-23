import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, ClientIp, CurrentUser } from '../common/decorators';
import { idParam } from '../common/paging';
import { CreatePayeeDto, ListPayeesQueryDto, UpdatePayeeDto } from './payees.dto';
import { PayeesService } from './payees.service';

@Controller('payees')
export class PayeesController {
  constructor(private readonly payees: PayeesService) {}

  @Post()                                                                                    // #16
  create(@CurrentUser() auth: AuthUser, @Body() dto: CreatePayeeDto, @ClientIp() ip: string) { return this.payees.create(auth, dto, ip); }

  @Get(':payeeId')                                                                           // #17
  get(@CurrentUser() auth: AuthUser, @Param('payeeId') id: string) { return this.payees.get(auth, idParam(id, 'Payee')); }

  @Patch(':payeeId')                                                                         // #18
  rename(@CurrentUser() auth: AuthUser, @Param('payeeId') id: string, @Body() dto: UpdatePayeeDto) { return this.payees.rename(auth, idParam(id, 'Payee'), dto); }

  @Delete(':payeeId') @HttpCode(204)                                                         // #19
  remove(@CurrentUser() auth: AuthUser, @Param('payeeId') id: string, @ClientIp() ip: string) { return this.payees.remove(auth, idParam(id, 'Payee'), ip); }
}

@Controller('accounts/:accountId/payees')
export class AccountPayeesController {
  constructor(private readonly payees: PayeesService) {}

  @Get()                                                                                     // #20
  list(@CurrentUser() auth: AuthUser, @Param('accountId') id: string, @Query() q: ListPayeesQueryDto) {
    return this.payees.listForAccount(auth, idParam(id, 'Account'), q);
  }
}
