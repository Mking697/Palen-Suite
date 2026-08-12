# Where this stands

Read this first if you are picking the project up — on this machine or another.
`README.md` says what the engine does, `DESIGN.md` says where it is going, this
file says what has actually happened and what is next.

Last updated: 12 August 2026.

## What exists and works

`npm run dev` opens the **Panel Calculator** at `http://127.0.0.1:5173` — one
screen, form on the left, drawings and BOQ on the right, updating as you type.
That is the product. The three verified jobs are now only a *Load example*
dropdown: proof the engine is right, not the thing anyone uses.

| | State |
|---|---|
| BOQ engine (`core/`) | verified line by line on HI-15191, HI-15223, HI-15279 |
| Plan geometry (`core/plan.ts`) | rooms are polygons; walls, corners, butts and partitions compile from the outline |
| Drawings (`core/draw/`) | job layout, wall elevations, ceiling, floor, door elevation — SVG + DXF |
| Calculator (`server/`, `web/`) | multi-room, connected rooms, per-wall sheets, doors |
| Tests | 85, plus the line-by-line sheet diff |

`npm run check` must print **`ALL ROWS MATCH across 3 jobs`** with 6 documented
deviations. It did at the last commit. If it does not, stop and find out why
before doing anything else.

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

1. **Finish the Hostinger deploy** — the Node version answer decides everything
   else. Try a temporary domain first, not `hicon.co.in`.
2. **Flashing detail table.** The HI-15191 sheet prints one — Inner PP, Outer
   PP, Flat Strip, U flashing 120/60, with profile size and RMTR. It is not
   built. The legacy calculator takes these as manual input and totals the
   running metre, which is almost certainly the right answer, because no
   formula reproduces the printed figures.
3. **Phase 4 of `DESIGN.md`** — machine maximum panel length, door top panel,
   ceiling light cutout. All present in the legacy calculator, none in this
   engine.
4. **Phase 3** — deriving partitions from geometry rather than a tick, which
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

In `README.md` under "Open items" — eight of them. The ones that block work:
trapezoid blanking (blocks angled rooms), which wall runs through a corner-less
junction, the real machine maximum panel length, and whether a door leaf is the
wall thickness or fixed by door type.

## Chat history

Claude Code keeps transcripts outside the repo, under
`%USERPROFILE%\.claude\projects\<slugified-cwd>\`. Opening a different folder
makes them look lost — they are not. `npm run chat-backup` copies them into
`.chat-backup/` as raw `.jsonl` plus readable markdown. That folder is
gitignored and does **not** travel with the repo.
