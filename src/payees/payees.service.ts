import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { E } from '../common/api-error';
import { AuthUser } from '../common/decorators';
import { mapPayee } from '../common/mappers';
import { envelope, paging } from '../common/paging';
import { AccessService } from '../core/access.service';
import { AuditService } from '../core/audit.service';
import { Biller, Payee } from '../entities';
import { CreatePayeeDto, ListPayeesQueryDto, UpdatePayeeDto } from './payees.dto';

@Injectable()
export class PayeesService {
  constructor(
    @InjectRepository(Payee) private readonly payees: Repository<Payee>,
    @InjectRepository(Biller) private readonly billers: Repository<Biller>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private async loadPayee(id: number) {
    const row = await this.payees.findOneBy({ payeeId: id });
    if (!row) throw E.notFound('Payee not found.', [`No payee exists with ID ${id}.`]);
    return row;
  }

  /** #16 POST /payees (customer) */
  async create(auth: AuthUser, dto: CreatePayeeDto, ip: string) {
    this.access.requireCustomer(auth, 'Saving a payee');
    await this.access.loadAccount(auth, dto.accountId, { allowAdmin: false });
    const biller = await this.billers.findOneBy({ billerId: dto.billerId });
    if (!biller) throw E.notFound('Biller not found.', [`No biller exists with ID ${dto.billerId}.`]);
    if (biller.status !== 'Active') throw E.unprocessable('Biller unavailable.', ['This biller is not accepting new payees.']);

    const conflict = () => E.conflict('Payee already saved.', [`Account ${dto.accountId} already has biller ${dto.billerId} with reference ${dto.billerAccountNumber}.`]);
    const old = await this.payees.findOneBy({ accountId: dto.accountId, billerId: dto.billerId, billerAccountNumber: dto.billerAccountNumber });
    let id: number;
    if (old) {
      if (old.status === 'Active') throw conflict();
      // A removed payee is brought back (the UNIQUE triple keeps its old row).
      await this.payees.update({ payeeId: old.payeeId }, { status: 'Active', nickname: dto.nickname ?? null, dateAdded: new Date() });
      id = old.payeeId;
    } else {
      try {
        id = (await this.payees.save(this.payees.create({
          accountId: dto.accountId, billerId: dto.billerId, billerAccountNumber: dto.billerAccountNumber, nickname: dto.nickname ?? null, status: 'Active',
        }))).payeeId;
      } catch (e: any) { if (e?.driverError?.code === 'ER_DUP_ENTRY') throw conflict(); throw e; }
    }
    await this.audit.record('User', auth.sub, 'PAYEE_ADDED', 'Payee', id, ip);
    return mapPayee(await this.loadPayee(id));
  }

  /** #17 GET /payees/:payeeId (owner or admin) */
  async get(auth: AuthUser, id: number) {
    const row = await this.loadPayee(id);
    await this.access.loadAccount(auth, row.accountId);
    return mapPayee(row);
  }

  /** #18 PATCH /payees/:payeeId - rename (customer) */
  async rename(auth: AuthUser, id: number, dto: UpdatePayeeDto) {
    this.access.requireCustomer(auth, 'Editing a payee');
    const row = await this.loadPayee(id);
    await this.access.loadAccount(auth, row.accountId, { allowAdmin: false });
    await this.payees.update({ payeeId: id }, { nickname: dto.nickname });
    return mapPayee(await this.loadPayee(id));
  }

  /** #19 DELETE /payees/:payeeId - soft delete: past transactions keep their Payee_ID link. */
  async remove(auth: AuthUser, id: number, ip: string) {
    this.access.requireCustomer(auth, 'Removing a payee');
    const row = await this.loadPayee(id);
    await this.access.loadAccount(auth, row.accountId, { allowAdmin: false });
    await this.payees.update({ payeeId: id }, { status: 'Removed' });
    await this.audit.record('User', auth.sub, 'PAYEE_REMOVED', 'Payee', id, ip);
  }

  /** #20 GET /accounts/:accountId/payees (owner or admin) */
  async listForAccount(auth: AuthUser, accountId: number, q: ListPayeesQueryDto) {
    await this.access.loadAccount(auth, accountId);
    const p = paging(q);
    const [rows, total] = await this.payees.findAndCount({ where: { accountId, status: 'Active' }, order: { payeeId: 'ASC' }, skip: p.skip, take: p.limit });
    return envelope(rows, mapPayee, p, total);
  }
}
