-- Panel Suite — step 4 of 4: the estimator's own settings, and the guard that
-- stops a profile update from granting itself access.
-- Run 01, 02 and 03 first. Paste the whole file into Supabase's SQL Editor and
-- press Run. No fences to trip over: select all, copy, run.

-- Phase 11/12 fields. 01-tables.sql already creates three of them on a fresh
-- database; these are here so a project made from an earlier copy is brought up
-- to date by running this one file.
--
-- The two `_script_url` columns are Apps Script Web Apps — the only thing that
-- can actually write to Google, because a folder or sheet URL on its own can be
-- read by anyone with the link but written by nobody. The two added here are
-- the TARGETS: which folder the files land in and which sheet the rows append
-- to. They are kept out of the script deliberately, so changing the folder is
-- editing one box in the app rather than redeploying the script.
alter table public.profiles
  add column if not exists drive_script_url text,
  add column if not exists sheet_script_url text,
  add column if not exists mail_from        text,
  add column if not exists drive_folder_url text,
  add column if not exists sheet_url        text;

-- ---------------------------------------------------------------------------
-- The hole this closes
--
-- `create policy "change own profile" for update using (auth.uid() = id)` is a
-- ROW level rule, and row level is the only level Postgres policies work at.
-- It says which rows you may update; it says nothing about which COLUMNS. So
-- any signed-in estimator could PATCH their own row with
--
--     { "is_admin": true }            or      { "access_until": "2099-01-01" }
--
-- and Postgres would allow it — the row is still theirs, so the policy is still
-- satisfied. Every check in the app sits behind `is_admin` and `has_access()`,
-- so that one request would have handed out the administrator's screen and a
-- permanent licence. Nothing in the app ever sent it; the anon key and a normal
-- session were enough to send it by hand.
--
-- Column privileges (`revoke update ... grant update (col, col)`) are the usual
-- fix, but they attach to the ROLE — and an administrator is `authenticated`
-- too, so revoking `access_until` from the role would take it from the admin
-- screen as well. A trigger can tell the two apart, and needs no change in the
-- app at all.
--
-- It raises rather than silently reverting. A legitimate save never touches
-- these columns, so it never fires; when it does fire, somebody is trying
-- something, and a quiet success is the worst answer to that.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- auth.uid() is null for the SQL editor, a service-key call and our own
  -- /api/admin/user — none of which come through row level security anyway.
  -- Skipping them is what keeps 02-access-and-admin.sql re-runnable.
  if auth.uid() is not null and not public.is_admin() then
    if new.access_until is distinct from old.access_until
       or new.is_admin  is distinct from old.is_admin
       or new.email     is distinct from old.email
       or new.id        is distinct from old.id then
      raise exception 'Only an administrator may change access or admin rights.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();
