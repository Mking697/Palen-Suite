/**
 * SHEET FABRICATION BOQ generator.
 *
 * Verified formulas (all four source sheets agree):
 *   areaSqmt    = panelW/1000 * panelL/1000 * qty        (panel size, not blank)
 *   chemWeight  = areaSqmt * thk/1000 * density          (density = 40 kg/m3)
 *   blankW      = panelW + 40
 *   blankL      = panelL
 *   wall inner skin length = wall height - wallTh        (the L cut)
 *   corner outer = 2 * cornerLeg ; corner inner = outer - 2*wallTh + 5
 *   PPGI: roof 2/panel, wall 2/panel, corner 2/panel, floor 1/panel, door 4
 *   PLY : panelised floor only, 1/panel
 */

import type { BoqBlock, BoqRow, JobSpec, Mm, RoomSpec, SkinPair } from './types.ts';
import { layoutRoom, type RoomLayout } from './layout.ts';
import {
  BUTT_JOINT_BLANK_ALLOWANCE,
  BUTT_JOINT_INNER_DELTA,
  CORNER_INNER_BEND,
  DEFAULT_BLANK_ALLOWANCE,
  DEFAULT_LABELS,
  DEFAULT_SKIN,
  DOOR_BLANK_OFFSETS,
  skinLabel,
  WALLFRAME_BLANK_WIDTH,
  WALLFRAME_TOP_BOTTOM_LENGTH,
  WALLFRAME_VERTICAL_EXTRA,
} from './rules.ts';

const area = (w: Mm, l: Mm, qty: number) => (w / 1000) * (l / 1000) * qty;
const weight = (areaSqmt: number, th: Mm, density: number) =>
  areaSqmt * (th / 1000) * density;

/** Count identical widths, returned widest first (matches the sheet ordering). */
function tally(widths: Mm[]): Array<{ w: Mm; qty: number }> {
  const map = new Map<Mm, number>();
  for (const w of widths) map.set(w, (map.get(w) ?? 0) + 1);
  return [...map.entries()]
    .map(([w, qty]) => ({ w, qty }))
    .sort((a, b) => b.w - a.w);
}

/** A wall's skins, falling back to the room's and then to PPGI 0.4. */
function skinOf(own: Partial<SkinPair> | undefined, room: RoomSpec): SkinPair {
  return {
    outer: own?.outer ?? room.skin?.outer ?? DEFAULT_SKIN,
    inner: own?.inner ?? room.skin?.inner ?? DEFAULT_SKIN,
  };
}

/**
 * Group wall panels for printing. Two panels only share a row if they are the
 * same width *and* cut from the same sheets — a 1180 in PPGI and a 1180 in SS
 * are different line items. With everything on the default PPGI 0.4, which is
 * what all four source sheets are, this groups exactly as `tally` did.
 */
function tallyWalls(
  room: RoomSpec,
  L: RoomLayout,
  buttJoint: boolean,
): Array<{ w: Mm; qty: number; skin: SkinPair }> {
  const map = new Map<string, { w: Mm; qty: number; skin: SkinPair }>();

  for (const run of L.wallRuns) {
    const wall = room.walls.find((x) => x.id === run.wallId);
    if (!!wall?.buttJoint !== buttJoint) continue;
    const skin = skinOf(wall?.skin, room);
    const tag = `${skinLabel(skin.outer)}|${skinLabel(skin.inner)}`;
    for (const w of run.widths) {
      const key = `${w}|${tag}`;
      const hit = map.get(key);
      if (hit) hit.qty++;
      else map.set(key, { w, qty: 1, skin });
    }
  }

  return [...map.values()].sort(
    (a, b) => b.w - a.w || skinLabel(a.skin.outer).localeCompare(skinLabel(b.skin.outer)),
  );
}

