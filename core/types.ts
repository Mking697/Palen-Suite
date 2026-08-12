/**
 * Domain types for the panel BOQ engine.
 *
 * All linear dimensions are millimetres unless the name says otherwise.
 * Every rule encoded here was reverse-engineered from the production
 * BOQ sheets HI-15191, HI-15223, HI-15252 and HI-15279.
 */

export type Mm = number;

/** A point on the job plan, in millimetres. */
export type Pt = [Mm, Mm];

/** A wall end is either this room's own wall, or a neighbouring room's wall. */
export type EndKind = 'own' | 'shared';

/**
 * Per-edge input that geometry cannot carry: what the drawing calls this wall,
 * where its door sits, and the two draftsman escapes.
 */
export interface EdgeOverride {
  /** wall id printed on the drawing, e.g. 'N'. Defaults to E0, E1, … */
  id?: string;
  /**
   * This side of the room is the neighbouring room's wall, so this room does
   * not own it: no panels, and no corner panel at either of its ends. This is
   * why HI-15191's ante room has 2 corner panels and not 4.
   */
  shared?: boolean;
  door?: DoorSpec;
  /** skins on this wall's panels; each side falls back to the room's */
  skin?: Partial<SkinPair>;
  /** the whole wall is a butt joint panel — wider outer blank, narrower inner */
  buttJoint?: boolean;
  /** draftsman override: split the run into this many equal pieces */
  equalPieces?: number;
  /** draftsman override: the exact widths read off the drawing */
  panels?: Mm[];
}

/**
 * At a re-entrant (concave) corner one wall runs through and the other butts
 * into its face, losing a wall thickness. Which one runs through is a
 * draftsman decision that the geometry cannot tell us, so it is stated.
 */
export interface VertexOverride {
  /** which of the two walls meeting here is continuous */
  through?: 'prev' | 'next';
  /**
   * No corner panel here. The drawings show corner panels at every square
   * outside corner because that is what the four source sheets do, but the
   * shop does not always fit one — so a corner can be turned off per junction.
   * The two walls then meet directly, one running through and the other losing
   * a wall thickness into it, exactly as at a re-entrant corner.
   */
  corner?: false;
}

/**
 * A room's external envelope as a closed polygon, clockwise, in job
 * coordinates. Edge i runs from points[i] to points[i+1]; vertex i is where
 * edge i-1 meets edge i.
 *
 * This is transcribed from the WALL PANEL LAYOUT drawing, exactly like every
 * other input — see CLAUDE.md. It is not adjusted to make a BOQ line up.
 */
export interface RoomOutline {
  points: Pt[];
  edges?: Record<number, EdgeOverride>;
  vertices?: Record<number, VertexOverride>;
}

/** One sheet material at one thickness — the skin on a face of a panel. */
export interface SkinSpec {
  material: string;
  thickness: number;
}

/** A panel has two skins, and they need not be the same material. */
export interface SkinPair {
  outer: SkinSpec;
  inner: SkinSpec;
}

export interface DoorSpec {
  /** BOQ label, e.g. "Flush Door (LHS) PP" */
  label: string;
  /** sliding / hinges / flush — see DOOR_TYPES */
  type?: string;
  /** leaf core: Puf, Rockwool or Honeycomb */
  core?: string;
  /** skins on the door leaf; defaults to the room's */
  skin?: Partial<SkinPair>;
  /** clear opening */
  clearW: Mm;
  clearH: Mm;
  /** panel module the door assembly occupies in the wall run */
  moduleW: Mm;
  /**
   * Where the door sits along the wall's clear run, as the legacy calculator
   * takes it: from one end or the other. Neither given means centred.
   *
   * The BOQ does not use these — the door module comes off the run wherever it
   * sits — but the drawing has to put the door somewhere, so stating it on the
   * job stops the drawing from having to assume.
   */
  fromLeft?: Mm;
  fromRight?: Mm;
  /**
   * Frame leg either side of the leaf, inside the door module:
   * `frame + clearW + frame = moduleW`. HI-15191 draws 160 | 860 | 160 in a
   * 1180 module. Drawing only — the BOQ blanks the door off `clearW`.
   */
  frame?: Mm;
  /** AL. chequered sheet up the leaf from its bottom edge, e.g. 600 */
  chqHeight?: Mm;
  /**
   * Door lift. The two figures are kept apart because the drawing states them
   * apart — the slab is not necessarily the whole difference, so deriving one
   * from the other would be a guess.
   */
  liftAboveFloor?: Mm;
  liftAboveGround?: Mm;
}

