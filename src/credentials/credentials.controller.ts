import { Body, Controller, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser, ClientIp, CurrentUser, Public, Roles } from '../common/decorators';
import { idParam } from '../common/paging';
import { config } from '../config';
import { AdminPasswordResetDto, ChangePasswordDto, ConfirmPasswordResetDto, RequestEmailChangeDto, VerifyEmailChangeDto } from './credentials.dto';
import { CredentialsService } from './credentials.service';

const limit = () => Throttle({ default: { limit: config.rateLimit.max, ttl: config.rateLimit.windowMs } });

// Email and password changes. Paths live under /users and /auth, so this controller has no prefix of its own.
@Controller()
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  // #34 POST /users/:userId/email-change - customer: ask to change the email (code goes to the NEW address)
  @UseGuards(ThrottlerGuard) @limit()
  @Post('users/:userId/email-change') @HttpCode(200)
  requestEmailChange(@CurrentUser() auth: AuthUser, @Param('userId') id: string, @Body() dto: RequestEmailChangeDto, @ClientIp() ip: string) {
    return this.credentials.requestEmailChange(auth, idParam(id, 'User'), dto, ip);
  }

  // #35 POST /users/:userId/email-change/verify - customer: confirm the code, the email changes
  @UseGuards(ThrottlerGuard) @limit()
  @Post('users/:userId/email-change/verify') @HttpCode(200)
  verifyEmailChange(@CurrentUser() auth: AuthUser, @Param('userId') id: string, @Body() dto: VerifyEmailChangeDto, @ClientIp() ip: string) {
    return this.credentials.verifyEmailChange(auth, idParam(id, 'User'), dto, ip);
  }

  // #36 PATCH /users/:userId/password - customer: change own password (current + new)
  @UseGuards(ThrottlerGuard) @limit()
  @Patch('users/:userId/password') @HttpCode(200)
  changePassword(@CurrentUser() auth: AuthUser, @Param('userId') id: string, @Body() dto: ChangePasswordDto, @ClientIp() ip: string) {
    return this.credentials.changePassword(auth, idParam(id, 'User'), dto, ip);
  }

  // #37 POST /users/:userId/password-reset - admin: start a reset. The customer gets the token by email; the admin never sees a password.
  @Roles('Admin')
  @Post('users/:userId/password-reset') @HttpCode(200)
  startPasswordReset(@CurrentUser() auth: AuthUser, @Param('userId') id: string, @Body() dto: AdminPasswordResetDto, @ClientIp() ip: string) {
    return this.credentials.startPasswordReset(auth, idParam(id, 'User'), dto, ip);
  }

  // #38 POST /auth/password-reset/confirm - public: the customer sets a new password with the emailed token
  @Public()
  @UseGuards(ThrottlerGuard) @limit()
  @Post('auth/password-reset/confirm') @HttpCode(200)
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto, @ClientIp() ip: string) {
    return this.credentials.confirmPasswordReset(dto, ip);
  }
}
