/**
 * Reading dimensions off an uploaded WALL PANEL LAYOUT drawing, through
 * Anthropic's vision API.
 *
 * Impure by nature — a network call and an API key — so it lives in
 * `server/` and never in `core/`. One `fetch`, no dependency, same shape as
 * `server/mail.ts`.
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it is deliberately not
 *
 * **This never builds a BOQ.** It reads a drawing and answers with the
 * figures a *form* would ask for — room size, wall thickness, one door — so
 * the estimator's own calculator form can be pre-filled. The estimator still
 * presses Build, the same engine runs, and nothing here ever calls
 * `buildJob`. CLAUDE.md's rule is the reason: a BOQ sheet is only trustworthy
 * because every input is transcribed and checked by a person, and an AI
 * reading a scanned drawing is exactly the kind of transcription that needs
 * checking, not less.
 *
 * **A figure the model is not confident about is left out, not guessed.**
 * The prompt says so explicitly, and `parseExtraction` treats anything
 * outside a sane range as absent rather than trusting it blindly. The
 * `notes` field is where the model says what it could not read, and the
 * browser shows that text next to the pre-filled form rather than hiding it.
 */

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
/**
 * Reading small printed dimensions off a drawing is the hard part, so the
 * default is the most capable model; `VISION_MODEL` overrides it on the host.
 */
const DEFAULT_MODEL = 'claude-opus-5-5';
/** What this feature ran on before, known to work with the site's key. */
const FALLBACK_MODEL = 'claude-sonnet-4-5';

/**
 * Anthropic's own request-body cap is generous; the file itself is the real
 * limit — 5MB for an image, 32MB for a PDF (Anthropic's own PDF cap, and
 * comfortably under their 100-page-per-document limit for a single-sheet
 * drawing export).
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;

/** What the model can actually read. DWG/DXF are vector CAD data, not a
 * raster or a document Claude's vision API accepts — there is no honest way
 * to "support" them without a CAD-parsing dependency this repo does not
 * carry (see CLAUDE.md: no dependencies). The estimator exports to PDF from
 * AutoCAD instead (File -> Export -> PDF, one click) and uploads that. */
const SUPPORTED_MIME = /^image\/(png|jpe?g)$|^application\/pdf$/;

export type WallName = 'top' | 'right' | 'bottom' | 'left';
export type CornerName = 'NW' | 'NE' | 'SE' | 'SW';

/** One printed figure along a wall's dimension chain, in plan reading order. */
export interface ExtractedSeg {
  kind: 'corner' | 'panel' | 'door';
  mm: number;
}

export interface ExtractedDoor {
  /** which wall of the plan the door is drawn on */
  wall: WallName | null;
  clearW: number | null;
  clearH: number | null;
  moduleW: number | null;
  hand: 'LHS' | 'RHS' | null;
  skinOuter: string | null;
  skinInner: string | null;
}

export interface ExtractedRoom {
  name: string | null;
  /** external envelope, mm */
  w: number | null;
  l: number | null;
  h: number | null;
  wallTh: number | null;
  ceilTh: number | null;
  floor: { kind: 'pufSlab' | 'panelised' | null; th: number | null } | null;
  /** the ceiling panel layout's printed size */
  ceiling: { w: number | null; l: number | null } | null;
  door: ExtractedDoor | null;
  /** each wall's printed chain, top and bottom left to right, left and right top to bottom */
  walls: Record<WallName, ExtractedSeg[]> | null;
  /** corners the drawing marks as a butt joint */
  buttJoints: CornerName[];
}

export interface ExtractionResult {
  jobNo: string | null;
  room: ExtractedRoom;
  /** what the model could not read, or is unsure about — shown to the estimator */
  notes: string;
  /** derived from the above by `deriveForm` — never typed by the model */
  form: DerivedForm | null;
}

/** A sane range per field: outside it, the figure is dropped rather than trusted. */
const RANGES: Record<string, [number, number]> = {
  w: [500, 20000],
  l: [500, 20000],
  h: [1800, 6000],
  wallTh: [20, 300],
  ceilTh: [20, 300],
  floorTh: [20, 300],
  clearW: [400, 3000],
  clearH: [1200, 3000],
  moduleW: [400, 3000],
  seg: [20, 6000],
};

const inRange = (key: string, v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const range = RANGES[key];
  if (range && (v < range[0] || v > range[1])) return null;
  return Math.round(v);
};

