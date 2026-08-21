# Setup — Supabase, Brevo aur Google

Ye guide un teen accounts ke liye hai jo login, email aur Google save ke liye
chahiye. Ek baar ka kaam hai. `DESIGN.md` ke Phase 9–12 isi par khade hain.

**Ek baat pehle:** mujhe aapki koi bhi **secret key dene ki zaroorat nahi hai**.
Har key aap khud Hostinger ke *Environment variables* me daalenge. Repo public
hai — usme koi key kabhi nahi jayegi.

Ek key galti se kahin bhej di jaye — chat me, message me, screenshot me — to
usse **badal dena hi sahi tareeka hai**. Brevo, Supabase, dono me key delete
karke nayi banana ek minute ka kaam hai, aur purani us pal se bekaar ho jaati
hai. Kaunsi key kaisi dikhti hai:

| Kaisi dikhti hai | Kya hai | Secret? |
|---|---|---|
| `eyJhbGci…` (lambi, teen hisso me) — role `anon` | Supabase anon key | nahi — browser me jaati hi hai |
| `eyJhbGci…` — role `service_role` | Supabase service key | **haan, sabse khatarnak** — RLS bypass karti hai |
| `xkeysib-…` | Brevo API key | **haan** |
| SMTP key | Brevo SMTP password | **haan** |

| Kya | Kis kaam ka | Kab chahiye |
|---|---|---|
| [Supabase](#a--supabase--login-aur-database) | Login + har user ka apna database | Phase 9, sabse pehle |
| [Brevo](#b--brevo--email) | Signup ki email verification, aur BOQ email bhejna | Phase 9 + 12 |
| [Google Apps Script](#c--google--drive-folder-aur-sheet) | Drive me PDF, Sheet me BOQ | Phase 11 |

---

## A — Supabase — login aur database

### A1. Project banaiye

1. [supabase.com](https://supabase.com) par account banaiye (GitHub se login ho
   jayega).
2. **New project**:
   - **Name** — `panel-suite`
   - **Database password** — strong rakhiye aur **kahin likh kar rakhiye**,
     dobara nahi dikhega
   - **Region** — **Mumbai / ap-south-1**, kyunki users India me hain
3. Project ban-ne me 2–3 minute lagte hain.

### A2. Do value nikaliye

**Project Settings → API**:

| Kya | Kaisa dikhta hai | Ye kya hai |
|---|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` | secret nahi |
| **Project ID / ref** | `abcdefgh` | URL ka hi hissa — URL hamesha `https://<project-id>.supabase.co` hota hai, to ek mil jaye to doosra bhi mil gaya |
| **anon / public key** | lamba `eyJ...` token | **secret nahi** — ye browser me jaana hi hota hai, RLS iski hifazat karta hai |
| ~~service_role key~~ | lamba `eyJ...` token | **ye kabhi kisi ko mat dijiye** — ye saari security bypass karti hai. Na browser me, na repo me, na chat me |

Pehli do Hostinger me daalni hain (neeche batata hoon). Teesri ko haath mat
lagaiye.

### A3. Tables banaiye — SQL paste kar dijiye

Supabase me **SQL Editor** kholiye, **New query**, ye paste karke **Run**.

> **Sabse aasan raasta: repo ka `sql/` folder.** Wahan yahi SQL alag files me
> hai — `01-tables.sql`, `02-access-and-admin.sql`, `03-make-admin.sql`,
> `04-profile-fields.sql` — aur unme **koi fence nahi hai**. File kholiye, sab
> select kijiye, copy, Run. Kram se chalaiye, 01 se 04 tak.
>
> **`04-profile-fields.sql` chalana zaroori hai**, aur sirf naye columns ke liye
> nahi. Wo ek asli chhed band karta hai: `profiles` ka update policy row-level
> hai, column-level nahi — yaani koi bhi signed-in user apni hi row me
> `is_admin: true` ya `access_until: 2099` PATCH kar sakta tha, aur Postgres
> maan leta, kyunki row to unki apni hi hai. App ne wo request kabhi bheji nahi,
> par haath se bhejna mushkil nahi tha. 04 wala trigger use rok deta hai.
>
> Yahan neeche se copy karein to ` ``` ` wali pehli aur aakhri line **chhod
> dijiye** — wo markdown ka nishaan hai, SQL nahi. Ye do baar phansa chuka hai,
> aur dhyan dene layak baat ye hai: **Postgres poori script pehle padhta hai**,
> to ek bhi galat line ka matlab hai **kuch bhi nahi chala** — aadha nahi, kuch
> bhi nahi.

```sql
-- har user ka profile: uske Drive/Sheet URLs yahan rahenge
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  drive_script_url text,
  sheet_script_url text,
  mail_from    text,
  created_at   timestamptz not null default now()
);

-- save kiye hue job. spec wahi JobSpec hai jo form bhejta hai.
-- BOQ save nahi hoti — wo hamesha generate hoti hai, warna purana job aur naya
-- job ek din alag-alag bolne lagenge.
create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  job_no     text not null,
  spec       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_no)
);

