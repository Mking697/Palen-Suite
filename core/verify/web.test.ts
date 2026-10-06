/**
 * The two browser scripts, run headless.
 * Run:  node core/verify/web.test.ts
 *
 * `web/app.js` and `web/guide.js` are plain scripts with no imports, so they
 * cannot be imported and tested the ordinary way. They can be *run*, though, in
 * a `node:vm` context with a stub DOM — which is what this does.
 *
 * The reason it exists is on the record: a call to an identifier that was never
 * defined once survived a whole session in `web/app.js` and would have reached
 * the estimator, because nothing in the repo ever ran the file. Booting it here
 * catches exactly that, and the rest of the file checks the things the form and
 * the guide are actually responsible for.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { FORM_DEFAULTS, parseExtraction } from '../../server/vision.ts';
import { buildJob } from '../boq.ts';
import { checkJob } from '../checks.ts';
import { jobFlashing } from '../flashing.ts';
import { fmt2, round } from '../format.ts';
import { compileWalls } from '../plan.ts';
import { roomPlan } from '../draw/index.ts';
import { HI_15420 } from './hi-15420.reading.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

let passed = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${(e as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

/* ---------- the stub DOM ---------- */

type Kid = StubEl | { textContent: string };

/** Enough of an element for these two scripts, and no more. */
class StubEl {
  tag: string;
  className = '';
  children: Kid[] = [];
  attrs: Record<string, unknown> = {};
  listeners = new Map<string, Array<(ev: unknown) => void>>();
  value: unknown = '';
  checked = false;
  disabled = false;
  hidden = false;
  ownText = '';
  html = '';
  dataset: Record<string, string> = {};
  style: Record<string, unknown> = {};
  parentNode: StubEl | null = null;
  scrollTop = 0;

  /*
   * The caret, and it refuses to be read on a number input — because Chrome
   * refuses. This stub used to carry `selectionStart` as a plain field that
   * always answered, and that is why it could not see the bug it now holds:
   * `renderForm` reads the caret before a rebuild and puts it back after,
   * both inside a try/catch, so on `type="number"` both silently did nothing
   * and the caret came back at 0. Every dimension then typed backwards —
   * 10476 arrived as 67401, on the live site. A stub that answers where the
   * browser throws is a stub that certifies a broken form.
   */
  #selStart = 0;
  #selEnd = 0;
  #noSelection() {
    if (this.tag === 'input' && (this.attrs.type === 'number' || this.attrs.type === 'checkbox')) {
      throw new Error(
        `The input element's type ('${this.attrs.type}') does not support selection.`,
      );
    }
  }
  get selectionStart(): number {
    this.#noSelection();
    return this.#selStart;
  }
  set selectionStart(v: number) {
    this.#noSelection();
    this.#selStart = v;
  }
  get selectionEnd(): number {
    this.#noSelection();
    return this.#selEnd;
  }
  set selectionEnd(v: number) {
    this.#noSelection();
    this.#selEnd = v;
  }
  classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  constructor(tag: string) {
    this.tag = tag;
  }

  append(...kids: unknown[]) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (k instanceof StubEl) k.parentNode = this;
      this.children.push(k as Kid);
    }
  }
  appendChild(k: Kid) {
    this.append(k);
    return k;
  }
  replaceChildren(...kids: unknown[]) {
    this.children = [];
    this.append(...kids);
  }
  /** Everything under this one, so the form can tell where the cursor was. */
  contains(node: unknown): boolean {
    for (const n of walk(this)) if (n === node) return true;
    return false;
  }
  setSelectionRange(start: number, end: number) {
    this.#noSelection();
    this.#selStart = start;
    this.#selEnd = end;
  }
  remove() {}
  scrollTo() {}
  scrollIntoView() {}
  focus() {
    FOCUSED.node = this;
  }
  click() {}
  setAttribute(k: string, v: unknown) {
    this.attrs[k] = v;
    if (k === 'value') this.value = v;
    if (k === 'checked') this.checked = true;
    if (k === 'disabled') this.disabled = true;
  }
  getAttribute(k: string) {
    return this.attrs[k];
  }
  addEventListener(type: string, fn: (ev: unknown) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener() {}
  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 640, width: 900, height: 640 };
  }
  getContext() {
    return CANVAS_CTX;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }

  set textContent(v: string) {
    this.ownText = String(v);
  }
  get textContent(): string {
    return textOf(this);
  }
  set innerHTML(v: string) {
    this.html = String(v);
    this.children = [];
  }
  get innerHTML(): string {
    return this.html;
  }

  /** Fire a handler the way the browser would when the user acts. */
  fire(type: string, ev: Record<string, unknown> = {}) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev });
    }
  }
}

/** Which element has the cursor, so `document.activeElement` can answer. */
const FOCUSED: { node: StubEl | null } = { node: null };

/** A 2D context that accepts everything and draws nothing. */
const CANVAS_CTX = new Proxy(
  { canvas: { width: 900, height: 640 } },
  {
    get(target: Record<string, unknown>, prop: string) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target: Record<string, unknown>, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  },
);

const textOf = (n: unknown): string => {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  const el = n as StubEl;
  return (el.ownText ?? '') + (el.children ?? []).map(textOf).join('');
};

/** Every element under this one, the element itself included. */
function* walk(n: Kid): Generator<StubEl> {
  if (!(n instanceof StubEl)) return;
  yield n;
  for (const k of n.children) yield* walk(k);
}

/** Where a node sits under a root, as child indexes — the test's own copy. */
const pathOfNode = (root: StubEl, node: StubEl): number[] | null => {
  const path: number[] = [];
  let n: StubEl | null = node;
  while (n && n !== root && n.parentNode) {
    path.unshift(n.parentNode.children.indexOf(n));
    n = n.parentNode;
  }
  return n === root ? path : null;
};

const labelled = (root: StubEl, label: string) =>
  [...walk(root)].find((n) => n.tag === 'label' && textOf(n).trim() === label);

/** The checkbox inside a `toggle()` label. */
const boxOf = (label: StubEl | undefined) =>
  label && [...walk(label)].find((n) => n.tag === 'input');

/** Let every already-resolved promise in the script settle. */
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
};

/**
 * The same, but past the form's own debounce: `refresh()` waits 220ms before
 * it posts, so that typing a dimension does not fire a request per keystroke.
 */
const settle = async () => {
  await new Promise((r) => setTimeout(r, 320));
  await flush();
};

interface Harness {
  ctx: Record<string, unknown>;
  ids: Map<string, StubEl>;
  posts: Array<{ url: string; body: unknown }>;
  /** every URL fetched, so a test can check what was asked for, not only sent */
  reads: string[];
  errors: unknown[];
  fileButtons: StubEl[];
  /** every question a prompt asked, in order */
  asked: string[];
  answerWith: (value: string | null) => void;
  confirmWith: (value: boolean) => void;
}

/**
 * Run a browser script over the stub DOM.
 *
 * @param idList the elements the page's own HTML provides, which the script
 * looks up rather than creates.
 */
function harness(
  sources: string | string[],
  idList: string[],
  routes: Record<string, unknown>,
): Harness {
  const ids = new Map<string, StubEl>();
  for (const id of idList) ids.set(id, new StubEl('div'));

  /** The File menu's buttons, which the page's own HTML provides. */
  const fileButtons = ['new', 'open', 'save', 'saveAs', 'delete'].map((what) => {
    const b = new StubEl('button');
    b.attrs['data-file'] = what;
    return b;
  });

  const posts: Array<{ url: string; body: unknown }> = [];
  const reads: string[] = [];
  const errors: unknown[] = [];

  const document = {
    createElement: (tag: string) => new StubEl(tag),
    createTextNode: (text: string) => ({ textContent: String(text) }),
    createDocumentFragment: () => new StubEl('#fragment'),
    querySelector: (sel: string) => ids.get(sel) ?? null,
    querySelectorAll: (sel: string) => (sel.includes('data-file') ? fileButtons : []),
    getElementById: (id: string) => ids.get(`#${id}`) ?? null,
    addEventListener: () => {},
    body: new StubEl('body'),
    documentElement: new StubEl('html'),
    get activeElement() {
      return FOCUSED.node;
    },
  };

  /** What the estimator types into a prompt, and whether they confirm. */
  const asked: string[] = [];
  let answer: string | null = null;
  let confirmed = true;

  const fetchStub = (url: string, init?: { method?: string; body?: string }) => {
    // longest prefix wins, so /api/config does not shadow /api/c…
    const route = Object.keys(routes)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    reads.push(url);
    if (init?.method && init.method !== 'GET') {
      posts.push({ url, body: init.body ? JSON.parse(init.body) : null });
    }
    if (route === undefined) return Promise.reject(new Error(`no stub route for ${url}`));
    const entry = routes[route];
    // a route may be a value, or a function of the call, for one that answers
    // differently to a read and a write
    const data = typeof entry === 'function' ? (entry as Function)(url, init) : entry;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(typeof data === 'string' ? JSON.parse(data) : data),
      text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    });
  };

  const stored = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, String(v)),
    removeItem: (k: string) => void stored.delete(k),
  };

  const win: Record<string, unknown> = {
    print: () => {},
    devicePixelRatio: 1,
    addEventListener: () => {},
    localStorage,
    prompt: (question: string) => {
      asked.push(question);
      return answer;
    },
    confirm: () => confirmed,
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 1;
    },
  };

  const ctx: Record<string, unknown> = {
    document,
    fetch: fetchStub,
    console: { log: () => {}, warn: () => {}, error: (...a: unknown[]) => errors.push(a) },
    location: { hash: '', href: 'http://127.0.0.1:5173/' },
    localStorage,
    window: win,
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 1;
    },
    setTimeout,
    clearTimeout,
    URL,
    Blob: class {},
    /*
     * Enough of a FileReader for the upload screen, which reads the drawing as
     * a data: URL. It reads a real Blob/File handed in by the test.
     */
    FileReader: class {
      result: unknown = null;
      error: unknown = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(file: Blob) {
        file.arrayBuffer().then(
          (buf) => {
            this.result = `data:${file.type};base64,${Buffer.from(buf).toString('base64')}`;
            this.onload?.();
          },
          (err) => {
            this.error = err;
            this.onerror?.();
          },
        );
      }
    },
    Math,
    JSON,
    Date,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  // the page loads auth.js then app.js as two plain scripts sharing one
  // global scope, so they are run the same way here
  for (const src of [sources].flat()) {
    runInContext(src, ctx, { filename: 'browser-script.js' });
  }

  return {
    ctx,
    ids,
    posts,
    reads,
    errors,
    fileButtons,
    asked,
    answerWith: (value: string | null) => void (answer = value),
    confirmWith: (value: boolean) => void (confirmed = value),
  };
}

