/**
 * Wall elevations — one drawing per wall the room owns.
 *
 * Looking at the wall face on: every panel across, the door opening, and the
 * gap above a door that is shorter than the wall. Widths come from
 * `layoutRoom`; this only lays them out.
 */

import type { RoomSpec } from '../types.ts';
import { layoutRoom } from '../layout.ts';
import { compileWalls } from '../plan.ts';
import { emptyDrawing, type Drawing } from './types.ts';
import { wallSegments } from './geom.ts';

export function wallElevations(room: RoomSpec): Drawing[] {
  const walls = room.outline ? compileWalls(room.outline) : room.walls;
  const L = layoutRoom(room);
  const H = room.ext.h;

  return walls.map((wall) => {
    const run = L.wallRuns.find((r) => r.wallId === wall.id)!;
    const segs = wallSegments(run, wall, room.module);
    const clear = run.clearRun;

    const d = emptyDrawing(`${room.name} — Wall ${wall.id} elevation`, clear, H);
    d.subtitle =
      `wall ${Math.round(run.length)} · clear run ${Math.round(clear)} · height ${H}` +
      (wall.cornerStart || wall.cornerEnd
        ? ` · ${(wall.cornerStart ? 1 : 0) + (wall.cornerEnd ? 1 : 0)} corner`
        : '');
    d.fill = [
      [0, 0],
      [clear, 0],
      [clear, H],
      [0, H],
    ];

    // wall outline
    d.lines.push(
      { x1: 0, y1: 0, x2: clear, y2: 0, layer: 'WALL' },
      { x1: clear, y1: 0, x2: clear, y2: H, layer: 'WALL' },
      { x1: clear, y1: H, x2: 0, y2: H, layer: 'WALL' },
      { x1: 0, y1: H, x2: 0, y2: 0, layer: 'WALL' },
    );

    for (const s of segs) {
      if (s.a > 1) {
        d.lines.push({ x1: s.a, y1: 0, x2: s.a, y2: H, layer: 'PANEL' });
      }

      if (s.door && wall.door) {
        const top = H - wall.door.clearH;
        d.lines.push(
          { x1: s.a, y1: top, x2: s.b, y2: top, layer: 'DOOR' },
          { x1: s.a, y1: top, x2: s.a, y2: H, layer: 'DOOR' },
          { x1: s.b, y1: top, x2: s.b, y2: H, layer: 'DOOR' },
        );
        d.cells.push({
          x0: s.a,
          y0: top,
          x1: s.b,
          y1: H,
          text: `${wall.door.clearW} x ${wall.door.clearH}`,
          std: false,
        });
        // the stretch above the door. On a wall over DOOR_TOP_MIN_WALL_HEIGHT
        // it is a panel of its own and the sizes come from `layoutRoom`; below
        // it the door assembly is the full height of the wall and this is
        // already inside it, so the drawing says so rather than implying a
        // panel nobody makes
        if (top > 1) {
          d.cells.push({
            x0: s.a,
            y0: 0,
            x1: s.b,
            y1: top,
            text: L.doorTop
              ? `DOOR TOP ${L.doorTop.w} x ${L.doorTop.l}`
              : `${Math.round(s.width)} x ${Math.round(top)} in the door assembly`,
            std: !!L.doorTop,
          });
        }
      } else {
        d.cells.push({
          x0: s.a,
          y0: 0,
          x1: s.b,
          y1: H,
          text: `${Math.round(s.width)} x ${H}`,
          std: s.std,
        });
      }

      d.dims.push({
        dir: 'h',
        a: s.a,
        b: s.b,
        base: H,
        off: Math.max(260, H * 0.09),
        text: s.door ? `DOOR ${Math.round(s.width)}` : String(Math.round(s.width)),
      });
    }

    d.dims.push({
      dir: 'h',
      a: 0,
      b: clear,
      base: H,
      off: Math.max(700, H * 0.24),
      text: String(Math.round(clear)),
    });
    d.dims.push({
      dir: 'v',
      a: 0,
      b: H,
      base: clear,
      off: Math.max(260, clear * 0.06),
      text: String(H),
    });

    return d;
  });
}