const PROMPT = `You are reading a WALL PANEL LAYOUT drawing for a PUF sandwich panel cold room, the kind a fabrication shop issues before cutting panels. Your answer feeds a calculator that a person then checks, so accuracy matters far more than completeness: transcribe only what is actually printed.

Answer with ONLY a JSON object, no other text, in exactly this shape (null where a figure is not printed):

{
  "jobNo": string or null,          // from the title block, e.g. "HI-12378"
  "room": {
    "name": string or null,         // e.g. "CHILLER ROOM"
    "w": number or null,            // external width, mm: the plan's horizontal overall dimension
    "l": number or null,            // external length, mm: the plan's vertical overall dimension
    "h": number or null,            // wall height, mm, from the spec box "A X B X H MM (EXT)" or the elevation
    "wallTh": number or null,       // from "WALL: NN MM THICK"
    "ceilTh": number or null,       // from "CEILING: NN MM THICK"
    "floor": { "kind": "pufSlab" or "panelised" or null, "th": number or null } or null,   // spec box FLOOR row
    "ceiling": { "w": number or null, "l": number or null } or null,   // the CEILING PANEL LAYOUT's two printed overall dimensions
    "door": {
      "wall": "top" or "right" or "bottom" or "left" or null,   // which wall of the PLAN VIEW the door opening is drawn on
      "clearW": number or null,     // clear opening width
      "clearH": number or null,     // clear opening height
      "moduleW": number or null,    // the door's overall width in the wall chain (frame + opening + frame), e.g. the 810 over a 165+520+125 chain
      "hand": "LHS" or "RHS" or null,   // from the door note, e.g. "1 NO RHS OPENING"
      "skinOuter": string or null,  // door sheet, e.g. "SS" or "PPGI", from the door note (SS/SS means both SS)
      "skinInner": string or null
    } or null,
    "walls": {
      "top":    [ {"kind": "corner"|"panel"|"door", "mm": number}, ... ],
      "right":  [ ... ],
      "bottom": [ ... ],
      "left":   [ ... ]
    } or null,
    "buttJoints": [ "NW" | "NE" | "SE" | "SW" ]   // corners the drawing marks "Butt joint"
  },
  "notes": string   // plain text: anything unclear, any figure you are unsure of, any view or room you did not transcribe. Empty string if nothing to flag.
}

How to fill "walls": for each of the four walls of the WALL PANEL LAYOUT plan, list the figures printed in that wall's own dimension chain, in the order they appear reading the plan - top and bottom walls LEFT to RIGHT, left and right walls TOP to BOTTOM. Use kind "corner" for a corner-panel leg (usually 300 at each end), "door" for the door's overall width in the chain, "panel" for every other wall panel width. Do not include the overall wall dimension, the door's inner sub-dimensions (frame / opening), or any wall-thickness or butt allowance that is not itself printed as a number. A wall with a butt joint may therefore add up to less than the wall's length - that is expected, leave the gap.

Rules:
- Never invent or compute a figure. If a number is not printed, leave it out (null, or omit the segment) and say so in "notes".
- If it is not a single rectangular room (L-shape, several rooms, angled walls), set "walls" to null, fill the bounding rectangle for w and l, and say so in "notes".
- Only one door: the most clearly labelled; say in "notes" if you dropped others.
- Respond with the JSON object only.`;

export interface ExtractRequest {
  /** raw file bytes */
  bytes: Uint8Array;
  /** e.g. "image/png", "image/jpeg", "application/pdf" */
  mimeType: string;
}

const WALLS: WallName[] = ['top', 'right', 'bottom', 'left'];
const CORNERS: CornerName[] = ['NW', 'NE', 'SE', 'SW'];

const segsOf = (v: unknown): ExtractedSeg[] =>
  Array.isArray(v)
    ? v.flatMap((x): ExtractedSeg[] => {
        const mm = inRange('seg', x?.mm);
        const kind = x?.kind;
        return mm !== null && (kind === 'corner' || kind === 'panel' || kind === 'door') ? [{ kind, mm }] : [];
      })
    : [];

