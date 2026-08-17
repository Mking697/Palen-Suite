# Panel Suite

Live at **https://panelsuite.online**. See `DEPLOY.md` for how it is hosted and
`SETUP.md` for the accounts behind it.

PUF panel wall / ceiling layout and SHEET FABRICATION BOQ engine for cold room
projects (freezer, chiller, ante, ambient).

The engine takes the dimensions off a WALL PANEL LAYOUT drawing and generates
the production BOQ — panel sizes, blank sizes, PPGI and PLY counts, chemical
weight and area — with no BOQ figures fed in as input.

## Status

| Job | Rooms | Verified |
|---|---|---|
| HI-15191 | Freezer 120mm + Ante 60mm | ✅ 30/30 rows, all totals exact |
| HI-15223 | Chiller 60mm, L-shape + butt joint | ✅ 24/24 rows, panels/weight/area exact — PPGI deviates, see below |
| HI-15279 | Freezer 100mm + Chiller 60mm, panelised floor | ✅ 35/35 rows, all totals exact — 2 door-blank deviations |
| HI-15279 | Ambient + Milk 60mm merged block | ⬜ needs BOQ-group merging, partition panels, Door TOP |
| HI-15252 | Freezer 120 + Chiller 60 + F&V 60, module 1030 | ⬜ not yet |

169 unit tests, 3 jobs verified line by line, no dependencies. A local viewer
(`npm run dev`) renders the generated sheet and its drawings, runs the verifier
in the browser, and lets you rebuild from an edited input. The two browser
scripts are covered too — `core/verify/web.test.ts` boots them headless in a
`node:vm` context with a stub DOM.

A room is a closed polygon; its wall list is compiled from that outline, and
the drawings read the same outline the BOQ reads — so a drawing cannot show a
panel the sheet did not price. 4 of the 5 verified rooms are on outlines; see
`DESIGN.md` for where this is going.

## Run

```
npm run dev     # local viewer at http://127.0.0.1:5173
npm test        # splitRun unit tests + engine sensitivity checks
npm run verify  # line-by-line BOQ diff against the production sheet
npm run check   # both
npm run build   # deployment only: dist/ as plain JavaScript
```

Needs Node >= 22.6 (TypeScript runs natively, no build step for development).

`npm run build` exists for hosts, not for development. It compiles `core/` and
`server/` into `dist/` as plain JavaScript with **no dependency** — Node strips
the types itself through `module.stripTypeScriptTypes` — so a host that starts
the app on an older Node than it built with still runs it. `app.js` uses `dist/`
when it is there and the TypeScript when it is not. See `DEPLOY.md`.

### The calculator

`npm run dev` opens the Panel Calculator — one screen, form on the left, live
output on the right. Type the dimensions off the layout drawing and the
drawings and the SHEET FABRICATION appear as you type. There is nowhere else to
go and nothing else to press.

- **Rooms** — one or many. `+ Room` adds another; each gets its own tab in the
  form and its own drawings and BOQ block in the output.
- **Any right-angled shape** — a room is a **wall chain** underneath: a length
  per wall and the turn taken at its end, which is exactly how a WALL PANEL
  LAYOUT dimensions one. Four walls or twelve; an L, a U, a run of steps.
  *Rectangle* and *Notch out of a corner* are not different kinds of room, only
  quicker ways in — both fill the same chain, and *Custom — wall by wall* opens
  it for editing seeded from whatever was already on screen, so switching mode
  loses nothing. Width and length stay the whole bounding box, because the
  ceiling and the floor are built to it — HI-15223's sheet prints one full
  2530 x 3800 ceiling straight over its notch. Where the outline turns back into
  the room it is a re-entrant corner: never a corner panel, one wall running
  through and the other butting into its face and losing a wall thickness. Which
  is which comes off the drawing and is asked for rather than guessed.
- **A chain that does not close says so, in millimetres.** The walk that misses
  its own start is reported and never corrected — HI-15223's printed chain
  misses by exactly one wall thickness, and that is a finding to take back to
  the drawing, not something to absorb.