create index jobs_user_idx on public.jobs (user_id, job_no);

-- Row Level Security — YAHI wo cheez hai jo "har user sirf apna data dekhe"
-- ko sach banati hai. Ye database khud lagu karta hai, app ka vaada nahi hai.
alter table public.profiles enable row level security;
alter table public.jobs     enable row level security;

create policy "apna hi profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "apne hi job" on public.jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- signup hote hi profile ki row apne aap ban jaye
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Row Level Security sabse zaroori line hai.** Uske bina har user sabka data
padh sakta hai, chahe app kitni bhi sahi likhi ho. Isse skip mat kijiyega.

Chalne par neeche `Success. No rows returned` aayega. Phir **Table Editor** me
`profiles` aur `jobs` dono dikhne chahiye, dono par **RLS enabled** ke saath.

Ye SQL **aapko hi chalana hai**. Table banane ke liye dashboard login ya database
password chahiye — anon key se sirf wahi ho sakta hai jo ek aam browser kar sakta
hai, jo theek bhi hai.

### A3b. Admin, trial aur access — doosra SQL

Ye pehle wale ke **baad** chalaiye. Isse teen cheezein aati hain: naye user ko
**14 din ka trial**, ek **admin** jo sabka access badha/ghata sake, aur ye ki
**access khatam hone par database khud rok de** — sirf screen par nahi.

```sql
-- kis tareekh tak access hai, kaun admin hai, aur email (admin ko list me
-- dikhane ke liye — auth.users me hai par wahan se padha nahi ja sakta)
alter table public.profiles
  add column if not exists access_until timestamptz,
  add column if not exists is_admin     boolean not null default false,
  add column if not exists email        text;

-- naye user ko 14 din. Badalna ho to yahi ek number badliye.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, access_until)
  values (new.id, new.email, now() + interval '14 days');
  return new;
end;
$$;

-- purane user (jo pehle se bane hain) ko bhi email aur trial de dijiye
update public.profiles p
   set email = u.email,
       access_until = coalesce(p.access_until, now() + interval '14 days')
  from auth.users u
 where u.id = p.id;

/*
 * Ye do function `security definer` hain — yaani ye RLS ke bahar chalte hain.
 * Ye zaroori hai: agar policy khud `profiles` ko padhegi to Postgres usi policy
 * ko dobara lagayega aur infinite recursion me phans jayega. Ye Supabase ki
 * sabse aam galti hai.
 */
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

-- profiles: apni row hamesha, aur admin ko sabki
drop policy if exists "apna hi profile" on public.profiles;

create policy "apni profile padho" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "apni profile badlo" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- sirf admin kisi aur ki row badal sakta hai (access_until yahin se badlega)
create policy "admin sabki profile badle" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

/*
 * jobs: apne hi job, AUR access chalu hona chahiye.
 * Access ki jaanch YAHAN hai, screen par nahi — screen par lagi rok ek
 * guzarish hoti hai, database ki rok asli hoti hai.
 */
drop policy if exists "apne hi job" on public.jobs;

create policy "apne hi job, access rehte hue" on public.jobs
  for all using (auth.uid() = user_id and public.has_access())
  with check (auth.uid() = user_id and public.has_access());
```

Ab **admin banaiye** — ye alag se, taaki naam saaf dikhe:

```sql
update public.profiles
   set is_admin = true,
       access_until = now() + interval '100 years'
 where email = 'nantultiwari697@gmail.com';
```

> Ye tabhi chalega jab us email se **ek baar sign up ho chuka ho** — profile row
> signup par hi banti hai. Pehle us email se account bana lijiye, phir ye chalaiye.
> Chalne par `UPDATE 1` aana chahiye; `UPDATE 0` aaya matlab wo account abhi hai
> hi nahi.

