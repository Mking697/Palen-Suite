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
  selectionStart: number | null = null;
  selectionEnd: number | null = null;
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
  setSelectionRange() {}
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
  // accounts off: no Supabase configured on this server
  '/api/config': { supabase: null, accountsReason: 'SUPABASE_URL / SUPABASE_ANON_KEY are not set' },
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
});

await t('the verified jobs are not offered to an estimator', () => {
  // they are proof the engine is right, not somebody's work — three jobs the
  // estimator never made, sitting among the ones they did
  assert.equal(app.ids.get('#jobList')!.children.length, 0);
});

await t('a redraw keeps the cursor where it was, and the form where it was', async () => {
  /*
   * The form is rebuilt from the state on every change, which is what stops
   * anything on screen drifting from what will be sent — but it used to throw
   * away the caret and scroll to the top while somebody was still typing.
   */
  const form = app.ids.get('#form')!;
  const box = [...walk(form)].find((n) => n.tag === 'input' && n.attrs.type === 'number')!;
  const where = pathOfNode(form, box);
  box.focus();
  form.scrollTop = 420;

  box.value = '3200';
  box.fire('input');
  await settle();

  assert.equal(form.scrollTop, 420, 'the form jumped back to the top');
  const now = (app.ctx.document as { activeElement: StubEl | null }).activeElement;
  assert.ok(now, 'the cursor was dropped');
  assert.deepEqual(pathOfNode(form, now!), where, 'the cursor moved to a different field');
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
  assert.ok(said.includes('SUPABASE_URL'), `it should say why: ${said}`);
  assert.ok(said.includes('Nothing can be saved'));
});

await t('Save without an account says so instead of failing quietly', async () => {
  const save = app.fileButtons.find((b) => b.attrs['data-file'] === 'save')!;
  save.fire('click');
  await settle();
  assert.equal(app.ids.get('#jobSearchMsg')!.ownText, 'Sign in to save');
});

console.log('\n  accounts — each estimator their own jobs\n');

