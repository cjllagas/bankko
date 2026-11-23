import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { E } from '../common/api-error';
import { AuthUser } from '../common/decorators';
import { mapBiller } from '../common/mappers';
import { envelope, paging } from '../common/paging';
import { AuditService } from '../core/audit.service';
import { Biller, Payee } from '../entities';
import { CreateBillerDto, ListBillersQueryDto, ReplaceBillerDto } from './billers.dto';

@Injectable()
export class BillersService {
  constructor(
    @InjectRepository(Biller) private readonly billers: Repository<Biller>,
    @InjectRepository(Payee) private readonly payees: Repository<Payee>,
    private readonly audit: AuditService,
  ) {}

  private async getOrFail(id: number) {
    const b = await this.billers.findOneBy({ billerId: id });
    if (!b) throw E.notFound('Biller not found.', [`No biller exists with ID ${id}.`]);
    return b;
  }

  /** #12 GET /billers (any logged-in user) */
  async list(q: ListBillersQueryDto) {
    const p = paging(q);
    const where: FindOptionsWhere<Biller> = {};
    if (q.category) where.category = q.category;
    if (q.status) where.status = q.status;
    const [rows, total] = await this.billers.findAndCount({ where, order: { billerId: 'ASC' }, skip: p.skip, take: p.limit });
    return envelope(rows, mapBiller, p, total);
  }

  /** #13 GET /billers/:billerId */
  async get(id: number) { return mapBiller(await this.getOrFail(id)); }

  /** #14 POST /billers (admin) */
  async create(auth: AuthUser, dto: CreateBillerDto, ip: string) {
    const saved = await this.billers.save(this.billers.create({ billerName: dto.billerName, category: dto.category, status: dto.status ?? 'Active' }));
    await this.audit.record('Admin', auth.sub, 'BILLER_CREATED', 'Biller', saved.billerId, ip);
    return mapBiller(await this.getOrFail(saved.billerId));
  }

  /** #15 PUT /billers/:billerId (admin) */
  async replace(auth: AuthUser, id: number, dto: ReplaceBillerDto, ip: string) {
    await this.getOrFail(id);
    await this.billers.update({ billerId: id }, { billerName: dto.billerName, category: dto.category, status: dto.status });
    await this.audit.record('Admin', auth.sub, 'BILLER_UPDATED', 'Biller', id, ip);
    return mapBiller(await this.getOrFail(id));
  }

  /** #33 DELETE /billers/:billerId (admin) - only a biller nobody has saved yet can be removed. */
  async remove(auth: AuthUser, id: number, ip: string) {
    await this.getOrFail(id);
    if ((await this.payees.countBy({ billerId: id })) > 0) {
      throw E.conflict('Biller is in use.', ['Payees are saved for this biller. Set its status to Inactive instead.']);
    }
    await this.billers.delete({ billerId: id });
    await this.audit.record('Admin', auth.sub, 'BILLER_DELETED', 'Biller', id, ip);
  }
}
