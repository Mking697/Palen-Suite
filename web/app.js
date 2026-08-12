/* Panel Calculator.
   One screen: the form on the left, the drawings and the BOQ on the right.
   Every figure comes back from the engine — nothing is computed here, and no
   BOQ number is ever formatted here, because the half-up rounding rule lives
   in core/format.ts. */

const $ = (s) => document.querySelector(s);

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
const SIDE_NAMES = ['Top', 'Right', 'Bottom', 'Left'];
/** the edge of a new room that faces the wall it was created on */
const FACING = [2, 3, 0, 1];

/** Pick lists from core/rules.ts, filled at boot. */
let RULES = {
  materials: { PPGI: [0.4] },
  defaultSkin: { material: 'PPGI', thickness: 0.4 },
  doorTypes: [],
  doorCores: ['Puf'],
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
  module: 1180,
  cornerLeg: 300,
  minPanelWidth: 150,
  splitAxis: 'l',
  floorKind: 'pufSlab',
  floorTh: 100,
  floorModule: 1220,
  edges: WALL_IDS.map(newEdge),
  /**
   * A corner panel at each of the four outside corners. Vertex v sits between
   * wall v-1 and wall v, so a corner is shared by two walls and is ticked on
   * both of their cards. The shop does not always fit one, so each can be
   * turned off; the two walls then meet directly, the first running through.
   */
  corners: [true, true, true, true],
  /** overrides loaded from an example that the form cannot express */
  extra: {},
});

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
  const facing = FACING[edgeIndex];

  // a wall can only have one room against it — go to the one already there
  const existing = partnerEdge(state.active, edgeIndex);
  if (existing) return goToRoom(parent.edges[edgeIndex].with);

  const r = newRoom(state.rooms.length + 1);
  const horizontal = edgeIndex % 2 === 0; // top or bottom

  r.w = horizontal ? parent.w : 2000;
  r.l = horizontal ? 2000 : parent.l;
  r.h = parent.h;
  r.wallTh = parent.wallTh;
  r.ceilTh = parent.ceilTh;
  r.module = parent.module;
  r.cornerLeg = parent.cornerLeg;
  r.minPanelWidth = parent.minPanelWidth;
  r.splitAxis = parent.splitAxis;
  r.floorKind = parent.floorKind;
  r.floorTh = parent.floorTh;
  r.floorModule = parent.floorModule;

  // sit the new room hard against that wall, so the job plan draws them
  // touching along the partition rather than as two unrelated pictures
  const at = [
    [parent.x, parent.y - r.l], // N — above
    [parent.x + parent.w, parent.y], // E — right
    [parent.x, parent.y + parent.l], // S — below
    [parent.x - r.w, parent.y], // W — left
  ][edgeIndex];
  r.x = at[0];
  r.y = at[1];

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
  const e = state.rooms[roomIndex]?.edges[edgeIndex];
  const other = state.rooms[e?.with];
  if (!other) return null;
  const oe = other.edges[FACING[edgeIndex]];
  return oe?.with === roomIndex ? { room: other, edge: oe } : null;
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
    // draftsman overrides carried in from an example
    const x = r.extra[e.id];
    if (x?.equalPieces) o.equalPieces = x.equalPieces;
    if (x?.panels) o.panels = x.panels;
    if (x?.buttJoint) o.buttJoint = true;
    edges[i] = o;
  });

  const shared = (i) => (r.edges[i].shared ? 'shared' : 'own');

  // a corner that is turned off becomes a butt joint, and the wall arriving at
  // it runs through
  const vertices = {};
  (r.corners ?? []).forEach((on, v) => {
    if (!on) vertices[v] = { corner: false, through: 'prev' };
  });

  return {
    name: r.name,
    ext: { w: +r.w, l: +r.l, h: +r.h },
    wallTh: +r.wallTh,
    ceilTh: +r.ceilTh,
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
            desc: 'Bottom PPGI + Puf + 12 mm Ply + 2mm AL. CHQ',
          }
        : { kind: 'pufSlab', th: +r.floorTh, desc: 'Puf Slab With Single Layer Tarfelt.' },
    // the ceiling notch and the floor's clear span both follow from which
    // walls this room owns, so marking a wall shared is all the user does
    ceiling: {
      splitAxis: r.splitAxis,
      wEnds: [shared(3), shared(1)],
      lEnds: [shared(0), shared(2)],
    },
    at: [+r.x, +r.y],
    outline: {
      points: [
        [0, 0],
        [+r.w, 0],
        [+r.w, +r.l],
        [0, +r.l],
      ],
      edges,
      ...(Object.keys(vertices).length ? { vertices } : {}),
    },
    walls: [],
    ...(r.labels ? { labels: r.labels } : {}),
  };
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
  const head = el('div', { class: 'group' }, [
    el('h3', { text: 'Room' }),
    field('Room name', r.name, setRedraw('name'), { type: 'text' }),
    el('div', { class: 'row3' }, [
      field('Width', r.w, set('w'), { unit: 'mm' }),
      field('Length', r.l, set('l'), { unit: 'mm' }),
      field('Height', r.h, set('h'), { unit: 'mm' }),
    ]),
    el('p', { class: 'hint', text: 'External envelope. Walls are worked out from this.' }),
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

  r.edges.forEach((e, i) => {
    const addRoom = el('button', { class: 'add-room', type: 'button', text: '+ Room on this side' });
    addRoom.addEventListener('click', () => createRoomOn(i));

    const card = el('div', { class: `wall${e.shared ? ' is-shared' : ''}` }, [
      el('div', { class: 'wall-head' }, [
        el('b', { text: `${e.id} · ${SIDE_NAMES[i]}` }),
        el('span', { class: 'wall-len', text: `${i % 2 === 0 ? r.w : r.l} mm` }),
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
      e.shared ? null : addRoom,
    ]);

    // the two outside corners this wall runs between. Each is shared with the
    // next wall along, so turning one off shows on both cards.
    if (!e.shared) {
      const ends = [
        [i, 'Corner at start'],
        [(i + 1) % 4, 'Corner at end'],
      ];
      card.append(
        el(
          'div',
          { class: 'corners' },
          ends.map(([v, label]) =>
            toggle(`${label} · ${r.cornerLeg}`, r.corners[v], (on) => {
              r.corners[v] = on;
              renderForm();
              refresh();
            }, 'corner'),
          ),
        ),
      );
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
      );
    }

    const x = r.extra[e.id];
    if (x?.equalPieces || x?.panels) {
      card.append(
        el('p', {
          class: 'override',
          text: x.panels
            ? `drawing override — panels ${x.panels.join(' + ')}`
            : `drawing override — split into ${x.equalPieces} equal pieces`,
        }),
      );
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

          el('div', { class: 'row2' }, [
            field('From left', d.fromLeft, setD('fromLeft'), { unit: 'mm', placeholder: 'auto' }),
            field('From right', d.fromRight, setD('fromRight'), { unit: 'mm', placeholder: 'auto' }),
          ]),
          el('p', {
            class: 'hint',
            text: 'Leave both blank and the drawing centres the door. The BOQ is the same either way.',
          }),

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

  // the job's single layout: connected rooms touching, the rest standing clear
  if (data.layout?.drawable) {
    const dxf = el('button', { class: 'btn', type: 'button', text: 'DXF' });
    dxf.addEventListener('click', () => downloadLayoutDxf(data.layout.title));
    const holder = el('div', { class: 'draw-svg' });
    holder.innerHTML = data.layout.svg;
    parts.push(
      el('section', { class: 'block draw layout' }, [
        el('div', { class: 'draw-head' }, [
          el('div', {}, [
            el('h3', { text: data.layout.title }),
            el('p', { text: data.layout.subtitle }),
          ]),
          dxf,
        ]),
        holder,
      ]),
    );
  } else if (data.layout) {
    parts.push(el('p', { class: 'error', text: data.layout.reason }));
  }

  // drawings, room by room
  data.blocks.forEach((block, i) => {
    const room = data.drawings[i];
    parts.push(el('h2', { class: 'room-head', text: `${room?.name ?? block.title} — drawings` }));

    if (room?.drawable) {
      for (const [di, d] of room.drawings.entries()) {
        const dxf = el('button', { class: 'btn', type: 'button', text: 'DXF' });
        dxf.addEventListener('click', () => downloadDxf(i, di, d.title));
        const holder = el('div', { class: 'draw-svg' });
        holder.innerHTML = d.svg; // built by the server, no user markup in it
        parts.push(
          el('section', { class: 'block draw' }, [
            el('div', { class: 'draw-head' }, [
              el('div', {}, [el('h3', { text: d.title }), el('p', { text: d.subtitle })]),
              dxf,
            ]),
            holder,
          ]),
        );
      }
    } else if (room) {
      parts.push(el('p', { class: 'error', text: room.reason }));
    }
  });

  // then every room's BOQ together, the way the production sheet prints it
  parts.push(el('h2', { class: 'room-head boq-head', text: 'SHEET FABRICATION' }));
  data.blocks.forEach((block, i) => {
    parts.push(boqBlock(block, data.drawings[i]?.name));
  });
  parts.push(grandTotal(data));

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
    r.module = room.module;
    r.cornerLeg = room.cornerLeg;
    r.minPanelWidth = room.minPanelWidth;
    r.splitAxis = room.ceiling.splitAxis;
    r.floorKind = room.floor.kind;
    r.floorTh = room.floor.th;
    r.floorModule = room.floor.module ?? 1220;
    if (room.labels) r.labels = room.labels;

    const verts = room.outline?.vertices ?? {};
    r.corners = [0, 1, 2, 3].map((v) => verts[v]?.corner !== false);

    const edges = room.outline?.edges ?? {};
    r.edges = WALL_IDS.map((id, i) => {
      const e = edges[i] ?? {};
      return {
        ...newEdge(e.id ?? id),
        // a job file only records who builds a wall, which is the half that
        // matters — the pairing is rebuilt when rooms are joined in the form
        shared: !!e.shared,
        skinOuter: e.skin?.outer ?? defaultSkin(),
        skinInner: e.skin?.inner ?? defaultSkin(),
        door: e.door
          ? {
              ...newDoor(),
              ...e.door,
              frame: e.door.frame ?? Math.round((e.door.moduleW - e.door.clearW) / 2),
              fromLeft: e.door.fromLeft ?? '',
              fromRight: e.door.fromRight ?? '',
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
    // keep the draftsman overrides the form has no control for
    r.extra = {};
    for (const [i, e] of Object.entries(edges)) {
      if (e.equalPieces || e.panels || e.buttJoint) {
        r.extra[e.id ?? WALL_IDS[i]] = {
          equalPieces: e.equalPieces,
          panels: e.panels,
          buttJoint: e.buttJoint,
        };
      }
    }
    return r;
  });
  state.active = 0;
  $('#jobNo').value = state.jobNo;
  $('#density').value = state.density;
  renderForm();
  refresh();
}

async function initExamples() {
  const jobs = await (await fetch('/api/jobs')).json();
  const sel = $('#exampleSel');
  for (const j of jobs) {
    sel.append(el('option', { value: j.jobNo, text: `${j.jobNo} — ${j.rooms.map((r) => r.name).join(', ')}` }));
  }
  sel.addEventListener('change', async () => {
    if (!sel.value) return;
    const job = await (await fetch(`/api/spec?job=${encodeURIComponent(sel.value)}`)).json();
    loadExample(job);
    sel.value = '';
  });
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

/** Pick lists come from core/rules.ts so the form and the engine agree. */
async function boot() {
  try {
    RULES = await (await fetch('/api/rules')).json();
  } catch {
    /* keep the defaults — the form still works on PPGI 0.4 */
  }
  state.rooms = [newRoom()];
  renderForm();
  initExamples();
  render();
}

boot();