/** The JSON parse step, separated out so a test can check it without a network. */
export function parseExtraction(raw: string): ExtractionResult {
  // the model is asked to answer with only JSON, but a code fence sometimes
  // rides along anyway — stripped rather than trusted to be absent
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Could not read a dimension out of that — the drawing may be unclear or not a wall panel layout.');
  }

  const r = parsed.room ?? {};
  const d = r.door ?? null;
  const wallsIn = r.walls && typeof r.walls === 'object' ? r.walls : null;
  const room: ExtractedRoom = {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null,
    w: inRange('w', r.w),
    l: inRange('l', r.l),
    h: inRange('h', r.h),
    wallTh: inRange('wallTh', r.wallTh),
    ceilTh: inRange('ceilTh', r.ceilTh),
    floor: r.floor
      ? {
          kind: r.floor.kind === 'pufSlab' || r.floor.kind === 'panelised' ? r.floor.kind : null,
          th: inRange('floorTh', r.floor.th),
        }
      : null,
    ceiling: r.ceiling ? { w: inRange('w', r.ceiling.w), l: inRange('l', r.ceiling.l) } : null,
    door: d
      ? {
          wall: WALLS.includes(d.wall) ? d.wall : null,
          clearW: inRange('clearW', d.clearW),
          clearH: inRange('clearH', d.clearH),
          moduleW: inRange('moduleW', d.moduleW),
          hand: d.hand === 'LHS' || d.hand === 'RHS' ? d.hand : null,
          skinOuter: typeof d.skinOuter === 'string' ? d.skinOuter : null,
          skinInner: typeof d.skinInner === 'string' ? d.skinInner : null,
        }
      : null,
    walls: wallsIn
      ? (Object.fromEntries(WALLS.map((w) => [w, segsOf(wallsIn[w])])) as Record<WallName, ExtractedSeg[]>)
      : null,
    buttJoints: Array.isArray(r.buttJoints)
      ? r.buttJoints.filter((c: unknown) => CORNERS.includes(c as CornerName))
      : [],
  };
  return {
    jobNo: typeof parsed.jobNo === 'string' && parsed.jobNo.trim() ? parsed.jobNo.trim() : null,
    room,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    form: deriveForm(room),
  };
}

/** What the calculator's form should be set to, worked out from the printed figures. */
export interface DerivedForm {
  floorKind: 'pufSlab' | 'panelised' | null;
  floorTh: number | null;
  door: null | {
    /** edge index, clockwise from the top: 0 top, 1 right, 2 bottom, 3 left */
    edge: number;
    /** distance along the wall's own run, in the wall's own direction — null when it cannot be told */
    fromLeft: number | null;
    moduleW: number | null;
    clearW: number | null;
    clearH: number | null;
    hand: 'LHS' | 'RHS' | null;
    /** the shop's default: a cold room door opens out of the room */
    swing: 'out';
    skinOuter: { material: string; thickness: number } | null;
    skinInner: { material: string; thickness: number } | null;
    label: string;
  };
  /** per vertex NW, NE, SE, SW — a butt joint means no corner panel there */
  corners: boolean[];
  through: Array<'prev' | 'next'>;
  /** a corner whose printed leg is not the room's; '' where nothing is stated */
  cornerLegs: Array<number | ''>;
  /**
   * What the drawing prints, for the calculator to hold its own BOQ against.
   * Never fed into a build — a check that was also an input would prove nothing.
   */
  expected: { wallPanels: number[]; cornerPanels: number[]; roof: [number, number] | null } | null;
  warnings: string[];
}

const SKIN_NAMES: Record<string, string> = {
  PP: 'PPGI', PPGI: 'PPGI', GI: 'GI', EGP: 'EGP', SS: 'SS', PCGI: 'PCGI', HPCL: 'HPCL',
};
const SKIN_THICKNESS: Record<string, number> = { PPGI: 0.4, GI: 0.5, EGP: 0.5, SS: 0.5, PCGI: 0.5, HPCL: 4 };
const SHORT: Record<string, string> = { PPGI: 'PP' };

/**
 * Work the form's settings out of the printed chains, so that nothing the
 * model "decided" reaches the form: the door's wall comes from where the door
 * figure sits, a butt joint from the marked corner, and which wall runs
 * through it from which chain adds up to its full length. Where the figures
 * do not add up the answer is a warning, never an adjusted number.
 *
 * Wall order is the form's: 0 top, 1 right, 2 bottom, 3 left. The chains arrive
 * in plan reading order, so the bottom and left ones are turned round into the
 * direction each edge runs (clockwise), which is what `fromLeft` is measured in.
 */
