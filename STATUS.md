# Where this stands

Read this first if you are picking the project up — on this machine or another.
`README.md` says what the engine does, `DESIGN.md` says where it is going, this
file says what has actually happened and what is next.

Last updated: 14 August 2026.

## What exists and works

`npm run dev` opens the **Panel Calculator** at `http://127.0.0.1:5173` — one
screen, form on the left, drawings and BOQ on the right, updating as you type.
That is the product. The three verified jobs are now only a *Load example*
dropdown: proof the engine is right, not the thing anyone uses.

| | State |
|---|---|
| BOQ engine (`core/`) | verified line by line on HI-15191, HI-15223, HI-15279 |
| Plan geometry (`core/plan.ts`) | rooms are polygons; walls, corners, butts and partitions compile from the outline. `rect`, `notched` and `chain` build it — any number of walls, any right-angled shape |
| Cross-room checks (`core/checks.ts`) | a wall handed to a neighbour that is not there to take it is reported, in mm |
| Drawings (`core/draw/`) | job layout, wall elevations, ceiling, floor, door elevation — SVG + DXF. All of it on **one sheet** (`sheet.ts`), any view clickable to open full size |
| 3D (`core/draw/model3d.ts`) | the same panels stood up, behind a 2D/3D toggle. Orbit, standard views, click a panel for its size. No library |
| Flashing (`core/flashing.ts`) | inner, outer and U per room by the running metre, plus any number typed in. **The one rule with no sheet behind it** |
| Calculator (`server/`, `web/`) | multi-room, connected rooms, rooms of any right-angled shape typed wall by wall, per-wall sheets, doors, the L cut on or off, floor build-up and run direction, flashing |
| Tests | 125, plus the line-by-line sheet diff |

`npm run check` must print **`ALL ROWS MATCH across 3 jobs`** with 9 documented
deviations and **1 plan finding** (HI-15191's ante room — see below). It did at
the last commit. If the ROWS line changes, stop and find out why before doing
anything else.

Two things are checked but **not by anything in the repo**: the browser form and
the 3D maths. Both were exercised from a throwaway `node:vm` harness with a stub
DOM. Landing that harness is next step 1, and the reason is on the record — an
undefined identifier once survived a whole session in `web/app.js`.

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

Nowhere yet. The repo is on GitHub at **`Mking697/Palen-Suite`** (public,
branch `main`, identity `Mking697`).

A Hostinger **Business Web Hosting** plan is being set up via *Add website →
Deploy Web App → Import Git repository*. Left off mid-wizard. What was learnt:

- GitHub repository access is limited to `Palen-Suite` and saved.
- The Hostinger *Import Git repository* button spins forever when Chrome blocks
  its popup. Allow pop-ups for `hpanel.hostinger.com`, or fall back to
  *Upload your files* with a ZIP from GitHub.
- **The unresolved question is the Node version.** There is no build step
  because Node runs the TypeScript directly, which needs **>= 22.6**. If
  Hostinger only offers 18 or 20 the app will not start — the error looks like
  `Unknown file extension ".ts"`. The options then are to compile to JavaScript
  before uploading, giving up the no-dependency rule, or to use a VPS.
- Settings to enter: build command empty, start command `npm start`, entry
  `app.js`, environment `HOST=0.0.0.0`. Without `HOST` the app stays on
  localhost and the site returns 502 — that default is deliberate.
- **There is no login.** Deployed as-is, anyone with the URL gets the
  calculator and the engine. Decide on access control before pointing a real
  domain at it.

See `DEPLOY.md` for the full hosting notes.

## What to do next

In rough order of value:

0. **A guide book in the app itself.** Agreed 14 August, to build next: a panel
   on the home page — top, to the side — that says how to use the calculator,
   so an estimator does not have to be told or sent to `GUIDE.md`. `GUIDE.md`
   is already written in the estimator's own language and is the obvious source;
   the open question is whether the panel renders it, or is written separately
   and kept in step. Decide that first — two copies of the same instructions
   drift, and the one on screen is the one that gets read.
1. **The form has no test.** `core/` is verified line by line and `web/app.js`
   is not covered at all, which is how a call to an identifier that was never
   defined survived a whole session and would have reached the estimator. It has
   no imports, so it runs as a plain script in a `node:vm` context with a stub
   DOM — enough to render each shape mode, build the spec and post it to
   `/api/render`. That is what the 14 August check ran from, as a throwaway;
   it belongs in the repo as `core/verify/form.test.ts` or similar.
2. **Transcribe HI-15191's printed flashing rows** — Inner PP, Outer PP, Flat
   Strip and U flashing 120/60, with profile and RMTR. The shop is sending them.
   They settle the one rule in the engine that no sheet backs, and the older
   finding that perimeter estimates missed those figures both ways.
3. **Get the printed sheet for a floor that is not PPGI + ply** — the shop has
   one. Transcribe it as a job + expected pair and it settles how SS and
   chequered layers are counted, which is the one part of the floor build-up
   left unbuilt.
4. **Finish the Hostinger deploy** — the Node version answer decides everything
   else. Try a temporary domain first, not `hicon.co.in`.
5. **Phase 4 of `DESIGN.md`** — machine maximum panel length, door top panel,
   ceiling light cutout. All present in the legacy calculator, none in this
   engine.
6. **Phase 3** — deriving partitions from geometry rather than a tick, which
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

## Chat history

Claude Code keeps transcripts outside the repo, under
`%USERPROFILE%\.claude\projects\<slugified-cwd>\`. Opening a different folder
makes them look lost — they are not. `npm run chat-backup` copies them into
`.chat-backup/` as raw `.jsonl` plus readable markdown. That folder is
gitignored and does **not** travel with the repo.
