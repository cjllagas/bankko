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
  rateLimit: { windowMs: 15 * 60 * 1000, max: 30 },
};
