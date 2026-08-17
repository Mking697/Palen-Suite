/* Panel Calculator.
   One screen: the form on the left, the drawings and the BOQ on the right.
   Every figure comes back from the engine — nothing is computed here, and no
   BOQ number is ever formatted here, because the half-up rounding rule lives
   in core/format.ts. */

const $ = (s) => document.querySelector(s);

/**
 * Accounts, from auth.js, which the page loads before this file. Taken off
 * `window` rather than used as a bare global, because a bare global only
 * exists in a browser and this file is also run headless by
 * `core/verify/web.test.ts`. Undefined when auth.js is not there, and every
 * use is guarded — the calculator works signed out.
 */
const Auth = window.Auth;

const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of [].concat(kids)) if (kid) n.append(kid);
  return n;
};

/* ---------- state ---------- */

const WALL_IDS = ['N', 'E', 'S', 'W']; // rect edges: top, right, bottom, left
/**
 * The side a wall is met by across a partition: a wall facing north is met by
 * the south wall of the room above it. Keyed by side rather than by edge index,
 * because on a shape with more than four walls an index says nothing about
 * which way the wall faces.
 */
const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** Pick lists from core/rules.ts, filled at boot. */
let RULES = {
  materials: { PPGI: [0.4] },
  defaultSkin: { material: 'PPGI', thickness: 0.4 },
  doorTypes: [],
  doorCores: ['Puf'],
  doorHands: ['LHS', 'RHS'],
  // mirror L_CUT_MIN_WALL_TH and DOOR_TOP_MIN_WALL_HEIGHT in core/rules.ts, and
  // are replaced by the real values at boot — these fallbacks only matter if
  // /api/rules cannot be reached
  lCutMinWallTh: 50,
  doorTopMinWallHeight: 3050,
  floorMaterials: ['PPGI', 'Ply', 'AL. CHQ'],
  flashingTypes: ['U Flashing', 'L Inner Flashing', 'L Outer Flashing'],
  floorLayers: [
    { material: 'PPGI', th: 0.4 },
    { material: 'Puf', th: 0 },
    { material: 'Ply', th: 12 },
    { material: 'AL. CHQ', th: 2 },
  ],
};

/** The L cut a room gets while the estimator has not decided for itself. */
const lCutOf = (r) => r.lCut ?? (+r.wallTh > RULES.lCutMinWallTh);

/**
 * The puf core's thickness — the panel less its sheets. The form's copy of
 * `floorCoreTh` in core/rules.ts, kept here for the same reason the outline
 * geometry is: it has to be on screen as the estimator types, before any round
 * trip to the server. The engine holds the authoritative one; if these two ever
 * disagree, core/rules.ts is right.
 */
const floorCoreTh = (layers, panelTh) => {
  const sheets = layers
    .filter((l) => l.material !== 'Puf')
    .reduce((n, l) => n + (Number(l.th) || 0), 0);
  return Math.round((panelTh - sheets + Number.EPSILON) * 100) / 100;
};

const defaultSkin = () => ({ ...RULES.defaultSkin });

const newDoor = () => ({
  label: 'Flush Door (LHS) PP',
  type: 'flush',
  core: 'Puf',
  clearW: 860,
  clearH: 1980,
  moduleW: 1180,
  /** frame + leaf + frame = module, so the two are always kept in step */
  frame: 160,
  fromLeft: '',
  fromRight: '',
  /** off until the estimator says which way it is hung — see doorLabel */
  handOn: false,
  hand: 'LHS',
  chqOn: true,
  chqHeight: 600,
  liftOn: true,
  liftAboveFloor: 150,
  liftAboveGround: '',
  skinOuter: defaultSkin(),
  skinInner: defaultSkin(),
});

const newEdge = (id) => ({
  id,
  /**
   * Ticked: this wall is the partition with the room on this side, and *this*
   * room builds it. The neighbour then does not build that wall at all.
   */
  partition: false,
  /**
   * The room on the other side builds this wall, so this room does not. Set on
   * the neighbour automatically — never something the estimator ticks, which
   * is why its checkbox is disabled.
   */
  shared: false,
  /** index of the room on the other side, when there is one */
  with: null,
  door: null,
  /**
   * The whole wall is a butt joint panel: wider outer blank (+100 not +40) and
   * an inner skin 50 narrower. HI-15223's 990 wall is one.
   */
  buttJoint: false,
  /**
   * How this wall's run is broken into panels. 'auto' is the shop rule in
   * core/split.ts; the other two are the draftsman escapes, and they exist
   * because the drawings use them — never to make a total line up.
   */
  split: 'auto',
  /** split 'equal': how many equal pieces the whole run becomes */
  equalPieces: 2,
  /** split 'exact': the widths read off the drawing, as typed */
  panelsText: '',
  skinOuter: defaultSkin(),
  skinInner: defaultSkin(),
});

const newRoom = (n = 1) => ({
  name: `Room ${n}`,
  /** position on the job plan, so connected rooms are drawn touching */
  x: 0,
  y: 0,
  w: 3050,
  l: 4575,
  h: 2590,
  wallTh: 100,
  ceilTh: 100,
  /** null = follow the thickness rule; true/false = the estimator has decided */
  lCut: null,
  module: 1180,
  cornerLeg: 300,
  minPanelWidth: 150,
  splitAxis: 'l',
  floorKind: 'pufSlab',
  floorTh: 100,
  floorModule: 1220,
  /** which way the floor panels run, exactly like the ceiling's splitAxis */
  floorSplitAxis: 'w',
  /** bottom sheet, puf core, the sheet above it, top sheet */
  floorLayers: RULES.floorLayers.map((l) => ({ ...l })),
  /** the sheet the flashing is folded from */
  flashingSkin: defaultSkin(),
  /** flashing typed in on top of the three the engine works out */
  extraFlashingOn: false,
  extraFlashing: [],
  edges: WALL_IDS.map(newEdge),
  /**
   * A corner panel at each of the four outside corners. Vertex v sits between
   * wall v-1 and wall v, so a corner is shared by two walls and is ticked on
   * both of their cards. The shop does not always fit one, so each can be
   * turned off; the two walls then meet directly, the first running through.
   */
  corners: [true, true, true, true],
  /**
   * At a junction with no corner panel — and at every re-entrant corner —
   * one wall runs through and the other butts into its face. 'prev' is the
   * wall arriving at the junction, 'next' the one leaving it. Per vertex,
   * same indexing as `corners`.
   */
  through: ['prev', 'prev', 'prev', 'prev'],
  /** 'rect' | 'notch' | 'chain' — see "room outline" below */
  shape: 'rect',
  /** a rectangular bite out of one corner, used when shape is 'notch' */
  notch: null,
  /** the wall chain itself, used when shape is 'chain' */
  chain: null,
});

/* ---------- room outline ---------- */

/**
 * Every room shape is a **wall chain** underneath: a length per wall and the
 * turn taken at its end, which is exactly how a WALL PANEL LAYOUT dimensions
 * one. Any number of walls, any right-angled shape — a rectangle, an L, a U, a
 * room with three steps down one side.
 *
 * `rect` and `notch` are not different kinds of room, only quicker ways in:
 * they fill the chain and the estimator can switch to editing it wall by wall
 * at any point without losing anything.
 *
 * `core/plan.ts` holds the definitions — `chain`, `toChain`, `chainGap`,
 * `rect`, `notched` — and `core/verify/plan.test.ts` holds the geometry. This
 * is the form's copy, because the wall cards have to be laid out before a
 * round trip to the server.
 */

/** Headings in the order a right turn advances them: E, S, W, N (y is down). */
const HEADINGS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const NOTCH_CORNERS = [
  ['NE', 'Top right'],
  ['SE', 'Bottom right'],
  ['SW', 'Bottom left'],
  ['NW', 'Top left'],
];

const newNotch = () => ({ corner: 'SE', w: 1600, d: 300 });

/** Bounding-box rectangle with a bite out of one corner. */
function notchPoints(w, l, corner, nw, nd) {
  switch (corner) {
    case 'NE': return [[0, 0], [w - nw, 0], [w - nw, nd], [w, nd], [w, l], [0, l]];
    case 'SW': return [[0, 0], [w, 0], [w, l], [nw, l], [nw, l - nd], [0, l - nd]];
    case 'NW': return [[nw, 0], [w, 0], [w, l], [0, l], [0, nd], [nw, nd]];
    default: return [[0, 0], [w, 0], [w, l - nd], [w - nw, l - nd], [w - nw, l], [0, l]];
  }
}

/**
 * Walk a chain into points, shifted so the bounding box starts at the origin.
 * A room's place on the job plan is `at` and nothing else.
 *
 * `gap` is how far the walk misses its own start — [0,0] when the room closes.
 * It is returned, never corrected: HI-15223's printed chain misses by exactly
 * one wall thickness and that is a finding, not something to absorb.
 */
function walkChain(chain) {
  const walked = [];
  let x = 0;
  let y = 0;
  let h = 0;
  for (const wall of chain) {
    walked.push([x, y]);
    const n = Number(wall.length) || 0;
    x += HEADINGS[h][0] * n;
    y += HEADINGS[h][1] * n;
    h = (h + (wall.turn === 'L' ? 3 : 1)) % 4;
  }
  const ox = Math.min(...walked.map((p) => p[0]));
  const oy = Math.min(...walked.map((p) => p[1]));
  return {
    points: walked.map((p) => [p[0] - ox, p[1] - oy]),
    gap: [Math.round(x), Math.round(y)],
  };
}

/** The chain that walks a point list — the way back from rect or notch. */
function chainFrom(points) {
  const n = points.length;
  return points.map((a, i) => {
    const b = points[(i + 1) % n];
    const c = points[(i + 2) % n];
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    return {
      length: Math.round(Math.hypot(u[0], u[1])),
      turn: u[0] * v[1] - u[1] * v[0] > 0 ? 'R' : 'L',
    };
  });
}

/** The chain a room's current mode implies. */
function chainOf(r) {
  if (r.shape === 'chain') return r.chain;
  const w = +r.w;
  const l = +r.l;
  if (r.shape === 'notch' && r.notch) {
    return chainFrom(notchPoints(w, l, r.notch.corner, +r.notch.w, +r.notch.d));
  }
  return chainFrom([[0, 0], [w, 0], [w, l], [0, l]]);
}

const SIDE_OF = { N: 'Top', E: 'Right', S: 'Bottom', W: 'Left' };

/** Twice the enclosed area; its sign is the direction the outline is walked. */
function signedArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a[0] * b[1] - a[1] * b[0];
  }
  return s;
}

/**
 * Which way each wall faces. The outward normal of the edge a -> b is
 * (dy, -dx) when the outline is walked clockwise, and the other way round when
 * it is not — so the direction is taken from the enclosed area rather than
 * assumed, and a chain the estimator happens to walk anticlockwise still names
 * its walls the way the drawing does.
 */