### A4. Email confirmation on kijiye

**Authentication → Providers → Email**:

- **Enable Email provider** — on
- **Confirm email** — **on** (aapne yahi maanga hai: verify karke hi login)

### A4b. OTP — link ki jagah 6-digit code

Aapne kaha ki verification **OTP se** ho, link se nahi. Supabase ki email me
dono bheje ja sakte hain; badalna sirf template me hai.

**Authentication → Emails → Templates → Confirm signup** kholiye aur uska
matn badal kar ye kar dijiye:

```html
<h2>Panel Suite</h2>
<p>Aapka verification code:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>Ye code 1 ghante me expire ho jayega. Aapne signup nahi kiya to is email ko
   nazarandaz kar dijiye.</p>
```

`{{ .Token }}` hi wo 6-digit code hai. `{{ .ConfirmationURL }}` hata dijiye —
app ab code maangti hai, link nahi.

> **Ek faayda saath me:** link `Site URL` par nirbhar karta hai, jo is setup me
> teen baar phansa chuka hai. Code kisi URL par nirbhar nahi karta, to wo poori
> dikkat hi khatam ho jaati hai.

> **Signup test karne se pehle Brevo SMTP laga lijiye (Part B).** Supabase ka
> apna default mailer **ghante me sirf 3–4 email** bhejta hai aur production ke
> liye hai hi nahi — bina Brevo ke signup to ho jayega, par **confirmation email
> shayad kabhi na aaye**, aur bina us link ke login nahi hoga. Ye "kuch hua hi
> nahi" wali soorat hai; asli wajah yahi hoti hai.

Ek aur baat jo waqt bachayegi: Supabase **nakli domain reject karta hai**.
`@example.com` jaise pate par `email_address_invalid` milega. Test ke liye apna
asli email hi use kijiye.

### A4. SQL chali ya nahi — teen check

> **Pehle ye samajh lijiye ki kya kahan chalta hai.** Sirf **Check 2** SQL hai
> aur Supabase SQL Editor me jaata hai. **Check 1 PowerShell hai** — wo aapke
> apne terminal me chalta hai, aur **Check 3 JavaScript hai** — wo browser ke
> console me. Check 1 ko SQL Editor me paste karne se
> `syntax error at or near "$"` aata hai; ye ho chuka hai, aur galti command ki
> nahi, usse galat jagah chalane ki hai.

**Check 1 — naye columns aa gaye? (PowerShell, apne terminal me)**

Koi credential nahi chahiye: anon key `/api/config` se aati hai, jo public hai
hi — wo project ka naam batati hai, kisi vyakti ka nahi.

```powershell
$cfg = Invoke-RestMethod "https://panelsuite.online/api/config"
$url = $cfg.supabase.url; $key = $cfg.supabase.anonKey
foreach ($col in @('drive_folder_url','sheet_url')) {
  try {
    Invoke-RestMethod "$url/rest/v1/profiles?select=$col&limit=1" -Headers @{ apikey = $key } | Out-Null
    "   $col -> EXISTS"
  } catch { "   $col -> MISSING" }
}
```

Dono `EXISTS` chahiye. 04 chalne se pehle dono `MISSING` bolte hain — isi se
pata chalta hai ki check sach me kuch naap raha hai.

**Check 2 — trigger laga? (SQL, Supabase SQL Editor me)**

```sql
select tgname from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;
```

`profiles_guard_privileges` dikhna chahiye.

**Check 3 — chhed sach me band hua? (JavaScript, browser console me)**

> **SQL Editor se ye test mat kijiye.** Wahan `auth.uid()` null hota hai aur
> trigger us haalat me jaan-boojh kar skip karta hai (warna service key aur 02
> ka backfill toot jaate). To SQL Editor me `update profiles set is_admin = true`
> **chal jayega** — aur bilkul aisa lagega jaise fix fail ho gaya. Wo galat
> nateeja hai.

panelsuite.online par signed in rehte hue, console me:

