# Hikom Panel Suite

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

69 unit tests, 3 jobs verified line by line, no dependencies. A local viewer
(`npm run dev`) renders the generated sheet and its drawings, runs the verifier
in the browser, and lets you rebuild from an edited input.

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
```

Needs Node >= 22.6 (TypeScript runs natively, no build step).

### The calculator

`npm run dev` opens the Panel Calculator — one screen, form on the left, live
output on the right. Type the dimensions off the layout drawing and the
drawings and the SHEET FABRICATION appear as you type. There is nowhere else to
go and nothing else to press.

- **Rooms** — one or many. `+ Room` adds another; each gets its own tab in the
  form and its own drawings and BOQ block in the output.
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
  Each door gets a **typical elevation** like the issued drawing: the frame leg
  either side of the leaf, the AL. chequered sheet up from the bottom, the door
  lift, the ceiling panel over and the puf slab under. Frame and leaf are held
  to `frame + leaf + frame = module`, so the drawing and the blank size can
  never describe two different doors.
- **Corners** — a corner panel at each outside corner by default, and each one
  can be turned off per junction, because the shop does not always fit one. The
  plan dimensions every corner leg, so the chain along a wall adds up to the
  wall.
- **Sheets** — outer and inner skin per wall, and separately for a door leaf,
  from the six materials the shop stocks with their own thickness ranges. Two
  walls in different sheets print as two BOQ rows. Everything defaults to
  PPGI 0.4, which is what all four source sheets use throughout.
- **Output** — one WALL PANEL LAYOUT for the whole job at the top, with the
  rooms drawn where they actually sit: rooms that share a wall are touching
  along it, rooms that share none stand clear. Then, per room, one elevation
  per wall, the ceiling, the floor and the SHEET FABRICATION table. Every
  drawing downloads as DXF on the layers the drawing office expects (`WALL`,
  `PANEL`, `DOOR`, `DIM`, `LIGHT`, `TEXT`, `CUT`). Print gives the lot as a job
  pack.
- **Load example** — pulls a verified job into the form, so the numbers the
  engine was proved against can be inspected in the tool itself.

An input the engine cannot honour — a non-right-angled room, a `panels` list
that does not sum to its run — stops with the reason. Nothing is guessed to
make the page render.

The old single-file calculator stays reachable at `/legacy` for reference.

## Layout

```
core/types.ts               domain model
core/rules.ts               shop constants and presets
core/plan.ts                room outline -> wall list (compileWalls)
core/split.ts               splitRun — the panel splitting rule
core/layout.ts              room -> wall / ceiling / floor panels
core/boq.ts                 SHEET FABRICATION generator
core/format.ts              Excel-compatible half-up rounding
core/draw/                  plan, elevation, ceiling, floor -> SVG and DXF
core/jobs/                  job inputs, transcribed from drawings only
core/verify/                expected sheets + diff runner + tests
server/serve.ts             local dev server (node:http, no dependencies)
web/                        the viewer — plain HTML/CSS/JS, no build step
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
wallInnerHeight   = wallHeight - wallThickness       <- the L cut
ceilingSpan       = ext - wallThickness/2 per own wall end (0 at a partition)
floorSpan         = internal clear
cornerOuterWidth  = 2 x cornerLeg
cornerInnerWidth  = cornerOuter - 2 x wallThickness + 5
buttJointOuter    = blank +100 (not +40); inner skin is 50 narrower than outer
buttEndRun        = wall length - one wall thickness at that end
areaSqmt          = panelW/1000 * panelL/1000 * qty  (panel size, not blank)
chemWeight        = areaSqmt * thickness/1000 * density
uFlashingProfile  = 10x40x(thickness + 2)x40x10
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

- **HI-15223's wall lengths do not close a polygon.** Walking its six walls
  round, the horizontal chain closes exactly (`2590 - 1600 - 990 = 0`) but the
  vertical chain is out by exactly one wall thickness
  (`3555 + 365 - 3860 = +60`). It is the side carrying all three butt joints,
  so the chain is probably mixing outer-face and inner-face dimensions there,
  but which wall is measured to the other face cannot be decided from the
  numbers. The BOQ is unaffected — the engine subtracts per wall and never
  closes the loop, which is why this only surfaced once the plan geometry was
  modelled. Needs the drawing before the room can be drawn.

- `minPanelWidth` is now pinned to **150** from both sides: HI-15279's ambient
  ceiling rejects a 130 balance, and HI-15252's F&V keeps a 150 wall panel.
- Density: every source sheet computes at exactly **40 kg/m³**, which sits at
  the floor of the stated 42±2 spec. Default is 40 so past jobs reproduce
  exactly; if production really runs at 42 the sheets under-estimate chemical
  by ~5% (~41 kg on HI-15252).
- Flashing RMTR has no formula that reproduces the sheets — perimeter based
  estimates land both above and below the printed figures. The legacy
  calculator does not try: the estimator types each flashing type's dimensions
  and it totals the running metre. That is probably the answer.
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
- `CLAUDE.md` — conventions and the rule about never fitting inputs to a sheet
- `DESIGN.md` — the plan for drawings + BOQ from one job input, and the phases
- `GUIDE.md` — how to add a new job (Hinglish, for the drawing office)
- `DEPLOY.md` — first push, git identity, running it locally
