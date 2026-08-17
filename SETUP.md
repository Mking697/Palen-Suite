# Setup — Supabase, Brevo aur Google

Ye guide un teen accounts ke liye hai jo login, email aur Google save ke liye
chahiye. Ek baar ka kaam hai. `DESIGN.md` ke Phase 9–12 isi par khade hain.

**Ek baat pehle:** mujhe aapki koi bhi **secret key dene ki zaroorat nahi hai**.
Har key aap khud Hostinger ke *Environment variables* me daalenge. Repo public
hai — usme koi key kabhi nahi jayegi.

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
   - **Name** — `hikom-panel-suite`
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

> **Copy karte waqt ` ``` ` wali lines chhod dijiye.** Wo markdown ka code block
> dikhane ka nishaan hain, SQL nahi. Galti se aa gayin to Run karte hi syntax
> error milega — pehli aur aakhri line delete kar dijiye, baaki sab theek hai.

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

### A4. Email confirmation on kijiye

**Authentication → Providers → Email**:

- **Enable Email provider** — on
- **Confirm email** — **on** (aapne yahi maanga hai: verify karke hi login)

Abhi Supabase apne default email se bhejta hai, jo **ghante me sirf 3–4 email**
bhejta hai aur production ke liye nahi hai. Isliye ab Brevo.

---

## B — Brevo — email

Brevo do kaam karega:

1. **Supabase ki verification email bhejega** (SMTP ke through)
2. **BOQ + drawing wali email bhejega** (API ke through, Phase 12 me)

### B1. Account aur sender

1. [brevo.com](https://www.brevo.com) par free account (300 email/din — kaafi hai).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain** → `hikom.in`
3. Brevo teen DNS record dega — **DKIM**, **DMARC**, aur ek verification record.
   Inhe `hikom.in` ke DNS me daaliye (Hostinger me hi domain ho to
   **Domains → DNS Zone**).
4. Verify dabaiye. DNS failne me 15 minute se kuch ghante lag sakte hain.

> **Domain verify kyun?** Bina iske aapki email spam me jaayegi ya bounce hogi.
> Jaldi test karna ho to **Senders → Add a sender** se sirf ek email address
> (jaise `info@hikom.in`) verify kar lijiye — us par ek link aayega. Domain baad
> me kar lijiyega.

### B2. SMTP credentials — Supabase ke liye

**Brevo → SMTP & API → SMTP** tab:

| | |
|---|---|
| Server | `smtp-relay.brevo.com` |
| Port | `587` |
| Login | aapka Brevo login, jaise `8xxxxx@smtp-brevo.com` |
| Password | **Generate a new SMTP key** dabakar jo mile |

Ab **Supabase → Project Settings → Authentication → SMTP Settings**:

- **Enable Custom SMTP** — on
- **Sender email** — `info@hikom.in` (wahi jo verify kiya)
- **Sender name** — `Hikom Panel Suite`
- **Host** — `smtp-relay.brevo.com` · **Port** — `587`
- **Username / Password** — upar wale

Save. Ab signup par verification email Brevo se jayegi, aur limit khatam nahi
hogi.

### B3. API key — app ki apni email ke liye

**Brevo → SMTP & API → API Keys → Generate a new API key**. Naam `panel-suite`.
Key ek hi baar dikhegi — copy karke rakhiye.

Ye **asli secret hai**. Ise **sirf Hostinger ke Environment variables** me
daaliye. Mujhe bhejne ki zaroorat nahi — main code aise likhunga ki wo
`BREVO_API_KEY` environment se khud padh le.

---

## C — Google — Drive folder aur Sheet

Yaad rahe: **sirf URL se Google me kuch likha nahi ja sakta.** Isliye aap apni
hi Sheet me ek chhoti script deploy karenge — wo aapke apne account me chalegi,
aur is repo ke paas Google ka koi credential kabhi nahi aayega.

### C1. Folder aur Sheet banaiye

1. Drive me ek folder banaiye, jaise **`Panel Suite — Jobs`**.
   Uska URL kuch aisa hoga:
   `https://drive.google.com/drive/folders/1AbCdEf...` — aakhri hissa
   **folder ID** hai, wo copy kar lijiye.