- **Connected rooms** — *+ Room on this side* builds the next room against a
  wall. The wall stays with the room it was drawn on and the new room marks its
  facing side as *neighbour's wall*, which removes that wall, suppresses the
  corner panel at both its ends, and drops the ceiling notch on that side. It
  is what makes an ante room come out with 3 walls and 2 corner panels instead
  of 4 and 4 — and it leaves the partition, with its door, on the room that
  owns it, exactly as HI-15191 prints it.
- **Doors** — on any wall the room owns, including a partition. Type, core,
  clear opening, both leaf sheets, and an optional position from either end.
  Left blank, the drawing centres the door; the BOQ is unaffected either way.
  A door can also state **which hand it is hung on**, LHS or RHS: that drives
  the `(LHS)`/`(RHS)` token in its own printed label and draws the leaf and its
  swing on the plan. Unstated, the label prints exactly as transcribed and no
  swing is drawn — a drawing does not invent a fact about the building, which
  is also why the three verified jobs are untouched by it.
- **Door top panel** — above `DOOR_TOP_MIN_WALL_HEIGHT` (3050mm of wall) the
  piece over the door is made as its own panel, the door module wide by the
  wall height less the clear opening, blanked +40 with the inner skin set back
  by the L cut like any other wall panel. The door assembly then prints at the
  clear height rather than the full wall, so that stretch of wall is counted
  exactly once. Below the threshold nothing changes: the assembly is the full
  height, which is what all four source sheets print — every one of them is
  2590 or 2745 high, so none of them can check this rule either. From the shop,
  17 August 2026.
  Each door gets a **typical elevation** like the issued drawing: the frame leg
  either side of the leaf, the AL. chequered sheet up from the bottom, the door
  lift, the ceiling panel over and the puf slab under. Frame and leaf are held
  to `frame + leaf + frame = module`, so the drawing and the blank size can
  never describe two different doors.
- **Corners and butt joints** — a corner panel at each outside corner by
  default, and each one can be turned off per junction, because the shop does
  not always fit one. **Where a butt joint lands there is no corner panel**: at
  a corner-less junction one wall runs straight through and the other butts into
  its face, losing a wall thickness where a corner would have taken a leg. The
  two can never share an end — `compileWalls` takes one branch or the other, and
  `core/verify/plan.test.ts` holds it across every verified room. The wall card
  states which one an end has and what it costs that wall. The plan dimensions
  every corner leg, so the chain along a wall adds up to the wall.
- **Flashing** — inner, outer and U on every job, totalled in running metres and
  kept out of the panel counts because it is a separate purchase. The sheet it
  is folded from is picked per room. A butt joint adds a wall height of inner
  and one of outer where it lands, and **an open wall end** — the junction where
  a room hands its wall to the room next door, so there is neither a corner
  panel nor a butt — is closed vertically for the room's whole height. One
  partition gives exactly two of them, one at each corner. A plain rectangular
  room takes inner there; a shaped one — an L, a U, anything past four walls —
  takes inner and outer both. The shape is read off the outline, never off the
  mode the room was typed in, because the same room entered two ways must not
  produce two different sheets. See "Open items": this is the one rule in
  the engine with no printed sheet behind it yet.
- **Extra flashing** — anything the three computed types do not cover is typed
  in: a gutter, a hanging flashing, a second U. Type, sheet, thickness, width
  and length per row, as many rows as the job needs, from the same seven types
  the legacy calculator offered. Nothing about them is derived — they print as
  entered and are **marked `typed in`** beside the computed rows, so the two are
  never confused. A row with no length yet is one still being filled in and does
  not reach the sheet.
- **The L cut** — the rebate that shortens a wall's inner skin, lets the ceiling
  notch into the wall and narrows a corner panel's inner skin. It is cut **as
  deep as the ceiling is thick**, so the ceiling drops in from above and
  finishes flush. Fitted by default above `L_CUT_MIN_WALL_TH` (50mm) and turned
  off per room, because some customers do not want it. Without it the inner skins run the full height, the
  corner inner matches its outer, and the ceiling runs the full external size.
  All four source sheets are 60, 100 or 120mm and every one carries the cut, so
  the default never moves a verified figure.
