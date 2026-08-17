-- Panel Suite — step 3 of 3: make somebody the administrator.
--
-- Run this ONLY AFTER that person has signed up, because the profile row is
-- created by the signup itself. `UPDATE 1` means it worked; `UPDATE 0` means
-- there is no account with that address yet — sign up first, then run this.
--
-- To hand the tool to somebody else later, change the address and run it again.

update public.profiles
   set is_admin = true,
       access_until = now() + interval '100 years'
 where email = 'nantultiwari697@gmail.com';

-- Check it: this should list the administrator and nobody else.
select email, is_admin, access_until
  from public.profiles
 where is_admin;
