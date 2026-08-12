# Guide

Ye guide draftsman / estimator ke liye hai. Engine ko drawing ke dimensions
chahiye, BOQ ka koi number nahi — BOQ khud generate hoti hai.

## Sabse aasan raasta — Panel Calculator

```
npm run dev
```

`http://127.0.0.1:5173` par ek hi screen milegi. Bayein taraf values bharein,
dayein taraf drawing aur SHEET FABRICATION apne aap banti jayegi. Code chhune
ki zaroorat nahi.

| Form me | Kya karta hai |
|---|---|
| Width / Length / Height | Room ka external envelope. Walls isi se nikalti hain. |
| Wall / Ceiling thickness | Panel ki motai |
| Panel module | Standard panel width (1180, 1030 …) |
| Corner leg | Corner panel ka ek leg (300 default) |
| Min panel | Isse chhota balance allowed nahi |
| Ceiling panels run along | Ceiling kis direction me kate |
| Floor type | Puf slab (ek tukda) ya panelised + ply |
| **Neighbour's wall** | Us side padosi room ki wall hai |
| **Door** | Us wall par door, clear opening ke saath |
| **+ Room** | Ek aur room jodo |

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

### Do zaroori tick

**Neighbour's wall** — jis side doosra room juda hua hai. Ek tick se teen kaam
ek saath hote hain: wo wall hat jati hai, uske dono end ke corner panel hat
jate hain, aur us side ceiling ka notch nahi lagta. Isi wajah se ante room 3
walls aur 2 corner par aata hai, 4 aur 4 par nahi.

**Door** — clear opening bharein. "From left" / "From right" khaali chhod do
toh drawing door ko **center** me rakh degi aur plan par `DOOR CENTRED
(ASSUMED)` likh degi. BOQ dono soorat me same rehta hai — door ka module run se
minus hota hai chahe wo kahin bhi ho.

### Jo tool mana kar de

Agar room 90° ka nahi hai, ya koi dimension bemel hai, toh screen par **saaf
error** aayega. Koi number chupke se adjust nahi hota — yahi is engine ki sabse
badi keemat hai.

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

### L-shape room

Notch wali jagah polygon me 6 points hote hain. Jo corner **andar ki taraf**
mudta hai (re-entrant, 270°), wahan corner panel nahi — ek wall seedhi nikalti
hai aur doosri uske face me ja kar rukti hai (ek wall thickness minus).

Engine ye **khud decide nahi karega** — batana padega ki kaun si wall seedhi
ja rahi hai:

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

**Zaroori:** `frame + leaf + frame = module` hamesha barabar rehta hai. Teeno me
se koi ek badloge toh baaki khud adjust ho jate hain. Aisa isliye kiya hai ki
BOQ door ka blank size **leaf** se nikalta hai — agar frame aur leaf alag-alag
ho jaate toh drawing kuch dikhati aur sheet kuch aur.

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

Verified jobs "Load example" dropdown me hain — inhe form me kholkar dekh sakte
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
