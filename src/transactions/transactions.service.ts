import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Between, DataSource, EntityManager, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ApiError, E } from '../common/api-error';
import { AuthUser } from '../common/decorators';
import { mapTransaction } from '../common/mappers';
import { dateBounds, envelope, paging, sorting } from '../common/paging';
import { AccessService } from '../core/access.service';
import { AuditService } from '../core/audit.service';
import { Account, Notification, Payee, Transaction } from '../entities';
import { CreateTransactionDto, ListTransactionsQueryDto, ReviewTransactionDto } from './transactions.dto';

const SORT = { transactionId: 'transactionId', transactionDate: 'transactionDate', amount: 'amount', referenceNumber: 'referenceNumber' };
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mask = (n: string) => `****-****-${n.slice(-4)}`;
const shortName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName.charAt(0)}.`;

// Placeholder for the external payment gateway (Lab 03, arrows 7 and 8). Replace with a real HTTPS call.
async function callGateway() { return true; }

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction) private readonly txs: Repository<Transaction>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Payee) private readonly payees: Repository<Payee>,
    private readonly ds: DataSource,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /* ---------- lists: #22 (admin) and #25 (one account's history) ---------- */

  async list(q: ListTransactionsQueryDto, accountScope?: number) {
    const p = paging(q);
    const s = sorting(q, SORT, '-transactionDate');
    const f: FindOptionsWhere<Transaction> = {};
    if (q.status) f.status = q.status;
    if (q.transactionType) f.transactionType = q.transactionType;
    if (q.reviewStatus) f.reviewStatus = q.reviewStatus;
    const r = dateBounds(q.dateFrom, q.dateTo);
    if (r.from && r.to) f.transactionDate = Between(r.from, r.to);
    else if (r.from) f.transactionDate = MoreThanOrEqual(r.from);
    else if (r.to) f.transactionDate = LessThanOrEqual(r.to);

    // An account's history includes the transfers it received (Lab 05 #25).
    const scope = accountScope ?? q.accountId;
    const where: FindOptionsWhere<Transaction> | FindOptionsWhere<Transaction>[] =
      scope ? [{ ...f, accountId: scope }, { ...f, destinationAccountId: scope }] : f;
    const order: any = { [s.prop]: s.dir };
    if (!order.transactionId) order.transactionId = 'DESC';
    const [rows, total] = await this.txs.findAndCount({ where, order, skip: p.skip, take: p.limit });
    return envelope(rows, mapTransaction, p, total);
  }

  async listForAccount(auth: AuthUser, accountId: number, q: ListTransactionsQueryDto) {
    await this.access.loadAccount(auth, accountId); // 404 unknown, 403 if it is not the caller's account
    return this.list(q, accountId);
  }

  /* ---------- #21 create a transfer or bill payment ---------- */

  private async newReference(m: EntityManager) {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const ref = `BNK-${day}-${String(crypto.randomInt(0, 1000000)).padStart(6, '0')}`;
      if (!(await m.getRepository(Transaction).existsBy({ referenceNumber: ref }))) return ref;
    }
    throw new Error('Could not allocate a reference number.');
  }

  // Same Idempotency-Key + same body = the original result again; same key + different body = 409.
  private async findReplay(accountId: number, key: string, type: string, amount: number, destId: number | null, payeeId: number | null) {
    const row = await this.txs.findOneBy({ accountId, idempotencyKey: key });
    if (!row) return null;
    const same = row.transactionType === type && Number(row.amount) === amount
      && (row.destinationAccountId ?? null) === destId && (row.payeeId ?? null) === payeeId;
    if (!same) throw E.conflict('Idempotency-Key reuse.', ['This Idempotency-Key was already used with a different request body.']);
    return { replayed: true, body: mapTransaction(row) };
  }

  async create(auth: AuthUser, dto: CreateTransactionDto, key: string, ip: string): Promise<{ replayed: boolean; body: ReturnType<typeof mapTransaction> }> {
    this.access.requireCustomer(auth, 'Creating a transaction');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(key || '')) {
      throw E.badRequest('Missing Idempotency-Key.', ['Send a unique Idempotency-Key header (a UUID) with every payment.']);
    }
    const { accountId, transactionType: type } = dto;
    const amount = Math.round(dto.amount * 100) / 100;
    const has = (v: unknown) => v !== undefined && v !== null;
    let destId: number | null = null, payeeId: number | null = null;
    if (type === 'Transfer') {
      if (has(dto.payeeId)) throw E.badRequest('Invalid field.', ['payeeId must not be sent for a Transfer.']);
      if (!has(dto.destinationAccountId)) throw E.badRequest('Invalid field.', ['destinationAccountId must be a positive integer.']);
      destId = dto.destinationAccountId!;
      if (destId === accountId) throw E.badRequest('Invalid destination.', ['The source and destination must be different accounts.']);
    } else {
      if (has(dto.destinationAccountId)) throw E.badRequest('Invalid field.', ['destinationAccountId must not be sent for a BillPayment.']);
      if (!has(dto.payeeId)) throw E.badRequest('Invalid field.', ['payeeId must be a positive integer.']);
      payeeId = dto.payeeId!;
    }

    const src = await this.access.loadAccount(auth, accountId, { allowAdmin: false }); // 404 / 403 ownership
    const replay = await this.findReplay(accountId, key, type, amount, destId, payeeId);
    if (replay) return replay;
    const frozen = (a: Account) => E.forbidden(a.status === 'Frozen' ? 'Account is frozen.' : 'Account is not active.',
      [a.status === 'Frozen' ? `Account ${a.accountId} is frozen. Contact the bank.` : `Account ${a.accountId} is not active.`]);
    if (src.status !== 'Active') throw frozen(src);

    // Cheap checks first, so a bad request never touches the money tables.
    let payee: Payee | null = null;
    if (type === 'Transfer') {
      const dest = await this.accounts.findOneBy({ accountId: destId! });
      if (!dest || dest.status !== 'Active') throw E.notFound('Destination account not found.', ['No active account matches the destination.']);
    } else {
      payee = await this.payees.findOne({ where: { payeeId: payeeId!, accountId, status: 'Active' }, relations: { biller: true } });
      if (!payee) throw E.notFound('Payee not found.', [`No active payee ${payeeId} exists on account ${accountId}.`]);
      if (payee.biller.status !== 'Active') throw E.unprocessable('Biller unavailable.', ['This biller is not accepting payments right now.']);
    }

    try {
      // One all-or-nothing database transaction (Lab 06, measure 10): debit, credit, record, notify, audit.
      const row = await this.ds.transaction(async (m) => {
        // Lock both accounts in id order so two opposite transfers can never deadlock.
        const ids = destId ? [Math.min(accountId, destId), Math.max(accountId, destId)] : [accountId];
        const locked = await m.getRepository(Account).createQueryBuilder('a')
          .setLock('pessimistic_write').where('a.accountId IN (:...ids)', { ids }).orderBy('a.accountId', 'ASC').getMany();
        const s = locked.find((a) => a.accountId === accountId)!;
        const d = destId ? locked.find((a) => a.accountId === destId) : null;
        if (s.status !== 'Active') throw frozen(s);
        if (destId && (!d || d.status !== 'Active')) throw E.notFound('Destination account not found.', ['No active account matches the destination.']);
        if (Math.round(Number(s.balance) * 100) < Math.round(amount * 100)) {
          throw E.unprocessable('Insufficient balance.', [`Account ${accountId} balance is lower than the requested amount of ${amount.toFixed(2)}.`]);
        }
        if (type === 'BillPayment' && !(await callGateway())) {
          throw new ApiError(502, 'Payment gateway error.', ['The biller could not be reached. No money was debited.']);
        }

        await m.getRepository(Account).decrement({ accountId }, 'balance', amount);
        if (destId) await m.getRepository(Account).increment({ accountId: destId }, 'balance', amount);

        const ref = await this.newReference(m);
        const saved = await m.save(m.getRepository(Transaction).create({
          accountId, destinationAccountId: destId, payeeId, transactionType: type, amount, referenceNumber: ref,
          status: 'Completed', reviewStatus: 'None', idempotencyKey: key,
        }));

        const note = (userId: number, kind: 'SMS' | 'Email', message: string) =>
          m.save(m.getRepository(Notification).create({ userId, transactionId: saved.transactionId, type: kind, message, status: 'Sent' }));
        if (type === 'Transfer') {
          await note(s.userId, 'SMS', `You sent PHP ${peso(amount)} to account ${d!.accountNumber}. Ref: ${ref}.`);
          if (d!.userId !== s.userId) await note(d!.userId, 'SMS', `You received PHP ${peso(amount)} in account ${d!.accountNumber}. Ref: ${ref}.`);
        } else {
          await note(s.userId, 'Email', `Your bill payment of PHP ${peso(amount)} to ${payee!.biller.billerName} was completed. Ref: ${ref}.`);
        }
        await this.audit.record('User', auth.sub, type === 'Transfer' ? 'TRANSFER_CREATED' : 'BILLPAYMENT_CREATED', 'Transaction', saved.transactionId, ip, m);
        return m.getRepository(Transaction).findOneByOrFail({ transactionId: saved.transactionId });
      });
      return { replayed: false, body: mapTransaction(row) };
    } catch (e: any) {
      // Two identical requests at once: the loser hits UNIQUE (Account_ID, Idempotency_Key) and gets the winner's result.
      if (e?.driverError?.code === 'ER_DUP_ENTRY') {
        const r = await this.findReplay(accountId, key, type, amount, destId, payeeId);
        if (r) return r;
      }
      throw e;
    }
  }

  /* ---------- #23 and #26: who may see a transaction ---------- */

  private async loadTx(id: number) {
    const row = await this.txs.findOneBy({ transactionId: id });
    if (!row) throw E.notFound('Transaction not found.', [`No transaction exists with ID ${id}.`]);
    return row;
  }

  // 'full' = admin or owner of the source account; 'dest' = owner of the destination account (reduced view).
  private async viewerRole(auth: AuthUser, row: Transaction): Promise<'full' | 'dest'> {
    if (this.access.isAdmin(auth)) return 'full';
    if (this.access.isCustomer(auth)) {
      const s = await this.accounts.findOneBy({ accountId: row.accountId });
      if (s && s.userId === auth.sub) return 'full';
      if (row.destinationAccountId) {
        const d = await this.accounts.findOneBy({ accountId: row.destinationAccountId });
        if (d && d.userId === auth.sub) return 'dest';
      }
    }
    throw E.forbidden('Access denied.', ['You cannot view this transaction.']);
  }

  /** #23 GET /transactions/:transactionId */
  async get(auth: AuthUser, id: number) {
    const row = await this.loadTx(id);
    const view = await this.viewerRole(auth, row);
    const out: any = mapTransaction(row);
    if (view === 'dest') for (const k of ['payeeId', 'reviewedByAdminId', 'reviewStatus', 'reviewNote', 'reviewedAt']) delete out[k];
    return out;
  }

  /** #26 GET /transactions/:transactionId/receipt */
  async receipt(auth: AuthUser, id: number) {
    const row = await this.loadTx(id);
    const view = await this.viewerRole(auth, row);
    const src = await this.accounts.findOneByOrFail({ accountId: row.accountId });
    const out: any = {
      referenceNumber: row.referenceNumber, transactionType: row.transactionType, amount: Number(row.amount),
      transactionDate: new Date(row.transactionDate).toISOString(), status: row.status,
    };
    if (row.transactionType === 'Transfer') {
      const dst = await this.accounts.findOneOrFail({ where: { accountId: row.destinationAccountId! }, relations: { user: true } });
      out.accountNumber = view === 'dest' ? mask(src.accountNumber) : src.accountNumber;
      out.destinationAccountNumber = view === 'dest' ? dst.accountNumber : mask(dst.accountNumber);
      out.destinationHolderName = shortName(dst.user);
    } else {
      const p = await this.payees.findOneOrFail({ where: { payeeId: row.payeeId! }, relations: { biller: true } });
      out.accountNumber = src.accountNumber;
      out.billerName = p.biller.billerName; out.billerAccountNumber = p.billerAccountNumber; out.nickname = p.nickname;
    }
    return out;
  }

  /** #24 PATCH /transactions/:transactionId (admin flags or clears). The reviewer always comes from the token. */
  async review(auth: AuthUser, id: number, dto: ReviewTransactionDto, ip: string) {
    const row = await this.ds.transaction(async (m) => {
      const found = await m.getRepository(Transaction).createQueryBuilder('t').setLock('pessimistic_write').where('t.transactionId = :id', { id }).getOne();
      if (!found) throw E.notFound('Transaction not found.', [`No transaction exists with ID ${id}.`]);
      if (dto.reviewStatus === 'None') {
        await m.update(Transaction, { transactionId: id }, { reviewStatus: 'None', reviewNote: null, reviewedByAdminId: null, reviewedAt: null });
      } else {
        await m.update(Transaction, { transactionId: id }, { reviewStatus: dto.reviewStatus, reviewNote: dto.reviewNote ?? null, reviewedByAdminId: auth.sub, reviewedAt: new Date() });
      }
      const action = dto.reviewStatus === 'Flagged' ? 'TRANSACTION_FLAGGED' : dto.reviewStatus === 'Cleared' ? 'TRANSACTION_CLEARED' : 'TRANSACTION_REVIEW_RESET';
      await this.audit.record('Admin', auth.sub, action, 'Transaction', id, ip, m);
      return m.getRepository(Transaction).findOneByOrFail({ transactionId: id });
    });
    return mapTransaction(row);
  }
}
