import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser, ClientIp, CurrentUser, Public, Roles } from '../common/decorators';
import { idParam } from '../common/paging';
import { config } from '../config';
import { ListUsersQueryDto, RegisterUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // #3 POST /users - register a customer (public)
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: config.rateLimit.max, ttl: config.rateLimit.windowMs } })
  @Post()
  register(@Body() dto: RegisterUserDto, @ClientIp() ip: string) { return this.users.register(dto, ip); }

  // #4 GET /users - list customers (admin)
  @Roles('Admin')
  @Get()
  list(@Query() q: ListUsersQueryDto) { return this.users.list(q); }

  // #5 GET /users/:userId (owner or admin)
  @Get(':userId')
  get(@CurrentUser() auth: AuthUser, @Param('userId') id: string) { return this.users.get(auth, idParam(id, 'User')); }

  // #6 PATCH /users/:userId (owner or admin)
  @Patch(':userId')
  update(@CurrentUser() auth: AuthUser, @Param('userId') id: string, @Body() dto: UpdateUserDto, @ClientIp() ip: string) {
    return this.users.update(auth, idParam(id, 'User'), dto, ip);
  }
}
