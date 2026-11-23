import { IsIn } from 'class-validator';
import { PageQueryDto } from '../common/paging';
import { OptEnum, OptString, SafeString } from '../common/validators';

export const BILLER_STATUSES = ['Active', 'Inactive'] as const;

export class CreateBillerDto {
  @SafeString(100) billerName: string;
  @SafeString(50) category: string;
  @OptEnum(BILLER_STATUSES) status?: 'Active' | 'Inactive';
}

// PUT replaces the whole record, so every field is required.
export class ReplaceBillerDto {
  @SafeString(100) billerName: string;
  @SafeString(50) category: string;
  @IsIn(BILLER_STATUSES, { message: 'status is required for a full update (Active or Inactive).' }) status: 'Active' | 'Inactive';
}

export class ListBillersQueryDto extends PageQueryDto {
  @OptString(50) category?: string;
  @OptEnum(BILLER_STATUSES) status?: 'Active' | 'Inactive';
}