- **Floor** — a one-piece puf slab at the external size, or panelised on its own
  module. A panelised floor also picks **which way its panels run**, width or
  length, the same choice the ceiling has; the slab has no direction because it
  is not split. Turning a floor round moves the cuts and nothing else — the area
  it covers is identical, which `core/verify/split.test.ts` asserts.
- **Floor build-up** — a panelised floor states its four layers bottom up: the
  bottom sheet, the puf core, the sheet above it and the top sheet, each with
  its own material and thickness. The ply is not fixed; the shop also builds
  inner ply + chequered sheet, or outer ply + SS. **The panel never grows**: the
  floor thickness is the whole build-up, so a 12mm ply and a 2mm chequered plate
  on a 100mm floor leave an 85.6mm core, not a 114mm panel. The core is
  therefore derived and never typed in, and when the sheets come to more than
  the panel the form says so instead of building something else. A job that
  states `desc` instead prints it exactly as transcribed, which is how the
  verified jobs stay untouched.
- **2D / 3D** — a toggle above the sheet, 2D by default and 2D is the drawing of
  record. 3D stands the same panels up: `core/draw/model3d.ts` turns each one of
  `layoutRoom`'s wall widths, ceiling stripes and floor panels into a face in
  space, and the browser orbits it on a canvas. Standard views — **Iso, N, E,
  S, W, Top** — sit beside the drag, the way a CAD viewer offers them; a compass
  letter is the elevation you are looking at. **Clicking a panel prints its
  own size** — panel, blank, whether it is a full module — read off the model,
  not measured on screen. It obeys the same rule as the flat drawings: the 3D
  view counts nothing of its own, and `core/verify/draw.test.ts` holds every
  face to the width the BOQ priced. Nothing exports from 3D; it is for reading
  the job, not issuing it. No library — the geometry is right-angled boxes, so
  it is an orthographic projection with a painter's sort, which keeps the
  no-dependency rule intact.
- **Sheets** — outer and inner skin per wall, and separately for a door leaf,
  from the six materials the shop stocks with their own thickness ranges. Two
  walls in different sheets print as two BOQ rows. Everything defaults to
  PPGI 0.4, which is what all four source sheets use throughout.
- **Output** — every view of the job on **one drawing sheet**, the way a drawing
  office issues them: the WALL PANEL LAYOUT first, with the rooms where they
  actually sit — sharing a wall means touching along it — then each room's plan,
  one elevation per wall, the ceiling, the floor and the door, each in its own
  framed cell with its title under it. `core/draw/sheet.ts` composes it by
  **translation only**: nothing is scaled or redrawn, so the sheet is 1:1 in
  millimetres and exports as one DXF. A cell is sized from what a view really
  occupies — dimension chains and labels included, not just the room — so no
  view leans into its neighbour's frame, and `core/verify/draw.test.ts` holds
  that. **Clicking a view opens it on its own, full size**, and the sheet says
  where each one sits so the click finds it. Any single view still exports on its own,
  because that is what goes to the machine. The SHEET FABRICATION tables follow
  below, one per room, unchanged. DXF comes out on the layers the drawing office
  expects (`WALL`, `PANEL`, `DOOR`, `DIM`, `LIGHT`, `TEXT`, `CUT`). Print gives the lot as a job
  pack.
