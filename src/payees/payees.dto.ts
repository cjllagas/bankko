import { IsInt, Min } from 'class-validator';
import { PageQueryDto } from '../common/paging';
import { OptString, SafeString } from '../common/validators';

export class CreatePayeeDto {
  @IsInt({ message: 'accountId must be a positive integer.' }) @Min(1, { message: 'accountId must be a positive integer.' }) accountId: number;
  @IsInt({ message: 'billerId must be a positive integer.' }) @Min(1, { message: 'billerId must be a positive integer.' }) billerId: number;
  @SafeString(50) billerAccountNumber: string;
  @OptString(50) nickname?: string;
}

export class UpdatePayeeDto {
  @SafeString(50) nickname: string;
}

export class ListPayeesQueryDto extends PageQueryDto {}