export interface WallSpec {
  id: string;
  /** external run of this wall, corner legs included */
  length: Mm;
  /** corner panel present at the start / end of this wall */
  cornerStart: boolean;
  cornerEnd: boolean;
  /**
   * This end butts into the face of another wall rather than meeting it at a
   * corner panel, so one wall thickness comes off the run. Used by the
   * re-entrant corners of an L-shaped room.
   */
  buttStart?: boolean;
  buttEnd?: boolean;
  /**
   * The whole wall is a butt joint panel — printed as its own BOQ line with a
   * wider outer blank and a narrower inner skin.
   */
  buttJoint?: boolean;
  /** at most one door per wall for now */
  door?: DoorSpec;
  /** skins on this wall's panels; each side falls back to the room's */
  skin?: Partial<SkinPair>;
  /**
   * Draftsman override: split the whole panel run into this many equal pieces
   * instead of filling with modules. HI-15279 does this on the freezer door
   * wall so the two panels either side of the door match (810 | door | 810).
   */
  equalPieces?: number;
  /**
   * Draftsman override: the exact panel widths, read off the drawing, for a
   * wall the automatic rule cannot reproduce. Must add up to the run — a
   * mismatch throws rather than being quietly absorbed.
   */
  panels?: Mm[];
}

/**
 * Row labels vary between sheets ("Wall Panel" vs "Wall Panels"). They carry no
 * meaning, but matching them keeps the generated block drop-in comparable.
 */
export interface RoomLabels {
  wallOuter: string;
  wallInner: string;
  buttOuter: string;
  buttInner: string;
  cornerOuter: string;
  cornerInner: string;
  roof: string;
}

export interface FloorSpec {
  /** pufSlab = one slab item at external size; panelised = split into modules */
  kind: 'pufSlab' | 'panelised';
  th: Mm;
  desc: string;
  /** panelised only, e.g. 1220 */
  module?: Mm;
}

export interface CeilingSpec {
  /** which axis the ceiling panels are split along; the other axis is panel length */
  splitAxis: 'w' | 'l';
  /** what sits at each end of the w axis / l axis */
  wEnds: [EndKind, EndKind];
  lEnds: [EndKind, EndKind];
}

export interface RoomSpec {
  name: string;
  /** external envelope */
  ext: { w: Mm; l: Mm; h: Mm };
  wallTh: Mm;
  ceilTh: Mm;
  floor: FloorSpec;
  ceiling: CeilingSpec;
  walls: WallSpec[];
  /**
   * The room's plan geometry. `walls` is compiled from this by
   * `compileWalls` in core/plan.ts, and the drawings read the same outline, so
   * a drawing can never disagree with the BOQ about where a wall is.
   */
  outline?: RoomOutline;
  /**
   * Where this room sits on the job plan, in millimetres. Rooms that share a
   * wall are placed touching, so one layout drawing shows the whole job the
   * way the WALL PANEL LAYOUT does. It has no effect on the BOQ — moving a
   * room changes nothing about what it is built from.
   */
  at?: Pt;
  /** panel module for wall + ceiling, e.g. 1180 or 1030 */
  module: Mm;
  cornerLeg: Mm;
  minPanelWidth: Mm;
  /** upper bound when the engine decides how many pieces a balance needs */
  maxSplitPieces: number;
  /** draftsman override: force every balance into exactly this many pieces */
  balancePieces?: number;
  /** override any of the printed row labels for this room */
  labels?: Partial<RoomLabels>;
  /** default skins for every panel in the room; a wall may override its own */
  skin?: Partial<SkinPair>;
  /**
   * Rooms that share a boqGroup are printed as one SHEET FABRICATION block.
   * In the source sheets this happens when attached rooms share a thickness.
   */
  boqGroup?: string;
}

export interface JobSpec {
  jobNo: string;
  /** PUF chemical density, kg/m3. Source sheets are all computed at 40. */
  density: number;
  rooms: RoomSpec[];
}

/** One printed line of the SHEET FABRICATION table. */
export interface BoqRow {
  desc: string;
  panelW?: Mm;
  panelL?: Mm;
  blankW?: Mm;
  blankL?: Mm;
  /** "Sheet Panel" column — blank on (Inner) and frame rows */
  panelQty?: number;
  /** "PPGI 0.4MM" column */
  ppgiQty?: number;
  /** "PLY 12MM" column */
  plyQty?: number;
  thk: Mm;
  /** kg — only carried on the row that owns the foam */
  chemWeight: number;
  areaSqmt: number;
  /**
   * The sheet this row's skin is cut from, e.g. "PPGI 0.4". Every verified
   * sheet is PPGI 0.4 throughout, so this is display only and the diff does
   * not compare it.
   */
  skin?: string;
}

export interface BoqBlock {
  /** e.g. "120mm (Freezer Room)" */
  title: string;
  /** e.g. "SPECIFICATION: 3050 X 4575 X 2590 MM (EXT.)" */
  spec: string;
  rows: BoqRow[];
  totals: {
    panelQty: number;
    ppgiQty: number;
    plyQty: number;
    chemWeight: number;
    areaSqmt: number;
  };
}
