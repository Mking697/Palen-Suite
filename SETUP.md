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

> **Signup test karne se pehle Brevo SMTP laga lijiye (Part B).** Supabase ka
> apna default mailer **ghante me sirf 3–4 email** bhejta hai aur production ke
> liye hai hi nahi — bina Brevo ke signup to ho jayega, par **confirmation email
> shayad kabhi na aaye**, aur bina us link ke login nahi hoga. Ye "kuch hua hi
> nahi" wali soorat hai; asli wajah yahi hoti hai.

Ek aur baat jo waqt bachayegi: Supabase **nakli domain reject karta hai**.
`@example.com` jaise pate par `email_address_invalid` milega. Test ke liye apna
asli email hi use kijiye.

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

**Brevo → SMTP & API → SMTP** tab:

| | |
|---|---|
| Server | `smtp-relay.brevo.com` |
| Port | `587` |
| Login | aapka Brevo login, jaise `8xxxxx@smtp-brevo.com` |
| Password | **Generate a new SMTP key** dabakar jo mile |

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
| **Site URL** | abhi `https://aqua-finch-257417.hostingersite.com`, aur `panelsuite.online` site se judte hi **`https://panelsuite.online`** |
| **Redirect URLs** | dono, aur test ke liye `http://127.0.0.1:5173` bhi jod dijiye |

Redirect URLs me ek se zyada rakh sakte hain, to temporary aur asli dono daal
dijiye — phir domain badalne par link kabhi nahi tootega.

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
 * Panel Suite — Drive + Sheet endpoint.
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

| Key | Value | Secret? | Kab se chahiye |
|---|---|---|---|
| `HOST` | `0.0.0.0` | nahi | pehle se laga hai |
| `SUPABASE_URL` | `https://kyzexsarilxkzwkntode.supabase.co` | nahi | **ab — login isi se chalega** |
| `SUPABASE_ANON_KEY` | anon / public key | nahi — browser me jaati hi hai | **ab** |
| `BREVO_API_KEY` | Brevo API key | **haan — kisi ko mat dijiye** | Phase 12 |
| `MAIL_FROM` |  `info@panelsuite.online` | nahi | Phase 12 |

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

Baaki (Brevo API key, Apps Script URL) Phase 11–12 ke waqt. **Brevo ka domain
verification aaj hi shuru kar dijiye** — DNS failne me ghante lagte hain, aur wo
intezaar baaki kaam ke saath chal jayega.
