/**
 * Number formatting for BOQ output.
 *
 * Do NOT use Number.prototype.toFixed for printed BOQ values. It rounds the
 * exact binary value, so 55.815 prints as "55.81" while the production sheet
 * (Excel ROUND, half-up) prints "55.82". Every exported figure must agree with
 * the sheet, so all output goes through round2/fmt2.
 */

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((v + Number.EPSILON) * f) / f;
}

/** Fixed 2-decimal string, half-up, matching the production sheets. */
export function fmt2(v: number): string {
  const r = round2(v);
  return r.toFixed(2);
}
