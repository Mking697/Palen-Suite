# Setup — Hostinger MySQL, Brevo aur Google

Ye guide un accounts ke liye hai jo login, email aur Google save ke liye
chahiye. Ek baar ka kaam hai. `DESIGN.md` ke Phase 9–12 isi par khade hain.

**5 October 2026 ko accounts Supabase se Hostinger ki apni MySQL par chale
gaye** — `server/auth.ts` aur `server/db.ts` ab login, session, OTP sab khud
sambhalte hain. Isse koi teesra account (Supabase) nahi chahiye; database
wahi hai jahan site khud hosted hai.

**Ek baat pehle:** mujhe aapki koi bhi **secret key ya password dene ki
zaroorat nahi hai**. Har key aap khud Hostinger ke *Environment variables*
me daalenge. Repo public hai — usme koi key kabhi nahi jayegi.

Ek key galti se kahin bhej di jaye — chat me, message me, screenshot me — to
usse **badal dena hi sahi tareeka hai**. Database password Hostinger ke
*Databases* panel se, Brevo key Brevo se — dono jagah purani delete karke
nayi banana ek minute ka kaam hai.

| Kya | Kis kaam ka | Kab chahiye |
|---|---|---|
| [MySQL](#a--mysql--login-aur-database) | Login + har user ka apna database | Phase 9, sabse pehle |
| [Brevo](#b--brevo--email) | Signup ki email verification, aur BOQ email bhejna | Phase 9 + 12 |
| [Google Apps Script](#c--google--drive-folder-aur-sheet) | Drive me PDF, Sheet me BOQ | Phase 11 |

---

## A — MySQL — login aur database

### A1. Database banaiye

**hPanel → Databases → MySQL Databases**:

1. **MySQL database name** — kuch bhi, jaise `panelsuite` (Hostinger khud
   `u123456789_` jaisa prefix laga dega)
2. **MySQL username** — kuch bhi, jaise `panelsuite` (isi tarah prefix lagega)
3. **Password** — Generate dabaiye, ya khud strong password banaiye, aur
   **turant kahin likh kar rakhiye** — dobara seedha nahi dikhega
4. **Create** dabaiye

Ban jaane par list me `u123456789_panelsuite` jaisa poora naam dikhega — wahi
`DB_NAME` hai, aur username wahi `DB_USER` hai.

### A2. Schema chalaiye — SQL paste kar dijiye

Database ki list wali row me **Enter phpMyAdmin** dabaiye. Upar **SQL** tab
kholiye.

Repo me **`sql/mysql-schema.sql`** hai — poora file kholiye, select all,
copy, phpMyAdmin ke SQL box me paste, **Go** dabaiye. Chaar table banenge:
`users`, `otps`, `sessions`, `jobs` — har ek ke saath uska comment ki wo
kyun hai.

Postgres ke "row level security" jaisa MySQL me kuch nahi hota — har query
jo `jobs` padhti/likhti hai, ya `users` ka koi row jo apna nahi hai, apna
`WHERE user_id = ?` khud saath leti hai. Ye discipline `server/auth.ts` me
hai; schema khud koi doosri rok nahi lagata. `sql/mysql-schema.sql` ke upar
wala comment yahi baat kehta hai.

### A3. Hostinger me chaar value daaliye

**hPanel → Environment variables** me:

| Key | Kahan se milta hai | Secret? |
|---|---|---|
| `DB_HOST` | **ek hi Hostinger server par hai to `localhost`**; phpMyAdmin ka "Server" field confirm karta hai | nahi, par value sahi honi chahiye |
| `DB_PORT` | `3306` | nahi |
| `DB_USER` | Database ki list wala poora username (`u123456789_...`) | **haan** |
| `DB_PASSWORD` | A1 me banaya gaya password | **haan — sabse zaroori** |
| `DB_NAME` | Database ki list wala poora naam (`u123456789_...`) | nahi, par secret ke saath hi rakhiye |

Inke bina calculator poora chalta hai, bas accounts band rehte hain —
`/api/config` `accounts: false` bolta hai aur panel khud keh deta hai kya
set nahi hai.

### A4. Khud ko admin banaiye

Pehle apni email se **sign up karke OTP se verify** kar lijiye (A ka button
site par hi hai). Phir phpMyAdmin ke SQL tab me:

```sql
UPDATE users SET is_admin = 1, access_until = DATE_ADD(NOW(), INTERVAL 100 YEAR)
WHERE email = 'you@example.com';
```

`sql/mysql-schema.sql` ke neeche bhi yahi likha hai, taaki dobara dhoondhna
na pade.

### A5. Local par test karna ho to

Repo me `.env` file bana lijiye (wo gitignored hai), paanchon `DB_*` key
daal dijiye, aur `node --env-file=.env server/serve.ts --local` chalaiye.

**Dhyan:** Hostinger ka MySQL aam taur par sirf usi server se pahunch paata
hai jahan wo hai — bahar se (jaise aapki apni machine se) seedha connect
karna fail hoga (`ECONNREFUSED`), jab tak **Remote MySQL** me apna IP na
jode ho. Production me `DB_HOST=localhost` chalta hai kyunki app bhi usi
server par chalti hai.

---

## B — Brevo — email

Brevo ek hi kaam karega: **API se email bhejna** — OTP (signup verification)
aur BOQ + drawing wali email, dono `server/mail.ts` ke through, `BREVO_API_KEY`
se.

5 October 2026 ke migration se pehle Supabase Auth khud OTP bhejta tha
(Brevo ko SMTP se jod kar); ab `server/auth.ts` khud OTP banata hai aur usi
Brevo API se bhejta hai jo BOQ email bhejti hai — isliye **SMTP wala setup ab
zaroori nahi**, sirf ek API key chahiye.

### B0. Is project ka apna Brevo account

**Is project ke liye alag Brevo account banaya gaya hai** (17 August 2026),
kisi maujooda account me ek aur domain jodne ke bajaye. Wajah quota hai: free
plan ka **300 email/din poore account ka saanjha** hota hai. Us account se agar
marketing campaign bhi jaati ho, to ek blast quota kha jaata hai — aur us din
**koi estimator login hi nahi kar paata**, kyunki OTP email hi nahi jaati.
**Login email kisi doosre kaam ki marketing par nahi tik sakti.**

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

> Domain authenticate hone tak signup ki OTP email nahi jayegi. Wo intezaar
> DNS ka hai, kisi setting ka nahi.

### B2. API key — OTP aur BOQ email, dono isi se

> ✅ **Ye ho chuka hai — 21 August 2026.** Domain authenticated hai (DNS se bhi
> khud check kiya gaya), API key ban chuki hai, aur uske se ek asli email bhej
> kar dekh liya gaya — attachment ke saath, Brevo ne accept kiya.
>
> **Key ko file me dekhe bina check karne ka tareeka**, jo yahan use hua:
>
> ```
> PORT=5199 node --env-file=.env server/serve.ts --local
> curl -s http://127.0.0.1:5199/api/config      # mail: true aana chahiye
> ```
>
> Phir `GET https://api.brevo.com/v3/account` par `api-key` header ke saath —
> 200 aaye to key valid hai, aur abhi tak kuch bheja nahi gaya.

**Brevo → SMTP & API → API Keys → Generate a new API key**. Naam `panel-suite`.
Key ek hi baar dikhegi — copy karke rakhiye.

Ye **asli secret hai**. Ise **sirf Hostinger ke Environment variables** me
daaliye — `BREVO_API_KEY`. Mujhe bhejne ki zaroorat nahi — code environment se
khud padh leta hai.

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
| `DB_HOST` | `localhost` (same server) | nahi | **ab — login isi se chalega** |
| `DB_PORT` | `3306` | nahi | **ab** |
| `DB_USER` | MySQL username (`u...`) | **haan** | **ab** |
| `DB_PASSWORD` | MySQL password | **haan — sabse khatarnak** | **ab** |
| `DB_NAME` | MySQL database name (`u...`) | nahi, par secret ke saath rakhiye | **ab** |
| `BREVO_API_KEY` | Brevo API key | **haan — kisi ko mat dijiye** | **ab — Email button isi se chalega** |
| `MAIL_FROM` |  `info@panelsuite.online` | nahi | **ab** |

> **Email button ke liye ye dono zaroori hain.** Ek bhi na ho to server saaf
> keh deta hai — `/api/config` `mail:false` bhejta hai aur button khud bata deta
> hai ki kya nahi laga. Chupchap fail nahi hota. Key kabhi browser me nahi
> jaati; isi wajah se `/api/mail` server par hai.

Phir **Save and redeploy**.

Ye paanchon `DB_*` na daale jaayein to bhi calculator poora chalta hai — bas
account panel keh dega ki accounts set nahi hain, aur Save kaam nahi karega.
Engine hi asli cheez hai; account uske upar ki suvidha hai, uske aage ka
darwaza nahi.

Local par test karna ho to repo me `.env` file bana lijiye (wo gitignored hai)
aur `node --env-file=.env server/serve.ts --local` chalaiye — Node khud padh
leta hai.

---

## E — Ab kya bacha hai

**Login ab Hostinger ki apni MySQL se chalta hai**, Supabase se nahi — 5
October 2026 ko migrate kiya gaya. Ab kram se ye:

1. ✅ **MySQL database bana, `sql/mysql-schema.sql` chala, Hostinger me
   paanchon `DB_*` daal diye gaye** — 5 October 2026.
2. **Brevo SMTP laga dijiye** (Part B) agar abhi baaki hai — iske bina
   signup ki OTP email shayad na aaye.
3. Phir apne email se **sign up → email me code → verify → sign in → Save**.
   Ek job save karke doosre account se dekhiye — dikhna nahi chahiye. Wahi
   asli test hai.
4. Apni email ko **admin banaiye** (Part A4).
5. ✅ **`BREVO_API_KEY` aur `MAIL_FROM` Hostinger me daal diye gaye** — 21
   August 2026. Live site par `/api/config` ab `mail: true` bolta hai.
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
