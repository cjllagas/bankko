// Loads .env and exposes every setting in one place.
import 'dotenv/config';
import * as crypto from 'crypto';

const env = (...names: string[]): string | undefined => {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
};
const int = (v: string | undefined, d: number) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

const isProd = env('NODE_ENV') === 'production';

let jwtSecret = env('JWT_SECRET');
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET must be set in production.');
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET is not set in .env. Using a random secret; every token becomes invalid when the server restarts.');
} else if (jwtSecret.length < 32) {
  console.warn('[config] JWT_SECRET is shorter than 32 characters. Use a longer random value.');
}

// DEMO ONLY: also return the verification code in the login response so it can be shown on screen.
// This defeats the purpose of a second factor, so it is off by default and refused in production.
const demoShowCode = env('DEMO_SHOW_CODE') === 'true';
if (demoShowCode && isProd) throw new Error('DEMO_SHOW_CODE=true is not allowed when NODE_ENV=production.');
if (demoShowCode) console.warn('[config] DEMO_SHOW_CODE=true: verification codes are returned in API responses. Use for demos only.');

if (isProd && env('OTP_ENABLED') === 'false') console.warn('[config] OTP_ENABLED=false: login verification codes are switched off.');

export const config = {
  isProd,
  port: int(env('PORT'), 3000),
  trustProxy: env('TRUST_PROXY') === 'true',
  db: {
    host: env('DB_HOST') || 'localhost',
    port: int(env('DB_PORT'), 3306),
    username: env('DB_USER') || 'root',
    password: env('DB_PASSWORD') || '',
    database: env('DB_NAME') || 'bankko',
    // 'mysql' or 'mariadb'. Leave empty to detect it from the server (XAMPP ships MariaDB).
    type: env('DB_TYPE') as 'mysql' | 'mariadb' | undefined,
    // TypeORM builds/updates the tables from the entities. Turn off in production.
    synchronize: env('DB_SYNC') ? env('DB_SYNC') === 'true' : !isProd,
  },
  jwt: { secret: jwtSecret, issuer: 'bankko-auth', ttlSeconds: 1800 },
  lockout: { maxFailed: 5, minutes: 15 },
  // Two-step login: after the password is accepted, a one-time code is sent to the account's email.
  otp: {
    enabled: env('OTP_ENABLED') !== 'false',
    length: 6,
    ttlSeconds: 300,            // a code is valid for 5 minutes
    maxAttempts: 3,             // wrong guesses allowed per code
    resendCooldownSeconds: 60,  // minimum gap between two sends
    maxResends: 3,              // resends allowed per login attempt
  },
  demo: { showCode: demoShowCode },
  // SMTP is optional. Without it (and outside production) codes are printed in the server console instead.
  mail: {
    host: env('SMTP_HOST'),
    port: int(env('SMTP_PORT'), 587),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM') || 'Bankko <no-reply@bankko.example>',
  },
  rateLimit: { windowMs: 15 * 60 * 1000, max: 30 },
};
