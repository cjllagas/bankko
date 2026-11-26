import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { EntityManager, In, IsNull, LessThan, Repository } from 'typeorm';
import { E } from '../common/api-error';
import { AuthUser } from '../common/decorators';
import { config } from '../config';
import { AccessService } from '../core/access.service';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import { Admin, CredentialRequest, Notification, User } from '../entities';
import { AdminPasswordResetDto, ChangePasswordDto, ConfirmPasswordResetDto, RequestEmailChangeDto, VerifyEmailChangeDto } from './credentials.dto';

const mask = (email: string) => { const [n, d] = email.split('@'); return `${n.charAt(0)}***@${d}`; };
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(CredentialRequest) private readonly requests: Repository<CredentialRequest>,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ---- helpers ----

  /** Only the customer themself may change their own email or password (an admin cannot, 403). */
  private self(auth: AuthUser, id: number) {
    this.access.requireCustomer(auth, 'Changing your own email or password');
    if (auth.sub !== id) throw E.forbidden('Access denied.', ['You can only change your own email or password.']);
  }

  private async loadWithPassword(id: number) {
    const u = await this.users.createQueryBuilder('u').addSelect('u.password').where('u.userId = :id', { id }).getOne();
    if (!u) throw E.notFound('User not found.', [`No user exists with ID ${id}.`]);
    return u;
  }

  /** Checks the current password. Wrong guesses count toward the same lockout as login (5 failures = 15 minutes). */
  private async requirePassword(u: User, plain: string) {
    if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) throw E.tooMany((new Date(u.lockedUntil).getTime() - Date.now()) / 1000);
    if (await bcrypt.compare(plain, u.password)) return;
    const { maxFailed, minutes } = config.lockout;
    await this.users.query(
      'UPDATE `user` SET Locked_Until = IF(Failed_Attempts + 1 >= ?, ?, Locked_Until), Failed_Attempts = IF(Failed_Attempts + 1 >= ?, 0, Failed_Attempts + 1) WHERE User_ID = ?',
      [maxFailed, new Date(Date.now() + minutes * 60 * 1000), maxFailed, u.userId]);
    throw E.forbidden('Current password is incorrect.', ['The current password you entered is incorrect.']);
  }

  private async emailTaken(email: string) {
    if ((await this.users.countBy({ email })) > 0) return true;
    return (await this.admins.countBy({ email })) > 0;
  }

  private newCode = () => String(crypto.randomInt(0, 10 ** config.otp.length)).padStart(config.otp.length, '0');
  // HMAC with the server secret: the database never holds the code itself.
  private hashCode = (requestId: string, code: string) => crypto.createHmac('sha256', config.jwt.secret).update(`${requestId}:${code}`).digest('hex');
  private invalidCode = () => E.badRequest('Invalid or expired verification code.', ['The code is incorrect or has expired. Request a new one.']);

  /** 429 when the same customer already got a request of this kind less than a minute ago. */
  private async enforceCooldown(userId: number, purpose: CredentialRequest['purpose']) {
    const last = await this.requests.findOne({ where: { userId, purpose, consumedAt: IsNull() }, order: { lastSentAt: 'DESC' } });
    if (!last) return;
    const wait = config.credentials.resendCooldownSeconds - (Date.now() - new Date(last.lastSentAt).getTime()) / 1000;
    if (wait > 0) throw E.tooMany(wait);
  }

  private async clearPending(userId: number, purposes: CredentialRequest['purpose'][]) {
    await this.requests.delete({ expiresAt: LessThan(new Date()) });                          // housekeeping
    await this.requests.delete({ userId, purpose: In(purposes), consumedAt: IsNull() });
  }

  private notify(m: EntityManager, userId: number, message: string) {
    const repo = m.getRepository(Notification);
    return repo.save(repo.create({ userId, transactionId: null, type: 'Email', message: message.slice(0, 255), status: 'Sent' }));
  }

  // ---- #34 / #35 customer: change email ----

  /** #34 POST /users/:userId/email-change: password + new address. A code goes to the NEW address. */
  async requestEmailChange(auth: AuthUser, id: number, dto: RequestEmailChangeDto, ip: string) {
    this.self(auth, id);
    const user = await this.loadWithPassword(id);
    await this.requirePassword(user, dto.currentPassword);
    if (dto.newEmail === user.email) throw E.unprocessable('Email unchanged.', ['That is already your email address.']);
    if (await this.emailTaken(dto.newEmail)) throw E.conflict('Email already registered.', [`A user with email ${dto.newEmail} already exists.`]);
    await this.enforceCooldown(id, 'EmailChange');
    await this.clearPending(id, ['EmailChange']);

    const now = new Date();
    const requestId = crypto.randomBytes(16).toString('hex');
    const code = this.newCode();
    const row = await this.requests.save(this.requests.create({
      requestId, userId: id, purpose: 'EmailChange', newEmail: dto.newEmail, requestedByAdminId: null,
      codeHash: this.hashCode(requestId, code), attempts: 0, lastSentAt: now, consumedAt: null,
      expiresAt: new Date(now.getTime() + config.credentials.emailChangeTtlSeconds * 1000),
    }));
    try {
      await this.mail.sendEmailChangeCode(dto.newEmail, user.firstName, code, config.credentials.emailChangeTtlSeconds);
    } catch (e) {
      await this.requests.delete({ requestId });
      throw e;
    }
    await this.audit.record('User', id, 'EMAIL_CHANGE_REQUESTED', 'User', id, ip);
    return {
      requestId: row.requestId, sentTo: mask(dto.newEmail),
      expiresInSeconds: config.credentials.emailChangeTtlSeconds, resendAfterSeconds: config.credentials.resendCooldownSeconds,
      ...(config.demo.showCode ? { demoCode: code } : {}),   // demo mode only (see config.ts)
    };
  }

  /** #35 POST /users/:userId/email-change/verify: the code from the new address. The email changes and every old token stops working. */
  async verifyEmailChange(auth: AuthUser, id: number, dto: VerifyEmailChangeDto, ip: string) {
    this.self(auth, id);
    const req = await this.requests.findOneBy({ requestId: dto.requestId, userId: id, purpose: 'EmailChange' });
    if (!req || req.consumedAt || new Date(req.expiresAt) <= new Date() || req.attempts >= config.credentials.emailChangeMaxAttempts || !req.newEmail) throw this.invalidCode();

    const given = Buffer.from(this.hashCode(req.requestId, dto.code));
    const stored = Buffer.from(req.codeHash);
    if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
      await this.requests.increment({ requestId: req.requestId, consumedAt: IsNull() }, 'attempts', 1);
      await this.audit.record('User', id, 'EMAIL_CHANGE_CODE_FAILED', 'User', id, ip);
      if (req.attempts + 1 >= config.credentials.emailChangeMaxAttempts) await this.requests.update({ requestId: req.requestId }, { consumedAt: new Date() });
      throw this.invalidCode();
    }

    const before = await this.users.findOneByOrFail({ userId: id });
    const newEmail = req.newEmail;
    if (await this.emailTaken(newEmail)) throw E.conflict('Email already registered.', [`A user with email ${newEmail} already exists.`]);
    try {
      await this.users.manager.transaction(async (m) => {
        // single use: only the request that flips consumedAt from NULL wins
        const used = await m.getRepository(CredentialRequest).update({ requestId: req.requestId, consumedAt: IsNull() }, { consumedAt: new Date() });
        if (!used.affected) throw this.invalidCode();
        await m.getRepository(User).update({ userId: id }, { email: newEmail, tokenVersion: () => '`Token_Version` + 1' });
        await this.notify(m, id, `Your Bankko email was changed to ${mask(newEmail)}.`);
        await this.audit.record('User', id, 'EMAIL_CHANGED', 'User', id, ip, m);
      });
    } catch (e: any) {
      if (e?.driverError?.code === 'ER_DUP_ENTRY') throw E.conflict('Email already registered.', [`A user with email ${newEmail} already exists.`]);
      throw e;
    }
    // Tell the OLD address too: this is how a hijacked change gets noticed.
    await this.mail.sendNotice(before.email, before.firstName, 'Your Bankko email was changed',
      `The email on your Bankko account was changed to ${mask(newEmail)}.`);
    return { message: 'Email updated. Please log in again with your new email.', email: newEmail, reloginRequired: true };
  }

  // ---- #36 customer: change password ----

  /** #36 PATCH /users/:userId/password: current + new password. Every old token stops working. */
  async changePassword(auth: AuthUser, id: number, dto: ChangePasswordDto, ip: string) {
    this.self(auth, id);
    const user = await this.loadWithPassword(id);
    await this.requirePassword(user, dto.currentPassword);
    if (dto.newPassword === dto.currentPassword) throw E.unprocessable('Password unchanged.', ['The new password must be different from the current one.']);
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.users.manager.transaction(async (m) => {
      await m.getRepository(User).update({ userId: id }, { password: hash, tokenVersion: () => '`Token_Version` + 1', failedAttempts: 0, lockedUntil: null });
      await m.getRepository(CredentialRequest).delete({ userId: id, purpose: 'PasswordReset', consumedAt: IsNull() });
      await this.notify(m, id, 'Your Bankko password was changed.');
      await this.audit.record('User', id, 'PASSWORD_CHANGED', 'User', id, ip, m);
    });
    await this.mail.sendNotice(user.email, user.firstName, 'Your Bankko password was changed', 'The password on your Bankko account was just changed.');
    return { message: 'Password updated. Please log in again.', reloginRequired: true };
  }

  // ---- #37 / #38 admin-started reset ----

  /**
   * #37 POST /users/:userId/password-reset (admin). The admin confirms the customer's email; the customer receives a one-time
   * token at that address and chooses the new password. The admin never sets, sees or learns the password.
   */
  async startPasswordReset(auth: AuthUser, id: number, dto: AdminPasswordResetDto, ip: string) {
    const user = await this.users.findOneBy({ userId: id });
    if (!user) throw E.notFound('User not found.', [`No user exists with ID ${id}.`]);
    if (user.email !== dto.email) throw E.unprocessable('Email does not match.', [`The email does not match the customer on file for user ${id}.`]);
    await this.enforceCooldown(id, 'PasswordReset');
    await this.clearPending(id, ['PasswordReset']);

    const now = new Date();
    const token = crypto.randomBytes(32).toString('hex');
    const requestId = crypto.randomBytes(16).toString('hex');
    await this.requests.save(this.requests.create({
      requestId, userId: id, purpose: 'PasswordReset', newEmail: null, requestedByAdminId: auth.sub,
      codeHash: sha256(token), attempts: 0, lastSentAt: now, consumedAt: null,
      expiresAt: new Date(now.getTime() + config.credentials.resetTtlSeconds * 1000),
    }));
    try {
      await this.mail.sendPasswordReset(user.email, user.firstName, token, config.credentials.resetTtlSeconds);
    } catch (e) {
      await this.requests.delete({ requestId });
      throw e;
    }
    await this.audit.record('Admin', auth.sub, 'PASSWORD_RESET_REQUESTED', 'User', id, ip);
    return {
      message: 'Password reset email sent to the customer.', userId: id, sentTo: mask(user.email), expiresInSeconds: config.credentials.resetTtlSeconds,
      ...(config.demo.showCode ? { demoToken: token } : {}),   // demo mode only: lets Postman finish the flow without a mailbox
    };
  }

  /** #38 POST /auth/password-reset/confirm (public): the emailed token + the customer's own new password. */
  async confirmPasswordReset(dto: ConfirmPasswordResetDto, ip: string) {
    const invalid = () => E.badRequest('Invalid or expired reset token.', ['The reset code is incorrect, expired or already used. Ask the bank to send a new one.']);
    const req = await this.requests.findOneBy({ codeHash: sha256(dto.token), purpose: 'PasswordReset' });
    if (!req || req.consumedAt || new Date(req.expiresAt) <= new Date()) throw invalid();
    const user = await this.users.findOneBy({ userId: req.userId });
    if (!user) throw invalid();

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.users.manager.transaction(async (m) => {
      const used = await m.getRepository(CredentialRequest).update({ requestId: req.requestId, consumedAt: IsNull() }, { consumedAt: new Date() });
      if (!used.affected) throw invalid();
      // A reset also unlocks the account and signs out every device. Anything else still pending for this customer is cancelled.
      await m.getRepository(User).update({ userId: user.userId }, { password: hash, tokenVersion: () => '`Token_Version` + 1', failedAttempts: 0, lockedUntil: null });
      await m.getRepository(CredentialRequest).delete({ userId: user.userId, consumedAt: IsNull() });
      await this.notify(m, user.userId, 'Your Bankko password was reset.');
      await this.audit.record('User', user.userId, 'PASSWORD_RESET_DONE', 'User', user.userId, ip, m);
    });
    await this.mail.sendNotice(user.email, user.firstName, 'Your Bankko password was reset', 'The password on your Bankko account was just reset with a reset code.');
    return { message: 'Password updated. You can now log in with your new password.' };
  }
}