const SUPA = 'https://demo.supabase.co';
const SESSION = {
  access_token: 'token-for-asha',
  refresh_token: 'refresh-for-asha',
  expires_in: 3600,
  user: { id: 'user-asha', email: 'asha@example.com' },
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

const acct = harness(APP_SOURCES, [...APP_IDS, '#admin', '#adminBody', '#adminBack'], {
  '/api/config': { supabase: { url: SUPA, anonKey: 'anon-key' } },
  '/api/rules': { materials: { PPGI: [0.4] }, defaultSkin: { material: 'PPGI', thickness: 0.4 }, doorTypes: [], doorCores: ['Puf'], doorHands: ['LHS', 'RHS'], lCutMinWallTh: 50, doorTopMinWallHeight: 3050, floorMaterials: ['PPGI'], floorLayers: [], flashingTypes: ['U Flashing'] },
  '/api/jobs': [{ jobNo: 'HI-15191', rooms: [{ name: 'Freezer Room' }] }],
  '/api/render': RENDER_REPLY,
  [`${SUPA}/auth/v1/token`]: SESSION,
  [`${SUPA}/auth/v1/signup`]: { user: { id: 'new', email: 'newcomer@example.com' } }, // no token: a code goes out
  [`${SUPA}/auth/v1/verify`]: SESSION,
  [`${SUPA}/rest/v1/profiles`]: [PROFILE],
  [`${SUPA}/rest/v1/jobs`]: (url: string, init?: { method?: string }) => {
    if (init?.method && init.method !== 'GET') return null; //  saved or deleted
    return url.includes('select=spec') ? [{ spec: SAVED_SPEC }] : SAVED;
  },
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

await t('empty fields are answered here, not by Supabase', async () => {
  const before = acct.posts.length;
  acctButton('Sign in')!.fire('click');
  await settle();
  // sent empty, Supabase replies "Anonymous sign-ins are disabled" — true, and
  // useless to somebody who simply has not typed anything yet
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

  const sent = acct.posts.find((p) => p.url.includes('/auth/v1/verify'));
  assert.ok(sent, 'nothing was verified');
  assert.deepEqual(sent!.body, {
    type: 'signup',
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

  const saved = acct.posts.slice(before).find((p) => p.url.includes('/rest/v1/jobs'));
  assert.ok(saved, 'nothing was saved');
  const row = (saved!.body as Array<Record<string, unknown>>)[0];
  assert.equal(row.job_no, 'HI-20002');
  assert.equal(row.user_id, 'user-asha', 'saved as the signed-in user');
  // the spec is stored and the BOQ is not — it is generated, and a stored
  // figure is how a saved job and a fresh one start to disagree
  assert.ok(row.spec && typeof row.spec === 'object');
  assert.ok(!('blocks' in (row.spec as object)), 'a BOQ must never be stored');
  assert.equal(acct.ids.get('#jobSearchMsg')!.ownText, 'saved HI-20002');
});

await t('Save As asks for a number, and saves under that one', async () => {
  acct.answerWith('HI-20003');
  const before = acct.posts.length;
  acct.fileButtons.find((b) => b.attrs['data-file'] === 'saveAs')!.fire('click');
  await settle();

  assert.ok(acct.asked.some((q) => q.includes('job number')), 'it should have asked');
  const saved = acct.posts.slice(before).find((p) => p.url.includes('/rest/v1/jobs'));
  assert.equal((saved!.body as Array<Record<string, unknown>>)[0].job_no, 'HI-20003');
});

await t('opening a job, changing its number and saving makes a new job', async () => {
  // `unique (user_id, job_no)` means a different number is a different row, so
  // the job that was opened is left exactly as it was — which is the point
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

  const saved = acct.posts.slice(before).find((p) => p.url.includes('/rest/v1/jobs'));
  assert.equal((saved!.body as Array<{ job_no: string }>)[0].job_no, 'HI-20009');
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
  const gone = acct.posts.slice(before).find((p) => p.url.includes('/rest/v1/jobs'));
  assert.ok(gone, 'nothing was deleted');
  assert.ok(gone!.url.includes('job_no=eq.HI-20009'), `the open job: ${gone!.url}`);
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
  assert.ok(kept!.includes('refresh-for-asha'), 'the refresh token has to be kept');
});

console.log('\n  access, and the administrator\n');

/** A harness that is already signed in, with the profile it is given. */
const signedInAs = (profile: Record<string, unknown>, users?: unknown) => {
  const h = harness(APP_SOURCES, [...APP_IDS, '#admin', '#adminBody', '#adminBack'], {
    '/api/config': { supabase: { url: SUPA, anonKey: 'anon-key' } },
    '/api/rules': { materials: { PPGI: [0.4] }, defaultSkin: { material: 'PPGI', thickness: 0.4 }, doorTypes: [], doorCores: ['Puf'], doorHands: ['LHS'], lCutMinWallTh: 50, doorTopMinWallHeight: 3050, floorMaterials: ['PPGI'], floorLayers: [], flashingTypes: ['U Flashing'] },
    '/api/jobs': [],
    '/api/render': RENDER_REPLY,
    [`${SUPA}/auth/v1/token`]: SESSION,
    [`${SUPA}/rest/v1/profiles`]: (url: string) =>
      url.includes('order=') ? (users ?? [profile]) : [profile],
    [`${SUPA}/rest/v1/jobs`]: [],
  });
  // a kept session, so boot() signs in without anyone typing
  (h.ctx.localStorage as { setItem(k: string, v: string): void }).setItem(
    'panelcalc.session',
    JSON.stringify({ ...SESSION, expires_at: Math.floor(Date.now() / 1000) + 3600 }),
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

await t('the profile is asked for by id, not just "one row"', async () => {
  /*
   * An admin may read every profile, so `limit=1` hands them whichever row
   * comes first — which showed the administrator somebody else's expiry date
   * and no admin rights at all. It has to name the row it wants.
   */
  const admin = signedInAs({ ...PROFILE, is_admin: true });
  await settle();

  const asked = admin.reads.find(
    (u) => u.includes('/rest/v1/profiles') && u.includes('select=id,email'),
  );
  assert.ok(asked, 'the profile was never fetched');
  assert.ok(
    asked!.includes(`id=eq.${SESSION.user.id}`),
    `it must ask for its own row: ${asked}`,
  );
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

  const patch = admin.posts.slice(before).find((p) => p.url.includes('/rest/v1/profiles'));
  assert.ok(patch, 'nothing was written');
  const until = (patch!.body as { access_until: string }).access_until;
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

  const patch = admin.posts.slice(before).find((p) => p.url.includes('/rest/v1/profiles'));
  assert.ok(patch, 'nothing was written');
  const days =
    (new Date((patch!.body as { access_until: string }).access_until).getTime() - Date.now()) /
    86400000;
  assert.ok(days > 89 && days < 91, `should be about 90 days, was ${days}`);
});

console.log(`\n  ${passed} passed\n`);
