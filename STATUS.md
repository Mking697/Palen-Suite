# Where this stands

Read this first if you are picking the project up — on this machine or another.
`README.md` says what the engine does, `DESIGN.md` says where it is going, this
file says what has actually happened and what is next.

Last updated: 6 October 2026.

## What landed on 6 October 2026 — multi-room upload, in one place

Summary of the three entries below (HI-15420: two chiller rooms, 60 mm, puf slab
floors, one 900 RHS door each, lift 110). `npm run check` prints ALL ROWS MATCH
across 3 jobs, 9 deviations; 334 tests pass.

- **Every room opens.** `ExtractionResult` is `{ jobNo, rooms: [{ room, form }], notes }`.
- **The drawing is shown as received** above the generated sheet; never saved
  with the job.
- **Printed widths are applied as a marked Exact-widths override** where they
  close on the engine's run and differ from the shop rule (room 1 bottom:
  625 + 625 | door | 1090, where the rule gives 1160 + 1180). The rule's answer is
  stated in the room's warnings, and the walls are listed as "taken from the
  drawing", never as a pass.
- **Open wall inferred from evidence:** room 2's dashed top wall has one
  dimension and no chain, and its printed ceiling 3400 x 4110 is exactly
  4140 - 30 (one own end, one shared end). It is set shared; the 300 beside it
  is a plain panel. Still a guess until the shop answers (README Open items).
- **Door PP/SS:** first is outer, second inner. An assumption from the wall
  convention, flagged. SS thickness 0.5 was already assumed and flagged.
- **Roof check fixed:** the printed ceiling is compared as an unordered pair
  against (sum of roof panelW x qty, panelL), because a multi-panel ceiling never
  equals one panel.
- **Still unverified:** a live model reading of the two-room PDF (the tests use
  the hand-reconciled fixture `core/verify/hi-15420.reading.ts`; the local key
  answered 401). Room 2's hatched 860 x 1350 block is not modelled.

## What landed on 6 October 2026 — review fixes to the multi-room upload

Found by reviewing the two-room upload end to end (HI-15420); each has a
regression test. `npm run check` still prints ALL ROWS MATCH across 3 jobs,
9 deviations.

- **Hinge drawn at the wrong end.** `drawSwing` put an RHS hinge at the end of
  the opening along the edge; facing the wall from outside, the left hand points
  along the edge, so RHS is at the start (plan-right on a bottom wall, as
  HI-15420 prints). Swapped; one sample, not shop-confirmed (README Open items).
- **Door figures never invented.** The upload no longer leaves `newDoor()`'s
  CHQ 600 / lift 150 on a door whose drawing prints neither (both are off unless
  read). A missing module falls back to the form's 1180 *in the server's
  prediction too*, so a printed-panels override can no longer close on a door-less
  run and then fail with the browser's door in place (400 from `/api/render`).
- **Nothing defaulted silently.** Every null width/length/height/thickness,
  door clear size or module is named in the room's warnings with the default
  used; a ceiling/floor thickness not read follows the wall thickness. A
  door in a chain with no door placed, and a thickness with no door blank
  preset, are warned instead of failing later.
- **Corner and roof sheets** follow the wall sheets (room-level `skin`, with a
  "Roof and corner sheets" card on the form; default PPGI 0.4 so verified jobs
  are unchanged). Single sample, said in the code.
- **Drawing check** is spliced when a room is removed, and walls count as
  "taken from the drawing" only while they still carry the mark. Exact widths
  are released back to the shop rule (and said) when the room/wall
  thickness/corner/door-module changes, instead of the BOQ turning into an error.
- Smaller: notes shown in a readable block, wall header tags "from drawing",
  uploaded drawing box 40vh with a visible chevron, the "What was read" screen is
  read-only (it was unreachable and its door edits were ignored), the reader
  accepts prose around the JSON, a bare room or a bare array of rooms.
- **Not done, on purpose:** a ceiling panel order override (the odd piece is
  laid last; warned when the print might differ), the floor description
  wording (open item), a softer message for a wall the drawing marks as not built.

## What landed on 6 October 2026 — drawing upload reads every room

**Client half (done, same day).** `web/app.js` now reads `ExtractionResult.rooms`:

