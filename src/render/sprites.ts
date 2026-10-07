// Procedural pixel sprites, drawn once and cached as small canvases. Anchor = the point on the ground the sprite stands on.
import { COLOURS } from '../sim/rides';

export interface Spr { cv: HTMLCanvasElement; ax: number; ay: number; }
const cache = new Map<string, Spr>();
export function spr(key: string, w: number, h: number, ax: number, ay: number, draw: (c: CanvasRenderingContext2D, ax: number, ay: number) => void): Spr {
  let s = cache.get(key); if (s) return s;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  draw(c, ax, ay); s = { cv, ax, ay }; cache.set(key, s); return s;
}
export const blit = (ctx: CanvasRenderingContext2D, s: Spr, x: number, y: number) => ctx.drawImage(s.cv, Math.round(x - s.ax), Math.round(y - s.ay));
const px = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
function diamond(c: CanvasRenderingContext2D, cx: number, cy: number, fill: string, stroke?: string) {
  c.beginPath(); c.moveTo(cx, cy - 8); c.lineTo(cx + 16, cy); c.lineTo(cx, cy + 8); c.lineTo(cx - 16, cy); c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function hash(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }

// ---------- terrain ----------
const SURF: Record<number, string[]> = { 0: ['#4e8a35', '#528f38', '#4b8533', '#559239'], 1: ['#d9c88a', '#d4c383', '#dccd91', '#d1bf7e'], 2: ['#8a6a3a', '#8f6f3f', '#846536', '#937341'], 3: ['#8c8c8c', '#919191', '#868686', '#969696'], 4: ['#3d6a2d', '#39602a', '#3b652b', '#416e30'] };
const SURF_DOT: Record<number, string> = { 0: '#3f7329', 1: '#c4b375', 2: '#6f5430', 3: '#777', 4: '#2f5222' };
export function tileSprite(surf: number, variant: number, dark: boolean): Spr {
  return spr(`t${surf}.${variant}.${dark ? 1 : 0}`, 34, 18, 17, 9, (c, ax, ay) => {
    const cols = SURF[surf] ?? SURF[0]; diamond(c, ax, ay, cols[variant & 3]);
    const d = SURF_DOT[surf] ?? '#3f7329'; const r = hash(variant * 7 + surf, variant);
    px(c, ax - 5 + Math.floor(r * 7), ay + 1 + Math.floor(r * 3), 1, 1, d); px(c, ax + 3 - Math.floor(r * 5), ay - 3 + Math.floor(r * 4), 1, 1, d);
    if (variant % 3 === 0 && surf === 0) px(c, ax + 1, ay + 3, 2, 1, '#6aa446');
    if (dark) { c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.moveTo(ax, ay - 8); c.lineTo(ax + 16, ay); c.lineTo(ax, ay + 8); c.lineTo(ax - 16, ay); c.closePath(); c.fill(); }
  });
}
export function waterSprite(frame: number): Spr {
  return spr(`w${frame}`, 34, 18, 17, 9, (c, ax, ay) => {
    diamond(c, ax, ay, '#2f6fc4'); c.fillStyle = '#5c9be0';
    px(c, ax - 6 + frame, ay - 2, 5, 1, '#5c9be0'); px(c, ax + 2 - frame, ay + 3, 4, 1, '#5c9be0'); px(c, ax - 10 + (frame * 2) % 5, ay + 1, 3, 1, '#4a86d6');
  });
}
/** Vertical cliff face below a tile edge. side 0 = south-west face (left), 1 = south-east face (right); dh in pixels. */
export function cliffSprite(side: 0 | 1, dh: number, surf: number): Spr {
  return spr(`c${side}.${dh}.${surf}`, 18, dh + 10, side === 0 ? 17 : 1, 1, (c, ax, ay) => {
    const base = surf === 3 ? ['#6f6f6f', '#5f5f5f'] : surf === 1 ? ['#b8a86f', '#a4955f'] : ['#5c7a2f', '#4b6626'];
    c.fillStyle = base[side]; c.beginPath();
    if (side === 0) { c.moveTo(ax - 16, ay); c.lineTo(ax, ay + 8); c.lineTo(ax, ay + 8 + dh); c.lineTo(ax - 16, ay + dh); }
    else { c.moveTo(ax, ay + 8); c.lineTo(ax + 16, ay); c.lineTo(ax + 16, ay + dh); c.lineTo(ax, ay + 8 + dh); }
    c.closePath(); c.fill();
    c.fillStyle = surf === 3 ? '#4a4a4a' : '#6f4e2a';
    for (let i = 2; i < dh - 1; i += 5) px(c, side === 0 ? ax - 12 + (i % 3) : ax + 4 + (i % 3), ay + 6 + i, 2, 1, surf === 3 ? '#4a4a4a' : '#6f4e2a');
  });
}
// ---------- paths ----------
const PATH_COL = [['#9a9590', '#c8c3bb', '#b9b4ad'], ['#a8785a', '#d2a888', '#c08f70'], ['#a2a9a3', '#d0d6d1', '#bcc3bd']];
export function pathSprite(style: number, queue: boolean, slope: number /* -1 flat else view dir 0..3 */, variant: number): Spr {
  return spr(`p${style}.${queue ? 1 : 0}.${slope}.${variant & 3}`, 34, 36, 17, 27, (c, ax, ay) => {
    const col = PATH_COL[style] ?? PATH_COL[0];
    if (slope === -1) {
      diamond(c, ax, ay, queue ? '#a6998c' : col[0], col[1]);
      px(c, ax - 1 + (variant & 1), ay - 1, 1, 1, col[2]); px(c, ax + 6, ay + 2, 1, 1, col[2]); px(c, ax - 8, ay + 1, 1, 1, col[2]);
      if (queue) { // railings along both long edges
        c.strokeStyle = '#c02a2a'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(ax - 14, ay - 3); c.lineTo(ax - 1, ay + 4); c.stroke(); c.beginPath(); c.moveTo(ax + 1, ay - 7); c.lineTo(ax + 14, ay - 1); c.stroke();
      }
    } else {
      // ramp rising 16 px towards view direction `slope` (0: +u, 1: +v, 2: -u, 3: -v)
      const up = 16; const P = [[ax, ay - 8], [ax + 16, ay], [ax, ay + 8], [ax - 16, ay]];   // N, E, S, W corners (view)
      // corners that are "high": +u side = corners N,E (u larger) ... u increases toward +x screen-right-down: N(0) & E(1) have larger u? u-v = x-coord: E has max u-v, W min; u+v: S max, N min. +u direction = towards E and S corners.
      const high = slope === 0 ? [1, 2] : slope === 1 ? [2, 3] : slope === 2 ? [3, 0] : [0, 1];
      const pts = P.map((p, i) => [p[0], p[1] - (high.includes(i) ? up : 0)]);
      c.fillStyle = col[0]; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill();
      c.strokeStyle = col[1]; c.lineWidth = 1; c.stroke();
      // side faces under the raised edge
      c.fillStyle = '#6b665f';
      for (const [i, j] of [[1, 2], [2, 3]] as [number, number][]) { if (high.includes(i) || high.includes(j)) { c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[j][0], pts[j][1]); c.lineTo(P[j][0], P[j][1]); c.lineTo(P[i][0], P[i][1]); c.closePath(); c.fill(); } }
      // steps
      c.fillStyle = col[2]; for (let k = 1; k < 4; k++) { const t = k / 4; const a = [pts[3][0] + (pts[0][0] - pts[3][0]) * 0, 0]; void a; }
    }
  });
}
export function benchSprite(): Spr { return spr('bench', 16, 10, 8, 9, (c, ax, ay) => { px(c, ax - 6, ay - 5, 12, 2, '#8a5a2b'); px(c, ax - 6, ay - 8, 12, 2, '#8a5a2b'); px(c, ax - 5, ay - 3, 1, 3, '#444'); px(c, ax + 4, ay - 3, 1, 3, '#444'); }); }
export function lampSprite(lit: boolean): Spr { return spr(`lamp${lit ? 1 : 0}`, 6, 20, 3, 19, (c, ax, ay) => { px(c, ax, ay - 16, 1, 16, '#444'); px(c, ax - 1, ay - 19, 3, 3, lit ? '#ffe680' : '#9a9a7a'); }); }
export function binSprite(full: boolean): Spr { return spr(`bin${full ? 1 : 0}`, 6, 9, 3, 8, (c, ax, ay) => { px(c, ax - 2, ay - 6, 4, 6, '#666'); px(c, ax - 2, ay - 7, 4, 1, '#999'); if (full) px(c, ax - 1, ay - 8, 2, 1, '#e8e8e8'); }); }
export function litterSprite(kind: number): Spr { return spr(`lit${kind}`, 4, 3, 2, 2, (c, ax, ay) => { px(c, ax - 1, ay - 1, 2, 1, ['#e8e8e8', '#c9a35b', '#d9d9d9', '#b8d8ff'][kind & 3]); px(c, ax + 1, ay, 1, 1, '#aaa'); }); }
export function vomitSprite(): Spr { return spr('vomit', 6, 4, 3, 3, (c, ax, ay) => { px(c, ax - 2, ay - 2, 4, 2, '#8fbf3a'); px(c, ax - 1, ay - 3, 2, 1, '#8fbf3a'); }); }

