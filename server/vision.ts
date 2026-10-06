/**
 * Reading dimensions off an uploaded WALL PANEL LAYOUT drawing — one room or
 * several on the same sheet — through Anthropic's vision API.
 *
 * Impure by nature — a network call and an API key — so it lives in
 * `server/` and never in `core/`. One `fetch`, no dependency, same shape as
 * `server/mail.ts`.
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it is deliberately not
 *
 * **This never builds a BOQ.** It reads a drawing and answers with the
 * figures a *form* would ask for — room size, wall thickness, one door per
 * room — so the estimator's own calculator form can be pre-filled. The
 * estimator still presses Build, the same engine runs, and nothing here ever
 * calls `buildJob`. CLAUDE.md's rule is the reason: a BOQ sheet is only
 * trustworthy because every input is transcribed and checked by a person, and
 * an AI reading a scanned drawing is exactly the kind of transcription that
 * needs checking, not less.
 *
 * **A figure the model is not confident about is left out, not guessed.**
 * The prompt says so explicitly, and `parseExtraction` treats anything
 * outside a sane range as absent rather than trusting it blindly. The
 * `notes` field is where the model says what it could not read, and the
 * browser shows that text next to the pre-filled form rather than hiding it.
 *
 * **The core is asked, not re-derived.** Where `deriveForm` needs to know what
 * the engine would do with a wall — how a run splits, where a ceiling lands —
 * it calls `compileWalls` and `layoutRoom` from `core/` rather than repeating
 * their arithmetic here. Two copies of a shop rule drift apart.
 */

import { compileWalls, rect } from '../core/plan.ts';
import { layoutRoom } from '../core/layout.ts';
import { DOOR_BLANK_OFFSETS } from '../core/rules.ts';
import type { EdgeOverride, RoomSpec, VertexOverride } from '../core/types.ts';

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

/**
 * Room by room, a sheet of two or three rooms is a long answer: every wall's
 * chain, the door, the sheets and the notes, each over again. 4096 cut that
 * short mid-JSON.
 */
const MAX_OUTPUT_TOKENS = 8192;

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
  /** printed height of the chequered sheet up the leaf, and the door lift off the slab */
  chqHeight: number | null;
  lift: number | null;
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
  /**
   * Walls this room does not build: drawn dashed, with one overall dimension
   * and no panel chain. They belong to a neighbour, or to nobody. The chain of
   * an open wall is empty.
   */
  openWalls: WallName[];
  /** the sheet marked on the OUTSIDE and the INSIDE of the walls, as the plan labels them */
  wallSheets: { outer: string | null; inner: string | null } | null;
}

export interface ExtractionResult {
  jobNo: string | null;
  /**
   * One entry per room drawn on the sheet, in reading order (top to bottom,
   * then left to right). `form` is derived from `room` by `deriveForm` — never
   * typed by the model.
   */
  rooms: Array<{ room: ExtractedRoom; form: DerivedForm | null }>;
  /** what the model could not read, or is unsure about — shown to the estimator */
  notes: string;
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
  chq: [50, 2000],
  lift: [0, 500],
};

const inRange = (key: string, v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const range = RANGES[key];
  if (range && (v < range[0] || v > range[1])) return null;
  return Math.round(v);
};

