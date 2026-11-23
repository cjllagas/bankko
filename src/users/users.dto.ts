import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { PageQueryDto } from '../common/paging';
import { OptString, SafeString, StrongPassword } from '../common/validators';

export class RegisterUserDto {
  @SafeString(50) firstName: string;
  @SafeString(50) lastName: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @MaxLength(100, { message: 'email must not exceed 100 characters.' })
  email: string;
  @SafeString(15)
  @Matches(/^\+?\d{10,14}$/, { message: 'phoneNumber must be 10 to 14 digits, e.g. 09171234567.' })
  phoneNumber: string;
  @StrongPassword() password: string;
}

// PATCH: every field optional. Email is the login identifier and cannot be changed here.
export class UpdateUserDto {
  @OptString(50) firstName?: string;
  @OptString(50) lastName?: string;
  @OptString(15)
  @Matches(/^\+?\d{10,14}$/, { message: 'phoneNumber must be 10 to 14 digits, e.g. 09171234567.' })
  phoneNumber?: string;
}

export class ListUsersQueryDto extends PageQueryDto {
  @OptString(50) lastName?: string;
}