export function deriveForm(room: ExtractedRoom): DerivedForm {
  const warnings: string[] = [];
  const out: DerivedForm = {
    floorKind: room.floor?.kind ?? null,
    floorTh: room.floor?.th ?? null,
    door: null,
    corners: [true, true, true, true],
    through: ['prev', 'prev', 'prev', 'prev'],
    cornerLegs: ['', '', '', ''],
    expected: null,
    warnings,
  };

  if (room.floor && room.floor.kind === 'panelised') {
    warnings.push('Floor is panelised: its build-up (sheets, ply) was not read — set it on the form.');
  }

  const chains = room.walls;
  if (!chains || room.w == null || room.l == null) {
    warnings.push('The wall chains were not read, so door position, corners and butt joints are left at their defaults.');
    return out;
  }

  const edgeSegs = WALLS.map((w, i) => (i >= 2 ? [...chains[w]].reverse() : chains[w]));
  const lengths = [room.w, room.l, room.w, room.l];
  const th = room.wallTh ?? 0;
  const sum = (s: ExtractedSeg[]) => s.reduce((t, x) => t + x.mm, 0);

  edgeSegs.forEach((segs, i) => {
    if (!segs.length) {
      warnings.push(`Wall ${WALLS[i]}: no chain was read.`);
      return;
    }
    const ok = [0, 1, 2].some((k) => sum(segs) === lengths[i] - k * th);
    if (!ok) {
      warnings.push(
        `Wall ${WALLS[i]}: the printed figures add to ${sum(segs)} but the wall is ${lengths[i]} — one of them was probably misread.`,
      );
    }
  });

  // butt joints: no corner panel, and the chains say which wall runs through
  const vertexOf = (c: CornerName) => CORNERS.indexOf(c);
  for (const c of room.buttJoints) {
    const v = vertexOf(c);
    out.corners[v] = false;
    const prev = (v + 3) % 4;
    const next = v;
    const runs = (i: number) => sum(edgeSegs[i]) === lengths[i];
    const butts = (i: number) => sum(edgeSegs[i]) === lengths[i] - th;
    if (runs(next) && butts(prev)) out.through[v] = 'next';
    else if (runs(prev) && butts(next)) out.through[v] = 'prev';
    else {
      warnings.push(
        `Butt joint at ${c}: the two chains do not say which wall runs through — check which one does.`,
      );
    }
  }

  // corner legs, read off the corner figures at each wall end
  const legAt: Array<number | null> = [null, null, null, null];
  for (let v = 0; v < 4; v++) {
    if (!out.corners[v]) continue;
    const arriving = edgeSegs[(v + 3) % 4].at(-1);
    const leaving = edgeSegs[v][0];
    const legs = [arriving, leaving].filter((s) => s?.kind === 'corner').map((s) => s!.mm);
    if (!legs.length) {
      warnings.push(`Corner ${CORNERS[v]}: no corner figure was read — the room's corner leg is used.`);
    } else {
      if (legs.length === 2 && legs[0] !== legs[1]) {
        warnings.push(`Corner ${CORNERS[v]}: its two walls print different legs (${legs[0]} and ${legs[1]}).`);
      }
      legAt[v] = legs[legs.length - 1];
    }
  }
  const legs = legAt.filter((x): x is number => x != null);
  const tally = new Map<number, number>();
  for (const x of legs) tally.set(x, (tally.get(x) ?? 0) + 1);
  const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  legAt.forEach((leg, v) => {
    if (leg != null && leg !== common) out.cornerLegs[v] = leg;
  });

  // the door
  const door = room.door;
  if (door?.wall) {
    const edge = WALLS.indexOf(door.wall);
    const segs = edgeSegs[edge];
    const at = segs.findIndex((s) => s.kind === 'door');
    let fromLeft: number | null = null;
    if (at < 0) {
      warnings.push(`The door is on wall ${door.wall} but no door figure was read in that wall's chain — its position is left to the calculator.`);
    } else {
      fromLeft = segs.slice(0, at).filter((s) => s.kind === 'panel').reduce((t, s) => t + s.mm, 0);
    }
    const skin = (name: string | null) => {
      const m = name ? SKIN_NAMES[name.trim().toUpperCase().replace(/\.$/, '')] : undefined;
      if (name && !m) warnings.push(`Door sheet "${name}" is not a stocked material — left at the default.`);
      return m ? { material: m, thickness: SKIN_THICKNESS[m] } : null;
    };
    const outer = skin(door.skinOuter);
    const inner = skin(door.skinInner);
    for (const s of [outer, inner]) {
      if (s && s.material !== 'PPGI') {
        warnings.push(`Door sheet ${s.material}: thickness is not printed, ${s.thickness}mm assumed — confirm it.`);
        break;
      }
    }
    const tag = (s: { material: string } | null) => (s ? (SHORT[s.material] ?? s.material) : 'PP');
    const sheets = tag(outer) === tag(inner) ? tag(outer) : `${tag(outer)}/${tag(inner)}`;
    out.door = {
      edge,
      fromLeft,
      moduleW: segs[at]?.mm ?? door.moduleW,
      clearW: door.clearW,
      clearH: door.clearH,
      hand: door.hand,
      swing: 'out',
      skinOuter: outer,
      skinInner: inner,
      label: `Flush Door ${sheets}`,
    };
  } else if (door) {
    warnings.push('The wall the door is on was not read — it is not placed.');
  }

  // what the drawing prints, to hold the BOQ against afterwards
  const wallPanels = edgeSegs.flat().filter((s) => s.kind === 'panel').map((s) => s.mm);
  const cornerPanels = legAt.flatMap((leg, v) => (out.corners[v] ? [(leg ?? common ?? 0) * 2] : []));
  out.expected = {
    wallPanels,
    cornerPanels: cornerPanels.filter((x) => x > 0),
    roof: room.ceiling?.w && room.ceiling?.l ? [room.ceiling.w, room.ceiling.l] : null,
  };
  return out;
}

