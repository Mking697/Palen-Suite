# Guide

**Ye tool kya karta hai, ek line me:** aap drawing dekh kar room ke naap type
karte hain, aur ye khud **drawings aur SHEET FABRICATION (BOQ)** bana deta hai —
kaun sa panel kitna bada, kitne panel, kitni PPGI, kitna chemical, kitna area.

**Aapko BOQ ka koi number type nahi karna.** Sirf wo naap daaliye jo drawing par
likhe hain. Baaki sab tool nikaalta hai. Ye hi is tool ka poora matlab hai.

---

## Pehli baar? Ye 6 step kaafi hain

Ek asli room banate hain — **3050 × 4575 × 2590 mm ka freezer, 100mm panel, ek
door**. Screen kholiye aur saath-saath kariye.

**1. Sign in kijiye.** Site kholte hi login ka screen aata hai. Naya account ho
to email + password daal kar **Sign up** — email par **6 digit ka code** aayega,
wo daaliye, ho gaya.

**2. Job No likhiye.** Upar `Job No` me apne job ka number, jaise `HI-15191`.
Ye baad me isi naam se save aur khulega.

**3. Room ka naap daaliye.** Bayein taraf sabse upar:

| Field | Kya daalein | Example |
|---|---|---|
| Width | room ki chaudai, **bahar se** | `3050` |
| Length | room ki lambai, **bahar se** | `4575` |
| Height | room ki oonchai | `2590` |

> **"Bahar se" ka matlab:** drawing par jo poora bahari naap likha hai wahi.
> Andar ka naap tool khud nikaal leta hai — walls ki motai ghata kar.

**4. Panel ki motai daaliye.** *BUILD-UP* me **Wall thickness** aur **Ceiling
thickness** — dono `100`. Baaki (panel module 1180, corner leg 300) aam taur par
waise hi rehne dijiye.

**5. Door lagaiye.** Neeche scroll kijiye — har wall ka apna card hai (`N`, `E`,
`S`, `W`). Jis wall par door hai, uske card me **Door** tick kar dijiye. Phir
clear opening bhar dijiye, jaise `860` chaudai aur `1980` oonchai.

**6. Bas.** Dayein taraf dekhiye — **drawing sheet aur BOQ pehle se ban chuki
hai.** Aapne kuch dabaya bhi nahi. Upar chaar aankde dikhte hain: kitne panel,
kitni PPGI, kitna chemical (kg), kitna area (m²).

**Save karna hai?** Upar **File → Save**. Wo job aapke naam se save ho jayega,
aur `Open job no` me number likh kar kabhi bhi wapas khul jayega.

**Kagaz par chahiye?** **Print** — usse PDF bhi ban jaati hai.

---

## Do baatein jo is tool ko samajhne me sabse zyada madad karti hain

**1. Ye kabhi chupke se koi number nahi badalta.** Agar aapka naap kahin mel
nahi kha raha, to ye **peele box me bata dega** — theek nahi karega. Wajah saaf
hai: agar tool chupchap number badal de, to factory ko galat cheez chali jayegi
aur kisi ko pata bhi nahi chalega. Peela box dikhe to drawing dobara dekhiye.

**2. Drawing aur BOQ hamesha ek hi baat kehte hain.** Drawing me jo panel dikh
raha hai, wahi BOQ me gina gaya hai — dono ek hi hisaab se bante hain. Isliye
drawing dekh kar order de sakte hain.

---

Ye guide draftsman / estimator ke liye hai. Engine ko drawing ke dimensions
chahiye, BOQ ka koi number nahi — BOQ khud generate hoti hai.

**Sirf calculator chalana hai?** Pehla hissa hi kaafi hai — "Sabse aasan raasta"
se "Jo tool mana kar de" tak. Uske baad ka hissa (`Code me job add karna`) sirf
tab chahiye jab kisi purane job ko verify karna ho.

