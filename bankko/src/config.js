'use strict';
// Loads .env and exposes every setting in one place.
require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const env = (...names) => {
  for (const n of names) {
    if (process.env[n] !== undefined && process.env[n] !== '') return process.env[n];
  }
  return undefined;
};
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

const isProd = env('NODE_ENV') === 'production';

let jwtSecret = env('JWT_SECRET');
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET is not set in .env. Using a random secret; every token becomes invalid when the server restarts.');
} else if (jwtSecret.length < 32) {
  console.warn('[config] JWT_SECRET is shorter than 32 characters. Use a longer random value.');
}

module.exports = {
  isProd,
  port: int(env('PORT'), 3000),
  trustProxy: env('TRUST_PROXY') === 'true',
  db: {
    host: env('DB_HOST', 'MYSQL_HOST') || 'localhost',
    port: int(env('DB_PORT', 'MYSQL_PORT'), 3306),
    user: env('DB_USER', 'MYSQL_USER') || 'root',
    password: env('DB_PASSWORD', 'DB_PASS', 'MYSQL_PASSWORD') || '',
    database: env('DB_NAME', 'DB_DATABASE', 'MYSQL_DATABASE') || 'bankko',
  },
  jwt: { secret: jwtSecret, issuer: 'bankko-auth', ttlSeconds: 1800 },
  otp: { ttlSeconds: 300, maxAttempts: 3, length: 6 },
  lockout: { maxFailed: 5, minutes: 15 },
  // Transfers at or above this amount need a step-up OTP (Lab 06, measure 11).
  stepUp: { limit: int(env('STEP_UP_LIMIT'), 50000), tokenTtlSeconds: 300 },
  rateLimit: { windowSeconds: 900, loginMax: 30, otpMax: 30 },
  // No real SMS gateway yet. While true, the OTP is printed in the server
  // console and returned as `devOtp`. Never enable in production.
  devShowOtp: env('DEV_SHOW_OTP') ? env('DEV_SHOW_OTP') === 'true' : !isProd,
};