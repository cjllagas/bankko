import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PageQueryDto } from '../common/paging';
import { OptDate, OptEnum, OptInt, OptString } from '../common/validators';

export const TX_TYPES = ['Transfer', 'BillPayment'] as const;
export const TX_STATUSES = ['Pending', 'Completed', 'Failed'] as const;
export const REVIEW_STATUSES = ['None', 'Flagged', 'Cleared'] as const;

export class CreateTransactionDto {
  @IsInt({ message: 'accountId must be a positive integer.' }) @Min(1, { message: 'accountId must be a positive integer.' }) accountId: number;
  @IsIn(TX_TYPES, { message: 'transactionType must be Transfer or BillPayment.' }) transactionType: 'Transfer' | 'BillPayment';
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'amount must be a number with at most 2 decimals.' })
  @Min(0.01, { message: 'amount must be greater than 0.' })
  @Max(9999999999.99, { message: 'amount is too large.' })
  amount: number;
  @IsOptional() @IsInt({ message: 'destinationAccountId must be a positive integer.' }) @Min(1) destinationAccountId?: number;
  @IsOptional() @IsInt({ message: 'payeeId must be a positive integer.' }) @Min(1) payeeId?: number;
}

export class ReviewTransactionDto {
  @IsIn(REVIEW_STATUSES, { message: 'reviewStatus must be None, Flagged or Cleared.' }) reviewStatus: 'None' | 'Flagged' | 'Cleared';
  @OptString(255) reviewNote?: string;
}

export class ListTransactionsQueryDto extends PageQueryDto {
  @OptEnum(TX_STATUSES) status?: 'Pending' | 'Completed' | 'Failed';
  @OptEnum(TX_TYPES) transactionType?: 'Transfer' | 'BillPayment';
  @OptEnum(REVIEW_STATUSES) reviewStatus?: 'None' | 'Flagged' | 'Cleared';
  @OptInt() accountId?: number;
  @OptDate() dateFrom?: string;
  @OptDate() dateTo?: string;
}
