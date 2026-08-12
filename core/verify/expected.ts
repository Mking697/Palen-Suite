/**
 * Shape of a hand-transcribed production sheet, plus the mechanism for
 * recording places where the printed sheet disagrees with itself.
 *
 * Where a sheet contradicts the rule the other three sheets follow, the
 * engine keeps the consistent rule and the disagreement is recorded as a
 * deviation rather than quietly fitted to. The diff then shows it as a
 * warning, so nothing is hidden and nothing is fudged.
 */

export interface ExpectedRow {
  desc: string;
  panelW: number | null;
  panelL: number | null;
  blankW: number | null;
  blankL: number | null;
  panelQty: number | null;
  ppgiQty: number | null;
  thk: number;
  chemWeight: number;
  areaSqmt: number;
  /**
   * What the consistent rule gives on the fields where this sheet disagrees
   * with itself. Only the listed fields are overridden; everything else is
   * still compared against what the sheet prints.
   */
  rule?: Partial<Pick<ExpectedRow, 'ppgiQty' | 'panelQty' | 'blankW' | 'blankL'>>;
  /** why the sheet and the rule disagree on this row */
  note?: string;
}

export interface ExpectedBlock {
  title: string;
  rows: ExpectedRow[];
  /** the totals the sheet prints */
  totals: {
    panelQty: number;
    ppgiQty: number;
    /** 12mm ply, panelised floors only — omit when the sheet has no ply */
    plyQty?: number;
    chemWeight: number;
    areaSqmt: number;
  };
  /** what the consistent rule totals to, on the fields where they differ */
  ruleTotals?: Partial<ExpectedBlock['totals']>;
  /** free-text notes about this block, printed under the diff */
  notes?: string[];
}

export function row(
  desc: string,
  panelW: number | null,
  panelL: number | null,
  blankW: number | null,
  blankL: number | null,
  panelQty: number | null,
  ppgiQty: number | null,
  thk: number,
  chemWeight: number,
  areaSqmt: number,
  extra?: { rule?: ExpectedRow['rule']; note?: string },
): ExpectedRow {
  return {
    desc, panelW, panelL, blankW, blankL, panelQty, ppgiQty, thk,
    chemWeight, areaSqmt, ...extra,
  };
}
