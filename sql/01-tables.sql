-- Panel Suite — step 1 of 3: the two tables and their row level security.
-- Paste the whole file into Supabase's SQL Editor and press Run.
--
-- These files exist because copying SQL out of a Markdown code block twice
-- brought the ``` fence with it, and Postgres parses a whole script before it
-- runs any of it — so one stray line means nothing at all happened. There are
-- no fences here. Select all, copy, run.

-- one profile per user; their Drive/Sheet URLs will live here later
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  drive_script_url text,
  sheet_script_url text,
  mail_from    text,
  created_at   timestamptz not null default now()
);

-- a saved job. `spec` is the JobSpec the form posts, stored whole.
-- The BOQ is never stored: it is generated, and a stored figure is how a saved
-- job and a fresh one start to disagree.
create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  job_no     text not null,
  spec       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_no)
);

create index if not exists jobs_user_idx on public.jobs (user_id, job_no);

-- Row level security is what makes "each user sees only their own" true.
-- The database enforces it; the app only reflects it.
alter table public.profiles enable row level security;
alter table public.jobs     enable row level security;

-- a profile row appears the moment somebody signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