function edgeSides(points) {
  const spin = signedArea(points) >= 0 ? 1 : -1;
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const nx = (b[1] - a[1]) * spin;
    const ny = (a[0] - b[0]) * spin;
    if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? 'E' : 'W';
    return ny > 0 ? 'S' : 'N';
  });
}

/**
 * Wall ids: N, E, S, W on a rectangle, exactly as before. A shape with more
 * walls has several facing the same way and they get numbered — the ids have
 * to stay unique, because the plan drawing looks a wall's panels up by id.
 */
function edgeIds(sides) {
  const seen = {};
  return sides.map((s) => {
    seen[s] = (seen[s] ?? 0) + 1;
    return seen[s] === 1 ? s : `${s}${seen[s]}`;
  });
}

/**
 * Vertices the outline turns *into* the room at — 270 degrees. Never a corner
 * panel: one of the two walls runs through and the other butts into its face.
 */
function reentrantAt(points) {
  const n = points.length;
  const spin = signedArea(points) >= 0 ? 1 : -1;
  const set = new Set();
  for (let v = 0; v < n; v++) {
    const a = points[(v - 1 + n) % n];
    const b = points[v];
    const c = points[(v + 1) % n];
    const u = [b[0] - a[0], b[1] - a[1]];
    const w = [c[0] - b[0], c[1] - b[1]];
    if ((u[0] * w[1] - u[1] * w[0]) * spin < 0) set.add(v);
  }
  return set;
}

/** Everything the form needs to know about a room's shape, in one place. */
function geom(r) {
  const chain = chainOf(r);
  const { points, gap } = walkChain(chain);
  const sides = edgeSides(points);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    chain,
    points,
    gap,
    closed: gap[0] === 0 && gap[1] === 0,
    sides,
    ids: edgeIds(sides),
    lengths: points.map((a, i) => {
      const b = points[(i + 1) % points.length];
      return Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
    }),
    reentrant: reentrantAt(points),
    // the ceiling and the floor are built to the bounding box, straight over
    // any notch or step — HI-15223's sheet prints one full 2530 x 3800 ceiling
    box: { w: Math.max(...xs), l: Math.max(...ys) },
  };
}

/**
 * Keep the wall, corner and through lists the same length as the outline when
 * the shape changes. A wall's door and sheets follow its id, so the top wall
 * stays the top wall through the change.
 */
function syncShape(r) {
  const g = geom(r);
  const had = r.edges;
  r.edges = g.ids.map((id) => had.find((e) => e.id === id) ?? newEdge(id));
  r.corners = g.points.map((_, v) => r.corners[v] ?? true);
  r.through = g.points.map((_, v) => r.through?.[v] ?? 'prev');
}

/** A room joined to another one — its shape cannot be edited freely yet. */
const isJoined = (r) => r.edges.some((e) => e.partition || e.shared || e.with != null);

/**
 * Add a room against one of this room's walls. The wall between them becomes
 * the partition, and it can carry a door.
 *
 * Exactly one of the two rooms prints that wall — otherwise it is either
 * counted twice or lost. Which one follows what the estimator already said:
 * if this wall is ticked as the neighbour's, the new room owns it, otherwise
 * this room keeps it. Either way the pair ends up like HI-15191, where the
 * freezer owns the 3050 partition and carries the door in it while the ante
 * room simply does not own that side.
 */
function createRoomOn(edgeIndex) {
  const parent = state.rooms[state.active];
  const g = geom(parent);
  const side = g.sides[edgeIndex];
  // the new room is a rectangle, so its walls are N, E, S, W in that order and
  // the one facing back can be taken by name
  const facing = WALL_IDS.indexOf(OPPOSITE[side]);

  // a wall can only have one room against it — go to the one already there
  const existing = partnerEdge(state.active, edgeIndex);
  if (existing) return goToRoom(parent.edges[edgeIndex].with);

  const r = newRoom(state.rooms.length + 1);
  const a = g.points[edgeIndex];
  const b = g.points[(edgeIndex + 1) % g.points.length];
  const along = g.lengths[edgeIndex];
  const horizontal = side === 'N' || side === 'S';

  // the new room matches the wall it is built against, and stands 2000 deep
  // until the estimator says otherwise
  r.w = horizontal ? along : 2000;
  r.l = horizontal ? 2000 : along;
  r.h = parent.h;
  r.wallTh = parent.wallTh;
  r.ceilTh = parent.ceilTh;
  r.lCut = parent.lCut;
  r.module = parent.module;
  r.cornerLeg = parent.cornerLeg;
  r.minPanelWidth = parent.minPanelWidth;
  r.splitAxis = parent.splitAxis;
  r.floorKind = parent.floorKind;
  r.floorTh = parent.floorTh;
  r.floorModule = parent.floorModule;
  r.floorSplitAxis = parent.floorSplitAxis;
  r.floorLayers = parent.floorLayers.map((l) => ({ ...l }));
  r.flashingSkin = { ...parent.flashingSkin };
  // extra flashing is per room and typed off the drawing, so it is not inherited

  // Sit the new room hard against that wall, so the job plan draws them
  // touching along the partition rather than as two unrelated pictures. The
  // wall's own end points are used, not the room's width and length, because
  // on a stepped room the two are not the same thing.
  const x0 = parent.x + Math.min(a[0], b[0]);
  const y0 = parent.y + Math.min(a[1], b[1]);
  if (side === 'N') { r.x = x0; r.y = y0 - r.l; }
  else if (side === 'S') { r.x = x0; r.y = y0; }
  else if (side === 'W') { r.x = x0 - r.w; r.y = y0; }
  else { r.x = x0; r.y = y0; }

  // the wall stays with the room it was drawn on; the new room does not build
  // it, and its facing wall is dropped rather than being counted twice
  parent.edges[edgeIndex].partition = true;
  parent.edges[edgeIndex].shared = false;
  r.edges[facing].shared = true;

  // record the pairing so each wall card can name its neighbour
  parent.edges[edgeIndex].with = state.rooms.length;
  r.edges[facing].with = state.active;

  state.rooms.push(r);
  state.active = state.rooms.length - 1;
  renderForm();
  refresh();
}

/** The wall on the other side of a partition, when the pair is intact. */
function partnerEdge(roomIndex, edgeIndex) {
  const room = state.rooms[roomIndex];
  const e = room?.edges[edgeIndex];
  const other = state.rooms[e?.with];
  if (!other) return null;
  // The neighbour's wall is found by which way it faces and which room it
  // names, never by its position in the list: the room across a partition can
  // be any shape, and its facing wall need not be the second or the fourth.
  const back = OPPOSITE[geom(room).sides[edgeIndex]];
  const og = geom(other);
  const oe = other.edges.find((x, i) => og.sides[i] === back && x.with === roomIndex);
  return oe ? { room: other, edge: oe } : null;
}

/**
 * Mark a wall as the partition with the room on that side.
 *
 * The room the tick is made on is the room that builds it, so the neighbour's
 * facing wall is dropped. A partition has to be built by exactly one room —
 * built twice it is bought twice, built by neither it is missing — so the two
 * sides are always set together.
 */
function setPartition(roomIndex, edgeIndex, on) {
  const e = state.rooms[roomIndex].edges[edgeIndex];
  e.partition = on;
  e.shared = false; // the room that ticks it is the room that builds it

  const p = partnerEdge(roomIndex, edgeIndex);
  if (p) {
    p.edge.shared = on;
    p.edge.partition = false;
    if (on) p.edge.door = null; // a door needs a wall that room builds
  }
}

/** Jump to the room that owns a partition, with that wall in view. */
function goToRoom(index) {
  state.active = index;
  renderForm();
  $('.form').scrollTo({ top: 0 });
}

const state = {
  jobNo: 'HI-',
  density: 40,
  rooms: [newRoom()],
  active: 0,
  lastPayload: null,
  /** the title of the one view opened off the sheet, or null for the sheet */
  openView: null,
};

/* ---------- form state -> JobSpec ---------- */

const numOrUndef = (v) => (v === '' || v == null ? undefined : Number(v));

function roomSpec(r) {
  const edges = {};
  r.edges.forEach((e, i) => {
    if (e.shared) {
      edges[i] = { shared: true };
      return;
    }
    const o = { id: e.id, skin: { outer: e.skinOuter, inner: e.skinInner } };
    if (e.door) {
      o.door = {
        label: e.door.label,
        type: e.door.type,
        core: e.door.core,
        hand: e.door.handOn ? e.door.hand : undefined,
        clearW: Number(e.door.clearW),
        clearH: Number(e.door.clearH),
        moduleW: Number(e.door.moduleW),
        frame: Number(e.door.frame),
        fromLeft: numOrUndef(e.door.fromLeft),
        fromRight: numOrUndef(e.door.fromRight),
        chqHeight: e.door.chqOn ? numOrUndef(e.door.chqHeight) : undefined,
        liftAboveFloor: e.door.liftOn ? numOrUndef(e.door.liftAboveFloor) : undefined,
        liftAboveGround: e.door.liftOn ? numOrUndef(e.door.liftAboveGround) : undefined,
        skin: { outer: e.door.skinOuter, inner: e.door.skinInner },
      };
    }
    if (e.buttJoint) o.buttJoint = true;
    // the two draftsman escapes, off the drawing — never to make a total fit
    if (e.split === 'equal' && +e.equalPieces > 0) o.equalPieces = +e.equalPieces;
    if (e.split === 'exact') {
      const list = parsePanels(e.panelsText);
      if (list.length) o.panels = list;
    }
    edges[i] = o;
  });

  const g = geom(r);

  /**
   * The ceiling is built to the bounding box, so its ends are the four sides
   * of that box. A side counts as the neighbour's only when every wall facing
   * that way is — an L-shaped room has two walls facing the same side, and
   * one of them being a partition is a case no sheet has shown yet.
   */
  const sideEnd = (side) => {
    const facing = r.edges.filter((_, i) => g.sides[i] === side);
    return facing.length && facing.every((e) => e.shared) ? 'shared' : 'own';
  };

  /**
   * Junctions. A re-entrant corner never has a corner panel and always needs a
   * through-wall; a square corner has one unless it is turned off, and then it
   * needs a through-wall too. Both are stated, neither is guessed — the engine
   * throws if either is missing.
   */
  const vertices = {};
  g.points.forEach((_, v) => {
    const through = r.through?.[v] ?? 'prev';
    if (g.reentrant.has(v)) vertices[v] = { through };
    else if (!r.corners[v]) vertices[v] = { corner: false, through };
  });

  return {
    name: r.name,
    // in chain mode the outline is the truth and the envelope follows it
    ext: { w: g.box.w, l: g.box.l, h: +r.h },
    wallTh: +r.wallTh,
    ceilTh: +r.ceilTh,
    // the effective value, not the tick — what the form shows and what the
    // engine builds are then the same thing by construction
    lCut: lCutOf(r),
    flashingSkin: { ...r.flashingSkin },
    // a length of nothing is a row still being typed, so it is not sent
    ...(r.extraFlashingOn && r.extraFlashing.some((x) => +x.length > 0)
      ? {
          extraFlashing: r.extraFlashing
            .filter((x) => +x.length > 0)
            .map((x) => ({
              type: x.type,
              material: x.material,
              thickness: +x.thickness,
              width: +x.width,
              length: +x.length,
            })),
        }
      : {}),
    module: +r.module,
    cornerLeg: +r.cornerLeg,
    minPanelWidth: +r.minPanelWidth,
    maxSplitPieces: 2,
    floor:
      r.floorKind === 'panelised'
        ? {
            kind: 'panelised',
            th: +r.floorTh,
            module: +r.floorModule,
            splitAxis: r.floorSplitAxis,
            // the engine prints the build-up; desc is the fallback for a job
            // that states one instead, which is how the verified jobs are held
            layers: r.floorLayers.map((l) => ({
              material: l.material,
              // the core is derived from the others, never typed in
              th: l.material === 'Puf' ? floorCoreTh(r.floorLayers, +r.floorTh) : +l.th,
            })),
            desc: 'Bottom PPGI + Puf + 12 mm Ply + 2mm AL. CHQ',
          }
        : { kind: 'pufSlab', th: +r.floorTh, desc: 'Puf Slab With Single Layer Tarfelt.' },
    // the ceiling notch and the floor's clear span both follow from which
    // walls this room owns, so marking a wall shared is all the user does
    ceiling: {
      splitAxis: r.splitAxis,
      wEnds: [sideEnd('W'), sideEnd('E')],
      lEnds: [sideEnd('N'), sideEnd('S')],
    },
    at: [+r.x, +r.y],
    outline: {
      points: g.points,
      edges,
      ...(Object.keys(vertices).length ? { vertices } : {}),
    },
    walls: [],
    ...(r.labels ? { labels: r.labels } : {}),
    ...(r.boqGroup ? { boqGroup: r.boqGroup } : {}),
  };
}