/* ---------- the guide page ---------- */

console.log('\n  the guide page — GUIDE.md, rendered\n');

const GUIDE_MD = read('GUIDE.md');

const guideHarness = harness(read('web/guide.js'), ['#guide'], { '/api/guide': GUIDE_MD });
await flush();
const guideHtml = guideHarness.ids.get('#guide')!.innerHTML;

await t('the guide renders, and it is the repo\'s own file that is rendered', () => {
  assert.ok(guideHtml.length > 5000, 'the page came out empty');
  // a line only GUIDE.md has, so this cannot be passing on a placeholder
  assert.ok(guideHtml.includes('Panel Calculator'));
  assert.ok(!guideHtml.includes('Loading the guide'));
});

await t('every heading carries the id its own contents table links to', () => {
  const ids = new Set([...guideHtml.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]));
  const links = [...GUIDE_MD.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 8, 'the contents table should have links');
  const missing = links.filter((l) => !ids.has(l));
  assert.deepEqual(missing, [], `headings missing for: ${missing.join(', ')}`);
});

await t('tables, code blocks and quotes come through as themselves', () => {
  assert.ok(guideHtml.includes('<table>'), 'no table');
  assert.ok(guideHtml.includes('<pre><code>npm run dev'), 'no fenced code');
  assert.ok(guideHtml.includes('<blockquote>'), 'no quote');
  assert.ok(guideHtml.includes('<strong>'), 'no bold');
});

await t('nothing in the guide can inject markup', async () => {
  const h = harness(read('web/guide.js'), ['#guide'], {
    '/api/guide': '# One\n\nA <script>alert(1)</script> and `a **b** c`.\n',
  });
  await flush();
  const html = h.ids.get('#guide')!.innerHTML;
  assert.ok(!html.includes('<script>'), 'a tag in the text was not escaped');
  assert.ok(html.includes('&lt;script&gt;'));
  // and a code span is printed as written, not read for marks
  assert.ok(html.includes('<code>a **b** c</code>'), 'a code span was read for marks');
});

/* ---------- the calculator form ---------- */

console.log('\n  the calculator form — booted headless\n');

/**
 * What /api/render sends back. Only the shape matters here — this test is
 * about what the form *sends*, and about the file running at all; the figures
 * themselves are the engine's, and split.test.ts holds those.
 */
const RENDER_REPLY = {
  jobNo: 'HI-',
  density: 40,
  rooms: ['Room 1'],
  blocks: [],
  grand: {
    panelQty: 0,
    ppgiQty: 0,
    plyQty: 0,
    chemWeight: 0,
    areaSqmt: 0,
    chemWeightText: '0.00',
    areaSqmtText: '0.00',
  },
  flashing: { rooms: [], totalRmtr: 0, totalRmtrText: '0.00' },
  problems: [],
  layout: { drawable: false, reason: 'stub' },
  sheet: { drawable: false, reason: 'stub' },
  drawings: [],
  model3d: { faces: [], skipped: [] },
};

const APP_IDS = [
  '#form',
  '#out',
  '#jobNo',
  '#density',
  '#printBtn',
  '#mailBtn',
  '#catalogBtn',
  '#catalog',
  '#catalogBody',
  '#catalogBack',
  '#jobSearch',
  '#jobList',
  '#jobSearchMsg',
  '#fileMenu',
  '#accountMenu',
  '#accountBtn',
  '#accountPanel',
  '#gate',
  '#gateForm',
  '#gateReason',
  '.form',
];

/** Both browser scripts, in the order the page loads them. */
const APP_SOURCES = [read('web/auth.js'), read('web/app.js')];

const app = harness(APP_SOURCES, APP_IDS, {
  // accounts off: no database configured on this server
  '/api/config': { accounts: false, accountsReason: 'DB_HOST, DB_USER, DB_PASSWORD, DB_NAME is not set' },
  '/api/rules': {
    materials: { PPGI: [0.4] },
    defaultSkin: { material: 'PPGI', thickness: 0.4 },
    doorTypes: [{ key: 'flush', label: 'Flush Door', thickness: 0 }],
    doorCores: ['Puf'],
    doorHands: ['LHS', 'RHS'],
    lCutMinWallTh: 50,
    doorTopMinWallHeight: 3050,
    floorMaterials: ['PPGI', 'Ply', 'AL. CHQ'],
    floorLayers: [
      { material: 'PPGI', th: 0.4 },
      { material: 'Puf', th: 0 },
      { material: 'Ply', th: 12 },
      { material: 'AL. CHQ', th: 2 },
    ],
    flashingTypes: ['U Flashing', 'Gutter Flashing'],
  },
  '/api/jobs': [
    { jobNo: 'HI-15191', density: 40, rooms: [{ name: 'Freezer Room', wallTh: 120 }] },
    { jobNo: 'HI-15279', density: 40, rooms: [{ name: 'Freezer Room', wallTh: 100 }] },
  ],
  '/api/spec': {
    jobNo: 'HI-15191',
    density: 40,
    rooms: [
      {
        name: 'Freezer Room',
        ext: { w: 3050, l: 4575, h: 2590 },
        wallTh: 120,
        ceilTh: 120,
        module: 1180,
        cornerLeg: 300,
        minPanelWidth: 150,
        maxSplitPieces: 2,
        floor: { kind: 'pufSlab', th: 100, desc: 'slab' },
        ceiling: { splitAxis: 'l', wEnds: ['own', 'own'], lEnds: ['own', 'own'] },
        outline: {
          points: [[0, 0], [3050, 0], [3050, 4575], [0, 4575]],
          edges: { 0: { id: 'N' }, 1: { id: 'E' }, 2: { id: 'S' }, 3: { id: 'W' } },
        },
      },
    ],
  },
  '/api/render': RENDER_REPLY,
});

await settle();

const form = () => app.ids.get('#form')!;

await t('it boots without an error, and renders a form', () => {
  assert.deepEqual(app.errors, [], 'the script logged an error while booting');
  assert.ok(form().children.length > 0, 'the form is empty');
  assert.ok([...walk(form())].some((n) => n.tag === 'label'), 'no controls');
});

await t('a job is posted to /api/render on boot', () => {
  const post = app.posts.find((p) => p.url.includes('/api/render'));
  assert.ok(post, 'nothing was posted');
  const spec = post!.body as { rooms: Array<{ outline: { points: number[][] } }> };
  assert.equal(spec.rooms.length, 1);
  assert.equal(spec.rooms[0].outline.points.length, 4, 'a new room is a rectangle');
});

type PostedJob = {
  rooms: Array<{ outline: { edges: Record<string, { door?: { hand?: string } }> } }>;
};

/** Every door on the room the form last sent. */
const postedDoors = () => {
  const last = app.posts.at(-1)!.body as PostedJob;
  return Object.values(last.rooms[0].outline.edges)
    .filter((e) => e.door)
    .map((e) => e.door!);
};

/** Tick a `toggle()` by the label the estimator reads. */
const tick = async (label: string) => {
  const box = boxOf(labelled(form(), label));
  assert.ok(box, `no "${label}" control on the form`);
  box!.checked = true;
  box!.fire('change');
  await settle();
};

await tick('Door');

await t('ticking Door adds one, and it reaches the payload', () => {
  const doors = postedDoors();
  assert.equal(doors.length, 1);
  assert.equal(doors[0].hand, undefined, 'no hand until one is stated');
});

await tick('Door opens from');

await t('the hand control appears, and stating it sends the hand', () => {
  assert.equal(postedDoors()[0].hand, 'LHS', 'the default hand should go through');
  assert.equal((postedDoors()[0] as { swing?: string }).swing, 'out', 'and it opens outward by default');
});

await t('the verified jobs are not offered to an estimator', () => {
  // they are proof the engine is right, not somebody's work — three jobs the
  // estimator never made, sitting among the ones they did
  assert.equal(app.ids.get('#jobList')!.children.length, 0);
});

/** The box inside a `field()`, found by the label the estimator reads. */
const dimension = (root: StubEl, label: string) => {
  const lab = [...walk(root)].find(
    (n) =>
      n.tag === 'label' &&
      n.className === 'f' &&
      [...walk(n)].some((k) => k.tag === 'span' && textOf(k).trim() === label),
  );
  assert.ok(lab, `no "${label}" box on the form`);
  const box = [...walk(lab!)].find((n) => n.tag === 'input');
  assert.ok(box, `the "${label}" label has no input`);
  return box!;
};

/**
 * Type the way a person does: one character at a time, at the caret, into
 * whatever is holding the caret — because the form rebuilds itself between
 * keystrokes, and the node typed into is not the node typed into next.
 *
 * Setting `.value` in one go, which is how the rest of this file drives a
 * field, cannot see the bug this exists for: it never asks where the caret
 * came back to. When the browser refuses to say — which is what it does on a
 * number input — the caret is at 0 and the next character lands in front of
 * the last one.
 */
const typeInto = async (start: StubEl, text: string) => {
  const focused = () =>
    (app.ctx.document as { activeElement: StubEl | null }).activeElement ?? start;
  let node = start;
  node.focus();
  const caret = (n: StubEl) => {
    try {
      return n.selectionStart;
    } catch {
      return 0; // the browser will not say, so it is wherever focus left it
    }
  };
  const putCaret = (n: StubEl, at: number) => {
    try {
      n.selectionStart = at;
      n.selectionEnd = at;
    } catch {
      /* nothing to put back; that is the bug, not a workaround for it */
    }
  };
  putCaret(node, String(node.value ?? '').length);

  for (const ch of text) {
    const at = caret(node);
    const was = String(node.value ?? '');
    node.value = was.slice(0, at) + ch + was.slice(at);
    putCaret(node, at + 1);
    node.fire('input');
    await settle();
    node = focused();
  }
  return String(node.value ?? '');
};

await t('a width typed digit by digit arrives the way it was typed', async () => {
  /*
   * The one that was live. Width and Length redraw the whole form, the caret
   * came back at 0 because `type="number"` refuses to say where it was, and
   * every keystroke landed in front of the one before it: 10476 arrived as
   * 67401. Driving the field one character at a time is the only way to see
   * it — setting `.value` whole never asks where the caret went.
   */
  const box = dimension(form(), 'Width');
  box.value = '';
  const typed = await typeInto(box, '10476');
  assert.equal(typed, '10476', 'the digits came back reversed');

  const posted = app.posts.at(-1)!.body as { rooms: Array<{ ext: { w: number } }> };
  assert.equal(posted.rooms[0].ext.w, 10476, 'what was typed is not what was sent');
});