const PROMPT = `You are reading a WALL PANEL LAYOUT drawing for PUF sandwich panel cold rooms, the kind a fabrication shop issues before cutting panels. The sheet may show ONE room or SEVERAL rooms side by side or one above the other. Your answer feeds a calculator that a person then checks, so accuracy matters far more than completeness: transcribe only what is actually printed.

Answer with ONLY a JSON object, no other text, in exactly this shape (null where a figure is not printed):

{
  "jobNo": string or null,          // from the title block, e.g. "HI-12378"
  "rooms": [                        // ONE entry per room drawn on the sheet, in reading order: top to bottom, then left to right. A sheet with one room has one entry.
    {
      "name": string or null,       // e.g. "CHILLER ROOM" or "CHILLER ROOM.1"
      "w": number or null,          // external width, mm: the plan's horizontal overall dimension
      "l": number or null,          // external length, mm: the plan's vertical overall dimension
      "h": number or null,          // wall height, mm, from this room's spec box "A X B X H MM (EXT)" or its elevation
      "wallTh": number or null,     // from "WALL: NN MM THICK"
      "ceilTh": number or null,     // from "CEILING: NN MM THICK"
      "floor": { "kind": "pufSlab" or "panelised" or null, "th": number or null } or null,   // spec box FLOOR row
      "ceiling": { "w": number or null, "l": number or null } or null,   // this room's CEILING PANEL LAYOUT: its two printed overall dimensions
      "door": {
        "wall": "top" or "right" or "bottom" or "left" or null,   // which wall of the PLAN VIEW the door opening is drawn on
        "clearW": number or null,     // clear opening width
        "clearH": number or null,     // clear opening height
        "moduleW": number or null,    // the door's overall width in the wall chain (frame + opening + frame), e.g. the 810 over a 165+520+125 chain
        "hand": "LHS" or "RHS" or null,   // from the door note, e.g. "1 NO RHS OPENING"
        "skinOuter": string or null,  // door sheet on the OUTSIDE face, e.g. "SS" or "PP"
        "skinInner": string or null,  // door sheet on the INSIDE face
        "chqHeight": number or null,  // "SS. CHQ. SHEET BOTH SIDE-600MM" -> 600
        "lift": number or null        // "DOOR LIFT :- 110 MM" -> 110
      } or null,
      "walls": {
        "top":    [ {"kind": "corner"|"panel"|"door", "mm": number}, ... ],
        "right":  [ ... ],
        "bottom": [ ... ],
        "left":   [ ... ]
      } or null,
      "buttJoints": [ "NW" | "NE" | "SE" | "SW" ],   // corners the drawing marks "Butt joint"
      "openWalls": [ "top" | "right" | "bottom" | "left" ],   // walls this room does NOT build, see below. Empty list when every wall is built.
      "wallSheets": { "outer": string or null, "inner": string or null } or null   // the sheet labelled on the OUTSIDE face of the walls (e.g. "PPGI" or "PP") and on the INSIDE face (inside the room, e.g. "SS"), as the plan marks them. If the plan marks different sheets on different parts of one wall, give the main one and say so in "notes".
    }
  ],
  "notes": string   // plain text: anything unclear, any figure you are unsure of, and EVERYTHING on the sheet you did not transcribe (a hatched block, a column, a plinth, an unlabelled rectangle, a second door, a view you skipped). Name the room each note is about. Empty string if nothing to flag.
}

How to fill "walls": for each of the four walls of a room's WALL PANEL LAYOUT plan, list the figures printed in that wall's own dimension chain, in the order they appear reading the plan - top and bottom walls LEFT to RIGHT, left and right walls TOP to BOTTOM. Use kind "corner" for a corner-panel leg (usually 300 at each end), "door" for the door's overall width in the chain, "panel" for every other wall panel width. Do not include the overall wall dimension, the door's inner sub-dimensions (frame / opening), or any wall-thickness or butt allowance that is not itself printed as a number. A wall with a butt joint may therefore add up to less than the wall's length - that is expected, leave the gap. A wall's chain normally adds up to the wall's overall dimension; copy what is printed, do not adjust a figure to make it add up.

Open walls: a wall drawn dashed (or as a plain line) with ONE overall dimension and NO chain of panel widths is a wall this room does not build. Put its name in "openWalls" and give it an empty chain []. Never invent panel widths for it. At the end of a neighbouring wall's chain that meets an open wall, a printed 300 with no corner L drawn at that junction is a plain "panel", not a "corner": use kind "corner" only where a corner panel is actually drawn.

Door sheets: a door note such as "FLUSH DOOR 60 MM THICK PP/SS" lists the outside sheet first and the inside sheet second, so "PP/SS" is skinOuter "PP", skinInner "SS". "SS/SS" is both SS. A single sheet named once ("SS") is both faces. If the note names sheets but not which face, say so in "notes".

Several rooms: match each spec box, door note, elevation and ceiling layout to ITS OWN room by the room's name or number. If you cannot tell which room a figure belongs to, leave it null and say so in "notes".

Rules:
- Never invent or compute a figure. If a number is not printed, leave it out (null, or omit the segment) and say so in "notes".
- If a room is not a single rectangle (L-shape, angled walls), set its "walls" to null, fill the bounding rectangle for w and l, and say so in "notes". Other rooms on the sheet are still read normally.
- Only one door per room: the most clearly labelled; say in "notes" if you dropped others.
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

/** One room's answer, with every figure range-checked. */
function parseRoom(r: any): ExtractedRoom {
  const d = r.door ?? null;
  const wallsIn = r.walls && typeof r.walls === 'object' ? r.walls : null;
  return {
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
          chqHeight: inRange('chq', d.chqHeight),
          lift: inRange('lift', d.lift),
        }
      : null,
    walls: wallsIn
      ? (Object.fromEntries(WALLS.map((w) => [w, segsOf(wallsIn[w])])) as Record<WallName, ExtractedSeg[]>)
      : null,
    buttJoints: Array.isArray(r.buttJoints)
      ? r.buttJoints.filter((c: unknown) => CORNERS.includes(c as CornerName))
      : [],
    openWalls: Array.isArray(r.openWalls)
      ? WALLS.filter((w) => r.openWalls.includes(w))
      : [],
    wallSheets: r.wallSheets
      ? {
          outer: typeof r.wallSheets.outer === 'string' ? r.wallSheets.outer : null,
          inner: typeof r.wallSheets.inner === 'string' ? r.wallSheets.inner : null,
        }
      : null,
  };
}

/** The JSON parse step, separated out so a test can check it without a network. */
export function parseExtraction(raw: string): ExtractionResult {
  // the model is asked to answer with only JSON, but a code fence sometimes
  // rides along anyway — stripped rather than trusted to be absent
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // prose around the object ("Here is the reading: {...} Note: ...") is
    // tolerated by taking the outermost braces; a reply that is still not JSON
    // after that is refused
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    try {
      if (first < 0 || last <= first) throw new Error('no object');
      parsed = JSON.parse(cleaned.slice(first, last + 1));
    } catch {
      throw new Error('Could not read a dimension out of that — the drawing may be unclear or not a wall panel layout.');
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Could not read a dimension out of that — the drawing may be unclear or not a wall panel layout.');
  }

  // the answer asked for is `rooms`; a model that sticks to the old single
  // `room` shape is wrapped rather than refused
  if (Array.isArray(parsed)) parsed = { rooms: parsed };
  // (a bare room object, with no `rooms` or `room` around it, is wrapped the same way)
  const bareRoom = !parsed.rooms && !parsed.room && ('walls' in parsed || 'w' in parsed || 'wallTh' in parsed);
  const rawRooms: unknown[] =
    Array.isArray(parsed.rooms) && parsed.rooms.length
      ? parsed.rooms
      : parsed.room && typeof parsed.room === 'object'
        ? [parsed.room]
        : bareRoom
          ? [parsed]
          : [];
  const rooms = rawRooms
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => {
      const room = parseRoom(r);
      return { room, form: deriveForm(room) };
    });
  if (!rooms.length) {
    throw new Error('No room could be read from that — the drawing may be unclear or not a wall panel layout.');
  }

  return {
    jobNo: typeof parsed.jobNo === 'string' && parsed.jobNo.trim() ? parsed.jobNo.trim() : null,
    rooms,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
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
    chqHeight: number | null;
    lift: number | null;
    label: string;
  };
  /** the sheet on each face of every wall; null leaves the form's default */
  wallSkin: { outer: { material: string; thickness: number } | null; inner: { material: string; thickness: number } | null };
  /** per vertex NW, NE, SE, SW — a butt joint means no corner panel there */
  corners: boolean[];
  through: Array<'prev' | 'next'>;
  /** a corner whose printed leg is not the room's; '' where nothing is stated */
  cornerLegs: Array<number | ''>;
  /**
   * Per edge (0 top, 1 right, 2 bottom, 3 left): true when the room does not
   * build that wall — the neighbour's wall, or nobody's. The form marks the
   * edge shared, so the engine gives it no panels, no corner panel at either
   * end, and a ceiling and floor that stop at the neighbour's wall.
   */
  open: boolean[];
  /**
   * Per edge: the exact panel widths the drawing prints for that wall, along
   * the edge's own direction (the way `fromLeft` is measured) and excluding the
   * door. Only set where they add up exactly to the run the engine has for the
   * wall AND are not what `core/split.ts` would give by itself — null where the
   * shop rule already reproduces the drawing, where nothing was printed, or
   * where the printed figures do not close on the run. An entry here is a typed
   * draftsman figure, to be applied as "Exact widths" and marked as such.
   */
  panels: Array<number[] | null>;
  /**
   * What the drawing prints, for the calculator to hold its own BOQ against.
   * Never fed into a build — a check that was also an input would prove nothing.
   *
   * `roof` is the printed overall ceiling size. A multi-panel ceiling is never
   * one panel, so it is compared as an unordered pair against the engine's
   * total span (sum of the roof rows' panel width x quantity) and panel length.
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
 * What a room built from this form starts as, for the figures the form does not
 * read off a drawing. These are `newRoom()`'s own defaults in web/app.js — the
 * upload never sets them, so a form opened from it runs the engine with exactly
 * these, and the prediction below has to use the same ones or it would describe
 * a room the calculator is not building. If the form's defaults move, so must
 * these — `web.test.ts` reads `newRoom()` and `newDoor()` and fails if they
 * have drifted. A figure the drawing did not print is never taken from here
 * silently: `deriveForm` names every one it falls back on.
 */
export const FORM_DEFAULTS = {
  module: 1180,
  cornerLeg: 300,
  minPanelWidth: 150,
  /** the room a form opens as before anything is read into it: `newRoom()` */
  w: 3050,
  l: 4575,
  h: 2590,
  thickness: 100,
  /** the door a form opens with: `newDoor()` */
  doorModule: 1180,
  doorClearW: 860,
  doorClearH: 1980,
} as const;

const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const sortedNum = (a: number[]) => [...a].sort((x, y) => x - y);

/** What the engine does with a room built from this form, asked of `core/`. */
interface EnginePrediction {
  /** per edge; null where the room does not own the wall */
  runs: Array<{ clearRun: number; widths: number[] } | null>;
  /** the ceiling as the engine lays it, and as it would be if every wall were built */
  ceiling: { w: number; l: number };
  /** the ceiling's panel widths in the order the engine lays them */
  ceilingWidths: number[];
  ceilingIfWalled: { w: number; l: number };
}

/**
 * Compile the room the way the calculator would from this form and read the
 * result back. Nothing here is arithmetic of its own: the wall runs, corner
 * legs, butt thicknesses, door module and shared ends are all `core/`'s.
 *
 * Throws if the engine refuses the room; the caller reports that and moves on.
 */
function predictEngine(room: ExtractedRoom, form: DerivedForm): EnginePrediction {
  const w = room.w!;
  const l = room.l!;
  const th = room.wallTh!;

  const edges: Record<number, EdgeOverride> = {};
  form.open.forEach((o, i) => {
    if (o) edges[i] = { shared: true };
  });
  const door = form.door;
  if (door && door.moduleW != null && !form.open[door.edge]) {
    edges[door.edge] = {
      ...(edges[door.edge] ?? {}),
      door: {
        label: door.label,
        clearW: door.clearW ?? 0,
        clearH: door.clearH ?? 0,
        moduleW: door.moduleW,
        ...(door.fromLeft != null ? { fromLeft: door.fromLeft } : {}),
      },
    };
  }

  const vertices: Record<number, VertexOverride> = {};
  for (let v = 0; v < 4; v++) {
    if (!form.corners[v]) vertices[v] = { corner: false, through: form.through[v] };
    const leg = form.cornerLegs[v];
    if (form.corners[v] && leg !== '') vertices[v] = { ...(vertices[v] ?? {}), leg };
  }
  const outline = { ...rect(w, l, edges), vertices };

  // an edge's two ends are its own walls' ends only; sides are N top, E right, S bottom, W left
  const end = (i: number) => (form.open[i] ? ('shared' as const) : ('own' as const));
  const spec: RoomSpec = {
    name: room.name ?? 'Room',
    ext: { w, l, h: room.h ?? 2400 },
    wallTh: th,
    ceilTh: room.ceilTh ?? th,
    floor: { kind: 'pufSlab', th: room.floor?.th ?? th, desc: '' },
    ceiling: { splitAxis: 'l', wEnds: [end(3), end(1)], lEnds: [end(0), end(2)] },
    module: FORM_DEFAULTS.module,
    cornerLeg: FORM_DEFAULTS.cornerLeg,
    minPanelWidth: FORM_DEFAULTS.minPanelWidth,
    maxSplitPieces: 2,
    outline,
    walls: compileWalls(outline),
  };

  const layout = layoutRoom(spec);
  const runs = [0, 1, 2, 3].map((i) => {
    const wall = spec.walls.find((x) => x.id === `E${i}`);
    const run = wall && layout.wallRuns.find((r) => r.wallId === wall.id);
    return run ? { clearRun: run.clearRun, widths: run.widths } : null;
  });
  const walled = layoutRoom({ ...spec, ceiling: { splitAxis: 'l', wEnds: ['own', 'own'], lEnds: ['own', 'own'] } });
  return {
    runs,
    ceiling: { w: layout.ceiling.w, l: layout.ceiling.l },
    ceilingWidths: [...layout.ceiling.widths],
    ceilingIfWalled: { w: walled.ceiling.w, l: walled.ceiling.l },
  };
}

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
  const open = WALLS.map((w) => room.openWalls.includes(w));
  const out: DerivedForm = {
    floorKind: room.floor?.kind ?? null,
    floorTh: room.floor?.th ?? null,
    door: null,
    wallSkin: { outer: null, inner: null },
    corners: [true, true, true, true],
    through: ['prev', 'prev', 'prev', 'prev'],
    cornerLegs: ['', '', '', ''],
    open,
    panels: [null, null, null, null],
    expected: null,
    warnings,
  };

  // A figure the drawing did not give is never filled in quietly: the form
  // opens with its own default, and each one is named here so the estimator
  // sees that it is a default and not a reading.
  const fallback = (label: string, value: string) =>
    warnings.push(`${label} was not read — the form's ${value} is used. Set it before relying on the BOQ.`);
  if (room.w == null || room.l == null) {
    fallback('The room width / length', `${FORM_DEFAULTS.w} x ${FORM_DEFAULTS.l} mm default`);
  }
  if (room.h == null) fallback('The wall height', `${FORM_DEFAULTS.h}mm default`);
  if (room.wallTh == null) fallback('The wall thickness', `${FORM_DEFAULTS.thickness}mm default`);
  // the form follows the wall thickness for the ceiling and the floor when
  // only those are missing (web/app.js roomFromReading), and so does the
  // prediction below
  const followed = room.wallTh != null ? `wall thickness (${room.wallTh}mm)` : `${FORM_DEFAULTS.thickness}mm default`;
  if (room.ceilTh == null) warnings.push(`The ceiling thickness was not read — the ${followed} is used.`);
  if (room.floor?.th == null) warnings.push(`The floor thickness was not read — the ${followed} is used.`);

  if (room.floor && room.floor.kind === 'panelised') {
    warnings.push('Floor is panelised: its build-up (sheets, ply) was not read — set it on the form.');
  }

  const chains = room.walls;
  if (!chains || room.w == null || room.l == null) {
    warnings.push('The wall chains were not read, so door position, corners and butt joints are left at their defaults.');
    if (open.some(Boolean)) {
      warnings.push(
        `Wall ${WALLS.filter((_, i) => open[i]).join(', ')} is marked open (not built by this room) but the chains were not read, so nothing could be checked against it.`,
      );
    }
    return out;
  }

  // chains in the direction each edge runs. Copies, because a chain end beside
  // an open wall is re-kinded below and the model's own answer is left alone.
  const edgeSegs = WALLS.map((w, i) =>
    (i >= 2 ? [...chains[w]].reverse() : chains[w]).map((s) => ({ ...s })),
  );
  const lengths = [room.w, room.l, room.w, room.l];
  const th = room.wallTh ?? 0;
  const sum = (s: ExtractedSeg[]) => s.reduce((t, x) => t + x.mm, 0);
  /** a vertex joins edge v-1 to edge v; with an open wall on either side there is no corner panel */
  const nextToOpen = (v: number) => open[(v + 3) % 4] || open[v];

  // OPEN WALLS. A wall drawn dashed with one overall dimension and no chain is
  // read as one this room does not build, and set as the neighbour's (shared).
  // Inferred from HI-15420 room 2's top wall alone — one sample, 6 October
  // 2026 — and NOT confirmed by the shop: it could be a neighbour's wall, an
  // existing structure, or a wall nobody builds (README "Open items"). The
  // printed ceiling is held against both readings below, as evidence only.
  // An open wall has no chain; one that arrives anyway is ignored, not built from
  edgeSegs.forEach((segs, i) => {
    if (open[i] && segs.length) {
      warnings.push(
        `Wall ${WALLS[i]} is marked open but a chain (${segs.map((s) => s.mm).join(' + ')}) was read for it — the chain is ignored.`,
      );
      segs.length = 0;
    }
  });

  // A printed 300 at the end of a chain that meets an open wall: no corner panel
  // is made where a wall stands open, so it is a plain panel. The model is told
  // to read it so; if it still says corner, it is re-kinded here and said.
  edgeSegs.forEach((segs, i) => {
    if (!segs.length) return;
    const ends: Array<[ExtractedSeg, string]> = [];
    if (open[(i + 3) % 4]) ends.push([segs[0], WALLS[(i + 3) % 4]]);
    if (open[(i + 1) % 4]) ends.push([segs[segs.length - 1], WALLS[(i + 1) % 4]]);
    for (const [seg, beside] of ends) {
      if (seg.kind !== 'corner') continue;
      seg.kind = 'panel';
      warnings.push(
        `Wall ${WALLS[i]}: the ${seg.mm} at the end beside the open ${beside} wall was read as a corner. No corner panel is made against an open wall, so it is taken as a plain wall panel and left out of the corner count.`,
      );
    }
  });

  // does each chain add up to its wall — and remember which ones do, so the
  // panel check below does not say the same thing twice
  const chainAddsUp = [false, false, false, false];
  edgeSegs.forEach((segs, i) => {
    if (open[i]) return;
    if (!segs.length) {
      warnings.push(`Wall ${WALLS[i]}: no chain was read.`);
      return;
    }
    chainAddsUp[i] = [0, 1, 2].some((k) => sum(segs) === lengths[i] - k * th);
    if (!chainAddsUp[i]) {
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
    if (!out.corners[v] || nextToOpen(v)) continue;
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
  // A leg is stated wherever it is not the form's own 300 — not wherever it is
  // not the commonest on this drawing, which would leave a room whose corners
  // are all 250 silently built with 300s.
  legAt.forEach((leg, v) => {
    if (leg != null && leg !== FORM_DEFAULTS.cornerLeg) out.cornerLegs[v] = leg;
  });

  // the sheet on each face of the walls, as the plan labels them
  const assumed = new Set<string>();
  const skin = (name: string | null, what: string) => {
    const m = name ? SKIN_NAMES[name.trim().toUpperCase().replace(/\.$/, '')] : undefined;
    if (name && !m) warnings.push(`${what} "${name}" is not a stocked material — left at the default.`);
    if (m && m !== 'PPGI' && !assumed.has(m)) {
      assumed.add(m);
      warnings.push(`${m} sheet: thickness is not printed, ${SKIN_THICKNESS[m]}mm assumed — confirm it.`);
    }
    return m ? { material: m, thickness: SKIN_THICKNESS[m] } : null;
  };
  if (room.wallSheets) {
    out.wallSkin = { outer: skin(room.wallSheets.outer, 'Wall outer sheet'), inner: skin(room.wallSheets.inner, 'Wall inner sheet') };
    if (out.wallSkin.outer || out.wallSkin.inner) {
      warnings.push(
        "Wall sheets are read as marked on the plan (outer / inner) and set on every wall. The corner and roof panels take the same sheets (the ceiling's own marking is not read - confirm it); the floor sheets are set on the floor, not here.",
      );
    }
  }

  // the door
  const door = room.door;
  if (door?.wall && open[WALLS.indexOf(door.wall)]) {
    warnings.push(`The door is on wall ${door.wall}, which is marked open (not built by this room) — the door is not placed.`);
  } else if (door?.wall) {
    const edge = WALLS.indexOf(door.wall);
    const segs = edgeSegs[edge];
    const at = segs.findIndex((s) => s.kind === 'door');
    let fromLeft: number | null = null;
    if (at < 0) {
      warnings.push(`The door is on wall ${door.wall} but no door figure was read in that wall's chain — its position is left to the calculator.`);
    } else {
      fromLeft = segs.slice(0, at).filter((s) => s.kind === 'panel').reduce((t, s) => t + s.mm, 0);
    }
    // Door sheets, PP/SS: the first named is the outside face and the second the
    // inside, the way the wall sheets are marked (PPGI outside, SS inside).
    // Inferred from HI-15420 alone (one sample, 6 October 2026) and NOT confirmed
    // by the shop — which is why it is warned below every time the two differ.
    const outer = skin(door.skinOuter, 'Door sheet');
    const inner = skin(door.skinInner, 'Door sheet');
    const tag = (s: { material: string } | null) => (s ? (SHORT[s.material] ?? s.material) : 'PP');
    const sheets = tag(outer) === tag(inner) ? tag(outer) : `${tag(outer)}/${tag(inner)}`;
    if (outer && inner && tag(outer) !== tag(inner)) {
      warnings.push(
        `Door sheets: ${tag(outer)} outside and ${tag(inner)} inside is an assumption. The door note lists them as ${tag(outer)}/${tag(inner)} and the first is taken as the outer face, the second as the inner, the same way the wall sheets are marked — confirm which face is which.`,
      );
    }
    // The door's module in the wall chain. If neither the chain nor the door note
    // gave one, the form's own 1180 is what the calculator will place, so it is
    // used here too — the prediction below must describe the room the browser
    // builds, door included — and it is said.
    let moduleW = segs[at]?.mm ?? door.moduleW;
    if (moduleW == null) {
      moduleW = FORM_DEFAULTS.doorModule;
      warnings.push(`The door's module (overall width in the wall chain) was not read — the form's ${FORM_DEFAULTS.doorModule}mm default is used. Check it against the drawing.`);
    }
    if (door.clearW == null || door.clearH == null) {
      warnings.push(
        `The door's clear opening was not fully read (${door.clearW ?? '?'} x ${door.clearH ?? '?'}) — the form's ${FORM_DEFAULTS.doorClearW} x ${FORM_DEFAULTS.doorClearH} is used for the missing figure. Check it against the drawing.`,
      );
    }
    if (room.wallTh != null && !DOOR_BLANK_OFFSETS[room.wallTh]) {
      warnings.push(
        `A door is on a ${room.wallTh}mm wall, which has no door blank preset in core/rules.ts (DOOR_BLANK_OFFSETS) — the BOQ cannot be built until the thickness is confirmed or the shop supplies the offsets.`,
      );
    }
    out.door = {
      edge,
      fromLeft,
      moduleW,
      clearW: door.clearW,
      clearH: door.clearH,
      hand: door.hand,
      swing: 'out',
      skinOuter: outer,
      skinInner: inner,
      chqHeight: door.chqHeight,
      lift: door.lift,
      label: `Flush Door ${sheets}`,
    };
  } else if (door) {
    warnings.push('The wall the door is on was not read — it is not placed.');
  }
  // a door figure printed in a wall chain with no door placed on that wall is a
  // door the BOQ would silently leave out (and its width would turn into wall
  // panels) — said, never dropped quietly
  edgeSegs.forEach((segs, i) => {
    const doors = segs.filter((s) => s.kind === 'door');
    if (!doors.length) return;
    if (!out.door || out.door.edge !== i) {
      warnings.push(
        `A door (${doors.map((d) => d.mm).join(' + ')}) is printed in the ${WALLS[i]} wall's chain but no door was placed on that wall — it is not in the BOQ. Add it on the form.`,
      );
    } else if (doors.length > 1) {
      warnings.push(`Wall ${WALLS[i]}: ${doors.length} door figures are printed in the chain; only one door is placed — add the others on the form.`);
    }
  });

  // Hold the printed panel widths against what the engine would do with the
  // same room. The shop rule fills a run with full modules and splits the
  // balance; a drawing sometimes does something else, and the drawing is what
  // the factory cuts to. Where the two differ, the printed widths are carried
  // as the draftsman's "exact widths" — typed, marked, and said — never by
  // moving the dimensions to the rule.
  let prediction: EnginePrediction | null = null;
  if (th > 0) {
    try {
      prediction = predictEngine(room, out);
    } catch (err) {
      warnings.push(
        `The printed panel widths could not be held against the shop rule (${(err as Error).message}) — the rule's split is used on every wall.`,
      );
    }
  } else {
    warnings.push('The wall thickness was not read, so the printed panel widths could not be held against the shop rule.');
  }
  /** a chain in plan reading order: the bottom and left edges run against it */
  const plan = <T>(i: number, list: T[]): T[] => (i >= 2 ? [...list].reverse() : list);
  if (prediction) {
    const pred = prediction;
    edgeSegs.forEach((segs, i) => {
      const run = pred.runs[i];
      if (!run || !segs.length) return;
      const printed = segs.filter((s) => s.kind === 'panel').map((s) => s.mm);
      if (!printed.length || sameList(printed, run.widths)) return;

      const placed = out.door && out.door.edge === i && out.door.moduleW != null ? out.door.moduleW : 0;
      const forPanels = run.clearRun - placed;
      if (sum(segs.filter((s) => s.kind === 'panel')) !== forPanels) {
        if (chainAddsUp[i]) {
          warnings.push(
            `Wall ${WALLS[i]}: the printed panels add to ${printed.reduce((t, x) => t + x, 0)} but the run the engine has for this wall is ${forPanels} — the shop rule's split is used here.`,
          );
        }
        return;
      }

      out.panels[i] = printed;
      const drawn = plan(i, segs.filter((s) => s.kind !== 'corner'))
        .map((s) => (s.kind === 'door' ? `door ${s.mm}` : String(s.mm)))
        .join(' + ');
      const rule = plan(i, run.widths).join(' + ');
      const doorNote = placed ? ` plus the ${placed} door` : '';
      if (sameList(sortedNum(printed), sortedNum(run.widths))) {
        warnings.push(
          `Wall ${WALLS[i]}: the drawing prints ${drawn}. The shop rule gives the same panels (${rule}${doorNote}) but with the odd one at the other end, so the printed order is applied as Exact widths and the drawing matches.`,
        );
      } else {
        warnings.push(
          `Wall ${WALLS[i]}: the drawing prints ${drawn}, but the shop rule alone would split the same run into ${rule}${doorNote}. The printed widths are applied to this wall as Exact widths — confirm them with the shop.`,
        );
      }
    });

    // the engine always lays the odd ceiling piece last; the drawing's own order
    // is not read, so a ceiling with unequal pieces is said, not assumed
    if (room.ceiling?.w && room.ceiling?.l && new Set(pred.ceilingWidths).size > 1) {
      warnings.push(
        `Ceiling: the calculator lays the panels ${pred.ceilingWidths.join(' + ')} (the odd piece last). The order the drawing prints them in was not read, so the generated ceiling may show the odd piece at the other end — the panel sizes and the BOQ are the same either way.`,
      );
    }

    if (open.some(Boolean)) {
      const names = WALLS.filter((_, i) => open[i]).join(', ');
      const c = room.ceiling;
      let evidence: string;
      if (c?.w && c?.l) {
        const here = `${pred.ceiling.w} x ${pred.ceiling.l}`;
        const walled = `${pred.ceilingIfWalled.w} x ${pred.ceilingIfWalled.l}`;
        const agrees = c.w === pred.ceiling.w && c.l === pred.ceiling.l;
        const wouldAgree = c.w === pred.ceilingIfWalled.w && c.l === pred.ceilingIfWalled.l;
        evidence = agrees && !wouldAgree
          ? `The printed ceiling ${c.w} x ${c.l} agrees with that (${here}, where a room that builds all four walls would be ${walled}).`
          : agrees
            ? `The printed ceiling ${c.w} x ${c.l} does not tell the two apart.`
            : `The printed ceiling ${c.w} x ${c.l} does not confirm it (the calculator would give ${here} with the wall open, ${walled} with it built) — check with the shop.`;
      } else {
        evidence = 'No printed ceiling size was read to confirm it.';
      }
      warnings.push(
        `Wall ${names} is read as open: drawn dashed with no panel chain, so this room builds no panels there and the wall is set as the neighbour's. The calculator will list it as a wall in nobody's BOQ until a room is placed behind it. ${evidence}`,
      );
    }
  }

  // what the drawing prints, to hold the BOQ against afterwards
  const wallPanels = edgeSegs.flat().filter((s) => s.kind === 'panel').map((s) => s.mm);
  const cornerPanels = legAt.flatMap((leg, v) =>
    out.corners[v] && !nextToOpen(v) ? [(leg ?? common ?? 0) * 2] : [],
  );
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
        max_tokens: MAX_OUTPUT_TOKENS,
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

  let body: { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('The vision service answered something that was not JSON.');
  }
  const answer = body.content?.find((c) => c.type === 'text')?.text ?? '';
  if (!answer) throw new Error('The vision service gave no answer to read.');
  if (body.stop_reason === 'max_tokens') {
    throw new Error('The reading was cut off before it finished — the sheet has more on it than one pass can carry. Try a cropped export of one room at a time.');
  }
  return parseExtraction(answer);
}