```js
const s = JSON.parse(localStorage.getItem('panelcalc.session'));
const cfg = await (await fetch('/api/config')).json();
const r = await fetch(`${cfg.supabase.url}/rest/v1/profiles?id=eq.${s.user.id}`, {
  method: 'PATCH',
  headers: { apikey: cfg.supabase.anonKey, Authorization: `Bearer ${s.access_token}`,
             'content-type': 'application/json' },
  body: JSON.stringify({ access_until: '2099-01-01T00:00:00Z' }),
});
console.log(r.status, await r.text());
```

*Only an administrator may change access or admin rights.* aana chahiye. `204`
aaya to 04 nahi lagi.

**Ye sirf 04 chalane ke baad chalaiye.** Pehle chalayenge to request sach me
kaam kar jayegi — yaani aap wahi escalation kar denge jo band karni thi.

Aur ise **kisi normal account se** kijiye. Trigger administrator ko chhoot deta
hai, isliye admin ke account par ye hamesha pass ho jayega aur kuch sabit nahi
karega.

---

## B — Brevo — email

Brevo do kaam karega:

1. **Supabase ki verification email bhejega** (SMTP ke through)
2. **BOQ + drawing wali email bhejega** (API ke through, Phase 12 me)

### Brevo se login nahi hota — ye baat pehle saaf kar lijiye

**Brevo ek email bhejne wali service hai, login wali nahi.** Uske paas users ka
database hai hi nahi — na password, na session, na koi "sign in". Login ke liye
jo chahiye (user record, password hash, session token, refresh, forgot password)
wo sab **Supabase Auth** karta hai.

Aur **email pehle se hi Brevo se hi jaati hai** — "Custom SMTP" ka matlab hi
yahi hai. Naam me Brevo nahi likha, isliye lagta hai Supabase bhej raha hai:

| Kaam | Kaun |
|---|---|
| Account, password, session | **Supabase** |
| Email ka matn banana | Supabase |
| **Email sach me bhejna** | **Brevo** |
| Kis pate se | `info@panelsuite.online` — aapka domain |
| Kiska quota, kiska log | **Brevo ka** |

Estimator ko email aapke apne pate se aati dikhegi; Supabase ka naam kahin nahi
aata.

> Brevo ka **API** use karna ho (SMTP ke bajaye) to Supabase me **Auth Hooks →
> Send Email Hook** se ho sakta hai. Bhejta usme bhi Brevo hi hai, quota bhi
> wahi — faayda sirf template par zyada control. SMTP 5 minute ka kaam hai, wo
> naya code maangta hai. Isliye SMTP se shuru kijiye; hook baad me bhi lag sakta
> hai, tab tak login chalu rahega.

### B0. Is project ka apna Brevo account

**Is project ke liye alag Brevo account banaya gaya hai** (17 August 2026),
kisi maujooda account me ek aur domain jodne ke bajaye. Wajah quota hai: free
plan ka **300 email/din poore account ka saanjha** hota hai. Us account se agar
marketing campaign bhi jaati ho, to ek blast quota kha jaata hai — aur us din
**koi estimator login hi nahi kar paata**, kyunki confirmation email hi nahi
jaati. **Login email kisi doosre kaam ki marketing par nahi tik sakti.**

Brevo ko har account ke liye alag email chahiye, to register bhi alag pate se
hua hai.

Is project ka domain **`panelsuite.online`** hai (Hostinger par, 17 August 2026
liya gaya), aur sender **`info@panelsuite.online`**.

### B1. Sender — seedha domain authenticate kijiye

Brevo do tareeke deta hai. **Yahan domain wala hi chalega**, aur wajah jaan
lena zaroori hai:

> **Single sender verify karne ke liye us pate par email *aani* chahiye.**
> Brevo us address par ek link bhejta hai. Domain naya hai aur uspar abhi koi
> mailbox nahi hai, to wo email kahin nahi pahunchegi aur sender kabhi verify
> nahi hoga. **Domain authentication me mailbox ki zaroorat hi nahi** — sirf DNS
> chahiye, jo aapke paas hai. Isliye seedha yahi kijiye.

1. **Settings → Senders, domains, IPs → Domains → Add a new domain**
   → `panelsuite.online`
2. Brevo teen TXT record dega — ek **verification code**, ek **DKIM**
   (`mail._domainkey`), ek **DMARC** (`_dmarc`)
3. **hPanel → Domains → `panelsuite.online` → DNS / Nameservers** me teeno
   daaliye