await t('and so does a length', async () => {
  const box = dimension(form(), 'Length');
  box.value = '';
  assert.equal(await typeInto(box, '12168'), '12168');
});

await t('no box anyone types a figure into is a number input', () => {
  /*
   * The rule the bug above bought. Chrome throws on `selectionStart` and
   * `setSelectionRange` for `type="number"`, so `renderForm` cannot put the
   * caret back and leaves it at 0. It also lets a scroll wheel over the box
   * change a dimension without being asked, and hands back an empty string
   * for anything it dislikes rather than what was typed.
   */
  // the form as it actually stands, which no grep can be fooled about
  for (const n of walk(form())) {
    assert.notEqual(n.attrs.type, 'number', `a ${n.tag} on the form is a number input`);
  }

  // and the parts of the page this harness does not build: the header's own
  // boxes, and the panels that are only drawn once somebody opens them
  for (const file of ['web/app.js', 'web/auth.js']) {
    assert.ok(!/type:\s*'number'/.test(read(file)), `${file} still builds a number input`);
  }
  const html = read('web/index.html').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/type="number"/.test(html), 'web/index.html still has a number input');
});

await t('a redraw keeps the cursor where it was, and the form where it was', async () => {
  /*
   * The form is rebuilt from the state on every change, which is what stops
   * anything on screen drifting from what will be sent — but it used to throw
   * away the caret and scroll to the top while somebody was still typing.
   *
   * This asserted only which field held the cursor, never where in it the
   * cursor was, which is exactly the half the reversal hid in.
   */
  const form = app.ids.get('#form')!;
  const box = dimension(form, 'Height');
  const where = pathOfNode(form, box);
  box.focus();
  box.value = '3200';
  box.setSelectionRange(2, 2);
  form.scrollTop = 420;

  box.fire('input');
  await settle();

  assert.equal(form.scrollTop, 420, 'the form jumped back to the top');
  const now = (app.ctx.document as { activeElement: StubEl | null }).activeElement;
  assert.ok(now, 'the cursor was dropped');
  assert.deepEqual(pathOfNode(form, now!), where, 'the cursor moved to a different field');
  assert.equal(now!.selectionStart, 2, 'the cursor moved inside the field');
});

/** Every `field()` box whose label reads like this, in the order drawn. */
const dimensionsLike = (root: StubEl, starts: string) =>
  [...walk(root)]
    .filter(
      (n) =>
        n.tag === 'label' &&
        n.className === 'f' &&
        [...walk(n)].some((k) => k.tag === 'span' && textOf(k).trim().startsWith(starts)),
    )
    .map((lab) => [...walk(lab)].find((k) => k.tag === 'input')!);

await t('every corner offers its own leg, on both of the walls that share it', async () => {
  /*
   * The shop, 21 August 2026: a room's corners are not all the same size. A
   * corner panel is one piece shared by two walls, so it is keyed on the
   * vertex — the box appears on both wall cards and both must read the same,
   * or the sheet and the drawing would be told different sizes for one panel.
   */
  const boxes = dimensionsLike(form(), 'Leg at');
  assert.equal(boxes.length, 8, 'four corners, each on two wall cards');

  const posted = () =>
    (app.posts.at(-1)!.body as {
      rooms: Array<{ outline: { vertices?: Record<number, { leg?: number }> } }>;
    }).rooms[0].outline.vertices ?? {};

  assert.equal(
    Object.values(posted()).some((v) => v.leg != null),
    false,
    'an untouched room states no leg at all — blank means the room figure',
  );

  boxes[0].value = '450';
  boxes[0].fire('input');
  await settle();

  const legs = Object.entries(posted())
    .filter(([, v]) => v.leg != null)
    .map(([v, o]) => [Number(v), o.leg]);
  assert.deepEqual(legs, [[0, 450]], 'one vertex, and only the one that was typed');

  const showing = dimensionsLike(form(), 'Leg at')
    .map((b) => String(b.value))
    .filter((v) => v === '450');
  assert.equal(showing.length, 2, 'the same corner must read 450 on both its wall cards');
});

await t('a leg of nothing is the room figure, not a corner panel of zero', async () => {
  const boxes = dimensionsLike(form(), 'Leg at');
  boxes[0].value = '';
  boxes[0].fire('input');
  await settle();

  const vertices =
    (app.posts.at(-1)!.body as {
      rooms: Array<{ outline: { vertices?: Record<number, { leg?: number }> } }>;
    }).rooms[0].outline.vertices ?? {};
  assert.equal(
    Object.values(vertices).some((v) => v.leg != null),
    false,
    'a blank box must send no leg — 0 would print a corner panel with no width',
  );
});

await t('a ceiling and a floor are both required until somebody says otherwise', async () => {
  /*
   * The shop, 21 August 2026: a customer sometimes takes the room without one,
   * or without either. Both ticks default on, because that is nearly every job,
   * and `fitted` is only ever sent when it is false — so a job saved before
   * this existed opens as the room it always was.
   */
  const ceilingTick = boxOf(labelled(form(), 'Ceiling required'));
  const floorTick = boxOf(labelled(form(), 'Floor required'));
  assert.ok(ceilingTick && floorTick, 'both ticks must be on the form');
  assert.equal(ceilingTick!.checked, true, 'a ceiling is built unless said otherwise');
  assert.equal(floorTick!.checked, true, 'so is a floor');

  const sent = () =>
    (app.posts.at(-1)!.body as {
      rooms: Array<{ ceiling: { fitted?: boolean }; floor: { fitted?: boolean } }>;
    }).rooms[0];
  assert.equal(sent().ceiling.fitted, undefined, 'nothing is stated while both are on');
  assert.equal(sent().floor.fitted, undefined);
});

await t('unticking either one says so, and says it only about that one', async () => {
  const untick = async (label: string) => {
    const box = boxOf(labelled(form(), label))!;
    box.checked = false;
    box.fire('change');
    await settle();
  };
  const sent = () =>
    (app.posts.at(-1)!.body as {
      rooms: Array<{ ceiling: { fitted?: boolean }; floor: { fitted?: boolean } }>;
    }).rooms[0];

  await untick('Ceiling required');
  assert.equal(sent().ceiling.fitted, false);
  assert.equal(sent().floor.fitted, undefined, 'the floor was not asked about');

  await untick('Floor required');
  assert.equal(sent().floor.fitted, false);

  // and the thickness box stays, because it is also the depth of the L cut
  assert.equal(
    dimensionsLike(form(), 'Ceiling thickness').length,
    1,
    'the ceiling thickness must stay — it sets the L cut depth whether or not a ceiling is fitted',
  );
  assert.equal(
    dimensionsLike(form(), 'Floor thickness').length,
    0,
    'a floor nobody is building has no thickness to type',
  );

  // put them back for the tests that follow
  for (const label of ['Ceiling required', 'Floor required']) {
    const box = boxOf(labelled(form(), label))!;
    box.checked = true;
    box.fire('change');
    await settle();
  }
  assert.equal(sent().ceiling.fitted, undefined, 'ticking it back states nothing again');
  assert.equal(sent().floor.fitted, undefined);
});

await t('signed out, opening a job asks for a sign in rather than failing', async () => {
  const before = app.posts.length;
  const box = app.ids.get('#jobSearch')!;
  box.value = 'HI-15191';
  box.fire('change');
  await settle();

  assert.equal(app.ids.get('#jobSearchMsg')!.ownText, 'Sign in to open a job');
  assert.equal(app.posts.length, before, 'nothing was rebuilt');
  assert.equal(box.value, 'HI-15191', 'what was typed is left there');
});

await t('the form knows both shop thresholds, and takes them from the engine', () => {
  // the fallbacks in the file must not be the only source of these two
  const src = read('web/app.js');
  assert.ok(src.includes('RULES.doorTopMinWallHeight'), 'the door top threshold is hardcoded');
  assert.ok(src.includes('RULES.lCutMinWallTh'), 'the L cut threshold is hardcoded');
  assert.ok(read('server/serve.ts').includes('doorTopMinWallHeight: DOOR_TOP_MIN_WALL_HEIGHT'));
});

await t('with no accounts configured the calculator runs, unlocked, and says why', () => {
  // gating here would lock everyone out, owner included, with no way back in
  // from the screen — and with no Supabase there is no saved job to protect
  assert.equal(app.ids.get('#gate')!.hidden, true, 'the gate should be hidden');
  assert.ok(app.ids.get('#form')!.children.length > 0, 'the form is gone');
  const said = app.ids.get('#gateReason')!.ownText;
  assert.ok(said.includes('DB_HOST'), `it should say why: ${said}`);
  assert.ok(said.includes('Nothing can be saved'));
});

await t('Save without an account says so instead of failing quietly', async () => {
  const save = app.fileButtons.find((b) => b.attrs['data-file'] === 'save')!;
  save.fire('click');
  await settle();
  assert.equal(app.ids.get('#jobSearchMsg')!.ownText, 'Sign in to save');
});

console.log('\n  accounts — each estimator their own jobs\n');

const SESSION = {
  accessToken: 'token-for-asha',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  user: { id: 'user-asha', email: 'asha@example.com', isAdmin: false },
};

/** What the estimator has saved, as the database would hand it back. */
const SAVED = [{ job_no: 'HI-20001', updated_at: '2026-08-17T10:00:00Z' }];

/** And the spec inside it, for when that job is opened. */
const SAVED_SPEC = {
  jobNo: 'HI-20001',
  density: 40,
  rooms: [
    {
      name: 'Room 1',
      ext: { w: 3050, l: 4575, h: 2590 },
      wallTh: 100,
      ceilTh: 100,
      module: 1180,
      cornerLeg: 300,
      minPanelWidth: 150,
      maxSplitPieces: 2,
      floor: { kind: 'pufSlab', th: 100, desc: 'slab' },
      ceiling: { splitAxis: 'l', wEnds: ['own', 'own'], lEnds: ['own', 'own'] },
      outline: {
        points: [[0, 0], [3050, 0], [3050, 4575], [0, 4575]],
        edges: { 0: { id: 'N' }, 1: { id: 'E' }, 2: { id: 'S' }, 3: { id: 'W' } },
      },
    },
  ],
};

/** The signed-in user's own profile row, with access well into the future. */
const PROFILE = {
  id: 'user-asha',
  email: 'asha@example.com',
  access_until: '2099-01-01T00:00:00Z',
  is_admin: false,
};

