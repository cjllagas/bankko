import { PageQueryDto } from '../common/paging';
import { OptEnum } from '../common/validators';

export class ListNotificationsQueryDto extends PageQueryDto {
  @OptEnum(['Email', 'SMS']) type?: 'Email' | 'SMS';
  @OptEnum(['Sent', 'Failed']) status?: 'Sent' | 'Failed';
}