4. Brevo me wapas **Authenticate** dabaiye. 15 minute se kuch ghante lagte hain
5. Ho jaye to **Senders → Add a sender** me `info@panelsuite.online` daal
   dijiye — authenticated domain ka koi bhi pata bina alag verification ke
   chalta hai

> Domain authenticate hone tak signup ki email nahi jayegi. Wo intezaar DNS ka
> hai, kisi setting ka nahi.

### B2. SMTP credentials — Supabase ke liye

> **Brevo me do alag key hoti hain, aur ye aksar ulti pakdi jaati hai.**
>
> | Key | Kis tab par | Kis kaam ki |
> |---|---|---|
> | **SMTP key** | `SMTP` | Supabase ki auth email — **abhi yahi chahiye** |
> | **API key** (`xkeysib-…`) | `API keys & MCP` | Phase 12, jab app khud email bhejegi |
>
> Supabase ke SMTP form me API key daalne se wo kabhi kaam nahi karega.

**Brevo → SMTP & API → SMTP** tab. Upar *Your SMTP Settings* me teen cheezein
pehle se likhi hoti hain — wahi Supabase me jaani hain:

| Brevo par likha | Supabase me |
|---|---|
| SMTP Server `smtp-relay.brevo.com` | Host |
| Port `587` | Port number |
| **Login** `b5c3fe001@smtp-brevo.com` jaisa | **Username** ← ye dhoondhna padta hai |

Password alag banani padti hai: usi tab par neeche *Your SMTP Keys* ki list
khaali hoti hai aur **"Click here to generate an SMTP key"** likha hota hai.
Wahi key Supabase ka **Password** hai — **ek hi baar dikhti hai**, turant copy
kar lijiye.

Ab **Supabase → Project Settings → Authentication → SMTP Settings**:

- **Enable Custom SMTP** — on
- **Sender email** — `info@panelsuite.online` (wahi jo Brevo me verify kiya — dusra pata
  daalne par Brevo bhejne se mana kar dega)
- **Sender name** — `Panel Suite`
- **Host** — `smtp-relay.brevo.com` · **Port** — `587`
- **Username / Password** — upar wale

Save. Ab signup par verification email Brevo se jayegi, aur limit khatam nahi
hogi.

### B4. Site URL — ye chhoot jaata hai, aur phir "link kaam nahi karta"

Confirmation email ka link user ko **kahan bhejega**, ye Supabase ki apni setting
tay karti hai — aur uski default `http://localhost:3000` hoti hai. Theek na ki
to link click karne par estimator ek marey hue page par pahunchega, aur lagega
ki signup toota hua hai.

**Supabase → Authentication → URL Configuration**:

| | |
|---|---|
| **Site URL** | **`https://panelsuite.online`** |
| **Redirect URLs** | wahi, `https://aqua-finch-257417.hostingersite.com`, aur test ke liye `http://127.0.0.1:5173` |

Redirect URLs me ek se zyada rakh sakte hain, to temporary aur asli dono daal
dijiye — phir domain badalne par link kabhi nahi tootega.

> **Site URL alag cheez hai, aur wahi chhoot jaati hai.** Redirect URLs sahi
> hone se kaam nahi banta: link *kahan bhejega* ye Site URL tay karti hai, aur
> uski default `http://localhost:3000` hai. Wo rah gayi to signup hoga, email
> jayegi, aur link ek aisi machine par jayega jahan kuch chal hi nahi raha.

### B3. API key — app ki apni email ke liye

**Brevo → SMTP & API → API Keys → Generate a new API key**. Naam `panel-suite`.
Key ek hi baar dikhegi — copy karke rakhiye.

Ye **asli secret hai**. Ise **sirf Hostinger ke Environment variables** me
daaliye. Mujhe bhejne ki zaroorat nahi — main code aise likhunga ki wo
`BREVO_API_KEY` environment se khud padh le.

---

## C — Google — Drive folder aur Sheet

