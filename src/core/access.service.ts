import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../common/decorators';
import { E } from '../common/api-error';
import { Account } from '../entities';

// Ownership and role helpers (Lab 06, measure 5: RBAC + ownership, deny by default).
@Injectable()
export class AccessService {
  constructor(@InjectRepository(Account) private readonly accounts: Repository<Account>) {}

  isAdmin = (a: AuthUser) => a.role === 'Admin';
  isCustomer = (a: AuthUser) => a.role === 'Customer';

  requireCustomer(a: AuthUser, what = 'This action') {
    if (!this.isCustomer(a)) throw E.forbidden('Access denied.', [`${what} is only available to customers.`]);
  }

  /** Allowed when the caller is an Admin, or the Customer whose own record it is. */
  requireOwnerOrAdmin(a: AuthUser, userId: number) {
    if (this.isAdmin(a) || (this.isCustomer(a) && a.sub === Number(userId))) return;
    throw E.forbidden('Access denied.', ['You can only access your own records.']);
  }

  /** Loads an account and checks that the caller may use it (404 unknown, 403 not yours). */
  async loadAccount(a: AuthUser, accountId: number, { allowAdmin = true } = {}): Promise<Account> {
    const acct = await this.accounts.findOneBy({ accountId });
    if (!acct) throw E.notFound('Account not found.', [`No account exists with ID ${accountId}.`]);
    if (this.isAdmin(a)) {
      if (!allowAdmin) throw E.forbidden('Access denied.', ['Administrators cannot do this on a customer account.']);
      return acct;
    }
    if (!this.isCustomer(a) || a.sub !== acct.userId) throw E.forbidden('Access denied.', [`You do not own account ${accountId}.`]);
    return acct;
  }
}
