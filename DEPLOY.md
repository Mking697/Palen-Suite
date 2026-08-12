# Deploy

## First push (repo is not yet on a remote)

The repo is initialised on branch `main` with everything staged but **not
committed** — the commit author is fixed at commit time, and this project is
going to a different GitHub account than `Hikom8428`.

1. Create an **empty** repo on GitHub under the new account. No README, no
   `.gitignore`, no licence — anything pre-created will make the first push
   reject.

2. Set the identity for this repo only (no `--global`, so the other project
   keeps its own):

   ```bash
   cd /f/hikom-panel-suite
   git config user.name  "NEW_USERNAME"
   git config user.email "new@email.com"
   ```

3. Commit and push:

   ```bash
   git commit -m "Panel BOQ engine: HI-15191 and HI-15223 verified exact"
   git remote add origin https://NEW_USERNAME@github.com/NEW_USERNAME/REPO.git
   git push -u origin main
   ```

### Windows credential clash

Windows Credential Manager caches one login per host, and `Hikom8428` is
already cached for `github.com`. Pushing to a second account with the plain URL
gives **403 Permission denied** with no useful message.

The `NEW_USERNAME@` prefix in the remote URL above is what avoids this — it
makes Git ask for that account specifically. If it still fails:

- Control Panel → Credential Manager → Windows Credentials → delete
  `git:https://github.com`, then push again and log in as the new account, or
- `git config --global credential.useHttpPath true` to keep one credential per
  repo path.

Use a Personal Access Token as the password — GitHub stopped accepting account
passwords over HTTPS.

### Confirming it went to the right account

```bash
git log -1 --format='%an <%ae>'   # must be the new identity, not Mking697
git remote -v
```

## Checks before pushing

```bash
npm run check
```

Must print `ALL ROWS MATCH`. `!` deviation lines are expected and fine — they
are places where a printed sheet contradicts itself, and they are documented.

There is no build, no dependencies and no lockfile, so there is nothing else to
verify.

## Running it locally

```bash
npm run dev            # http://127.0.0.1:5173
PORT=8080 npm run dev  # if 5173 is taken
```

`server/serve.ts` is `node:http` only — no install, no build, no watch step.
It binds to `127.0.0.1`, so it is reachable from this machine only; that is
deliberate, the sheets are job data. Restart the process after editing
anything under `server/` or `core/` (the browser assets are served
`no-store`, so a refresh is enough for `web/`).

Routes:

| Route | What it does |
|---|---|
| `/` | the Panel Calculator |
| `POST /api/render` | **the calculator's one call** — a job in, its BOQ and every drawing out |
| `POST /api/dxf` | one drawing of an unsaved job, as DXF |
| `/api/jobs` | registered jobs and their rooms, for "Load example" |
| `/api/boq?job=HI-15191` | generated BOQ blocks + totals |
| `/api/spec?job=HI-15191` | the JobSpec the BOQ was generated from |
| `POST /api/boq` | build from an edited JobSpec (what-if, nothing persisted) |
| `/api/drawings?job=HI-15191` | every room's drawings, rendered to SVG |
| `/api/dxf?job=…&room=0&i=0` | one drawing as a DXF download |
| `/api/verify` | runs `core/verify/run.ts` and returns its output |
| `/legacy` | the old single-file calculator |

A new job needs adding to `JOBS` in `server/serve.ts` as well as to `CASES` in
`core/verify/run.ts`.

## Hosting (not yet applicable)

Nothing is deployed yet — the engine is a library with a CLI verifier and a
local viewer.

The viewer is deliberately a server, not a static page: `/api/verify` shells
out to the verifier and `POST /api/boq` runs the engine. Publishing it as a
static site means either dropping those two, or building `core/` to browser JS
so the engine runs client-side.

When that happens it will be a static Vite build, so GitHub Pages works the
same way `hikom8428.github.io/panel-calculator` does today: build to `dist/`
and publish that folder. Two things to remember at that point:

- Vite needs `base: '/REPO_NAME/'` for a project page, otherwise assets 404.
- `core/` must keep building without the UI, so the engine stays independently
  testable.

## Chat transcript backup

Claude Code keeps session history outside the repo, under
`%USERPROFILE%\.claude\projects\<slugified-cwd>\`. Opening a different folder
therefore looks like the history is gone — the file is still there, under the
*old* folder's slug.

```bash
npm run chat-backup                          # this project
node tools/chat-backup.ts f:\panel-calculator  # another folder, or its slug
```

Writes the raw `.jsonl` plus a readable `.md` per session into `.chat-backup/`,
which is gitignored — transcripts are not source.

## The old repo

`f:\panel-calculator` (`Hikom8428/panel-calculator`) still holds the live
single-file calculator and is untouched. It also has an untracked copy of an
early `core/` from before this repo was split out — that copy is stale and can
be deleted whenever convenient.
