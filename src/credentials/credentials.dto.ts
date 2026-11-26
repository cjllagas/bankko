import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { GmailAddress, StrongPassword } from '../common/validators';

const lower = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** POST /users/:userId/email-change - step 1: the new address, confirmed with the current password. */
export class RequestEmailChangeDto {
  @GmailAddress() newEmail: string;

  @IsString({ message: 'currentPassword is required.' })
  @MinLength(1, { message: 'currentPassword is required.' })
  @MaxLength(200, { message: 'currentPassword must not exceed 200 characters.' })
  currentPassword: string;
}

/** POST /users/:userId/email-change/verify - step 2: the code that was sent to the new address. */
export class VerifyEmailChangeDto {
  @IsString({ message: 'requestId is required.' })
  @Matches(/^[a-f0-9]{32}$/, { message: 'requestId is not valid.' })
  requestId: string;

  @IsString({ message: 'code is required.' })
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit number we sent you.' })
  code: string;
}

/** PATCH /users/:userId/password - a customer changes their own password. */
export class ChangePasswordDto {
  @IsString({ message: 'currentPassword is required.' })
  @MinLength(1, { message: 'currentPassword is required.' })
  @MaxLength(200, { message: 'currentPassword must not exceed 200 characters.' })
  currentPassword: string;

  @StrongPassword() newPassword: string;
}

/** POST /users/:userId/password-reset (admin). The email must match the customer on file: it guards against a wrong ID. */
export class AdminPasswordResetDto {
  @Transform(lower)
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @MaxLength(100, { message: 'email must not exceed 100 characters.' })
  email: string;
}

/** POST /auth/password-reset/confirm (public) - the customer sets their own new password. */
export class ConfirmPasswordResetDto {
  @IsString({ message: 'token is required.' })
  @Matches(/^[a-f0-9]{64}$/, { message: 'token is not valid.' })
  token: string;

  @StrongPassword() newPassword: string;
}