// ---------- scenery ----------
export function scenerySprite(kind: string, rot: number, variant: number, wilted = false): Spr {
  return spr(`s.${kind}.${rot}.${variant & 3}.${wilted ? 1 : 0}`, 40, 44, 20, 42, (c, ax, ay) => {
    const v = variant & 3;
    const shadow = (w: number) => { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(ax, ay - 1, w, w / 2, 0, 0, 6.28); c.fill(); };
    switch (kind) {
      case 'tree_oak': { shadow(7); px(c, ax - 1, ay - 6, 2, 6, '#6b4a2a'); const y0 = ay - 7 - v; const greens = ['#2e7d32', '#2f8f3a', '#3a9d44', '#2b7a30'];
        c.fillStyle = '#1f5a24'; c.fillRect(ax - 7, y0 - 5, 14, 9); c.fillRect(ax - 5, y0 - 8, 10, 3); c.fillRect(ax - 2, y0 - 10, 4, 2);
        c.fillStyle = greens[v]; c.fillRect(ax - 6, y0 - 4, 12, 7); c.fillRect(ax - 4, y0 - 7, 8, 3); c.fillRect(ax - 1, y0 - 9, 2, 2);
        c.fillStyle = '#6fc06a'; c.fillRect(ax - 3, y0 - 5, 2, 1); c.fillRect(ax + 2, y0 - 2, 1, 1); break; }
      case 'tree_pine': { shadow(5); px(c, ax - 1, ay - 4, 2, 4, '#5a3d20'); const y0 = ay - 4; const g1 = ['#1f6b2a', '#246e2e', '#1d6428', '#287333'][v];
        for (let i = 0; i < 4; i++) { const w = 9 - i * 2, yy = y0 - 5 - i * 5; c.fillStyle = i % 2 ? '#174f1f' : g1; c.beginPath(); c.moveTo(ax - w, yy); c.lineTo(ax, yy - 7); c.lineTo(ax + w, yy); c.closePath(); c.fill(); } break; }
      case 'tree_palm': { shadow(5); for (let i = 0; i < 14; i++) px(c, ax - 1 + Math.round(Math.sin(i / 5) * 2), ay - i, 2, 1, i % 3 ? '#8a6a3a' : '#6b4a2a'); const top = ay - 15;
        c.strokeStyle = '#2f9e44'; c.lineWidth = 2; for (let k = 0; k < 6; k++) { const a = k * 1.05 + v * 0.3; c.beginPath(); c.moveTo(ax + 1, top); c.quadraticCurveTo(ax + 1 + Math.cos(a) * 7, top - 6, ax + 1 + Math.cos(a) * 11, top + 2 + Math.abs(Math.sin(a)) * 3); c.stroke(); } px(c, ax - 1, top - 1, 4, 2, '#8a6a3a'); break; }
      case 'tree_cherry': { shadow(6); px(c, ax - 1, ay - 6, 2, 6, '#6b4a2a'); const y0 = ay - 7; c.fillStyle = '#c75a86'; c.fillRect(ax - 7, y0 - 5, 14, 8); c.fillRect(ax - 5, y0 - 8, 10, 3); c.fillRect(ax - 2, y0 - 10, 4, 2);
        c.fillStyle = '#f2a6c4'; c.fillRect(ax - 6, y0 - 4, 12, 6); c.fillRect(ax - 4, y0 - 7, 8, 3); c.fillStyle = '#fff'; c.fillRect(ax - 3, y0 - 5, 2, 1); c.fillRect(ax + 2, y0 - 2, 1, 1); c.fillRect(ax, y0 - 8, 1, 1); break; }
      case 'bush': { shadow(5); c.fillStyle = '#2f7d32'; c.fillRect(ax - 6, ay - 6, 12, 6); c.fillRect(ax - 4, ay - 8, 8, 2); c.fillStyle = '#4caf50'; c.fillRect(ax - 4, ay - 5, 3, 2); c.fillRect(ax + 1, ay - 7, 2, 1); break; }
      case 'hedge': { c.fillStyle = '#2f7d32'; if (rot % 2 === 0) { c.beginPath(); c.moveTo(ax - 14, ay - 2); c.lineTo(ax + 2, ay + 6); c.lineTo(ax + 2, ay - 2); c.lineTo(ax - 14, ay - 10); c.closePath(); } else { c.beginPath(); c.moveTo(ax - 2, ay + 6); c.lineTo(ax + 14, ay - 2); c.lineTo(ax + 14, ay - 10); c.lineTo(ax - 2, ay - 2); c.closePath(); } c.fill(); c.fillStyle = '#4caf50'; px(c, ax - 6, ay - 5, 2, 1, '#4caf50'); px(c, ax + 4, ay - 3, 2, 1, '#4caf50'); break; }
      case 'flowers': { c.fillStyle = wilted ? '#7a6a4a' : '#5a3d20'; c.beginPath(); c.moveTo(ax, ay - 6); c.lineTo(ax + 11, ay - 1); c.lineTo(ax, ay + 5); c.lineTo(ax - 11, ay - 1); c.closePath(); c.fill();
        const cols = wilted ? ['#9a8a5a', '#8a7a4a'] : ['#e0455a', '#f0c030', '#f08bb0', '#fff']; for (let i = 0; i < 8; i++) { const a = i * 0.8 + v; px(c, ax + Math.cos(a) * 6, ay - 2 + Math.sin(a) * 2.6, 1, 1, cols[(i + v) % cols.length]); } break; }
      case 'fountain': { shadow(8); c.fillStyle = '#9aa5b1'; c.beginPath(); c.ellipse(ax, ay - 2, 12, 6, 0, 0, 6.28); c.fill(); c.fillStyle = '#3b7dd8'; c.beginPath(); c.ellipse(ax, ay - 3, 10, 4.5, 0, 0, 6.28); c.fill(); px(c, ax - 1, ay - 12, 2, 9, '#9aa5b1'); c.fillStyle = '#bfe3ff'; for (let i = 0; i < 5; i++) px(c, ax - 4 + i * 2, ay - 14 + (i % 2) * 2, 1, 2, '#bfe3ff'); break; }
      case 'statue': { shadow(6); px(c, ax - 6, ay - 4, 12, 4, '#8c8c8c'); px(c, ax - 4, ay - 7, 8, 3, '#a0a0a0'); px(c, ax - 2, ay - 16, 4, 9, '#b5b5b5'); px(c, ax - 2, ay - 19, 4, 3, '#c9c9c9'); px(c, ax - 5, ay - 14, 3, 1, '#b5b5b5'); break; }
      case 'rock': { shadow(6); c.fillStyle = '#7d7d7d'; c.fillRect(ax - 7, ay - 5, 14, 5); c.fillRect(ax - 5, ay - 8, 9, 3); c.fillStyle = '#9a9a9a'; c.fillRect(ax - 5, ay - 7, 4, 2); break; }
      case 'lamp_post': { px(c, ax, ay - 18, 1, 18, '#444'); px(c, ax - 1, ay - 21, 3, 3, '#ffe680'); break; }
      case 'sign': { px(c, ax - 1, ay - 10, 2, 10, '#6b4a2a'); px(c, ax - 8, ay - 17, 16, 7, '#e9dcae'); px(c, ax - 6, ay - 15, 12, 1, '#8e2a2a'); px(c, ax - 6, ay - 13, 8, 1, '#8e2a2a'); break; }
      case 'fence_wood': { c.strokeStyle = '#8a5a2b'; c.lineWidth = 1; if (rot % 2 === 0) { c.beginPath(); c.moveTo(ax - 15, ay - 3); c.lineTo(ax + 1, ay + 5); c.stroke(); c.beginPath(); c.moveTo(ax - 15, ay - 6); c.lineTo(ax + 1, ay + 2); c.stroke(); px(c, ax - 15, ay - 8, 1, 8, '#6b4a2a'); px(c, ax - 7, ay - 4, 1, 8, '#6b4a2a'); px(c, ax + 1, ay, 1, 8, '#6b4a2a'); } else { c.beginPath(); c.moveTo(ax - 1, ay + 5); c.lineTo(ax + 15, ay - 3); c.stroke(); c.beginPath(); c.moveTo(ax - 1, ay + 2); c.lineTo(ax + 15, ay - 6); c.stroke(); px(c, ax + 15, ay - 8, 1, 8, '#6b4a2a'); px(c, ax + 7, ay - 4, 1, 8, '#6b4a2a'); px(c, ax - 1, ay, 1, 8, '#6b4a2a'); } break; }
      case 'umbrella_table': { shadow(6); px(c, ax - 5, ay - 4, 10, 2, '#8a5a2b'); px(c, ax - 1, ay - 2, 2, 2, '#444'); px(c, ax, ay - 14, 1, 10, '#777'); c.fillStyle = v % 2 ? '#d33' : '#2b6cd9'; c.beginPath(); c.moveTo(ax - 9, ay - 12); c.lineTo(ax, ay - 17); c.lineTo(ax + 10, ay - 12); c.closePath(); c.fill(); c.fillStyle = '#fff'; px(c, ax - 3, ay - 13, 2, 1, '#fff'); px(c, ax + 3, ay - 13, 2, 1, '#fff'); break; }
      default: { px(c, ax - 3, ay - 6, 6, 6, '#c0c'); }
    }
  });
}

