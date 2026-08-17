# Design — one job in, drawings + BOQ out

Target: type the dimensions of a job once and get the wall / ceiling / floor /
door drawings **and** the SHEET FABRICATION BOQ, for any room shape the shop
actually builds — single, multiple, connected (combo), and angled/triangle,
with or without doors.

This is the plan for getting there from what exists today. Nothing here changes
a verified BOQ number; see [What must not change](#what-must-not-change).

## Where we are

| | Have | Missing |
|---|---|---|
| BOQ engine (`core/`) | verified line-by-line on 3 jobs | no geometry — a wall is a length plus flags |
| Legacy calculator | plan SVG, DXF/SVG export, wall elevations | unverified BOQ, geometry hardcoded to 4 walls |

The two halves cannot be joined as they stand, because **neither one knows
where anything is**. `WallSpec` is `{ id, length, cornerStart, cornerEnd }` —
enough to split a run, not enough to draw a line. Legacy knows positions but
only for `W1/W2/L1/L2` plus one pentagon special case, which is why a triangle
room or a third room has nowhere to go.

## What the legacy calculator already does

Read off `legacy/index.html` in full. Most of this is production behaviour the
new engine has no concept of, so it belongs in the plan rather than being
rediscovered later.

| Legacy feature | Where | New engine |
|---|---|---|
| 6 sheet materials × thickness list, **per wall** | `SHEET_DATA`, `readWallSheets` | ✗ one fixed "PPGI 0.4MM" column |
| Same material picker **per door**, plus core Puf / Rockwool / Honeycomb | `readDoorSheets`, `dmat_*` | ✗ |
| Door type Sliding 60mm / Hinges 45mm | `readDoor` | ✗ door takes the wall thickness |
| Door placed by **From Left / From Right** | `doorPlacement` | ✗ position not modelled |
| **Door top panel** when door is shorter than the wall | `wallCalc`, `topStd/topNon` | ✅ — but on a **different rule**: only over a 3050 wall, see below |
| **Machine max panel length** splits long panels | `splitLen`, `maxLen` | ✗ no limit at all |
| Ceiling light / laminar cutout, click-positioned | `lightRect`, `ceilingCells` | ✗ |
| Ceiling split into Top/Bottom/Left/Right regions round the cutout | `ceilingCells` | ✗ |
| 7 flashing types with manual dims, total running metre | `FLASHING_DATA`, `readFlashing` | ✅ — `core/flashing.ts` computes inner, outer and U from the shop's formula, and all seven types can be typed in on top |
| **Corner cut**: a 45° chamfer across the corner, `leg = size/√2` | `roomShape`, `drawChamfer` | ✗ — and not the same thing as a corner panel |
| Angled wall from unequal widths, "TO BE CUT AT SITE" + true diagonal | `roomShape` isPent | ✗ compiler throws |
| Wall thickness drawn as an inner offset polygon | `buildWallPlan` | n/a — drawing |
| Plan SVG, ceiling SVG, walls DXF, ceiling DXF, CSV, localStorage | `svgFromGeom`, `dxfFromGeom` | ✗ to be ported |

The door top panel is the one that turned out to be a **conflict rather than a
gap**. Legacy makes one whenever the door is shorter than the wall, with no
threshold at all. The shop's rule (17 August 2026) is that the piece over a door
is its own panel only once the wall is over 3050mm; below that the door assembly
is the full height of the wall, which is exactly what all four sheets print.
Legacy's version was not carried over.

Four more are not gaps but **conflicts**, and they are what the open
questions at the bottom now cover:

1. **Corner cut ≠ corner panel.** The verified sheets print a corner panel
   600 wide at `cornerLeg` 300 — two 300 legs folded round a 90° corner. Legacy
   takes a corner *size* of 800 and lays it flat across the corner as a
   chamfer, making the legs `800/√2 = 566` and turning the 90° vertex into two
   135° ones. Those are different constructions, not different notation.
2. **Door thickness.** Legacy fixes it by door type — sliding 60, hinges 45 —
   independent of the wall. `boq.ts` keys the door blank off the *wall*
   thickness, and in all four verified sheets the door rows print the wall
   thickness. Both cannot be right.
3. **Where the odd panel sits.** `splitRun` puts the balance last; legacy puts
   the remainder column *first* on the ceiling. Invisible to the BOQ because
   `tally` sorts widest-first, but the drawing has to place it somewhere.
4. **Machine length limit.** Legacy defaults to 3050, yet HI-15279's verified
   sheet prints 1180 × 3340 roof panels. So 3050 is only a default someone
   edits — but the new engine has no limit at all, and would happily emit a
   panel longer than the line can make.

Flashing is the one place legacy answers an open question rather than raising
one: the estimator types the dimensions in and the tool totals the running
metre. No formula is attempted, which matched what `README.md` concluded — until
the shop gave one on 14 August 2026. `core/flashing.ts` now computes inner,
outer and U from the room's perimeter rather than asking. It is the only rule in
the engine with no printed sheet behind it, and HI-15191's flashing rows will
either confirm it or become the deviation that records the difference.

## The one decision

**A room is a closed polygon of points in millimetres, placed on a job-wide
coordinate system.** Everything else is derived from it.

That single change is what unlocks all four shapes at once, because every
feature the shop cares about is a property of the outline:

| Drawing shows | Derived from the outline |
|---|---|
| wall run | edge length |
| corner panel | convex 90° vertex between two own walls |
| butt joint | concave 90° vertex (L-shape re-entrant) |
| cut at site | vertex that is not 90° (triangle / angled) |
| partition | edge segment shared with another room's edge |
| ceiling notch | `own` end = edge with no neighbour; `shared` = partition |
| door position | interval along an edge, at an offset |

**Partition is still a whole edge, not a segment.** `EdgeOverride.shared` is a
boolean: the edge is the neighbour's or it is not. Two rooms of different
depths therefore have to put the whole wall on the deeper one, which is what
HI-15279's drawing does anyway. `core/checks.ts` catches the case where they
do not — it reports the millimetres nobody builds — but a genuinely partial
partition, half wall and half open, is not modelled. No sheet has needed one.

Note the outline is the **external envelope**, which is what the existing job
files already record: HI-15191's freezer is `ext 3050 × 4575` and its walls are
`3050, 4575, 3050, 4575`. The polygon for that room is the external rectangle,
and its edge lengths are today's wall lengths unchanged. That is what makes the
migration provable rather than hopeful.

## Pipeline

The compiler sits **above** the verified engine, not inside it. `layout.ts` and
`boq.ts` are not touched.

```
        RoomOutline (points, mm)  +  per-edge overrides
                     │
        ┌────────────┴─────────────┐
        │                          │
   plan.ts                      draw/
   compileWalls()               planView / elevation / ceiling / floor / door
        │                          │
        ▼                          ▼
   WallSpec[]  ───► layout.ts   Drawing IR { lines, dims, notes, cells }
                       │              │
                       ▼         ┌────┴────┐
                    boq.ts       │         │
                       │      svg.ts    dxf.ts
                       ▼         │         │
                   BoqBlock[]    ▼         ▼
                               screen   AutoCAD
```

Two rules keep the halves honest:

1. **Quantities come from `boq.ts` only.** The drawing never counts anything.
   If a drawing needs a panel count it reads the same `RoomLayout` the BOQ read.
   Any other arrangement lets the drawing and the sheet drift apart, and a
   drawing that disagrees with the BOQ is worse than no drawing.
2. **`core/` stays pure.** `plan.ts` and `draw/` are geometry and string
   building — no DOM, no file IO. The SVG renderer emits a string; the browser
   sets `innerHTML`. That keeps DXF export working server-side and headless.

## Data model

```ts
export type Pt = [Mm, Mm];

export interface RoomOutline {
  /** external envelope, clockwise, closed implicitly */
  points: Pt[];
  /** overrides keyed by edge index (points[i] -> points[i+1]) */
  edges?: Record<number, EdgeOverride>;
  /** overrides keyed by vertex index */
  vertices?: Record<number, VertexOverride>;
}

export interface EdgeOverride {
  id?: string;                 // 'N' / 'E' — printed on the drawing
  door?: DoorSpec;
  equalPieces?: number;        // existing draftsman escapes, unchanged
  panels?: Mm[];
  buttJoint?: boolean;
  /** skins on this wall; defaults to the room's, which defaults to PPGI 0.4 */
  skin?: SkinSpec[];
}

/** One sheet material at one thickness. Legacy allows several per wall. */
export interface SkinSpec {
  material: 'PPGI' | 'GI' | 'EGP' | 'SS' | 'PCGI' | 'HPCL';
  thickness: number;           // mm, e.g. 0.4
}

export interface DoorSpec {
  label: string;
  clearW: Mm;
  clearH: Mm;
  moduleW: Mm;
  /** legacy's placement: give left, right, both, or neither for centred */
  fromLeft?: Mm;
  fromRight?: Mm;
  core?: 'Puf' | 'Rockwool' | 'Honeycomb';
  skin?: SkinSpec[];
}

export interface VertexOverride {
  /** which of the two walls runs through a concave corner; the other butts */
  through?: 'prev' | 'next';
  /** suppress the corner panel (partition ends, site-cut angles) */
  corner?: false;
}
```

`RoomSpec` keeps every field it has and gains `outline`. `walls: WallSpec[]`
becomes the *compiler output*, not hand-written input — so the existing engine
receives exactly what it receives today.

At job level rooms gain a placement:

```ts
interface RoomSpec { /* … as today … */ outline: RoomOutline; at?: Pt; }
interface JobSpec  { /* … as today … */ title?: string; client?: string; site?: string; }
```

## How each case falls out

**Single room.** Outline is a rectangle from `ext.w × ext.l`. The compiler walks
the edges, deducts `cornerLeg` at each convex 90° vertex, and calls `splitRun`.
Byte-identical to today.

**Multiple rooms.** Each room has its own outline and an `at` offset. No
interaction — the BOQ already prints one block per room.

**Connected / combo rooms.** After placement, edges are tested pairwise for
collinear overlap. An overlapping segment is a **partition**: it belongs to one
room (first-listed wins, or explicit), the other room simply does not own that
wall, no corner panel is generated at its ends, and the neighbour's ceiling end
becomes `shared`. This is exactly the arrangement the sheets already show —
HI-15279's chiller "owns only three walls, the fourth is the freezer's", and
HI-15191's ante room has 2 corner panels instead of 4. Rooms sharing a
thickness merge into one printed block via the existing `boqGroup`.

**L-shape.** A concave 90° vertex. One wall runs through, the other butts into
its face and loses one wall thickness — today's `buttEnd`. Which one runs
through is a draftsman decision, so it is a `through` override with a default
rule; the default is whatever reproduces HI-15223, and if no single rule does,
it stays explicit rather than being guessed.

**Triangle / angled.** A vertex that is not 90°. No corner panel; the wall is
marked cut-at-site, which is what legacy already prints along the diagonal
together with its true length. The last panel on such a wall is a trapezoid,
and **how the shop blanks a trapezoid is not known** — see open questions. Until
that is answered the engine draws the angle and refuses to invent a blank size.

**With / without door.** A door already consumes `moduleW` from its wall run.
Adding `offset` gives the drawing its position, and makes the door detail
drawable. There is a likely payoff here: HI-15279's freezer door wall carries
`equalPieces: 2` *because* the door sits centred (`300 | 810 | door | 810 |
300`). A centred door may reproduce `810 + 810` from the rule itself, turning an
override back into a modelled fact. That is a hypothesis to test against the
sheet, not a claim — if it does not reproduce, the override stays.

## Drawings

Legacy already has the right shape for this and it should be ported, not
rewritten: `buildGeom()` produces a renderer-independent IR and
`svgFromGeom()` / `dxfFromGeom()` draw it. Keep the IR, replace the geometry.

```
core/draw/types.ts     Line | Dim | Note | Cell | Fill  (the IR)
core/draw/plan.ts      room outline, panel divisions, door swing, dimensions
core/draw/elevation.ts one drawing per wall: panel widths, height, door opening
core/draw/ceiling.ts   ceiling panel runs + light / laminar cutouts
core/draw/floor.ts     slab outline, or panelised divisions
core/draw/door.ts      leaf, frame, clear opening
core/draw/svg.ts       IR -> SVG string   (ported from svgFromGeom)
core/draw/dxf.ts       IR -> DXF string   (ported from dxfFromGeom, layers kept)
```

The DXF layer names in legacy (`WALL`, `PANEL`, `DOOR`, `DIM`, `LIGHT`, `TEXT`,
`CUT`) are already what the drawing office expects — keep them exactly.

## Job output

One job produces one pack: cover (job no, client, site), plan, one elevation
per wall, ceiling, floor, door detail, then the SHEET FABRICATION block per
room and the job total. The viewer's existing print stylesheet is the delivery
mechanism — print to PDF. DXF downloads per drawing.

## Editor

The viewer grows an editor without growing a dependency:

- **left** — job tree: job → rooms → walls
- **centre** — plan view (SVG); click a wall to select it, drag a door
- **right** — numeric inputs for the selection; every shop constant from
  `rules.ts` exposed
- **tabs** — Plan · Elevations · Ceiling · Floor · BOQ · Verify

Storage splits by purpose: the three verified jobs stay TS files in
`core/jobs/` because they are ground truth, while jobs the estimator creates
are JSON written by the server into `jobs/`. Ground truth is not editable from
a browser.

## What must not change

`npm run check` must print `ALL ROWS MATCH across 3 jobs` with the same 6
documented deviations, at every step. The migration is only correct if the
compiled `WallSpec[]` equals today's hand-written one, so phase 1 adds a test
that asserts exactly that, per wall, per room — not just matching totals.

Corollary: **no phase is allowed to make a sheet match by adjusting an input.**
The rule in `CLAUDE.md` applies to the outline exactly as it applies to a wall
length. An outline is transcribed from the drawing.

## Phases

Each phase ends with the repo green and something usable.

| # | Delivers | Proof it worked |
|---|---|---|
| 1 ✅ | `core/plan.ts` — outline → `WallSpec[]`; rooms migrated to outlines | compiled walls equal the hand-written walls, `npm run check` green |
| 2 ✅ | `core/draw/` + SVG/DXF renderers; drawings in the viewer | every drawn panel is a panel the BOQ priced, asserted per wall |
| 3 | Adjacency: shared edges → partitions, corner suppression, `boqGroup` merge | unlocks HI-15279 Ambient+Milk and HI-15252, both already pending |
| 3a ✅ | Room placement — `at` on a room, one job layout with connected rooms touching | the ante room draws above the freezer, not on top of it |
| 4 | What legacy has and the engine lacks: machine max panel length, ceiling light cutout. Door top panel, door placement, per-wall skins and manual flashing are done | each one reproduces the legacy figure on the same input, and `npm run check` stays green |
| 5 ✅ | The calculator: form in, drawings and BOQ out, on one screen | a job entered from a drawing with no code edit |
| 6 | Angled, chamfered and triangle rooms | needs the corner and blanking answers below first |
| 7 ✅ | One drawing sheet, and a 3D view of the same panels behind a toggle | every 3D face is a width the BOQ priced, asserted per wall |
| 8 ✅ | A guide book in the app — how to use it, in the tool rather than only in a file | an estimator who has never seen the tool enters a job from a drawing without being told how |
| 9 | Accounts and saved jobs: sign up, log in, File → New / Open / Save / Save As, each user's jobs their own | two users sign up, save a job each by the same number, and neither can see or open the other's |
| 10 | The BOQ as a real `.xlsx` and the drawing sheet as a real vector PDF, both downloadable | Excel opens the workbook without repair, and the PDF prints 1:1 with every panel figure the sheet shows |
| 11 | Google: the estimator's own Drive folder and Sheet, connected from their profile | saving a job puts the PDF and the workbook in the folder under the job number, and appends a row to the BOQ and Flashing tabs |
| 12 | Email: TO / CC / BCC, subject, body, with the PDF and the workbook attached | a job is sent from the tool and arrives with both files, named by job number |

Phase 4 is bigger than it looks because per-wall skins change the shape of the
printed sheet — today the BOQ has one "PPGI 0.4MM" column because all four
source sheets use exactly that. Adding materials must not disturb those four,
so the default stays PPGI 0.4 and the column only splits when a job asks for
something else.

The **floor build-up** is the first place this bites. A panelised floor now
names all four of its layers and their thicknesses, and the ply is not fixed —
the shop also builds inner ply + chequered sheet, or outer ply + SS. The
description prints every layer. The **counting** does not follow yet: the BOQ
has one PPGI column and one PLY column, and HI-15279's top AL. chequered sheet
is counted in neither. That is what the sheet does, so it is what the engine
does, and it stays that way until a printed sheet showing a non-ply floor is
transcribed. Inventing a column here would put a number in front of a factory
that no sheet has ever printed.

**The BOQ is the SHEET FABRICATION sheet and nothing else.** Legacy's own
summary — standard / non-standard panel counts and running square metres — is
not carried over; it is replaced, not joined. Flashing running metre survives
as its own figure because it is a separate purchase, not a panel count.

## Phases 9–12 — accounts, files, Google, email

Agreed with the shop on 17 August 2026. This is the first work that changes what
the tool *is*: today it is a calculator on one desk, and these four phases make
it a tool several estimators log into, with their jobs kept for them and their
paperwork going out of it. Written down before any of it is built, because the
decisions below are expensive to change later.

### What does not change

- **`core/` stays pure and stays the engine.** No account, no upload and no
  email may reach it. Everything with a network or a secret in it lives in
  `server/`. The BOQ is still generated the same way from the same inputs, and
  `npm run check` still has to print `ALL ROWS MATCH across 3 jobs`.
- **No npm dependency.** Every piece below was checked against that rule before
  it was chosen, and each one holds: Supabase's auth and database are plain
  HTTP, an `.xlsx` is a ZIP that can be written stored (uncompressed), a PDF of
  lines and text is a content stream much like the DXF the repo already writes
  by hand, and the email service is an HTTP POST.
- **The three verified jobs stay TS files in `core/jobs/`.** They are ground
  truth and are not editable from a browser. Saved jobs are a different thing
  living in a different place, exactly as this file already says.

### Three facts that shaped the design

1. **A URL alone cannot write to Google.** A public Drive folder or Sheet can be
   *read* by anyone with the link; writing needs an authenticated call, even to
   a sheet shared as editable. The shop chose the **Apps Script Web App** route:
   the estimator deploys a small script from their own Sheet, and the tool POSTs
   to that URL. The script runs as them, so no Google credential ever reaches
   this repo or its server. The script ships in `tools/apps-script/`.
2. **Public means public.** The shop has said the folder and the sheet will be
   public. Anyone with either link can then read every job, BOQ and client name
   in them. That is the shop's call, taken knowingly, and it is recorded here
   rather than argued with.
3. **No secret can live in the repo.** It is a public repository. The Supabase
   keys and the email API key are environment variables, and the server refuses
   to start a feature whose key is missing rather than half-working.

### Where the work sits

```
   browser                     server/                    outside
   ───────                     ───────                    ───────
   auth + saved jobs  ──────────────────────────────────►  Supabase
        (anon key, RLS)                                    (Postgres + GoTrue)

   the form  ──────────►  /api/render  ──►  core/          —
                          /api/export  ──►  core/export/   —
                          /api/push    ─────────────────►  Apps Script Web App
                          /api/mail    ─────────────────►  email service HTTP API
```

The split is deliberate. **Auth and job storage go straight from the browser to
Supabase**, with the anon key and row level security, so no secret is needed on
our side for the part that holds the data. **Anything with a secret, or with a
cross-origin problem, goes through the server**: the email API key must never
be in a browser, and a browser POST to an Apps Script URL runs into CORS while
a server POST does not.

### The database

Three tables in Supabase, with **row level security on every one of them** —
that is what makes "each user's own data" true, rather than a promise the UI
makes.

```
profiles
  id            uuid   -> auth.users.id
  display_name  text
  drive_script_url  text   -- the Apps Script Web App, phase 11
  sheet_script_url  text   -- may be the same one
  mail_from     text       -- phase 12

jobs
  id          uuid
  user_id     uuid  -> auth.users.id
  job_no      text
  spec        jsonb        -- the JobSpec the form posts, unchanged
  updated_at  timestamptz
  unique (user_id, job_no)

job_exports                  -- phase 11, what was pushed and when
  id, job_id, kind, target_url, pushed_at, ok, message
```

`spec` is the same `JobSpec` that already goes to `/api/render`, stored whole.
Nothing about the BOQ is stored — it is generated, and storing a generated
figure is how a saved job and a fresh one start to disagree.

`unique (user_id, job_no)` is what makes **Save** an upsert and **Save As** a
new row, and it is per user: two estimators may each have their own HI-15191.

### Phase 9 — accounts and saved jobs

- Sign up and log in against Supabase's auth API by `fetch`. The browser holds
  the session; the server is not involved and needs no key.
- **File menu** in the header: **New**, **Open…**, **Save**, **Save As**.
  *New* warns if the job on screen has unsaved changes. *Save* needs a job
  number, because that is the key.
- **Open job no** — already built — searches the estimator's own saved jobs
  first and the three verified examples after them, so the search box does not
  change its meaning when there is nothing saved yet.
- Logged out, the calculator still works exactly as it does today, with nothing
  saved. That matters: the engine is the product, and an account is a
  convenience on top of it, not a gate in front of it.

### Phase 10 — the workbook and the PDF

Both are pure, both take what the engine already produced, and both obey the
rule the drawings obey: **an export never counts anything.**

- `core/export/xlsx.ts` — a minimal `.xlsx` writer. A workbook is a ZIP of XML;
  written *stored* rather than deflated it needs no compressor, and Excel opens
  it. One sheet per BOQ block plus a Flashing sheet.
- `core/export/pdf.ts` — a minimal vector PDF writer, taking the same `Drawing`
  the SVG and DXF writers take, so the sheet comes out 1:1 in millimetres.

**One thing to settle while building the workbook:** every printed BOQ figure is
rounded half-up by `core/format.ts`, and Excel would happily re-round whatever
it is given. The workbook must carry the *rounded* value as a number, and the
totals row must be the engine's own total rather than an Excel `SUM` — otherwise
a spreadsheet formula quietly becomes a second opinion about the BOQ. This is
the same reasoning that keeps `toFixed` out of the browser.

### Phase 11 — Google, through the estimator's own script

The profile takes two URLs, both Apps Script Web Apps the estimator deploys.
Saving a job POSTs to them from the server:

```
POST <script url>
{ jobNo, savedAt, files: [{ name, mimeType, base64 }], boqRows: [...], flashingRows: [...] }
```

The script writes the files into the Drive folder under the job number, and
appends to two tabs — **BOQ** and **Flashing** — with the timestamp and the job
number on every row, which is what the shop asked for. Because the script is
the estimator's own, the folder and sheet stay theirs and this repo holds no
Google credential at all.

Every push is written to `job_exports`, success or failure. A push that silently
did nothing is the worst outcome here: the estimator would believe the drawing
office has the sheet.

### Phase 12 — email

TO, CC, BCC, subject and body, with the PDF and the workbook attached and named
by job number. Sent through an HTTP email service so no SMTP client has to be
written and no mail port has to be open on the host; the API key is an
environment variable, and the sending domain needs its two DNS records before
anything will arrive. Nothing about the BOQ is re-computed to send it — the
attachments are the same bytes the download buttons give.

### Phase 8 result

Done, and the question the phase was blocked on — render `GUIDE.md`, or write
the panel separately — was answered by rendering the file. Two sets of the same
instructions drift apart, and the one that gets read is the one on the screen,
so there is only one.

A **Guide** button in the header opens `/guide` **in a new tab**, which matters
more than it sounds: the calculator holds a job in the form and nothing else, so
navigating away from it in the same tab would throw the job away. The server
hands `GUIDE.md` over at `/api/guide` and `web/guide.js` renders the Markdown
subset the file uses. No dependency, and `core/` is not involved at all — this
is a page about the tool, not part of the engine.

The heading ids follow GitHub's own slug rule, so the contents table already at
the top of `GUIDE.md` links correctly without the file stating anything, and
`core/verify/web.test.ts` asserts that every in-page link in the file resolves
to a heading the renderer produced. That test catches the slug rule drifting,
which is the only way this page can quietly break.

### Phase 7 result

Done, and both halves lean on the same discipline as the flat drawings.

`core/draw/sheet.ts` composes every view of a job onto one canvas by
**translation only** — nothing scaled, nothing redrawn — so the sheet stays 1:1
and exports as one DXF on the usual layers. The one thing that could not ride
along was text, because a renderer sizes labels from the whole drawing's span:
`DrawDim`, `DrawCell` and `DrawNote` gained an optional `fs`, set only by the
composer, so each view keeps the size it has alone and a single view exports
exactly as it always did.

`core/draw/model3d.ts` stands the job up as flat faces — one per wall panel,
ceiling stripe, floor panel and door — each carrying the figures to show when it
is picked. It is faces only: no camera, no colour, no projection, the same
separation `svg.ts` and `dxf.ts` have from `Drawing`. The browser owns the
camera, because an orbit must not cost a round trip.

**No library.** Three.js would be the obvious reach, and it is a dependency the
repo does not have. It is not needed: every room is a set of right-angled boxes
that do not interpenetrate, so an orthographic projection with a painter's sort
is both correct and short. What that buys is what the estimator asked for —
turn it, zoom it, click a panel and read its own size.

What 3D deliberately does not do: export. No DXF, no sheet, no BOQ. It is for
reading a job, and 2D remains the drawing of record. Adding a 3D DXF (`3DFACE`)
would be a separate decision, because the drawing office has never asked for one.

### Phase 2 result

Done. `core/draw/` builds a renderer-independent drawing, and `svg.ts` /
`dxf.ts` draw it — the same split legacy had, with its DXF layer names kept
exactly. Each drawable room produces a plan, one elevation per wall it owns, a
ceiling layout and a floor layout, and every one downloads as DXF.

`core/verify/draw.test.ts` enforces the rule that matters: the multiset of
panel widths on the drawings equals the multiset `layoutRoom` produced, per
room, and each wall's segments fill its clear run. A drawing cannot show a
panel the BOQ did not price.

HI-15223 is reported as not drawable, with the reason, rather than being
skipped — it still has no outline.

### Room placement

A room carries `at`, its position on the job plan, and `jobPlan` composes every
room into a single WALL PANEL LAYOUT. That is what the drawing office issues: a
freezer and its ante room are one drawing, touching along the wall they share,
not two unrelated pictures. Creating a room against a wall in the calculator
sets `at` from the parent's position and size, so the two come out adjacent
without anyone typing a coordinate. A room added on its own is placed clear of
the others instead of being drawn on top of them.

`at` cannot affect the BOQ — moving a room changes nothing about what it is
built from — and `jobPlan` is composition only: each room's geometry still
comes from `roomPlan`, which gets it from `layoutRoom`.

The room plan is therefore no longer one of a room's own drawings. `roomDrawings`
returns the elevations, the ceiling and the floor; the layout belongs to the job.

### Phase 5 result

Done, and it reorders what matters. The tool is the calculator: one screen,
form on the left, drawings and SHEET FABRICATION on the right, updating as the
estimator types. The verified jobs are no longer the product — they are a
*Load example* dropdown, which is what they always were: proof the engine is
right, not the thing anyone uses.

The whole page is one call. `POST /api/render` takes a job and returns its BOQ
and every drawing together, so the two halves of the screen can never be a step
out of sync with each other.

One thing the form deliberately does not ask for: **ceiling ends and floor
spans** are derived from which walls are marked as the neighbour's, because they
always were the same fact stated twice.

**Wall lengths come from the outline, and the outline is a wall chain** — a
length per wall and the turn taken at its end, which is how a WALL PANEL LAYOUT
dimensions one. Rectangle and notch only seed that chain; any right-angled
shape can be walked out wall by wall, so a drawing unlike the four verified ones
needs no code. A wall list that disagrees with the envelope is the bug HI-15223
turned out to have, so there is only ever one source. When the chain does not
close, the miss is printed in millimetres and nothing is adjusted to hide it.

The two draftsman escapes sit on the wall card itself — a butt joint toggle, and
a split override of either equal pieces or an exact width list. They are taken
off the drawing and are never a way to make a total fit; a loaded example round
trips through them unchanged.

Phase 3 is where the verification work pays for itself: both jobs listed as
pending in `README.md` are blocked on precisely this.

### Phase 1 result

Done. `core/plan.ts` compiles an outline to the wall list, and
`core/verify/plan.test.ts` holds it to the hand-written walls per wall, per
room. `npm run check` still printed `ALL ROWS MATCH across 3 jobs` with the same
6 deviations it had then — not one BOQ figure moved. (The set has since grown
to 9; see "Sheet deviations found" in `README.md` for the current list.)

Four of the five verified rooms are on outlines. The fifth, HI-15223, is not,
and the reason is the first thing the geometry model found: **its transcribed
wall lengths do not close a polygon.** The horizontal chain closes exactly,
the vertical one is out by exactly one wall thickness, on the side carrying all
three butt joints. The BOQ never noticed because the engine subtracts per wall
and never walks the loop. That room stays on its hand-written wall list until
the drawing settles which dimension is measured to the other face — it cannot
be drawn before then, and inventing the missing 60mm is exactly what
`CLAUDE.md` forbids.

That is the argument for the whole design in one example: geometry catches what
per-wall arithmetic cannot.

## Open questions for the shop

Per `CLAUDE.md` these get answered, not guessed.

**From the legacy comparison:**

1. **Corner cut or corner panel?** The sheets fold a corner panel round a 90°
   corner (`2 × cornerLeg` wide); legacy chamfers the corner flat at 45°
   (`leg = size/√2`). Are both used, and on what does the choice depend? A
   chamfered room is a different polygon, so this decides the geometry, not
   just a blank size. Blocks phase 6.
2. **Door thickness.** Sliding 60 / hinges 45 by type, as legacy has it, or the
   wall thickness, as the sheets print it? If it is by type, `DOOR_BLANK_OFFSETS`
   is keyed on the wrong thing.
3. **Machine maximum panel length.** What is it actually? Legacy defaults to
   3050 but HI-15279's sheet prints 3340-long roof panels, so the default is
   not the limit. The engine currently has none, and will emit a panel the line
   cannot make.
4. **Where does the odd panel go?** `splitRun` puts the balance last, legacy
   puts the ceiling remainder first. The BOQ cannot tell the difference; the
   drawing can.
5. ~~**Is a door top panel always cut?**~~ **Answered** by the shop, 17 August
   2026: only once the wall is over 3050mm. Below that the door assembly is the
   full height of the wall and there is no separate top panel, which is why none
   of the four sheets has a top row — they are all 2590 or 2745 high. Built, and
   noted in `README.md` "Open items" as a rule no sheet can check either way.

**Already open:**

6. **Trapezoid blanking.** On an angled wall the end panel is not rectangular.
   Is it blanked at its widest dimension +40, or cut from a standard panel at
   site with no separate blank line? Blocks phase 6.
7. **Partition ownership.** When two rooms of *different* thickness share a
   wall, which room's block prints it, and at which thickness?
8. **Door dimensioning.** Are doors dimensioned from a corner on the layout
   drawing? If yes, that offset is transcribable input and `equalPieces` may
   stop being needed.

Still open from `README.md` and unchanged by this design: flashing RMTR now has
the shop's formula but no sheet to check it against, floor blank at 1260 vs a
1250 coil, butt joint inner delta from a single sample, density 40 vs 42.
