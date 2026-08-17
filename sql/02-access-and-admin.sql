-- Panel Suite — step 2 of 3: trial access, an administrator, and the policies
-- that enforce both. Run 01-tables.sql first.
--
-- Paste the whole file into Supabase's SQL Editor and press Run. No fences to
-- trip over: select all, copy, run.

alter table public.profiles
  add column if not exists access_until timestamptz,
  add column if not exists is_admin     boolean not null default false,
  add column if not exists email        text;

-- Every new account gets 14 days. To change the trial, change this one number.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, access_until)
  values (new.id, new.email, now() + interval '14 days');
  return new;
end;
$$;

-- Accounts that already existed get their email filled in and the same trial,
-- so nobody is stranded by the order these steps were run in.
update public.profiles p
   set email = u.email,
       access_until = coalesce(p.access_until, now() + interval '14 days')
  from auth.users u
 where u.id = p.id;

-- These two are `security definer` on purpose: they run outside row level
-- security. A policy on `profiles` that reads `profiles` would send Postgres
-- into infinite recursion applying the same policy to its own lookup, which is
-- the most common way to get this wrong on Supabase.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.has_access()
returns boolean language sql security definer stable set search_path = '' as $$
  select coalesce(
    (select p.is_admin or (p.access_until is not null and p.access_until > now())
       from public.profiles p where p.id = auth.uid()),
    false);
$$;

-- profiles: your own row always, and every row for an administrator
drop policy if exists "apna hi profile"         on public.profiles;
drop policy if exists "apni profile padho"      on public.profiles;
drop policy if exists "apni profile badlo"      on public.profiles;
drop policy if exists "admin sabki profile badle" on public.profiles;

create policy "read own profile, admin reads all" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "change own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- only an administrator may change somebody else's row; access_until is set here
create policy "admin changes any profile" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- jobs: your own, and only while your access is live.
-- The check is HERE, not on the screen. A rule in a browser is a suggestion;
-- a rule in the database is the rule.
drop policy if exists "apne hi job"                 on public.jobs;
drop policy if exists "apne hi job, access rehte hue" on public.jobs;

create policy "own jobs, while access lasts" on public.jobs
  for all using (auth.uid() = user_id and public.has_access())
  with check (auth.uid() = user_id and public.has_access());
