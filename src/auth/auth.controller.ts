import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser, ClientIp, CurrentUser, Public } from '../common/decorators';
import { config } from '../config';
import { LoginDto, ResendLoginDto, VerifyLoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // #1 POST /auth/sessions - log in, receive a JWT
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: config.rateLimit.max, ttl: config.rateLimit.windowMs } })
  @Post('sessions')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @ClientIp() ip: string) {
    return this.auth.login(dto, ip);
  }

  // #2 POST /auth/sessions/verify - confirm the emailed code, receive the JWT
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: config.rateLimit.max, ttl: config.rateLimit.windowMs } })
  @Post('sessions/verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyLoginDto, @ClientIp() ip: string) {
    return this.auth.verify(dto, ip);
  }

  // #30 POST /auth/sessions/resend - send a new code for the pending login
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: config.rateLimit.max, ttl: config.rateLimit.windowMs } })
  @Post('sessions/resend')
  @HttpCode(200)
  resend(@Body() dto: ResendLoginDto, @ClientIp() ip: string) {
    return this.auth.resend(dto, ip);
  }

  // #29 DELETE /auth/sessions/current - log out (the token stops working immediately)
  @Delete('sessions/current')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @ClientIp() ip: string) {
    await this.auth.logout(user, ip);
  }
}
