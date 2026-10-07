// Camera and isometric projection with four rotations. Internal pixels: a tile is 32 wide, 16 tall, a height unit is 8.
import { Z_PX, type Dir, type GameState } from '../sim/types';

export const TW = 32, TH = 16;
export interface Camera { x: number; y: number; scale: number; rot: Dir; }   // x,y = world tile coords at the screen centre; scale = CSS px per internal px
export const SCALES = [1, 1.5, 2, 3, 4];

/** Rotate a world tile coordinate into view space (u, v). */
export function toView(x: number, y: number, rot: Dir, w: number, h: number): [number, number] {
  switch (rot) { case 0: return [x, y]; case 1: return [y, w - x]; case 2: return [w - x, h - y]; default: return [h - y, x]; }
}
export function fromView(u: number, v: number, rot: Dir, w: number, h: number): [number, number] {
  switch (rot) { case 0: return [u, v]; case 1: return [w - v, u]; case 2: return [w - u, h - v]; default: return [v, h - u]; }
}
export const viewDir = (d: Dir, rot: Dir): Dir => (((d - rot) & 3) as Dir);

export class Projector {
  bw = 0; bh = 0; ox = 0; oy = 0;
  constructor(public cam: Camera, public g: GameState) {}
  setBuffer(bw: number, bh: number) {
    this.bw = bw; this.bh = bh;
    const [cu, cv] = toView(this.cam.x, this.cam.y, this.cam.rot, this.g.w, this.g.h);
    this.ox = Math.round(bw / 2 - (cu - cv) * TW / 2); this.oy = Math.round(bh / 2 - (cu + cv) * TH / 2);
  }
  /** world → internal screen px (point at tile coords x,y and height z) */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const [u, v] = toView(x, y, this.cam.rot, this.g.w, this.g.h);
    return { x: this.ox + (u - v) * TW / 2, y: this.oy + (u + v) * TH / 2 - z * Z_PX };
  }
  /** internal screen px → world tile coords at height z (float) */
  unproject(px: number, py: number, z: number): { x: number; y: number } {
    const a = (px - this.ox) / (TW / 2), b = (py - this.oy + z * Z_PX) / (TH / 2);
    const u = (a + b) / 2, v = (b - a) / 2;
    const [x, y] = fromView(u, v, this.cam.rot, this.g.w, this.g.h); return { x, y };
  }
  /** The tile under a screen point, taking land height into account: test from the front (greatest depth) backwards. */
  hitTile(px: number, py: number): { x: number; y: number } | null {
    const g = this.g; let best: { x: number; y: number; depth: number } | null = null;
    for (let dz = 0; dz <= 14; dz++) {   // height steps to try
      const w = this.unproject(px, py, dz * 2);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const x = tx + ox, y = ty + oy; if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
        const t = g.tiles[y * g.w + x]; const z = t.water ? t.h + 2 : t.h;
        const ww = this.unproject(px, py, z); if (Math.floor(ww.x) !== x || Math.floor(ww.y) !== y) continue;
        const [u, v] = toView(x, y, this.cam.rot, g.w, g.h); const depth = u + v + z * 0.001;
        if (!best || depth > best.depth) best = { x, y, depth };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }
}
