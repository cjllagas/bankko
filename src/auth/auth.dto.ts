import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