/** "1180, 240 200" -> [1180, 240, 200]. Anything unreadable is dropped. */
function parsePanels(text) {
  return String(text ?? '')
    .split(/[^0-9.]+/)
    .map(Number)
    .filter((n) => n > 0);
}

const jobSpec = () => ({
  jobNo: state.jobNo || 'JOB',
  density: +state.density,
  rooms: state.rooms.map(roomSpec),
});

/* ---------- form ---------- */

function field(label, value, onInput, opts = {}) {
  const input = el('input', {
    type: opts.type ?? 'number',
    value: value ?? '',
    ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
  });
  input.addEventListener('input', () => onInput(input.value));
  return el('label', { class: 'f' }, [
    el('span', { text: label }),
    opts.unit ? el('i', { class: 'unit-tag', text: opts.unit }) : null,
    input,
  ]);
}

function select(label, value, options, onChange) {
  const sel = el('select', {});
  for (const [v, t] of options) {
    sel.append(el('option', { value: v, text: t, ...(v === value ? { selected: true } : {}) }));
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'f' }, [el('span', { text: label }), sel]);
}

/**
 * Material + thickness pair. Changing the material re-picks the thickness from
 * that material's own list, because 0.4 does not exist for HPCL.
 */
function skinPicker(label, skin, onChange) {
  const mats = Object.keys(RULES.materials);
  const mat = el('select', {});
  for (const m of mats) {
    mat.append(el('option', { value: m, text: m, ...(m === skin.material ? { selected: true } : {}) }));
  }
  const th = el('select', {});
  const fillTh = () => {
    th.replaceChildren();
    for (const t of RULES.materials[skin.material] ?? [0.4]) {
      th.append(
        el('option', { value: t, text: `${t}mm`, ...(t === skin.thickness ? { selected: true } : {}) }),
      );
    }
  };
  fillTh();

  mat.addEventListener('change', () => {
    skin.material = mat.value;
    const list = RULES.materials[skin.material] ?? [0.4];
    if (!list.includes(skin.thickness)) skin.thickness = list[0];
    fillTh();
    onChange();
  });
  th.addEventListener('change', () => {
    skin.thickness = Number(th.value);
    onChange();
  });

  return el('div', { class: 'skin' }, [
    el('span', { text: label }),
    el('div', { class: 'skin-pair' }, [mat, th]),
  ]);
}

function toggle(label, checked, onChange, cls = '', disabled = false) {
  const box = el('input', {
    type: 'checkbox',
    ...(checked ? { checked: true } : {}),
    ...(disabled ? { disabled: true } : {}),
  });
  box.addEventListener('change', () => onChange(box.checked));
  return el('label', { class: `chk ${cls}${disabled ? ' is-locked' : ''}` }, [
    box,
    el('span', { text: label }),
  ]);
}

/**
 * A flashing the estimator adds by hand. It starts on the room's own flashing
 * sheet and width, because that is the common case; both can be changed on the
 * row, since an extra flashing is often a different gauge.
 */
const newExtraFlashing = (r) => ({
  type: RULES.flashingTypes[0],
  material: r.flashingSkin.material,
  thickness: r.flashingSkin.thickness,
  width: +r.wallTh + 2,
  length: '',
});

/**
 * The typed flashing rows. Any number of them, added and removed one at a time.
 * Nothing here is derived — every figure goes to the sheet as entered, and the
 * flashing table marks these apart from the three the engine works out.
 */
function extraFlashingList(r) {
  const rows = r.extraFlashing.map((x, i) => {
    const del = el('button', {
      class: 'chain-del',
      type: 'button',
      text: '×',
      title: 'remove this flashing',
    });
    del.addEventListener('click', () => {
      r.extraFlashing.splice(i, 1);
      renderForm();
      refresh();
    });

    return el('div', { class: 'extra-flash' }, [
      el('div', { class: 'extra-flash-head' }, [
        select(
          '',
          x.type,
          RULES.flashingTypes.map((t) => [t, t]),
          (v) => {
            x.type = v;
            refresh();
          },
        ),
        del,
      ]),
      skinPicker('Sheet', x, refresh),
      el('div', { class: 'row2' }, [
        field('Width', x.width, (v) => {
          x.width = v;
          refresh();
        }, { unit: 'mm' }),
        field('Length', x.length, (v) => {
          x.length = v;
          refresh();
        }, { unit: 'mm' }),
      ]),
    ]);
  });

  const add = el('button', { class: 'add-room', type: 'button', text: '+ Flashing' });
  add.addEventListener('click', () => {
    r.extraFlashing.push(newExtraFlashing(r));
    renderForm();
    refresh();
  });

  return el('div', { class: 'build-up' }, [
    el('p', {
      class: 'hint',
      text: 'Length is what the running metre counts. Add as many as the job needs.',
    }),
    ...rows,
    add,
  ]);
}

/** Bottom up, the way the sheet prints it. */
const FLOOR_LAYER_LABELS = ['Bottom sheet', 'Core', 'Above the core', 'Top sheet'];

/**
 * The four layers of a panelised floor panel. The ply is not fixed — the shop
 * also builds inner ply + chequered sheet, or outer ply + SS — so every layer
 * picks its own material and thickness. The core is shown but not editable:
 * its thickness is the floor thickness above, and stating it twice is how a
 * sheet ends up disagreeing with itself.
 */
function floorBuildUp(r) {
  const core = floorCoreTh(r.floorLayers, +r.floorTh);
  const sheets = Math.round((+r.floorTh - core + Number.EPSILON) * 100) / 100;
  const rows = r.floorLayers.map((layer, i) => {
    if (i === 1) {
      return el('label', { class: 'f' }, [
        el('span', { text: FLOOR_LAYER_LABELS[i] }),
        el('div', {
          class: `derived${core > 0 ? '' : ' is-bad'}`,
          text: `${layer.material} · ${core} mm`,
        }),
      ]);
    }
    return el('div', { class: 'row2' }, [
      select(
        FLOOR_LAYER_LABELS[i],
        layer.material,
        RULES.floorMaterials.map((m) => [m, m]),
        (v) => {
          layer.material = v;
          refresh();
        },
      ),
      field(
        'Thickness',
        layer.th,
        (v) => {
          layer.th = v;
          refresh();
        },
        { unit: 'mm' },
      ),
    ]);
  });

  return el('div', { class: 'build-up' }, [
    el('h4', { text: 'Floor build-up' }),
    el('p', {
      class: 'hint',
      text:
        'Every layer of the floor panel, bottom up, with its own thickness. All of them ' +
        'print on the sheet. The panel stays the floor thickness — a thicker sheet thins ' +
        'the core, it does not make the panel deeper.',
    }),
    ...rows,
    core > 0
      ? null
      : el('p', {
          class: 'bad-note',
          text:
            `The sheets come to ${sheets} mm, more than the ${r.floorTh} mm panel, so ` +
            `there is no core left. Thin a sheet, or make the floor thicker.`,
        }),
  ]);
}

