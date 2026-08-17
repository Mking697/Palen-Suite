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
npm run dev                          # http://127.0.0.1:5173
HOST=127.0.0.1 PORT=8080 npm run dev # if 5173 is taken, still local only
```

Note the `HOST` there: with only `PORT` set the app takes that as a platform
handing it a port and binds every interface, which is right on a host and not
what anyone wants on a desk. See the binding table below.

`server/serve.ts` is `node:http` only — no install, no build, no watch step.
It binds to `127.0.0.1`, so it is reachable from this machine only; that is
deliberate, the sheets are job data. Restart the process after editing
anything under `server/` or `core/` (the browser assets are served
`no-store`, so a refresh is enough for `web/`).

Routes:

| Route | What it does |
|---|---|
| `/` | the Panel Calculator |
| `/guide` | the guide, which is `GUIDE.md` rendered — one copy of the instructions, not two |
| `/api/guide` | `GUIDE.md` itself, as text, which is what that page renders |
| `POST /api/render` | **the calculator's one call** — a job in; its BOQ, the flashing table, the one-canvas drawing sheet with its clickable cells, every individual drawing, and the 3D model out |
| `POST /api/dxf` | one drawing of an unsaved job as DXF; `{ sheet: true }` for the whole sheet |
| `/api/rules` | the shop's pick lists — sheet materials, door types, cores and hands, floor build-up, flashing types, and the two thresholds the form has to show: the L cut and the door top |
| `/api/jobs` | registered jobs and their rooms, for the header's job search |
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

`app.js` checks this at startup and **says which of the two is wrong**, because
the raw failure is `Unknown file extension ".ts"` in a log, which tells nobody
what to do. A version that is too old, or one that needs the flag, stops with
the fix printed.

**2. Entry point and binding.** `app.js` at the repo root is there for hosts
that want a `.js` file to start; it just loads `server/serve.ts`.

Where the app listens is decided by `server/config.ts`, in this order:

| | Binds to |
|---|---|
| `HOST` is set | that, always — an explicit answer is never overridden |
| `HOST` unset, `PORT` supplied by the platform | `0.0.0.0` |
| neither set | `127.0.0.1` — a desk tool, reachable from that machine only |

The middle rule was learnt from a 503 on the first Hostinger deploy (17 August
2026). Hostinger's wizard says its environment variables are applied *during
the build process*, and `HOST` never reached the running app; it bound to
localhost, the proxy got a refused connection, and the site returned 503 with
nothing anywhere to say why. **A platform that assigns you a port is a platform
proxying to you**, so binding to localhost there is never what anyone meant.

Setting `HOST=0.0.0.0` is still right and still worth doing — it just is no
longer the difference between a working site and a 503. The startup log now
says which rule applied and why, so the next 503 is diagnosable from the app's
own log:

```
listening on 0.0.0.0:38412 — PORT came from the platform, so this is behind a proxy
```

```
Entry point   app.js
Environment   HOST=0.0.0.0
```

**3. It will be public.** Anyone with the URL gets the calculator, the job
examples and the engine. There is no login — accounts are `DESIGN.md` Phase 9
and are not built. On a shared host, put HTTP basic auth in front of it, or keep
it on a URL that is not published. A temporary domain is not a secret; it is
only unguessed.

**4. `/api/verify` will probably not work.** It shells out to run the verifier,
and shared hosting usually blocks spawning processes. Nothing in the calculator
calls it, so the tool is unaffected — but do not rely on it in production. Run
`npm run check` locally instead.

### Deploying to Hostinger, step by step

Written for a **temporary domain** first, which is the right way round: the
domain can be pointed at it once the thing is known to work.

Before anything, from the repo:

```bash
npm run check          # must print ALL ROWS MATCH across 3 jobs
git push               # Hostinger deploys what is on GitHub, not what is here
```

Then in hPanel:

1. **Websites → Add website → Deploy Web App → Import Git repository.**
   If the button spins forever, Chrome has blocked its popup — allow pop-ups for
   `hpanel.hostinger.com`. Failing that, *Upload your files* with a ZIP from
   GitHub works, but then every update is a re-upload.
2. Repository `Mking697/Palen-Suite`, branch `main`. GitHub access is already
   granted and saved for this repository.
3. Choose the **temporary domain** rather than `hicon.co.in`.
4. **Node version — check this dropdown before going on.** 22.18 or newer is
   the easy case. 22.6–22.17 also works but needs the environment variable
   below. 18 or 20 will not run this app at all.
5. Settings:

   | Field | Value |
   |---|---|
   | Build command | *empty* — there is no build |
   | Start command | `npm start` |
   | Entry point | `app.js` |
   | Environment | `HOST=0.0.0.0` |
   | Environment, only on Node 22.6–22.17 | `NODE_OPTIONS=--experimental-strip-types` |

   Do not set `PORT` — the host supplies it, and overriding it is the usual
   cause of a 502.

6. Deploy, then read the application log. If it stopped, `app.js` will have
   printed which of the two settings is wrong.

### What to check once it is up

In this order — each one fails differently and tells you something else:

| Open | Should give | If it does not |
|---|---|---|
| `/` | the calculator, form on the left | 502 / 503 → see below |
| `/api/rules` | JSON of the shop's pick lists | the server runs but the engine did not load |
| `/guide` | the guide, rendered | `/api/guide` cannot read `GUIDE.md` — the repo did not ship whole |
| type `HI-15191` in **Open job no** | the freezer + ante job in the form | `/api/jobs` or `/api/spec` is not reachable |
| the drawing sheet appears | `POST /api/render` works, which is the whole tool | this is the one that matters |

`/api/verify` is expected to fail on shared hosting and nothing depends on it.

### A 502 or 503 after a successful build

The build log is not the application log. A build that ends `found 0
vulnerabilities` only means `npm install` ran — it says nothing about whether
the app started. **Find the application / runtime log**, which is where this
app's own startup lines go, and read the one that matters:

```
listening on 0.0.0.0:38412 — PORT came from the platform, so this is behind a proxy
```

| What the log says | What it means |
|---|---|
| `listening on 0.0.0.0:…` | the app is up and the fault is elsewhere — check the host's own port mapping |
| `listening on 127.0.0.1:…` | it bound to localhost, so the proxy cannot reach it. Set `HOST=0.0.0.0` in the app's **runtime** environment, not just the build one |
| `Could not listen on …` | the port is taken or not allowed |
| a Node version message | the version or `NODE_OPTIONS` is wrong; the message says which |
| nothing at all | the app was never started — check the start command and entry file |

A 503 in the first seconds after a deploy can also just be the container coming
up. Reload once before hunting.

**After it works, before pointing a real domain at it:** there is no login. Put
basic auth in front of it or leave it on the temporary domain until Phase 9.

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