/** A function route, differentiating methods on the same path. */
const savedJobsRoutes = (list: unknown, specByJob: (jobNo: string) => unknown) => ({
  // exact '/api/jobs/saved' — GET lists, POST saves
  '/api/jobs/saved': (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') return { ok: true };
    return { jobs: list };
  },
  // longer prefix wins for anything with a job number after the slash
  '/api/jobs/saved/': (url: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') return { ok: true };
    const jobNo = decodeURIComponent(url.split('/api/jobs/saved/')[1] ?? '');
    const spec = specByJob(jobNo);
    return spec ? { spec } : null;
  },
});

const acct = harness(APP_SOURCES, [
    ...APP_IDS,
    '#admin', '#adminBody', '#adminBack',
    '#settings', '#settingsBody', '#settingsBack',
    '#mail', '#mailBody', '#mailBack',
  ], {
  '/api/config': { accounts: true },
  '/api/rules': { materials: { PPGI: [0.4] }, defaultSkin: { material: 'PPGI', thickness: 0.4 }, doorTypes: [], doorCores: ['Puf'], doorHands: ['LHS', 'RHS'], lCutMinWallTh: 50, doorTopMinWallHeight: 3050, floorMaterials: ['PPGI'], floorLayers: [], flashingTypes: ['U Flashing'] },
  '/api/jobs': [{ jobNo: 'HI-15191', rooms: [{ name: 'Freezer Room' }] }],
  '/api/render': RENDER_REPLY,
  '/api/auth/signup': { ok: true }, // no token: a code goes out
  '/api/auth/verify': SESSION,
  '/api/auth/signin': SESSION,
  '/api/auth/signout': { ok: true },
  '/api/auth/profile': { profile: PROFILE },
  ...savedJobsRoutes(SAVED, (jobNo) => (jobNo === 'HI-20001' ? SAVED_SPEC : null)),
});

await settle();

/** The sign-in form, which lives on the gate while nobody is signed in. */
const acctInput = (type: string) =>
  [...walk(acct.ids.get('#gateForm')!)].find((n) => n.tag === 'input' && n.attrs.type === type);
const acctButton = (label: string) =>
  [...walk(acct.ids.get('#gateForm')!)].find(
    (n) => n.tag === 'button' && textOf(n).trim() === label,
  );

await t('signed out, the gate is up and the calculator is not reachable', () => {
  assert.equal(acct.ids.get('#gate')!.hidden, false, 'the gate should be showing');
  assert.equal(
    (acct.ctx.document as { body: StubEl }).body.className,
    'signed-out',
    'the page should be in its signed-out state',
  );
  assert.ok(acctInput('email'), 'no email field');
  assert.ok(acctInput('password'), 'no password field');
  assert.ok(acctButton('Sign in') && acctButton('Sign up'), 'no buttons');
});

await t('empty fields are answered here, not by the server', async () => {
  const before = acct.posts.length;
  acctButton('Sign in')!.fire('click');
  await settle();
  assert.ok(
    textOf(acct.ids.get('#gateForm')).includes('Enter your email and a password'),
    'it should say what is missing',
  );
  assert.equal(acct.posts.length, before, 'nothing should have been sent');
});

await t('signing up asks for the code, rather than saying nothing at all', async () => {
  acctInput('email')!.value = 'newcomer@example.com';
  acctInput('password')!.value = 'a-good-password';
  acctButton('Sign up')!.fire('click');
  await settle();

  const said = textOf(acct.ids.get('#gateForm'));
  assert.ok(said.includes('Code sent to newcomer@example.com'), `should ask for a code: ${said}`);
  assert.ok(acctButton('Verify'), 'no verify button');
  assert.equal(acct.ids.get('#gate')!.hidden, false, 'still locked until verified');
});

await t('the code is what opens it — no link, so no Site URL to get wrong', async () => {
  const box = [...walk(acct.ids.get('#gateForm')!)].find((n) => n.tag === 'input')!;
  box.value = '123456';
  acctButton('Verify')!.fire('click');
  await settle();

  const sent = acct.posts.find((p) => p.url.includes('/api/auth/verify'));
  assert.ok(sent, 'nothing was verified');
  assert.deepEqual(sent!.body, {
    email: 'newcomer@example.com',
    token: '123456',
  });
  assert.equal(acct.ids.get('#gate')!.hidden, true, 'the gate should be down');
});

await t('signing out puts the gate back', async () => {
  const menu = [...walk(acct.ids.get('#accountPanel')!)].find(
    (n) => n.tag === 'button' && textOf(n).trim() === 'Sign out',
  );
  assert.ok(menu, 'no sign out');
  menu!.fire('click');
  await settle();
  assert.equal(acct.ids.get('#gate')!.hidden, false);
});

await t('signing in opens the tool, and lists their own saved jobs', async () => {
  acctInput('email')!.value = 'asha@example.com';
  acctInput('password')!.value = 'a-good-password';
  acctButton('Sign in')!.fire('click');
  await settle();

  assert.equal(acct.ids.get('#gate')!.hidden, true, 'the gate should be down');
  assert.equal((acct.ctx.document as { body: StubEl }).body.className, '');
  assert.equal(acct.ids.get('#accountBtn')!.ownText, 'asha@example.com');
  const listed = acct.ids.get('#jobList')!.children.map((c) => (c as StubEl).attrs.value);
  assert.deepEqual(listed, ['HI-20001'], 'their own saved jobs, and only those');
});

await t('Save stores the spec under the job number, as that user', async () => {
  acct.ids.get('#jobNo')!.value = 'HI-20002';
  acct.ids.get('#jobNo')!.fire('input');
  await settle();

  const before = acct.posts.length;
  acct.fileButtons.find((b) => b.attrs['data-file'] === 'save')!.fire('click');
  await settle();

  const saved = acct.posts.slice(before).find((p) => p.url === '/api/jobs/saved');
  assert.ok(saved, 'nothing was saved');
  const body = saved!.body as Record<string, unknown>;
  assert.equal(body.jobNo, 'HI-20002');
  // who it is saved as comes from the bearer token, not from the body —
  // see userFromRequest in server/auth.ts, never trusted from the request
  assert.ok(body.spec && typeof body.spec === 'object');
  assert.ok(!('blocks' in (body.spec as object)), 'a BOQ must never be stored');
  assert.equal(acct.ids.get('#jobSearchMsg')!.ownText, 'saved HI-20002');
});

await t('Save As asks for a number, and saves under that one', async () => {
  acct.answerWith('HI-20003');
  const before = acct.posts.length;
  acct.fileButtons.find((b) => b.attrs['data-file'] === 'saveAs')!.fire('click');
  await settle();

  assert.ok(acct.asked.some((q) => q.includes('job number')), 'it should have asked');
  const saved = acct.posts.slice(before).find((p) => p.url === '/api/jobs/saved');
  assert.equal((saved!.body as Record<string, unknown>).jobNo, 'HI-20003');
});

await t('opening a job, changing its number and saving makes a new job', async () => {
  // `(user_id, job_no)` unique means a different number is a different row,
  // so the job that was opened is left exactly as it was — which is the point
  const box = acct.ids.get('#jobSearch')!;
  box.value = 'HI-20001';
  box.fire('change');
  await settle();
  assert.equal(acct.ids.get('#jobSearchMsg')!.ownText, 'opened HI-20001');

  acct.ids.get('#jobNo')!.value = 'HI-20009';
  acct.ids.get('#jobNo')!.fire('input');
  await settle();

  const before = acct.posts.length;
  acct.fileButtons.find((b) => b.attrs['data-file'] === 'save')!.fire('click');
  await settle();

  const saved = acct.posts.slice(before).find((p) => p.url === '/api/jobs/saved');
  assert.equal((saved!.body as { jobNo: string }).jobNo, 'HI-20009');
  assert.equal(
    acct.ids.get('#jobSearchMsg')!.ownText,
    'saved as a new job HI-20009',
    'and it says so, rather than looking like an overwrite',
  );
});

await t('an estimator can delete their own job, after being asked', async () => {
  acct.confirmWith(false);
  const before = acct.posts.length;
  const del = acct.fileButtons.find((b) => b.attrs['data-file'] === 'delete')!;
  del.fire('click');
  await settle();
  assert.equal(acct.posts.length, before, 'declining the warning must delete nothing');

  acct.confirmWith(true);
  del.fire('click');
  await settle();
  const gone = acct.posts.slice(before).find((p) => p.url.includes('/api/jobs/saved/'));
  assert.ok(gone, 'nothing was deleted');
  assert.ok(gone!.url.includes('HI-20009'), `the open job: ${gone!.url}`);
  assert.equal(acct.ids.get('#jobSearchMsg')!.ownText, 'deleted HI-20009');
});

await t('New warns first, and does nothing when the warning is declined', async () => {
  acct.confirmWith(false);
  const rooms = () => (acct.ctx as { state?: unknown }) && acct.ids.get('#form')!.children.length;
  const before = rooms();
  acct.fileButtons.find((b) => b.attrs['data-file'] === 'new')!.fire('click');
  await settle();
  assert.equal(rooms(), before, 'the form was cleared despite the warning being declined');
  assert.equal(acct.ids.get('#jobNo')!.value, 'HI-20009', 'the job number survived');
});

await t('a session is kept, so a reload does not sign the estimator out', () => {
  const kept = (acct.ctx.localStorage as { getItem(k: string): string | null }).getItem(
    'panelcalc.session',
  );
  assert.ok(kept, 'nothing was stored');
  assert.ok(kept!.includes('token-for-asha'), 'the access token has to be kept');
});

console.log('\n  access, and the administrator\n');

/**
 * A harness that is already signed in, with the profile it is given.
 *
 * @param mail what /api/config says about email, so a test can have the server
 * configured for it or not.
 */
const signedInAs = (
  profile: Record<string, unknown>,
  users?: unknown,
  mail: { mail: boolean; mailReason?: string } = { mail: true },
) => {
  const h = harness(APP_SOURCES, [
    ...APP_IDS,
    '#admin', '#adminBody', '#adminBack',
    '#settings', '#settingsBody', '#settingsBack',
    '#mail', '#mailBody', '#mailBack',
  ], {
    '/api/config': { accounts: true, ...mail },
    '/api/rules': { materials: { PPGI: [0.4] }, defaultSkin: { material: 'PPGI', thickness: 0.4 }, doorTypes: [], doorCores: ['Puf'], doorHands: ['LHS'], lCutMinWallTh: 50, doorTopMinWallHeight: 3050, floorMaterials: ['PPGI'], floorLayers: [], flashingTypes: ['U Flashing'] },
    '/api/jobs': [],
    '/api/render': RENDER_REPLY,
    '/api/mail': { ok: true, attached: ['HI-20001-BOQ.xlsx', 'HI-20001-drawing.pdf'], replyTo: 'asha@example.com' },
    '/api/auth/profile': { profile },
    '/api/admin/users': { users: users ?? [profile] },
    '/api/admin/access': { ok: true },
    ...savedJobsRoutes([], () => null),
  });
  // a kept session, so boot() signs in without anyone typing
  (h.ctx.localStorage as { setItem(k: string, v: string): void }).setItem(
    'panelcalc.session',
    JSON.stringify({
      accessToken: SESSION.accessToken,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      user: SESSION.user,
    }),
  );
  return h;
};

