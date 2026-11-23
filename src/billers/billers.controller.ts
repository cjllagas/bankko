import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { idParam } from '../common/paging';
import { CreateBillerDto, ListBillersQueryDto, ReplaceBillerDto } from './billers.dto';
import { BillersService } from './billers.service';

@Controller('billers')
export class BillersController {
  constructor(private readonly billers: BillersService) {}

  @Get() list(@Query() q: ListBillersQueryDto) { return this.billers.list(q); }                              // #12
  @Get(':billerId') get(@Param('billerId') id: string) { return this.billers.get(idParam(id, 'Biller')); }  // #13

  @Roles('Admin') @Post()                                                                                     // #14
  create(@CurrentUser() auth: AuthUser, @Body() dto: CreateBillerDto, @ClientIp() ip: string) { return this.billers.create(auth, dto, ip); }

  @Roles('Admin') @Put(':billerId')                                                                           // #15
  replace(@CurrentUser() auth: AuthUser, @Param('billerId') id: string, @Body() dto: ReplaceBillerDto, @ClientIp() ip: string) {
    return this.billers.replace(auth, idParam(id, 'Biller'), dto, ip);
  }

  @Roles('Admin') @Delete(':billerId') @HttpCode(204)                                                         // #33
  remove(@CurrentUser() auth: AuthUser, @Param('billerId') id: string, @ClientIp() ip: string) {
    return this.billers.remove(auth, idParam(id, 'Biller'), ip);
  }
}
