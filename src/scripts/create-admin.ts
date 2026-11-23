// Usage (MySQL must be running):  npm run create-admin
// Creates one Admin row. The password is typed hidden, hashed with bcrypt, and never stored in plain text.
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import * as readline from 'readline';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { Admin } from '../entities';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const origWrite = (rl as any)._writeToOutput;
(rl as any)._writeToOutput = function (s: string) { if (!muted) origWrite.call(rl, s); else if (s.includes('\n')) origWrite.call(rl, '\n'); };
const ask = (q: string, hidden = false) => new Promise<string>((res) => {
  rl.question(q, (a) => { muted = false; res(a.trim()); });
  muted = hidden;
});

(async () => {
  const first = await ask('First name: ');
  const last = await ask('Last name: ');
  const email = (await ask('Email (login): ')).toLowerCase();
  const phone = await ask('Mobile number (e.g. 09171234567): ');
  const pass = await ask('Password (min 12 chars, hidden): ', true);
  const pass2 = await ask('Repeat password (hidden): ', true);
  rl.close();

  const errors: string[] = [];
  if (!first || first.length > 50) errors.push('First name is required (max 50).');
  if (!last || last.length > 50) errors.push('Last name is required (max 50).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) errors.push('Email is not valid.');
  if (!/^\d{10,15}$/.test(phone)) errors.push('Mobile number must be 10 to 15 digits.');
  if (pass.length < 12) errors.push('Password must be at least 12 characters.');
  if (pass !== pass2) errors.push('Passwords do not match.');
  if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }

  const ds = await new DataSource({ ...(await buildDataSourceOptions()), synchronize: true }).initialize();
  try {
    const repo = ds.getRepository(Admin);
    const saved = await repo.save(repo.create({ firstName: first, lastName: last, email, phoneNumber: phone, password: await bcrypt.hash(pass, 10), status: 'Active' }));
    console.log(`\nAdmin created. Admin_ID = ${saved.adminId}. Log in at /admin with ${email}`);
  } catch (e: any) {
    console.error('\nFailed:', e?.driverError?.code === 'ER_DUP_ENTRY' ? 'That email or mobile number is already used.' : e.message);
    process.exitCode = 1;
  } finally {
    await ds.destroy();
  }
})();
