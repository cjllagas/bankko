import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';
import { ApiError, E } from '../common/api-error';
import { AuthUser, Role } from '../common/decorators';
import { config } from '../config';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import { Admin, LoginChallenge, TokenDenylist, User } from '../entities';
import { LoginDto, ResendLoginDto, VerifyLoginDto } from './auth.dto';

interface Actor {
  role: Role; id: number; firstName: string; lastName: string; email: string; hash: string;
  status: 'Active' | 'Inactive'; lockedUntil: Date | null;
}

@Injectable()
export class AuthService {
  // Compared when the email is unknown so response time does not reveal which emails exist.
  private dummyHash = bcrypt.hashSync('not-a-real-password', 10);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(TokenDenylist) private readonly denylist: Repository<TokenDenylist>,
    @InjectRepository(LoginChallenge) private readonly challenges: Repository<LoginChallenge>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private async findActor(email: string): Promise<Actor | null> {
    const admin = await this.admins.createQueryBuilder('a').addSelect('a.password').where('a.email = :email', { email }).getOne();
    if (admin) {
      return { role: 'Admin', id: admin.adminId, firstName: admin.firstName, lastName: admin.lastName, email: admin.email, hash: admin.password, status: admin.status, lockedUntil: admin.lockedUntil };
    }
    const user = await this.users.createQueryBuilder('u').addSelect('u.password').where('u.email = :email', { email }).getOne();
    if (user) {
      return { role: 'Customer', id: user.userId, firstName: user.firstName, lastName: user.lastName, email: user.email, hash: user.password, status: 'Active', lockedUntil: user.lockedUntil };
    }
    return null;
  }

  private async actorById(role: Role, id: number): Promise<Actor | null> {
    if (role === 'Admin') {
      const a = await this.admins.findOneBy({ adminId: id });
      return a && { role, id, firstName: a.firstName, lastName: a.lastName, email: a.email, hash: '', status: a.status, lockedUntil: a.lockedUntil };
    }
    const u = await this.users.findOneBy({ userId: id });
    return u && { role, id, firstName: u.firstName, lastName: u.lastName, email: u.email, hash: '', status: 'Active', lockedUntil: u.lockedUntil };
  }

  // Atomic: count the failure and lock the account after maxFailed (Lab 04 Failed_Attempts / Locked_Until).
  private async registerFailure(role: Role, id: number) {
    const { maxFailed, minutes } = config.lockout;
    const lockUntil = new Date(Date.now() + minutes * 60 * 1000);
    const table = role === 'Admin' ? 'admin' : '`user`';
    const idCol = role === 'Admin' ? 'Admin_ID' : 'User_ID';
    await this.users.query(
      `UPDATE ${table} SET Locked_Until = IF(Failed_Attempts + 1 >= ?, ?, Locked_Until), Failed_Attempts = IF(Failed_Attempts + 1 >= ?, 0, Failed_Attempts + 1) WHERE ${idCol} = ?`,
      [maxFailed, lockUntil, maxFailed, id]);
  }

  private actorType = (role: Role) => (role === 'Admin' ? 'Admin' : 'User');

  /** Lab 05 #1: email + password -> JWT. */
  async login(dto: LoginDto, ip: string) {
    const generic = () => E.unauthorized('Invalid email or password.', ['The email or password is incorrect.']);
    const actor = await this.findActor(dto.email);
    if (!actor) {
      await bcrypt.compare(dto.password, this.dummyHash);
      await this.audit.record('System', null, 'LOGIN_FAILED', null, null, ip);
      throw generic();
    }
    if (actor.lockedUntil && new Date(actor.lockedUntil) > new Date()) {
      throw E.tooMany((new Date(actor.lockedUntil).getTime() - Date.now()) / 1000);
    }
    const valid = await bcrypt.compare(dto.password, actor.hash);
    if (!valid || actor.status !== 'Active') {
      if (!valid) await this.registerFailure(actor.role, actor.id);
      await this.audit.record(this.actorType(actor.role), actor.id, 'LOGIN_FAILED', null, null, ip);
      throw generic();
    }

    // Password accepted. With verification codes on, the JWT is only issued after the emailed code is confirmed.
    if (config.otp.enabled) return this.startChallenge(actor, ip);
    return this.issueToken(actor, ip);
  }

  /** Clears the failure counter, signs the JWT and writes the LOGIN_SUCCESS audit row. */
  private async issueToken(actor: Actor, ip: string) {
    if (actor.role === 'Admin') await this.admins.update({ adminId: actor.id }, { failedAttempts: 0, lockedUntil: null });
    else await this.users.update({ userId: actor.id }, { failedAttempts: 0, lockedUntil: null });

    const accessToken = await this.jwt.signAsync({ sub: String(actor.id), role: actor.role }, { jwtid: crypto.randomBytes(8).toString('hex') });
    await this.audit.record(this.actorType(actor.role), actor.id, 'LOGIN_SUCCESS', null, null, ip);
    return {
      accessToken, tokenType: 'Bearer', expiresInSeconds: config.jwt.ttlSeconds,
      userId: actor.id, role: actor.role, name: `${actor.firstName} ${actor.lastName}`,
    };
  }

  // ---- two-step login (verification code) ----

  private newCode = () => String(crypto.randomInt(0, 10 ** config.otp.length)).padStart(config.otp.length, '0');
  // HMAC with the server secret: the database never holds the code itself.
  private hashCode = (challengeId: string, code: string) => crypto.createHmac('sha256', config.jwt.secret).update(`${challengeId}:${code}`).digest('hex');
  private mask = (email: string) => { const [n, d] = email.split('@'); return `${n.charAt(0)}***@${d}`; };
  private invalidCode = () => E.unauthorized('Invalid or expired verification code.', ['The code is incorrect or has expired. Log in again to get a new one.']);