- The upload screen shows "What was read" per room (editable, room name as
  heading), warnings per room, notes once. `openResult` builds every room with
  `roomFromReading`; rooms after the first go through `placeClear` (the same
  placement `+ Room` uses). `form.open[i]` becomes `edge.shared` and
  `form.panels[i]` becomes split `exact` + `panelsText`, each marked on the edge
  as `fromDrawing.{open,exact}` and said on the wall card ("Taken from the
  uploaded drawing"). Editing the widths or split clears the mark; the shared box on an open wall is not locked, so the estimator can take it back.
- `state.drawingCheck` is `{ rooms: [{ name, expected, warnings, panels }], notes }`;
  `drawingCheckPanel` holds block i of the BOQ against room i. The roof is held as
  an unordered pair against (sum of roof panelW x qty, panelL). Walls whose
  widths were applied from the drawing are taken out of the comparison and listed
  as "Taken from the drawing" (the BOQ must still hold each of those panels);
  the rule-built walls are compared on their own, so it is still a genuine check.
- The uploaded file (object URL, `state.uploadedDrawing`, cleared on New and on
  opening a job, never saved) sits in a persistent `.out-slot` above the
  generated output as a `details` "Uploaded drawing - as received" (img for
  PNG/JPEG, embed for PDF), in its own scroll box, hidden in print. The slot is
  not rebuilt on edits, so a PDF viewer does not reload on every keystroke.
- `core/verify/web.test.ts` (71 tests) drives the whole flow with the HI-15420
  fixture, now shared as `core/verify/hi-15420.reading.ts`, against the real
  engine for `/api/render`. `npm run check` still prints ALL ROWS MATCH across 3
  jobs, 9 deviations.
- Not looked at in a real browser (no browser was reachable) and not run with a
  live key: CSS of the new box and the embed on a phone are untested by eye.

### Server half

HI-15420 (two chiller rooms on one sheet) read as one room. `server/vision.ts`
now asks for a `rooms` array (a legacy single `room` answer is wrapped) and
`ExtractionResult` is `{ jobNo, rooms: [{ room, form }], notes }`. (The client half is done — see above.)

- `ExtractedRoom.openWalls` — a wall drawn dashed with one overall dimension and
  no chain. `DerivedForm.open[4]` per edge: the form marks that edge shared, so
  the engine gives it no panels, no corner panel at either end and a ceiling and
  floor that stop at the neighbour's wall. A chain-end `corner` beside an open
  wall is re-kinded to a plain panel (warned) and left out of
  `expected.cornerPanels`. HI-15420 room 2's printed ceiling 3400 x 4110 is
  exactly what the engine gives with the top open (4140 - 30), where a walled
  room would be 4080 — cited in the warning only when the data shows it.
- `DerivedForm.panels[4]` — the printed widths per edge (the edge's own
  direction, door excluded), set only where they fill the engine's run exactly
  and are not what `core/split.ts` would give *in that order*. Computed by
  calling `compileWalls` + `layoutRoom`, not re-derived. To be applied as the
  marked "Exact widths" override; each one is a warning stating the rule's
  split beside the printed one. On HI-15420 that is room 1 bottom (the rule
  would give 1160 + 1180 against the printed 625 + 625 | door | 1090, a real
  BOQ difference), and four walls where the rule gives the same panels with the
  odd one at the other end (room 1 top and left, room 2 right) — order only,
  BOQ unchanged, but the drawing then matches the printed one.
- Corner legs are now stated wherever they differ from the form's 300 (they
  used to be stated only where they differed from the drawing's commonest).
- Door PP/SS: first is outer, second inner, warned as an assumption.
- `core/verify/vision.test.ts` (41 tests) holds both fixtures, including the
  BOQ and the drawn panel order through `buildRoomBlock` / `wallSegments`.
  `npm run verify` is unchanged: ALL ROWS MATCH across 3 jobs, 9 deviations.
- Not done: an open wall is `shared`, so `checkJob` lists it as "in nobody's
  BOQ" until a room is placed behind it. Honest for a wall someone must build;
  a false alarm for an existing structure. A "not built by anyone" flag would
  need `EdgeOverride`, `checkJob` and a form control together — left for the
  shop's answer on what that dashed top wall is. The hatched 860 x 1350 block
  in room 2 is not modelled.

## What landed on 6 October 2026 — door opens outward by default

**The shop:** a cold room door opens out of the room, not into it. `DoorSpec.swing`
(`'in' | 'out'`, `core/types.ts`) is new; `drawSwing` in `core/draw/roomplan.ts`
draws the leaf and arc on the outward side unless it says `'in'`, and the door
card has a **Door opens** dropdown beside the hand (default Outward). The hand
convention is unchanged — still read facing the wall from outside. Drawing only:
the BOQ never reads it, so `npm run check` still prints `ALL ROWS MATCH across 3
jobs`. The shop's instruction, not read off a sheet. Tests in `draw.test.ts` and
`web.test.ts` updated: default is outward, `'in'` swings inward from the same hinge.

## What landed on 6 October 2026 — drawing upload reads the whole plan

`server/vision.ts` (`/api/extract-drawing`, the Upload button) used to read only
w/l/h/thickness and one door, which it always put on wall N, so a drawing came
out as a different room. It now transcribes each wall's **printed dimension
chain** (corner / panel / door figures), the butt-joint corners, the floor row,
the ceiling layout's size and the door note (wall, hand, sheets). Nothing is
*decided* by the model: `deriveForm` works out, in code, which wall the door is
on and how far along it, which corners are butt joints and which wall runs
through (the chain that adds to the full length), per-corner legs, floor kind
and thickness. A chain that does not add to its wall (less 0-2 wall
thicknesses) is a warning naming the figures — never adjusted. The door opens
outward (the 6 October default above).

**A check that is not an input:** the printed panel widths are *not* fed to the
engine. After Open in the calculator, `drawingCheckPanel` in `web/app.js` holds
the engine's own wall, corner and roof panels against what the drawing printed
and says so beside the totals, or lists the difference. On HI-12378 (chiller
2082 x 1143 x 2440, door bottom wall, butt joint SW) the engine's panels —
1180, 912, 843, 543, 302; three 600 corners; roof 1083 x 2022 — are exactly the
drawing's. `core/verify/vision.test.ts` (11 tests) holds `deriveForm` on that
drawing. The read itself is a network call and is not tested.

Model: `VISION_MODEL`, default `claude-opus-5-5`, falling back to
`claude-sonnet-4-5` on a 404 (a key that cannot see the newer one). **Not run
against the live key from here** — the local `.env` key answers 401. Also
fixed: a single-room job printed the word "null" above the flashing table
(`grandTotal` returned null into `replaceChildren`).

**Same day, second pass (after the first live upload):** the wall sheets are read
as the plan marks them (PPGI outside, SS inside on HI-12378) and set on every
wall's outer/inner; the door's CHQ height (600) and lift (110) are read and set.
Roof, corner and floor sheets have no control on the form (room-level skin is
not exposed), so they stay PPGI 0.4 and the screen says so. A drawing that has
just been read now opens straight in the calculator — warnings and the model's
notes sit in the "Checked against the uploaded drawing" box beside the BOQ.
12 tests in `vision.test.ts`.

**Not done, and says so on the screen where it can:** asymmetric door frames
(HI-12378 prints 165 | 520 | 125; the engine draws equal frames, 145 each);
one wall marked SS on part of its outer face and PP on the rest (the engine has one outer sheet per wall);
SS thickness (not printed, 0.5 assumed and flagged); multi-room and L-shape
drawings (walls: null, defaults stay, notes say so); panelised floor build-up.


## What landed on 5 October 2026 — seventh change: accounts moved off Supabase, onto Hostinger's own MySQL

**The shop:** run the database on Hostinger itself rather than a third-party
Supabase project. Accounts, sessions, OTP email and saved jobs all moved.

**New dependency, the first and only one in the repo:** `mysql2`, because
Node has no built-in MySQL client. Everything else stays zero-dependency —
see CLAUDE.md. `server/db.ts` holds the one connection pool, created lazily
from `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`; absent,
`/api/config` answers `accounts: false` with the missing names, the same
shape `mail`/`vision` already used for a missing Brevo or Anthropic key.

`server/auth.ts` replaces Supabase Auth by hand: password hashing with
`node:crypto` scrypt, a six-digit OTP (hashed, 60-minute expiry, sent through
the same `sendMail` the BOQ button uses — no more Supabase SMTP relay),
opaque bearer session tokens with a sliding 30-day expiry
(`userFromRequest` extends it on every authenticated call), and
`hasAccess`/`listJobs`/`saveJob`/etc. with every query carrying its own
`WHERE user_id = ?` or `WHERE id = ?` by hand — **there is no database-level
backstop for this on MySQL**, unlike the Postgres row level security this
replaced. That discipline living in application code, not the schema, is the
one real trade-off of this migration and is written at the top of
`sql/mysql-schema.sql` and in `server/auth.ts`'s own file comment.

`server/serve.ts` gained `/api/auth/{signup,verify,signin,resend,signout,
profile}` and `/api/admin/{users,access}`, replacing the old `/auth/v1/*` and
`/rest/v1/*` calls `web/auth.js` used to make straight to Supabase. Added
`/api/jobs/saved` (GET list, POST save) and `/api/jobs/saved/:jobNo` (GET
one, DELETE), gated by a `requireAccess` helper that checks `hasAccess`
again server-side on every call — mirroring what the Postgres `jobs` policy
used to do, just moved into the handler. `/api/admin/user` DELETE no longer
needs a second secret (`SUPABASE_SERVICE_KEY` is gone); deleting a row is an
ordinary query once `caller.isAdmin` is confirmed from the session.

`web/auth.js` was rewritten end to end: `window.Auth`'s public shape
(`.user`, `.profile()`, `.saveJob()`, etc.) is unchanged, so `web/app.js`
needed exactly one fix — `session.access_token` → `session.accessToken`,
the field Supabase named one way and our own `/api/auth/signin` names
another. Everything else in `app.js` (the gate, the OTP form, Save/Save As,
the admin screen, settings) worked against the new backend with no changes,
because it was always talking to `Auth`'s interface, never to Supabase
directly.

`sql/01-tables.sql`, `02-access-and-admin.sql`, `03-make-admin.sql`,
`04-profile-fields.sql` (all Postgres) were deleted; `sql/mysql-schema.sql`
replaces all four with one file: `users`, `otps`, `sessions`, `jobs`. Run
once by hand in Hostinger's phpMyAdmin — confirmed live on 5 October 2026
against `u441144416_PanelSuite`, all four `CREATE TABLE` queries returning
green.

`core/verify/web.test.ts`'s entire "accounts" and "access, and the
administrator" sections (close to 400 lines) were rewritten against the new
`/api/auth/*` / `/api/jobs/saved` shape rather than the old Supabase-shaped
stub routes (`${SUPA}/auth/v1/...`, `${SUPA}/rest/v1/...`). All 50 tests in
that file pass, and `npm run check` is unchanged otherwise — same 9
deviations, same `ALL ROWS MATCH across 3 jobs`. 258 tests total, all green.

**Still open:** Hostinger's `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/
`DB_NAME` environment variables were added in hPanel but not yet saved/
redeployed as of this entry — do that, then sign up on the live site, verify
with the OTP email, and run the `UPDATE users SET is_admin = 1, ...` from
`sql/mysql-schema.sql`'s own comment to become admin. The old
`SUPABASE_URL`/`SUPABASE_ANON_KEY` Hostinger variables are now unused and can
be deleted (harmless if left, since nothing reads them anymore).

## What landed on 5 October 2026 — sixth change: the drawing prints and downloads on A4

**The shop:** the PDF drawing sheet (download button, email attachment) and
the browser's own Print button must both come out on A4, not A3. Two
unrelated paths carried the page size — fixed both.

`core/export/pdf.ts`'s default paper, `A3_LANDSCAPE` (420×297mm), became
`A4_LANDSCAPE` (297×210mm). Nothing else in the file changed: `pageOf`
already turns the paper to suit each view (portrait for a tall elevation,
landscape for a wide plan) and already states the scale it fitted at on the
caption, so a page-per-view PDF built on HI-15191 now carries MediaBoxes of
595.28×841.89 pt (A4 portrait) and 841.89×595.28 pt (A4 landscape) — checked
by posting a real job to `/api/export` and reading the PDF bytes back, not
assumed.

`web/styles.css` gained `@page { size: A4 landscape; margin: 10mm; }` inside
the existing `@media print` block, which the browser's own Print button
(`window.print()`) reads — it had no page-size rule before and printed
whatever the OS or printer driver defaulted to. The drawing sheet's own
scroll box (`.draw.sheet .draw-svg`) is also unlocked for print — on screen it
scrolls inside a bordered box with padding, which on paper would clip the
sheet to whatever the box happened to show; printed, it goes `overflow:
visible` and the SVG fills the available width.

`core/verify/export.test.ts`'s one hard-coded `420` (A3's width, in the "fits
the page" assertion) became `297`. `npm run check` still prints `ALL ROWS
MATCH across 3 jobs`, same 9 deviations — a page size cannot move a BOQ
figure. All 258 tests pass.

## What landed on 5 October 2026 — fifth change: angled (non-rectangular) outlines

**Phase E, the last of the 5 October drawing-types list, and the one that
touched the engine rather than only `core/draw/`.** `core/plan.ts`'s
`compileWalls` threw on any vertex that was not 90°; it now accepts one when
the job states `vertices: { v: { cut: true } }`. **Nothing is guessed about
the panel there**: neither wall meeting a cut vertex gets a corner panel or a
butt allowance, and both must state their own split (`panels` or
`equalPieces`) — the automatic module split assumes a square end, and the
panel against an angled vertex is very likely a trapezoid the shop has not
confirmed how to blank. A wall with no stated split there throws, naming
which wall and why, the same shape of guard as every other draftsman-override
path in the file.

`roomPlan` needed **no change at all** — it was already drawing the outline
through plain vector math (`offsetPolygon`, `wallSegments`, dimension chains
off unit vectors), with no right-angle assumption anywhere. The only thing
stopping an angled room from drawing was `compileWalls` refusing to compile
one.

Six new tests in `core/verify/plan.test.ts`: the vertex throws without `cut:
true`, is accepted with it and takes no corner panel, a wall with no stated
split at a cut vertex throws, and a wall untouched by the cut keeps its
ordinary automatic split. A standalone smoke test (not committed, run once
from the repo root) confirmed `roomPlan` and `roomDrawings` both render a
45°-cut room end to end with no error.

`npm run check` still prints `ALL ROWS MATCH across 3 jobs`, same 9
deviations — none of the three verified jobs has an angled vertex, so nothing
here could move a BOQ figure. All 258 tests pass (252 + 6 new).

**The calculator's chain builder is still four-direction only.** An angled
room is entered as a job file today, the way a job is always added — see
README.md "Open items" for why a free-angle form control is not worth
building yet (one of nine reference sheets needs it).

**The 5 October drawing-types list is now fully built**: room specification
box, panel joint detail, AL. CHQ layout, standalone door/panel catalog, and
angled outlines.

## What landed on 5 October 2026 — fourth change: standalone door/panel catalog

**Phase D of the 5 October drawing-types list.** A new **Catalog** button
beside Guide opens a screen wholly separate from the job on screen: type one
or several door or panel types and draw them onto their own sheet — HK-009's
three doors side by side, HI-15822's single door, HI-15469's single panel.
`core/draw/catalog.ts` (`doorCatalogView`, `panelCatalogView`) takes its own
small spec types rather than `RoomSpec`, because a catalog door shares
nothing with a job except the shape of the drawing. **Nothing here reaches a
BOQ** — no job file, no room, no price; a door wanted in a job's BOQ is typed
on a room the ordinary way, same as before.

New routes: `POST /api/catalog` composes the posted doors/panels into one
sheet (SVG + click-cells, same `composeSheet` every job sheet uses) and
`POST /api/catalog-dxf` returns the DXF. `web/app.js` gained the whole screen
— `catalogState`, `renderCatalog`, `openCatalog` — with its own add/remove
rows for doors and panels, mirroring the Email screen's shape. `web/index.html`
gained the button and the `#catalog` panel; `core/verify/web.test.ts`'s
`APP_IDS` had to grow the four new ids or the harness's stub DOM throws on
`$('#catalogBtn').addEventListener` the moment the script runs — found by
running the suite, the way `CLAUDE.md` says every browser script must be.

`npm run check` still prints `ALL ROWS MATCH across 3 jobs`, same 9
deviations — nothing here could move a BOQ figure, since the catalog never
calls `buildJob`. All 252 tests pass. Checked by posting a real doors array
to `/api/catalog` over curl (got back a composed SVG) and `/api/catalog-dxf`
(got back a DXF), then in a live browser: the Catalog screen opens with one
pre-filled door, Draw sheet renders a door elevation with HINGE / HANDLE &
LOCK / EMERGENCY BUTTON labels and the 1180×2900 / 860×1980 dimensions, the
job on screen behind it untouched.

**What is left of the 5 October drawing-types list**: non-rectangular site
plans (HI-15815 style) — the one item that needs real geometry work, not a
new view. See README.md "Open items".

## What landed on 5 October 2026 — third change: panel joint detail and AL. CHQ layout

**Two more views from the shop's reference sheets.** `core/draw/detail.ts`
draws the "DETAIL OF A/B" panel-joint cross-section every reference sheet
carries next to its elevation — the camlock step cut into a wall panel's
edge. It rides along with `showElevations` (off by default, same tick as the
wall elevations). **The step is derived from three samples, not stated by the
shop**: HI-14516D, HI-15824 and HI-15469 all step at exactly half the panel
thickness, but all three also have `wallTh === ceilTh`, so "half the wall"
and "half the ceiling" cannot be told apart yet — flagged in README.md "Open
items", the same shape of gap the L cut formula had until 14 August.

`core/draw/ceiling.ts` gained `alChqSheetLayout` — a panelised floor whose
build-up names a chequered top layer (`FloorLayer.material` matching
`/chq|chequered/i`) now also prints its own AL. CHQ. Sheet Layout view
(HK-005, HI-15815), **reusing the floor's own split** rather than inventing a
new one: the chequered sheet sits on the same panels the Floor Layout already
lays out. A one-piece puf slab has no separate top sheet, so nothing is drawn
for it.

Both wired into `roomDrawings`; `npm run check` still prints `ALL ROWS MATCH
across 3 jobs` with the same 9 deviations — no BOQ figure moved, and all 252
tests pass. Checked in a live browser: ticking Add elevation shows a "Room 1
— Detail of panel joint, 100mm thick panel" view beside the elevations, and
switching a floor to Panelised shows "Room 1 — AL. CHQ. Sheet Layout" with
the same panel split as the Floor Layout beside it.

## What landed on 5 October 2026 — second change: room specification box

**Every room now prints its own WALL / CEILING / FLOOR / DOOR box**, tinted
its own colour, sitting right under that room's own views — matching
HI-14516D, HK-005 and HI-15815, the shop's reference sheets. New
`core/draw/spec.ts` (`roomSpecTable`) reads straight off `RoomSpec` —
`wallTh`/`ceilTh`/skin for the first two rows, `floor.desc` (or a fallback)
for the third, and every door's label/clear opening/AL. CHQ/lift for the
fourth, `NOT REQUIRED.` when the room has none. **Nothing is counted or
derived here** — it is a translation of fields the BOQ already prices,
exactly like every other view in `core/draw/`.

Colour is per room, not per sheet: `roomTileColour(index)` cycles six tints
so two or more rooms on one job stay easy to tell apart on screen, the way
the shop's own multi-room sheets do. `Drawing` gained an optional `tiles`
array for this — `composeSheet` shifts them onto the sheet same as every
other element, `toSvg` paints them as a plain filled rect, and `toDxf` draws
only the border on the TEXT layer (a fill colour means nothing to the
machine cutting from the DXF).

`roomDrawings(room, colourIndex)` appends the spec table after ceiling/floor;
`server/serve.ts` passes each room's index in the job so colours stay stable
and distinct. `npm run check` still prints `ALL ROWS MATCH across 3 jobs`
with the same 9 deviations — no BOQ figure moved, and all 252 tests pass.
Checked in a live browser: a two-room job shows a pink and a green spec tile,
each naming its own room, size, build-up and door (or `NOT REQUIRED.`).

## What landed on 5 October 2026 — first change: wall elevations

**Wall elevations are off by default.** The shop: a Wall N/E/S/W elevation per
wall cluttered every sheet, and it is wanted only when asked for. A new
per-room tick, **Add elevation** (off by default), gates `wallElevations` in
`roomDrawings` (`core/draw/index.ts`); the sheet now opens with just the Wall
Panel Layout, Ceiling and Floor views until it is ticked. Nothing else moved:
the door elevation is unaffected and still draws whenever the room has a
door, and Ceiling/Floor keep their own existing `fitted` ticks untouched.

`RoomSpec.showElevations` (`core/types.ts`) is the new optional field — absent
or false means off, so every job file written before this is unchanged and so
are the three verified sheets. `npm run check` still prints `ALL ROWS MATCH
across 3 jobs` with the same 9 deviations; no BOQ figure moved, only what
draws by default. Checked in a live browser, not just headless: the default
sheet shows Wall Panel Layout + Ceiling + Floor only, and ticking **Add
elevation** adds Wall N/E/S/W back.

## What exists and works

`npm run dev` opens the **Panel Calculator** at `http://127.0.0.1:5173` — one
screen, form on the left, drawings and BOQ on the right, updating as you type.
That is the product. The three verified jobs are now only what the header's
**Open job no** search finds: proof the engine is right, not the thing anyone
uses.

| | State |
|---|---|
| BOQ engine (`core/`) | verified line by line on HI-15191, HI-15223, HI-15279 |
| Plan geometry (`core/plan.ts`) | rooms are polygons; walls, corners, butts and partitions compile from the outline. `rect`, `notched` and `chain` build it — any number of walls, any right-angled shape. Each corner may state its own leg |
| Cross-room checks (`core/checks.ts`) | a wall handed to a neighbour that is not there to take it is reported, in mm |
| Drawings (`core/draw/`) | job layout, wall elevations, ceiling, floor, door elevation — SVG + DXF. All of it on **one sheet** (`sheet.ts`), any view clickable to open full size |
| 3D (`core/draw/model3d.ts`) | the same panels stood up, behind a 2D/3D toggle. Orbit, standard views, click a panel for its size. No library |
| Flashing (`core/flashing.ts`) | inner, outer and U per room by the running metre, the vertical closes at butt joints and at a partition's open ends, plus any number typed in. **The one rule with no sheet behind it** |
| Door (`core/boq.ts`, `core/draw/`) | hand LHS/RHS drives the printed label and the plan's swing; over a 3050 wall the piece above the door is its own panel |
| Calculator (`server/`, `web/`) | multi-room, connected rooms, rooms of any right-angled shape typed wall by wall, per-wall sheets, doors, the L cut on or off, floor build-up and run direction, flashing |
| Guide (`/guide`, `web/guide.js`) | `GUIDE.md` rendered in the app, one button in the header, one copy of the instructions |
| Accounts (`web/auth.js`, `/api/config`) | sign up with email confirmation, sign in, File → New / Open / Save / Save As. Each estimator's jobs their own, enforced by the database |
| Tests | 252, plus the line-by-line sheet diff |

`npm run check` must print **`ALL ROWS MATCH across 3 jobs`** with 9 documented
deviations and **1 plan finding** (HI-15191's ante room — see below). It did at
the last commit. If the ROWS line changes, stop and find out why before doing
anything else.

**The browser scripts now have a test.** `core/verify/web.test.ts` boots
`web/app.js` and `web/guide.js` in a `node:vm` context over a stub DOM, drives
the form's controls and reads what it posts. That closes the gap that had been
next step 1 since 14 August — an undefined identifier once survived a whole
session in `web/app.js` because nothing in the repo ever ran the file. The stub
DOM is deliberately small; extend it when the form needs something it lacks.
The 3D maths in the browser is still only exercised from a throwaway harness.

## What landed on 21 August

The 18 August work was **committed** — it had been sitting uncommitted in the
working tree for three days, which meant it was also undeployed, because a push
to `main` is the deploy. Three commits, nothing pushed yet. Then two things the
shop reported from the live site.

### A width typed 10476 arrived as 67401 — and it was live

The exact reverse of the string, which is only ever a caret pinned at 0: each
keystroke landed in front of the one before it.

`field` in `web/app.js` built every dimension as `type="number"`, and **Chrome
refuses `selectionStart` and `setSelectionRange` on a number input**. The
form's caret restore was already there and already wrapped in a try/catch — the
comment said *"number inputs refuse this; being focused is what mattered"*, and
that was the wrong lesson. Focused at index 0 is worse than not focused. It
only showed on **Width and Length** because those are the two boxes that redraw
the whole form; Room name redraws too but is `type="text"`, and Corner leg does
not redraw at all.

Every dimension is now `type="text"` with `inputmode="decimal"`. A phone still
gets the numeric keypad; a scroll wheel over a box can no longer change a
dimension; and the browser can no longer hand back an empty string for
something it disliked instead of what was typed.

**Swept the rest of the page for the same thing, because the shop asked.** Two
more number inputs, neither of which reversed — they are not rebuilt while
being typed into — but both carried the scroll-wheel hazard: the header's
**Density**, which multiplies into every chemical weight on the sheet, and the
admin panel's **days** box, whose `min`/`max` were decorative anyway since the
count is checked in code. Both changed. There is no `type="number"` left in
`web/`, and a test walks the built form and the page's own HTML to keep it that
way.

**The harness could not have caught this, and that is now fixed too.** The stub
DOM carried `selectionStart` as a plain field that always answered and
`setSelectionRange` as a no-op — so it certified a form the browser breaks. It
now throws where Chrome throws, and a test types a width one character at a
time into whatever holds the caret. Reverting `field` makes it fail with *"the
digits came back reversed"*; the old test asserted only **which field** had the
cursor and never **where in it**, which is the half the bug lived in.

### Every corner can have its own leg

Asked for by the shop on 21 August: a room's corners are not all the same size.

`cornerLeg` stays the room's figure and covers every junction that says
nothing; a junction that states one takes it instead. **The leg is read off the
vertex, never off either wall** — a corner panel is one piece shared by two
walls, so both are handed the same figure by `compileWalls` and cannot describe
one panel two ways. The box appears on both wall cards and changing either
moves both.

- **Corners of different sizes print a row each.** `layoutRoom` returns
  `cornerLegs` — one entry per panel, widest first — and `boq.ts` prints a row
  pair per distinct leg with the quantity at that leg. Two at 450 and two at
  300 give `900 × H qty 2` and `600 × H qty 2`. **All one size still prints one
  row with a quantity**, which is why no verified sheet moved.
- **A leg with an odd tally is said, not halved.** Each corner shows up exactly
  twice, once per wall end. An odd count means two walls were handed different
  figures for one piece — unreachable from the form, so it can only come from a
  job file that writes `walls` itself — and it throws rather than printing a
  fraction of a panel.
- **The drawing takes each corner's own leg**, through `runBounds`. This nearly
  went untested: `wallSegments` lays panels out from 0 along the clear run, so
  a wrong leg there changes no width at all — it slides the whole run along the
  wall. Reverting `runBounds` left every width test green. There are now two
  tests that do fail, on `runBounds` itself and on the 3D model's corner legs.
- A blank box is the room's figure and **not zero** — 0 would print a corner
  panel with no width. The placeholder shows what will be used.

### A ceiling and a floor are each optional

Also the shop, 21 August 2026: a customer sometimes takes the room without one,
or without either. **Ceiling required** and **Floor required** are ticks on the
form, both on by default, and `ceiling.fitted` / `floor.fitted` are only ever
*sent* when false — so a job saved before this existed opens as the room it
always was, and the three verified jobs are untouched.

Turning one off takes its rows off the sheet, its view off the drawing and its
faces out of the 3D model. **Nothing else moves**: the walls do not stand on
the floor and do not hang from the ceiling, and the flashing is counted off the
wall perimeter. On HI-15191's freezer, no ceiling is 23 panels down to 19 and
46 PPGI down to 38; no floor is 23 down to 22 with the PPGI unchanged, because
a puf slab carries none.

**It deliberately does not touch the L cut.** The ceiling thickness is also the
depth of the rebate, so the walls' inner skins go on being shortened by it —
the box stays in Build-up and the panel says why. Unticking the cut is the
estimator's own decision; a tool that unticks the box beside the one you
clicked is a tool nobody can check.

### Pushed, and checked on the live site

Five commits went out together — Phase 10, the policy fix, Phase 12, the
reversed-digits fix and the per-corner leg, and the optional ceiling/floor with
the guide. `073ae0f..f257bcb`. Hostinger rebuilt and restarted in about twenty
seconds.

**Checked on `panelsuite.online` rather than assumed:**

- `/`, `/guide`, `/api/rules`, `/api/config` and `/api/guide` all answer 200,
  and the served `app.js` is the new one — no `type: 'number'` anywhere in it,
  `inputmode` on the dimensions, the per-corner **Leg** box, and both
  **required** ticks. `index.html` serves Density as text.
- **`/api/export` returns real files over HTTP**: the workbook starts `PK` at
  11.6 KB and the drawing PDF starts `%PDF-` at 45.3 KB.
- **`/api/mail` answers 501** naming `BREVO_API_KEY` and `MAIL_FROM`, which are
  still not set — the button is switched off and says so.
- **The two new engine rules work on the live engine**, posted to `/api/render`:
  a room stating 450 at two vertices prints `Corner Panel (Outer) 900 × 2590
  qty 2` beside `600 × 2590 qty 2`; a room with neither a ceiling nor a floor
  prints only wall and corner rows.
- **Anonymous reads of `profiles` and `jobs` still come back `[]`**, so nothing
  was widened on the way out.

**One check that could not be made from here, and must not be read as a pass.**
An anonymous `PATCH` setting `is_admin` answered 204 — but it named an id that
does not exist, so it matched no rows, and the trigger skips when `auth.uid()`
is null in any case. The anon key cannot test it. The real test is a `PATCH`
from a signed-in **non-admin** browser session, it is written up in `SETUP.md`
A4, and it was made on 18 August.

### Brevo is proved, and email is one Hostinger setting away

The domain question is closed. Brevo shows `panelsuite.online` **Authenticated
and Branded**, and the DNS says the same independently — `brevo-code:e519fb23…`
on the apex, `brevo1`/`brevo2._domainkey` CNAMEd to Brevo's DKIM hosts,
`v=DMARC1` pointing at `rua@dmarc.brevo.com`, and `send.panelsuite.online`
CNAMEd to `brand.brevosend.com`. So `MAIL_FROM=info@panelsuite.online` needs
nothing further.

**The two keys were nearly confused, and `SETUP.md` had already warned about
it.** The SMTP key named *Panel Suite* was made on 17 August and last used on
19 August — it is Supabase's signup and OTP mail and it is working. The Email
button cannot use it: `server/mail.ts` posts to `api.brevo.com/v3/smtp/email`
with an `api-key` header, which wants the `xkeysib-…` **API key** from the
separate *API keys & MCP* tab. That key now exists.

**Checked by asking Brevo rather than by reading the file.** The key was never
printed: the server was started with `--env-file=.env` and `/api/config`
answered `mail: ready`, then `GET /v3/account` answered **200** — Personal,
free plan, 300 sends a day.

**Then one real send, through `sendMail` itself** rather than a curl of its
own, with the workbook and the drawing PDF built by `core/export` exactly as
`/api/export` builds them: 13,080 and 45,505 bytes, accepted by Brevo as
`<202608210804.67854497583@smtp-relay.mailin.fr>`. The test job carries two
corners at 450 and two at 300, so the new per-corner rule is on the sheet that
went out.

**What that send did not cover, and still wants a browser:** the Supabase
sign-in gate, the Reply-To being read from Supabase with the caller's own
token, and the Email form itself. The script passed `replyTo` by hand and never
went through `/api/mail`.

**Both variables went into Hostinger the same day and the site was redeployed.**
`/api/config` on `panelsuite.online` now answers `mail: ready`, and `/api/mail`
answers **401 "Sign in to send an email."** where it answered 501 before. That
501 → 401 is the whole proof that the server found them: the two gates fire in
the right order.

**What that does not prove, and must not be read as proof:** that the key was
pasted correctly. A key with a stray space would give the same 401, because the
sign-in gate comes first and Brevo is never reached. The only thing that settles
it is a signed-in send from the live site — the Email button, which also covers
the Reply-To read from Supabase and the form itself.

### The guide now describes every control

The shop asked for it after using the screen: a layman has to be able to read
what each box does. `GUIDE.md` gained **Screen par har control — ek-ek karke**,
top to bottom in the order the controls appear — the header strip, ROOM, SHAPE
(all three room shapes and what each does on screen), BUILD-UP, CEILING, FLOOR,
FLASHING, every control on a wall card, and what comes out on the right. It
replaces the short summary table that was there, rather than sitting beside it,
because two lists of the same thing drift apart.

`npm run check` prints `ALL ROWS MATCH across 3 jobs` with the same **9
deviations and 1 plan finding** across **252 tests**.

## What landed on 18 August

**Phase 10 is built, Phase 11/12 groundwork is in, and one hole that was live is
closed.** `npm run check` prints `ALL ROWS MATCH across 3 jobs` with the same 9
deviations and 1 plan finding across **229 tests**. No BOQ figure moved.

### Phase 10 — the workbook and the PDF

`core/export/` — `zip.ts`, `xlsx.ts`, `pdf.ts` — plus `/api/export` and two
buttons: **Excel — whole BOQ** beside the SHEET FABRICATION heading, and
**PDF — whole sheet** beside the DXF button. Still no dependency.

- **`.xlsx` is a ZIP written stored**, so no compressor and no package. CRC32 is
  the one piece that could not be skipped. Timestamps are fixed rather than the
  clock, so the same job twice is byte-identical.
- **The totals row is a literal number, never `=SUM`.** Every figure is already
  rounded half-up to agree with the printed sheet; a formula would re-add them
  on open and quietly become a second opinion about a BOQ that was checked line
  by line. Every worksheet is asserted free of `<f>` and `SUM(`.
- **A drawing PDF is a page per view**, composed sheet first. One A3 holding all
  fourteen of HI-15191's views came out at 1:159 with nothing legible. Each page
  is fitted and oriented on its own and **states its scale** — a drawing whose
  scale is not printed is one somebody will measure off wrongly. The DXF is
  still the 1:1 thing the machine cuts from.
- **Two faults came out of looking at a rendered page, not out of a test.** The
  em dash in every drawing title printed as `?`, and the drawing sat at a fifth
  of the page because `toSvg`'s 30% padding suits a screen that scrolls and not
  paper. `boundsOf` is exported from `sheet.ts` and reused for the page size.
  This is the second time presentation has been caught by looking — `CLAUDE.md`
  already says the harness checks behaviour and the eye checks the picture.

**Checked from outside, not assumed:** Windows' ZIP reader expands the workbook,
**Excel opens it** — four sheets, correct headers, and `Total` reading 23 / 46 /
300.97 / 64.73, which is exactly what `buildJob` prints — and the **Windows PDF
engine** parses the 15-page export and renders every page. Both files were also
fetched over HTTP from `/api/export` rather than only built in a test.

### Phase 12 — email, built

An **Email** button beside Print. To / CC / BCC / Subject / Message, the subject
already carrying the job number, and **both attachments automatic** — the BOQ
workbook and the drawing PDF, built by the server when Send is pressed from the
same calls `/api/export` makes. There is nothing to untick: a job goes out as
its BOQ and its drawings or it does not go out.

- `server/mail.ts` is the Brevo client — one `fetch`, no dependency, and the key
  never leaves the process. That is the whole reason it goes through our server
  rather than straight from the page.
- **Reply-To is the signed-in estimator**, read from Supabase with their own
  token rather than taken from the request. The From may have to be
  `info@panelsuite.online`, because Brevo will not send as an address it cannot
  prove the sender owns; the Reply-To is always a person.
- **What is wrong is said here, not by Brevo** — empty recipients, a malformed
  address named so it can be found, an empty subject, and attachments over 10MB
  measured at their base64 size, which is what actually travels.
- **No key, no form.** `/api/config` hands over a boolean and never the key;
  without `BREVO_API_KEY` and `MAIL_FROM` the panel names what is missing and
  posts nothing.

Checked by running it: `/api/config` reports `mail:false` and `/api/mail`
answers **501** naming both variables; with the variables set it reports
`mail:true` and answers **401 "Sign in to send an email."** — so the two gates
fire in the right order. 15 tests in `core/verify/mail.test.ts` cover the
address parsing, every refusal, and the exact JSON Brevo is handed; 6 more in
`web.test.ts` drive the form.

**Still to do before an email actually arrives:** `BREVO_API_KEY` and
`MAIL_FROM` in Hostinger's environment. Until they are there the button is
honest about being switched off.

### A bug found on the way, in code this touched

`/api/admin/user` read `profiles?select=id,is_admin&limit=1` — *whichever row
comes first*. That is the caller's own row only while they can read exactly one,
and **an administrator can read all of them**. So the "are you an admin" check
and the "you cannot delete your own account" check were both being made against
somebody else's row. This is the identical mistake `web/auth.js` was fixed for
on 17 August, and STATUS.md already carried the warning: *anything that reads a
single row should name it*. It reappeared in the server because that file was
written before the lesson.

Both endpoints now go through `whoIsCalling`, which asks `/auth/v1/user` — the
one endpoint whose entire answer is "you". Naming the row was not enough here:
the caller's own id is exactly what was being looked up.

### Phase 11 changed shape — read this before building it

The shop restated the requirement on 18 August: an estimator pastes **two
links**, and those files are shared **with one ID in Editor mode**. No
per-estimator Apps Script deploy. Two things follow:

- **"Public" cannot be written to.** *Anyone with the link — Editor* lets **a
  person in a browser** edit. A server still needs a credential. This is the
  obvious thing to reach for and it fails at the first upload.
- **"One ID, shared as Editor" is exactly right** — it is a **service account**.
  One identity, its private key on the server, every estimator shares with it.
  `node:crypto` signs the JWT, so no dependency.

**But a service account has no Drive storage quota**, so it cannot create a file
in an ordinary My Drive folder — `storageQuotaExceeded`. A Shared Drive fixes it
and needs Google Workspace. **The shop is on ordinary free Gmail** (asked and
answered), so Phase 11 becomes **Sign in with Google**: the estimator connects
their account once from the profile, the server keeps the refresh token, and
files are created as them — their file, their quota, their folder. One
mechanism covers the Sheet as well.

Cost, recorded now rather than discovered later: a Google Cloud OAuth client
(id and secret as environment variables, never in this repo), a consent screen,
and refresh tokens per user in `profiles`. Google's *Testing* mode allows 100
users without verification, which is more than this shop needs.
`tools/apps-script/panel-suite.gs` stays as the fallback.

### Phase 11 groundwork

- **A profile screen: *My settings*, in the account menu.** Five boxes — name,
  Drive folder link, Google Sheet link, Apps Script Web App link, and the
  address email is sent from. This is what Phases 11 and 12 read; without it a
  push and a send have nowhere to go. `web/auth.js` gained `settings` and
  `saveSettings`, and the screen borrows the admin panel's frame.
- **Two new profile columns, `drive_folder_url` and `sheet_url`.** The folder id
  used to live inside the deployed Apps Script, which made "change the folder"
  mean "redeploy a Google script". The target now travels with the request, so
  it is one box in the app. Reasoning in `DESIGN.md`.
- **The Apps Script has one copy, `tools/apps-script/panel-suite.gs`.** It was
  written out inside `SETUP.md`; that section now says to open the file instead.
  Two copies of a script drift and the one that runs is the one nobody edited —
  the same reasoning that makes `/guide` render `GUIDE.md` rather than repeat
  it. While moving it, it grew a per-job sub-folder, the timestamp and job
  number on every appended row, and a failure that is reported rather than
  swallowed.
- **A wrong link is said, not refused.** Three of the five boxes take a Google
  URL and only one of them can write; pasting the folder link into the script
  box is the mistake the screen exists to catch. It names what does not look
  right and **saves what was typed anyway**, exactly as the wall chain that does
  not close is reported rather than nudged shut.

### The hole — worth reading before touching any policy

**A row level policy is not a column level one.** `change own profile` is
`for update using (auth.uid() = id)`: it says which *rows* may be updated and
nothing at all about which *columns*. So any signed-in estimator could send

    PATCH /rest/v1/profiles?id=eq.<their own id>   { "is_admin": true }

and Postgres would allow it — the row is still theirs, so the policy is still
satisfied. Every gate in this app sits behind `is_admin` and `has_access()`, so
that one request was the administrator's screen and a licence that never
expires. **Nothing in the app ever sent it**, which is exactly why it survived:
the app was not the attack surface, the anon key and an ordinary session were.
This was live on `panelsuite.online`.

`sql/04-profile-fields.sql` closes it with a `before update` trigger that raises
if a non-admin's update touches `access_until`, `is_admin`, `email` or `id`.
Column privileges were the obvious fix and are wrong here — they attach to the
role, and an administrator is `authenticated` too, so revoking the column from
the role would take it from the admin screen as well.

**Run on the live project on 18 August**, and confirmed by the column check in
`SETUP.md` A4. It is not a new-database step — until it ran, the hole was open
on `panelsuite.online`. It skips when `auth.uid()` is null so the service key,
the SQL editor and `02-access-and-admin.sql`'s backfill are unaffected.

**That skip is also why the SQL Editor cannot test it.** An `update profiles set
is_admin = true` typed there succeeds, because the editor has no `auth.uid()` —
and reads exactly like the fix having failed. The real test is a `PATCH` from a
signed-in browser session, and it has to be a **non-admin** one, since the
trigger lets an administrator through by design. `SETUP.md` A4 has both.

Tests: `core/verify/web.test.ts` is 44, five of them new — the screen shows what
is saved, saving names its own row and carries neither `access_until` nor
`is_admin`, a wrong-looking link is said and still stored, and the Brevo sender
constraint is on the screen where it is read.

**Email goes through Brevo — decided by the shop on 18 August**, over sending
from the estimator's own Gmail via the Phase 11 Apps Script. Both were put to
them. What it costs is in `DESIGN.md` and on the settings screen: Brevo will not
send as an address it cannot prove the sender owns, so `info@panelsuite.online`
works out of the box and an estimator's own address needs a one-time verify in
Brevo. The estimator's address is the Reply-To either way.

## What landed on 17 August

Four things, all asked for by the shop, and none of them moves a verified
figure — checked, not assumed: `npm run check` still prints `ALL ROWS MATCH
across 3 jobs` with the same 9 deviations and 1 plan finding.

- **A guide book inside the app.** The question left open on 14 August — render
  `GUIDE.md`, or write the panel separately — is answered by rendering the file.
  A **Guide** button in the header opens `/guide` **in a new tab**, so a job
  half typed into the form is not thrown away by navigating. `server/serve.ts`
  hands the file over at `/api/guide`; `web/guide.js` renders the Markdown
  subset the file uses, headings carrying GitHub's own slug ids so the contents
  table at the top of `GUIDE.md` already links correctly. No dependency, and
  `core/` is untouched.
- **A door states which hand it is hung on.** `DoorSpec.hand` — LHS or RHS —
  with a tick and a dropdown on the door card. It rewrites the `(LHS)`/`(RHS)`
  token inside the printed label and draws the leaf and its swing arc on the
  plan. **Unstated, nothing changes**: the label prints exactly as transcribed
  and no swing is drawn, which is why the three verified jobs — whose labels are
  each written differently on their own sheets — are untouched. Which end an LHS
  door hinges on is a reading off the drawings rather than a statement from the
  shop, and it lives in one function, `drawSwing`; it is recorded in `README.md`
  as open.
- **A door top panel, above 3050mm of wall.** `DOOR_TOP_MIN_WALL_HEIGHT`.
  Over it, the piece above the door is a panel of its own — the door module wide
  by the wall height less the clear opening, blanked +40, inner skin set back by
  the L cut, one PPGI a side, `Door Top Panel (Outer)` and `(Inner)` rows. The
  door assembly then prints at the **clear height** rather than the full wall,
  so that stretch of wall is counted exactly once, and a test asserts the two
  add back up to the module. Below the threshold nothing moves, and every source
  sheet is 2590 or 2745 high, so no sheet can check this rule or contradict it.
  Legacy's version is a **different rule** — it makes a top panel whenever the
  door is shorter than the wall, with no threshold — and was not carried over.
- **Flashing closes the joint between two rooms.** Where a room hands its wall
  to the room next door, the two walls arriving at that side simply stop: no
  corner panel, no butt joint. `core/flashing.ts` now counts those **open ends**
  — one partition gives exactly two, one at each corner — and adds a room height
  of flashing at each. A plain rectangle takes **inner only**; a shaped room —
  an L, a U, anything past four walls — takes **inner and outer**. The shape is
  read off the outline, never off the form's shape mode, because the mode is a
  fact about the screen and the same room entered two ways must not produce two
  different sheets. One trap found while building it: an open end cannot be
  detected from the compiled wall list, because the wall running *through* a
  butt junction has neither a corner nor a butt at that end either. It is
  counted off the outline instead.

- **A job is opened by its number.** The *Load example* dropdown is gone; the
  header has an **Open job no** search box instead, on the browser's own
  `datalist` so clicking it still lists everything the tool knows. A number that
  is not there says so beside the box and changes nothing. It is a search rather
  than a picker because the number is what an estimator reads off the drawing —
  and because a list stops being a way to find anything once saved jobs
  outnumber a screenful, which is where this is going.

Also landed: **`core/verify/web.test.ts`**, the harness that has been next step 1
since 14 August. It runs both browser scripts headless.

**A finding worth acting on:** `RoomSpec.boqGroup` is declared in
`core/types.ts` and the form sends it, but `buildJob` never reads it —
`core/boq.ts:397` maps rooms one to one. So the *BOQ group* field on the form
does nothing at all today. Merging is Phase 3 work and is what HI-15279's
Ambient + Milk block is waiting for. Until it is built the field should be
removed from the form or marked as not yet working: a control that silently does
nothing is worse than no control.

## What landed on 14 August

The 13 August session ended mid-refactor — the weekly token limit hit with the
work in the working tree, none of it committed, and `web/app.js` calling a
`FACING_SIDE` table the very next edit was going to define. Picked up there.

- **A room of any right-angled shape can be typed in.** Every room is a **wall
  chain** underneath: a length per wall and the turn at its end, which is how a
  WALL PANEL LAYOUT dimensions one. *Rectangle* and *Notch* only seed that
  chain now; **Custom — wall by wall** edits it directly, with `+ Wall` and a
  live readout of whether the outline closes and by how many mm if it does not.
  Four walls or twelve — L, U, stepped. The form posts `outline.points` and
  `compileWalls` takes it from there, so nothing downstream had to learn a new
  shape.
- **The one break is fixed.** `FACING_SIDE` is gone. A new room's facing wall is
  taken by name through `OPPOSITE[side]`, and the wall across a partition is
  found by **which way it faces and which room it names**, never by its position
  in the list. On an L-shaped room the west wall can sit at index 5, so the old
  fixed `[2, 3, 0, 1]` table would have picked the wrong neighbour.
- **L-shape plus partition is no longer blocked.** The shape controls are warned
  about rather than hidden, because changing the shape moves the shared wall.
  What is still unanswered is narrower and now recorded in `README.md`: one of
  two walls facing the same side being a partition, which the bounding-box
  ceiling has no second answer for.

Then four shop requirements, all four answered by the shop before any code:

- **The L cut can be turned off.** It was always applied; now it is a per-room
  tick, defaulting to on above `L_CUT_MIN_WALL_TH` (50mm) — some customers do
  not want it. Off, all three of its effects go: the inner skins run the full
  height, a corner's inner skin matches its outer, and the ceiling runs the full
  external size. Every verified sheet is 60, 100 or 120mm and carries the cut,
  so the default moves nothing.
- **The floor states its build-up.** Four layers bottom up — bottom sheet, puf
  core, the sheet above it, top sheet — each with its own material and
  thickness, because the ply is not fixed (inner ply + chequered, or outer ply
  + SS). **The panel never grows**: the floor thickness is the whole build-up,
  so 12mm ply and 2mm chequered on a 100mm floor leave an 85.6mm core, not a
  114mm panel. The core is derived, never typed; sheets thicker than the panel
  are reported in the form rather than quietly built.
- **The L cut is as deep as the ceiling is thick.** The inner skin was
  `H - wallTh`; it is now `H - ceilTh`, because the ceiling drops into the
  rebate from above and finishes flush with the wall. Every source sheet has
  `wallTh === ceilTh` — 60/60, 100/100, 120/120 — so **none of them can tell the
  two formulas apart**, and the verification stayed green through the change.
  That is exactly why it needed the shop to settle it rather than a reading.
- **A panelised floor picks which way its panels run**, width or length, the
  same choice the ceiling already had. It was hardcoded to the width in both
  the layout and the drawing.
- **The floor is the clear area inside the walls — every kind of floor.** A wall
  never stands on the floor, so the slab stops at them like the panelised floor
  always did. This is the one change that **moved printed BOQ figures**, and it
  did so on the shop's word against three sheets: HI-15191's two rooms and
  HI-15223's one all size their puf slab to the external envelope. Those rows
  are now recorded as deviations with the sheet's own figures kept beside the
  rule's, exactly like the other six — the expected files were **not** re-fitted
  to the engine. HI-15191's freezer floor goes 13.95375 → 12.18135 m². The
  deviation count is therefore 6 → **9**, and HI-15279's panelised floors still
  match line for line, which is the reason to trust the rule over those rows.
  The `rule` override in `core/verify/expected.ts` had to grow `panelW`,
  `panelL`, `chemWeight` and `areaSqmt` to say this.
- **All the drawings are on one canvas now.** `core/draw/sheet.ts` composes
  every view of a job — job layout, then each room's plan, elevations, ceiling,
  floor and door — into a single bordered sheet with a framed, captioned cell
  per view. It is a **translation only**: no view is scaled or redrawn, so the
  sheet stays 1:1 in millimetres and `toDxf` exports the whole thing on the
  usual layers. Text was the one thing that could not just ride along, because
  a renderer sizes labels from the whole drawing's span and on a sheet that is
  the sheet; `DrawDim`, `DrawCell` and `DrawNote` gained an optional `fs` so
  each view carries the size it was drawn at. Undefined everywhere else, so a
  single view exports exactly as it always did. Per-view DXF is still one click
  under the sheet — that is what goes to the machine.
- **The sheet's cells were too small, and views crossed their frames.** A cell
  was sized from a view's `w` and `l`, which is only the extent of the *object*
  — a dimension chain hangs outside the room it measures, so it ran into the
  next view. `boundsOf` now walks every line, label, panel and dimension,
  text included, and the cell is sized from that. `core/verify/draw.test.ts`
  asserts a composed view has nothing outside its own frame but the sheet
  border. Found from a screenshot, not from a test — worth remembering.
- **Clicking a view on the sheet opens it full size.** `composeSheet` returns
  the cell rectangles alongside the drawing, the payload carries them, and the
  browser turns a click back into millimetres through the SVG's own viewBox
  rather than guessing a scale. `← All views` goes back.
- **A 3D view, behind a 2D/3D toggle.** `core/draw/model3d.ts` stands the job
  up: every wall width from `wallRuns`, every ceiling stripe, every floor panel
  and every door becomes a face in space, each carrying its own label and
  figures. The browser owns the camera — orthographic projection, painter's
  sort, hit testing — because dragging must not cost a round trip. Click a panel
  and it prints its own panel and blank size. Standard views (Iso, N, E, S, W,
  Top) sit beside the drag, and pitch runs the full range from elevation to
  plan. 2D stays the drawing of record and
  **nothing exports from 3D**. No library: the geometry is right-angled boxes,
  so the no-dependency rule survives. The rule that a drawing counts nothing
  applies here too, and `core/verify/draw.test.ts` now holds the 3D faces to the
  same widths as the flat views.
- **Corner and butt joint were already exclusive — now it is proved.** The shop
  stated the rule: where a butt joint lands there is no corner panel.
  `compileWalls` could never produce both, because a vertex takes the corner
  branch or falls through to the butt one, so no engine change was needed. Two
  tests now hold it: no wall end carries both across every verified room and
  notch, and turning a corner off moves exactly two walls — the butting one
  trades a 300 leg for one wall thickness, the through one gets the leg back.
  The wall card states which an end has and what it costs.
- **Flashing is built.** `core/flashing.ts`: inner, outer and U on every room,
  running metre `2 x (extW + extL)` each, width `wallTh + 2`, and a butt joint
  adding one wall height of inner and one of outer. Its own table under the BOQ
  with its own total — flashing is a separate purchase and never joins the panel
  counts, which a test holds. `FLASHING_PROFILES` and `uFlashingProfile` were
  already sitting in `rules.ts`, transcribed and unused; they are wired now.
  **It is the only rule in the engine with no printed sheet behind it** — and
  `README.md` records an older finding that perimeter estimates missed
  HI-15191's figures both ways. Those rows are coming; transcribing them settles
  whether the formula or that finding was wrong.
- **Extra flashing can be typed in.** *Add extra flashing* opens a list the
  estimator fills row by row — type, sheet, thickness, width, length — from the
  seven types the legacy calculator offered, taken from its own `FLASHING_DATA`
  rather than invented. Nothing is derived: every figure prints as entered, and
  each row is marked `typed in` beside the computed ones so the two can never be
  read as the same kind of number. A row with no length is one still being
  filled in and is not sent.
- **What is deliberately not built:** how a floor sheet that is neither PPGI nor
  ply gets counted. The BOQ has one PPGI column and one PLY column, and today's
  top AL. chequered sheet is counted in neither — that is what HI-15279 prints.
  The shop has a printed sheet showing an SS or chequered floor; until it is
  transcribed the counting is unchanged, so no invented column can reach a
  factory. In `README.md` under "Open items".

Checked, not assumed: `npm run check` prints `ALL ROWS MATCH across 3 jobs` with
its 9 deviations and 1 plan finding across 111 tests, and a rectangle, a 6-wall
L, an 8-wall U typed wall by wall, two joined-room cases and a no-L-cut room on
an SS floor each go form → `/api/render` → BOQ → drawings with every room
drawing. The end-to-end half ran from a throwaway harness, not from the repo —
see the next steps.

One trap worth knowing: a dev server left listening on 5173 makes a later one
fail to bind silently, and every request then goes to the **old** code. It looked
exactly like a broken feature for one round. Check the port before believing a
smoke-test failure.

## What landed on 13 August

Both from one question: how do HI-15223's L-shape and HI-15279's
different-sized rooms actually get drawn?

- **L-shaped rooms can be entered.** `notched(w, l, { corner, w, d, through })`
  in `core/plan.ts` builds the six-point outline, and the calculator has a
  *Notch out of a corner* control. `ext` stays the bounding box, because the
  ceiling and floor are built to it. A notched room cannot also carry a
  partition yet — no sheet has shown that combination, so the controls are
  hidden rather than guessed at.
- **A wall in nobody's BOQ is now caught.** Rooms of different depths were
  already supported *provided the deeper room owns the wall between them*.
  Ticked the other way round, the difference silently left every total —
  290mm on HI-15279's ambient/chiller pair. `core/checks.ts` reports it, in
  mm, under the totals it is missing from. It reports rather than throws: the
  form passes through that state on the way to a valid job.
- **It immediately found one in a verified job.** HI-15191's ante room marks
  its far outside wall as the freezer's, with nothing behind it, while `at`
  and the ceiling spec both say the freezer is on the near side. The BOQ
  cannot see the difference (both are 3050 walls with one door) but the job
  plan draws the partition twice and leaves the ante open. **Not fixed** —
  it needs the HI-15191 drawing. Full reasoning in `README.md` "Open items".
- **HI-15223's 60mm is narrowed to one question.** The left wall is settled at
  3860 by its own printed chain, so the contradiction is between the right
  wall's 3555 and the notch's 365 — is the right wall dimensioned to the outer
  or the inner face of the bottom wall? Two candidate answers, both in
  `README.md`. Answer it and the room draws the same day.

## Where it is deployed

**Live at `https://panelsuite.online`** since 17 August 2026, on Hostinger,
deploying from GitHub `Mking697/Palen-Suite` (public, branch `main`, identity
`Mking697`). SSL and CDN are on; the temporary
`aqua-finch-257417.hostingersite.com` still answers. The domain is Hostinger's,
auto-renewing, and expires 2027-08-17.

Checked from outside rather than assumed: `/`, `/api/rules` and `/guide` all
answer 200, the page is the current build, and **`/api/config` hands over the
Supabase project — so accounts are wired on the live site**.

The product is named after the domain: **Panel Suite**, with the calculator as
the screen inside it. There is no company name anywhere in the repo — removed
on 17 August at the shop's request, so the tool can be sold or handed on
without a rename. Job numbers (HI-15191 and its siblings) are untouched: they
are transcribed off the drawings and are the evidence this engine is proved
against. Hostinger deploys what is on GitHub — so **push before
deploying**, or the site is built from the last push and not from this machine.

Settings that work: framework *Other*, branch `main`, **Node 24.x**, root `./`,
**build command `npm run build`**, package manager npm, output directory empty,
**entry file `app.cjs`**, and `HOST=0.0.0.0`.

**The build command is the important one, and it took three failed deploys to
get there.** The app normally has no build step because Node runs the TypeScript
directly — that is the one exotic thing about it, and a host cannot be relied on
to support it. Hostinger *built* on Node 24.x and then started the app with
something older: `import './server/serve.ts'` threw `Unknown file extension
".ts"` before a line of ours could print, stdout was not captured, and the
result was a 503 with the Runtime Logs page saying **"No logs found"** — no
error, no clue, nothing. An empty log was the evidence.

`tools/build.ts` now compiles `core/` and `server/` into `dist/` as plain
JavaScript, and **still with no dependency**: Node strips the types itself
through `module.stripTypeScriptTypes`. The entry uses `dist/` when it is there
and the TypeScript when it is not, so one entry point works both ways and
development is unchanged. The verifier is not shipped in a build — its expected
sheets are ground truth, not app — and `/api/verify` says so instead of spawning
something that is not there.

### The thing that actually caused it — worth reading before the next deploy

The build did not fix it either. Three deploys, three empty runtime logs. The
cause turned out to be the entry file, and changing it to **`app.cjs`** brought
the site up on the first try:

> **Hostinger's app server loads the entry point with `require()`, and
> `require()` cannot load an ES module.** `package.json` has
> `"type": "module"`, so `app.js` was one, and it failed **before a single line
> of ours ran** — which is exactly why nothing ever reached any log, in any
> configuration. The empty log *was* the symptom, not a missing feature of the
> host.

That is why the earlier fixes changed nothing: `HOST`, the binding rule and the
build were all correct, and none of them ever executed.

Two of them are still worth keeping. The **build** means the runtime Node no
longer matters, and a host does not tell you which Node it starts the app with.
The **`startup.log`** the entry writes beside itself means the next silence is
readable: no file means the process was never started, a file means read it.
Hostinger Business also has SSH under *Advanced*, and `node app.cjs` in the
app's folder gives the same answer in one command.

**The first two deploys returned 503, and the fix is in the repo.** Hostinger's
wizard applies its environment variables *during the build process*, so `HOST`
never reached the running app; it bound to `127.0.0.1`, the proxy got a refused
connection, and the site 503'd with nothing to say why — the build log only ever
showed `npm install`, which is not the application log.

The first attempt tried to detect a host by looking for a platform-supplied
`PORT`. That is the same mistake one step further in: **when a deploy fails, the
environment is exactly the thing that cannot be relied on.** So `server/config.ts`
now defaults to `0.0.0.0` — what a server behind a proxy needs — and the one
case we control says so on the command line: `npm run dev` passes `--local`.
`HOST`, if it arrives, still wins.

The startup log now also prints **the environment as it actually arrived**,
which is the difference between what a host's panel says it set and what
reached the process. That block is what makes the next one answerable rather
than guessable. `core/verify/config.test.ts` holds every case.

What this gave up: a bare `node server/serve.ts` on a laptop now listens on the
network. Deliberate — a silent deploy failure is the bigger harm, and the
command `GUIDE.md` tells an estimator to run is `npm run dev`.

`DEPLOY.md` now has the wizard step by step and a list of what to open once it
is up, each check failing differently so the log points somewhere. The short
version:

- **Entry file `app.cjs`.** This is the one that decided it — see below.
- Do **not** set `PORT` — the host supplies it, and overriding it is the usual
  502.
- **Set the build command.** With `npm run build` the runtime Node stops
  mattering entirely, which is the only way to be sure — a host does not tell
  you which Node it starts the app with, and its panel only shows the one it
  builds with.
- `app.js` **checks the version at startup and prints the fix** when running
  from source — but an old runtime throws before it can, which is why the build
  matters more than the check.
- The Hostinger *Import Git repository* button spins forever when Chrome blocks
  its popup — allow pop-ups for `hpanel.hostinger.com`.
- Checked on this machine in production mode, including the exact case the host
  produces — `PORT` set, `HOST` absent: it binds `0.0.0.0` and every route
  answers, `/guide` and `/api/render` included.
- **There is no login.** A temporary domain is not a secret, only unguessed.
  Accounts are `DESIGN.md` Phase 9; until then put basic auth in front of it
  before any real domain points at it.

## Accounts are built — Phase 9 landed 17 August

Sign up, confirm by email, sign in, and **File → New / Open / Save / Save As**.
The Supabase project is live (`kyzexsarilxkzwkntode`), its tables and policies
are in place, and `SETUP.md` has the SQL that made them.

- `web/auth.js` is a Supabase client in `fetch` — no dependency. It loads before
  `app.js` as a plain script, so `core/verify/web.test.ts` still runs both.
- **`/api/config` is all the server does for accounts**: it hands the browser
  the project URL and anon key **from the environment**. This repo is public and
  nothing key-shaped goes in it. The anon key belongs in a browser — it names
  the project, not a person.
- **Row level security is what keeps one estimator's jobs their own**, not any
  filter in the app. Checked, not assumed: with the anon key and nobody signed
  in, reads come back empty and an insert is refused 401.
- Only the **spec** is saved. The BOQ is always generated — a stored figure is
  how a saved job and a fresh one start to disagree.
- **Signing in comes first** — the calculator is behind the account, not beside
  it. Built the other way round at first and changed the same day at the shop's
  word; they are right about their own tool. A server with **no Supabase
  configured** still runs unlocked and says so, because gating there would lock
  the owner out with no way back in, and there would be no saved job to protect
  anyway.
- **Empty email or password is answered by the form**, not by Supabase, which
  replies "Anonymous sign-ins are disabled" — true, and useless to somebody who
  has simply not typed anything yet.

### Phase 9b — a code, a trial, and an administrator (17 August)

**The setup is done and checked against the live project.** All three columns
and both functions exist, an anonymous request still sees `[]` for both tables,
the administrator is `nantultiwari697@gmail.com`, and the backfill gave the
existing account its 14 days. A signup was taken end to end: the code arrived
from `info@panelsuite.online`, verified, and signed in.

**And the test that matters passed.** One account saved `HI-99001`; the
administrator, signed in separately, typed that exact number and got
`No job HI-99001`. Not a near miss — the full number, from the account with the
most rights in the system.

That is the whole claim of this phase in one line, and it holds because the
`jobs` policy is `auth.uid() = user_id` with **no** admin clause. An
administrator manages accounts; they do not read other people's work. Phase 9
is done.


- **Signup is verified by a six digit code**, not a link. The email template
  prints `{{ .Token }}` and the app asks for it. Worth the change on its own
  merit: a link only works if Supabase's Site URL is right, and that setting is
  invisible, defaults to `localhost:3000`, and broke this three times. A code
  depends on no URL at all.
- **A new account gets 14 days**, granted by the signup trigger. Changing the
  number is one word in `handle_new_user`.
- **`nantultiwari697@gmail.com` is the administrator**, set by the SQL in
  `SETUP.md`. *Manage users* lists everyone with their access, gives 7 / 30 /
  365 days, **Stop**s an account without losing anything, and **Delete**s one
  for good.
- **Access is enforced by the database, not the screen.** The `jobs` policy
  carries `has_access()`, so an expired account is refused by Postgres whatever
  the browser does. The screen only decides what to *say*.
- **Delete is the one thing that needs the server.** Removing a user needs the
  service key, which bypasses every policy and can never be in a browser. The
  endpoint checks the caller is an admin *against the database* — using their
  own token, which row level security limits to their own row — rather than
  believing the request. Without `SUPABASE_SERVICE_KEY` set, Delete says so and
  Stop still works.
- Two SQL functions are `security definer` on purpose: a policy on `profiles`
  that reads `profiles` sends Postgres into infinite recursion. That is the
  most common way to get RLS wrong on Supabase, and `SETUP.md` says why.
- **The three verified jobs are no longer offered in the app.** They are proof
  the engine is right, not somebody's work, and on an estimator's screen they
  were three jobs they never made sitting among the ones they did. Still
  reachable while developing through `/api/jobs` and `/api/spec`.
- **A different job number is a different job.** Save writes to whatever the
  header says, so opening a job, changing its number and saving forks it and
  leaves the original alone — and the message says "saved as a new job" so it
  does not read as an overwrite. **File → Delete this job** removes one.
- The administrator can type **any number of days**, not only 7 / 30 / 365.

### What the shop asked for after using it (17 August)

- **The form no longer jumps.** It is rebuilt from the state on every change —
  that is what keeps the screen and the payload identical — but it was throwing
  away the caret and scrolling to the top mid-typing. `renderForm` now restores
  the focused field and the scroll position.
- **The door's module, frame and leaf are all typed**, none worked out from the
  others. When they do not add up the difference is *stated* in millimetres
  rather than one of them being moved: these come off a drawing, and a tool that
  shifts the number beside the one you edited is a tool nobody checks.
- **The floor's top sheet is optional**, behind a tick. Off, it neither prints
  on the sheet nor thins the core — a layer nobody fits must not eat foam.
- **A phone works.** One column, thumb-sized controls, 16px inputs so iOS does
  not zoom, menus that open inwards, and the drawing sheet scrolling inside its
  own box rather than dragging the page sideways.
- **`GUIDE.md` opens with a worked example** — a real 3050 × 4575 freezer in six
  steps, written for somebody who has never seen the tool.

**One thing to watch, found the hard way twice:** widening a policy can break an
assumption the app never wrote down. `profiles?…&limit=1` was correct while
every user could read exactly one row, and quietly wrong the moment an admin
could read all of them — it handed the administrator somebody else's profile.
Anything that reads a single row should name it.

Everything on the hosting and Supabase side is in place: the environment
variables (`/api/config` proves it), the Site URL, all three Redirect URLs, and
`panelsuite.online` authenticated in Brevo. The last step is Brevo's SMTP
credentials going into Supabase, and then the live test — sign up, confirm by
email, save a job, and check from a second account that it cannot be seen.

### Rotate the Brevo keys once it is working

Two Brevo keys were pasted into a chat while getting this working, knowingly, to
get live the same day: an **API key** (`xkeysib-…`, not used by anything yet) and
the **SMTP key** now in Supabase. Neither is in the repository and neither ever
should be — they live in Supabase's SMTP settings and, later, in Hostinger's
environment variables.

**Replace both once signup is confirmed working.** In Brevo, delete and
regenerate under *SMTP & API*; paste the new SMTP key into Supabase's SMTP
settings. It takes a minute, and it makes the old ones worthless, which is
cheaper than reasoning about who might have seen them. This is not urgent — it
is a loose end, and loose ends are what `STATUS.md` is for.

Also removed on 17 August: the form's **BOQ group** field. It was declared,
sent, and never read — `buildJob` maps rooms one to one. Merging is Phase 3.
`RoomSpec.boqGroup` stays in the types, marked as not implemented, because job
files may carry it and Phase 3 will use it.

## Agreed on 17 August, written up but not started

**Accounts, saved jobs, Google and email** — `DESIGN.md` Phases 9–12, written
there in full before any code, which is what the shop asked for. The four
decisions are taken and recorded: Google through the estimator's **own Apps
Script Web App** (so no Google credential ever reaches this repo), email through
an **HTTP email service**, attachments as a **real `.xlsx` and a real vector
PDF** written by hand, and the plan written down first.

Read that section before starting. The three things it turns on: a URL alone
cannot write to Google, the folder and sheet being public means anyone with the
link reads every job in them, and no key can live in this repo because it is
public. Phase 9 — login, saved jobs, the File menu — is the foundation the other
three stand on.

## What to do next

**Everything is pushed and live.** `073ae0f..f257bcb` went to `main` on 21
August and Hostinger had it up in about twenty seconds. See *What is live*
below for what was checked from outside.

**Next, asked for by the shop: finish getting a job out of the tool.**
Five things were asked for on 18 August; the first is built, the rest are not.
In dependency order, because each needs the one before it:

1. ✅ **Profile settings** — Drive folder URL, Sheet URL, script URL, mail from.
   Built 18 August, and **`sql/04-profile-fields.sql` has been run on the live
   project** the same day. Checked from outside rather than taken on trust:
   all six profile columns answer on `kyzexsarilxkzwkntode`, where
   `drive_folder_url` and `sheet_url` had both replied *"does not exist"* before
   it ran — and an anonymous read of `profiles` and `jobs` still comes back `[]`,
   so nothing was widened on the way.
2. ✅ **The workbook and the PDF** — Phase 10, built 18 August. `core/export/`,
   `/api/export`, and the two download buttons. The bytes those buttons produce
   are the bytes Phases 11 and 12 send; nothing is rebuilt for a different
   destination, because two builds are two chances to disagree.
3. ✅ **Email** — Phase 12, built 18 August. The button, the form, both
   attachments, and every refusal answered in words an estimator can act on.
   **Two environment variables away from working**: `BREVO_API_KEY` and
   `MAIL_FROM` in Hostinger. Until they are set the button says so.
4. **Google — Sign in with Google, then Drive and Sheet** — Phase 11, and the
   next thing to build. Its shape changed on 18 August; read the section above
   before starting. In order: an OAuth client in Google Cloud, a **Connect
   Google** button on the settings screen, refresh tokens in `profiles`, then
   `/api/push` — file the two exports into the estimator's folder under the job
   number and append the BOQ rows to their sheet with the timestamp and job
   number on every row. **`job_exports` has no SQL file yet** — it is specified
   in `DESIGN.md` and needs writing. A push that silently did nothing is the
   worst outcome here: the estimator would believe the drawing office has the
   sheet.

Then, in rough order of value:

5. **Look at the app in a real browser.** Still outstanding from 14 August and
   now bigger: the drawing sheet, the 3D view, the door swing on the plan and
   the new guide page have all been verified headless, and none of them has been
   *seen*. `npm run dev`, then the Guide button, a door with a hand on it, and a
   room over 3050 high.
6. **Transcribe HI-15191's printed flashing rows** — Inner PP, Outer PP, Flat
   Strip and U flashing 120/60, with profile and RMTR. The shop is sending them.
   They settle the one rule in the engine that no sheet backs, and the older
   finding that perimeter estimates missed those figures both ways. The 17
   August open-end rule rides on the same reckoning and is settled by the same
   rows.
7. **Get the printed sheet for a floor that is not PPGI + ply** — the shop has
   one. Transcribe it as a job + expected pair and it settles how SS and
   chequered layers are counted, which is the one part of the floor build-up
   left unbuilt.
8. **A printed sheet from a job with walls over 3050** would be the first that
   can check the door top panel at all — its size, its blank, and whether the
   shop splits it when the door module is wider than the panel module. The
   engine makes one panel and does not split.
9. **Rotate the two Brevo keys** — see the section above. Not urgent, and it
   stops being a loose end the moment Phase 12 puts the API key to work.
10. **The rest of Phase 4 in `DESIGN.md`** — machine maximum panel length and the
    ceiling light cutout. Both in the legacy calculator, neither in this engine.
    The door top panel is done, on the shop's own rule rather than legacy's.
11. **Phase 3** — deriving partitions from geometry rather than a tick, which
    unlocks HI-15279's Ambient+Milk block and HI-15252.

## What must not be done

`CLAUDE.md` has the rules; these two matter most and have both nearly been
broken already:

- **Never work backwards from a BOQ sheet to the input.** If a number does not
  match, that is a finding. HI-15223 is the live example: its transcribed wall
  lengths do not close a polygon, out by exactly one wall thickness. It stays
  broken and documented rather than being nudged into place.
- **A drawing never counts anything.** It places what `layoutRoom` worked out.
  `core/verify/draw.test.ts` holds this.

## Open questions for the shop

In `README.md` under "Open items" — ten of them. The two worth asking first,
because both unblock a drawing and both are one-line answers:

1. **HI-15223** — is the right wall's 3555 measured to the bottom wall's outer
   face or its inner face? Either answer closes the polygon.
2. **HI-15191** — is the ante room above the freezer or below it, and which
   wall carries its own door?

Then: trapezoid blanking (blocks angled rooms), which wall runs through a
corner-less junction, the real machine maximum panel length, and whether a door
leaf is the wall thickness or fixed by door type.

New on 17 August, and both drawing-only so nothing is blocked on them: **which
end an LHS door is hinged on**, and **whether a cold room door swings out rather
than in**. The plan currently hinges LHS at the start of the opening reading the
wall from outside, and opens the leaf inwards; both live in `drawSwing` in
`core/draw/roomplan.ts`.

## Chat history

Claude Code keeps transcripts outside the repo, under
`%USERPROFILE%\.claude\projects\<slugified-cwd>\`. Opening a different folder
makes them look lost — they are not. `npm run chat-backup` copies them into
`.chat-backup/` as raw `.jsonl` plus readable markdown. That folder is
gitignored and does **not** travel with the repo.
