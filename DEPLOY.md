# Deploy

## Where the repo is

On GitHub at **`Mking697/Palen-Suite`**, public, branch `main` tracking
`origin/main`. The identity is set per-repo, not globally, so the other project
on this machine keeps its own:

```bash
git -C /f/hikom-panel-suite config user.name   # Mking697
git remote -v                                  # https://Mking697@github.com/...
```

Ordinary work is `git push`. The rest of this section only matters if the remote
has to be set up again on another machine.

<details>
<summary>Setting the remote up from scratch</summary>

1. Create an **empty** repo on GitHub. No README, no `.gitignore`, no licence —
   anything pre-created makes the first push reject.
2. Set the identity for this repo only, without `--global`.
3. `git remote add origin https://USER@github.com/USER/REPO.git` then
   `git push -u origin main`.

</details>

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
| `POST /api/render` | **the calculator's one call** — a job in; its BOQ, the flashing table, the one-canvas drawing sheet with its clickable cells, every individual drawing, and the 3D model out |
| `POST /api/dxf` | one drawing of an unsaved job as DXF; `{ sheet: true }` for the whole sheet |
| `/api/rules` | the shop's pick lists — sheet materials, door types and cores, floor build-up, flashing types, the L cut threshold |
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

## Hosting it on a Node.js host (Hostinger Business, and similar)

The app needs nothing but Node — no dependencies, no build, no database — so a
shared "Node.js application" slot is enough. Four things decide whether it
works.

**1. The Node version is the deal-breaker.** There is no build step because
Node runs the TypeScript directly, which needs **Node >= 22.6**. On 22.6–22.17
it also needs `--experimental-strip-types`; from 22.18 and on 23/24 it is on by
default. Check the version dropdown in the host's Node app settings *first*. If
it only offers 18 or 20, the choice is to compile to JavaScript before
uploading — which means adding TypeScript as a build dependency and giving up
the no-dependency rule — or not to use that host.

**2. Entry point and binding.** `app.js` at the repo root is there for hosts
that want a `.js` file to start; it just loads `server/serve.ts`. The host
supplies `PORT`, and **`HOST=0.0.0.0` must be set** or the app stays on
localhost and the proxy cannot reach it. That default is deliberate — going
public should be a decision, not an accident.

```
Entry point   app.js
Environment   HOST=0.0.0.0
```

**3. It will be public.** Anyone with the URL gets the calculator, the job
examples and the engine. There is no login. On a shared host, put HTTP basic
auth in front of it, or keep it on a URL that is not published.

**4. `/api/verify` will probably not work.** It shells out to run the verifier,
and shared hosting usually blocks spawning processes. Nothing in the calculator
calls it, so the tool is unaffected — but do not rely on it in production. Run
`npm run check` locally instead.

## Hosting as a static site (not applicable)

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
