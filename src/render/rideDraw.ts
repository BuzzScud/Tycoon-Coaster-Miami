// Flat rides and stalls drawn in place (animated), coaster track and trains.
import { COLOURS, RIDE_BY_KEY } from '../sim/rides';
import { PIECE_BY_KEY, pieceSample, pointAt } from '../sim/track';
import { LAND_STEP, type GameState, type Ride, type TrackPiece } from '../sim/types';
import { tileAt } from '../sim/map';
import type { Projector } from './iso';
import { stallSprite, blit } from './sprites';

const px = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
const line = (c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, col: string, w = 1) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
const shadow = (c: CanvasRenderingContext2D, x: number, y: number, w: number) => { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x, y, w, w / 2, 0, 0, 6.28); c.fill(); };

/** Draw a flat ride or stall. (x,y) = screen point of the footprint centre on the ground. */
export function drawFlatRide(c: CanvasRenderingContext2D, g: GameState, r: Ride, x: number, y: number, t: number) {
  const def = RIDE_BY_KEY[r.type]; const col = (i: number) => COLOURS[r.colours[i] % COLOURS.length];
  if (def.kind === 'stall') { blit(c, stallSprite(r.type, r.rot, r.colours[0]), x, y + 2); return; }
  const run = r.running ? t : 0; const anim = r.running ? t : 0;
  const w = def.size * 16;
  switch (r.type) {
    case 'merry_go_round': { const a0 = anim * 1.2; shadow(c, x, y, w); c.fillStyle = '#7a5a2e'; c.beginPath(); c.ellipse(x, y, w - 2, (w - 2) / 2, 0, 0, 6.28); c.fill(); c.fillStyle = '#c9a76b'; c.beginPath(); c.ellipse(x, y - 1, w - 4, (w - 4) / 2, 0, 0, 6.28); c.fill();
      px(c, x - 1, y - 26, 2, 26, '#a0a0a0');
      const horses: { hx: number; hy: number; col: string; back: boolean }[] = [];
      for (let i = 0; i < 8; i++) { const a = a0 + i * 0.785; horses.push({ hx: x + Math.cos(a) * (w - 8), hy: y + Math.sin(a) * (w - 8) / 2 - 2 - Math.abs(Math.sin(a0 * 2 + i)) * 2, col: ['#fff', col(1), col(2), '#e9c21f'][i % 4], back: Math.sin(a) < 0 }); }
      const horse = (h: typeof horses[number]) => { px(c, h.hx - 3, h.hy - 6, 6, 3, h.col); px(c, h.hx + 2, h.hy - 8, 2, 3, h.col); px(c, h.hx - 2, h.hy - 3, 1, 2, '#333'); px(c, h.hx + 1, h.hy - 3, 1, 2, '#333'); };
      horses.filter(h => h.back).forEach(horse);
      for (let i = 0; i < 8; i++) { const a = a0 + i * 0.785; px(c, x + Math.cos(a) * (w - 8), y + Math.sin(a) * (w - 8) / 2 - 16, 1, 14, '#ddd'); }
      horses.filter(h => !h.back).forEach(horse);
      c.fillStyle = col(0); c.beginPath(); c.moveTo(x - w - 4, y - 16); c.lineTo(x, y - 32); c.lineTo(x + w + 4, y - 16); c.closePath(); c.fill();
      c.fillStyle = '#fff'; for (let i = -w; i < w; i += 6) px(c, x + i, y - 17 + Math.abs(i) * 0.5, 3, 1, '#fff'); px(c, x - w - 4, y - 16, 2 * w + 8, 2, '#e9c21f'); px(c, x - 1, y - 35, 2, 4, '#e9c21f'); break; }
    case 'ferris_wheel': { const R = 24, cy = y - R - 4, a0 = anim * 0.5; shadow(c, x, y, w);
      line(c, x - 16, y + 2, x, cy, '#8a8a8a', 2); line(c, x + 16, y + 2, x, cy, '#8a8a8a', 2);
      c.strokeStyle = col(0); c.lineWidth = 1; c.beginPath(); c.arc(x, cy, R, 0, 6.28); c.stroke(); c.beginPath(); c.arc(x, cy, R - 4, 0, 6.28); c.stroke();
      for (let i = 0; i < 8; i++) { const a = a0 + i * 0.785; line(c, x, cy, x + Math.cos(a) * R, cy + Math.sin(a) * R, '#bbb'); }
      for (let i = 0; i < 8; i++) { const a = a0 + i * 0.785; const gx = x + Math.cos(a) * R, gy = cy + Math.sin(a) * R; px(c, gx - 3, gy, 6, 5, [col(1), col(2), '#2f9e44', '#e67e22'][i % 4]); px(c, gx - 3, gy + 4, 6, 1, '#222'); }
      px(c, x - 2, cy - 2, 4, 4, '#444'); break; }
    case 'spiral_slide': { shadow(c, x, y, w - 4); px(c, x - 6, y - 30, 12, 30, '#d9d9d9'); for (let i = 0; i < 6; i++) { const yy = y - 28 + i * 5; c.fillStyle = i % 2 ? col(0) : col(1); c.beginPath(); c.ellipse(x + 8, yy, 12, 5, 0, 0, 6.28); c.fill(); px(c, x - 4, yy - 2, 8, 2, '#d9d9d9'); }
      c.fillStyle = col(0); c.beginPath(); c.moveTo(x - 7, y - 30); c.lineTo(x, y - 36); c.lineTo(x + 7, y - 30); c.closePath(); c.fill(); break; }
    case 'dodgems': { c.fillStyle = '#555'; c.beginPath(); c.moveTo(x, y - w / 2); c.lineTo(x + w, y); c.lineTo(x, y + w / 2); c.lineTo(x - w, y); c.closePath(); c.fill(); c.fillStyle = '#7a7a7a'; c.beginPath(); c.moveTo(x, y - w / 2 + 2); c.lineTo(x + w - 4, y); c.lineTo(x, y + w / 2 - 2); c.lineTo(x - w + 4, y); c.closePath(); c.fill();
      for (let i = 0; i < 6; i++) { const a = run * 0.9 + i * 1.05; const cx = x + Math.cos(a) * (w - 14) * 0.8, cy = y + Math.sin(a) * (w - 14) * 0.4; px(c, cx - 3, cy - 3, 6, 3, [col(0), col(1), col(2)][i % 3]); px(c, cx - 3, cy, 6, 1, '#222'); }
      for (const [sx, sy] of [[-w + 2, 0], [w - 2, 0], [0, -w / 2 + 1], [0, w / 2 - 1]]) px(c, x + sx, y + sy - 20, 1, 20, '#999');
      c.fillStyle = col(0); c.beginPath(); c.moveTo(x, y - w / 2 - 22); c.lineTo(x + w + 2, y - 22); c.lineTo(x, y + w / 2 - 22); c.lineTo(x - w - 2, y - 22); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.moveTo(x, y - w / 2 - 22); c.lineTo(x + w + 2, y - 22); c.lineTo(x, y - 22); c.closePath(); c.fill(); break; }
    case 'haunted_house': { shadow(c, x, y, w); px(c, x - w + 2, y - 26, 2 * w - 4, 26, '#3b2f4a'); px(c, x - w + 2, y - 26, w - 2, 26, '#2c2238'); c.fillStyle = '#1e1628'; c.beginPath(); c.moveTo(x - w, y - 26); c.lineTo(x, y - 42); c.lineTo(x + w, y - 26); c.closePath(); c.fill();
      const flick = r.running && Math.sin(t * 7) > 0.3 ? '#ffe680' : '#6b5a7a'; px(c, x - 10, y - 18, 4, 5, flick); px(c, x + 6, y - 18, 4, 5, '#6b5a7a'); px(c, x - 2, y - 8, 5, 8, '#111'); px(c, x - 1, y - 36, 2, 6, '#555'); if (r.running) { const gy = y - 30 - Math.abs(Math.sin(t * 2)) * 6; px(c, x + 12, gy, 5, 6, 'rgba(230,230,255,.8)'); px(c, x + 13, gy + 2, 1, 1, '#000'); px(c, x + 15, gy + 2, 1, 1, '#000'); } break; }
    case 'observation_tower': { shadow(c, x, y, 10); px(c, x - 2, y - 64, 4, 64, '#9a9a9a'); px(c, x - 1, y - 64, 1, 64, '#ccc'); const h = r.running ? 8 + (0.5 - 0.5 * Math.cos(t * 0.6)) * 48 : 8; c.fillStyle = col(0); c.beginPath(); c.ellipse(x, y - h, 12, 5, 0, 0, 6.28); c.fill(); c.fillStyle = '#bfe3ff'; c.beginPath(); c.ellipse(x, y - h - 2, 11, 4, 0, 0, 6.28); c.fill(); px(c, x - 6, y - 70, 12, 3, '#777'); px(c, x - 1, y - 76, 2, 6, '#c0392b'); break; }
    case 'circus': { shadow(c, x, y, w); c.fillStyle = col(0); c.beginPath(); c.ellipse(x, y - 4, w - 2, (w - 2) / 2, 0, 0, 6.28); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x - w + 2, y - 4); c.lineTo(x, y - 40); c.lineTo(x + w - 2, y - 4); c.closePath(); c.fill(); c.fillStyle = col(0); for (let i = -4; i <= 4; i += 2) { c.beginPath(); c.moveTo(x + i * (w / 5), y - 4); c.lineTo(x, y - 40); c.lineTo(x + (i + 1) * (w / 5), y - 4); c.closePath(); c.fill(); }
      px(c, x - 1, y - 48, 1, 8, '#555'); px(c, x, y - 48, 5, 3, '#e9c21f'); px(c, x - 4, y - 12, 8, 8, '#2c2238'); break; }
    case 'twist': { const a0 = anim * 2.2; shadow(c, x, y, w); c.fillStyle = '#555'; c.beginPath(); c.ellipse(x, y, w - 2, (w - 2) / 2, 0, 0, 6.28); c.fill(); c.fillStyle = '#7f8c8d'; c.beginPath(); c.ellipse(x, y - 1, w - 4, (w - 4) / 2, 0, 0, 6.28); c.fill(); px(c, x - 2, y - 14, 4, 14, '#2c3e50');
      for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; const ax = x + Math.cos(a) * (w - 10), ay = y - 8 + Math.sin(a) * (w - 10) / 2; line(c, x, y - 12, ax, ay, col(0), 2); for (let k = 0; k < 3; k++) { const b = -a0 * 2 + k * 2.094; px(c, ax + Math.cos(b) * 4 - 2, ay + Math.sin(b) * 2 - 2, 4, 3, [col(1), col(2), '#e9c21f'][k]); } } break; }
    case 'swinging_ship': { const ang = r.running ? Math.sin(t * 1.6) * 1.1 : 0; shadow(c, x, y, w); line(c, x - 14, y, x, y - 30, '#8a8a8a', 2); line(c, x + 14, y, x, y - 30, '#8a8a8a', 2); line(c, x - 14, y - 8, x + 14, y - 8, '#8a8a8a', 1);
      const sx = x + Math.sin(ang) * 22, sy = y - 30 + Math.cos(ang) * 22; line(c, x, y - 30, sx, sy, '#aaa', 2); c.save(); c.translate(sx, sy); c.rotate(ang); c.fillStyle = col(0); c.beginPath(); c.moveTo(-16, -4); c.lineTo(16, -4); c.lineTo(10, 4); c.lineTo(-10, 4); c.closePath(); c.fill(); px(c, -12, -7, 24, 3, col(1)); c.restore(); px(c, x - 2, y - 32, 4, 4, '#444'); break; }
    case 'launched_freefall': { shadow(c, x, y, 10); px(c, x - 3, y - 78, 6, 78, '#8e9aa5'); px(c, x - 1, y - 78, 1, 78, '#d0d8e0'); const h = r.running ? 6 + Math.max(0, Math.sin(t * 1.4)) * 62 : 6; px(c, x - 7, y - h - 6, 14, 6, col(0)); px(c, x - 7, y - h, 14, 2, '#222'); for (let i = 0; i < 4; i++) px(c, x - 6 + i * 3.5, y - h - 9, 2, 2, '#f3c98b'); px(c, x - 5, y - 84, 10, 6, '#555'); break; }
    case 'top_spin': { const a = r.running ? t * 2.4 : 0; shadow(c, x, y, w); px(c, x - 16, y - 28, 3, 28, col(1)); px(c, x + 13, y - 28, 3, 28, col(1)); line(c, x - 14, y - 26, x + 14, y - 26, '#555', 2);
      const gx = x + Math.cos(a) * 0, gy = y - 26 + Math.sin(a) * 0; c.save(); c.translate(gx, gy); c.rotate(a); px(c, -2, -14, 4, 14, '#888'); px(c, -11, 10, 22, 5, col(0)); for (let i = 0; i < 6; i++) px(c, -10 + i * 3.6, 7, 2, 2, '#f3c98b'); c.restore(); break; }
    case 'space_rings': { const a = r.running ? t * 3 : 0; shadow(c, x, y, 10); px(c, x - 6, y - 3, 12, 3, '#555'); c.strokeStyle = col(0); c.lineWidth = 2; c.beginPath(); c.ellipse(x, y - 14, 10, 10 * Math.abs(Math.cos(a)) + 1, 0, 0, 6.28); c.stroke(); c.strokeStyle = col(1); c.beginPath(); c.ellipse(x, y - 14, 10 * Math.abs(Math.sin(a)) + 1, 10, 0, 0, 6.28); c.stroke(); px(c, x - 1, y - 16, 3, 3, '#f3c98b'); break; }
    case 'motion_simulator': { const tilt = r.running ? Math.sin(t * 2) * 0.15 : 0; shadow(c, x, y, w); px(c, x - 14, y - 6, 28, 6, '#555'); c.save(); c.translate(x, y - 8); c.rotate(tilt); px(c, -12, -16, 24, 16, col(0)); px(c, -10, -14, 20, 5, '#bfe3ff'); px(c, -12, -17, 24, 1, '#222'); c.restore(); for (let i = -1; i <= 1; i++) px(c, x + i * 8 - 1, y - 9, 2, 3, '#888'); break; }
    default: { shadow(c, x, y, w); px(c, x - w / 2, y - 12, w, 12, col(0)); }
  }
}