// ---------- stalls ----------
export function stallSprite(typeKey: string, rot: number, colour: number): Spr {
  return spr(`st.${typeKey}.${rot}.${colour}`, 40, 40, 20, 32, (c, ax, ay) => {
    const a = COLOURS[colour % COLOURS.length]; const x = ax, y = ay - 2;
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(ax, ay, 14, 7, 0, 0, 6.28); c.fill();
    if (typeKey === 'toilets') { px(c, x - 10, y - 13, 20, 13, '#8e8e8e'); px(c, x - 10, y - 15, 20, 2, '#6a6a6a'); px(c, x - 3, y - 11, 6, 4, '#2b6cd9'); px(c, x - 2, y - 10, 1, 2, '#fff'); px(c, x + 1, y - 10, 1, 2, '#fff'); px(c, x - 7, y - 7, 3, 7, '#444'); px(c, x + 4, y - 7, 3, 7, '#444'); return; }
    if (typeKey === 'first_aid') { px(c, x - 10, y - 13, 20, 13, '#f4f4f4'); px(c, x - 10, y - 15, 20, 2, '#c0392b'); px(c, x - 3, y - 11, 6, 6, '#c0392b'); px(c, x - 1, y - 10, 2, 4, '#fff'); px(c, x - 2, y - 9, 4, 2, '#fff'); px(c, x - 2, y - 4, 4, 4, '#444'); return; }
    if (typeKey === 'info_kiosk') { px(c, x - 9, y - 12, 18, 12, '#e9dcae'); px(c, x - 10, y - 15, 20, 3, '#3a8f4a'); px(c, x - 2, y - 10, 4, 5, '#fff'); px(c, x - 1, y - 9, 2, 1, '#3a8f4a'); px(c, x - 1, y - 7, 2, 2, '#3a8f4a'); px(c, x - 7, y - 6, 5, 2, '#444'); return; }
    px(c, x - 10, y - 11, 20, 11, '#e9dcae'); px(c, x - 10, y - 4, 20, 1, '#b8a97e');
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#fff' : a; c.fillRect(x - 10 + i * 2, y - 15, 2, 4); }
    px(c, x - 10, y - 16, 20, 1, '#6b3a1e');
    switch (typeKey) {
      case 'balloon_stall': px(c, x - 2, y - 9, 3, 3, '#d33'); px(c, x + 2, y - 8, 3, 3, '#2b6cd9'); px(c, x - 6, y - 8, 3, 3, '#2f9e44'); break;
      case 'ice_cream_stall': px(c, x - 1, y - 9, 3, 3, '#f8e7c8'); px(c, x - 1, y - 11, 3, 2, '#e97ab0'); break;
      case 'drink_stall': case 'lemonade_stall': px(c, x - 2, y - 10, 4, 5, typeKey === 'drink_stall' ? '#2b6cd9' : '#e9c21f'); px(c, x - 1, y - 9, 2, 1, '#fff'); break;
      case 'coffee_shop': px(c, x - 2, y - 9, 4, 4, '#7a4b2a'); px(c, x + 2, y - 8, 1, 2, '#fff'); break;
      case 'souvenir_stall': px(c, x - 3, y - 9, 6, 4, '#8e44ad'); px(c, x - 1, y - 8, 2, 2, '#fff'); break;
      case 'candy_floss_stall': px(c, x - 2, y - 10, 4, 4, '#f8a5d8'); px(c, x - 1, y - 6, 2, 2, '#fff'); break;
      case 'pizza_stall': c.fillStyle = '#e9b44c'; c.beginPath(); c.arc(x, y - 8, 3, 0, 6.28); c.fill(); px(c, x - 1, y - 9, 1, 1, '#c0392b'); px(c, x + 1, y - 8, 1, 1, '#c0392b'); break;
      case 'hot_dog_stall': px(c, x - 4, y - 9, 8, 3, '#d9a35b'); px(c, x - 3, y - 8, 6, 1, '#b5451b'); break;
      case 'fries_stall': px(c, x - 3, y - 8, 6, 4, '#c0392b'); px(c, x - 2, y - 11, 1, 3, '#f1c40f'); px(c, x, y - 12, 1, 4, '#f1c40f'); px(c, x + 2, y - 11, 1, 3, '#f1c40f'); break;
      default: px(c, x - 3, y - 9, 6, 2, '#d9a35b'); px(c, x - 3, y - 7, 6, 1, '#7a3b16'); px(c, x - 3, y - 6, 6, 1, '#d9a35b');
    }
    // door faces the entrance side
    const d = rot & 3; if (d === 1) px(c, x + 6, y - 6, 3, 6, '#444'); else if (d === 3) px(c, x - 9, y - 6, 3, 6, '#444'); else if (d === 0) px(c, x + 2, y - 5, 6, 5, '#5a4a3a'); else px(c, x - 8, y - 5, 6, 5, '#5a4a3a');
  });
}
export function hutSprite(exit: boolean): Spr {
  return spr(`hut${exit ? 1 : 0}`, 20, 20, 10, 15, (c, ax, ay) => { px(c, ax - 5, ay - 9, 10, 9, exit ? '#c0392b' : '#2f9e44'); px(c, ax - 6, ay - 11, 12, 2, '#333'); px(c, ax - 2, ay - 7, 4, 2, '#ffe680'); px(c, ax - 1, ay - 4, 2, 4, '#222'); });
}
export function entranceSprite(): Spr {
  // two-tile-wide arch over the path, drawn centred on the shared corner between the two tiles
  return spr('entrance', 80, 44, 40, 36, (c, ax, ay) => {
    px(c, ax - 24, ay - 30, 3, 30, '#b5894a'); px(c, ax + 22, ay - 30, 3, 30, '#b5894a');
    c.fillStyle = '#8e2a2a'; c.beginPath(); c.moveTo(ax - 27, ay - 30); c.lineTo(ax + 27, ay - 30); c.lineTo(ax + 27, ay - 22); c.lineTo(ax - 27, ay - 22); c.closePath(); c.fill();
    c.fillStyle = '#ffe680'; for (let i = 0; i < 9; i++) px(c, ax - 22 + i * 6, ay - 27, 2, 2, '#ffe680');
    px(c, ax - 20, ay - 33, 40, 3, '#e9c21f');
  });
}
// ---------- people ----------
export function peepSprite(shirt: number, trousers: number, hair: number, frame: number, kind = 'guest'): Spr {
  return spr(`pp.${kind}.${shirt}.${trousers}.${hair}.${frame}`, 12, 14, 6, 13, (c, ax, ay) => {
    const sc = COLOURS[shirt % COLOURS.length]; const tc = ['#2d2d2d', '#1f3a6b', '#5a3a1a', '#444'][trousers & 3]; const hc = ['#2b1d0e', '#5a3a1a', '#d9b36b', '#1a1a1a', '#8a1e1e'][hair % 5];
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(ax, ay, 3, 1.5, 0, 0, 6.28); c.fill();
    const bob = frame & 1; px(c, ax - 1, ay - 2, 1, 2, tc); px(c, ax + 1, ay - 2 + bob, 1, 2 - bob, tc);
    px(c, ax - 1, ay - 5, 3, 3, sc); px(c, ax - 1, ay - 8, 3, 3, '#f3c98b'); px(c, ax - 1, ay - 9, 3, 1, hc);
    if (kind === 'handyman') { px(c, ax + 2, ay - 6, 1, 6, '#8a5a2b'); px(c, ax + 1, ay - 1, 3, 1, '#e9c21f'); }
    if (kind === 'mechanic') { px(c, ax - 4, ay - 4, 3, 2, '#c0392b'); }
    if (kind === 'security') { px(c, ax - 1, ay - 10, 3, 1, '#1f3a6b'); }
    if (kind === 'entertainer') { px(c, ax - 2, ay - 10, 5, 1, '#e9c21f'); px(c, ax - 1, ay - 11, 3, 1, '#e9c21f'); }
  });
}
export function balloonSprite(colour: number): Spr { return spr(`bal${colour}`, 5, 12, 2, 11, (c, ax, ay) => { px(c, ax, ay - 7, 1, 7, '#555'); px(c, ax - 1, ay - 11, 3, 4, COLOURS[colour % COLOURS.length]); }); }
export function umbrellaSprite(colour: number): Spr { return spr(`umb${colour}`, 11, 8, 5, 7, (c, ax, ay) => { c.fillStyle = COLOURS[colour % COLOURS.length]; c.beginPath(); c.moveTo(ax - 5, ay - 3); c.lineTo(ax, ay - 7); c.lineTo(ax + 6, ay - 3); c.closePath(); c.fill(); px(c, ax, ay - 3, 1, 3, '#444'); }); }
export function duckSprite(frame: number): Spr { return spr(`duck${frame}`, 8, 6, 4, 5, (c, ax, ay) => { px(c, ax - 2, ay - 2, 4, 2, '#fff'); px(c, ax + 1, ay - 4, 2, 2, '#2f9e44'); px(c, ax + 3, ay - 3 + (frame & 1), 1, 1, '#e9c21f'); }); }