- **Accounts** — sign up, confirm by email, and each estimator's saved jobs are
  their own. **Row level security in the database is what makes that true**, not
  a filter in the browser: every policy is `auth.uid() = user_id`, so a request
  without a session is refused by Postgres whatever the client asks for. The
  header's **File** menu is New / Open / Save / Save As, and `unique (user_id,
  job_no)` makes Save an upsert — two estimators may each have their own
  HI-15191. Only the job's **spec** is stored; the BOQ is always generated,
  because a stored figure is how a saved job and a fresh one start to disagree.
  **Signing in comes first**: the calculator is behind the account, not beside
  it. Signup is verified by a **six digit code** rather than a link — a link
  only works if Supabase's Site URL is right, and a code depends on no URL at
  all. A new account gets **14 days**, and an **administrator** grants more,
  stops an account without losing its jobs, or deletes one for good. **Access
  is enforced by the database**: the `jobs` policy carries `has_access()`, so
  an expired account is refused by Postgres whatever the screen does. The one exception is a server with no Supabase configured, which runs
  unlocked and says so — gating there would lock everyone out, owner included,
  with no way back in from the screen, and with no Supabase there is no saved
  job to protect either. `SETUP.md` has the one-time setup.
- **Open job no** — type a job number in the header and it opens in the form.
  It is a search box rather than a picker because an estimator reads the number
  off the drawing, and a list stops being a way to find anything past a
  screenful; clicking it still offers everything it knows. Today that is the
  three verified jobs, so it doubles as the way to inspect the numbers the
  engine was proved against.
- **Guide** — a button in the header opens `GUIDE.md` as a page, in a new tab so
  a half-typed job is not lost. The page renders the file itself rather than
  repeating it: two sets of the same instructions drift apart, and the one that
  gets read is the one on the screen.

- **Walls in nobody's BOQ** — connected rooms need not be the same size, and
  when they are not, the whole wall between them belongs to the deeper room.
  Ticked the other way round, the difference is built by nobody: 290mm of wall
  vanishes out of every total. `core/checks.ts` walks the job's rooms against
  each other and prints what is missing, in millimetres, under the totals it is
  missing from.

An input the engine cannot honour — a non-right-angled room, a `panels` list
that does not sum to its run — stops with the reason. Nothing is guessed to
make the page render.

The old single-file calculator stays reachable at `/legacy` for reference.

## Layout

```
core/types.ts               domain model
core/rules.ts               shop constants and presets
core/plan.ts                room outline -> wall list (compileWalls; rect,
                            notched and chain build the outline)
core/flashing.ts            inner / outer / U flashing, by the running metre
core/checks.ts              cross-room checks — a wall handed to a neighbour
                            that is not there to take it
core/split.ts               splitRun — the panel splitting rule
core/layout.ts              room -> wall / ceiling / floor panels
core/boq.ts                 SHEET FABRICATION generator
core/format.ts              Excel-compatible half-up rounding
core/draw/                  plan, elevation, ceiling, floor -> SVG and DXF
core/draw/sheet.ts          many drawings -> one 1:1 sheet, by translation only
core/draw/model3d.ts        the job as flat faces in space, for the 3D toggle
core/jobs/                  job inputs, transcribed from drawings only
core/verify/                expected sheets + diff runner + tests
core/verify/web.test.ts     web/app.js and web/guide.js, booted headless in a
                            node:vm context with a stub DOM
server/serve.ts             local dev server (node:http, no dependencies)
server/config.ts            where the server binds, and why — its own file so
                            it can be tested, since serve.ts listens on import
web/auth.js                 accounts and saved jobs — a Supabase client in
                            fetch, no dependency. The database's row level
                            security is what keeps one user's jobs their own
web/                        the viewer — plain HTML/CSS/JS, no build step
web/guide.js                GUIDE.md rendered as the in-app guide page
tools/build.ts              core/ + server/ -> dist/ as plain JavaScript, for a
                            host whose runtime Node cannot read TypeScript. No
                            dependency: Node strips the types itself
tools/chat-backup.ts        exports Claude Code session transcripts
legacy/index.html           the original single-file calculator, kept for
                            reference — its SVG drawing and DXF writer will be
                            ported into the new engine
```

## Verified shop rules

All derived from and checked against HI-15191, HI-15223, HI-15252, HI-15279.

```
blankWidth        = panelWidth + 40            (butt joint outer used +100)
blankLength       = panelLength
wallInnerHeight   = wallHeight - ceilingThickness    <- the L cut, cut as deep
                    as the ceiling is thick so the ceiling drops in from above
ceilingSpan       = ext - wallThickness/2 per own wall end (0 at a partition)
                    both of the above only while the L cut is fitted