function renderForm() {
  const f = $('#form');
  const r = state.rooms[state.active];

  /* room tabs */
  const tabs = el('div', { class: 'room-tabs' });
  state.rooms.forEach((room, i) => {
    const b = el('button', {
      class: `room-tab${i === state.active ? ' is-active' : ''}`,
      type: 'button',
      text: room.name || `Room ${i + 1}`,
    });
    b.addEventListener('click', () => {
      state.active = i;
      renderForm();
    });
    tabs.append(b);
  });
  const addBtn = el('button', { class: 'room-tab add', type: 'button', text: '+ Room' });
  addBtn.addEventListener('click', () => {
    // a room added here shares no wall, so it stands clear of the others on
    // the layout instead of being drawn on top of them
    const room = newRoom(state.rooms.length + 1);
    room.x = Math.max(0, ...state.rooms.map((o) => o.x + o.w)) + 2000;
    state.rooms.push(room);
    state.active = state.rooms.length - 1;
    renderForm();
    refresh();
  });
  tabs.append(addBtn);

  const set = (k) => (v) => {
    r[k] = v;
    refresh();
  };
  const setRedraw = (k) => (v) => {
    r[k] = v;
    renderForm();
    refresh();
  };

  const parts = [tabs];

  /* room identity + size */
  const shape = geom(r);
  const head = el('div', { class: 'group' }, [
    el('h3', { text: 'Room' }),
    field('Room name', r.name, setRedraw('name'), { type: 'text' }),
    r.shape === 'chain'
      ? el('div', { class: 'row3' }, [
          // the chain is the truth here, so the envelope is read off it
          el('label', { class: 'f' }, [
            el('span', { text: 'Width' }),
            el('div', { class: 'derived', text: `${shape.box.w} mm` }),
          ]),
          el('label', { class: 'f' }, [
            el('span', { text: 'Length' }),
            el('div', { class: 'derived', text: `${shape.box.l} mm` }),
          ]),
          field('Height', r.h, set('h'), { unit: 'mm' }),
        ])
      : el('div', { class: 'row3' }, [
          field('Width', r.w, setRedraw('w'), { unit: 'mm' }),
          field('Length', r.l, setRedraw('l'), { unit: 'mm' }),
          field('Height', r.h, set('h'), { unit: 'mm' }),
        ]),
    el('p', {
      class: 'hint',
      text:
        r.shape === 'chain'
          ? 'External envelope, read off the wall chain below. The ceiling and floor are built to it.'
          : 'External envelope. Walls are worked out from this.',
    }),
    /*
     * There was a "BOQ group" field here. It is gone because it did nothing:
     * `RoomSpec.boqGroup` is declared and the form sent it, but `buildJob` in
     * core/boq.ts maps rooms one to one and never reads it. Merging two rooms
     * into one printed block is Phase 3 work — see DESIGN.md — and a control
     * that quietly does nothing is worse than no control. A job file that
     * carries the field still round trips through the form untouched.
     */
  ]);
  if (state.rooms.length > 1) {
    const del = el('button', { class: 'link-del', type: 'button', text: 'Remove this room' });
    del.addEventListener('click', () => {
      const gone = state.active;
      state.rooms.splice(gone, 1);
      // partitions point at rooms by index, so drop the ones that pointed at
      // this room and shift the rest down. A wall it used to own comes back to
      // whoever is left on the other side.
      for (const room of state.rooms) {
        for (const edge of room.edges) {
          if (edge.with === gone) {
            edge.with = null;
            edge.shared = false;
          } else if (edge.with > gone) {
            edge.with -= 1;
          }
        }
      }
      state.active = Math.max(0, gone - 1);
      renderForm();
      refresh();
    });
    head.append(del);
  }
  parts.push(head);

  /* shape — rectangle, notch, or the wall chain itself */
  const joined = isJoined(r);
  const shapeGroup = el('div', { class: 'group' }, [
    el('h3', { text: 'Shape' }),
    select(
      'Room shape',
      r.shape,
      [
        ['rect', 'Rectangle'],
        ['notch', 'Rectangle with a notch (L)'],
        ['chain', 'Custom — wall by wall'],
      ],
      (v) => {
        // switching never loses the shape: the chain is seeded from whatever
        // was on screen, so Custom starts exactly where Rectangle left off
        if (v === 'chain') r.chain = geom(r).chain;
        if (v === 'notch' && !r.notch) r.notch = newNotch();
        r.shape = v;
        syncShape(r);
        renderForm();
        refresh();
      },
    ),
  ]);

  if (r.shape === 'notch') {
    const setN = (k) => (v) => {
      r.notch[k] = v;
      syncShape(r);
      renderForm();
      refresh();
    };
    shapeGroup.append(
      select('Corner cut away', r.notch.corner, NOTCH_CORNERS, setN('corner')),
      el('div', { class: 'row2' }, [
        field('Notch width', r.notch.w, setN('w'), { unit: 'mm' }),
        field('Notch depth', r.notch.d, setN('d'), { unit: 'mm' }),
      ]),
      el('p', {
        class: 'hint',
        text: 'Width and length above stay the whole rectangle — the ceiling and floor are built to it, straight over the notch.',
      }),
    );
  }

  if (r.shape === 'chain') {
    const chainBox = el('div', { class: 'chain' });
    const redraw = () => {
      syncShape(r);
      renderForm();
      refresh();
    };

    r.chain.forEach((wall, i) => {
      const row = el('div', { class: 'chain-row' }, [
        el('b', { class: 'chain-id', text: shape.ids[i] ?? `W${i + 1}` }),
        field('', wall.length, (v) => {
          wall.length = v;
          syncShape(r);
          renderForm();
          refresh();
        }, { unit: 'mm' }),
        select('', wall.turn, [['R', 'then turn right'], ['L', 'then turn left']], (v) => {
          wall.turn = v;
          redraw();
        }),
      ]);
      // a chain of three walls cannot enclose anything
      if (r.chain.length > 3) {
        const del = el('button', { class: 'chain-del', type: 'button', text: '×', title: 'remove this wall' });
        del.addEventListener('click', () => {
          r.chain.splice(i, 1);
          redraw();
        });
        row.append(del);
      }
      chainBox.append(row);
    });

    const add = el('button', { class: 'add-room', type: 'button', text: '+ Wall' });
    add.addEventListener('click', () => {
      r.chain.push({ length: 1000, turn: 'R' });
      redraw();
    });

    shapeGroup.append(
      el('p', {
        class: 'hint',
        text: 'Walk the outline the way the drawing dimensions it: a length, then which way it turns. Any number of walls, any right-angled shape.',
      }),
      chainBox,
      add,
      shape.closed
        ? el('p', { class: 'chain-ok', text: `Closes exactly · ${shape.box.w} × ${shape.box.l} mm` })
        : el('p', {
            class: 'chain-gap',
            text:
              `Does not close — the walk ends ${Math.abs(shape.gap[0])} mm ` +
              `${shape.gap[0] > 0 ? 'right' : 'left'} and ${Math.abs(shape.gap[1])} mm ` +
              `${shape.gap[1] > 0 ? 'down' : 'up'} of where it started. ` +
              `Check the lengths against the drawing — nothing is adjusted to make it fit.`,
          }),
    );
  }
  parts.push(shapeGroup);

  if (joined && r.shape !== 'rect') {
    shapeGroup.append(
      el('p', {
        class: 'hint',
        text: 'This room shares a wall with another one. Changing its shape moves that wall — check the partition afterwards.',
      }),
    );
  }

  /* build-up */
  parts.push(
    el('div', { class: 'group' }, [
      el('h3', { text: 'Build-up' }),
      el('div', { class: 'row2' }, [
        field('Wall thickness', r.wallTh, set('wallTh'), { unit: 'mm' }),
        field('Ceiling thickness', r.ceilTh, set('ceilTh'), { unit: 'mm' }),
      ]),
      el('div', { class: 'row3' }, [
        field('Panel module', r.module, set('module'), { unit: 'mm' }),
        field('Corner leg', r.cornerLeg, set('cornerLeg'), { unit: 'mm' }),
        field('Min panel', r.minPanelWidth, set('minPanelWidth'), { unit: 'mm' }),
      ]),
      select('Ceiling panels run along', r.splitAxis, [['w', 'Width'], ['l', 'Length']], set('splitAxis')),
      toggle('L cut', lCutOf(r), (v) => {
        r.lCut = v;
        renderForm();
        refresh();
      }),
      el('p', {
        class: 'hint',
        text:
          `Fitted by default above ${RULES.lCutMinWallTh}mm. Untick it and the ` +
          `inner skins run the full height, the corner inner matches its outer, ` +
          `and the ceiling runs the full external size.`,
      }),
    ]),
  );

  /* floor */
  parts.push(
    el('div', { class: 'group' }, [
      el('h3', { text: 'Floor' }),
      select(
        'Type',
        r.floorKind,
        [['pufSlab', 'Puf slab (one piece)'], ['panelised', 'Panelised + ply']],
        setRedraw('floorKind'),
      ),
      el('div', { class: 'row2' }, [
        field('Floor thickness', r.floorTh, set('floorTh'), { unit: 'mm' }),
        r.floorKind === 'panelised'
          ? field('Floor module', r.floorModule, set('floorModule'), { unit: 'mm' })
          : null,
      ]),
      // a one-piece slab is not split, so it has no direction to run in
      r.floorKind === 'panelised'
        ? select(
            'Floor panels run along',
            r.floorSplitAxis,
            [['w', 'Width'], ['l', 'Length']],
            set('floorSplitAxis'),
          )
        : null,
      r.floorKind === 'panelised' ? floorBuildUp(r) : null,
    ]),
  );

  /* flashing */
  parts.push(
    el('div', { class: 'group' }, [
      el('h3', { text: 'Flashing' }),
      el('p', {
        class: 'hint',
        text:
          `Inner, outer and U on every job. Running metre is both widths plus both ` +
          `lengths; a butt joint adds one wall height of inner and one of outer. ` +
          `Width is the wall thickness plus 2 — ${+r.wallTh + 2} mm here.`,
      }),
      skinPicker('Flashing sheet', r.flashingSkin, refresh),
      toggle('Add extra flashing', r.extraFlashingOn, (v) => {
        r.extraFlashingOn = v;
        // one empty row to start on, so the tick has something to fill in
        if (v && !r.extraFlashing.length) r.extraFlashing.push(newExtraFlashing(r));
        renderForm();
        refresh();
      }),
      r.extraFlashingOn ? extraFlashingList(r) : null,
    ]),
  );

  /* walls */
  const wallsGroup = el('div', { class: 'group' }, [
    el('h3', { text: 'Walls' }),
    el('p', {
      class: 'hint',
      text: 'Tick "neighbour’s wall" where another room owns that side — it removes the wall and the corner panels at both its ends.',
    }),
  ]);

  const n = r.edges.length;

  r.edges.forEach((e, i) => {
    const addRoom = el('button', { class: 'add-room', type: 'button', text: '+ Room on this side' });
    addRoom.addEventListener('click', () => createRoomOn(i));

    const card = el('div', { class: `wall${e.shared ? ' is-shared' : ''}` }, [
      el('div', { class: 'wall-head' }, [
        el('b', { text: `${e.id} · ${SIDE_OF[shape.sides[i]]}` }),
        el('span', { class: 'wall-len', text: `${shape.lengths[i]} mm` }),
      ]),
      el('div', { class: 'wall-toggles' }, [
        // on the neighbour's side this is decided already, so it is shown
        // ticked and locked rather than hidden
        toggle(
          'Shared with neighbour',
          e.partition || e.shared,
          (v) => {
            setPartition(state.active, i, v);
            renderForm();
            refresh();
          },
          '',
          e.shared,
        ),
        toggle(
          'Door',
          !!e.door,
          (v) => {
            e.door = v ? newDoor() : null;
            renderForm();
            refresh();
          },
          'door',
          e.shared,
        ),
      ]),
      // a room can only be added on a side the form can still square up
      e.shared || r.shape === 'chain' ? null : addRoom,
    ]);

    /**
     * What happens at each end of this wall. A square corner gets a corner
     * panel unless it is turned off; a re-entrant one never does. Either way,
     * once there is no corner panel the two walls meet directly and one has to
     * run through — so the same control appears, and nothing is assumed.
     *
     * A junction belongs to two walls, so it shows on both of their cards.
     */
    if (!e.shared) {
      const ends = [
        [i, 'start'],
        [(i + 1) % n, 'end'],
      ];
      const junctions = el('div', { class: 'corners' });

      /** what this end costs this wall, stated rather than left to be worked out */
      const endNote = (text) => el('p', { class: 'hint end-note', text });

      for (const [v, where] of ends) {
        const square = !shape.reentrant.has(v);
        if (square) {
          junctions.append(
            toggle(`Corner at ${where} · ${r.cornerLeg}`, r.corners[v], (on) => {
              r.corners[v] = on;
              renderForm();
              refresh();
            }, 'corner'),
          );
        }
        if (square && r.corners[v]) {
          junctions.append(
            endNote(`Corner panel at the ${where} — ${e.id} gives up ${r.cornerLeg} mm here.`),
          );
          continue;
        }

        // no corner panel here: name the wall that runs through
        const prevWall = shape.ids[(v - 1 + n) % n];
        const nextWall = shape.ids[v];
        junctions.append(
          select(
            square
              ? `No corner at ${where} — the wall running through is`
              : `Re-entrant at ${where} — the wall running through is`,
            r.through?.[v] ?? 'prev',
            [
              ['prev', `${prevWall} — ${nextWall} butts into its face`],
              ['next', `${nextWall} — ${prevWall} butts into its face`],
            ],
            (val) => {
              r.through[v] = val;
              renderForm();
              refresh();
            },
          ),
        );

        // where a butt joint lands there is no corner panel — the two never
        // share an end, so the card says which one this is
        const through = r.through?.[v] ?? 'prev';
        const butts = where === 'start' ? through === 'prev' : through === 'next';
        junctions.append(
          endNote(
            butts
              ? `Butt joint at the ${where}, no corner panel — ${e.id} gives up ${r.wallTh} mm here.`
              : `No corner panel at the ${where} — ${e.id} runs straight through and gives up nothing.`,
          ),
        );
      }
      card.append(junctions);
    }

    // name the room on the other side, say who prints the wall, and offer a
    // way over there
    const mate = state.rooms[e.with];
    if (mate && mate !== r) {
      const note = el('p', { class: 'partition' }, [
        el('span', {
          text: e.shared
            ? `Partition — ${mate.name} builds it`
            : `Partition with ${mate.name} — this room builds it`,
        }),
      ]);
      const jump = el('button', {
        class: 'link-go',
        type: 'button',
        text: `open ${mate.name} →`,
      });
      jump.addEventListener('click', () => goToRoom(e.with));
      note.append(jump);
      card.append(note);
    }

    if (e.shared) {
      card.append(
        el('p', {
          class: 'hint shared-note',
          text: mate
            ? `${mate.name} builds this wall, so it is not built again here. Untick it over there to move it to this room.`
            : 'The room on the other side builds this wall, so it is not built again here.',
        }),
      );
    } else {
      // nothing is hidden — every wall this room builds keeps all its controls
      card.append(
        el('div', { class: 'skins' }, [
          skinPicker('Outer sheet', e.skinOuter, refresh),
          skinPicker('Inner sheet', e.skinInner, refresh),
        ]),
        toggle('Butt joint panel', e.buttJoint, (v) => {
          e.buttJoint = v;
          renderForm();
          refresh();
        }, 'butt'),
        select(
          'Panel split',
          e.split,
          [
            ['auto', 'Auto — the shop rule'],
            ['equal', 'Equal pieces'],
            ['exact', 'Exact widths off the drawing'],
          ],
          (v) => {
            e.split = v;
            renderForm();
            refresh();
          },
        ),
      );

      if (e.split === 'equal') {
        card.append(
          field('Pieces', e.equalPieces, (v) => {
            e.equalPieces = v;
            refresh();
          }),
        );
      }
      if (e.split === 'exact') {
        const list = parsePanels(e.panelsText);
        const sum = list.reduce((a, b) => a + b, 0);
        card.append(
          field('Widths', e.panelsText, (v) => {
            e.panelsText = v;
            renderForm();
            refresh();
          }, { type: 'text', placeholder: '1180, 240, 200' }),
          el('p', {
            class: 'hint',
            text: list.length
              ? `${list.join(' + ')} = ${sum} mm. It must add up to the wall's run or the build stops.`
              : 'Type the widths the drawing prints, separated by commas.',
          }),
        );
      }
      if (e.split !== 'auto') {
        card.append(
          el('p', {
            class: 'override',
            text: 'Use this only when the drawing shows it. Reaching for it to make a total line up is the one thing that makes this engine worthless.',
          }),
        );
      }
    }

    if (e.door) {
      const d = e.door;
      const setD = (k) => (v) => {
        d[k] = v;
        refresh();
      };
      card.append(
        el('div', { class: 'door-box' }, [
          field('Door label', d.label, setD('label'), { type: 'text' }),
          el('div', { class: 'row2' }, [
            select(
              'Door type',
              d.type,
              RULES.doorTypes.map((t) => [t.key, t.thickness ? `${t.label} (${t.thickness}mm)` : t.label]),
              setD('type'),
            ),
            select('Core', d.core, RULES.doorCores.map((c) => [c, c]), setD('core')),
          ]),
          el('div', { class: 'skins' }, [
            skinPicker('Door outer', d.skinOuter, refresh),
            skinPicker('Door inner', d.skinInner, refresh),
          ]),
          // frame + leaf + frame must fill the module, so editing either one
          // moves the other — otherwise the drawing and the blank size would
          // describe two different doors
          el('div', { class: 'row3' }, [
            field('Module taken', d.moduleW, (v) => {
              d.moduleW = v;
              d.clearW = Math.max(0, Number(v) - 2 * Number(d.frame));
              renderForm();
              refresh();
            }, { unit: 'mm' }),
            field('Frame each side', d.frame, (v) => {
              d.frame = v;
              d.clearW = Math.max(0, Number(d.moduleW) - 2 * Number(v));
              renderForm();
              refresh();
            }, { unit: 'mm' }),
            field('Leaf / clear width', d.clearW, (v) => {
              d.clearW = v;
              d.frame = Math.max(0, Math.round((Number(d.moduleW) - Number(v)) / 2));
              renderForm();
              refresh();
            }, { unit: 'mm' }),
          ]),
          el('p', {
            class: 'hint',
            text: `${d.frame} + ${d.clearW} + ${d.frame} = ${Number(d.frame) * 2 + Number(d.clearW)} of ${d.moduleW}. The BOQ blanks the door off the leaf.`,
          }),
          field('Clear height', d.clearH, setD('clearH'), { unit: 'mm' }),
          // the piece over the door is a panel of its own only on a tall wall
          +r.h > RULES.doorTopMinWallHeight
            ? el('p', {
                class: 'hint',
                text:
                  `Wall is over ${RULES.doorTopMinWallHeight}mm, so a Door Top Panel of ` +
                  `${d.moduleW} x ${Math.max(0, +r.h - +d.clearH)} mm is made over the door ` +
                  `and priced on its own row.`,
              })
            : el('p', {
                class: 'hint',
                text:
                  `Up to ${RULES.doorTopMinWallHeight}mm of wall the door assembly is the ` +
                  `full height and there is no separate top panel.`,
              }),

          el('div', { class: 'row2' }, [
            field('From left', d.fromLeft, setD('fromLeft'), { unit: 'mm', placeholder: 'auto' }),
            field('From right', d.fromRight, setD('fromRight'), { unit: 'mm', placeholder: 'auto' }),
          ]),
          el('p', {
            class: 'hint',
            text: 'Leave both blank and the drawing centres the door. The BOQ is the same either way.',
          }),

          // which hand the door is hung on. Off, the label is printed exactly
          // as typed and the plan draws no swing — a swing nobody stated would
          // be the drawing inventing a fact about the building.
          toggle('Door opens from', d.handOn, (v) => {
            d.handOn = v;
            renderForm();
            refresh();
          }, 'chq'),
          d.handOn
            ? select(
                'Hand',
                d.hand,
                RULES.doorHands.map((h) => [
                  h,
                  h === 'LHS' ? 'LHS — Left hand side' : 'RHS — Right hand side',
                ]),
                setD('hand'),
              )
            : null,
          d.handOn
            ? el('p', {
                class: 'hint',
                text: 'The label\'s own (LHS)/(RHS) follows this, and the plan draws the leaf swinging into the room from that end.',
              })
            : null,

          // chequered sheet up the leaf
          toggle('AL. CHQ. sheet', d.chqOn, (v) => {
            d.chqOn = v;
            renderForm();
            refresh();
          }, 'chq'),
          d.chqOn
            ? field('Up from the bottom', d.chqHeight, setD('chqHeight'), { unit: 'mm' })
            : null,

          // door lift
          toggle('Door lift', d.liftOn, (v) => {
            d.liftOn = v;
            renderForm();
            refresh();
          }, 'chq'),
          d.liftOn
            ? el('div', { class: 'row2' }, [
                field('Above puf slab', d.liftAboveFloor, setD('liftAboveFloor'), { unit: 'mm' }),
                field('Above ground', d.liftAboveGround, setD('liftAboveGround'), {
                  unit: 'mm',
                  placeholder: 'optional',
                }),
              ])
            : null,
          d.liftOn
            ? el('p', {
                class: 'hint',
                text: 'Two separate figures, as the drawing states them — the slab is not assumed to be the whole difference.',
              })
            : null,
        ]),
      );
    }

    wallsGroup.append(card);
  });

  parts.push(wallsGroup);
  f.replaceChildren(...parts);
}

