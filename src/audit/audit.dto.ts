import { Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto } from '../common/paging';
import { OptDate, OptEnum, OptInt } from '../common/validators';

export class ListAuditQueryDto extends PageQueryDto {
  @OptEnum(['User', 'Admin', 'System']) actorType?: 'User' | 'Admin' | 'System';
  @OptInt() actorId?: number;
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Matches(/^[A-Z_]{1,40}$/, { message: 'action must be upper-case letters and underscores, e.g. ACCOUNT_FROZEN.' })
  action?: string;
  @OptDate() dateFrom?: string;
  @OptDate() dateTo?: string;
}
