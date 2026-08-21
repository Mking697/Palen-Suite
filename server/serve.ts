/**
 * Local dev server for the panel BOQ engine.
 *
 * Zero dependencies: node:http only, so `npm run dev` works on a clean
 * checkout with no install step, same as the rest of the repo.
 *
 *   npm run dev            -> http://127.0.0.1:5173
 *   PORT=8080 npm run dev
 *
 * `core/` stays pure — all file IO, HTTP and process spawning lives here.
 * Every printed figure is formatted with fmt2/round from core/format.ts, never
 * toFixed, so the browser shows exactly what the CLI and the sheet show.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';

import { buildJob } from '../core/boq.ts';
import { checkJob } from '../core/checks.ts';
import { jobFlashing } from '../core/flashing.ts';
import { fmt2, round } from '../core/format.ts';
import {
  canDraw,
  composeSheet,
  type Drawing,
  jobPlan,
  model3d,
  roomDrawings,
  toDxf,
  toSvg,
} from '../core/draw/index.ts';
import { compileWalls } from '../core/plan.ts';
import { toXlsx, xlsxFileName, XLSX_MIME } from '../core/export/xlsx.ts';
import { toPdfPages, pdfFileName, PDF_MIME } from '../core/export/pdf.ts';
import { binding, environmentReport } from './config.ts';
import { defaultSubject, parseAddresses, sendMail } from './mail.ts';
import {
  DEFAULT_FLOOR_LAYERS,
  DEFAULT_SKIN,
  DOOR_CORES,
  DOOR_HANDS,
  DOOR_TOP_MIN_WALL_HEIGHT,
  DOOR_TYPES,
  FLASHING_TYPES,
  FLOOR_LAYER_MATERIALS,
  L_CUT_MIN_WALL_TH,
  SHEET_MATERIALS,
} from '../core/rules.ts';
import type { BoqBlock, JobSpec, RoomSpec } from '../core/types.ts';

import { HI_15191 } from '../core/jobs/hi-15191.ts';
import { HI_15223 } from '../core/jobs/hi-15223.ts';
import { HI_15279 } from '../core/jobs/hi-15279.ts';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'web');
/** See server/config.ts — the rule, and why two 503s taught it. */
const { host: HOST, port: PORT, reason: BIND_REASON } = binding(
  process.env,
  process.argv.slice(2),
);

/** Same registry the verifier uses — add a job here when you add it to CASES. */
const JOBS: JobSpec[] = [HI_15191, HI_15223, HI_15279];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * Rows carry pre-formatted strings alongside the raw numbers. The rounding rule
 * is half-up to match Excel, and JS toFixed is not — so the browser must never
 * format a BOQ figure itself.
 */
function serialise(blocks: BoqBlock[]) {
  const area = (v: number) => (v ? String(round(v, 5)) : '');
  return blocks.map((b) => ({
    title: b.title,
    spec: b.spec,
    rows: b.rows.map((r) => ({
      ...r,
      chemWeightText: r.chemWeight ? fmt2(r.chemWeight) : '',
      areaSqmtText: area(r.areaSqmt),
    })),
    totals: {
      ...b.totals,
      chemWeightText: fmt2(b.totals.chemWeight),
      areaSqmtText: fmt2(b.totals.areaSqmt),
    },
  }));
}

/**
 * A room posted by the calculator carries an outline but no wall list — the
 * job files compile theirs at authoring time. Compile it here so the engine
 * receives exactly what it receives from a job file.
 */
const withWalls = (r: RoomSpec): RoomSpec =>
  r.outline && !r.walls?.length ? { ...r, walls: compileWalls(r.outline) } : r;

const normalise = (job: JobSpec): JobSpec => ({ ...job, rooms: job.rooms.map(withWalls) });

