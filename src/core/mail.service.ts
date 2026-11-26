import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { E } from '../common/api-error';
import { config } from '../config';

// Sends the login verification code and the account-security emails (email change, password reset, notices). With SMTP settings it sends a real email; without them (development only)
// the code is printed in the server console so the project can be demonstrated offline.
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport = config.mail.host
    ? nodemailer.createTransport({
        host: config.mail.host, port: config.mail.port, secure: config.mail.port === 465,
        auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      })
    : null;

  async sendLoginCode(to: string, name: string, code: string, ttlSeconds: number) {
    const minutes = Math.round(ttlSeconds / 60);
    if (!this.transport) {
      if (config.isProd) throw E.unavailable('Verification code could not be sent.', ['Email delivery is not configured.']);
      this.log.warn(`[DEV - no SMTP configured] Login code for ${to}: ${code} (valid ${minutes} min)`);
      return;
    }
    try {
      await this.transport.sendMail({
        from: config.mail.from, to,
        subject: 'Your Bankko verification code',
        text: `Hello ${name},\n\nYour Bankko verification code is ${code}.\nIt expires in ${minutes} minutes. Never share it with anyone.\n\nIf you did not try to log in, change your password and contact the bank.`,
      });
    } catch (e: any) {
      this.log.error(`send failed: ${e.message}`);
      throw E.unavailable('Verification code could not be sent.', ['Please try again in a moment.']);
    }
  }

  // Shared sender. Without SMTP (development only) the message is printed in the server console instead.
  private async deliver(to: string, subject: string, text: string, devLine: string, failTitle: string) {
    if (!this.transport) {
      if (config.isProd) throw E.unavailable(failTitle, ['Email delivery is not configured.']);
      this.log.warn(`[DEV - no SMTP configured] ${devLine}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: config.mail.from, to, subject, text });
    } catch (e: any) {
      this.log.error(`send failed: ${e.message}`);
      throw E.unavailable(failTitle, ['Please try again in a moment.']);
    }
  }

  /** Code sent to the NEW address when a customer asks to change their email. */
  sendEmailChangeCode(to: string, name: string, code: string, ttlSeconds: number) {
    const minutes = Math.round(ttlSeconds / 60);
    return this.deliver(to, 'Confirm your new Bankko email',
      `Hello ${name},\n\nUse this code to confirm ${to} as your new Bankko email: ${code}\nIt expires in ${minutes} minutes. Never share it with anyone.\n\nIf you did not ask for this, ignore this message.`,
      `Email-change code for ${to}: ${code} (valid ${minutes} min)`, 'Verification code could not be sent.');
  }

  /** Token sent to the customer's address when an administrator starts a password reset. */
  sendPasswordReset(to: string, name: string, token: string, ttlSeconds: number) {
    const minutes = Math.round(ttlSeconds / 60);
    return this.deliver(to, 'Reset your Bankko password',
      `Hello ${name},\n\nA Bankko administrator started a password reset for your account.\nYour one-time reset code is:\n\n${token}\n\nOpen the Bankko login page, choose "Have a reset code?" and enter it with your new password. It expires in ${minutes} minutes and works once.\nBankko staff never ask for your password. If you did not expect this, contact the bank.`,
      `Password-reset code for ${to}: ${token} (valid ${minutes} min)`, 'Password reset email could not be sent.');
  }

  /** Best-effort security notice (an email was changed, a password was changed). Never breaks the request. */
  async sendNotice(to: string, name: string, subject: string, body: string) {
    try {
      await this.deliver(to, subject, `Hello ${name},\n\n${body}\n\nIf this was not you, contact the bank immediately.`, `Notice to ${to}: ${subject} - ${body}`, 'Notice could not be sent.');
    } catch { /* already logged */ }
  }
}
