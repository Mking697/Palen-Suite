/**
 * Accounts, sessions, and OTP email verification — on our own MySQL, not
 * Supabase. See CLAUDE.md and SETUP.md for why and how.
 *
 * What Supabase Auth did for free, this file does by hand:
 *   - password hashing (`node:crypto` scrypt, no dependency)
 *   - a six-digit email code instead of a password-reset-style link, for the
 *     same reason the old Supabase template was changed to one: a link
 *     depends on a Site URL setting that has broken this project three times
 *     before: a code depends on nothing but the inbox it was sent to
 *   - opaque bearer session tokens stored in `sessions`, sliding 30-day
 *     expiry refreshed on every authenticated request
 *   - "row level security" is gone — Postgres enforced it for Supabase, MySQL
 *     has no equivalent, so **every query in this file that touches `jobs` or
 *     a non-admin read of `profiles` carries its own `user_id = ?`**. That
 *     discipline is this file's entire replacement for RLS: there is no
 *     database-level backstop if a call here forgets the clause, unlike
 *     Supabase where a forgotten filter still came back empty. Read a row,
 *     filter by the caller's own id, always.
 *
 * Nothing here ever trusts an id the browser sends for *who is calling* —
 * `userFromRequest` is the one source of truth for that, read from the
 * session token, the same role `whoIsCalling` played against Supabase.
 */

import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { query } from './db.ts';
import { sendMail } from './mail.ts';

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface Profile {
  id: string;
  email: string;
  access_until: string | null;
  is_admin: boolean;
  display_name: string | null;
  drive_folder_url: string | null;
  sheet_url: string | null;
  mail_from: string | null;
}

const TRIAL_DAYS = 14;
const SESSION_DAYS = 30;
const OTP_MINUTES = 60;

/* ---------- passwords ---------- */

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const want = Buffer.from(hashHex, 'hex');
  const got = scryptSync(password, salt, want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

/* ---------- small helpers ---------- */

const newId = () => randomBytes(16).toString('hex');
const newToken = () => randomBytes(32).toString('hex');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const inFuture = (minutes: number) => new Date(Date.now() + minutes * 60_000);

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified: 0 | 1;
  is_admin: 0 | 1;
  access_until: string | null;
  display_name: string | null;
  drive_folder_url: string | null;
  sheet_url: string | null;
  mail_from: string | null;
}

/* ---------- OTP email ---------- */

async function sendOtp(email: string, code: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY ?? '';
  const fallbackFrom = process.env.MAIL_FROM ?? '';
  if (!apiKey || !fallbackFrom) {
    throw new Error('Email is not configured on this server (BREVO_API_KEY / MAIL_FROM).');
  }
  const text =
    `Your Panel Suite verification code: ${code}\n\n` +
    `This code expires in ${OTP_MINUTES} minutes. If you did not request this, ignore this email.`;
  const result = await sendMail(
    {
      to: [email],
      subject: 'Panel Suite — verification code',
      text,
      attachments: [],
    },
    apiKey,
    fallbackFrom,
  );
  if (!result.ok) throw new Error(result.error || 'Could not send the verification email.');
}

/** Store a fresh code for this email, replacing any unused one. */
async function issueOtp(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await query('DELETE FROM otps WHERE email = ?', [email]);
  await query('INSERT INTO otps (email, code_hash, expires_at) VALUES (?, ?, ?)', [
    email,
    sha256(code),
    inFuture(OTP_MINUTES),
  ]);
  return code;
}

/* ---------- signup / verify / signin ---------- */

export async function signUp(email: string, password: string): Promise<void> {
  const normalised = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) {
    throw new Error('That does not look like an email address.');
  }
  if (password.length < 8) throw new Error('Password needs at least 8 characters.');

  const existing = await query<UserRow>('SELECT id, email_verified FROM users WHERE email = ?', [
    normalised,
  ]);
  if (existing.length && existing[0].email_verified) {
    throw new Error('An account with this email already exists. Sign in instead.');
  }
  if (!existing.length) {
    await query(
      'INSERT INTO users (id, email, password_hash, email_verified, access_until) VALUES (?, ?, ?, 0, ?)',
      [newId(), normalised, hashPassword(password), new Date(Date.now() + TRIAL_DAYS * 86_400_000)],
    );
  } else {
    // signed up before but never verified: let them try again with a new password
    await query('UPDATE users SET password_hash = ? WHERE email = ?', [
      hashPassword(password),
      normalised,
    ]);
  }
  const code = await issueOtp(normalised);
  await sendOtp(normalised, code);
}

export async function resendConfirmation(email: string): Promise<void> {
  const normalised = email.trim().toLowerCase();
  const code = await issueOtp(normalised);
  await sendOtp(normalised, code);
}

async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [
    token,
    userId,
    expiresAt,
  ]);
  return { token, expiresAt };
}

function toAuthUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, isAdmin: !!row.is_admin };
}

