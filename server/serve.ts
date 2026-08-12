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
import { fmt2, round } from '../core/format.ts';
import { canDraw, jobPlan, roomDrawings, toDxf, toSvg } from '../core/draw/index.ts';
import { compileWalls } from '../core/plan.ts';
import { DEFAULT_SKIN, DOOR_CORES, DOOR_TYPES, SHEET_MATERIALS } from '../core/rules.ts';
import type { BoqBlock, JobSpec, RoomSpec } from '../core/types.ts';

import { HI_15191 } from '../core/jobs/hi-15191.ts';
import { HI_15223 } from '../core/jobs/hi-15223.ts';
import { HI_15279 } from '../core/jobs/hi-15279.ts';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'web');
const PORT = Number(process.env.PORT ?? 5173);
/**
 * Localhost by default: the sheets are job data and this is a desk tool. A
 * host that runs the app behind its own proxy has to be told explicitly —
 * `HOST=0.0.0.0` — so that going public is a decision, never an accident.
 */
const HOST = process.env.HOST ?? '127.0.0.1';

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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Run the real verifier and hand its output to the browser verbatim. */
function runVerify(): Promise<{ output: string; code: number }> {
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
    // the pick lists the form offers, straight from core/rules.ts
    if (path === '/api/rules') {
      return json(res, 200, {
        materials: SHEET_MATERIALS,
        defaultSkin: DEFAULT_SKIN,
        doorTypes: Object.entries(DOOR_TYPES).map(([k, v]) => ({ key: k, ...v })),
        doorCores: DOOR_CORES,
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
        };
        // the whole-job layout, or one of a room's own drawings
        const drawing = body.job
          ? jobPlan(normalise(body.job))
          : roomDrawings(withWalls(body.room!))[body.index ?? 0];
        if (!drawing) return json(res, 404, { error: 'no such drawing' });
        return send(res, 200, toDxf(drawing), 'image/vnd.dxf');
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
  console.log(`\n  Hikom Panel Suite — http://${HOST}:${PORT}`);
  console.log(`  jobs: ${JOBS.map((j) => j.jobNo).join(', ')}`);
  console.log(`  legacy calculator: http://${HOST}:${PORT}/legacy\n`);
});