/* ---------- output ---------- */

let timer = null;
function refresh() {
  clearTimeout(timer);
  timer = setTimeout(render, 220);
}

async function render() {
  const spec = jobSpec();
  const res = await fetch('/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(spec),
  });
  const data = await res.json();

  const out = $('#out');
  if (!res.ok) {
    out.replaceChildren(
      el('p', { class: 'error', text: data.error }),
      el('p', { class: 'hint', text: 'Fix the input above — nothing is guessed to make it work.' }),
    );
    return;
  }
  state.lastPayload = { spec, data };

  const g = data.grand;
  const card = (label, value, unit) =>
    el('div', { class: 'card' }, [
      el('small', { text: label }),
      el('b', {}, unit ? [document.createTextNode(value), el('em', { text: unit })] : [value]),
    ]);

  const parts = [
    el('div', { class: 'summary' }, [
      card('Panels', String(g.panelQty)),
      card('PPGI skins', String(g.ppgiQty)),
      ...(g.plyQty ? [card('PLY 12mm', String(g.plyQty))] : []),
      card('Chemical', g.chemWeightText, 'kg'),
      card('Area', g.areaSqmtText, 'm²'),
    ]),
  ];

  // walls handed to a neighbour that is not there to take them. The totals
  // above are short by exactly those panels, so this sits directly under them
  // rather than at the bottom of the page.
  if (data.problems?.length) {
    parts.push(
      el('section', { class: 'problems' }, [
        el('h3', {
          text:
            data.problems.length === 1
              ? '1 wall is in nobody’s BOQ'
              : `${data.problems.length} walls are in nobody’s BOQ`,
        }),
        el(
          'ul',
          {},
          data.problems.map((p) => el('li', { text: p.message })),
        ),
        el('p', {
          class: 'hint',
          text: 'The figures above are short by those panels. Nothing is guessed to fill the gap.',
        }),
      ]),
    );
  }

  // Every view of the job on one canvas, the way a drawing office issues a
  // sheet. The individual pictures are still exportable one by one underneath —
  // the drawing office asks for a single view's DXF often enough to keep it.
  if (data.sheet?.drawable) {
    const dxf = el('button', { class: 'btn', type: 'button', text: 'DXF — whole sheet' });
    dxf.addEventListener('click', () => downloadSheetDxf(data.jobNo));

    // 2D is the default and stays the drawing of record; 3D is for reading the
    // job, not for issuing it, so nothing exports from there
    const seg = el('div', { class: 'seg' });
    for (const [mode, label] of [[false, '2D'], [true, '3D']]) {
      const b = el('button', {
        class: `seg-btn${view3d.on === mode ? ' is-on' : ''}`,
        type: 'button',
        text: label,
      });
      b.addEventListener('click', () => {
        if (view3d.on === mode) return;
        view3d.on = mode;
        render();
      });
      seg.append(b);
    }

    const open = openView(data);
    const holder = el('div', { class: 'draw-svg' });
    if (!view3d.on) {
      // server-built markup, and none of it came from the form
      holder.innerHTML = open ? open.svg : data.sheet.svg;
      if (!open) {
        holder.classList.add('is-clickable');
        holder.addEventListener('click', (e) => {
          const hit = cellAt(holder, data.sheet.cells, e);
          if (!hit) return;
          state.openView = hit.title;
          render();
        });
      }
    }

    const back = el('button', { class: 'btn ghost', type: 'button', text: '← All views' });
    back.addEventListener('click', () => {
      state.openView = null;
      render();
    });

    const head = view3d.on
      ? { title: `${data.jobNo} — 3D LAYOUT`, sub: 'The same panels the sheet prices, stood up' }
      : open
        ? { title: open.title, sub: open.subtitle || 'One view, full size' }
        : { title: data.sheet.title, sub: data.sheet.subtitle };

    parts.push(
      el('section', { class: 'block draw sheet' }, [
        el('div', { class: 'draw-head' }, [
          el('div', {}, [el('h3', { text: head.title }), el('p', { text: head.sub })]),
          el('div', { class: 'draw-tools' }, [
            !view3d.on && open ? back : null,
            seg,
            view3d.on ? null : dxf,
          ]),
        ]),
        view3d.on ? viewer3d(data) : holder,
        view3d.on || open ? null : drawingDownloads(data),
      ]),
    );
  } else if (data.sheet) {
    parts.push(el('p', { class: 'error', text: data.sheet.reason }));
  }

  // a room the engine cannot draw is left off the sheet, so it says why here
  data.blocks.forEach((block, i) => {
    const room = data.drawings[i];
    if (room && !room.drawable) {
      parts.push(
        el('p', { class: 'error', text: `${room.name ?? block.title}: ${room.reason}` }),
      );
    }
  });
  if (data.layout && !data.layout.drawable) {
    parts.push(el('p', { class: 'error', text: data.layout.reason }));
  }

  // then every room's BOQ together, the way the production sheet prints it
  parts.push(el('h2', { class: 'room-head boq-head', text: 'SHEET FABRICATION' }));
  data.blocks.forEach((block, i) => {
    parts.push(boqBlock(block, data.drawings[i]?.name));
  });
  parts.push(grandTotal(data));

  // bought by the running metre, so it is its own table and its own total
  if (data.flashing?.rooms?.length) parts.push(flashingBlock(data.flashing));

  out.replaceChildren(...parts);
}