  private challengeResponse(ch: LoginChallenge, email: string, code: string) {
    return {
      verificationRequired: true, challengeId: ch.challengeId, role: ch.role, sentTo: this.mask(email),
      expiresInSeconds: config.otp.ttlSeconds, resendAfterSeconds: config.otp.resendCooldownSeconds,
      ...(config.demo.showCode ? { demoCode: code } : {}),   // demo mode only (see config.ts)
    };
  }

  private async startChallenge(actor: Actor, ip: string) {
    await this.challenges.delete({ expiresAt: LessThan(new Date()) });                       // housekeeping
    await this.challenges.delete({ role: actor.role, actorId: actor.id, consumedAt: IsNull() }); // one pending login per account
    const now = new Date();
    const challengeId = crypto.randomBytes(16).toString('hex');
    const code = this.newCode();
    const ch = await this.challenges.save(this.challenges.create({
      challengeId, role: actor.role, actorId: actor.id, codeHash: this.hashCode(challengeId, code),
      attempts: 0, resendCount: 0, expiresAt: new Date(now.getTime() + config.otp.ttlSeconds * 1000), lastSentAt: now, consumedAt: null,
    }));
    try {
      await this.mail.sendLoginCode(actor.email, actor.firstName, code, config.otp.ttlSeconds);
    } catch (e) {
      await this.challenges.delete({ challengeId });
      throw e;
    }
    await this.audit.record(this.actorType(actor.role), actor.id, 'LOGIN_CODE_SENT', null, null, ip);
    return this.challengeResponse(ch, actor.email, code);
  }

  /** POST /auth/sessions/verify: the emailed code -> JWT. */
  async verify(dto: VerifyLoginDto, ip: string) {
    const ch = await this.challenges.findOneBy({ challengeId: dto.challengeId });
    if (!ch || ch.consumedAt || new Date(ch.expiresAt) <= new Date() || ch.attempts >= config.otp.maxAttempts) throw this.invalidCode();
    const actor = await this.actorById(ch.role, ch.actorId);
    if (!actor || actor.status !== 'Active') throw this.invalidCode();
    if (actor.lockedUntil && new Date(actor.lockedUntil) > new Date()) {
      throw E.tooMany((new Date(actor.lockedUntil).getTime() - Date.now()) / 1000);
    }

    const given = Buffer.from(this.hashCode(ch.challengeId, dto.code));
    const stored = Buffer.from(ch.codeHash);
    if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
      await this.challenges.increment({ challengeId: ch.challengeId, consumedAt: IsNull() }, 'attempts', 1);
      await this.audit.record(this.actorType(actor.role), actor.id, 'LOGIN_CODE_FAILED', null, null, ip);
      if (ch.attempts + 1 >= config.otp.maxAttempts) {   // out of guesses: the code is dead and counts as a failed login
        await this.challenges.update({ challengeId: ch.challengeId }, { consumedAt: new Date() });
        await this.registerFailure(actor.role, actor.id);
      }
      throw this.invalidCode();
    }

    // single use: only the request that flips consumedAt from NULL wins
    const used = await this.challenges.update({ challengeId: ch.challengeId, consumedAt: IsNull() }, { consumedAt: new Date() });
    if (!used.affected) throw this.invalidCode();
    return this.issueToken(actor, ip);
  }

  /** POST /auth/sessions/resend: a fresh code for the same pending login (cooldown and a resend cap apply). */
  async resend(dto: ResendLoginDto, ip: string) {
    const ch = await this.challenges.findOneBy({ challengeId: dto.challengeId });
    if (!ch || ch.consumedAt || new Date(ch.expiresAt) <= new Date()) throw this.invalidCode();
    const actor = await this.actorById(ch.role, ch.actorId);
    if (!actor || actor.status !== 'Active') throw this.invalidCode();
    if (ch.resendCount >= config.otp.maxResends) throw new ApiError(429, 'Too many attempts.', ['Resend limit reached. Log in again.']);
    const wait = config.otp.resendCooldownSeconds - (Date.now() - new Date(ch.lastSentAt).getTime()) / 1000;
    if (wait > 0) throw E.tooMany(wait);

    const now = new Date();
    const code = this.newCode();
    ch.codeHash = this.hashCode(ch.challengeId, code);
    ch.attempts = 0; ch.resendCount += 1; ch.lastSentAt = now;
    ch.expiresAt = new Date(now.getTime() + config.otp.ttlSeconds * 1000);
    await this.mail.sendLoginCode(actor.email, actor.firstName, code, config.otp.ttlSeconds);
    await this.challenges.save(ch);
    await this.audit.record(this.actorType(actor.role), actor.id, 'LOGIN_CODE_RESENT', null, null, ip);
    return this.challengeResponse(ch, actor.email, code);
  }

  /** Lab 05 #29: the token's jti goes on the denylist until the token would have expired anyway. */
  async logout(auth: AuthUser, ip: string) {
    await this.denylist.delete({ expiresAt: LessThan(new Date()) });
    await this.denylist.createQueryBuilder().insert().values({ jti: auth.jti, expiresAt: new Date(auth.exp * 1000) }).orIgnore().execute();
    await this.audit.record(this.actorType(auth.role), auth.sub, 'LOGOUT', null, null, ip);
  }
}
