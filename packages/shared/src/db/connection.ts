import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

export interface DbConnectionOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  max?: number;
}

/**
 * Creates a database connection using node-postgres Pool and Drizzle ORM.
 *
 * @param options - Connection options. If connectionString is provided, it takes precedence.
 *                  Otherwise, individual host/port/database/user/password are used.
 *                  Falls back to DATABASE_URL environment variable.
 * @returns An object with the Drizzle database instance and the underlying Pool.
 */
export function createDbConnection(options: DbConnectionOptions = {}) {
  const connectionString =
    options.connectionString ?? process.env['DATABASE_URL'];

  const pool = new Pool({
    ...(connectionString
      ? { connectionString }
      : {
          host: options.host ?? 'localhost',
          port: options.port ?? 5432,
          database: options.database ?? 'devteam',
          user: options.user ?? 'devteam',
          password: options.password,
        }),
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    max: options.max ?? 10,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}

export type DbConnection = ReturnType<typeof createDbConnection>;
export type Database = DbConnection['db'];
