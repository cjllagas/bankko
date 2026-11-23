import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Roles } from '../common/decorators';
import { mapAuditLog } from '../common/mappers';
import { dateBounds, envelope, paging } from '../common/paging';
import { Account, AuditLog, Transaction, User } from '../entities';
import { ListAuditQueryDto } from './audit.dto';

@Controller()
@Roles('Admin')
export class AuditController {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    @InjectRepository(Transaction) private readonly txs: Repository<Transaction>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // #32 GET /audit-logs (admin, read-only)
  @Get('audit-logs')
  async list(@Query() q: ListAuditQueryDto) {
    const p = paging(q);
    const where: FindOptionsWhere<AuditLog> = {};
    if (q.actorType) where.actorType = q.actorType;
    if (q.actorId) where.actorId = q.actorId;
    if (q.action) where.action = q.action;
    const r = dateBounds(q.dateFrom, q.dateTo);
    if (r.from && r.to) where.createdAt = Between(r.from, r.to);
    else if (r.from) where.createdAt = MoreThanOrEqual(r.from);
    else if (r.to) where.createdAt = LessThanOrEqual(r.to);
    const [rows, total] = await this.logs.findAndCount({ where, order: { logId: 'DESC' }, skip: p.skip, take: p.limit });
    return envelope(rows, mapAuditLog, p, total);
  }

  // Not in Lab 05: feeds the counters on the admin dashboard ("today" = current UTC day).
  @Get('admin/summary')
  async summary() {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [transactionsToday, flaggedForReview, frozenAccounts, totalUsers] = await Promise.all([
      this.txs.countBy({ transactionDate: MoreThanOrEqual(startOfDay) }),
      this.txs.countBy({ reviewStatus: 'Flagged' }),
      this.accounts.countBy({ status: 'Frozen' }),
      this.users.count(),
    ]);
    return { transactionsToday, flaggedForReview, frozenAccounts, totalUsers };
  }
}