| Chahiye | Kahan |
|---|---|
| **Pehli baar chala rahe hain** | [Pehli baar? Ye 6 step kaafi hain](#pehli-baar-ye-6-step-kaafi-hain) |
| Screen kaise chalti hai | [Sabse aasan raasta](#sabse-aasan-raasta--panel-calculator) |
| Saari drawings ek canvas par | [Drawing sheet](#drawing-sheet--sab-kuch-ek-canvas-par) |
| 3D me dekhna | [2D / 3D](#2d--3d) |
| Do room jodna | [Jude hue room](#jude-hue-room-kaise-banayein) |
| L, U, stepped room | [Room ka shape](#room-ka-shape--teen-raste) |
| L cut | [L cut](#l-cut) |
| Floor ki layers | [Floor ki build-up](#floor-ki-build-up) |
| Corner ya butt joint | [Corner ya butt joint](#corner-ya-butt-joint--dono-ek-jagah-nahi) |
| Ek corner ka alag naap | [Har corner ka apna leg](#har-corner-ka-apna-leg) |
| Account, aur job save karna | [Apna account, apne job](#apna-account-apne-job) |
| Door kis taraf khulega | [Door ka hand](#door-ka-hand--lhs--rhs) |
| Door ke upar ka panel | [Door top panel](#door-top-panel--3050-se-oonchi-wall-par) |
| Flashing, aur apni flashing jodna | [Flashing](#flashing) |
| Error aa gaya | [Jo tool mana kar de](#jo-tool-mana-kar-de) |

> **Ye guide app ke andar bhi khulti hai.** Screen ke upar dayein taraf
> **Guide** button hai — dabate hi yahi page **naye tab me** khul jayega, taaki
> form me jo job aap type kar rahe the wo bacha rahe. Do copies nahi hain: jo
> file aap padh rahe hain, wahi screen par bhi dikhti hai.

## Sabse aasan raasta — Panel Calculator

**`panelsuite.online`** kholiye aur sign in kijiye. Ek hi screen hai: bayein
taraf values bharein, dayein taraf drawing aur SHEET FABRICATION **apne aap**
banti jayegi. Koi "Calculate" ka button nahi hai — zaroorat hi nahi.

Phone par bhi chalta hai — wahan form upar aur drawing neeche aa jaati hai.

*(Apne computer par chalana ho to `npm run dev`, phir `http://127.0.0.1:5173`.)*

| Form me | Kya karta hai |
|---|---|
| Width / Length / Height | Room ka external envelope. Walls isi se nikalti hain. |
| **Room shape** | Rectangle, Notch (L), ya Custom — wall by wall (koi bhi 90° shape) |
| Wall / Ceiling thickness | Panel ki motai |
| Panel module | Standard panel width (1180, 1030 …) |
| Corner leg | Corner panel ka ek leg (300 default) — **poore room ke liye**. Kisi ek corner ka alag ho to us corner ka apna box bharein, neeche dekhein |
| Min panel | Isse chhota balance allowed nahi |
| Ceiling panels run along | Ceiling kis direction me kate |
| **L cut** | Rebate lagega ya nahi — 50mm se moti wall par by default on |
| Floor type | Puf slab (ek tukda) ya panelised + ply — dono walls ke andar |
| Floor panels run along | Floor kis direction me kate — sirf panelised floor par |
| Floor build-up | Floor panel ki chaaron layers, har ek ka material + thickness |
| **Neighbour's wall** | Us side padosi room ki wall hai |
| **Door** | Us wall par door, clear opening ke saath |
| **Door opens from** | LHS ya RHS — door kis taraf khulega |
| **+ Room** | Ek aur room jodo |

### Apna account, apne job

**Site kholte hi sabse pehle sign in ka screen aayega.** Calculator uske baad
khulta hai — bina account ke aage kuch nahi.

Pehli baar: apna email aur password daal kar **Sign up** dabaiye. Email par ek
**6 digit ka code** aayega — wahi screen par daal kar **Verify** dabaiye, aur
account chalu ho jayega. Code na aaye to **Send again** hai (ek minute me ek
baar hi bhej sakte hain).

**Naye account ko 14 din ka access** milta hai. Uske baad admin se badhwana
padta hai — sign in to ho jayega, par tool nahi khulega aur screen par saaf
likha aayega ki access kab khatam hua.

Ek baar sign in karne ke baad **session bacha rehta hai** — page reload karne
par ya browser band karke dobara kholne par phir se login nahi karna padta.
Nikalna ho to upar dayein kone me apne email par click karke **Sign out**.

Sign in ke baad **File** menu kaam karta hai:

| | |
|---|---|
| **New** | khaali job — pehle poochega, kyunki screen par jo hai wo chala jayega |
| **Open…** | job number poochega aur wo job khol dega |
| **Save** | upar likhe **Job No** par save karta hai |
| **Save As…** | naya job number poochta hai aur uspar save karta hai |
| **Delete this job…** | ye job hamesha ke liye mita deta hai. Pehle poochta hai |

### Purane job se naya job banana

Ye seedha hai: **purana job kholiye → upar Job No badal dijiye → Save**.

Wo **naya job ban kar save hoga**, aur **purana jaisa tha waisa hi rahega**.
Screen par likha bhi aayega — *"saved as a new job HI-XXXXX"* — taaki bharam na
rahe ki purana badal gaya.

Wajah saaf hai: job number hi uski pehchaan hai, to naya number = naya job. Isi
liye Save hamesha **upar wale Job No** par save karta hai, us naam par nahi jo
aapne khola tha.

**Aapka data sirf aapka hai.** Ye app ka vaada nahi, **database khud rokta
hai** — doosre account se aapke job na dikhte hain, na khulte hain, chahe koi
job number sahi hi kyun na likh de. Do alag estimator apne-apne HI-15191 rakh
sakte hain, dono alag.

Save **sirf job ka input** karta hai — jo aapne form me bhara. **BOQ save nahi
hoti**, wo hamesha nayi banti hai. Wajah: bani hui BOQ ko save kar dein to ek
din purana job aur naya job do alag baat kahenge.

Upar wale **Open job no** box me **sirf aapke apne save kiye job** milte hain.
Box par click karne par unki list bhi dikh jaati hai.

### Admin ke liye

Admin ke account me upar apne email par click karne se **Manage users** aata
hai. Wahan har user ki list hai — email, uska access kab tak hai, aur do kaam:

| | Kya karta hai |
|---|---|
| **+7d / +30d / +365d** | Aaj se utne din ka access de deta hai |
| **days + Give** | Jitne din chahiye wo khud likh kar dijiye — 45, 90, jo bhi |
| **Stop** | Access abhi band. Account aur uske saare job bache rehte hain — dobara din dekar chalu kiya ja sakta hai |
| **Delete** | Account aur uske **saare saved job hamesha ke liye mit jate hain**. Wapas nahi aata |

Rozana ka kaam **Stop** hai, **Delete** nahi. Stop palta ja sakta hai, Delete
nahi — isiliye Delete confirm maangta hai aur alag dikhta hai.

Admin ka apna access kabhi khatam nahi hota, aur admin apna hi account delete
nahi kar sakta.

Screen ke upar do cheezein aur hain: **Open job no** — job number type karke
Enter dabate hi wo job form me khul jaata hai (box par click karo to jitne job
tool ko pata hain, unki list bhi dikh jaati hai) — aur **Guide**, jo yahi guide
naye tab me khol deta hai. **Print** browser ka print dialog kholta hai, jahan
se PDF banti hai: usme form aur upar ki patti chhup jaati hai, sirf drawing
sheet aur SHEET FABRICATION rehti hai, aur koi block beech se nahi katta.

### Drawing sheet — sab kuch ek canvas par

Dayein taraf **saari drawings ek hi sheet par** aati hain, jaise drawing office
issue karta hai: pehle poore job ka WALL PANEL LAYOUT, phir har room ka plan,
har wall ki elevation, ceiling, floor aur door — har view apne frame ke andar,
neeche uska naam. Alag-alag tasveerein nahi, ek canvas. **SHEET FABRICATION
table neeche alag hi rehti hai**, room-dar-room, jaise thi.

Sheet **1:1** hai — koi view chhota-bada nahi kiya gaya, sirf jagah par rakha
gaya hai. Isliye:

- **DXF — whole sheet** se poori sheet ek hi DXF me aa jaati hai, usi layers par
  (`WALL`, `PANEL`, `DOOR`, `DIM`, `LIGHT`, `TEXT`, `CUT`).
- Sheet ke neeche **har view ka apna DXF** bhi ek click par hai — machine ko
  aksar ek hi view chahiye hota hai, isliye wo hataya nahi gaya.

Sheet chaudi ho to uske andar hi scroll ho jaati hai; page apne aap nahi
khinchta.

**Kisi bhi view par click kijiye** — wo akela, poore size par khul jayega, saari
dimensions saaf. Wapas jaane ke liye **← All views**.

Har view apne frame ke **andar hi** rehti hai. Cell ka size sirf room se nahi,
uski dimension chain aur labels ko **milaakar** naapa jaata hai — warna ek room
ki dimension line bagal wale view par chadh jaati thi.

### 2D / 3D

Sheet ke upar **2D / 3D** ka toggle hai. **2D default hai aur wahi asli drawing
hai** — jo issue hoti hai, jo DXF banti hai.

**3D** wahi panels khada kar deta hai jo sheet mein price hote hain:

- **Standard views** ke buttons hain, CAD jaise — **Iso · N · E · S · W · Top**.
  Compass letter wahi elevation hai jo aap dekh rahe ho: **N** dabane par north
  wali face saamne aati hai, **Top** poora plan. Jo view chalu hai wo highlight
  rehta hai; drag karte hi highlight hat jaata hai, kyunki tab camera aapka hai.
  **Fit** zoom aur pan ko wapas set kar deta hai, angle ko chheday bina.
- **Drag** karke ghumaiye, **scroll** se zoom, **shift + drag** se khisakaiye.
- **Kisi bhi panel par click** kijiye — neeche uska apna size aa jayega: panel
  size, blank size, aur full module hai ya balance panel. Door par click karo to
  clear opening aur lift dikhega.
- **Show ceiling** by default off hai, taaki room ke andar dikh sake. On karne
  par roof panels bhi aa jaate hain.
- Balance panel (jo poora module nahi hai) ka border **peela** hota hai, wahi
  rang jo baaki jagah non-standard ke liye use hota hai.

3D se kuchh **export nahi hota** — na DXF, na sheet. Wo samajhne ke liye hai,
bhejne ke liye 2D hi hai.

> 3D bhi kuchh **count nahi karta**. Har face wahi width hai jo BOQ ne price ki;
> `core/verify/draw.test.ts` isko har panel par jaanchta hai. Agar 3D aur sheet
> kabhi alag dikhein to wo bug hai, choice nahi.

### Jude hue room kaise banayein

Jis wall par doosra room lagana hai, uspar **+ Room on this side** dabaiye.
Naya room **theek usi wall se sata kar** ban jaata hai, aur upar wali **ek hi
WALL PANEL LAYOUT** me dono saath dikhte hain — jaise drawing office issue
karta hai.

Beech wali wall **exactly ek room** ki hoti hai (warna ya do baar count hogi ya
gayab ho jayegi). Malik wahi banta hai jo aapne pehle bata diya:

- Wall par **neighbour's wall ticked hai** → **naya room** us wall ka malik
- Tick **nahi hai** → **yahi room** malik rehta hai

Door usi room me lagta hai jiske paas wall hai — door wall ke andar banta hai.
Ticked wall par Door tick karoge toh wall **yeh room le lega** (tick apne aap
hat jayega), ya `open Room 2 →` se doosre room me jaakar wahan laga dijiye.

Upar wale **+ Room** button se jo room banta hai wo kisi se juda nahi hota, toh
layout me **alag khada** dikhta hai.

### Room ka shape — teen raste

**Shape** group ke **Room shape** dropdown me teen option hain. Teeno andar se
ek hi cheez banate hain — ek **wall chain**, yaani har wall ki length aur uske
end par kis taraf mudna hai, bilkul jaise drawing par dimension chalti hai.
Isliye mode badalne par kuchh khota nahi: jo screen par tha, agla mode wahi se
shuru hota hai.

| Room shape | Kab |
|---|---|
| Rectangle | Aam chaar-wall room — sirf Width × Length |
| Rectangle with a notch (L) | Ek corner kata hua (jaise HI-15223) |
| Custom — wall by wall | Baaki sab — U, T, stepped, kitni bhi walls |

#### Notch — L-shape ka shortcut

Room ka ek corner kata hua ho (jaise HI-15223), toh **Rectangle with a notch
(L)** chunein. Teen cheezein poochi jayengi:

| Field | Matlab |
|---|---|
| Corner cut away | Kaunsa corner kata hai — Top right / Bottom right / Bottom left / Top left |
| Notch width | Wall ke saath-saath kitna kata |
| Notch depth | Andar kitna kata |

Chunte hi room ki **4 walls 6 ho jaati hain** aur har nayi wall ka apna card
aa jaata hai. HI-15223 ke liye: 2590 × 3860, corner **Bottom right**, notch
1600 × 305.

**Width aur Length poora rectangle hi rehta hai** — notch usme se katta hai.
Aisa isliye ki ceiling aur floor poore rectangle par bante hain: HI-15223 ki
sheet notch ke upar se ek hi 2530 × 3800 ceiling chhapti hai.

Notch wala corner **andar ki taraf** mudta hai (270°), wahan corner panel nahi
lagta. Ek wall seedhi nikalti hai aur doosri uske face me ja kar rukti hai —
aur usme se **ek wall thickness minus** ho jaati hai. Kaun si seedhi jaati hai
ye drawing dekh kar batana padega, isliye **At that corner, the wall that runs
through is** wala dropdown dono walls ke naam se poochta hai. Engine khud guess
nahi karega.

#### Custom — wall by wall

Jitni bhi walls ho — U-shape, T, seedhiyon jaisa stepped room — ye mode sab
banata hai. Drawing jis tarah dimension karti hai, us hi tarah chalein: **ek
wall ki length, phir wo kis taraf mudti hai**. **+ Wall** se aur walls jodein,
**×** se hataayein (teen se kam nahi ho sakti — teen walls kuchh gherti nahi).

Neeche hamesha likha rehta hai ki chain **band hui ya nahi**:

- `Closes exactly · 4000 × 3000 mm` — outline poora ban gaya, room ban gaya.
- Band nahi hui toh saaf batega **kitne mm right/left aur up/down se chook
  gayi**. Yahan koi number apne aap adjust nahi hota. HI-15223 ki printed chain
  exactly ek wall thickness se chookti hai — wo drawing par wapas poochne wali
  baat hai, chupa kar theek karne wali nahi.

Har nayi wall ka apna card aa jaata hai — door, butt joint, sheets, neighbour's
wall, sab wahi. Andar ki taraf mudne wale har corner par wahi *runs through*
wala sawaal poocha jayega jo notch me poocha jaata hai.

> L-shape ya stepped room par ab **+ Room on this side** bhi laga sakte hain.
> Bas dhyan rahe ki shape badalne se shared wall khud hilti hai, isliye baad me
> partition ek baar dekh lein — form yahi hint dikhata hai.
>
> Ek cheez abhi bhi nahi hoti: agar **ek hi side par do walls** ho (L ya stepped
> room me aisa hota hai) aur unme se **sirf ek** partition ho, toh ceiling ka us
> side ka end tay nahi hai — ceiling poore bounding box par banti hai, uska ek
> hi jawaab hota hai. Aisi koi verified sheet aayi nahi, isliye guess nahi kiya
> gaya.

### L cut

**Build-up** group me **L cut** ka checkbox hai. Ye wahi rebate hai jo wall ke
andar wali skin ko chhota karta hai, ceiling ko wall me baithne deta hai, aur
corner panel ki andar wali skin ko patla karta hai.

Cut **utna hi gehra** hota hai jitni ceiling moti hai — tabhi ceiling upar se
usme baith kar wall ke top ke barabar aati hai. Isliye andar wali skin
`height − ceiling thickness` hoti hai, `height − wall thickness` nahi. Chaaron
verified sheets me wall aur ceiling ki thickness barabar hai (60/60, 100/100,
120/120), isliye sheet in dono me farq bata hi nahi sakti — ye baat shop se aayi
hai, sheet se padhi nahi gayi.

- **50mm se moti wall par by default on.** Chaaron verified sheet 60, 100 ya
  120mm ki hain aur sabme cut lagta hai, isliye default kabhi kisi verified
  figure ko nahi hilata.
- Wall thickness badalte hi tick apne aap sahi ho jata hai — jab tak aap khud
  usse chhu na lein. Ek baar chhu diya, aapka faisla chalega.
- **Customer ko cut nahi chahiye** toh untick kar dijiye. Phir: andar wali skin
  poori height ki, corner ki andar wali skin apni outer ke barabar, aur ceiling
  poore external size par.

### Floor hamesha walls ke andar

Floor walls ke **beech** me banta hai — koi wall floor panel par khadi nahi
hoti. Isliye floor ka size aur uska sqmt **andar ka clear area** hota hai, room
ke external size ka nahi. 3050 × 4575 ka room, 120mm wall → floor 2810 × 4335.

Ye dono floor types par lagta hai — puf slab par bhi, panelised par bhi.

> Teen printed sheets isse ulat chhapti hain: HI-15191 ke dono room aur HI-15223
> apna puf slab poore external size par dikhate hain. Engine unhe **follow nahi
> karta** — rule wahi rehta hai, aur un teen rows ko `npm run verify` `!` ke
> saath dikhata hai, sheet ka number aur rule ka number dono. HI-15279 ke
> panelised floor pehle se andar wale the aur ab bhi line-by-line match karte
> hain.

### Floor ki build-up

Panelised floor chunte hi **Floor build-up** aa jaata hai — panel ki chaaron
layers, neeche se upar:

| Layer | Default | Badal sakte hain |
|---|---|---|
| Bottom sheet | PPGI 0.4 mm | material + thickness |
| Core | Puf | nahi — ye khud nikalta hai, neeche dekho |
| Above the core | Ply 12 mm | material + thickness |
| **Top sheet** | AL. CHQ 2 mm | **tick se on/off**, phir material + thickness |

**Top sheet lagti hi na ho** to uska tick hata dijiye. Phir wo na sheet par
chhapegi, na core ko patla karegi — jo layer lagti hi nahi, wo foam kyun khaaye.

Ply fixed nahi hai — shop inner Ply + chequered sheet, ya outer Ply + SS bhi
banati hai. Jo bhi chunenge wo BOQ ki description me poora chhapega, thickness
ke saath.

**Panel kabhi mota nahi hota.** Floor thickness 100 hai to panel 100 hi rahega —
12mm ply aur 2mm CHQ jodne se 114 nahi ho jayega. Jo bhi sheet lagegi, **core
utna patla ho jayega**. 100 − 0.4 − 12 − 2 = **85.6mm core**. Isiliye core ki
thickness poochi nahi jaati, wo khud dikh jaati hai.

Sheets panel se moti ho gayin (jaise 10mm floor par 12mm ply) to core zero se
neeche chala jayega — form wahin peela box dikha kar bata dega, chupchap kuchh
aur nahi bana dega.

> Abhi ek cheez adhoori hai: BOQ me **PPGI aur PLY ke hi column** hain. Aaj bhi
> AL. CHQ wali top sheet description me chhapti hai par kisi column me ginag
> nahi hoti — sheet khud aisa hi karti hai. Ply ki jagah SS ya chequered aane
> par ye ginti kaisi honi chahiye, ye **aapki printed sheet dekh kar** hi tay
> hoga. Tab tak ginti waisi hi hai jaisi thi — koi column apne aap se nahi
> banaya gaya.

### Corner ya butt joint — dono ek jagah nahi

Wall ke har end par **ya corner panel hoga, ya butt joint** — dono kabhi nahi.
Engine mein ye structurally pakka hai: agar corner panel laga hai to butt ka
sawaal hi nahi aata; corner hataoge tabhi ek wall seedhi jaati hai aur doosri
uske face me butt karti hai.

Aapke room me chaar corner hain aur kisi wall par (jaise bottom wall) ek side ya
dono side butt joint chahiye — to bas us end ka **Corner** untick kar dijiye.
Form turant poochh lega ki us junction se **kaun si wall through jaati hai**.

Har end ke neeche ab saaf likha rehta hai ki wahan kya hai aur us wall ko kya
chhodna pad raha hai:

> Corner panel at the start — S gives up 300 mm here.
> **Butt joint at the end, no corner panel — S gives up 100 mm here.**

### Har corner ka apna leg

Ek room ke saare corner ek naap ke nahi hote. BUILD-UP wala **Corner leg** poore
room ke liye hai; kisi ek corner ko alag naap dena ho to us corner ke tick ke
neeche **Leg at start / Leg at end** box hai — wahan seedha number likh dijiye.

- **Box khaali chhodna = room wala figure.** Khaali ka matlab zero nahi hai.
  Placeholder me room ki value dikhti rehti hai, taaki pata rahe kya lagega.
- **Ek corner do walls ka hota hai**, isliye wahi box dono walls ke card par
  dikhta hai aur dono jagah **ek hi number** rehta hai. Kisi bhi ek me badlo,
  doosra apne aap badal jaata hai — ek panel ke do naap ho hi nahi sakte.
- Neeche note bata deta hai ki figure room ka hai ya us corner ka apna, aur
  panel kitna chauda banega (`leg × 2`).

Sheet par iska asar: **alag-alag naap ke corner alag row me chhapte hain.** Do
corner 450 ke aur do 300 ke hon to `Corner Panel (Outer) 900 × H  qty 2` aur
`600 × H  qty 2` — do rows. Saare corner ek naap ke hon to pehle ki tarah ek hi
row banti hai quantity ke saath, kuch nahi badalta.

Corner 300 (corner leg) khaata hai, butt sirf ek **wall thickness** — isliye
butt karne par us wall ka clear run **badh** jaata hai.

### Door ka hand — LHS / RHS

Door box me **Door opens from** ka tick hai. Tick karte hi ek dropdown aata
hai — **LHS (Left hand side)** ya **RHS (Right hand side)** — yaani door kis
taraf khulega.

Do cheezein isse chalti hain:

- **BOQ ke label ka apna `(LHS)`/`(RHS)` token** khud badal jaata hai. Label me
  pehle se token ho to wahi badalta hai, na ho to peeche jud jaata hai.
- **Plan drawing me door ka swing** banta hai — pat khula hua, aur uske saath wo
  chauthai gola jo wo ghoomta hai.

**Tick na karein to kuch nahi badalta** — label bilkul waisa hi chhapta hai
jaisa aapne likha, aur plan par koi swing nahi banti. Wajah: jo baat drawing par
likhi nahi hai, wo drawing khud se nahi bana sakti. Isi wajah se teeno verified
job (jinke label sheet se transcribe hue hain) bilkul achhoote hain.

> Hand kis taraf se naapa jaata hai: room ke **bahar khade ho kar wall ko dekho**,
> to LHS ka kabza (hinge) bayein sire par aur RHS ka dayein sire par lagta hai,
> aur pat **room ke andar** ki taraf khulta hai. Ye padhna drawings dekh kar
> banaya gaya hai, shop se poocha nahi gaya — agar aapki shop ulta karti hai to
> ye ek hi jagah badalni hai, bata dijiye.

### Door top panel — 3050 se oonchi wall par

Wall ki height **3050 se zyada** ho, tabhi door ke upar wale hisse ka **apna
panel** banta hai. 3050 tak door assembly poori wall ki height ki hi rehti hai
aur upar alag se kuch nahi bantaa — form neeche likh kar bata deta hai ki abhi
kaun si soorat chal rahi hai.

| | |
|---|---|
| Panel size | Door module ki chaudai × (wall height − door ki clear height) |
| 3600 wall, 1980 door par | **1180 × 1620** |
| Blank | Panel **+ 40**, baaki wall panel jaisa hi |
| Inner skin | L cut laga ho to **ceiling thickness jitni chhoti** (1620 → 1520) |
| BOQ me | `Door Top Panel (Outer)` aur `(Inner)` — apni do rows, har ek par 1 PPGI |

**Door assembly ki row ab door ki clear height par chhapti hai**, poori wall
height par nahi — warna wall ka wahi hissa do baar gina jaata, ek baar assembly
me aur ek baar top panel me. Dono milkar module ko theek ek baar bharte hain.

> Ye rule bhi **shop se aaya hai, kisi chhapi sheet se nahi**. Chaaron verified
> sheet 2590 ya 2745 ki hain — sab 3050 se neeche — isliye na unme koi door top
> row hai, aur na hi ye rule unka koi number hila sakta hai. Legacy calculator
> alag kaam karta tha (wo har chhote door par top banata tha, koi 3050 ki shart
> nahi thi) — wo follow nahi kiya gaya.

### Flashing

Har job me **teen flashing** by default aati hain — **Inner, Outer, U**. BOQ ke
neeche apni alag table me, kyunki ye panel nahi hai, alag kharid hai. Panel ke
totals me ye kabhi nahi judti.

| | |
|---|---|
| Running MTR | Both width + both length = **2 × (W + L)**, har type ka apna |
| Width | Wall thickness **+ 2** — 100mm wall par 102mm |
| Butt joint ho to | Wahan **extra**: ek wall height Inner ka, ek Outer ka. U par kuch nahi |
| **Padosi room se juda ho to** | Wahan bhi **extra**, neeche dekho |

#### Jude hue room ka vertical flashing

Jis side ki wall padosi room ki hai, us side aapke room ki **koi wall banti hi
nahi** — aur us side se aane wali **do walls ke sire khule** reh jaate hain:
wahan na corner panel lagta hai, na butt joint. Bas wahi do jagah do room ko
jodne ke liye **vertical flashing** lagti hai, **poori room height jitni**.

| Room ka shape | Un do sire par kya lagta hai |
|---|---|
| Seedha rectangle | Sirf **Inner** |
| L-notch, U, ya wall-by-wall bani koi bhi shape | **Inner aur Outer** dono |

Ek partition = **2 sire**. Do partition wale room me 4. Ginti khud junction se
nikalti hai, aapko alag se kuch tick nahi karna. Table ke neeche note me poora
hisaab chhapta hai:

```
Inner Flashing   17.49 m   2 x (3000 + 3000) mm + 2 open ends x 2745 mm
Outer Flashing   12.00 m   2 x (3000 + 3000) mm
```

Shape outline se padhi jaati hai, form ke mode se nahi — ek hi room ko rectangle
mode me banao ya wall-by-wall, flashing ek hi aayegi.

Flashing ki sheet **Flashing** group se chunte hain — default PPGI 0.4.

#### Apni flashing jodna

**Add extra flashing** tick kijiye. Har row me:

| Field | |
|---|---|
| Type of flashing | Saat types — U, L Inner, L Outer, T Angel, Hanging, Flat Strip, Gutter |
| Sheet + thickness | Us flashing ka apna, room wale se alag ho sakta hai |
| Width | Strip ki chaudai, mm |
| Length | **Yahi running metre banti hai** |

**+ Flashing** se jitni chahein utni rows jodiye, **×** se hataiye. Length khali
chhod di to wo row sheet par nahi jaayegi — abhi bhari ja rahi hai, aisa maana
jayega.

Ye rows table me **`typed in`** tag ke saath aati hain, peele border ke saath —
taaki hamesha pata rahe ki kaun si flashing rule se nikli aur kaun si aapne
haath se daali. Inme kuch derive nahi hota, jo aap likhenge wahi chhapega.

> **Ye abhi kisi printed sheet se verify nahi hui.** README purana finding
> rakhta hai ki perimeter wala hisaab HI-15191 ki chhapi figures se upar-neeche
> dono taraf jaata tha. HI-15191 ki flashing rows aate hi main unhe transcribe
> karke ye milaa dunga — tab ye bhi baaki BOQ ki tarah line-by-line verified ho
> jayegi.

### Do zaroori tick

**Neighbour's wall** — jis side doosra room juda hua hai. Ek tick se teen kaam
ek saath hote hain: wo wall hat jati hai, uske dono end ke corner panel hat
jate hain, aur us side ceiling ka notch nahi lagta. Isi wajah se ante room 3
walls aur 2 corner par aata hai, 4 aur 4 par nahi.

**Door** — clear opening bharein. "From left" / "From right" khaali chhod do
toh drawing door ko **center** me rakh degi aur plan par `DOOR CENTRED
(ASSUMED)` likh degi. BOQ dono soorat me same rehta hai — door ka module run se
minus hota hai chahe wo kahin bhi ho. Door kis taraf khulega ye
[Door ka hand](#door-ka-hand--lhs--rhs) me hai, aur 3050 se oonchi wall par
uske upar ka panel [Door top panel](#door-top-panel--3050-se-oonchi-wall-par) me.

### Jab do room alag-alag size ke hon

Jude hue room ka size alag ho sakta hai — HI-15279 me ambient 3690 gehra hai
aur uske saath wala chiller sirf 3400. Aisi soorat me **beech ki poori wall
gehre wale room ki honi chahiye**, kyunki wall ki lambai 3690 hai, 3400 nahi.

Ulta kar diya — chhote room ko malik bana diya — toh 290mm wall **kisi ke BOQ
me nahi aati**. Pehle ye chupchap ho jata tha. Ab totals ke theek neeche peela
box aata hai:

> **1 wall is in nobody's BOQ**
> Ambient · wall E is ticked as the neighbour's, but 290 mm of it has no room
> behind it …

Box aaye toh us wall ki ownership palat dijiye (`open Room 2 →` se doosre room
me jaakar tick hata dijiye), ya room ki position/size theek kar dijiye. Numbers
upar utne hi panels se kam hain — engine gap ko bharne ke liye kuch guess nahi
karta.

### Jo tool mana kar de

Agar room 90° ka nahi hai, ya koi dimension bemel hai, toh screen par **saaf
error** aayega. Koi number chupke se adjust nahi hota — yahi is engine ki sabse
badi keemat hai.

---

## Job ko bahar nikalna — Excel, PDF, DXF

Teen download hain, aur teeno alag kaam ke liye hain:

| Button | Kahan | Kya milta hai |
|---|---|---|
| **Excel — whole BOQ** | SHEET FABRICATION heading ke bagal | Har room ki apni sheet, plus Job total aur Flashing. Wahi numbers jo screen par hain. |
| **PDF — whole sheet** | drawing ke upar, DXF ke bagal | Har view apne page par, page 1 par poori sheet. Har page apna scale likhta hai. |
| **DXF** | drawing ke upar | Machine ke liye — **1:1 millimetre me**. Yahi wo file hai jisse cutting hoti hai. |

**PDF aur DXF ka farak samajh lijiye.** DXF 1:1 hai, wahi factory ko jaata hai.
PDF page par fit kiya jaata hai — isliye har page ke neeche uska scale likha
rehta hai (jaise `Scale 1:14 on 420x297mm`). PDF customer ko bhejne ke liye aur
padhne ke liye hai; **usse naap kar mat kaatiye**, uske liye DXF hai.

Excel me **totals engine ke apne numbers hain, `=SUM` formula nahi.** Ye
jaan-boojh kar hai: har number pehle hi half-up round ho chuka hai taaki printed
sheet se mile, aur formula file khulte hi unhe dobara jodkar apni alag raay bana
leta. BOQ ki ek hi raay honi chahiye.

---

## Email — job customer ko bhejna

Header me **Print ke bagal** ek **Email** button hai. Uspe click kariye:

| Box | Kya |
|---|---|
| **To** | Ek address, ya kai — comma se alag |
| **CC / BCC** | Marzi ho to |
| **Subject** | **Job number ke saath pehle se bhara hua** aata hai. Badalna ho to badal dijiye |
| **Message** | Jo likhenge wahi jayega, plain text |

**Attachment aap nahi chunte — wo apne aap jaate hain:** BOQ ka Excel workbook
aur drawings ki PDF. Untick karne ka koi option nahi hai, jaan-boojh kar — job
apne BOQ aur apni drawings ke saath hi bahar jata hai, ya nahi jata.

Dono file **Send dabate waqt banti hain**, screen par jo job hai usi se. Isliye
purani file bhejne ka sawal hi nahi.

**Reply aapke paas hi aayega.** Mail bhale `info@panelsuite.online` se jaye,
Reply-To hamesha aapka apna address rehta hai — customer Reply dabayega to seedha
aapko milega.

Kuch galat hoga to screen wahi batayegi: kis address ki shakl galat hai, subject
khali hai, ya attachment 10MB se bade hain. Ye sab bhejne se **pehle** bataya
jaata hai.

> **Button "not set up" bole to** — server par `BREVO_API_KEY` aur `MAIL_FROM`
> nahi lage hain. `SETUP.md` ka Part B aur Part D. Tab tak Excel aur PDF button
> se file download karke khud attach kar lijiye.

---

## My settings — ek baar bhar dijiye

Upar dayein apne email par click kijiye → **My settings**. Yahan paanch box hain,
aur ye wo hain jinse job tool se bahar jaata hai: drawing aur BOQ aapke Drive
folder me, BOQ ki lines aapki Google Sheet me, aur email customer ko.

| Box | Kya daalna hai |
|---|---|
| **Your name** | Optional. Email par aapka naam. BOQ me kahin nahi aata. |
| **Google Drive folder link** | Wo folder jahan job number ke naam se drawing PDF aur BOQ workbook file honge. Drive me folder kholiye aur address bar copy kar lijiye. |
| **Google Sheet link** | Jis sheet me BOQ append hogi — har row par timestamp aur job number. |
| **Apps Script Web App link** | `…/exec` par khatam hone wala URL. `SETUP.md` ka Part C batata hai ise kaise banate hain. |
| **Send email from** | Jis address se mail jayega. Khali chhod dijiye to `info@panelsuite.online` se jayega. |

**Teeno Google link alag cheezein hain aur aapas me badle nahi ja sakte.** Folder
aur sheet ke link se koi *padh* sakta hai — likh koi nahi sakta. Likhne ka kaam
sirf Apps Script wala link karta hai. Sabse aam galti folder ka link script wale
box me paste kar dena hai; screen bata degi ki wo jo maanga tha wo nahi lagta —
par **rokegi nahi**. Jo aapne type kiya wahi save hota hai, kyunki ho sakta hai
aapka link sahi ho aur tool ne wo shakl pehle na dekhi ho.

Folder baad me badalna ho to bas ye box badal dijiye. Script dobara deploy karne
ki zaroorat nahi — folder ka pata script ke andar rakha hi nahi gaya, isi liye.

> **Email kis address se jayega** — mail service (Brevo) sirf us address se
> bhejta hai jise aap prove kar sakein ki aapka hai. `info@panelsuite.online`
> bina kisi setup ke chalta hai. Apni khud ki ID (jaise Gmail) daalni ho to
> Brevo me ek baar us address ko **Senders** me verify karna hoga, warna send
> reject ho jayega. Dono soorat me **Reply-To aapki apni ID** rahegi, isliye
> customer ka jawab seedha aapke paas aayega.

Ye settings sirf aapki hain. Koi doosra estimator na inhe dekh sakta hai na
badal sakta hai — ye database rokta hai, screen nahi.

---

## Code me job add karna (verification ke liye)

Neeche wala hissa tab kaam aata hai jab kisi job ko permanently repo me daalkar
uski printed BOQ se line-by-line match karana ho.

## 1. Drawing se kya-kya nikalna hai

WALL PANEL LAYOUT dekh kar har room ke liye:

| Cheez | Kahan milegi | Example (HI-15191 Freezer) |
|---|---|---|
| External size | spec table / overall dims | 3050 × 4575 × 2590 |
| Wall thickness | spec table | 120 |
| Ceiling thickness | spec table | 120 |
| Floor type + thickness | spec table | Puf Slab, 100 |
| Panel module | wall chain me repeat hone wala number | 1180 |
| Corner leg | corner par likha number | 300 |
| Door clear opening | door detail | 860 × 1980 |

Phir **har wall** ke liye: uski length, dono end par corner panel hai ya nahi,
aur door us wall par hai ya nahi.

## 2. Job file banayein

`core/jobs/hi-XXXXX.ts` — HI-15191 ko copy karke edit karna sabse aasan hai.

Room ab ek **outline** se banta hai — plan ka closed polygon. Corner panel,
butt joint, partition — sab isi se khud nikal aata hai, aur aage drawing bhi
isi outline se banegi. Rectangle room ke liye `rect(w, l)` kaafi hai:

```ts
const FREEZER = rect(3050, 4575, {
  0: { id: 'N', door: DOOR },   // edge 0 = points[0] -> points[1]
  1: { id: 'E' },
  2: { id: 'S' },
  3: { id: 'W' },
});

// room ke andar:
outline: FREEZER,
walls: compileWalls(FREEZER),
```

Edge numbering clockwise chalti hai: `rect` me 0 = top, 1 = right, 2 = bottom,
3 = left.

### Corner khud ban jata hai

- Jahan do **apni** walls 90° par milti hain → **corner panel**, aur dono walls
  se `cornerLeg` (300) minus ho jata hai.
- **Do walls ka ek hi corner panel hota hai** — isliye 4 walls par 4 corner.

### Padosi room ki wall — `shared`

Jis side padosi room ki wall hai, us edge par `shared: true` likho. Us side ki
wall is room ki list me aayegi hi nahi, aur uske dono end par corner bhi nahi
banega:

```ts
const ANTE = rect(3050, 1525, {
  0: { shared: true },          // ye side freezer ki wall hai
  1: { id: 'E' },
  2: { id: 'S', door: DOOR },
  3: { id: 'W' },
});
```

Isi ek line se ante room ko 3 walls aur 2 corner milte hain, 4 aur 4 nahi.

### L-shape room — `notched`

Rectangle ke ek corner se tukda kata ho toh `notched` use karein. Ye 6 points
ka outline banata hai aur re-entrant vertex par `through` khud rakh deta hai:

```ts
const CHILLER = notched(
  2590, 3860,                                        // poora bounding box
  { corner: 'SE', w: 1600, d: 305, through: 'next' }, // kata hua corner
  {
    0: { id: 'top' },
    1: { id: 'right' },
    2: { id: 'bottom' },
    3: { id: 'notch' },
    4: { id: 'buttWall', buttJoint: true },
    5: { id: 'left', door: DOOR },
  },
);
```

`w` × `l` **bounding box hi rehta hai**, L nahi — ceiling aur floor usi par
bante hain (HI-15223 ki sheet notch ke upar se poora 2530 × 3800 ceiling
chhapti hai). `RoomSpec.ext` bhi wahi box rahega.

Jo corner **andar ki taraf** mudta hai (re-entrant, 270°) wahan corner panel
nahi lagta — ek wall seedhi nikalti hai aur doosri uske face me ja kar rukti
hai (ek wall thickness minus). Kaun si seedhi jaati hai ye engine **khud
decide nahi karega**, `through` me batana padta hai:

```ts
vertices: { 3: { through: 'prev' } },   // vertex 3 par pichhli wall continuous
```

Nahi bataoge toh build **throw** karega. Aur jo wall pura butt joint panel hai
uspar `buttJoint: true`.

> **Abhi HI-15223 outline par nahi hai.** Uski chhapi hui wall lengths se
> polygon band hi nahi hota — vertical chain 60mm (ek wall thickness) se off
> hai. BOQ sahi hai, par drawing ke liye pehle drawing se ye 60mm resolve karna
> padega. Detail README ke "Open items" me hai.

### Corner har jagah zaroori nahi

Har bahari corner par default me **corner panel** lagta hai, par shop hamesha
nahi lagati. Isliye har wall card par uske **dono end** ke corner ka tick hai —
`Corner at start` aur `Corner at end`, saath me leg ka size (300).

Ek corner **do walls ke beech** hota hai, isliye tick dono walls ke card par
dikhta hai — ek jagah band karo, doosri jagah bhi band dikhega.

Corner band karne par wo dono walls **seedha** milti hain: ek wall poori
nikalti hai aur doosri uske face me ja kar rukti hai (ek wall thickness kam).
Kaun si seedhi jaati hai — abhi tool **pehli wali** maanta hai. Shop se confirm
karna hai; README "Open items" me likha hai.

Plan par ab har corner ka **300 bhi dimension me chhapa** aata hai, isliye ek
wall ki poori chain jodne par wall ki length ban jaati hai.

### Door ki drawing aur uske detail

Har door ki apni **TYPICAL ELEVATION** banti hai, bilkul jaisi issue hone wali
drawing me hoti hai — dono taraf wall panel, upar ceiling panel, neeche PUF
SLAB, aur beech me door.

| Field | Matlab |
|---|---|
| Module taken | 1180 — poora door module |
| Frame each side | 160 — dono taraf ka frame |
| Leaf / clear width | 860 — beech me bacha hua leaf |
| Clear height | 1980 |
| AL. CHQ. sheet | toggle + neeche se kitna upar (600) |
| Door lift | toggle + puf slab se kitna upar (150), aur ground se kitna upar |

**Teeno aap khud bharte hain** — koi apne aap nahi badalta. Drawing par jo likha
hai wahi daaliye.

Neeche jod dikhta rehta hai: `115 + 950 + 115 = 1180 of 1180`. **Jod na mile to
peela box** bata dega kitne mm ka farak hai — theek nahi karega, sirf batayega.
BOQ dono soorat me door ka blank **leaf** se hi nikalta hai.

Door lift ke **do figure alag** hain — puf slab se aur ground se. Ek se doosra
nikala nahi jata, kyunki drawing me dono alag likhe hote hain.

Frame, CHQ sheet aur lift **sirf drawing ke liye** hain — BOQ inse nahi badalta.

### Door wall par kahan hai

BOQ ko farak nahi padta — door ka module run se minus ho jata hai chahe wo
kahin bhi ho. Par **drawing ko batana padta hai**. Isliye door par do optional
field hain, bilkul legacy jaise:

```ts
door: { ...DOOR, fromLeft: 300 }    // wall ke shuru se 300
door: { ...DOOR, fromRight: 300 }   // doosre sire se 300
door: { ...DOOR }                   // kuch nahi diya -> center maan liya jayega
```

Kuch nahi diya toh drawing door ko **center** me rakhti hai aur plan par
`DOOR CENTRED (ASSUMED)` likh deti hai — taaki aapko pata rahe ki ye drawing se
nahi aaya. Door kisi panel ko beech se nahi kaat sakta, isliye position hamesha
nazdeeki panel boundary par snap hoti hai.

HI-15191 aur HI-15279 ke freezer me door waise bhi theek center me nikalta hai
(635 | door | 635 aur 810 | door | 810), toh wahan assumption sahi hai.

### Triangle / angled room

Abhi support nahi hai — 90° ke alawa koi bhi angle **throw** karega. Wajah:
aise wall ka aakhri panel trapezoid hota hai, aur shop use kaise blank karta
hai ye abhi confirm nahi hua. Guess karke number daalna is engine ka sabse bada
nuksan hoga, isliye engine saaf mana kar deta hai.

### Jab draftsman ne apni marzi se kiya ho

Auto rule sirf default hai. Do escape hain, dono per-wall:

```ts
// pura run barabar baanto — door center me rakhne ke liye
{ id: 'W', length: 3400, cornerStart: true, cornerEnd: true,
  door: DOOR, equalPieces: 2 },        // -> 810 + 810

// drawing par jo exact widths likhi hain
{ id: 'E', length: 3400, cornerStart: true, cornerEnd: true,
  door: DOOR, panels: [1180, 240, 200] },
```

`panels` ka sum run ke barabar hona chahiye, warna build **throw** karega —
taaki chupke se koi number adjust na ho jaye.

**Zaroori:** ye override tabhi use karo jab **drawing par** alag arrangement
dikh raha ho. Sirf BOQ total match karane ke liye kabhi mat lagana — usse pura
engine bekaar ho jayega.

### Ceiling ends

```ts
ceiling: {
  splitAxis: 'l',                  // kis direction me panel kate
  wEnds: ['own', 'own'],
  lEnds: ['own', 'shared'],        // 'shared' = us side padosi room ki wall hai
}
```

`own` = apni wall, wahan L-notch ke liye aadhi thickness minus hogi.
`shared` = partition, wahan kuch minus nahi hota.

### Floor ke do type

```ts
// ek hi slab, external size par (HI-15191, HI-15223)
floor: { kind: 'pufSlab', th: 100, desc: 'Puf Slab With Single Layer Tarfelt.' }

// 1220 module me kata, internal size par, har panel ke saath 1 PLY (HI-15279)
floor: { kind: 'panelised', th: 100, module: 1220,
         desc: 'Bottom PPGI +Puf + 12 mm Ply + 2mm AL. CHQ ON Top = 100mm' }
```

Floor thickness wall se alag ho sakti hai — HI-15191 freezer me wall 120mm hai
par floor 100mm.

## 3. Expected sheet transcribe karein

`core/verify/hi-XXXXX.expected.ts` me BOQ PDF ki har row haath se likhein,
bilkul jaisi chhapi hai. Ye ground truth hai — isme kuch adjust mat karna.

`null` matlab us cell me sheet par kuch chhapa hi nahi hai.

## 4. Register karke chalayein

`core/verify/run.ts` ke `CASES` array me dono add karein, aur job ko
`server/serve.ts` ke `JOBS` array me bhi — tabhi wo browser me dikhega. Phir:

```
npm run check
```

### Browser me dekhna ho toh

```
npm run dev
```

Phir `http://127.0.0.1:5173` kholein. **Ek hi screen hai** — bayein form,
dayein drawing aur BOQ. Jaise-jaise value badlogey, dono turant banenge.

Verified jobs upar wale **Open job no** box se khulte hain — job number type
karke Enter, ya box par click karke list me se chunein. Inhe form me kholkar dekh sakte
ho ki engine kin numbers par prove hua hai.

## 5. Output kaise padhein

```
✓   row match ho gayi
✗   mismatch — ya rule galat hai ya input galat hai
!   sheet apne hi rule se hat rahi hai; engine ne rule follow kiya
```

**Zaroori:** agar `✗` aaye toh input ko BOQ se match karane ke liye mat
badalna. Pehle dekho ki galti drawing padhne me hui, rule me hui, ya sheet me
hi hai. `!` wale cases pehle se documented hain (jaise HI-15223 ka PPGI).

## 6. Settings jo tum badal sakte ho

| Setting | Default | Kya karta hai |
|---|---|---|
| `module` | 1180 | Standard panel width (1030 bhi chalta hai) |
| `cornerLeg` | 300 | Corner panel ka ek leg (200/250/350/400 bhi) |
| `minPanelWidth` | 150 | Isse chhota balance allowed nahi — module wapas de kar split hoga |
| `maxSplitPieces` | 2 | Auto mode me upper limit |
| `balancePieces` | — | Force karo ki balance exactly N pieces me kate (room level) |
| `equalPieces` | — | Ek wall ka pura run N barabar pieces me (wall level) |
| `panels` | — | Ek wall ki exact widths drawing se (wall level) |
| `density` | 40 | PUF chemical density kg/m³ (job level) |
| `labels` | singular | Row ke naam ("Wall Panel" vs "Wall Panels") |

## 7. Split rule yaad rakhne ke liye

```
run = wall length − corner legs − butt thickness − door module
n   = floor(run / module)
bal = run − n × module
agar bal < minPanelWidth  →  ek module wapas do, bachi balance ko barabar baanto
```

Isi wajah se sheets me 635+635, 613+613, 563+563 aate hain — 1180 + 90 ka
bekaar tukda nahi banta.