await t('an account whose access has run out is told so, and gets no tool', async () => {
  const expired = signedInAs({ ...PROFILE, access_until: '2020-01-01T00:00:00Z' });
  await settle();

  assert.equal(expired.ids.get('#gate')!.hidden, false, 'the gate should still be up');
  const said = textOf(expired.ids.get('#gateForm'));
  assert.ok(said.includes('ran out on 2020-01-01'), `should say when: ${said}`);
  assert.ok(said.includes('administrator'), 'and who to ask');
});

await t('an admin is never locked out by a date', async () => {
  const admin = signedInAs({ ...PROFILE, is_admin: true, access_until: '2020-01-01T00:00:00Z' });
  await settle();
  assert.equal(admin.ids.get('#gate')!.hidden, true, 'an admin gets in regardless');
  assert.ok(
    textOf(admin.ids.get('#accountPanel')).includes('Administrator'),
    'and is told they are one',
  );
});

await t('the profile is asked for by the caller\'s own token, not just "one row"', async () => {
  /*
   * An admin may list every user through /api/admin/users, but their own
   * profile comes from /api/auth/profile, which `userFromRequest` resolves
   * from the bearer token — never from a row chosen some other way.
   */
  const admin = signedInAs({ ...PROFILE, is_admin: true });
  await settle();

  const asked = admin.reads.find((u) => u === '/api/auth/profile');
  assert.ok(asked, 'the profile was never fetched');
});

await t('only an admin is offered the users screen', async () => {
  const ordinary = signedInAs(PROFILE);
  await settle();
  const items = textOf(ordinary.ids.get('#accountPanel'));
  assert.ok(!items.includes('Manage users'), 'an ordinary user must not be offered it');
});

await t('the users screen lists everyone, and giving days writes a date', async () => {
  const admin = signedInAs({ ...PROFILE, is_admin: true }, [
    { ...PROFILE, is_admin: true },
    { id: 'user-ben', email: 'ben@example.com', access_until: null, is_admin: false },
  ]);
  await settle();

  const open = [...walk(admin.ids.get('#accountPanel')!)].find(
    (n) => n.tag === 'button' && textOf(n).trim() === 'Manage users',
  );
  assert.ok(open, 'no way in');
  open!.fire('click');
  await settle();

  const listed = textOf(admin.ids.get('#adminBody'));
  assert.ok(listed.includes('ben@example.com'), `everyone should be listed: ${listed}`);
  assert.ok(listed.includes('no access'), 'and their state said');

  const before = admin.posts.length;
  const grant = [...walk(admin.ids.get('#adminBody')!)].find(
    (n) => n.tag === 'button' && textOf(n).trim() === '+30d',
  );
  assert.ok(grant, 'no way to give access');
  grant!.fire('click');
  await settle();

  const patch = admin.posts.slice(before).find((p) => p.url === '/api/admin/access');
  assert.ok(patch, 'nothing was written');
  const until = (patch!.body as { until: string }).until;
  const days = (new Date(until).getTime() - Date.now()) / 86400000;
  assert.ok(days > 29 && days < 31, `should be about 30 days, was ${days}`);
});

await t('any number of days can be typed, for when the three buttons do not fit', async () => {
  const admin = signedInAs({ ...PROFILE, is_admin: true }, [
    { id: 'user-ben', email: 'ben@example.com', access_until: null, is_admin: false },
  ]);
  await settle();
  [...walk(admin.ids.get('#accountPanel')!)]
    .find((n) => n.tag === 'button' && textOf(n).trim() === 'Manage users')!
    .fire('click');
  await settle();

  // `el()` puts class on className, not into attributes
  const box = [...walk(admin.ids.get('#adminBody')!)].find((n) => n.className === 'days');
  assert.ok(box, 'no way to type a number of days');
  box!.value = '90';

  const before = admin.posts.length;
  [...walk(admin.ids.get('#adminBody')!)]
    .find((n) => n.tag === 'button' && textOf(n).trim() === 'Give')!
    .fire('click');
  await settle();

  const patch = admin.posts.slice(before).find((p) => p.url === '/api/admin/access');
  assert.ok(patch, 'nothing was written');
  const days =
    (new Date((patch!.body as { until: string }).until).getTime() - Date.now()) / 86400000;
  assert.ok(days > 89 && days < 91, `should be about 90 days, was ${days}`);
});

console.log('\n  settings — where this estimator\'s paperwork goes\n');

/** Open *My settings* on a harness that is already signed in. */
const openSettingsOn = async (h: Harness) => {
  const open = [...walk(h.ids.get('#accountPanel')!)].find(
    (n) => n.tag === 'button' && textOf(n).trim() === 'My settings',
  );
  assert.ok(open, 'no My settings button');
  open!.fire('click');
  await settle();
};

/** The box under the label an estimator reads. */
const settingsInput = (h: Harness, label: string) => {
  const field = [...walk(h.ids.get('#settingsBody')!)].find(
    (n) => n.className === 'settings-field' && textOf(n).includes(label),
  );
  return field && [...walk(field)].find((n) => n.tag === 'input');
};

const saveSettingsButton = (h: Harness) =>
  [...walk(h.ids.get('#settingsBody')!)].find(
    (n) => n.tag === 'button' && textOf(n).trim() === 'Save settings',
  );

/** A profile with somewhere for its paperwork to go. */
const KITTED = {
  ...PROFILE,
  drive_folder_url: 'https://drive.google.com/drive/folders/abc123',
  sheet_url: 'https://docs.google.com/spreadsheets/d/sheet123/edit',
  mail_from: 'asha@example.com',
};

await t('every signed-in estimator is offered their settings, admin or not', async () => {
  const ordinary = signedInAs(PROFILE);
  await settle();
  const items = textOf(ordinary.ids.get('#accountPanel'));
  assert.ok(items.includes('My settings'), 'an ordinary estimator must be offered it');
  assert.ok(!items.includes('Manage users'), 'and still not the admin screen');
});

await t('the screen opens showing what is already saved', async () => {
  const h = signedInAs(KITTED);
  await settle();
  await openSettingsOn(h);

  assert.equal(h.ids.get('#settings')!.hidden, false, 'the panel should be showing');
  assert.equal(
    settingsInput(h, 'Google Drive folder link')!.value,
    KITTED.drive_folder_url,
    'the saved folder should be in its box',
  );
  assert.equal(settingsInput(h, 'Google Sheet link')!.value, KITTED.sheet_url);
  assert.equal(settingsInput(h, 'Send email from')!.value, 'asha@example.com');
});

await t('the Apps Script box is gone, and its column is left alone', async () => {
  /*
   * Phase 11 stopped being "an Apps Script each estimator deploys" on 18 August
   * — the shop asked for two links and one shared ID instead. The box came off
   * the form the same day, on this repo's rule that a control which does
   * nothing is worse than no control. saveProfile in server/auth.ts does not
   * accept these columns at all anymore — there is no column left to blank.
   */
  const h = signedInAs(KITTED);
  await settle();
  await openSettingsOn(h);
  assert.equal(settingsInput(h, 'Apps Script'), undefined, 'the box should be gone');

  const before = h.posts.length;
  saveSettingsButton(h)!.fire('click');
  await settle();
  const patch = h.posts.slice(before).find((p) => p.url === '/api/auth/profile');
  const body = patch!.body as Record<string, unknown>;
  assert.ok(!('driveScriptUrl' in body), 'a field the screen does not show is not sent');
  assert.ok(!('sheetScriptUrl' in body), 'nor this one');
});

await t('saving writes the four fields the screen shows, to that estimator\'s own row', async () => {
  const h = signedInAs(PROFILE);
  await settle();
  await openSettingsOn(h);

  settingsInput(h, 'Google Drive folder link')!.value =
    'https://drive.google.com/drive/folders/newfolder';
  settingsInput(h, 'Google Sheet link')!.value =
    'https://docs.google.com/spreadsheets/d/newsheet/edit';
  settingsInput(h, 'Send email from')!.value = 'asha@example.com';

  const before = h.posts.length;
  saveSettingsButton(h)!.fire('click');
  await settle();

  const patch = h.posts.slice(before).find((p) => p.url === '/api/auth/profile');
  assert.ok(patch, 'nothing was saved');
  const body = patch!.body as Record<string, unknown>;
  assert.equal(body.driveFolderUrl, 'https://drive.google.com/drive/folders/newfolder');
  assert.equal(body.sheetUrl, 'https://docs.google.com/spreadsheets/d/newsheet/edit');
  assert.equal(body.mailFrom, 'asha@example.com');
  /*
   * Neither of these may travel with a profile save. The server refuses them
   * either way — saveProfile in server/auth.ts writes exactly four named
   * columns — but the app has no business asking, and a request it does not
   * send is one nobody has to reason about.
   */
  assert.ok(!('access_until' in body) && !('accessUntil' in body), 'a settings save must never carry access');
  assert.ok(!('is_admin' in body) && !('isAdmin' in body), 'a settings save must never carry admin rights');
  assert.ok(textOf(h.ids.get('#settingsBody')).includes('Saved.'), 'it should say it saved');
});

await t('a link that is not the one asked for is said, and still saved', async () => {
  /*
   * Said, not corrected — the same rule the wall chain that does not close
   * follows. Both boxes take a Google URL and they are not interchangeable, so
   * the sheet link in the folder box is the mistake worth naming.
   */
  const h = signedInAs(PROFILE);
  await settle();
  await openSettingsOn(h);

  settingsInput(h, 'Google Drive folder link')!.value =
    'https://docs.google.com/spreadsheets/d/sheet123/edit';

  const before = h.posts.length;
  saveSettingsButton(h)!.fire('click');
  await settle();

  const patch = h.posts.slice(before).find((p) => p.url === '/api/auth/profile');
  assert.ok(patch, 'what was typed must still be saved');
  assert.equal(
    (patch!.body as Record<string, unknown>).driveFolderUrl,
    'https://docs.google.com/spreadsheets/d/sheet123/edit',
    'it must be stored exactly as typed, not corrected',
  );
  const said = textOf(h.ids.get('#settingsBody'));
  assert.ok(said.includes('Saved.'), `it saved: ${said}`);
  assert.ok(
    said.includes('Google Drive folder link does not look like'),
    `and said so: ${said}`,
  );
});