const COLS = [
  ['desc', 'Description'],
  ['panel', 'Panel Size'],
  ['blank', 'Blank Size'],
  ['panelQty', 'Sheet Panel'],
  ['skin', 'Sheet'],
  ['ppgiQty', 'Sheet Qty'],
  ['plyQty', 'PLY 12mm'],
  ['thk', 'Thk'],
  ['chem', 'Chemical Wt (kg)'],
  ['area', 'Area Sqmt'],
];

const size = (a, b) => (a && b ? `${a} x ${b}` : '');
const num = (v) => (v ? String(v) : '');

function boqBlock(block, roomName) {
  const thead = el('thead', {}, [
    el('tr', {}, COLS.map(([k, label]) => el('th', { class: k === 'desc' ? 'desc' : '', text: label }))),
  ]);

  const tbody = el(
    'tbody',
    {},
    block.rows.map((r) =>
      el('tr', {}, [
        el('td', { class: 'desc', text: r.desc }),
        el('td', { class: 'num', text: size(r.panelW, r.panelL) }),
        el('td', { class: 'num', text: size(r.blankW, r.blankL) }),
        el('td', { class: 'num', text: num(r.panelQty) }),
        el('td', { class: 'num skin-cell', text: r.ppgiQty ? (r.skin ?? '') : '' }),
        el('td', { class: 'num', text: num(r.ppgiQty) }),
        el('td', { class: 'num', text: num(r.plyQty) }),
        el('td', { class: 'num', text: num(r.thk) }),
        el('td', { class: 'num', text: r.chemWeightText }),
        el('td', { class: 'num', text: r.areaSqmtText }),
      ]),
    ),
  );

  const t = block.totals;
  const tfoot = el('tfoot', {}, [
    el('tr', { class: 'total' }, [
      el('td', { class: 'desc', text: 'Total' }),
      el('td', {}),
      el('td', {}),
      el('td', { class: 'num', text: String(t.panelQty) }),
      el('td', {}),
      el('td', { class: 'num', text: String(t.ppgiQty) }),
      el('td', { class: 'num', text: num(t.plyQty) }),
      el('td', {}),
      el('td', { class: 'num', text: t.chemWeightText }),
      el('td', { class: 'num', text: t.areaSqmtText }),
    ]),
  ]);

  return el('section', { class: 'block' }, [
    el('div', { class: 'block-head' }, [
      el('h3', { text: roomName ? `${roomName} — ${block.title}` : block.title }),
      el('p', { text: block.spec }),
    ]),
    el('div', { class: 'scroller' }, [el('table', {}, [thead, tbody, tfoot])]),
  ]);
}

/** The job's roll-up, under the per-room sheets. Only worth showing for two+. */
function grandTotal(data) {
  if (data.blocks.length < 2) return null;
  const g = data.grand;
  const row = (label, value) =>
    el('tr', {}, [
      el('td', { class: 'desc', text: label }),
      el('td', { class: 'num', text: value }),
    ]);

  return el('section', { class: 'block grand' }, [
    el('div', { class: 'block-head' }, [
      el('h3', { text: `Job total — ${data.blocks.length} rooms` }),
      el('p', { text: data.rooms.join(' · ') }),
    ]),
    el('div', { class: 'scroller' }, [
      el('table', {}, [
        el('tbody', {}, [
          row('Panels', String(g.panelQty)),
          row('Sheet skins', String(g.ppgiQty)),
          ...(g.plyQty ? [row('PLY 12mm', String(g.plyQty))] : []),
          row('Chemical weight (kg)', g.chemWeightText),
          row('Area (m²)', g.areaSqmtText),
        ]),
      ]),
    ]),
  ]);
}

/**
 * The flashing table. A separate purchase from the panels — bought by the
 * running metre — so it carries its own total and stays out of the panel
 * counts. Every figure is printed as the engine sent it.
 */
function flashingBlock(flashing) {
  const body = [];

  for (const room of flashing.rooms) {
    body.push(
      el('tr', { class: 'fl-room' }, [
        el('td', { colspan: 4, text: room.room }),
        el('td', { class: 'num', text: room.totalRmtrText }),
      ]),
    );
    for (const r of room.rows) {
      const typed = r.source === 'typed';
      body.push(
        el('tr', { class: typed ? 'fl-typed' : '' }, [
          el('td', {}, [
            el('span', { text: r.label }),
            typed ? el('em', { class: 'fl-tag', text: 'typed in' }) : null,
            el('i', { class: 'fl-note', text: r.note }),
          ]),
          el('td', { class: 'mono', text: r.profile }),
          el('td', { class: 'num', text: String(r.width) }),
          el('td', { text: `${r.material} ${r.thickness}mm` }),
          el('td', { class: 'num', text: r.rmtrText }),
        ]),
      );
    }
  }

  return el('section', { class: 'block flash-block' }, [
    el('h3', { text: 'FLASHING' }),
    el('p', {
      class: 'hint',
      text:
        'Three types on every job. Running metre is both widths plus both lengths; ' +
        'a butt joint adds one wall height of inner and one of outer. Width is the ' +
        'wall thickness plus 2. Not yet checked against a printed sheet.',
    }),
    el('table', { class: 'flash' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Flashing' }),
          el('th', { text: 'Profile' }),
          el('th', { text: 'Width mm' }),
          el('th', { text: 'Sheet' }),
          el('th', { text: 'RMTR' }),
        ]),
      ]),
      el('tbody', {}, body),
      el('tfoot', {}, [
        el('tr', {}, [
          el('td', { colspan: 4, text: 'Total running metre' }),
          el('td', { class: 'num', text: flashing.totalRmtrText }),
        ]),
      ]),
    ]),
  ]);
}

