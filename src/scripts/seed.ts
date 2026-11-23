// Usage: npm run seed   (MySQL must be running; tables are created if they do not exist yet)
// Loads demo data once. The demo password below is for local testing only.
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { Account, Admin, Biller, Notification, Payee, Transaction, User } from '../entities';

export const DEMO_PASSWORD = 'Bankko#Demo2026';

(async () => {
  const ds = await new DataSource({ ...(await buildDataSourceOptions()), synchronize: true }).initialize();
  try {
    if ((await ds.getRepository(Admin).count()) > 0 || (await ds.getRepository(User).count()) > 0) {
      console.log('Database already has data. Nothing seeded.');
      return;
    }
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const admins = ds.getRepository(Admin), users = ds.getRepository(User), accounts = ds.getRepository(Account);

    await admins.save(admins.create({ firstName: 'Ana', lastName: 'Reyes', email: 'ana.reyes@bankko.example', phoneNumber: '09170000001', password: hash }));

    const people = [
      ['Juan', 'Dela Cruz', 'juan.delacruz@email.com', '09171234567'],
      ['Maria', 'Santos', 'maria.santos@email.com', '09181234567'],
      ['Pedro', 'Garcia', 'pedro.garcia@email.com', '09191234567'],
    ];
    const saved: User[] = [];
    for (const [f, l, e, p] of people) saved.push(await users.save(users.create({ firstName: f, lastName: l, email: e, phoneNumber: p, password: hash })));

    const mk = (u: User, number: string, type: 'Savings' | 'Checking', balance: number) =>
      accounts.save(accounts.create({ userId: u.userId, accountNumber: number, accountType: type, balance, status: 'Active' }));
    const a1 = await mk(saved[0], '1002-3350-4471', 'Savings', 15250.75);
    const a2 = await mk(saved[1], '1002-3350-4472', 'Checking', 8200);
    await mk(saved[2], '1002-3350-4473', 'Savings', 52000);

    const billers = ds.getRepository(Biller);
    const bs = await billers.save([
      billers.create({ billerName: 'Meralco', category: 'Utilities', status: 'Active' }),
      billers.create({ billerName: 'Maynilad', category: 'Utilities', status: 'Active' }),
      billers.create({ billerName: 'PLDT', category: 'Telecom', status: 'Active' }),
      billers.create({ billerName: 'Old Cable Co.', category: 'Telecom', status: 'Inactive' }),
    ]);
    const payees = ds.getRepository(Payee);
    const py = await payees.save(payees.create({ accountId: a1.accountId, billerId: bs[0].billerId, billerAccountNumber: '123456789', nickname: 'Home electricity', status: 'Active' }));

    // one sample transfer so the history and admin screens are not empty
    const txs = ds.getRepository(Transaction);
    const t = await txs.save(txs.create({
      accountId: a1.accountId, destinationAccountId: a2.accountId, transactionType: 'Transfer', amount: 500,
      referenceNumber: 'BNK-20261022-000123', status: 'Completed', reviewStatus: 'None', idempotencyKey: 'seed-transfer-0001',
    }));
    await ds.getRepository(Notification).save(ds.getRepository(Notification).create({
      userId: saved[0].userId, transactionId: t.transactionId, type: 'SMS', message: `You sent PHP 500.00 to account ${a2.accountNumber}. Ref: BNK-20261022-000123.`, status: 'Sent',
    }));
    console.log(`Seeded. Log in with the password "${DEMO_PASSWORD}":`);
    console.log('  admin:    ana.reyes@bankko.example   (page: /admin)');
    console.log('  customer: juan.delacruz@email.com    (page: /customer)');
    void py;
  } finally {
    await ds.destroy();
  }
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