await t('the mail_from box states the one thing that decides whether email arrives', async () => {
  // Brevo will not send as an address it cannot prove the sender owns. That is
  // not a rule this app can bend, so the box has to say it where it is read.
  const h = signedInAs(PROFILE);
  await settle();
  await openSettingsOn(h);
  const said = textOf(h.ids.get('#settingsBody'));
  assert.ok(said.includes('verified as a sender'), `the constraint must be on screen: ${said}`);
  assert.ok(said.includes('Reply-To'), 'and what happens to replies');
});

console.log('\n  email — the job, sent out\n');

/** The box under a label on the email form. */
const mailInput = (h: Harness, label: string) => {
  const field = [...walk(h.ids.get('#mailBody')!)].find(
    (n) => n.className === 'settings-field' && textOf(n).includes(label),
  );
  return field && [...walk(field)].find((n) => n.tag === 'input' || n.tag === 'textarea');
};

const openMailOn = async (h: Harness) => {
  h.ids.get('#mailBtn')!.fire('click');
  await settle();
};

await t('the Email button sits beside Print, and opens the form', async () => {
  const h = signedInAs(PROFILE);
  await settle();
  await openMailOn(h);

  assert.equal(h.ids.get('#mail')!.hidden, false, 'the panel should be showing');
  for (const label of ['To', 'CC', 'BCC', 'Subject', 'Message']) {
    assert.ok(mailInput(h, label), `no ${label} box`);
  }
});

await t('the subject is filled in with the job number', async () => {
  const h = signedInAs(PROFILE);
  await settle();
  h.ids.get('#jobNo')!.value = 'HI-20001';
  h.ids.get('#jobNo')!.fire('input');
  await settle();
  await openMailOn(h);

  assert.equal(mailInput(h, 'Subject')!.value, 'HI-20001 — drawings and BOQ');
});

await t('the two attachments are stated, not offered as a choice', async () => {
  // a job goes out as its BOQ and its drawings or it does not go out
  const h = signedInAs(PROFILE);
  await settle();
  await openMailOn(h);
  const said = textOf(h.ids.get('#mailBody'));
  assert.ok(said.includes('Excel workbook'), `the workbook should be named: ${said}`);
  assert.ok(said.includes('PDF'), 'the drawings should be named');
  const boxes = [...walk(h.ids.get('#mailBody')!)].filter(
    (n) => n.tag === 'input' && n.attrs.type === 'checkbox',
  );
  assert.equal(boxes.length, 0, 'there must be nothing to untick');
});

await t('Send posts the job and the boxes, as the signed-in estimator', async () => {
  const h = signedInAs(PROFILE);
  await settle();
  await openMailOn(h);

  mailInput(h, 'To')!.value = 'customer@example.com';
  mailInput(h, 'CC')!.value = 'office@example.com';
  mailInput(h, 'Message')!.value = 'Drawings and BOQ attached.';

  const before = h.posts.length;
  [...walk(h.ids.get('#mailBody')!)]
    .find((n) => n.tag === 'button' && textOf(n).trim() === 'Send')!
    .fire('click');
  await settle();

  const sent = h.posts.slice(before).find((p) => p.url.includes('/api/mail'));
  assert.ok(sent, 'nothing was sent');
  const b = sent!.body as Record<string, unknown>;
  assert.equal(b.to, 'customer@example.com');
  assert.equal(b.cc, 'office@example.com');
  assert.equal(b.text, 'Drawings and BOQ attached.');
  /*
   * The spec goes, not the BOQ. The server builds the attachments from it with
   * the same calls /api/export makes — two builds of one sheet are two chances
   * to disagree, and the customer must open what the estimator saw.
   */
  assert.ok(b.job && typeof b.job === 'object', 'the job spec has to go with it');
  assert.ok(!('blocks' in (b.job as object)), 'a built BOQ must never be posted');

  assert.ok(
    textOf(h.ids.get('#mailBody')).includes('Sent'),
    'it should say it sent, and what went with it',
  );
});

await t('with no mail key the button says what is missing, and posts nothing', async () => {
  /*
   * A button that opens a form which cannot post anywhere is worse than no
   * button — the same rule that kept the BOQ group field off the form. The key
   * lives in the host environment, so the browser is told yes or no and never
   * the key itself.
   */
  const h = signedInAs(PROFILE, undefined, {
    mail: false,
    mailReason: 'BREVO_API_KEY / MAIL_FROM are not set on the server',
  });
  await settle();
  await openMailOn(h);

  const said = textOf(h.ids.get('#mailBody'));
  assert.ok(said.includes('not set up'), `it should say so: ${said}`);
  assert.ok(said.includes('BREVO_API_KEY'), 'and name what is missing');
  assert.equal(mailInput(h, 'To'), undefined, 'no form that cannot be sent');
  assert.ok(
    !h.posts.some((p) => p.url.includes('/api/mail')),
    'nothing may be posted when email is off',
  );
});

await t('what was typed survives going back and opening it again', async () => {
  const h = signedInAs(PROFILE);
  await settle();
  await openMailOn(h);
  const box = mailInput(h, 'To')!;
  box.value = 'customer@example.com';
  box.fire('input');

  h.ids.get('#mailBack')!.fire('click');
  await settle();
  assert.equal(h.ids.get('#mail')!.hidden, true, 'Back should close it');

  await openMailOn(h);
  assert.equal(
    mailInput(h, 'To')!.value,
    'customer@example.com',
    'a half typed email must not be thrown away',
  );
});

/* ---------- uploading a drawing: two rooms on one sheet ---------- */

console.log('\n  uploading a drawing — HI-15420, two rooms\n');

/**
 * What /api/render answers, from the real engine rather than a stub, so the
 * BOQ the page shows and checks is the one the shop rule really produces from
 * what the form posted. `serialise` and `withWalls` in server/serve.ts do the
 * same.
 */
function enginePayload(spec: any) {
  const job = {
    ...spec,
    rooms: spec.rooms.map((r: any) =>
      r.outline && !r.walls?.length ? { ...r, walls: compileWalls(r.outline) } : r,
    ),
  };
  const blocks = buildJob(job);
  const grand = blocks.reduce(
    (a, b) => ({
      panelQty: a.panelQty + b.totals.panelQty,
      ppgiQty: a.ppgiQty + b.totals.ppgiQty,
      plyQty: a.plyQty + b.totals.plyQty,
      chemWeight: a.chemWeight + b.totals.chemWeight,
      areaSqmt: a.areaSqmt + b.totals.areaSqmt,
    }),
    { panelQty: 0, ppgiQty: 0, plyQty: 0, chemWeight: 0, areaSqmt: 0 },
  );
  return {
    jobNo: job.jobNo,
    density: job.density,
    rooms: job.rooms.map((r: any) => r.name),
    problems: checkJob(job),
    flashing: jobFlashing(job),
    blocks: blocks.map((b) => ({
      title: b.title,
      spec: b.spec,
      rows: b.rows.map((r) => ({
        ...r,
        chemWeightText: r.chemWeight ? fmt2(r.chemWeight) : '',
        areaSqmtText: r.areaSqmt ? String(round(r.areaSqmt, 5)) : '',
      })),
      totals: { ...b.totals, chemWeightText: fmt2(b.totals.chemWeight), areaSqmtText: fmt2(b.totals.areaSqmt) },
    })),
    grand: { ...grand, chemWeightText: fmt2(grand.chemWeight), areaSqmtText: fmt2(grand.areaSqmt) },
    layout: { drawable: false, reason: 'stub' },
    sheet: { drawable: false, reason: 'stub' },
    drawings: [],
    model3d: { faces: [], skipped: [] },
  };
}

const UPLOAD_IDS = [
  ...APP_IDS,
  '#landing',
  '#upload',
  '#uploadBody',
  '#landingCreate',
  '#landingUpload',
  '#uploadBack',
];

/** The page, with the vision feature on and the extractor answering with this reading. */
function uploadApp(reading: unknown) {
  const seen: { data: ReturnType<typeof enginePayload> | null; error: unknown } = { data: null, error: null };
  const h = harness(APP_SOURCES, UPLOAD_IDS, {
    '/api/config': { accounts: false, accountsReason: 'no database', vision: true },
    '/api/rules': {
      materials: { PPGI: [0.4], SS: [0.5] },
      defaultSkin: { material: 'PPGI', thickness: 0.4 },
      doorTypes: [{ key: 'flush', label: 'Flush Door', thickness: 0 }],
      doorCores: ['Puf'],
      doorHands: ['LHS', 'RHS'],
      lCutMinWallTh: 50,
      doorTopMinWallHeight: 3050,
      floorMaterials: ['PPGI', 'Ply', 'AL. CHQ'],
      floorLayers: [
        { material: 'PPGI', th: 0.4 },
        { material: 'Puf', th: 0 },
        { material: 'Ply', th: 12 },
        { material: 'AL. CHQ', th: 2 },
      ],
      flashingTypes: ['U Flashing', 'Gutter Flashing'],
    },
    '/api/jobs': [],
    '/api/extract-drawing': () => reading,
    '/api/render': (_url: string, init?: { body?: string }) => {
      try {
        seen.data = enginePayload(JSON.parse(init!.body!));
        return seen.data;
      } catch (err) {
        seen.error = err;
        return { error: (err as Error).message };
      }
    },
  });
  return { h, seen };
}

/** Walk the upload screen: choose the file, press Read, and let it open the calculator. */
async function uploadFile(h: Harness, file: File) {
  await settle();
  h.ids.get('#landingUpload')!.fire('click');
  const body = h.ids.get('#uploadBody')!;
  const input = [...walk(body)].find((n) => n.tag === 'input' && n.attrs.type === 'file');
  assert.ok(input, 'the upload screen has no file box');
  (input as unknown as { files: File[] }).files = [file];
  input!.fire('change');
  const read = [...walk(body)].find((n) => n.tag === 'button' && textOf(n).includes('Read this drawing'));
  assert.ok(read, 'no Read button after choosing a file');
  read!.fire('click');
  await settle();
  await settle();
}

const HI_15420_PDF = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'HI-15420-Model.pdf', {
  type: 'application/pdf',
});
const reading2 = parseExtraction(HI_15420);

const two = uploadApp(reading2);
await uploadFile(two.h, HI_15420_PDF);