async function saveDxf(body, name) {
  const res = await fetch('/api/dxf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: name.replace(/[^a-z0-9]+/gi, '-') + '.dxf',
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

const downloadDxf = (roomIndex, drawingIndex, title) => {
  const spec = jobSpec();
  return saveDxf(
    { room: spec.rooms[roomIndex], index: drawingIndex },
    `${spec.jobNo}-${title}`,
  );
};

const downloadLayoutDxf = (title) => saveDxf({ job: jobSpec() }, title);

const downloadSheetDxf = (jobNo) =>
  saveDxf({ job: jobSpec(), sheet: true }, `${jobNo || 'JOB'}-drawing-sheet`);

/* ---------- the 3D view ---------- */

/**
 * Camera and picked face. Kept outside the render so that typing in the form —
 * which rebuilds the whole output — does not throw the view back to its
 * starting angle mid-edit.
 */
const view3d = {
  on: false,
  yaw: 0.55,
  pitch: 0.5,
  zoom: 1,
  panX: 0,
  panY: 0,
  ceiling: false,
  picked: null,
  /** the standard view in force, cleared the moment the camera is dragged */
  preset: 'iso',
};

/**
 * Repaints the standard-view highlight. Assigned when the viewer is built and
 * a no-op until then, because dragging clears the preset and the drag handler
 * must not care whether the buttons exist yet.
 */
let syncPresets = () => {};

/**
 * Standard views, the way a CAD viewer offers them. A compass letter is the
 * elevation you are looking *at*: N shows the north face, so the camera stands
 * north of the job and looks south. Pitch 0 is a true elevation, 90 a plan.
 */
const VIEWS_3D = [
  ['iso', 'Iso', 0.55, 0.5],
  ['n', 'N', 0, 0],
  ['e', 'E', -Math.PI / 2, 0],
  ['s', 'S', Math.PI, 0],
  ['w', 'W', Math.PI / 2, 0],
  ['top', 'Top', 0, Math.PI / 2],
];

const FACE_COLOURS = {
  wall: { fill: [223, 229, 236], line: '#4a545f' },
  corner: { fill: [240, 217, 194], line: '#b4651a' },
  door: { fill: [248, 215, 227], line: '#c2185b' },
  ceiling: { fill: [223, 240, 230], line: '#1f7a4d' },
  floor: { fill: [232, 236, 241], line: '#7c8794' },
};

/**
 * World -> screen. An orthographic camera: yaw turns the plan under it, pitch
 * tilts from an elevation (0) to a plan (90 degrees). Orthographic because the
 * job is a set of right-angled boxes and parallel edges staying parallel is
 * what makes a panel layout readable.
 */
function project(p, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = p[0] * cy - p[1] * sy;
  const y1 = p[0] * sy + p[1] * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return {
    x: x1,
    y: y1 * sp - p[2] * cp,
    depth: y1 * cp - p[2] * sp,
  };
}

/** Unit normal of a face, for shading. */
function faceNormal(pts) {
  const [a, b, c] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

const LIGHT = (() => {
  const v = [0.4, -0.5, 0.75];
  const len = Math.hypot(v[0], v[1], v[2]);
  return v.map((n) => n / len);
})();

const shade = (rgb, k) =>
  `rgb(${rgb.map((c) => Math.round(Math.min(255, c * k))).join(',')})`;

/** Is a point inside a projected polygon? Ray casting, for picking. */
function inside(poly, px, py) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Everything needed to paint one frame: the faces this camera can see, farthest
 * first, already in canvas pixels. Picking reads the same list backwards, so
 * what you click is always what is on top.
 */
function frame3d(model, w, h) {
  const shown = model.faces.filter((f) => view3d.ceiling || f.kind !== 'ceiling');
  if (!shown.length) return { ordered: [], scale: 1 };

  const projected = shown.map((face) => {
    const pts = face.pts.map((p) => project(p, view3d.yaw, view3d.pitch));
    return {
      face,
      pts,
      // sort on the farthest corner so a big floor cannot jump in front of the
      // wall standing on it
      depth: Math.max(...pts.map((p) => p.depth)),
    };
  });

  const xs = projected.flatMap((f) => f.pts.map((p) => p.x));
  const ys = projected.flatMap((f) => f.pts.map((p) => p.y));
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const pad = 28;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY) * view3d.zoom;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;

  const ordered = projected
    .sort((a, b) => b.depth - a.depth)
    .map((f) => ({
      face: f.face,
      poly: f.pts.map((p) => [
        w / 2 + (p.x - cx) * scale + view3d.panX,
        h / 2 + (p.y - cy) * scale + view3d.panY,
      ]),
    }));

  return { ordered, scale };
}

function paint3d(canvas, model) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 900;
  const h = canvas.clientHeight || 560;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { ordered } = frame3d(model, w, h);
  canvas._frame = ordered;

  for (const { face, poly } of ordered) {
    const col = FACE_COLOURS[face.kind] ?? FACE_COLOURS.wall;
    const n = faceNormal(face.pts);
    const lit = Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);

    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (const p of poly.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();

    ctx.fillStyle = shade(col.fill, 0.68 + 0.32 * lit);
    ctx.fill();

    const picked = face === view3d.picked;
    ctx.strokeStyle = picked ? '#0f6dd3' : face.std ? col.line : '#b7791f';
    ctx.lineWidth = picked ? 2.4 : 0.8;
    ctx.stroke();
  }
}

/** The panel the pointer is over — nearest first, so the top face wins. */
function pick3d(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const frame = canvas._frame ?? [];
  for (let i = frame.length - 1; i >= 0; i--) {
    if (inside(frame[i].poly, x, y)) return frame[i].face;
  }
  return null;
}

function viewer3d(data) {
  const model = data.model3d;
  const canvas = el('canvas', { class: 'view3d' });
  const readout = el('div', { class: 'pick3d' });

  const showPick = () => {
    const f = view3d.picked;
    readout.replaceChildren(
      ...(f
        ? [
            el('b', { text: f.label }),
            ...f.detail.map((line) => el('span', { text: line })),
          ]
        : [el('span', { class: 'muted', text: 'Click any panel to read its size.' })]),
    );
  };

  const redraw = () => paint3d(canvas, model);

  let dragging = false;
  let moved = 0;
  let last = null;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    last = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    last = [e.clientX, e.clientY];
    moved += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey) {
      view3d.panX += dx;
      view3d.panY += dy;
    } else {
      view3d.yaw += dx * 0.008;
      // an elevation and a plan are the two ends, and neither is passed
      view3d.pitch = Math.max(0, Math.min(Math.PI / 2, view3d.pitch + dy * 0.006));
      view3d.preset = null;
      syncPresets();
    }
    redraw();
  });

  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    // a press that did not travel is a click, not the end of an orbit
    if (moved < 4) {
      view3d.picked = pick3d(canvas, e);
      showPick();
      redraw();
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      view3d.zoom = Math.max(0.35, Math.min(8, view3d.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      redraw();
    },
    { passive: false },
  );

  const ceiling = toggle('Show ceiling', view3d.ceiling, (v) => {
    view3d.ceiling = v;
    // the picked face may have just been hidden
    if (!v && view3d.picked?.kind === 'ceiling') {
      view3d.picked = null;
      showPick();
    }
    redraw();
  });

  // the standard views, and the highlight that says which one is in force
  const presets = el('div', { class: 'seg views3d' });
  const buttons = new Map();
  for (const [key, label, yaw, pitch] of VIEWS_3D) {
    const b = el('button', { class: 'seg-btn', type: 'button', text: label });
    b.addEventListener('click', () => {
      Object.assign(view3d, { yaw, pitch, panX: 0, panY: 0, preset: key });
      syncPresets();
      redraw();
    });
    buttons.set(key, b);
    presets.append(b);
  }
  syncPresets = () => {
    for (const [key, b] of buttons) b.className = `seg-btn${view3d.preset === key ? ' is-on' : ''}`;
  };
  syncPresets();

  const reset = el('button', { class: 'btn ghost', type: 'button', text: 'Fit' });
  reset.addEventListener('click', () => {
    Object.assign(view3d, { zoom: 1, panX: 0, panY: 0 });
    redraw();
  });

  showPick();
  // the canvas has no size until it is in the document
  requestAnimationFrame(redraw);

  const problems = (model.skipped ?? []).map((s) =>
    el('p', { class: 'error', text: `${s.room}: ${s.reason}` }),
  );

  return el('div', { class: 'wrap3d' }, [
    canvas,
    el('div', { class: 'tools3d' }, [
      presets,
      reset,
      ceiling,
      el('span', { class: 'hint3d', text: 'Drag to turn · shift-drag to move · scroll to zoom' }),
    ]),
    readout,
    ...problems,
  ]);
}

/* ---------- opening one view off the sheet ---------- */

/**
 * Every view the sheet carries, in the order it composed them: the job layout
 * first, then each drawable room's own drawings. `sheetViews` on the server
 * builds the same list from the same two sources, so the titles line up.
 */
function allViews(data) {
  const out = [];
  if (data.layout?.drawable) out.push(data.layout);
  for (const room of data.drawings ?? []) {
    if (room?.drawable) out.push(...room.drawings);
  }
  return out;
}

/** The view the estimator has opened, if any — matched by title, not index. */
const openView = (data) =>
  state.openView ? allViews(data).find((v) => v.title === state.openView) : null;

/**
 * Which cell a click landed in. The sheet is drawn in millimetres and shown at
 * whatever width fits, so the click is put back into millimetres through the
 * SVG's own viewBox rather than by guessing a scale.
 */
