import * as mysql from 'mysql2/promise';
import { DataSourceOptions } from 'typeorm';
import { config } from '../config';
import { ENTITIES } from '../entities';
import { LabNamingStrategy } from './naming.strategy';

type DbType = 'mysql' | 'mariadb';

// TypeORM has separate drivers for MySQL and MariaDB (XAMPP's "MySQL" is MariaDB). Using the wrong one makes
// schema sync re-run the same ALTERs on every start, so we ask the server which one it is.
// In development the database itself is also created when missing.
async function detectType(): Promise<DbType> {
  if (config.db.type === 'mysql' || config.db.type === 'mariadb') return config.db.type;
  try {
    const conn = await mysql.createConnection({
      host: config.db.host, port: config.db.port, user: config.db.username, password: config.db.password,
    });
    try {
      if (config.db.synchronize && /^[A-Za-z0-9_]+$/.test(config.db.database)) {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4`);
      }
      const [rows] = await conn.query('SELECT VERSION() AS v');
      return /mariadb/i.test(String((rows as any[])[0].v)) ? 'mariadb' : 'mysql';
    } finally {
      await conn.end();
    }
  } catch {
    return 'mysql'; // the real connection error is reported by TypeORM when it connects
  }
}

export async function buildDataSourceOptions(): Promise<DataSourceOptions> {
  return {
    type: await detectType(),
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.database,
    entities: ENTITIES,
    namingStrategy: new LabNamingStrategy(),
    synchronize: config.db.synchronize,
    charset: 'utf8mb4',
    timezone: 'Z', // every DATETIME is read and written as UTC (ISO 8601)
  };
}
