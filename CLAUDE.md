# CLAUDE.md

Instructions for Claude Code working in this repository.

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
record the disagreement as a deviation in the expected fixture
(`ppgiExpected` + `note`). The diff prints it as `!` and it is not a failure.
This has already happened once: HI-15223 prints one PPGI skin per roof panel
where the other three jobs print two.

## Running

```
npm run dev     # local viewer on http://127.0.0.1:5173
npm test        # unit tests + engine sensitivity checks
npm run verify  # line-by-line BOQ diff for every job
npm run check   # both
```

Node >= 22.6 runs the TypeScript directly. There is no build step and no
dependencies — keep it that way for as long as possible. That applies to the
server and the viewer too: `server/serve.ts` is `node:http` only and `web/` is
plain HTML/CSS/JS loaded straight from disk.

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
- **A drawing never counts anything.** `core/draw/` places what `layoutRoom`
  already worked out; it must not compute a panel width, a quantity or an area
  of its own. `core/verify/draw.test.ts` asserts the drawn widths equal the
  laid-out widths per room. A drawing that disagrees with the sheet is worse
  than no drawing, because the factory would cut to one and buy to the other.
- DXF layer names (`WALL`, `PANEL`, `DOOR`, `DIM`, `LIGHT`, `TEXT`, `CUT`) come
  from the legacy calculator and the drawing office expects them. Do not rename.
- Every shop constant lives in `core/rules.ts` as a named export with a comment
  saying which sheet it came from. Nothing magic inline.
- A rule derived from a single sample must say so in its comment.

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
drawing + BOQ work is going, this file for conventions.

## Open questions

Tracked in `README.md` under "Open items". Do not guess at these — they need an
answer from the shop. Flag them rather than picking a plausible value.