> **⚠️ Ye hissa 18 August ko badal gaya — abhi ise mat kijiye.**
>
> Neeche jo Apps Script wala tareeka likha hai, wo **ab nahi banaya ja raha**.
> Shop ne kaha: estimator sirf **do link** daale, aur file ek ID ke saath Editor
> me share ho — har estimator ka apna script deploy karna nahi.
>
> Usme se ek baat sahi hai aur ek nahi:
>
> - **"Public kar denge" se kaam nahi chalega.** *Anyone with the link — Editor*
>   se **insaan browser me** edit kar sakta hai; server nahi. Google ka har
>   likhne wala API credential maangta hai, link chahe jitna khula ho.
> - **"Ek ID ke saath Editor me share"** bilkul sahi hai — uska naam **service
>   account** hai.
>
> **Par service account ka apna Drive storage quota nahi hota**, isliye wo normal
> Drive folder me file nahi bana sakta (`storageQuotaExceeded`). Shared Drive se
> ye theek ho jaata hai, par uske liye paid Google Workspace chahiye — aur aapke
> paas normal Gmail hai.
>
> **Isliye Phase 11 ab "Sign in with Google" hoga:** profile me ek baar apna
> Google account connect kijiyega, aur server aapke naam par file rakhega — file
> aapki, quota aapka, folder aapka. Sheet bhi usi se chalegi.
>
> Ye abhi bana nahi hai. Jab banega, iske steps yahin likhe jayenge. Tab tak
> **My settings me sirf do link daaliye** — Drive folder aur Google Sheet —
> aur Excel/PDF button se file download karke email me khud attach kar lijiye.
> Poori wajah `DESIGN.md` me "Phase 11 rewritten" me hai.

Neeche wala tareeka **fallback ke taur par rakha gaya hai**, hataya nahi —
`tools/apps-script/panel-suite.gs` kaam karta hai, aur agar OAuth verification
kabhi rukavat bani to yahi raasta bachega.

Yaad rahe: **sirf URL se Google me kuch likha nahi ja sakta.** Isliye aap apni
hi Sheet me ek chhoti script deploy karenge — wo aapke apne account me chalegi,
aur is repo ke paas Google ka koi credential kabhi nahi aayega.

### C1. Folder aur Sheet banaiye

1. Drive me ek folder banaiye, jaise **`Panel Suite — Jobs`**.
   Uska poora URL copy kar lijiye — kuch aisa:
   `https://drive.google.com/drive/folders/1AbCdEf...`
2. Ek Google Sheet banaiye, jaise **`Panel Suite — BOQ`**. Uska URL bhi copy
   kar lijiye.

Dono URL tool ke **My settings** me paste honge. Folder ID script ke andar
**nahi** likhna — wo request ke saath jaata hai, taaki baad me folder badalna
sirf ek box edit karna ho, script dobara deploy karna na pade.

### C2. Script paste kijiye

Script repo me hai: **`tools/apps-script/panel-suite.gs`**. Use kholiye, poora
copy kijiye.

Yahan wo dobara nahi likha gaya hai — jaan-boojh kar. Do copies hamesha alag ho
jaati hain, aur jo chalti hai wo wahi hoti hai jise kisi ne edit nahi kiya. Wahi
wajah hai jisse app ka guide bhi `GUIDE.md` ko render karta hai, uski nakal nahi
rakhta.

Us Sheet me **Extensions → Apps Script** kholiye, jo pehle se likha hai sab
hata dijiye, aur file ka content paste kar dijiye. Kuch badalna nahi hai.

### C3. Web app ki tarah deploy kijiye

**Deploy → New deployment**:

- **Type** — gear icon → **Web app**
- **Execute as** — **Me** (yahi wo cheez hai jisse likhne ki permission milti hai)
- **Who has access** — **Anyone**
- **Deploy** → Google permission maangega → **Allow**

Jo URL milega (`…/exec` par khatam hota hai) wo copy kar lijiye. Wahi tool me
**account menu → My settings → Apps Script Web App link** me daalna hai, saath
me C1 wale folder aur sheet ke URL.

> Teeno links Google ke hain aur teeno alag kaam karte hain — sabse aam galti
> folder ka link script wale box me paste kar dena hai. Screen bata degi ki wo
> jo maanga tha wo nahi lagta, par rokegi nahi: jo type kiya wahi save hota hai.

> **Who has access: Anyone** ka matlab hai jiske paas URL hai wo is script ko
> chala sakta hai. Isliye **ye URL ek secret ki tarah rakhiye** — kisi ke saath
> share mat kijiye.

---

## D — Hostinger me kya-kya daalna hai

Sab kuch ho jaye to **hPanel → Deployments → Settings and redeploy →
Environment Variables** me:

