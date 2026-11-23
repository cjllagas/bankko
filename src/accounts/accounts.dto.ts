import { IsIn, Matches } from 'class-validator';
import { PageQueryDto } from '../common/paging';
import { OptEnum, OptInt, OptString } from '../common/validators';

export const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Frozen'] as const;
export const ACCOUNT_TYPES = ['Savings', 'Checking'] as const;

export class OpenAccountDto {
  @IsIn(ACCOUNT_TYPES, { message: 'accountType must be Savings or Checking.' }) accountType: 'Savings' | 'Checking';
}

export class UpdateAccountStatusDto {
  @IsIn(ACCOUNT_STATUSES, { message: 'status must be Active, Inactive or Frozen.' }) status: 'Active' | 'Inactive' | 'Frozen';
  @OptString(255) reason?: string; // validated; Lab 04 has no column to keep it
}

export class LookupQueryDto {
  @Matches(/^[0-9-]{5,20}$/, { message: 'accountNumber must be digits and hyphens, e.g. 1002-3350-4471.' }) accountNumber: string;
}

export class ListAccountsQueryDto extends PageQueryDto {
  @OptEnum(ACCOUNT_STATUSES) status?: 'Active' | 'Inactive' | 'Frozen';
  @OptEnum(ACCOUNT_TYPES) accountType?: 'Savings' | 'Checking';
  @OptInt() userId?: number;
}

export class UserAccountsQueryDto extends PageQueryDto {
  @OptEnum(ACCOUNT_TYPES) accountType?: 'Savings' | 'Checking';
}
