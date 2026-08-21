/**
 * A ZIP writer, stored (uncompressed), with no dependency.
 *
 * An `.xlsx` is a ZIP of XML files. Written *stored* rather than deflated it
 * needs no compressor at all — which is the whole reason the workbook can be
 * built here without adding the first npm package to this repo. A BOQ workbook
 * is a few tens of kilobytes of XML; the compression is not worth a dependency.
 *
 * CRC32 is the one piece that cannot be skipped: the format carries a checksum
 * of every entry and Excel refuses a file whose checksums do not match.
 *
 * Nothing in here knows what a BOQ is. It takes named byte arrays and returns
 * the archive.
 */

/** The standard CRC-32 table, built once. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** the path inside the archive, e.g. `xl/worksheets/sheet1.xml` */
  name: string;
  data: Uint8Array;
}

/**
 * A fixed timestamp on every entry — 1 January 2026, 12:00 — rather than the
 * clock.
 *
 * The same job exported twice produces byte-identical files, which is worth
 * more here than a true modification date nobody reads: a test can assert on
 * the bytes, and a push that re-files an unchanged job does not look like a
 * change. The date a job was exported is recorded where it can be read — in
 * `job_exports` and on the sheet's own timestamp column.
 */
const DOS_TIME = (12 << 11) | (0 << 5) | 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const utf8 = (s: string) => new TextEncoder().encode(s);

/** Little-endian writer over a growing array. */
class Out {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v);
    this.u8(v >>> 8);
  }
  u32(v: number) {
    this.u16(v & 0xffff);
    this.u16(v >>> 16);
  }
  raw(b: Uint8Array) {
    for (const v of b) this.bytes.push(v);
  }
  get length() {
    return this.bytes.length;
  }
}

export function zipStored(entries: ZipEntry[]): Uint8Array {
  const out = new Out();
  const dir: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];

  for (const e of entries) {
    const name = utf8(e.name);
    const crc = crc32(e.data);
    dir.push({ name, crc, size: e.data.length, offset: out.length });

    out.u32(0x04034b50); //  local file header
    out.u16(20); //  version needed
    out.u16(0); //  flags — names are ASCII, so no UTF-8 bit
    out.u16(0); //  method 0 = stored
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(crc);
    out.u32(e.data.length); //  compressed — the same, stored
    out.u32(e.data.length);
    out.u16(name.length);
    out.u16(0); //  no extra field
    out.raw(name);
    out.raw(e.data);
  }

  const cdStart = out.length;
  for (const d of dir) {
    out.u32(0x02014b50); //  central directory header
    out.u16(20); //  version made by
    out.u16(20); //  version needed
    out.u16(0);
    out.u16(0);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(d.crc);
    out.u32(d.size);
    out.u32(d.size);
    out.u16(d.name.length);
    out.u16(0); //  extra
    out.u16(0); //  comment
    out.u16(0); //  disk number
    out.u16(0); //  internal attributes
    out.u32(0); //  external attributes
    out.u32(d.offset);
    out.raw(d.name);
  }
  const cdSize = out.length - cdStart;

  out.u32(0x06054b50); //  end of central directory
  out.u16(0);
  out.u16(0);
  out.u16(dir.length);
  out.u16(dir.length);
  out.u32(cdSize);
  out.u32(cdStart);
  out.u16(0); //  no archive comment

  return new Uint8Array(out.bytes);
}

/**
 * Read a stored archive back — entry name to bytes.
 *
 * Here so that `core/verify/export.test.ts` can open the workbook it just
 * wrote and read the XML inside, rather than asserting on an opaque blob. A
 * test that cannot see into the file it produced is a test that only proves
 * bytes were emitted.
 */
export function unzipStored(archive: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let i = 0;
  while (i + 4 <= archive.length && view.getUint32(i, true) === 0x04034b50) {
    const size = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const nameAt = i + 30;
    const dataAt = nameAt + nameLen + extraLen;
    const name = new TextDecoder().decode(archive.subarray(nameAt, nameAt + nameLen));
    out.set(name, archive.subarray(dataAt, dataAt + size));
    i = dataAt + size;
  }
  return out;
}
