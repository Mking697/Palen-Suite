# CLAUDE.md

Instructions for Claude Code working in this repository.

**Start by reading `STATUS.md`** — what has happened, where the deploy got to,
and what to do next. This file is the rules; that one is the state.

## What this is

A BOQ engine for PUF sandwich panel cold rooms. It takes the dimensions off a
WALL PANEL LAYOUT drawing and generates the SHEET FABRICATION sheet the factory
works from — panel sizes, blank sizes, PPGI and PLY counts, chemical weight and
area.

`legacy/index.html` is the previous single-file browser calculator. It is kept
only as a reference for its SVG drawing and DXF writer, which will be ported.
Do not add features to it.

## The one rule that matters

**Never work backwards from a BOQ sheet to the input.**

Job inputs in `core/jobs/` are transcribed from the *drawing* only. If the
generated BOQ does not match the sheet, that is a finding — either the rule is
wrong or the sheet is wrong. Fixing it by nudging the input until the numbers
line up destroys the only thing that makes this engine trustworthy.

When a sheet contradicts the rule the other sheets follow, keep the rule and
record the disagreement as a deviation in the expected fixture (`rule` + `note`
on the row, `ruleTotals` on the block). The diff prints it as `!` and it is not
a failure. There are nine of them. The largest: all three puf slab floors are
printed to the room's external envelope, and the shop says the floor sits
between the walls — so the engine takes the internal clear span and those rows
carry the sheet's figures beside the rule's.

**This works the same way when the shop contradicts a sheet.** Never re-transcribe
an expected file to match the engine — the expected file is what the sheet says,
and that stays true even when the sheet is wrong.

## Running

```
npm run dev     # local viewer on http://127.0.0.1:5173
npm test        # unit tests + engine sensitivity checks
npm run verify  # line-by-line BOQ diff for every job
npm run check   # both
```

Node >= 22.6 runs the TypeScript directly, so there is **no build step for
development** — and **still no dependencies**, which is the rule that matters.
Keep it that way for as long as possible. That applies to the server and the
viewer too: `server/serve.ts` is `node:http` only and `web/` is plain
HTML/CSS/JS loaded straight from disk.

`npm run build` exists for deployment only. `tools/build.ts` compiles `core/`
and `server/` into `dist/` as plain JavaScript using Node's own
`module.stripTypeScriptTypes` — no TypeScript package, no dependency. It is
there because a host may build with one Node and *start* the app with another,
and an older runtime throws `Unknown file extension ".ts"` before any of our
code runs. Nothing in development should need it: run the source.

## Conventions

- All linear dimensions are millimetres. Areas are m², weights are kg.
- `core/` is pure: no DOM, no file IO, no globals. It must stay testable in
  isolation, because the UI will be rewritten and the engine must not be.
  Everything impure — HTTP, file reads, spawning the verifier — lives in
  `server/`.
- Never use `Number.prototype.toFixed` for printed BOQ values. It rounds the
  binary value, so 55.815 prints as 55.81 where Excel prints 55.82. Use
  `round2`/`fmt2` from `core/format.ts`.
- The browser must never format a BOQ figure. `server/serve.ts` sends
  `chemWeightText` / `areaSqmtText` already rounded half-up, and `web/app.js`
  prints them as-is — JS `toFixed` in the client would reintroduce the exact
  bug `core/format.ts` exists to avoid.
- **A cross-room check reports, it does not throw.** `core/checks.ts` compares
  rooms against each other — the one thing `compileWalls` cannot see, because
  it is handed one outline at a time. A bad input there is printed beside the
  BOQ with the millimetres it costs, not raised: the calculator passes through
  invalid states on every keystroke, and a job that refuses to build is a job
  nobody can edit. Silence is the thing being fixed, not the build.
- **A rule that came from the shop says so in its comment.** Most of the engine
  is read off the four printed sheets and can be checked against them. Some
  rules arrive by conversation instead — the L cut threshold, the floor core
  giving way, the flashing formula. Those are just as binding, and just as
  worth building, but the comment must state where the rule came from and the
  date, so a later session can tell a verified figure from a stated one.
  `core/flashing.ts` is the current example.