type PostedRoom = {
  name: string;
  ext: { w: number; l: number; h: number };
  wallTh: number;
  ceilTh: number;
  floor: { kind: string; th: number };
  at: [number, number];
  outline: { edges: Record<string, any> };
};
const lastSpec = () => {
  const posts = two.h.posts.filter((p) => p.url.includes('/api/render'));
  return posts.at(-1)!.body as { jobNo: string; rooms: PostedRoom[] };
};
const form2 = () => two.h.ids.get('#form')!;
const formText = () => textOf(form2());
const tabs = () => [...walk(form2())].filter((n) => n.tag === 'button' && n.className.startsWith('room-tab'));

await t('the drawing is sent to be read, as the PDF it is', () => {
  const sent = two.h.posts.find((p) => p.url.includes('/api/extract-drawing'));
  assert.ok(sent, 'nothing was posted for reading');
  const body = sent!.body as { mimeType: string; imageBase64: string };
  assert.equal(body.mimeType, 'application/pdf');
  assert.equal(Buffer.from(body.imageBase64, 'base64').toString('latin1'), '%PDF');
});

await t('reading it opens the calculator, and the engine took what the form posted', () => {
  assert.deepEqual(two.h.errors, []);
  assert.equal(two.seen.error, null, `the engine refused what the form posted: ${(two.seen.error as Error)?.message}`);
  assert.equal(two.h.ids.get('#upload')!.hidden, true, 'the upload screen should have closed');
  assert.equal(two.h.ids.get('#landing')!.hidden, true);
});

await t('BOTH rooms are opened, each with its own dimensions', () => {
  const spec = lastSpec();
  assert.equal(spec.jobNo, 'HI-15420');
  assert.deepEqual(spec.rooms.map((r) => r.name), ['CHILLER ROOM.1', 'CHILLER ROOM.2']);
  assert.deepEqual(spec.rooms.map((r) => r.ext), [
    { w: 4120, l: 4720, h: 2240 },
    { w: 3460, l: 4140, h: 2080 },
  ]);
  for (const r of spec.rooms) {
    assert.equal(r.wallTh, 60);
    assert.equal(r.ceilTh, 60);
    assert.equal(r.floor.kind, 'pufSlab');
    assert.equal(r.floor.th, 60);
  }
  assert.equal(tabs().filter((n) => textOf(n).startsWith('CHILLER')).length, 2, 'a tab for each room');
});

await t('the rooms stand clear of each other on the job plan', () => {
  const [a, b] = lastSpec().rooms;
  assert.ok(b.at[0] >= a.at[0] + a.ext.w, 'room 2 overlaps room 1');
});

await t('each room has its own door: clear opening, module, hand, sheets, lift', () => {
  const [a, b] = lastSpec().rooms;
  const doors = (r: PostedRoom) => Object.entries(r.outline.edges).filter(([, e]) => e.door);
  assert.equal(doors(a).length, 1);
  assert.equal(doors(b).length, 1);
  const [ai, ad] = doors(a)[0];
  const [bi, bd] = doors(b)[0];
  assert.equal(ai, '2', 'room 1 door is on the bottom wall');
  assert.equal(bi, '2', 'room 2 door is on the bottom wall');
  for (const [d, clearH] of [
    [ad.door, 1900],
    [bd.door, 1750],
  ] as const) {
    assert.equal(d.clearW, 900);
    assert.equal(d.clearH, clearH);
    assert.equal(d.moduleW, 1180);
    assert.equal(d.frame, 140);
    assert.equal(d.hand, 'RHS');
    assert.equal(d.swing, 'out');
    assert.equal(d.liftAboveFloor, 110);
    assert.equal(d.skin.outer.material, 'PPGI', 'PP outside');
    assert.equal(d.skin.inner.material, 'SS', 'SS inside');
    assert.equal(d.label, 'Flush Door PP/SS');
  }
  assert.equal(ad.door.fromLeft, reading2.rooms[0].form!.door!.fromLeft);
  assert.equal(bd.door.fromLeft, reading2.rooms[1].form!.door!.fromLeft);
});

await t('room 1 bottom wall carries the printed panel widths, as Exact widths', () => {
  const bottom = lastSpec().rooms[0].outline.edges['2'];
  assert.deepEqual([...bottom.panels].sort((x: number, y: number) => x - y), [625, 625, 1090]);
  assert.deepEqual(bottom.panels, reading2.rooms[0].form!.panels[2], 'the form must carry what the server derived');
});

await t('room 2 top wall is the neighbour’s: shared, no panels', () => {
  assert.deepEqual(lastSpec().rooms[1].outline.edges['0'], { shared: true });
});

await t('the exact widths show on the wall card as the marked Exact mode, not hidden', () => {
  const text = formText();
  assert.ok(text.includes('Exact widths off the drawing'), 'the split control is not in Exact mode');
  assert.ok(
    text.includes('Taken from the uploaded drawing: these are the widths the drawing prints'),
    'not marked as from the drawing',
  );
  const exact = [...walk(form2())].find(
    (n) =>
      n.tag === 'select' &&
      n.children.some((o) => o instanceof StubEl && o.attrs.value === 'exact' && 'selected' in o.attrs),
  );
  assert.ok(exact, 'no panel split control set to exact');
  // every wall that carries printed widths shows them, in a Widths box; the
  // bottom wall's is the one that differs from the shop rule's split
  const boxes = [...walk(form2())].filter(
    (n) => n.tag === 'input' && n.parentNode?.tag === 'label' && textOf(n.parentNode).trim() === 'Widths',
  );
  const lists = boxes.map((n) => String(n.value).split(/\D+/).map(Number).sort((x, y) => x - y).join(','));
  assert.ok(lists.includes('625,625,1090'), `the bottom wall's widths are not on its card: ${lists.join(' | ')}`);
});

/** The check section the page prints beside the BOQ. */
const checkText = () => {
  const out = two.h.ids.get('#out')!;
  const sec = [...walk(out)].find(
    (n) => n.tag === 'section' && /problems|drawing-check/.test(n.className) && textOf(n).startsWith('Checked against'),
  );
  assert.ok(sec, 'no check against the uploaded drawing');
  return textOf(sec!);
};

await t('the uploaded drawing sits above everything generated, as received, in its own box', () => {
  const out = two.h.ids.get('#out')!;
  const slot = out.children[0] as StubEl;
  const details = slot.children[0] as StubEl;
  assert.equal(details.tag, 'details');
  assert.equal(details.attrs.open, '', 'it should start open');
  assert.equal(textOf(details.children[0] as StubEl), 'Uploaded drawing - as received');
  const embed = [...walk(details)].find((n) => n.tag === 'embed');
  assert.ok(embed, 'a PDF is shown with an embed');
  assert.ok(String(embed!.attrs.src).startsWith('blob:'), 'it is the uploaded file itself, not a redraw');
  assert.equal(embed!.attrs.type, 'application/pdf');
  assert.ok([...walk(details)].some((n) => n.className === 'uploaded-box'), 'it has its own scroll box');
  assert.ok(textOf(out.children[1] as StubEl).includes('SHEET FABRICATION'), 'the BOQ follows it');
});