function buildPayload(input: JobSpec) {
  const job = normalise(input);
  const blocks = buildJob(job);
  const grand = blocks.reduce(
    (t, b) => ({
      panelQty: t.panelQty + b.totals.panelQty,
      ppgiQty: t.ppgiQty + b.totals.ppgiQty,
      plyQty: t.plyQty + b.totals.plyQty,
      chemWeight: t.chemWeight + b.totals.chemWeight,
      areaSqmt: t.areaSqmt + b.totals.areaSqmt,
    }),
    { panelQty: 0, ppgiQty: 0, plyQty: 0, chemWeight: 0, areaSqmt: 0 },
  );

  return {
    jobNo: job.jobNo,
    density: job.density,
    rooms: job.rooms.map((r) => r.name),
    // walls handed to a neighbour that is not there to take them. Reported
    // beside the BOQ rather than thrown, because the form passes through that
    // state on the way to a valid job — see core/checks.ts.
    problems: checkJob(job),
    // bought by the running metre, so it is totalled on its own and never
    // joins the panel counts — see core/flashing.ts
    flashing: jobFlashing(job),
    blocks: serialise(blocks),
    grand: {
      ...grand,
      chemWeightText: fmt2(grand.chemWeight),
      areaSqmtText: fmt2(grand.areaSqmt),
    },
  };
}

/**
 * Render one room's drawings. A room without an outline is reported as such
 * rather than being skipped silently — the viewer says why it cannot be drawn.
 */
function drawingsFor(room: RoomSpec, index: number) {
  if (!canDraw(room)) {
    return {
      index,
      name: room.name,
      drawable: false,
      reason:
        'This room has no plan outline yet, so it cannot be drawn. ' +
        'See README "Open items".',
      drawings: [],
    };
  }
  try {
    return {
      index,
      name: room.name,
      drawable: true,
      drawings: roomDrawings(room).map((d) => ({
        title: d.title,
        subtitle: d.subtitle ?? '',
        svg: toSvg(d, { maxWidth: 980 }),
      })),
    };
  } catch (err) {
    return {
      index,
      name: room.name,
      drawable: false,
      reason: err instanceof Error ? err.message : String(err),
      drawings: [],
    };
  }
}

/**
 * Every drawing in the job on one canvas: the WALL PANEL LAYOUT first, then
 * each room's views in the order `roomDrawings` gives them. A room that cannot
 * be drawn is left off the sheet and still reports itself beside the BOQ.
 */
function sheetViews(job: JobSpec): Drawing[] {
  const views: Drawing[] = [];
  try {
    views.push(jobPlan(job));
  } catch {
    /* the layout reports its own reason through renderLayout */
  }
  for (const room of job.rooms) {
    if (!canDraw(room)) continue;
    try {
      views.push(...roomDrawings(room));
    } catch {
      /* drawingsFor reports why, room by room */
    }
  }
  return views;
}

function renderSheet(job: JobSpec) {
  const views = sheetViews(job);
  if (!views.length) return { drawable: false, reason: 'Nothing in this job can be drawn yet.' };
  const { drawing, cells } = composeSheet(views, { title: `${job.jobNo} — DRAWING SHEET` });
  return {
    drawable: true,
    title: drawing.title,
    subtitle: `${views.length} views · every dimension in mm at 1:1 · click a view to open it`,
    svg: toSvg(drawing, { maxWidth: 1400 }),
    // where each view sits on the sheet, so a click can find the one under it
    cells,
  };
}

/** The job's single WALL PANEL LAYOUT, or why it cannot be drawn. */
function renderLayout(job: JobSpec) {
  try {
    const d = jobPlan(job);
    return { drawable: true, title: d.title, subtitle: d.subtitle ?? '', svg: toSvg(d, { maxWidth: 1100 }) };
  } catch (err) {
    return { drawable: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

const send = (res: ServerResponse, code: number, body: string, type: string) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res: ServerResponse, code: number, data: unknown) =>
  send(res, code, JSON.stringify(data), MIME['.json']);

/**
 * A file rather than a page. `content-disposition` carries the name, so the
 * browser saves `HI-15191-BOQ.xlsx` instead of `export`, and the same bytes
 * can be posted to Drive and attached to an email without being rebuilt.
 */
const sendBytes = (
  res: ServerResponse,
  bytes: Uint8Array,
  type: string,
  filename: string,
) => {
  res.writeHead(200, {
    'content-type': type,
    'content-length': String(bytes.length),
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  });
  res.end(Buffer.from(bytes));
};

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Who is making this request, according to Supabase — not according to the
 * request.
 *
 * `/auth/v1/user` answers for the token it is given and for nobody else, so
 * this cannot be told a different name by the browser. It is used for the
 * Reply-To on an email (which has to be a real person) and for the
 * administrator check on a delete.
 *
 * It replaced `profiles?select=…&limit=1` in both places. That was correct
 * while every caller could read exactly one row and quietly wrong the moment an
 * admin could read all of them — "give me one row" then hands back whichever
 * comes first, which is somebody else. The same mistake had already been found
 * and fixed once in `web/auth.js`; `STATUS.md` records it as the thing to watch
 * when a policy is widened. Naming the row is not enough here, because the
 * caller's own id is exactly what we are trying to learn — so this asks the
 * one endpoint whose entire answer is "you".
 */
async function whoIsCalling(
  req: IncomingMessage,
): Promise<{ id: string; email: string } | null> {
  const url = process.env.SUPABASE_URL ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!url || !anonKey || !token) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string };
  return user.id ? { id: user.id, email: user.email ?? '' } : null;
}

