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
const DEFAULT_MODEL = 'claude-sonnet-4-5';

/** Anthropic's own request-body cap is generous; images are the real limit. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ExtractedDoor {
  clearW: number | null;
  clearH: number | null;
  moduleW: number | null;
  hand: 'LHS' | 'RHS' | null;
}

export interface ExtractedRoom {
  name: string | null;
  /** external envelope, mm */
  w: number | null;
  l: number | null;
  h: number | null;
  wallTh: number | null;
  ceilTh: number | null;
  door: ExtractedDoor | null;
}

export interface ExtractionResult {
  jobNo: string | null;
  room: ExtractedRoom;
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
  clearW: [400, 3000],
  clearH: [1200, 3000],
  moduleW: [400, 3000],
};

const inRange = (key: string, v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const range = RANGES[key];
  if (range && (v < range[0] || v > range[1])) return null;
  return Math.round(v);
};

const PROMPT = `You are reading a WALL PANEL LAYOUT drawing for a PUF sandwich panel cold room, the kind a fabrication shop issues before cutting panels.

Read the printed dimensions and specification box. Answer with ONLY a JSON object, no other text, matching exactly this shape:

{
  "jobNo": string or null,
  "room": {
    "name": string or null,
    "w": number or null,        // external width, mm (the WALL PANEL LAYOUT's horizontal outer dimension)
    "l": number or null,        // external length, mm (the vertical outer dimension)
    "h": number or null,        // wall height, mm — usually printed in the spec box as "... X ... X H MM (EXT)" or on an elevation
    "wallTh": number or null,   // wall panel thickness, mm — from the spec box "WALL: NN MM THICK"
    "ceilTh": number or null,   // ceiling panel thickness, mm — from the spec box "CEILING: NN MM THICK"
    "door": {
      "clearW": number or null,  // door clear opening width, mm
      "clearH": number or null,  // door clear opening height, mm
      "moduleW": number or null, // the door's panel module width in the wall, mm (often printed as frame size or the panel it occupies)
      "hand": "LHS" or "RHS" or null
    } or null
  },
  "notes": string   // plain text: anything you could not read clearly, any dimension you are guessing at, any part of the drawing you are unsure about. Empty string if nothing to flag.
}

Rules:
- If this is not a single rectangular room (an L-shape, a U-shape, more than one room, angled walls), say so in "notes" and still fill in whatever a single bounding rectangle would be, because the form can be corrected by hand afterwards.
- Only one door — the largest or most clearly labelled one if there are several — and say in "notes" if you dropped others.
- Never invent a figure you cannot actually see printed or dimensioned. A missing figure is null, not a guess.
- Respond with the JSON object only.`;

export interface ExtractRequest {
  /** raw image bytes */
  bytes: Uint8Array;
  /** e.g. "image/png", "image/jpeg" */
  mimeType: string;
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
    throw new Error('Could not read a dimension out of that — the drawing may be unclear or not a wall panel layout.');
  }

  const r = parsed.room ?? {};
  const d = r.door ?? null;
  return {
    jobNo: typeof parsed.jobNo === 'string' && parsed.jobNo.trim() ? parsed.jobNo.trim() : null,
    room: {
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null,
      w: inRange('w', r.w),
      l: inRange('l', r.l),
      h: inRange('h', r.h),
      wallTh: inRange('wallTh', r.wallTh),
      ceilTh: inRange('ceilTh', r.ceilTh),
      door: d
        ? {
            clearW: inRange('clearW', d.clearW),
            clearH: inRange('clearH', d.clearH),
            moduleW: inRange('moduleW', d.moduleW),
            hand: d.hand === 'LHS' || d.hand === 'RHS' ? d.hand : null,
          }
        : null,
    },
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  };
}

export interface ExtractProblem {
  error: string;
}

/** Everything wrong with a request, before a byte is sent. */
export function problemWith(req: ExtractRequest): string | null {
  if (!req.bytes?.length) return 'No drawing was uploaded.';
  if (req.bytes.length > MAX_IMAGE_BYTES) {
    return `The image is ${(req.bytes.length / 1024 / 1024).toFixed(1)}MB and the limit is 5MB. Try a smaller export or a lower-resolution scan.`;
  }
  if (!/^image\//.test(req.mimeType)) {
    return `${req.mimeType} is not an image Claude can read. Upload a PNG or JPEG of the drawing.`;
  }
  return null;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/**
 * Read a drawing. `apiKey` is an environment variable on the server and
 * never reaches the browser — the whole reason this goes through our own
 * host rather than straight from the page.
 */
export async function extractDrawing(
  req: ExtractRequest,
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<ExtractionResult> {
  const problem = problemWith(req);
  if (problem) throw new Error(problem);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: req.mimeType, data: toBase64(req.bytes) },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
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