await t('the page hides the uploaded drawing when printed, and never lets it widen the page', () => {
  const css = read('web/styles.css');
  assert.ok(/@media print\s*\{[^@]*\.uploaded-drawing/s.test(css), 'not hidden in print');
  assert.ok(/\.uploaded-box\s*\{[^}]*overflow:\s*auto/s.test(css), 'no scroll box of its own');
  assert.ok(/\.uploaded-drawing\[hidden\]\s*\{\s*display:\s*none/.test(css), 'the [hidden] rule is missing');
});

await t('the BOQ has each door, built from what the drawing printed', () => {
  const data = two.seen.data!;
  assert.equal(data.blocks.length, 2);
  data.blocks.forEach((b, i) => {
    const door = b.rows.filter((r: { desc: string }) => /door/i.test(r.desc));
    assert.ok(door.length > 0, `room ${i + 1} has no door rows in its BOQ`);
  });
});

await t('a door figure the drawing does not print is left off, not defaulted: no CHQ sheet, and the lift is the printed 110', () => {
  // regression: newDoor() defaults chqOn true / 600, so a reading with no CHQ
  // height posted "AL. CHQ 600" onto a door whose drawing prints none
  for (const r of lastSpec().rooms) {
    const d = Object.values(r.outline.edges).find((e: any) => e.door)!.door;
    assert.equal(d.chqHeight, undefined, 'a CHQ height nobody read was posted');
    assert.equal(d.liftAboveFloor, 110);
  }
  for (const b of two.seen.data!.blocks) {
    assert.ok(!/CHQ/i.test(JSON.stringify(b.spec)), `the spec box prints a CHQ the drawing does not: ${JSON.stringify(b.spec)}`);
  }
});

await t('the corner and roof panels follow the wall sheets: inner SS, outer PPGI, the way the plan marks them', () => {
  // regression: no room-level skin was posted, so corner inner and roof rows
  // printed PPGI 0.4 beside SS wall inners
  for (const r of lastSpec().rooms as Array<PostedRoom & { skin: any }>) {
    assert.equal(r.skin.outer.material, 'PPGI');
    assert.equal(r.skin.inner.material, 'SS');
  }
  for (const b of two.seen.data!.blocks) {
    const inner = b.rows.filter((r: { desc: string }) => r.desc.startsWith('Corner Panel (Inner)'));
    assert.ok(inner.length > 0);
    for (const r of inner) assert.equal((r as { skin?: string }).skin, 'SS 0.5', `a corner inner row is ${(r as { skin?: string }).skin}`);
    const wallInner = b.rows.filter((r: { desc: string }) => r.desc.startsWith('Wall Panel (Inner)'));
    for (const r of wallInner) assert.equal((r as { skin?: string }).skin, 'SS 0.5');
  }
});

await t('the generated plan hinges each RHS door at the plan-right end of the opening, as the print does', () => {
  // both doors are RHS on the bottom wall, whose edge runs right to left: the
  // hinge is the start of the edge, which is plan-right. The module spans the
  // opening plus a frame leg either side.
  const spec = lastSpec();
  spec.rooms.forEach((room) => {
    const planRoom = { ...room, walls: compileWalls((room as any).outline) } as any;
    const plan = roomPlan(planRoom);
    const leaf = plan.lines.find((l: any) => l.layer === 'DOOR' && l.x1 === l.x2 && !l.dash);
    assert.ok(leaf, 'no door leaf is drawn');
    const bottomDoor = plan.lines.find((l: any) => l.layer === 'DOOR' && l.y1 === l.y2 && !l.dash && l.y1 === room.ext.l);
    assert.ok(bottomDoor, 'no door opening on the bottom wall');
    const mid = (Math.min(bottomDoor.x1, bottomDoor.x2) + Math.max(bottomDoor.x1, bottomDoor.x2)) / 2;
    assert.ok(leaf.x1 > mid, `the RHS hinge is at x=${leaf.x1}, left of the opening's middle ${mid}`);
  });
});

await t('the check is per room, and each room is held against its own BOQ block', () => {
  const text = checkText();
  assert.ok(text.includes('CHILLER ROOM.1') && text.includes('CHILLER ROOM.2'), 'a room is missing from the check');
  // a multi-panel ceiling is held against the printed overall size, as a pair
  assert.ok(!/Ceiling: the drawing prints/.test(text), `the ceiling check disagrees: ${text}`);
  assert.ok(text.includes('Ceiling'), 'the ceiling was not held against the drawing');
  assert.ok(!/Wall panels[^:]*: the drawing prints/.test(text), `a wall panel check disagrees: ${text}`);
  assert.ok(!/Corner panels: the drawing prints/.test(text), `a corner check disagrees: ${text}`);
});

await t('walls whose widths were applied from the drawing are stated, not counted as a pass', () => {
  const text = checkText();
  assert.ok(text.includes('Taken from the drawing, not worked out by the shop rule'));
  assert.ok(/wall bottom 1090 \+ 625 \+ 625/.test(text), `the bottom wall is not stated: ${text}`);
  assert.ok(text.includes('Wall panels (walls the shop rule built)'));
});

await t('the notes from the reading are shown once', () => {
  const text = checkText();
  assert.equal(text.split('the reading tool noted').length - 1, 1);
  assert.ok(text.includes('hatched'));
});

await t('room 2’s card says the top wall came off the drawing, and the estimator can take it back', async () => {
  const tab = tabs().find((n) => textOf(n) === 'CHILLER ROOM.2');
  assert.ok(tab, 'no tab for room 2');
  tab!.fire('click');
  await settle();
  assert.ok(formText().includes('Taken from the uploaded drawing: this wall is drawn dashed'), 'the open wall is not explained');
  const shared = [...walk(form2())].find(
    (n) => n.tag === 'label' && n.className.startsWith('chk') && textOf(n).trim() === 'Shared with neighbour',
  );
  assert.ok(shared, 'no shared box on the wall card');
  assert.ok(!shared!.className.includes('is-locked'), 'an open wall off a drawing must stay editable');
});

await t('editing a figure does not rebuild the uploaded drawing, so a PDF viewer is not reloaded', async () => {
  const out = two.h.ids.get('#out')!;
  const before = (out.children[0] as StubEl).children[0];
  const box = dimension(form2(), 'Height');
  box.value = '2100';
  box.fire('input');
  await settle();
  assert.equal((out.children[0] as StubEl).children[0], before, 'the uploaded drawing was rebuilt');
});

await t('the panel check still reports a real difference', async () => {
  // room 1's top wall, retyped with widths of the estimator's own that close on
  // the same run (3520) but are not what the drawing prints (1160 + 1180 + 1180)
  tabs().find((n) => textOf(n) === 'CHILLER ROOM.1')!.fire('click');
  await settle();
  const widths = dimension(form2(), 'Widths');
  widths.value = '1000, 1180, 1340';
  widths.fire('input');
  await settle();
  assert.equal(two.seen.error, null, `the engine refused it: ${(two.seen.error as Error)?.message}`);
  assert.ok(
    /Wall panels[^:]*: the drawing prints .* but the BOQ has/.test(checkText()),
    `a wall that differs from the drawing was not reported: ${checkText()}`,
  );
});

await t('nothing on the page, upload screen included, is a number input', () => {
  for (const id of ['#form', '#out', '#uploadBody']) {
    for (const n of walk(two.h.ids.get(id)!)) {
      assert.notEqual(n.attrs.type, 'number', `a ${n.tag} in ${id} is a number input`);
    }
  }
});

await t('New lets go of the uploaded drawing and what was read from it', async () => {
  two.h.fileButtons.find((b) => b.attrs['data-file'] === 'new')!.fire('click');
  await settle();
  const out = two.h.ids.get('#out')!;
  assert.equal((out.children[0] as StubEl).children.length, 0, 'the drawing is still on screen');
  assert.ok(!textOf(out).includes('Checked against the uploaded drawing'), 'the old check is still on screen');
});

/* a single room, as a PNG: the original shape of the feature keeps working */

const oneRoom = JSON.parse(HI_15420);
oneRoom.rooms = [oneRoom.rooms[0]];
const single = uploadApp(parseExtraction(JSON.stringify(oneRoom)));
await uploadFile(
  single.h,
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'one-room.png', { type: 'image/png' }),
);

await t('a one-room drawing still opens one room, with its drawing shown as an image', () => {
  assert.equal(single.seen.error, null);
  const spec = single.h.posts.filter((p) => p.url.includes('/api/render')).at(-1)!.body as { rooms: unknown[] };
  assert.equal(spec.rooms.length, 1);
  const out = single.h.ids.get('#out')!;
  const img = [...walk(out)].find((n) => n.tag === 'img');
  assert.ok(img, 'an image upload is shown as an img');
  assert.ok(String(img!.attrs.src).startsWith('blob:'));
  assert.ok(![...walk(out)].some((n) => n.tag === 'embed'));
  assert.ok(![...walk(out)].some((n) => n.tag === 'h4'), 'a single room needs no room heading in the check');
});



/* ---------- upload: what the estimator does next must not break the build ---------- */

console.log('\n  uploading a drawing — editing after the read\n');

const forms = (u: ReturnType<typeof uploadApp>) => u.h.ids.get('#form')!;
const roomTabs = (u: ReturnType<typeof uploadApp>) =>
  [...walk(forms(u))].filter((n) => n.tag === 'button' && n.className.startsWith('room-tab'));
const checkOf = (u: ReturnType<typeof uploadApp>) => {
  const sec = [...walk(u.h.ids.get('#out')!)].find(
    (n) => n.tag === 'section' && /problems|drawing-check/.test(n.className) && textOf(n).startsWith('Checked against'),
  );
  return sec ? textOf(sec) : '';
};
const lastPosted = (u: ReturnType<typeof uploadApp>) =>
  (u.h.posts.filter((p) => p.url.includes('/api/render')).at(-1)!.body as { rooms: PostedRoom[] }).rooms;

await t("the form defaults the server assumes are the form's own (newRoom / newDoor)", () => {
  const [room, door] = JSON.parse(
    runInContext('JSON.stringify([newRoom(), newDoor()])', two.h.ctx as never) as string,
  );
  assert.deepEqual(
    { w: room.w, l: room.l, h: room.h, thickness: room.wallTh, ceil: room.ceilTh, floor: room.floorTh },
    {
      w: FORM_DEFAULTS.w,
      l: FORM_DEFAULTS.l,
      h: FORM_DEFAULTS.h,
      thickness: FORM_DEFAULTS.thickness,
      ceil: FORM_DEFAULTS.thickness,
      floor: FORM_DEFAULTS.thickness,
    },
  );
  assert.equal(room.module, FORM_DEFAULTS.module);
  assert.equal(room.cornerLeg, FORM_DEFAULTS.cornerLeg);
  assert.equal(room.minPanelWidth, FORM_DEFAULTS.minPanelWidth);
  assert.equal(door.moduleW, FORM_DEFAULTS.doorModule);
  assert.equal(door.clearW, FORM_DEFAULTS.doorClearW);
  assert.equal(door.clearH, FORM_DEFAULTS.doorClearH);
});

const three = uploadApp(parseExtraction(HI_15420));
await uploadFile(three.h, HI_15420_PDF);

await t("removing room 1 takes its check with it, so room 2 is not held against room 1's figures", async () => {
  // regression: the check was matched to the BOQ blocks by index and removal
  // did not touch it, so room 2's block was compared with room 1's expected
  // widths, ceiling and "taken from the drawing" list
  roomTabs(three).find((n) => textOf(n) === 'CHILLER ROOM.1')!.fire('click');
  await settle();
  const del = [...walk(forms(three))].find((n) => n.tag === 'button' && textOf(n) === 'Remove this room');
  assert.ok(del, 'no Remove button');
  del!.fire('click');
  await settle();
  assert.equal(lastPosted(three).length, 1);
  assert.equal(lastPosted(three)[0].name, 'CHILLER ROOM.2');
  const text = checkOf(three);
  assert.ok(text.length > 0, 'the check disappeared');
  assert.ok(!/4060|4660|1090 [+] 625/.test(text), "room 1's figures are still held against room 2: " + text);
  assert.ok(!/no BOQ block/.test(text), 'a check is left without a block');
  assert.ok(!/Ceiling: the drawing prints/.test(text), "room 2's ceiling is reported as different: " + text);
});

const four = uploadApp(parseExtraction(HI_15420));
await uploadFile(four.h, HI_15420_PDF);

await t('a wall the drawing gave exact widths for says so in its header, not only inside the card', () => {
  const heads = [...walk(forms(four))].filter((n) => n.tag === 'div' && n.className === 'wall-head');
  assert.ok(heads.some((h) => /from drawing/.test(textOf(h))), 'no wall header is tagged');
});


await t('changing the room after an upload releases the exact widths instead of letting the engine refuse them', async () => {
  // regression: width 4120 -> 4130 left "explicit panels ... but the run is ..."
  // on every wall that carried the drawing's widths, and the BOQ was replaced
  // by an error
  assert.ok(roomTabs(four).length >= 2);
  const w = [...walk(forms(four))].find(
    (n) => n.tag === 'label' && n.className === 'f' && [...walk(n)].some((k) => k.tag === 'span' && textOf(k).trim() === 'Width'),
  );
  assert.ok(w, 'no Width box');
  const box = [...walk(w!)].find((n) => n.tag === 'input')!;
  assert.equal(String(box.value), '4120');
  box.value = '4130';
  box.fire('input');
  await settle();
  await settle();
  assert.equal(four.seen.error, null, 'the engine refused it: ' + (four.seen.error as Error)?.message);
  const room1 = lastPosted(four)[0];
  assert.equal(room1.ext.w, 4130);
  for (const e of Object.values(room1.outline.edges)) {
    assert.equal((e as { panels?: number[] }).panels, undefined, 'a stale exact width was posted');
  }
  assert.ok(/no longer fit/.test(checkOf(four)), 'the release is not said: ' + checkOf(four));
  assert.ok(
    !textOf(forms(four)).includes('Taken from the uploaded drawing: these are the widths'),
    'the card still says the widths are from the drawing',
  );
});


console.log(`\n  ${passed} passed\n`);
