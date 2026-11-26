import { Matches } from 'class-validator';
import { PageQueryDto } from '../common/paging';
import { GmailAddress, OptString, SafeString, StrongPassword } from '../common/validators';

export class RegisterUserDto {
  @SafeString(50) firstName: string;
  @SafeString(50) lastName: string;
  @GmailAddress() email: string;
  @SafeString(15)
  @Matches(/^\+?\d{10,14}$/, { message: 'phoneNumber must be 10 to 14 digits, e.g. 09171234567.' })
  phoneNumber: string;
  @StrongPassword() password: string;
}

// PATCH: every field optional. Email and password are NOT changed here: they need the verified flows in the credentials module.
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