| Key | Value | Secret? | Kab se chahiye |
|---|---|---|---|
| `HOST` | `0.0.0.0` | nahi | pehle se laga hai |
| `SUPABASE_URL` | `https://kyzexsarilxkzwkntode.supabase.co` | nahi | **ab — login isi se chalega** |
| `SUPABASE_ANON_KEY` | anon / public key | nahi — browser me jaati hi hai | **ab** |
| `SUPABASE_SERVICE_KEY` | Supabase ki **service_role** key | **haan — sabse khatarnak** | sirf "user delete" ke liye |
| `BREVO_API_KEY` | Brevo API key | **haan — kisi ko mat dijiye** | **ab — Email button isi se chalega** |
| `MAIL_FROM` |  `info@panelsuite.online` | nahi | **ab** |

> **Email button ke liye ye dono zaroori hain.** Ek bhi na ho to server saaf
> keh deta hai — `/api/config` `mail:false` bhejta hai aur button khud bata deta
> hai ki kya nahi laga. Chupchap fail nahi hota. Key kabhi browser me nahi
> jaati; isi wajah se `/api/mail` server par hai.

> **`SUPABASE_SERVICE_KEY` sirf tab daaliye jab admin ko user *delete* karna
> ho.** Wo key har policy ko bypass karti hai, isliye wo **kabhi browser me
> nahi jaati** — server use rakhta hai aur use karne se pehle jaanchta hai ki
> maangne wala sach me admin hai. Na daali jaye to sab kuch chalta hai, bas
> Delete button keh dega ki wo set nahi hai; **Stop** phir bhi kaam karta hai
> aur rozana ke liye wahi kaafi hai.

Phir **Save and redeploy**.

Ye do na daale jaayein to bhi calculator poora chalta hai — bas account panel
keh dega ki accounts set nahi hain, aur Save kaam nahi karega. Engine hi asli
cheez hai; account uske upar ki suvidha hai, uske aage ka darwaza nahi.

Local par test karna ho to repo me `.env` file bana lijiye (wo gitignored hai)
aur `node --env-file=.env app.cjs` chalaiye — Node khud padh leta hai, koi
package nahi chahiye.

---

## E — Ab kya bacha hai

**Login ban chuka hai** aur Supabase se juda hua hai. Ab kram se ye:

1. **Hostinger me `SUPABASE_URL` aur `SUPABASE_ANON_KEY` daal kar redeploy** —
   iske bina live site par account panel kahega ki accounts set nahi hain.
2. **Brevo SMTP laga dijiye** (Part B) — iske bina signup ki confirmation email
   shayad na aaye, aur bina us link ke login nahi hoga.
3. Phir apne email se **sign up → email me link → sign in → Save**. Ek job save
   karke doosre account se dekhiye — dikhna nahi chahiye. Wahi asli test hai.

4. ✅ **`04-profile-fields.sql`** — 18 August ko live project par chal chuki
   hai. Profile ke naye columns aa gaye aur wo trigger lag gaya jo access/admin
   ko apne aap badalne se rokta hai. Part A4 ke check se pakka kiya gaya.
5. **`BREVO_API_KEY` aur `MAIL_FROM` Hostinger me daaliye** — Email button ban
   chuka hai (18 August) aur bas inhi do ka intezaar hai. Inke bina button khud
   keh dega ki wo band hai.
6. Phir **My settings** kholiye aur do link daal dijiye — Drive folder aur
   Google Sheet. Ye Phase 11 ke liye hain, jo abhi bana nahi hai (Part C ka
   warning padh lijiye).

**Brevo ka domain verification aaj hi shuru kar dijiye** agar baaki hai — DNS
failne me ghante lagte hain, aur wo intezaar baaki kaam ke saath chal jayega.

### Email kis address se jayega — ek shart jo pehle jaan lena behtar hai

Brevo kisi bhi address se nahi bhejta — sirf us se jise aap **prove** kar sakein
ki aapka hai. `panelsuite.online` verified hai, isliye `info@panelsuite.online`
bina kisi setup ke chalta hai.

Estimator apni khud ki ID (jaise `@gmail.com`) se bhejna chahe to Brevo me
**Senders → Add a sender** karke us address ko verify karna hoga — Brevo ek
confirmation mail bhejta hai, link click. Uske bina Brevo request hi reject kar
dega.

Dono soorat me **Reply-To hamesha estimator ki apni ID** rahegi, isliye customer
ka jawab seedha unke paas aayega.
