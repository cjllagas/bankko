import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { E } from '../common/api-error';
import { AuthUser } from '../common/decorators';
import { mapAccount } from '../common/mappers';
import { envelope, paging, sorting } from '../common/paging';
import { AccessService } from '../core/access.service';
import { AuditService } from '../core/audit.service';
import { Account, User } from '../entities';
import { ListAccountsQueryDto, LookupQueryDto, OpenAccountDto, UpdateAccountStatusDto, UserAccountsQueryDto } from './accounts.dto';

const SORT = { accountId: 'accountId', balance: 'balance', dateOpened: 'dateOpened', accountNumber: 'accountNumber' };
const pad4 = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** #7 POST /accounts - the owner is the token's user, never the body. Admins cannot open accounts. */
  async open(auth: AuthUser, dto: OpenAccountDto, ip: string) {
    this.access.requireCustomer(auth, 'Opening an account');
    for (let i = 0; i < 8; i++) {
      try {
        const saved = await this.accounts.save(this.accounts.create({
          userId: auth.sub, accountNumber: `1002-${pad4()}-${pad4()}`, accountType: dto.accountType, balance: 0, status: 'Active',
        }));
        await this.audit.record('User', auth.sub, 'ACCOUNT_OPENED', 'Account', saved.accountId, ip);
        return mapAccount(await this.accounts.findOneByOrFail({ accountId: saved.accountId }));
      } catch (e: any) {
        if (e?.driverError?.code !== 'ER_DUP_ENTRY') throw e; // account number collision: try another
      }
    }
    throw new Error('Could not allocate an account number.');
  }

  /** #31 GET /accounts/lookup - masked number and short holder name only. */
  async lookup(auth: AuthUser, q: LookupQueryDto) {
    this.access.requireCustomer(auth, 'Account lookup');
    const a = await this.accounts.findOne({ where: { accountNumber: q.accountNumber.trim(), status: 'Active' }, relations: { user: true } });
    if (!a) throw E.notFound('Account not found.', ['No active account matches that number.']);
    return {
      accountId: a.accountId, accountNumber: `****-****-${a.accountNumber.slice(-4)}`, accountType: a.accountType,
      holderName: `${a.user.firstName} ${a.user.lastName.charAt(0)}.`,
    };
  }

  /** #8 GET /accounts (admin) */
  async list(q: ListAccountsQueryDto) {
    const p = paging(q);
    const s = sorting(q, SORT, 'accountId');
    const where: FindOptionsWhere<Account> = {};
    if (q.status) where.status = q.status;
    if (q.accountType) where.accountType = q.accountType;
    if (q.userId) where.userId = q.userId;
    const [rows, total] = await this.accounts.findAndCount({ where, order: { [s.prop]: s.dir, accountId: 'ASC' }, skip: p.skip, take: p.limit });
    return envelope(rows, mapAccount, p, total);
  }

  /** #9 GET /accounts/:accountId (owner or admin) */
  async get(auth: AuthUser, id: number) {
    return mapAccount(await this.access.loadAccount(auth, id));
  }

  /** #10 PATCH /accounts/:accountId (admin: freeze / reactivate / deactivate) */
  async updateStatus(auth: AuthUser, id: number, dto: UpdateAccountStatusDto, ip: string) {
    const updated = await this.ds.transaction(async (m) => {
      const acct = await m.getRepository(Account).createQueryBuilder('a').setLock('pessimistic_write').where('a.accountId = :id', { id }).getOne();
      if (!acct) throw E.notFound('Account not found.', [`No account exists with ID ${id}.`]);
      if (acct.status !== dto.status) {
        await m.update(Account, { accountId: id }, { status: dto.status });
        const action = dto.status === 'Frozen' ? 'ACCOUNT_FROZEN' : dto.status === 'Active' ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_DEACTIVATED';
        await this.audit.record('Admin', auth.sub, action, 'Account', id, ip, m);
        acct.status = dto.status;
      }
      return acct;
    });
    return mapAccount(updated);
  }

  /** #11 GET /users/:userId/accounts (owner or admin) */
  async listForUser(auth: AuthUser, userId: number, q: UserAccountsQueryDto) {
    this.access.requireOwnerOrAdmin(auth, userId);
    if (!(await this.users.existsBy({ userId }))) throw E.notFound('User not found.', [`No user exists with ID ${userId}.`]);
    const p = paging(q);
    const where: FindOptionsWhere<Account> = { userId };
    if (q.accountType) where.accountType = q.accountType;
    const [rows, total] = await this.accounts.findAndCount({ where, order: { accountId: 'ASC' }, skip: p.skip, take: p.limit });
    return envelope(rows, mapAccount, p, total);
  }
}