- **A typed figure is never dressed up as a derived one.** Draftsman overrides,
  extra flashing rows — anything the estimator enters by hand — is printed as
  entered and **marked** beside the computed rows. Two numbers that mean
  different things must never look the same on a sheet.
- **A drawing never counts anything.** `core/draw/` places what `layoutRoom`
  already worked out; it must not compute a panel width, a quantity or an area
  of its own. This covers the 3D model and the composed sheet as well: a face in
  `core/draw/model3d.ts` is one of `layoutRoom`'s panels, and `sheet.ts` only
  translates views it was handed. `core/verify/draw.test.ts` asserts the drawn widths equal the
  laid-out widths per room. A drawing that disagrees with the sheet is worse
  than no drawing, because the factory would cut to one and buy to the other.
- DXF layer names (`WALL`, `PANEL`, `DOOR`, `DIM`, `LIGHT`, `TEXT`, `CUT`) come
  from the legacy calculator and the drawing office expects them. Do not rename.
- Every shop constant lives in `core/rules.ts` as a named export with a comment
  saying which sheet it came from. Nothing magic inline. The browser gets them
  from `/api/rules` rather than repeating them — `web/app.js` holds fallbacks
  only for when that call cannot be made, and they say so.
- A rule derived from a single sample must say so in its comment.
- **The form is rebuilt from the state on every change, and must not lose the
  estimator's place.** Redrawing is what stops anything on screen drifting from
  what will be sent — but it also throws away the caret and scrolls to the top
  while somebody is still typing. `renderForm` records the focused node's index
  path and the form's `scrollTop`, and puts both back. Any new redraw path has
  to go through it.
- **A typed figure is never quietly corrected.** The door's module, frame and
  leaf are all typed, and when `frame + leaf + frame` does not equal the module
  the difference is *stated in millimetres* rather than one of them being moved.
  Same rule as the wall chain that does not close. A tool that silently adjusts
  the number next to the one you edited is a tool nobody can check.
- **Nothing may push the page sideways.** A drawing sheet is metres wide and a
  phone is not, so wide content scrolls inside its own box (`.draw-svg`,
  `.scroller`) and `body` keeps `overflow-x: hidden`. On a phone every control
  is at least 40px and inputs are 16px, because anything smaller means a missed
  tap or an iOS zoom on focus.
- **CSS can defeat an attribute, and no test here will catch it.** `.gate {
  display: grid }` outranked the browser's own `[hidden] { display: none }` and
  put an empty card on the live site while all the tests passed. Presentation is
  checked by looking at it; the harness checks behaviour.
- **The browser scripts are tested by running them, in
  `core/verify/web.test.ts`.** `web/app.js` and `web/guide.js` are plain scripts
  with no imports, so they cannot be imported — they are executed in a `node:vm`
  context over a stub DOM, and the test drives the form's own controls and reads
  what it posts. Touch either file and run it; the reason is on the record, an
  identifier that was never defined once survived a whole session because
  nothing ever ran the file. The stub DOM is deliberately minimal — when the
  form starts using something it lacks, extend the stub rather than dropping the
  coverage.
- **The guide in the app is `GUIDE.md`, not a copy of it.** `/guide` renders
  the file. Never write a second set of instructions into `web/`: two sets drift
  apart, and the one that gets read is the one on the screen.

## Adding a job

1. Add `core/jobs/hi-XXXXX.ts` from the drawing.
2. Add `core/verify/hi-XXXXX.expected.ts` transcribed from the BOQ PDF.
3. Register both in the `CASES` array in `core/verify/run.ts`, and the job in
   the `JOBS` array in `server/serve.ts` so it shows up in the viewer.
4. Run `npm run check` and report what does not match before changing anything.

## Keep the docs current

Any change to a rule, formula or workflow updates the matching file in the same
change — `README.md` for status and formulas, `GUIDE.md` for how to use it,
`DEPLOY.md` for anything about pushing or hosting, `DESIGN.md` for where the
drawing + BOQ work is going, `STATUS.md` for what has happened and what is
next, this file for conventions.

`STATUS.md` is the handover. Update it whenever a phase lands, a deploy moves,
or a decision is taken that the next session would otherwise have to rediscover.

## Open questions

Tracked in `README.md` under "Open items". Do not guess at these — they need an
answer from the shop. Flag them rather than picking a plausible value.