function cellAt(holder, cells, ev) {
  const svg = holder.querySelector('svg');
  if (!svg || !cells?.length) return null;
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const vb = svg.viewBox.baseVal;
  const x = vb.x + ((ev.clientX - box.left) / box.width) * vb.width;
  const y = vb.y + ((ev.clientY - box.top) / box.height) * vb.height;
  return cells.find((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) ?? null;
}

/**
 * One DXF per view, under the sheet. The sheet is what you look at; a single
 * view is still what gets sent to the machine, so both stay reachable.
 */
function drawingDownloads(data) {
  const items = [];

  if (data.layout?.drawable) {
    const b = el('button', { class: 'chip-dl', type: 'button', text: data.layout.title });
    b.addEventListener('click', () => downloadLayoutDxf(data.layout.title));
    items.push(b);
  }

  data.drawings?.forEach((room, i) => {
    if (!room?.drawable) return;
    room.drawings.forEach((d, di) => {
      const b = el('button', { class: 'chip-dl', type: 'button', text: d.title });
      b.addEventListener('click', () => downloadDxf(i, di, d.title));
      items.push(b);
    });
  });

  if (!items.length) return null;
  return el('div', { class: 'dl-row' }, [
    el('span', { class: 'dl-label', text: 'DXF of one view:' }),
    ...items,
  ]);
}

/* ---------- examples ---------- */

/** Pull a verified job back into the form so its dimensions can be inspected. */
function loadExample(job) {
  state.jobNo = job.jobNo;
  state.density = job.density;
  state.rooms = job.rooms.map((room) => {
    const r = newRoom();
    r.name = room.name;
    r.x = room.at?.[0] ?? 0;
    r.y = room.at?.[1] ?? 0;
    r.w = room.ext.w;
    r.l = room.ext.l;
    r.h = room.ext.h;
    r.wallTh = room.wallTh;
    r.ceilTh = room.ceilTh;
    // a job that does not state one keeps following the thickness rule
    r.lCut = room.lCut ?? null;
    r.module = room.module;
    r.cornerLeg = room.cornerLeg;
    r.minPanelWidth = room.minPanelWidth;
    r.splitAxis = room.ceiling.splitAxis;
    r.floorKind = room.floor.kind;
    r.floorTh = room.floor.th;
    r.floorModule = room.floor.module ?? 1220;
    r.floorSplitAxis = room.floor.splitAxis ?? 'w';
    r.floorLayers = (room.floor.layers ?? RULES.floorLayers).map((l) => ({ ...l }));
    r.flashingSkin = { ...(room.flashingSkin ?? RULES.defaultSkin) };
    r.extraFlashing = (room.extraFlashing ?? []).map((x) => ({ ...x }));
    r.extraFlashingOn = r.extraFlashing.length > 0;
    if (room.labels) r.labels = room.labels;

    if (room.boqGroup) r.boqGroup = room.boqGroup;

    /**
     * A job file carries a point list, not a rectangle, so the form comes back
     * as a chain — which is the one representation that can hold any of them.
     * A four-wall room stays on the Rectangle control, because that is what
     * the estimator expects to see for a plain room.
     */
    const points = room.outline?.points ?? [
      [0, 0],
      [room.ext.w, 0],
      [room.ext.w, room.ext.l],
      [0, room.ext.l],
    ];
    r.chain = chainFrom(points);
    r.shape = points.length === 4 ? 'rect' : 'chain';

    const verts = room.outline?.vertices ?? {};
    r.corners = points.map((_, v) => verts[v]?.corner !== false);
    r.through = points.map((_, v) => verts[v]?.through ?? 'prev');

    const edges = room.outline?.edges ?? {};
    const sides = edgeSides(points);
    r.edges = edgeIds(sides).map((id, i) => {
      const e = edges[i] ?? {};
      return {
        ...newEdge(e.id ?? id),
        // a job file only records who builds a wall, which is the half that
        // matters — the pairing is rebuilt when rooms are joined in the form
        shared: !!e.shared,
        buttJoint: !!e.buttJoint,
        split: e.panels ? 'exact' : e.equalPieces ? 'equal' : 'auto',
        equalPieces: e.equalPieces ?? 2,
        panelsText: e.panels ? e.panels.join(', ') : '',
        skinOuter: e.skin?.outer ?? defaultSkin(),
        skinInner: e.skin?.inner ?? defaultSkin(),
        door: e.door
          ? {
              ...newDoor(),
              ...e.door,
              frame: e.door.frame ?? Math.round((e.door.moduleW - e.door.clearW) / 2),
              fromLeft: e.door.fromLeft ?? '',
              fromRight: e.door.fromRight ?? '',
              handOn: e.door.hand != null,
              hand: e.door.hand ?? 'LHS',
              chqOn: e.door.chqHeight != null,
              chqHeight: e.door.chqHeight ?? 600,
              liftOn: e.door.liftAboveFloor != null || e.door.liftAboveGround != null,
              liftAboveFloor: e.door.liftAboveFloor ?? 150,
              liftAboveGround: e.door.liftAboveGround ?? '',
              skinOuter: e.door.skin?.outer ?? defaultSkin(),
              skinInner: e.door.skin?.inner ?? defaultSkin(),
            }
          : null,
      };
    });
    return r;
  });
  state.active = 0;
  $('#jobNo').value = state.jobNo;
  $('#density').value = state.density;
  renderForm();
  refresh();
}

/**
 * Open a job by its number.
 *
 * The list comes from `/api/jobs`, which today is the three verified jobs the
 * engine was proved against. It is deliberately a search box and not a picker:
 * an estimator knows the job number off the drawing, and a list stops being a
 * way to find anything once there are more than a screenful.
 */
/** The verified examples, from /api/jobs. Loaded once at boot. */
let EXAMPLES = [];

/**
 * Fill the datalist: the estimator's own saved jobs first, then the examples.
 * Their own work is what they are usually looking for.
 */
async function refreshJobList() {
  const list = $('#jobList');
  list.replaceChildren();

  if (window.Auth && Auth.user) {
    try {
      for (const row of await Auth.listJobs()) {
        list.append(
          el('option', { value: row.job_no, label: `saved ${row.updated_at.slice(0, 10)}` }),
        );
      }
    } catch {
      /* the list is a convenience; the box still opens a job by name */
    }
  }
  for (const j of EXAMPLES) {
    list.append(el('option', { value: j.jobNo, label: j.rooms.map((r) => r.name).join(', ') }));
  }
}

/**
 * Open a job by its number: the estimator's own saved jobs first, then the
 * verified examples. Their own is what they mean when the two share a number.
 */
async function openJobNo(wanted) {
  const msg = $('#jobSearchMsg');
  const name = String(wanted ?? '').trim();
  if (!name) return false;

  if (window.Auth && Auth.user) {
    try {
      const spec = await Auth.loadJob(name);
      if (spec) {
        loadExample(spec);
        msg.textContent = `opened ${name}`;
        return true;
      }
    } catch (err) {
      msg.textContent = err.message;
      return false;
    }
  }

  // typed by hand, so match on case and stray spaces the estimator did not mean
  const hit = EXAMPLES.find((j) => j.jobNo.toLowerCase() === name.toLowerCase());
  if (!hit) {
    msg.textContent = `No job ${name}`;
    return false;
  }
  const spec = await (await fetch(`/api/spec?job=${encodeURIComponent(hit.jobNo)}`)).json();
  loadExample(spec);
  msg.textContent = '';
  return true;
}

async function initJobSearch() {
  const box = $('#jobSearch');
  const msg = $('#jobSearchMsg');

  try {
    EXAMPLES = await (await fetch('/api/jobs')).json();
  } catch {
    msg.textContent = 'job list unavailable';
  }
  await refreshJobList();

  const open = async () => {
    if (await openJobNo(box.value)) box.value = '';
  };

  box.addEventListener('change', open); //  picking from the list fires this
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') open();
  });
  box.addEventListener('input', () => {
    msg.textContent = '';
  });
}

/* ---------- accounts, and the File menu ---------- */

/** Set by Save, so Save can save again without asking for the number. */
let savedAs = '';

const closeMenus = () => {
  for (const id of ['#fileMenu', '#accountMenu']) {
    const menu = $(id);
    if (menu) menu.open = false;
  }
};

function renderAccount() {
  const panel = $('#accountPanel');
  const button = $('#accountBtn');
  if (!panel || !button) return;
  panel.replaceChildren();

  if (!window.Auth || !Auth.available) {
    button.textContent = 'Sign in';
    panel.append(
      el('p', { class: 'hint', text: Auth ? Auth.reason : 'Accounts are not available.' }),
      el('p', {
        class: 'hint',
        text: 'The calculator works without an account — only saving jobs needs one.',
      }),
    );
    return;
  }

  if (Auth.user) {
    button.textContent = Auth.email;
    const out = el('button', { class: 'btn', type: 'button', text: 'Sign out' });
    out.addEventListener('click', async () => {
      await Auth.signOut();
      savedAs = '';
      renderAccount();
      refreshJobList();
      closeMenus();
    });
    panel.append(
      el('p', { class: 'hint', text: `Signed in as ${Auth.email}. Your jobs are yours alone.` }),
      out,
    );
    return;
  }

  button.textContent = 'Sign in';
  const email = el('input', { type: 'email', placeholder: 'you@hikom.in', autocomplete: 'email' });
  const pass = el('input', { type: 'password', placeholder: 'password', autocomplete: 'current-password' });
  const note = el('p', { class: 'hint', text: '' });

  const run = async (what) => {
    note.textContent = 'working…';
    try {
      if (what === 'in') {
        await Auth.signIn(email.value.trim(), pass.value);
        renderAccount();
        await refreshJobList();
        closeMenus();
        return;
      }
      const { verified } = await Auth.signUp(email.value.trim(), pass.value);
      note.textContent = verified
        ? 'Signed up.'
        : 'Check your email and click the link, then sign in. It may take a minute.';
      if (verified) {
        renderAccount();
        await refreshJobList();
      }
    } catch (err) {
      note.textContent = err.message;
    }
  };

  const signIn = el('button', { class: 'btn', type: 'button', text: 'Sign in' });
  const signUp = el('button', { class: 'btn ghost', type: 'button', text: 'Sign up' });
  signIn.addEventListener('click', () => run('in'));
  signUp.addEventListener('click', () => run('up'));
  pass.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run('in');
  });

  panel.append(
    email,
    pass,
    el('div', { class: 'row2' }, [signIn, signUp]),
    note,
    el('p', {
      class: 'hint',
      text: 'Signing up sends a confirmation email; the account works once that link is clicked.',
    }),
  );
}

/** Ask for a job number, offering the one already in the header. */
const askJobNo = (suggested) => {
  const asked = window.prompt('Save as job number', suggested || '');
  return asked === null ? null : asked.trim();
};

async function fileAction(what) {
  const msg = $('#jobSearchMsg');
  closeMenus();

  if (what === 'new') {
    if (!window.confirm('Start a new job? Anything unsaved on screen is lost.')) return;
    savedAs = '';
    state.jobNo = 'HI-';
    state.rooms = [newRoom()];
    state.active = 0;
    $('#jobNo').value = state.jobNo;
    renderForm();
    refresh();
    return;
  }

  if (what === 'open') {
    const wanted = askJobNo(savedAs || state.jobNo);
    if (wanted) await openJobNo(wanted);
    return;
  }

  if (!window.Auth || !Auth.user) {
    msg.textContent = 'Sign in to save';
    return;
  }

  const jobNo = what === 'saveAs' ? askJobNo(state.jobNo) : savedAs || state.jobNo;
  if (!jobNo) return;
  if (jobNo === 'HI-' || !jobNo.trim()) {
    msg.textContent = 'Give the job a number first';
    return;
  }

  try {
    // the spec is what is saved, never the BOQ — that is generated, and a
    // stored figure is how a saved job and a fresh one start to disagree
    await Auth.saveJob(jobNo, jobSpec());
    savedAs = jobNo;
    state.jobNo = jobNo;
    $('#jobNo').value = jobNo;
    msg.textContent = `saved ${jobNo}`;
    await refreshJobList();
    refresh();
  } catch (err) {
    msg.textContent = err.message;
  }
}

/* ---------- boot ---------- */

$('#jobNo').addEventListener('input', (e) => {
  state.jobNo = e.target.value;
  refresh();
});
$('#density').addEventListener('input', (e) => {
  state.density = e.target.value;
  refresh();
});
$('#printBtn').addEventListener('click', () => window.print());

for (const b of document.querySelectorAll('#fileMenu [data-file]')) {
  b.addEventListener('click', () => fileAction(b.getAttribute('data-file')));
}

/** Pick lists come from core/rules.ts so the form and the engine agree. */
async function boot() {
  try {
    RULES = await (await fetch('/api/rules')).json();
  } catch {
    /* keep the defaults — the form still works on PPGI 0.4 */
  }
  // an account is a convenience on top of the calculator, never a gate in
  // front of it: if this fails the form still works, unsaved
  if (window.Auth) {
    try {
      await Auth.boot();
    } catch {
      /* renderAccount says why */
    }
  }
  renderAccount();

  state.rooms = [newRoom()];
  renderForm();
  initJobSearch();
  render();
}

boot();
