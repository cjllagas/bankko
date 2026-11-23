import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Like, Repository } from 'typeorm';
import { AuthUser } from '../common/decorators';
import { E } from '../common/api-error';
import { mapUser } from '../common/mappers';
import { envelope, paging, sorting } from '../common/paging';
import { AccessService } from '../core/access.service';
import { AuditService } from '../core/audit.service';
import { Admin, User } from '../entities';
import { ListUsersQueryDto, RegisterUserDto, UpdateUserDto } from './users.dto';

const SORT = { userId: 'userId', firstName: 'firstName', lastName: 'lastName', email: 'email', dateRegistered: 'dateRegistered' };
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // True when the value is already used by any customer (except `exceptUserId`) or any admin.
  private async taken(field: 'email' | 'phoneNumber', value: string, exceptUserId = 0) {
    const u = await this.users.createQueryBuilder('u').where(`u.${field} = :value AND u.userId <> :id`, { value, id: exceptUserId }).getCount();
    if (u > 0) return true;
    return (await this.admins.countBy({ [field]: value })) > 0;
  }

  /** #3 POST /users (public registration) */
  async register(dto: RegisterUserDto, ip: string) {
    if (await this.taken('email', dto.email)) throw E.conflict('Email already registered.', [`A user with email ${dto.email} already exists.`]);
    if (await this.taken('phoneNumber', dto.phoneNumber)) throw E.conflict('Phone number already in use.', [`Phone number ${dto.phoneNumber} belongs to another user.`]);
    const hash = await bcrypt.hash(dto.password, 10);
    try {
      const saved = await this.users.save(this.users.create({
        firstName: dto.firstName, lastName: dto.lastName, email: dto.email, phoneNumber: dto.phoneNumber, password: hash,
      }));
      await this.audit.record('User', saved.userId, 'USER_REGISTERED', 'User', saved.userId, ip);
      return mapUser(await this.users.findOneByOrFail({ userId: saved.userId }));
    } catch (e: any) {
      if (e?.driverError?.code === 'ER_DUP_ENTRY') {
        throw /phone/i.test(e.message) ? E.conflict('Phone number already in use.', []) : E.conflict('Email already registered.', []);
      }
      throw e;
    }
  }

  /** #4 GET /users (admin) */
  async list(q: ListUsersQueryDto) {
    const p = paging(q);
    const s = sorting(q, SORT, '-dateRegistered');
    const where = q.lastName ? { lastName: Like(`%${likeEscape(q.lastName)}%`) } : {};
    const [rows, total] = await this.users.findAndCount({
      where, order: { [s.prop]: s.dir, userId: 'ASC' }, skip: p.skip, take: p.limit,
    });
    return envelope(rows, mapUser, p, total);
  }

  async getOrFail(id: number) {
    const u = await this.users.findOneBy({ userId: id });
    if (!u) throw E.notFound('User not found.', [`No user exists with ID ${id}.`]);
    return u;
  }

  /** #5 GET /users/:userId (owner or admin) */
  async get(auth: AuthUser, id: number) {
    this.access.requireOwnerOrAdmin(auth, id);
    return mapUser(await this.getOrFail(id));
  }

  /** #6 PATCH /users/:userId (owner or admin) */
  async update(auth: AuthUser, id: number, dto: UpdateUserDto, ip: string) {
    this.access.requireOwnerOrAdmin(auth, id);
    const changes: Partial<User> = {};
    if (dto.firstName !== undefined) changes.firstName = dto.firstName;
    if (dto.lastName !== undefined) changes.lastName = dto.lastName;
    if (dto.phoneNumber !== undefined) changes.phoneNumber = dto.phoneNumber;
    if (!Object.keys(changes).length) throw E.badRequest('No updatable fields.', ['Send firstName, lastName or phoneNumber.']);
    await this.getOrFail(id);
    if (changes.phoneNumber && (await this.taken('phoneNumber', changes.phoneNumber, id))) {
      throw E.conflict('Phone number already in use.', [`Phone number ${changes.phoneNumber} belongs to another user.`]);
    }
    await this.users.update({ userId: id }, changes);
    await this.audit.record(auth.role === 'Admin' ? 'Admin' : 'User', auth.sub, 'PROFILE_UPDATED', 'User', id, ip);
    return mapUser(await this.getOrFail(id));
  }
}
