import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @MaxLength(100, { message: 'email must not exceed 100 characters.' })
  email: string;

  @IsString({ message: 'password is required.' })
  @MinLength(1, { message: 'password is required.' })
  @MaxLength(200, { message: 'password must not exceed 200 characters.' })
  password: string;
}

export class VerifyLoginDto {
  @IsString({ message: 'challengeId is required.' })
  @Matches(/^[a-f0-9]{32}$/, { message: 'challengeId is not valid.' })
  challengeId: string;

  @IsString({ message: 'code is required.' })
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit number we sent you.' })
  code: string;
}

export class ResendLoginDto {
  @IsString({ message: 'challengeId is required.' })
  @Matches(/^[a-f0-9]{32}$/, { message: 'challengeId is not valid.' })
  challengeId: string;
}
