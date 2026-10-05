/**
 * The one database connection, to the MySQL Hostinger gives every hosting
 * plan — not Supabase. Accounts, sessions and saved jobs all live here now.
 *
 * This file is the single dependency in the whole repository. Everything
 * else in `core/` and `server/` is zero-dependency node:http / node:crypto —
 * see CLAUDE.md. Node has no built-in MySQL client, so talking to a MySQL
 * server at all needs one driver; `mysql2` is it, and nothing else should
 * ever be added beside it without the same conversation.
 *
 * Five environment variables, read once at first use rather than at import
 * time — the same reasoning `config.ts` already uses for Supabase: a server
 * started with none of them set must still serve the calculator, just
 * without accounts. See DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 * in SETUP.md.
 */

import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let triedAndFailed = '';

/** Why there is no pool, the moment that becomes true — never a guess later. */
export function dbReason(env: Record<string, string | undefined> = process.env): string {
  if (triedAndFailed) return triedAndFailed;
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((k) => !env[k]);
  if (missing.length) return `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set`;
  return '';
}

export function dbAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return !dbReason(env);
}

/**
 * The shared pool, created on first call and reused after. `null` when the
 * environment has not given this host anything to connect with — callers
 * answer 501 in that case, the same pattern `/api/mail` already uses for a
 * missing Brevo key.
 */
export function getPool(): mysql.Pool | null {
  if (pool) return pool;
  if (!dbAvailable()) return null;
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    // Hostinger's shared MySQL is reached over the open internet from a
    // Node app hosting, not a unix socket, so this stays plain TCP.
  });
  return pool;
}

/** One query, typed loosely — callers know their own row shape. */
export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  if (!p) throw new Error(dbReason() || 'The database is not configured on this server.');
  const [rows] = await p.query(sql, params);
  return rows as T[];
}

/** Closes the pool — used by tests only; the running server never calls this. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
