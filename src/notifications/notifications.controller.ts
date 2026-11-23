import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { E } from '../common/api-error';
import { AuthUser, CurrentUser } from '../common/decorators';
import { mapNotification } from '../common/mappers';
import { envelope, idParam, paging } from '../common/paging';
import { AccessService } from '../core/access.service';
import { Notification, User } from '../entities';
import { ListNotificationsQueryDto } from './notifications.dto';

// Notifications are read-only: the system creates them when money moves.
@Controller()
export class NotificationsController {
  constructor(
    @InjectRepository(Notification) private readonly notes: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
  ) {}

  // #27 GET /notifications/:notificationId (owner or admin)
  @Get('notifications/:notificationId')
  async getOne(@CurrentUser() auth: AuthUser, @Param('notificationId') raw: string) {
    const id = idParam(raw, 'Notification');
    const row = await this.notes.findOneBy({ notificationId: id });
    if (!row) throw E.notFound('Notification not found.', [`No notification exists with ID ${id}.`]);
    this.access.requireOwnerOrAdmin(auth, row.userId);
    return mapNotification(row);
  }

  // #28 GET /users/:userId/notifications (owner or admin)
  @Get('users/:userId/notifications')
  async listForUser(@CurrentUser() auth: AuthUser, @Param('userId') raw: string, @Query() q: ListNotificationsQueryDto) {
    const userId = idParam(raw, 'User');
    this.access.requireOwnerOrAdmin(auth, userId);
    if (!(await this.users.existsBy({ userId }))) throw E.notFound('User not found.', [`No user exists with ID ${userId}.`]);
    const p = paging(q);
    const where: FindOptionsWhere<Notification> = { userId };
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    const [rows, total] = await this.notes.findAndCount({ where, order: { notificationId: 'DESC' }, skip: p.skip, take: p.limit });
    return envelope(rows, mapNotification, p, total);
  }
}