2. Ek Google Sheet banaiye, jaise **`Panel Suite — BOQ`**.

### C2. Script paste kijiye

Us Sheet me **Extensions → Apps Script**, sab kuch hata kar ye paste kijiye:

```javascript
/**
 * Hikom Panel Suite — Drive + Sheet endpoint.
 * Ye script aapke apne Google account me chalti hai.
 */
var FOLDER_ID = 'YAHAN_FOLDER_ID_PASTE_KIJIYE';

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var out = { ok: true, files: [], rows: 0 };

  // 1. files Drive folder me, job number ke naam se
  if (body.files && body.files.length) {
    var folder = DriveApp.getFolderById(FOLDER_ID);
    body.files.forEach(function (f) {
      var blob = Utilities.newBlob(
        Utilities.base64Decode(f.base64), f.mimeType, f.name);
      // usi naam ki purani copy hata do, taaki ek job ki ek hi current file rahe
      var old = folder.getFilesByName(f.name);
      while (old.hasNext()) old.next().setTrashed(true);
      out.files.push(folder.createFile(blob).getUrl());
    });
  }

  // 2. rows do alag tabs par
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  out.rows += appendBlock(ss, 'BOQ', body.boq);
  out.rows += appendBlock(ss, 'Flashing', body.flashing);

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendBlock(ss, name, block) {
  if (!block || !block.rows || !block.rows.length) return 0;
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0 && block.header) sheet.appendRow(block.header);
  block.rows.forEach(function (row) { sheet.appendRow(row); });
  return block.rows.length;
}
```

`FOLDER_ID` me apna folder ID daal dijiye.

### C3. Web app ki tarah deploy kijiye

**Deploy → New deployment**:

- **Type** — gear icon → **Web app**
- **Execute as** — **Me** (yahi wo cheez hai jisse likhne ki permission milti hai)
- **Who has access** — **Anyone**
- **Deploy** → Google permission maangega → **Allow**

Jo URL milega (`…/exec` par khatam hota hai) wo copy kar lijiye. Wahi tool ke
profile me daalna hai.

> **Who has access: Anyone** ka matlab hai jiske paas URL hai wo is script ko
> chala sakta hai. Isliye **ye URL ek secret ki tarah rakhiye** — kisi ke saath
> share mat kijiye.

---

## D — Hostinger me kya-kya daalna hai

Sab kuch ho jaye to **hPanel → Deployments → Settings and redeploy →
Environment Variables** me:

| Key | Value | Secret? |
|---|---|---|
| `HOST` | `0.0.0.0` | nahi |
| `SUPABASE_URL` | aapka Project URL | nahi |
| `SUPABASE_ANON_KEY` | anon / public key | nahi — browser me jaati hi hai |
| `BREVO_API_KEY` | Brevo API key | **haan — kisi ko mat dijiye** |
| `MAIL_FROM` | `info@hikom.in` | nahi |

Phir **Save and redeploy**.

Local par test karna ho to repo me `.env` file bana lijiye (wo gitignored hai)
aur `node --env-file=.env app.cjs` chalaiye — Node khud padh leta hai, koi
package nahi chahiye.

---

## E — Mujhe kya chahiye, kaam shuru karne ke liye

**Phase 9 (login) ke liye bas ye do**, aur dono secret nahi hain:

1. **Supabase Project URL**
2. **Supabase anon key**

Ya to mujhe bata dijiye, ya seedha Hostinger ke environment me daal dijiye aur
mujhe bas ye keh dijiye ki daal diye — main code aise likhunga ki wo environment
se hi uthaye.

Baaki (Brevo API key, Apps Script URL) tab chahiye jab Phase 11–12 par aayenge.
**Brevo ka domain verification aaj hi shuru kar dijiye** — DNS failne me ghante
lag jaate hain, aur wo intezaar baaki kaam ke saath-saath ho jayega.
