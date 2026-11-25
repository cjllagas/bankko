import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { E } from '../common/api-error';
import { config } from '../config';

// Sends the login verification code. With SMTP settings it sends a real email; without them (development only)
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
}