export function buildRoomBlock(
  room: RoomSpec,
  density: number,
  blankAllowance: Mm = DEFAULT_BLANK_ALLOWANCE,
): BoqBlock {
  const L: RoomLayout = layoutRoom(room);
  const rows: BoqRow[] = [];
  const H = room.ext.h;
  const blank = (w: Mm) => w + blankAllowance;
  const lbl = { ...DEFAULT_LABELS, ...room.labels };
  const roomSkin = skinOf(undefined, room);

  // ---- floor -------------------------------------------------------------
  if (room.floor.kind === 'pufSlab') {
    const a = area(L.floor.w, L.floor.l, 1);
    rows.push({
      desc: room.floor.desc,
      panelW: L.floor.w,
      panelL: L.floor.l,
      panelQty: 1,
      thk: room.floor.th,
      areaSqmt: a,
      chemWeight: weight(a, room.floor.th, density),
    });
  } else {
    for (const { w, qty } of tally(L.floor.widths ?? [])) {
      const a = area(w, L.floor.l, qty);
      rows.push({
        desc: room.floor.desc,
        panelW: w,
        panelL: L.floor.l,
        blankW: blank(w),
        blankL: L.floor.l,
        panelQty: qty,
        ppgiQty: qty,
        plyQty: qty,
        thk: room.floor.th,
        areaSqmt: a,
        chemWeight: weight(a, room.floor.th, density),
        skin: skinLabel(roomSkin.outer),
      });
    }
  }

  // ---- ceiling / roof ----------------------------------------------------
  for (const { w, qty } of tally(L.ceiling.widths)) {
    const a = area(w, L.ceiling.panelLength, qty);
    rows.push({
      desc: lbl.roof,
      panelW: w,
      panelL: L.ceiling.panelLength,
      blankW: blank(w),
      blankL: L.ceiling.panelLength,
      panelQty: qty,
      ppgiQty: qty * 2,
      thk: room.ceilTh,
      areaSqmt: a,
      chemWeight: weight(a, room.ceilTh, density),
      skin: skinLabel(roomSkin.outer),
    });
  }

  // ---- wall panels (outer + inner pair per width) ------------------------
  const innerH = H - room.wallTh;
  for (const { w, qty, skin } of tallyWalls(room, L, false)) {
    const a = area(w, H, qty);
    rows.push({
      desc: lbl.wallOuter,
      panelW: w,
      panelL: H,
      blankW: blank(w),
      blankL: H,
      panelQty: qty,
      ppgiQty: qty,
      thk: room.wallTh,
      areaSqmt: a,
      chemWeight: weight(a, room.wallTh, density),
      skin: skinLabel(skin.outer),
    });
    rows.push({
      desc: lbl.wallInner,
      panelW: w,
      panelL: innerH,
      blankW: blank(w),
      blankL: innerH,
      ppgiQty: qty,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
      skin: skinLabel(skin.inner),
    });
  }

  // ---- butt joint panels -------------------------------------------------
  // wider outer blank (+100 not +40) and a narrower inner skin
  for (const { w, qty, skin } of tallyWalls(room, L, true)) {
    const a = area(w, H, qty);
    const innerW = w - BUTT_JOINT_INNER_DELTA;
    rows.push({
      desc: lbl.buttOuter,
      panelW: w,
      panelL: H,
      blankW: w + BUTT_JOINT_BLANK_ALLOWANCE,
      blankL: H,
      panelQty: qty,
      ppgiQty: qty,
      thk: room.wallTh,
      areaSqmt: a,
      chemWeight: weight(a, room.wallTh, density),
      skin: skinLabel(skin.outer),
    });
    rows.push({
      desc: lbl.buttInner,
      panelW: innerW,
      panelL: innerH,
      blankW: blank(innerW),
      blankL: innerH,
      ppgiQty: qty,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
      skin: skinLabel(skin.inner),
    });
  }

  // ---- corner panels -----------------------------------------------------
  if (L.cornerCount > 0) {
    const outerW = room.cornerLeg * 2;
    const innerW = outerW - 2 * room.wallTh + CORNER_INNER_BEND;
    const a = area(outerW, H, L.cornerCount);
    rows.push({
      desc: lbl.cornerOuter,
      panelW: outerW,
      panelL: H,
      blankW: blank(outerW),
      blankL: H,
      panelQty: L.cornerCount,
      ppgiQty: L.cornerCount,
      thk: room.wallTh,
      areaSqmt: a,
      chemWeight: weight(a, room.wallTh, density),
      skin: skinLabel(roomSkin.outer),
    });
    rows.push({
      desc: lbl.cornerInner,
      panelW: innerW,
      panelL: innerH,
      blankW: blank(innerW),
      blankL: innerH,
      ppgiQty: L.cornerCount,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
      skin: skinLabel(roomSkin.inner),
    });
  }

  // ---- door assembly -----------------------------------------------------
  const door = room.walls.find((w) => w.door)?.door;
  if (door) {
    const off = DOOR_BLANK_OFFSETS[room.wallTh];
    if (!off) {
      throw new Error(
        `No door blank preset for ${room.wallTh}mm — add it to DOOR_BLANK_OFFSETS`,
      );
    }
    const doorSkin = skinOf(door.skin, room);
    const a = area(door.moduleW, H, 1);
    rows.push({
      desc: 'Inner Sheet',
      panelW: door.moduleW,
      panelL: H,
      blankW: door.clearW + off.innerW,
      blankL: door.clearH + off.innerH,
      panelQty: 1,
      ppgiQty: 1,
      thk: room.wallTh,
      areaSqmt: a,
      chemWeight: weight(a, room.wallTh, density),
      skin: skinLabel(doorSkin.inner),
    });
    rows.push({
      desc: 'Outer Sheet',
      blankW: door.clearW + off.outerW,
      blankL: door.clearH + off.outerH,
      ppgiQty: 1,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
      skin: skinLabel(doorSkin.outer),
    });
    rows.push({
      desc: 'Wallframe Vertical',
      blankW: WALLFRAME_BLANK_WIDTH,
      blankL: H + WALLFRAME_VERTICAL_EXTRA,
      ppgiQty: 1,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
      skin: skinLabel(doorSkin.outer),
    });
    rows.push({
      desc: 'Wallframe Top / Bottom',
      blankW: WALLFRAME_BLANK_WIDTH,
      blankL: WALLFRAME_TOP_BOTTOM_LENGTH,
      ppgiQty: 1,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
      skin: skinLabel(doorSkin.outer),
    });
    rows.push({
      desc: door.label,
      panelW: door.clearW,
      panelL: door.clearH,
      thk: room.wallTh,
      areaSqmt: 0,
      chemWeight: 0,
    });
  }

  const totals = rows.reduce(
    (t, r) => ({
      panelQty: t.panelQty + (r.panelQty ?? 0),
      ppgiQty: t.ppgiQty + (r.ppgiQty ?? 0),
      plyQty: t.plyQty + (r.plyQty ?? 0),
      chemWeight: t.chemWeight + r.chemWeight,
      areaSqmt: t.areaSqmt + r.areaSqmt,
    }),
    { panelQty: 0, ppgiQty: 0, plyQty: 0, chemWeight: 0, areaSqmt: 0 },
  );

  return {
    title: `${room.wallTh}mm (${room.name})`,
    spec: `SPECIFICATION: ${room.ext.w} X ${room.ext.l} X ${room.ext.h} MM (EXT.)`,
    rows,
    totals,
  };
}

export function buildJob(job: JobSpec): BoqBlock[] {
  return job.rooms.map((r) => buildRoomBlock(r, job.density));
}