export interface ExtractProblem {
  error: string;
}

/** Everything wrong with a request, before a byte is sent. */
export function problemWith(req: ExtractRequest): string | null {
  if (!req.bytes?.length) return 'No drawing was uploaded.';
  if (!SUPPORTED_MIME.test(req.mimeType)) {
    return `${req.mimeType} is not a file Claude can read. Upload a PNG or JPEG photo/scan of the drawing, or a PDF export of it — AutoCAD's own File -> Export -> PDF makes one from a DWG in a click. DWG/DXF itself cannot be read directly: it is vector CAD data, not something a vision model opens.`;
  }
  if (req.mimeType === 'application/pdf') {
    if (req.bytes.length > MAX_PDF_BYTES) {
      return `The PDF is ${(req.bytes.length / 1024 / 1024).toFixed(1)}MB and the limit is 32MB. Try a single-page export of just the drawing sheet.`;
    }
  } else if (req.bytes.length > MAX_IMAGE_BYTES) {
    return `The image is ${(req.bytes.length / 1024 / 1024).toFixed(1)}MB and the limit is 5MB. Try a smaller export or a lower-resolution scan.`;
  }
  return null;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/**
 * Read a drawing. The second parameter is an environment variable on the
 * server and never reaches the browser — the whole reason this goes through
 * our own host rather than straight from the page.
 */
export async function extractDrawing(
  req: ExtractRequest,
  secretKey: string,
  model: string = DEFAULT_MODEL,
): Promise<ExtractionResult> {
  const problem = problemWith(req);
  if (problem) throw new Error(problem);

  const call = (m: string) =>
    fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': secretKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: m,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              req.mimeType === 'application/pdf'
                ? { type: 'document', source: { type: 'base64', media_type: req.mimeType, data: toBase64(req.bytes) } }
                : { type: 'image', source: { type: 'base64', media_type: req.mimeType, data: toBase64(req.bytes) } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });

  let res: Response;
  try {
    res = await call(model);
    // a key that cannot see the newer model gets a 404 for it — the model that
    // was already working on this site is the fallback, rather than a dead button
    if (res.status === 404 && model !== FALLBACK_MODEL) res = await call(FALLBACK_MODEL);
  } catch (err) {
    throw new Error(`Could not reach the vision service: ${(err as Error).message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* the raw text is the best answer there is */
    }
    throw new Error(`The vision service refused the request: ${message} (${res.status})`);
  }

  let body: { content?: Array<{ type: string; text?: string }> };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('The vision service answered something that was not JSON.');
  }
  const answer = body.content?.find((c) => c.type === 'text')?.text ?? '';
  if (!answer) throw new Error('The vision service gave no answer to read.');
  return parseExtraction(answer);
}