floorCore         = floor thickness - every sheet in the build-up
floorSpan         = internal clear, slab and panelised alike — a wall never
                    stands on the floor
cornerOuterWidth  = 2 x cornerLeg
cornerInnerWidth  = cornerOuter - 2 x wallThickness + 5
buttJointOuter    = blank +100 (not +40); inner skin is 50 narrower than outer
buttEndRun        = wall length - one wall thickness at that end
areaSqmt          = panelW/1000 * panelL/1000 * qty  (panel size, not blank)
chemWeight        = areaSqmt * thickness/1000 * density
uFlashingProfile  = 10x40x(thickness + 2)x40x10
flashingWidth     = wallThickness + 2                <- from the shop, not a sheet
flashingRmtr      = 2 x (extW + extL) per type; a butt joint adds one wall
                    height of inner and one of outer; an open wall end adds one
                    room height — inner alone on a rectangle, inner and outer on
                    a shaped room                    <- from the shop, not a sheet
doorTopPanel      = doorModule x (wallHeight - clearH), only above a 3050 wall;
                    the door assembly then prints at clearH, not wallHeight
                                                     <- from the shop, not a sheet
wallframeVertical = 1220 x (wallHeight + 15)
```

PPGI per panel: roof 2, wall 2, corner 2, partition 2, floor 1, door assembly 4.
PLY: panelised floor only, 1 per panel.
A door consumes one module off its wall and is listed as a separate assembly.

### Panel splitting

```
run = wall length - corner legs - door module
n   = floor(run / module)
bal = run - n * module
if bal < minPanelWidth:  give one module back and split the balance equally
```

This is what produces the 635+635 / 613+613 / 563+563 pairs on the sheets
instead of a full module plus an unusable offcut. Auto mode never needs more
than two pieces; a three-or-more way split is a deliberate override
(`balancePieces`).

## Sheet deviations found

Where a sheet contradicts the rule the other three follow, the engine keeps the
rule and the diff prints the disagreement as `!`. Nothing is fitted to a sheet.

- **All three puf slab floors are sized to the room's external envelope**, as if
  the slab ran on under the walls — HI-15191's two rooms and HI-15223's one. The
  shop says the floor sits *between* the walls and no wall ever stands on it, so
  the engine takes the internal clear span and these three rows are recorded
  rather than followed. It is the largest deviation in the set: HI-15191's
  freezer drops from 13.95375 m² to 12.18135 m². HI-15279's panelised floors
  were already internal and still match line for line, which is the reason to
  believe the rule over the slab rows.
- **HI-15223 PPGI totals 32, the rule gives 38.** That sheet prints one skin per
  roof panel where HI-15191, HI-15252 and HI-15279 all print two (+4), and
  leaves two door-assembly PPGI cells blank that the others fill (+2). Panel
  count, chemical weight and area all match exactly.
- **HI-15223 row order** puts the 360 wall before the 365 one; every other
  group on every sheet is widest first, which is what the engine does.
- **HI-15279 prints its 60mm door blanks 10mm narrower** (952/962 instead of
  962/972) for the same 860x1980 opening that HI-15191, HI-15223 and HI-15252
  all blank at 962/972. The 100mm door on the same sheet matches the preset, so
  this looks like a slip in the 60mm rows.
- **HI-15279 Ambient + Milk block omits its floor rows from every total** —
  panels, PPGI, weight and area are all short by exactly the two floor lines
  (3 panels, 3 PPGI, 9.35 m², 22.45 kg).

## Draftsman overrides

The automatic split rule is a default, not a law. Two per-wall escapes exist
because the drawings use them:

- `equalPieces: n` — split the whole run into n equal panels. HI-15279's
  freezer door wall does this so the door sits centred: `300 | 810 | door 1180
  | 810 | 300`.
- `panels: [...]` — the exact widths off the drawing. HI-15279's chiller door
  wall splits its 440 balance into 240 + 200, which no rule produces. The list
  must add up to the run or the build throws.

Both are recorded in the job file with a comment saying what the drawing shows.
Reaching for them to make a total line up is the one thing that would make this
engine worthless — see `CLAUDE.md`.

## Open items

- **HI-15191's ante room hands over the wrong side.** The new cross-room check
  reports it: the ante marks edge 0 — its far, outside wall — as the freezer's,
  and nothing stands behind it. Two other statements in the same job file say
  the freezer is on the *near* side instead: `at: [0, -1525]` puts the ante
  above a freezer that spans y 0..4575, and the ceiling's
  `lEnds: ['own', 'shared']` is commented "near end is the freezer's wall". So
  `shared` looks like it belongs on edge 2, and the ante's own door — which has
  to be on a 3050 wall for the BOQ to split the way the sheet does — on edge 0.
  The BOQ cannot tell the difference, because both are 3050 walls with one
  door; the job plan can, and today it draws the partition twice and leaves the
  ante open on its outside face. **Not changed without the drawing** — the job
  file is transcribed from it, and guessing which way round it goes is exactly
  what this repo does not do.

- **How a floor sheet that is not PPGI or ply gets counted.** The BOQ has one
  PPGI column and one PLY column. A panelised floor counts 1 PPGI and 1 PLY per
  panel, and the top AL. chequered sheet — which HI-15279 prints in its
  description — is counted in **neither**. That is what the sheet does, so it is
  what the engine does. Now that the build-up can name SS or a chequered sheet
  in place of the ply, those columns no longer describe the panel. **Waiting on
  a printed sheet** showing one of these floors; the shop has one. Until it
  arrives the counting is unchanged, so no invented column can reach a factory.

- **A partition on one of two walls that face the same way.** A room of any
  shape can now carry a partition — the shape controls are no longer hidden once
  it does, only warned about, because moving the shape moves the shared wall.
  What is still unanswered is narrower: an L-shaped or stepped room can have two
  walls facing the same side, and the ceiling is built to the bounding box, so
  that side has one end spec for both of them. The calculator counts a side as
  the neighbour's only when *every* wall facing that way is. One of two being a
  partition would need a ceiling spec no verified sheet shows, so it is left
  alone rather than guessed at.

- **HI-15223's wall lengths do not close a polygon.** Walking its six walls
  round, the horizontal chain closes exactly (`2590 - 1600 - 990 = 0`) but the
  vertical chain is out by exactly one wall thickness
  (`3555 + 365 - 3860 = +60`). It is the side carrying all three butt joints,
  so the chain is probably mixing outer-face and inner-face dimensions there,
  but which wall is measured to the other face cannot be decided from the
  numbers. The BOQ is unaffected — the engine subtracts per wall and never
  closes the loop, which is why this only surfaced once the plan geometry was
  modelled.

  Working the R3 drawing through narrows it to **one question with two
  answers**. The left wall is settled at 3860 by its own printed chain
  (`300 + 1140 + 1180 + door 1180 = 3800`, i.e. 3860 less one butt); 3920 would
  print 1200 where the drawing prints 1140. That leaves the right wall's 3555
  and the notch's 365 as the pair that cannot both be right, and both are
  printed panel figures:

  | | right wall edge | notch edge | then the sheet's |
  |---|---|---|---|
  | A | 3495 | 365 | 895 panel should read 835 |
  | B | 3555 | 305 | 365 panel should read 305 |

  So: **is the right wall dimensioned to the outer face of the bottom wall or
  its inner face?** One answer closes the polygon and the room is drawn the
  same day — `notched(2590, 3860, { corner: 'SE', w: 1600, d: … })` is in
  `core/plan.ts` waiting for the number, and the calculator can enter the shape
  today. Neither is being picked here.

- `minPanelWidth` is now pinned to **150** from both sides: HI-15279's ambient
  ceiling rejects a 130 balance, and HI-15252's F&V keeps a 150 wall panel.
- Density: every source sheet computes at exactly **40 kg/m³**, which sits at
  the floor of the stated 42±2 spec. Default is 40 so past jobs reproduce
  exactly; if production really runs at 42 the sheets under-estimate chemical
  by ~5% (~41 kg on HI-15252).
- **Flashing is built to the shop's formula but not yet checked against a
  sheet.** The rule now in `core/flashing.ts` came from the shop on 14 August
  2026: three types on every job, running metre `2 x (extW + extL)` each, width
  `wallTh + 2`, and a butt joint adding one wall height of inner and one of
  outer. On 17 August the open wall ends at a partition were added on the same
  footing — one room height each, inner alone on a rectangle and inner plus
  outer on a shaped room. This file previously recorded that **perimeter-based
  estimates land both above and below HI-15191's printed figures**, which is a
  live disagreement — either that comparison was wrong, or the sheet carries
  something the formula does not, and these two extras are the candidates.
  HI-15191's printed flashing rows are coming; transcribing them settles it.
  Until then this is the only rule in the engine with no sheet behind it.

- **No sheet can check the door top panel, and none contradicts it.** The rule
  is the shop's, 17 August 2026: over 3050mm of wall the piece above the door is
  its own panel, and the door assembly stops at the clear opening. Every source
  sheet is 2590 or 2745 high, so all four sit below the threshold and print the
  assembly at the full wall height, exactly as the engine still does there. A
  printed sheet from a job with walls over 3050 would settle the panel's size,
  its blank, and whether the shop splits it when the door module is wider than
  the panel module — the engine makes one panel and does not split.

- **Which end an LHS door is hinged on has not been confirmed.** The plan draws
  the swing hinged at the start of the opening for LHS and the end for RHS,
  reading the wall from outside the room, with the leaf opening inwards. That
  convention was worked out from the drawings, not stated by the shop, and it is
  in one function — `drawSwing` in `core/draw/roomplan.ts`. The BOQ is
  unaffected either way; only the drawing is. Whether a cold room door should
  swing out rather than in is the same question and equally unanswered.
- **No machine maximum panel length is modelled.** The legacy calculator splits
  any panel longer than a configurable limit; this engine has no limit and will
  happily generate a panel the line cannot make. The legacy default of 3050 is
  not the real figure — HI-15279's sheet prints 3340-long roof panels — so the
  actual limit needs confirming.
- **A corner-less junction needs a through wall.** Turning a corner panel off
  means the two walls meet directly, so one runs through and the other loses a
  wall thickness into its face. Which one is a draftsman decision the engine
  will not guess — `compileWalls` throws without it — but the calculator
  currently sends `through: 'prev'`, the wall arriving at the junction. Confirm
  that is what the shop does.
- **Two different corner constructions are in use.** The sheets fold a corner
  panel round a 90° corner, `2 × cornerLeg` wide. The legacy calculator instead
  chamfers the corner at 45°, with legs of `size/√2`. These are different
  geometries, not different notation, and which one applies when is unresolved.
- **Door thickness disagrees between the two tools.** Legacy fixes it by door
  type (sliding 60, hinges 45); `boq.ts` keys the door blank off the wall
  thickness, which is what all four sheets print.
- Per-wall sheet material is not modelled. Every source sheet uses PPGI 0.4
  throughout, so the BOQ has one PPGI column, but the legacy calculator offers
  six materials with their own thickness ranges per wall and per door.
- HI-15279 used door leaf blanks 10mm narrower than HI-15191/15223/15252 for
  the same 60mm thickness and same 860x1980 opening. Looks like a sheet error,
  needs confirming.
- Floor panel blank comes out at 1260, wider than a standard 1250 PPGI coil.
  Confirm which coil width is used.
- Butt joint inner skin is 50mm narrower than the outer, from a single sample
  (HI-15223, 60mm). Needs a second job before it can be trusted at other
  thicknesses.

## Docs

- `STATUS.md` — **start here**: what has happened, where the deploy got to, what is next
- `SETUP.md` — the one-time accounts: Supabase, Brevo and the Google Apps Script, and which keys go where
- `CLAUDE.md` — conventions and the rule about never fitting inputs to a sheet
- `DESIGN.md` — the plan for drawings + BOQ from one job input, and the phases
- `GUIDE.md` — how to add a new job (Hinglish, for the drawing office)
- `DEPLOY.md` — first push, git identity, running it locally