/** That caller's own profile row, asked for by id rather than by "one row". */
async function profileOf(id: string, token: string) {
  const url = process.env.SUPABASE_URL ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}` +
      '&select=id,is_admin,mail_from,display_name&limit=1',
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    id: string;
    is_admin: boolean;
    mail_from: string | null;
    display_name: string | null;
  }>;
  return rows.length ? rows[0] : null;
}

/**
 * Run the real verifier and hand its output to the browser verbatim.
 *
 * The verifier's fixtures are not shipped in a build — they are ground truth
 * for development, not part of the app — so on a built copy this reports that
 * rather than spawning something that is not there. Shared hosting usually
 * blocks spawning anyway; nothing in the calculator calls this.
 */
function runVerify(): Promise<{ output: string; code: number }> {
  if (!import.meta.filename.endsWith('.ts')) {
    return Promise.resolve({
      output:
        'The verifier is not part of a built copy — its expected sheets are ' +
        'development ground truth. Run `npm run check` from the repository.',
      code: 0,
    });
  }
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, 'core', 'verify', 'run.ts')], {
      cwd: ROOT,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => done({ output: out, code: code ?? 0 }));
    child.on('error', (err) => done({ output: String(err), code: 1 }));
  });
}

async function serveStatic(res: ServerResponse, base: string, rel: string) {
  // normalize + prefix check keeps ../ out of the served roots
  const file = join(base, normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(base)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    /*
     * What the browser needs to reach Supabase, from the environment rather
     * than from the repo — this repository is public and nothing that looks
     * like a key belongs in it.
     *
     * The anon key is *meant* to be here: it identifies the project, not a
     * person, and row level security is what protects the data. The
     * service_role key would bypass all of that and must never be read here,
     * or set on this host at all.
     *
     * Both absent, the calculator still works and simply cannot sign anyone
     * in — the engine is the product and an account is a convenience on top.
     */
    if (path === '/api/config') {
      const url = process.env.SUPABASE_URL ?? '';
      const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
      /*
       * Whether email can be sent — a boolean, never the key. The browser needs
       * to know so the Email button can say what is missing instead of opening
       * a form that cannot post anywhere. Same reasoning as `accountsReason`.
       */
      const mail = !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
      return json(res, 200, {
        supabase: url && anonKey ? { url, anonKey } : null,
        accountsReason: url && anonKey ? '' : 'SUPABASE_URL / SUPABASE_ANON_KEY are not set',
        mail,
        mailReason: mail ? '' : 'BREVO_API_KEY / MAIL_FROM are not set on the server',
      });
    }

    /*
     * Remove a user for good. The only route that touches a real secret.
     *
     * Deleting an account needs Supabase's **service key**, which bypasses
     * every row level policy — so it can never reach a browser, and this is
     * the reason the server exists in the accounts story at all.
     *
     * Being an admin is **checked against the database, not believed from the
     * request**: the caller's own token is used to read their profile, and row
     * level security means that token can only ever return their own row. A
     * request that claims to be an admin and is not gets its own row back with
     * `is_admin` false, and is refused.
     */
    if (path === '/api/admin/user' && req.method === 'DELETE') {
      const url = process.env.SUPABASE_URL ?? '';
      const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
      const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? '';
      if (!url || !anonKey) return json(res, 501, { error: 'Accounts are not configured here.' });
      if (!serviceKey) {
        return json(res, 501, {
          error:
            'Deleting a user needs SUPABASE_SERVICE_KEY on the server. ' +
            'Until it is set, use Stop — it ends access and keeps the account.',
        });
      }

      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!token) return json(res, 401, { error: 'Not signed in.' });

      /*
       * Who is asking, from Supabase rather than from the request — and then
       * their own row by id. This used to be `profiles?select=id,is_admin&
       * limit=1`, which is the row that comes first and not the caller's: an
       * admin may read every profile, so the check could be made against a
       * stranger. Same mistake `web/auth.js` was fixed for on 17 August.
       */
      const caller = await whoIsCalling(req);
      if (!caller) return json(res, 401, { error: 'Not signed in.' });
      const me = await profileOf(caller.id, token);
      if (!me?.is_admin) {
        return json(res, 403, { error: 'Only an administrator can delete a user.' });
      }

      const { id } = JSON.parse(await readBody(req)) as { id?: string };
      if (!id) return json(res, 400, { error: 'Which user?' });
      if (id === caller.id) {
        return json(res, 400, { error: 'An administrator cannot delete their own account.' });
      }

      const gone = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!gone.ok) {
        return json(res, 502, { error: `Supabase refused: ${(await gone.text()).slice(0, 200)}` });
      }
      return json(res, 200, { ok: true });
    }

    // the pick lists the form offers, straight from core/rules.ts
    if (path === '/api/rules') {
      return json(res, 200, {
        materials: SHEET_MATERIALS,
        defaultSkin: DEFAULT_SKIN,
        doorTypes: Object.entries(DOOR_TYPES).map(([k, v]) => ({ key: k, ...v })),
        doorCores: DOOR_CORES,
        doorHands: DOOR_HANDS,
        // so the form can show the L cut default without knowing the threshold
        lCutMinWallTh: L_CUT_MIN_WALL_TH,
        // and say when a door top panel starts being made, for the same reason
        doorTopMinWallHeight: DOOR_TOP_MIN_WALL_HEIGHT,
        floorMaterials: FLOOR_LAYER_MATERIALS,
        floorLayers: DEFAULT_FLOOR_LAYERS,
        flashingTypes: FLASHING_TYPES,
      });
    }

    if (path === '/api/jobs') {
      return json(
        res,
        200,
        JOBS.map((j) => ({
          jobNo: j.jobNo,
          density: j.density,
          rooms: j.rooms.map((r) => ({ name: r.name, wallTh: r.wallTh })),
        })),
      );
    }

    if (path === '/api/boq' && req.method === 'GET') {
      const job = JOBS.find((j) => j.jobNo === url.searchParams.get('job'));
      if (!job) return json(res, 404, { error: 'unknown job' });
      return json(res, 200, buildPayload(job));
    }

    /**
     * The calculator's one endpoint: a job in, its BOQ and every drawing out.
     * One round trip so the form can render both halves of the page together
     * and they can never be a step out of sync with each other.
     */
    if (path === '/api/render' && req.method === 'POST') {
      try {
        const spec = JSON.parse(await readBody(req)) as JobSpec;
        const job = normalise(spec);
        return json(res, 200, {
          ...buildPayload(spec),
          // one layout for the whole job, so connected rooms are drawn together
          layout: renderLayout(job),
          // and every view of that job on one canvas, the way it is issued
          sheet: renderSheet(job),
          // the same job stood up, for the 3D toggle. Faces only — the browser
          // owns the camera, because dragging must not need a round trip.
          model3d: model3d(job),
          drawings: job.rooms.map((room, i) => drawingsFor(room, i)),
        });
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    /** DXF for a drawing of a posted (unsaved) job — the browser saves the blob. */
    if (path === '/api/dxf' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req)) as {
          room?: RoomSpec;
          index?: number;
          job?: JobSpec;
          sheet?: boolean;
        };
        // the whole sheet, the whole-job layout, or one of a room's drawings
        const drawing =
          body.sheet && body.job
            ? composeSheet(sheetViews(normalise(body.job)), {
                title: `${body.job.jobNo} — DRAWING SHEET`,
              }).drawing
            : body.job
              ? jobPlan(normalise(body.job))
              : roomDrawings(withWalls(body.room!))[body.index ?? 0];
        if (!drawing) return json(res, 404, { error: 'no such drawing' });
        return send(res, 200, toDxf(drawing), 'image/vnd.dxf');
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    /**
     * The two files a job goes out as: the BOQ workbook and the drawing sheet.
     *
     * Both are built from the posted spec through `core/export/`, which counts
     * nothing of its own — every figure is one `buildJob` already produced. The
     * bytes returned here are the same bytes Phase 11 files into Drive and
     * Phase 12 attaches to an email; nothing is rebuilt for a different
     * destination, because two builds are two chances to disagree.
     */
    if (path === '/api/export' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req)) as { job?: JobSpec; kind?: string };
        if (!body.job) return json(res, 400, { error: 'no job' });
        const job = normalise(body.job);

        if (body.kind === 'xlsx') {
          const bytes = toXlsx({
            jobNo: job.jobNo,
            density: job.density,
            rooms: job.rooms.map((r) => r.name),
            blocks: buildJob(job),
            flashing: jobFlashing(job),
          });
          return sendBytes(res, bytes, XLSX_MIME, xlsxFileName(job.jobNo));
        }

        if (body.kind === 'pdf') {
          const views = sheetViews(job);
          if (!views.length) return json(res, 400, { error: 'nothing to draw' });
          /*
           * The composed sheet first, as the contents page — then every view on
           * a page of its own. The sheet alone is unreadable printed: HI-15191
           * puts fourteen views on it, which lands at 1:159 on an A3. A page
           * each is what a factory can work from, and each states its scale.
           */
          const sheet = composeSheet(views, { title: `${job.jobNo} — DRAWING SHEET` });
          const bytes = toPdfPages([sheet.drawing, ...views], { footer: job.jobNo });
          return sendBytes(res, bytes, PDF_MIME, pdfFileName(job.jobNo));
        }

        return json(res, 400, { error: 'kind must be xlsx or pdf' });
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    /**
     * Email the job out: the workbook and the drawings, attached.
     *
     * The attachments are built here from the posted spec, by the same calls
     * `/api/export` makes — so what the customer opens is what the estimator
     * saw. Nothing about the BOQ is recomputed for a different destination.
     *
     * The API key never leaves this process, which is the whole reason this
     * goes through our own server rather than straight from the page.
     */
    if (path === '/api/mail' && req.method === 'POST') {
      const apiKey = process.env.BREVO_API_KEY ?? '';
      const fallbackFrom = process.env.MAIL_FROM ?? '';
      if (!apiKey || !fallbackFrom) {
        // said plainly rather than half-working, the same way Delete does
        // without SUPABASE_SERVICE_KEY
        return json(res, 501, {
          error:
            'Email is not configured on this server. BREVO_API_KEY and MAIL_FROM have to be ' +
            'set in the host environment before anything can be sent.',
        });
      }

      const caller = await whoIsCalling(req);
      if (!caller) return json(res, 401, { error: 'Sign in to send an email.' });

      try {
        const body = JSON.parse(await readBody(req)) as {
          job?: JobSpec;
          to?: string;
          cc?: string;
          bcc?: string;
          subject?: string;
          text?: string;
        };
        if (!body.job) return json(res, 400, { error: 'no job' });
        const job = normalise(body.job);

        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        const me = await profileOf(caller.id, token);

        const views = sheetViews(job);
        const attachments = [
          {
            name: xlsxFileName(job.jobNo),
            bytes: toXlsx({
              jobNo: job.jobNo,
              density: job.density,
              rooms: job.rooms.map((r) => r.name),
              blocks: buildJob(job),
              flashing: jobFlashing(job),
            }),
          },
        ];
        if (views.length) {
          const sheet = composeSheet(views, { title: `${job.jobNo} — DRAWING SHEET` });
          attachments.push({
            name: pdfFileName(job.jobNo),
            bytes: toPdfPages([sheet.drawing, ...views], { footer: job.jobNo }),
          });
        }

        const result = await sendMail(
          {
            to: parseAddresses(body.to ?? ''),
            cc: parseAddresses(body.cc ?? ''),
            bcc: parseAddresses(body.bcc ?? ''),
            subject: (body.subject ?? '').trim() || defaultSubject(job.jobNo),
            text: body.text ?? '',
            attachments,
            from: me?.mail_from ?? '',
            fromName: me?.display_name ?? '',
            // the signed-in estimator, so the customer replies to a person
            replyTo: caller.email,
          },
          apiKey,
          fallbackFrom,
        );

        if (!result.ok) return json(res, 400, { error: result.error });
        return json(res, 200, {
          ok: true,
          messageId: result.messageId,
          attached: attachments.map((a) => a.name),
          replyTo: caller.email,
        });
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // what-if: build a BOQ from an edited spec without touching the job file
    if (path === '/api/boq' && req.method === 'POST') {
      try {
        const spec = JSON.parse(await readBody(req)) as JobSpec;
        return json(res, 200, buildPayload(spec));
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (path === '/api/spec') {
      const job = JOBS.find((j) => j.jobNo === url.searchParams.get('job'));
      if (!job) return json(res, 404, { error: 'unknown job' });
      return json(res, 200, job);
    }

    if (path === '/api/verify') {
      return json(res, 200, await runVerify());
    }

    // rendered drawings for one job, room by room
    if (path === '/api/drawings') {
      const job = JOBS.find((j) => j.jobNo === url.searchParams.get('job'));
      if (!job) return json(res, 404, { error: 'unknown job' });
      return json(res, 200, {
        jobNo: job.jobNo,
        rooms: job.rooms.map((room, ri) => drawingsFor(room, ri)),
      });
    }

    // one drawing as a DXF download
    if (path === '/api/dxf') {
      const job = JOBS.find((j) => j.jobNo === url.searchParams.get('job'));
      const room = job?.rooms[Number(url.searchParams.get('room'))];
      const idx = Number(url.searchParams.get('i'));
      if (!job || !room || !canDraw(room)) return json(res, 404, { error: 'not drawable' });
      const drawing = roomDrawings(room)[idx];
      if (!drawing) return json(res, 404, { error: 'no such drawing' });
      const name = `${job.jobNo}-${drawing.title}`.replace(/[^a-z0-9]+/gi, '-');
      res.writeHead(200, {
        'content-type': 'image/vnd.dxf',
        'content-disposition': `attachment; filename="${name}.dxf"`,
      });
      return res.end(toDxf(drawing));
    }

    /*
     * The guide, and the file it is. `GUIDE.md` is the only copy — the page
     * renders it rather than repeating it, because two sets of instructions
     * drift apart and the one that gets read is the one on the screen.
     */
    if (path === '/guide' || path === '/guide/') {
      return serveStatic(res, WEB, 'guide.html');
    }
    if (path === '/api/guide') {
      try {
        const md = await readFile(join(ROOT, 'GUIDE.md'), 'utf8');
        return send(res, 200, md, 'text/markdown; charset=utf-8');
      } catch {
        return send(res, 404, 'GUIDE.md is not there', 'text/plain');
      }
    }

    // the old single-file calculator, kept for reference
    if (path === '/legacy' || path === '/legacy/') {
      return serveStatic(res, join(ROOT, 'legacy'), 'index.html');
    }

    return serveStatic(res, WEB, path === '/' ? 'index.html' : path);
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Panel Suite — http://${HOST}:${PORT}`);
  // printed every time: when a host returns 503, these lines are the answer,
  // and its own panel only shows what it meant to set, not what arrived
  console.log(`  listening on ${HOST}:${PORT} — ${BIND_REASON}`);
  console.log(`  node ${process.versions.node} · cwd ${process.cwd()}`);
  console.log('  environment as it arrived:');
  for (const line of environmentReport(process.env)) console.log(line);
  console.log(`  jobs: ${JOBS.map((j) => j.jobNo).join(', ')}`);
  console.log(`  legacy calculator: http://${HOST}:${PORT}/legacy\n`);
});

server.on('error', (err) => {
  console.error(`\n  Could not listen on ${HOST}:${PORT} — ${err.message}`);
  console.error('  environment as it arrived:');
  for (const line of environmentReport(process.env)) console.error(line);
  console.error('');
  process.exit(1);
});
