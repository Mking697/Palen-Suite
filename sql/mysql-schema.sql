-- Panel Suite — MySQL schema, for Hostinger's own database.
--
-- Replaces sql/01-tables.sql, 02-access-and-admin.sql, 03-make-admin.sql and
-- 04-profile-fields.sql, all of which were Postgres/Supabase and are kept
-- only as a record of what this replaced. There is no Supabase project
-- behind this app anymore — see server/auth.ts and SETUP.md.
--
-- Run this once, in Hostinger's phpMyAdmin (or any MySQL client) against the
-- database you created in hPanel → Databases → MySQL Databases.
--
-- What Postgres did with row level security, this file does not do at the
-- database level at all — MySQL (and the plain shared-hosting tier Hostinger
-- gives you) has no equivalent. Every query in server/auth.ts that reads or
-- writes `jobs`, or a non-admin read of `users`, carries its own
-- `WHERE user_id = ?` / `WHERE id = ?` by hand. That discipline in the
-- application code is the whole replacement for RLS here — there is no
-- second line of defence in the schema if a query ever forgets it.

CREATE TABLE IF NOT EXISTS users (
  id                 CHAR(32)      NOT NULL PRIMARY KEY,
  email              VARCHAR(255)  NOT NULL UNIQUE,
  password_hash      VARCHAR(255)  NOT NULL,
  email_verified     TINYINT(1)    NOT NULL DEFAULT 0,
  is_admin           TINYINT(1)    NOT NULL DEFAULT 0,
  access_until       DATETIME      NULL,
  display_name       VARCHAR(255)  NULL,
  drive_folder_url   VARCHAR(1024) NULL,
  sheet_url          VARCHAR(1024) NULL,
  mail_from          VARCHAR(255)  NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- one unused code per email at a time — issuing a new one deletes the old
CREATE TABLE IF NOT EXISTS otps (
  email      VARCHAR(255) NOT NULL PRIMARY KEY,
  code_hash  CHAR(64)     NOT NULL,
  expires_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- bearer session tokens, sliding 30-day expiry (see userFromRequest)
CREATE TABLE IF NOT EXISTS sessions (
  token      CHAR(64)  NOT NULL PRIMARY KEY,
  user_id    CHAR(32)  NOT NULL,
  expires_at DATETIME  NOT NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sessions_user ON sessions (user_id);

-- one saved job per (user, job number); spec is the JobSpec the form posts,
-- stored whole. The BOQ is never stored — it is always generated, exactly as
-- the Supabase table's own comment said: a stored figure is how a saved job
-- and a fresh one start to disagree.
CREATE TABLE IF NOT EXISTS jobs (
  id         CHAR(32)     NOT NULL PRIMARY KEY,
  user_id    CHAR(32)     NOT NULL,
  job_no     VARCHAR(255) NOT NULL,
  spec       JSON         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_jobs_user_jobno (user_id, job_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_jobs_user ON jobs (user_id, job_no);

-- make yourself admin once you have signed up and verified your email:
--
-- UPDATE users SET is_admin = 1, access_until = DATE_ADD(NOW(), INTERVAL 100 YEAR)
-- WHERE email = 'you@example.com';