const RAIL: Record<string, { rail: string; sleeper: string; support: string; lattice: boolean }> = {
  wood: { rail: '#3b3b3b', sleeper: '#8a6a3a', support: '#9c7a4f', lattice: true },
  steel: { rail: '#c0392b', sleeper: '#777', support: '#9a9a9a', lattice: false },
  mine: { rail: '#5a4a3a', sleeper: '#8a6a3a', support: '#7a5a2e', lattice: true },
  inverted: { rail: '#2b6cd9', sleeper: '#555', support: '#8e9aa5', lattice: false },
  junior: { rail: '#e67e22', sleeper: '#888', support: '#aaa', lattice: false },
};
/** Draw one track piece: supports, sleepers, rails. */
export function drawPiece(c: CanvasRenderingContext2D, g: GameState, pr: Projector, r: Ride, p: TrackPiece, ghost = false, blocked = false) {
  const def = PIECE_BY_KEY[p.type]; const rdef = RIDE_BY_KEY[r.type]; const style = RAIL[rdef.coaster?.style ?? 'steel'];
  const railCol = ghost ? (blocked ? '#ff3b3b' : '#ffe600') : (rdef.coaster?.style === 'steel' || rdef.coaster?.style === 'inverted' || rdef.coaster?.style === 'junior' ? COLOURS[r.colours[1] % COLOURS.length] : style.rail);
  const inv = rdef.coaster?.style === 'inverted'; const lift = inv ? 3 : 0;
  const pts = def.samples.map(s => { const w = pieceSample(p, s); const sc = pr.project(w.x, w.y, w.z + lift); const t = tileAt(g, Math.floor(w.x), Math.floor(w.y)); const ground = t ? (t.water ? t.h + LAND_STEP : t.h) : 0; const gp = pr.project(w.x, w.y, ground); return { x: sc.x, y: sc.y, gy: gp.y, z: w.z }; });
  if (ghost) c.globalAlpha = 0.75;
  // supports
  if (!ghost) for (let i = 0; i < pts.length; i += 2) { const q = pts[i]; if (q.gy - q.y > 3) { if (style.lattice) { line(c, q.x - 3, q.y + 1, q.x - 3, q.gy, style.support); line(c, q.x + 3, q.y + 1, q.x + 3, q.gy, style.support); for (let yy = q.y + 4; yy < q.gy - 2; yy += 6) line(c, q.x - 3, yy, q.x + 3, yy + 3, '#7a5a2e'); } else { line(c, q.x, q.y + 1, q.x, q.gy, style.support, 2); } } }
  // sleepers + rails
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]; const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; const nx = -dy / L, ny = dx / L;
    for (let s = 2; s < L; s += 4) { const sx = a.x + dx * s / L, sy = a.y + dy * s / L; line(c, sx - nx * 3, sy - ny * 3, sx + nx * 3, sy + ny * 3, ghost ? railCol : style.sleeper); }
    line(c, a.x - nx * 2, a.y - ny * 2, b.x - nx * 2, b.y - ny * 2, railCol); line(c, a.x + nx * 2, a.y + ny * 2, b.x + nx * 2, b.y + ny * 2, railCol);
    if (p.chain) { c.save(); c.setLineDash([1, 2]); line(c, a.x, a.y, b.x, b.y, '#222'); c.restore(); }
    if (p.bank) line(c, a.x + nx * 2 * p.bank, a.y + ny * 2 * p.bank - 1, b.x + nx * 2 * p.bank, b.y + ny * 2 * p.bank - 1, '#fff');
  }
  if (def.station) { const a = pts[0], b = pts[pts.length - 1]; const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; const nx = -dy / L, ny = dx / L; c.fillStyle = ghost ? railCol : '#b5b5b5'; c.beginPath(); c.moveTo(a.x + nx * 4, a.y + ny * 4); c.lineTo(b.x + nx * 4, b.y + ny * 4); c.lineTo(b.x + nx * 11, b.y + ny * 11); c.lineTo(a.x + nx * 11, a.y + ny * 11); c.closePath(); c.fill();
    if (!ghost) { c.fillStyle = COLOURS[r.colours[2] % COLOURS.length]; c.beginPath(); c.moveTo(a.x + nx * 3, a.y + ny * 3 - 18); c.lineTo(b.x + nx * 3, b.y + ny * 3 - 18); c.lineTo(b.x + nx * 12, b.y + ny * 12 - 14); c.lineTo(a.x + nx * 12, a.y + ny * 12 - 14); c.closePath(); c.fill(); line(c, a.x + nx * 11, a.y + ny * 11 - 14, a.x + nx * 11, a.y + ny * 11, '#666'); line(c, b.x + nx * 11, b.y + ny * 11 - 14, b.x + nx * 11, b.y + ny * 11, '#666'); } }
  if (def.brakes && !ghost) { const m = pts[Math.floor(pts.length / 2)]; px(c, m.x - 3, m.y - 2, 6, 2, '#c0392b'); }
  if (def.booster && !ghost) { const m = pts[Math.floor(pts.length / 2)]; px(c, m.x - 3, m.y - 2, 6, 2, '#2f9e44'); }
  if (def.photo && !ghost) { const m = pts[Math.floor(pts.length / 2)]; px(c, m.x + 6, m.y - 12, 3, 12, '#555'); px(c, m.x + 5, m.y - 15, 5, 4, '#222'); px(c, m.x + 6, m.y - 14, 2, 2, '#bfe3ff'); }
  if (ghost) c.globalAlpha = 1;
}
/** Draw a train car at distance s along the track (s in metres from the first piece). */
export function drawCar(c: CanvasRenderingContext2D, g: GameState, pr: Projector, r: Ride, s: number, colour: string, riders: number, first: boolean) {
  const pos = trackPoint(r, s); if (!pos) return; const ahead = trackPoint(r, s + 1.2) ?? pos;
  const inv = RIDE_BY_KEY[r.type].coaster?.style === 'inverted'; const lift = inv ? 1.2 : 0.6;
  const A = pr.project(pos.x, pos.y, pos.z + lift), B = pr.project(ahead.x, ahead.y, ahead.z + lift);
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const len = 7, wid = 3;
  const quad = (ox: number, col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(A.x - ux * len + nx * wid, A.y - uy * len + ny * wid + ox); c.lineTo(A.x + ux * len + nx * wid, A.y + uy * len + ny * wid + ox); c.lineTo(A.x + ux * len - nx * wid, A.y + uy * len - ny * wid + ox); c.lineTo(A.x - ux * len - nx * wid, A.y - uy * len - ny * wid + ox); c.closePath(); c.fill(); };
  c.fillStyle = 'rgba(0,0,0,.2)'; const G = pr.project(pos.x, pos.y, groundUnder(g, pos.x, pos.y)); c.beginPath(); c.ellipse(G.x, G.y, 5, 2.5, 0, 0, 6.28); c.fill();
  quad(2, '#222'); quad(0, colour); quad(-2, lighten(colour));
  if (first) { c.fillStyle = '#ffe680'; c.fillRect(Math.round(A.x + ux * len - 1), Math.round(A.y + uy * len - 3), 2, 2); }
  for (let i = 0; i < Math.min(riders, 4); i++) { const o = -len + 3 + i * 3.2; px(c, A.x + ux * o - 1, A.y + uy * o - 5, 2, 2, '#f3c98b'); px(c, A.x + ux * o - 1, A.y + uy * o - 3, 2, 1, COLOURS[(i * 5 + r.id) % COLOURS.length]); }
}
function lighten(col: string) { const n = parseInt(col.slice(1), 16); const r = Math.min(255, (n >> 16) + 50), gg = Math.min(255, ((n >> 8) & 255) + 50), b = Math.min(255, (n & 255) + 50); return `rgb(${r},${gg},${b})`; }
function groundUnder(g: GameState, x: number, y: number) { const t = tileAt(g, Math.floor(x), Math.floor(y)); return t ? (t.water ? t.h + LAND_STEP : t.h) : 0; }
/** World point at distance s (m) along the whole ride (wraps around closed loops). */
export function trackPoint(r: Ride, s: number): { x: number; y: number; z: number; slope: number; piece: number } | null {
  if (!r.pieces.length) return null; const total = r.pieces.reduce((a, p) => a + PIECE_BY_KEY[p.type].length, 0); if (total <= 0) return null;
  if (r.closedLoop) { s = ((s % total) + total) % total; } else s = Math.max(0, Math.min(total - 0.01, s));
  let i = 0; while (i < r.pieces.length - 1 && s > PIECE_BY_KEY[r.pieces[i].type].length) { s -= PIECE_BY_KEY[r.pieces[i].type].length; i++; }
  return { ...pointAt(r.pieces[i], s), piece: i };
}
export const rideLength = (r: Ride) => r.pieces.reduce((a, p) => a + PIECE_BY_KEY[p.type].length, 0);