export async function verifyOtp(
  email: string,
  token: string,
): Promise<{ accessToken: string; expiresAt: Date; user: AuthUser }> {
  const normalised = email.trim().toLowerCase();
  const rows = await query<{ code_hash: string; expires_at: string }>(
    'SELECT code_hash, expires_at FROM otps WHERE email = ?',
    [normalised],
  );
  const row = rows[0];
  if (!row || sha256(token.trim()) !== row.code_hash || new Date(row.expires_at) < new Date()) {
    throw new Error('That code is wrong or has expired.');
  }
  await query('DELETE FROM otps WHERE email = ?', [normalised]);
  await query('UPDATE users SET email_verified = 1 WHERE email = ?', [normalised]);
  const users = await query<UserRow>('SELECT * FROM users WHERE email = ?', [normalised]);
  if (!users.length) throw new Error('Account not found.');
  const { token: accessToken, expiresAt } = await createSession(users[0].id);
  return { accessToken, expiresAt, user: toAuthUser(users[0]) };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ accessToken: string; expiresAt: Date; user: AuthUser }> {
  const normalised = email.trim().toLowerCase();
  const users = await query<UserRow>('SELECT * FROM users WHERE email = ?', [normalised]);
  const user = users[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('Wrong email or password.');
  }
  if (!user.email_verified) {
    throw new Error('Email not verified yet — check for the code, or ask for a new one.');
  }
  const { token: accessToken, expiresAt } = await createSession(user.id);
  return { accessToken, expiresAt, user: toAuthUser(user) };
}

export async function signOut(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token = ?', [token]);
}

/* ---------- who is calling ---------- */

/**
 * The caller, from their bearer token — never from anything else the request
 * says about itself. Expired or unknown tokens come back `null`. A valid
 * token's session is pushed another 30 days out, so a session only ends by
 * being unused for a month or by an explicit sign out — the sliding window
 * replacing what `web/auth.js`'s `fresh()` used to do against Supabase.
 */
export async function userFromRequest(req: IncomingMessage): Promise<AuthUser | null> {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const rows = await query<UserRow & { expires_at: string }>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()`,
    [token],
  );
  if (!rows.length) return null;
  await query('UPDATE sessions SET expires_at = ? WHERE token = ?', [
    new Date(Date.now() + SESSION_DAYS * 86_400_000),
    token,
  ]);
  return toAuthUser(rows[0]);
}

/* ---------- profile ---------- */

function rowToProfile(row: UserRow): Profile {
  return {
    id: row.id,
    email: row.email,
    access_until: row.access_until,
    is_admin: !!row.is_admin,
    display_name: row.display_name,
    drive_folder_url: row.drive_folder_url,
    sheet_url: row.sheet_url,
    mail_from: row.mail_from,
  };
}

/** The caller's own row, by id — never "one row", the mistake `web/auth.js` was fixed for once already. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await query<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  return rows.length ? rowToProfile(rows[0]) : null;
}

export interface ProfileEdits {
  displayName?: string;
  driveFolderUrl?: string;
  sheetUrl?: string;
  mailFrom?: string;
}

/**
 * Exactly the four columns an estimator may touch, named here rather than
 * trusted from the caller — `access_until` and `is_admin` can never reach
 * this function's SQL, mirroring what `profiles_guard_privileges` enforced
 * in Postgres. There is no database trigger backing that up anymore; this
 * function's own column list is the only thing stopping it.
 */
export async function saveProfile(userId: string, edits: ProfileEdits): Promise<void> {
  const trim = (v?: string) => (v ?? '').trim() || null;
  await query(
    `UPDATE users SET display_name = ?, drive_folder_url = ?, sheet_url = ?, mail_from = ?
     WHERE id = ?`,
    [trim(edits.displayName), trim(edits.driveFolderUrl), trim(edits.sheetUrl), trim(edits.mailFrom), userId],
  );
}

/* ---------- admin ---------- */

export async function listUsers(): Promise<
  Array<{ id: string; email: string; access_until: string | null; is_admin: boolean }>
> {
  const rows = await query<UserRow>(
    'SELECT id, email, access_until, is_admin FROM users ORDER BY access_until DESC',
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    access_until: r.access_until,
    is_admin: !!r.is_admin,
  }));
}

export async function setAccess(userId: string, until: string | null): Promise<void> {
  await query('UPDATE users SET access_until = ? WHERE id = ?', [until, userId]);
}

/** Removes the account and (via FK ON DELETE CASCADE) every job and session it had. */
export async function deleteUser(userId: string): Promise<void> {
  await query('DELETE FROM users WHERE id = ?', [userId]);
}

/* ---------- access ---------- */

export function hasAccess(p: Pick<Profile, 'is_admin' | 'access_until'>): boolean {
  if (p.is_admin) return true;
  return !!p.access_until && new Date(p.access_until).getTime() > Date.now();
}

/* ---------- jobs ---------- */

export interface JobRow {
  job_no: string;
  updated_at: string;
}

export async function listJobs(userId: string): Promise<JobRow[]> {
  return query<JobRow>('SELECT job_no, updated_at FROM jobs WHERE user_id = ? ORDER BY updated_at DESC', [
    userId,
  ]);
}

export async function loadJob(userId: string, jobNo: string): Promise<unknown | null> {
  const rows = await query<{ spec: string }>(
    'SELECT spec FROM jobs WHERE user_id = ? AND job_no = ? LIMIT 1',
    [userId, jobNo],
  );
  if (!rows.length) return null;
  const spec = rows[0].spec;
  return typeof spec === 'string' ? JSON.parse(spec) : spec;
}

export async function saveJob(userId: string, jobNo: string, spec: unknown): Promise<void> {
  await query(
    `INSERT INTO jobs (id, user_id, job_no, spec, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE spec = VALUES(spec), updated_at = NOW()`,
    [newId(), userId, jobNo, JSON.stringify(spec)],
  );
}

export async function deleteJob(userId: string, jobNo: string): Promise<void> {
  await query('DELETE FROM jobs WHERE user_id = ? AND job_no = ?', [userId, jobNo]);
}
