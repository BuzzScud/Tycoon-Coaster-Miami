// Ink drawings of everything in the park, in today's shapes and colours: every stall and facility, every flat ride
// (with its animation), ride huts, the park gate, every scenery kind, guests and staff, and the coasters.
import * as THREE from 'three';
import { COLOURS, RIDE_BY_KEY } from '../sim/rides';
import type { GameState, Ride } from '../sim/types';
import { PIECE_BY_KEY, isStation } from '../sim/track';
import { HU, hexOf } from '../three/world';
import { trackFrames } from '../three/coaster';
import { Sketch, buildGroup, type InkStyle } from './kit';

export const rideCol = (r: Ride, i: number) => hexOf(COLOURS[r.colours[i] % COLOURS.length]);
/** A drawn ride: its group, its animation, and seat markers on the moving parts (riders are drawn on them). */
export interface InkModel { group: THREE.Group; animate: (t: number, running: boolean) => void; seats?: THREE.Object3D[] }
/** An empty marker where a rider sits: origin on the seat, facing +x. */
export function seat(parent: THREE.Object3D, x: number, y: number, z: number, ry = 0): THREE.Object3D { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; }
const still = (group: THREE.Group): InkModel => ({ group, animate: () => {} });
/** Build a sketch drawn by fn into a group (optionally placed). */
function draw(s: InkStyle, fn: (sk: Sketch) => void, x = 0, y = 0, z = 0): THREE.Group { const sk = new Sketch(); fn(sk); const g = buildGroup(sk, s); g.position.set(x, y, z); return g; }

// ---------- small helpers ----------
/** A four-sided pyramid roof: base square of half-size a at height y0, apex h above. */
function pyramid(sk: Sketch, color: number, a: number, y0: number, h: number) {
  const c: [number, number, number][] = [[-a, y0, -a], [a, y0, -a], [a, y0, a], [-a, y0, a]]; const top: [number, number, number] = [0, y0 + h, 0];
  for (let i = 0; i < 4; i++) sk.quad([c[i], c[(i + 1) % 4], top], color, null);
  sk.line([...c, c[0]], 'edge'); for (const p of c) sk.line([p, top], 'edge');
}
/** A cone tent split into coloured slices, apex up. */
function stripedCone(sk: Sketch, a: number, b: number, r: number, y0: number, h: number, n = 20) {
  const top: [number, number, number] = [0, y0 + h, 0]; const p = (i: number): [number, number, number] => [Math.cos((i / n) * Math.PI * 2) * r, y0, Math.sin((i / n) * Math.PI * 2) * r];
  for (let i = 0; i < n; i++) { sk.quad([p(i), p(i + 1), top], i % 2 ? b : a, null); if (i % 2 === 0) sk.line([p(i), top], 'fine'); }
  sk.ring(0, y0, 0, r, n, 'edge');
}
/** A vertical circle in the x-y plane at depth z. */
function vring(sk: Sketch, r: number, z: number, cls: 'edge' | 'fine' = 'edge', n = 32) { const pts: [number, number, number][] = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, z]); } sk.line(pts, cls); }

/** Bulbs round a rim that chase while the ride runs (every other one lit, swapping), all dim when it stops. */
function chaseLights(s: InkStyle, parent: THREE.Object3D, count: number, r: number, h: number, axis: 'y' | 'z'): (t: number, running: boolean) => void {
  const at = (i: number): [number, number, number] => { const a = (i / count) * Math.PI * 2; return axis === 'y' ? [Math.cos(a) * r, h, Math.sin(a) * r] : [Math.cos(a) * r, Math.sin(a) * r, h]; };
  const ring = (col: number, odd: number) => { const sk = new Sketch(); for (let i = odd; i < count; i += 2) { const [x, y, z] = at(i); sk.part('ball', col, x, y, z, 0, 0, 0, 0.07, 0.07, 0.07, { outline: false }); } const g = buildGroup(sk, s); parent.add(g); return g; };
  const dim = [ring(0x9a8a50, 0), ring(0x9a8a50, 1)], lit = [ring(0xfff1a8, 0), ring(0xfff1a8, 1)];
  return (t, running) => { const phase = Math.floor(t * 4) % 2; lit.forEach((g, i) => { g.visible = running && i === phase; }); dim.forEach((g, i) => { g.visible = !(running && i === phase); }); };
}
/** A pennant on a short pole that waves. */
function waveFlag(s: InkStyle, parent: THREE.Object3D, x: number, y: number, z: number, col: number): (t: number) => void {
  const pole = new Sketch(); pole.line([[0, 0, 0], [0, 0.55, 0]], 'edge'); const pg = buildGroup(pole, s); pg.position.set(x, y, z); parent.add(pg);
  const fl = new Sketch(); fl.quad([[0, 0, 0], [0.34, -0.09, 0], [0, -0.18, 0]], col, 'fine'); const fg = buildGroup(fl, s); fg.position.set(0, 0.55, 0); pg.add(fg);
  return t => { fg.rotation.y = Math.sin(t * 2.6 + x) * 0.5; };
}
/** The ride operator who stands by every entrance, in uniform and cap. */
function operator(sk: Sketch) {
  sk.box(0x2d2d2d, -0.06, 0.13, 0, 0.09, 0.26, 0.12).box(0x2d2d2d, 0.06, 0.13, 0, 0.09, 0.26, 0.12).box(0x2b6cd9, 0, 0.42, 0, 0.26, 0.34, 0.16, 0, { outline: true }).box(0x2b6cd9, -0.18, 0.42, 0, 0.08, 0.3, 0.1).box(0x2b6cd9, 0.18, 0.42, 0, 0.08, 0.3, 0.1);
  sk.part('ball', 0xf3c98b, 0, 0.72, 0, 0, 0, 0, 0.22, 0.22, 0.22).box(0x1d3557, 0, 0.83, 0, 0.24, 0.06, 0.24).box(0x1d3557, 0, 0.81, -0.14, 0.2, 0.03, 0.1, 0, { lines: 'none' });
}

// ---------- stalls and facilities ----------
function stallSketch(sk: Sketch, r: Ride) {
  const d = RIDE_BY_KEY[r.type]; const a = rideCol(r, 0);
  if (d.facility === 'toilet') { sk.box(0x8e8e8e, 0, 0.45, 0, 0.9, 0.9, 0.9).box(0x6a6a6a, 0, 0.95, 0, 1.0, 0.1, 1.0).box(0x2b6cd9, 0, 0.7, -0.46, 0.3, 0.2, 0.02, 0, { cls: 'fine' }).box(0x444444, 0, 0.3, -0.46, 0.25, 0.6, 0.02, 0, { cls: 'fine' }); return; }
  if (d.facility === 'firstaid') { sk.box(0xf4f4f4, 0, 0.45, 0, 0.9, 0.9, 0.9).box(0xc0392b, 0, 0.95, 0, 1.0, 0.1, 1.0).box(0xc0392b, 0, 0.7, -0.46, 0.3, 0.3, 0.02, 0, { cls: 'fine' }).box(0xffffff, 0, 0.7, -0.475, 0.08, 0.24, 0.01, 0, { lines: 'none' }).box(0xffffff, 0, 0.7, -0.475, 0.24, 0.08, 0.01, 0, { lines: 'none' }); return; }
  if (d.facility === 'info') { sk.box(0xe9dcae, 0, 0.4, 0, 0.8, 0.8, 0.8); pyramid(sk, 0x3a8f4a, 0.55, 0.8, 0.45); sk.box(0xffffff, 0, 0.55, -0.41, 0.25, 0.3, 0.02, 0, { cls: 'fine' }).box(0x3a8f4a, 0, 0.55, -0.425, 0.06, 0.18, 0.01, 0, { lines: 'none' }); return; }
  sk.box(0xe9dcae, 0, 0.35, 0, 0.9, 0.7, 0.8).box(0x6b3a1e, 0, 0.74, 0, 0.98, 0.06, 0.9).box(0xb8a97e, 0, 0.42, -0.42, 0.9, 0.08, 0.1);
  sk.box(0x3a2a1a, 0, 0.55, -0.405, 0.6, 0.18, 0.01, 0, { lines: 'none', outline: false });   // the serving hatch
  // striped awning sloping down to the front, outlined as one sheet, with a scalloped valance
  const y0 = 0.98, y1 = 0.8, z0 = -0.12, z1 = -0.58, xs = [-0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48];
  for (let i = 0; i < 6; i++) sk.quad([[xs[i], y0, z0], [xs[i + 1], y0, z0], [xs[i + 1], y1, z1], [xs[i], y1, z1]], i % 2 ? 0xffffff : a, null);
  for (let i = 1; i < 6; i++) sk.line([[xs[i], y0, z0], [xs[i], y1, z1]], 'fine');
  sk.line([[-0.48, y0, z0], [0.48, y0, z0], [0.48, y1, z1], [-0.48, y1, z1], [-0.48, y0, z0]], 'edge');
  for (let i = 0; i < 6; i++) sk.quad([[xs[i], y1, z1], [xs[i + 1], y1, z1], [xs[i + 1], y1 - 0.07, z1], [xs[i], y1 - 0.07, z1]], i % 2 ? a : 0xffffff, 'fine');
  // what it sells, on the roof
  switch (r.type) {
    case 'balloon_stall': for (const [c, x, y, z] of [[0xd33a2f, -0.15, 1.18, 0], [0x2b6cd9, 0.12, 1.28, 0], [0x2f9e44, 0, 1.08, -0.15]] as const) { sk.part('ball', c, x, y, z, 0, 0, 0, 0.2, 0.24, 0.2); sk.line([[x, y - 0.12, z], [0, 0.77, 0]], 'fine'); } break;
    case 'ice_cream_stall': sk.part('cone', 0xf8e7c8, 0, 0.98, 0, Math.PI, 0, 0, 0.22, 0.3, 0.22).part('ball', 0xe97ab0, 0, 1.2, 0, 0, 0, 0, 0.26, 0.26, 0.26); break;
    case 'drink_stall': sk.part('cyl', 0x2b6cd9, 0, 0.98, 0, 0, 0, 0, 0.22, 0.4, 0.22).box(0xffffff, 0, 1.2, 0, 0.26, 0.05, 0.26); break;
    case 'lemonade_stall': sk.part('cyl', 0xe9c21f, 0, 0.98, 0, 0, 0, 0, 0.22, 0.4, 0.22); break;
    case 'coffee_shop': sk.part('cyl', 0x7a4b2a, 0, 0.93, 0, 0, 0, 0, 0.26, 0.3, 0.26).box(0x7a4b2a, 0.18, 0.95, 0, 0.08, 0.16, 0.04, 0, { cls: 'fine' }); break;
    case 'souvenir_stall': sk.box(0x8e44ad, 0, 0.95, 0, 0.4, 0.3, 0.1); break;
    case 'candy_floss_stall': sk.part('ball', 0xf8a5d8, 0, 1.12, 0, 0, 0, 0, 0.34, 0.3, 0.34).part('cyl6', 0xffffff, 0, 0.9, 0, 0, 0, 0, 0.04, 0.3, 0.04, { outline: false }); break;
    case 'pizza_stall': sk.part('cyl', 0xe9b44c, 0, 0.9, 0, 0.5, 0, 0, 0.42, 0.04, 0.42).part('ball', 0xc0392b, 0.08, 0.95, 0.05, 0, 0, 0, 0.08, 0.04, 0.08); break;
    case 'hot_dog_stall': sk.part('cyl', 0xd9a35b, 0, 0.93, 0, 0, 0, Math.PI / 2, 0.16, 0.45, 0.16).part('cyl6', 0xb5451b, 0, 0.97, 0, 0, 0, Math.PI / 2, 0.08, 0.5, 0.08); break;
    case 'fries_stall': sk.box(0xc0392b, 0, 0.88, 0, 0.28, 0.24, 0.16).part('box', 0xf1c40f, -0.06, 1.05, 0, 0, 0, 0.1, 0.05, 0.3, 0.05, { cls: 'fine' }).part('box', 0xf1c40f, 0.06, 1.07, 0, 0, 0, -0.1, 0.05, 0.3, 0.05, { cls: 'fine' }); break;
    default: sk.part('cyl', 0xd9a35b, 0, 0.86, 0, 0, 0, 0, 0.3, 0.1, 0.3).part('cyl', 0x7a3b16, 0, 0.93, 0, 0, 0, 0, 0.32, 0.05, 0.32).part('cyl', 0xd9a35b, 0, 1.0, 0, 0, 0, 0, 0.3, 0.09, 0.3);
  }
}

// ---------- flat rides ----------
export function inkRideModel(r: Ride, s: InkStyle): InkModel {
  const d = RIDE_BY_KEY[r.type]; const n = d.size; const c0 = rideCol(r, 0), c1 = rideCol(r, 1), c2 = rideCol(r, 2); const group = new THREE.Group();
  const add = (fn: (sk: Sketch) => void, x = 0, y = 0, z = 0) => { const g = draw(s, fn, x, y, z); group.add(g); return g; };
  if (d.kind === 'stall') { add(sk => stallSketch(sk, r)); group.rotation.y = -r.rot * Math.PI / 2 - Math.PI / 2; return still(group); }
  switch (r.type) {
    case 'merry_go_round': {
      add(sk => {
        sk.part('cyl', 0x7a5a2e, 0, 0.1, 0, 0, 0, 0, n, 0.2, n).part('cyl', 0xc9a76b, 0, 0.23, 0, 0, 0, 0, n - 0.1, 0.06, n - 0.1).part('cyl6', 0xa0a0a0, 0, 1.3, 0, 0, 0, 0, 0.12, 2.2, 0.12, { outline: false });
        sk.part('cone', c0, 0, 2.62, 0, 0, 0, 0, n + 0.2, 0.9, n + 0.2).part('cyl', 0xe9c21f, 0, 2.17, 0, 0, 0, 0, n + 0.2, 0.08, n + 0.2);
        const R = (n + 0.2) / 2, k = 12; const p = (a: number, y: number): [number, number, number] => [Math.cos(a) * R, y, Math.sin(a) * R];
        for (let i = 0; i < k; i++) { const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2; sk.quad([p(a0, 2.13), p(a1, 2.13), p(a1, 1.98), p(a0, 1.98)], i % 2 ? c1 : 0xffffff, 'fine'); }
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sk.line([[Math.cos(a) * R * 0.25, 3.02, Math.sin(a) * R * 0.25], [Math.cos(a) * R, 2.2, Math.sin(a) * R]], 'fine'); }
      });
      const spin = new THREE.Group(); group.add(spin); const horses: THREE.Group[] = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const hc = [0xffffff, c1, c2, 0xe9c21f][i % 4];
        const h = draw(s, sk => { sk.line([[0, 0.25, 0], [0, 2.05, 0]], 'fine'); sk.box(hc, 0, 0.75, 0, 0.45, 0.22, 0.18).part('box', hc, 0.2, 0.92, 0, 0, 0, 0.4, 0.18, 0.28, 0.14).box(0x333333, -0.12, 0.55, 0.05, 0.05, 0.25, 0.05, 0, { lines: 'none' }).box(0x333333, 0.12, 0.55, -0.05, 0.05, 0.25, 0.05, 0, { lines: 'none' }); });
        h.position.set(Math.cos(a) * (n / 2 - 0.35), 0, Math.sin(a) * (n / 2 - 0.35)); h.rotation.y = -a + Math.PI / 2; spin.add(h); horses.push(h); }
      const seats = horses.map(h => seat(h, -0.02, 0.86, 0));
      const bulbs = chaseLights(s, group, 16, (n + 0.2) / 2 + 0.01, 2.17, 'y'); const flag = waveFlag(s, group, 0, 3.05, 0, c1);
      return { group, seats, animate: (t, running) => { if (running) { spin.rotation.y = t; horses.forEach((h, i) => { h.position.y = Math.abs(Math.sin(t * 2 + i)) * 0.18; }); } bulbs(t, running); flag(t); } };
    }
    case 'ferris_wheel': {
      const R = n * 0.95;
      add(sk => { for (const [x, z, rz] of [[-0.6, 0, 0.35], [0.6, 0, -0.35], [-0.6, 0.6, 0.35], [0.6, 0.6, -0.35]]) sk.part('box', 0x8a8a8a, x, R / 2 + 0.2, z, 0, 0, rz, 0.12, R + 0.6, 0.12); sk.box(0x777777, 0, R + 0.3, 0.3, 0.3, 0.3, 0.9); });
      const wheel = add(sk => {
        for (const z of [0, 0.6]) { vring(sk, R + 0.05, z, 'edge'); vring(sk, R - 0.05, z, 'fine'); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sk.line([[0, 0, z], [Math.cos(a) * R, Math.sin(a) * R, z]], 'fine'); } }
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; for (const z of [0, 0.6]) sk.part('box', c0, Math.cos(a) * R, Math.sin(a) * R, z, 0, 0, a + Math.PI / 2, (Math.PI * 2 * R) / 24 + 0.05, 0.08, 0.06, { lines: 'none', outline: false }); }
      }, 0, R + 0.3, 0.3);
      const gondolas: THREE.Group[] = []; for (let i = 0; i < 8; i++) { const gc = [c1, c2, 0x2f9e44, 0xe67e22][i % 4]; const gm = draw(s, sk => { sk.box(gc, 0, -0.25, 0, 0.5, 0.4, 0.5).box(0x222222, 0, -0.47, 0, 0.5, 0.05, 0.5, 0, { cls: 'fine' }); sk.line([[0, 0, 0], [0, -0.05, 0]], 'fine'); }); group.add(gm); gondolas.push(gm); }
      const place = (a0: number) => gondolas.forEach((gm, i) => { const a = (i / 8) * Math.PI * 2 + a0; gm.position.set(Math.cos(a) * R, R + 0.3 + Math.sin(a) * R, 0.6); });
      const seats = gondolas.flatMap(gm => [seat(gm, -0.12, -0.43, 0, Math.PI / 2), seat(gm, 0.12, -0.43, 0, Math.PI / 2)]);
      const bulbs = chaseLights(s, wheel, 24, R + 0.08, 0, 'z');
      place(0); return { group, seats, animate: (t, running) => { const a0 = running ? t * 0.45 : 0; wheel.rotation.z = a0; place(a0); bulbs(t, running); } };
    }
    case 'twist': {
      add(sk => { sk.part('cyl', 0x555555, 0, 0.08, 0, 0, 0, 0, n, 0.16, n).part('cyl', 0x7f8c8d, 0, 0.18, 0, 0, 0, 0, n - 0.1, 0.05, n - 0.1).part('cyl6', 0x2c3e50, 0, 0.6, 0, 0, 0, 0, 0.18, 0.9, 0.18); });
      const hub = new THREE.Group(); hub.position.y = 1.0; group.add(hub); const pods: THREE.Group[] = [];
      for (let i = 0; i < 3; i++) { const arm = new THREE.Group(); arm.rotation.y = (i / 3) * Math.PI * 2; hub.add(arm); arm.add(draw(s, sk => { sk.box(c0, 0.45, 0, 0, 0.9, 0.1, 0.1); }));
        const pg = draw(s, sk => { for (let k = 0; k < 3; k++) { const b = (k / 3) * Math.PI * 2; sk.part('box', [c1, c2, 0xe9c21f][k], Math.cos(b) * 0.28, -0.2, Math.sin(b) * 0.28, 0, -b, 0, 0.28, 0.22, 0.22); } }); pg.position.x = 0.9; arm.add(pg); pods.push(pg); }
      const seats = pods.flatMap(pg => [0, 1, 2].map(k => { const b = (k / 3) * Math.PI * 2; return seat(pg, Math.cos(b) * 0.28, -0.09, Math.sin(b) * 0.28, -b); }));
      return { group, seats, animate: (t, running) => { if (running) { hub.rotation.y = t * 1.6; pods.forEach(p => p.rotation.y = -t * 4); } } };
    }
    case 'dodgems': {
      add(sk => { sk.box(0x555555, 0, 0.05, 0, n, 0.1, n).box(0x7a7a7a, 0, 0.11, 0, n - 0.2, 0.02, n - 0.2, 0, { cls: 'fine' }); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) sk.part('cyl6', 0x999999, sx * (n / 2 - 0.1), 0.9, sz * (n / 2 - 0.1), 0, 0, 0, 0.08, 1.7, 0.08, { outline: false }); sk.box(c0, 0, 1.8, 0, n + 0.1, 0.08, n + 0.1).box(c1, 0, 1.88, 0, n - 0.6, 0.08, n - 0.6); });
      const cars: THREE.Group[] = []; for (let i = 0; i < 6; i++) { const cc = [c0, c1, c2][i % 3]; const cm = draw(s, sk => { sk.box(cc, 0, 0.22, 0, 0.4, 0.14, 0.26).box(0x222222, 0, 0.16, 0, 0.44, 0.05, 0.3, 0, { cls: 'fine' }); }); group.add(cm); cars.push(cm); }
      const move = (t: number) => cars.forEach((cm, i) => { const a = t * 0.9 + i * 1.05; const rr = n / 2 - 0.5; cm.position.set(Math.cos(a * 1.3 + i) * rr * 0.8, 0, Math.sin(a) * rr * 0.8); cm.rotation.y = -a; });
      const seats = cars.map(cm => seat(cm, 0, 0.27, 0, Math.PI / 2));
      move(0); return { group, seats, animate: (t, running) => { if (running) move(t); } };
    }
    case 'haunted_house': {
      add(sk => { sk.box(0x3b2f4a, 0, 0.75, 0, n, 1.5, n); pyramid(sk, 0x1e1628, n * 0.55, 1.5, 0.95); sk.box(0x6b5a7a, -0.5, 0.9, -n / 2 - 0.01, 0.25, 0.3, 0.02, 0, { cls: 'fine' }).box(0x6b5a7a, 0.5, 0.9, -n / 2 - 0.01, 0.25, 0.3, 0.02, 0, { cls: 'fine' }).box(0x111111, 0, 0.3, -n / 2 - 0.01, 0.3, 0.6, 0.02, 0, { cls: 'fine' }).part('cyl6', 0x555555, 0.5, 2.3, 0.4, 0, 0, 0, 0.1, 0.6, 0.1); });
      const win = add(sk => { sk.box(0xffe680, -0.5, 0.9, -n / 2 - 0.025, 0.25, 0.3, 0.02, 0, { cls: 'fine' }); }); const ghost = add(sk => { sk.part('ball', 0xe8e8ff, 0, 0, 0, 0, 0, 0, 0.3, 0.4, 0.3); }, 0.6, 2.2, -0.4);
      win.visible = false; ghost.visible = false;
      return { group, animate: (t, running) => { win.visible = running && Math.sin(t * 7) > 0.3; ghost.visible = running; ghost.position.y = 2.2 + Math.abs(Math.sin(t * 2)) * 0.4; } };
    }
    case 'observation_tower': {
      add(sk => { sk.part('cyl6', 0x9a9a9a, 0, 2.6, 0, 0, 0, 0, 0.24, 5.2, 0.24).box(0x777777, 0, 5.3, 0, 0.6, 0.2, 0.6).part('cyl6', 0xc0392b, 0, 5.7, 0, 0, 0, 0, 0.06, 0.6, 0.06, { outline: false }); });
      const cab = add(sk => { sk.part('cyl', c0, 0, 0, 0, 0, 0, 0, 1.2, 0.25, 1.2).part('cyl', 0xbfe3ff, 0, 0.2, 0, 0, 0, 0, 1.1, 0.18, 1.1).part('cyl', c0, 0, 0.36, 0, 0, 0, 0, 1.2, 0.08, 1.2); }, 0, 0.3, 0);
      const seats = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return seat(cab, Math.cos(a) * 0.42, 0.13, Math.sin(a) * 0.42, -a); });
      return { group, seats, animate: (t, running) => { cab.position.y = 0.3 + (running ? (0.5 - 0.5 * Math.cos(t * 0.5)) * 4.3 : 0); cab.rotation.y = running ? t * 0.5 : 0; } };
    }
    case 'circus': {
      add(sk => { sk.part('cyl', c0, 0, 0.3, 0, 0, 0, 0, n, 0.6, n); stripedCone(sk, c0, 0xffffff, (n * 1.05) / 2, 0.6, 1.6); sk.box(0x2c2238, 0, 0.3, -n / 2 - 0.02, 0.5, 0.6, 0.04, 0, { cls: 'fine' }); });
      const flag = waveFlag(s, group, 0, 2.2, 0, 0xe9c21f); return { group, animate: t => flag(t) };
    }
    case 'swinging_ship': {
      add(sk => { for (const [x, z, rz] of [[-0.5, -0.5, 0.35], [0.5, -0.5, -0.35], [-0.5, 0.5, 0.35], [0.5, 0.5, -0.35]]) sk.part('box', 0x8a8a8a, x, 1.0, z, 0, 0, rz, 0.1, 2.2, 0.1); sk.box(0x444444, 0, 2.0, 0, 0.3, 0.3, 1.3); });
      const pivot = add(sk => { sk.box(0xaaaaaa, 0, -0.7, 0, 0.08, 1.4, 0.08, 0, { cls: 'fine' }).box(c0, 0, -1.5, 0, 1.9, 0.35, 0.6).box(c1, 0, -1.3, 0, 1.5, 0.12, 0.62).part('box', c0, -1.0, -1.25, 0, 0, 0, 0.5, 0.3, 0.4, 0.5).part('box', c0, 1.0, -1.25, 0, 0, 0, -0.5, 0.3, 0.4, 0.5); }, 0, 2.0, 0);
      const seats = [-0.15, 0.15].flatMap(z => [0, 1, 2, 3].map(i => seat(pivot, -0.6 + i * 0.4, -1.24, z, Math.PI / 2)));
      return { group, seats, animate: (t, running) => { pivot.rotation.z = running ? Math.sin(t * 1.6) * 1.1 : 0; } };
    }
    case 'launched_freefall': {
      add(sk => { sk.box(0x8e9aa5, 0, 3.6, 0, 0.3, 7.2, 0.3).box(0xd0d8e0, 0, 3.6, 0.16, 0.1, 7.2, 0.02, 0, { cls: 'fine' }).box(0x555555, 0, 7.3, 0, 0.6, 0.3, 0.6); });
      const car = add(sk => { sk.box(c0, 0, 0, 0, 1.0, 0.3, 1.0).box(0x222222, 0, -0.18, 0, 1.0, 0.06, 1.0, 0, { cls: 'fine' }); }, 0, 0.4, 0);
      const seats = [-0.3, 0.3].flatMap(x => [-0.3, 0.3].map(z => seat(car, x, 0.15, z, Math.atan2(-z, x))));
      return { group, seats, animate: (t, running) => { car.position.y = 0.4 + (running ? Math.max(0, Math.sin(t * 1.3)) * 6.2 : 0); } };
    }
    case 'top_spin': {
      add(sk => { sk.box(c1, -0.95, 1.1, 0, 0.25, 2.2, 0.4).box(c1, 0.95, 1.1, 0, 0.25, 2.2, 0.4).box(0x555555, 0, 2.2, 0, 2.1, 0.12, 0.12); });
      const arm = add(sk => { sk.box(0x888888, 0, -0.55, 0, 0.14, 1.1, 0.14).box(c0, 0, -1.1, 0, 1.6, 0.28, 0.5); }, 0, 2.2, 0);
      const seats = Array.from({ length: 6 }, (_, i) => seat(arm, -0.6 + i * 0.24, -0.96, 0, Math.PI / 2));
      return { group, seats, animate: (t, running) => { arm.rotation.z = running ? t * 2.4 : 0; } };
    }
    case 'space_rings': {
      add(sk => { sk.part('cyl', 0x555555, 0, 0.1, 0, 0, 0, 0, 0.9, 0.2, 0.9); });
      const ringGroup = (r: number, c: number) => draw(s, sk => { sk.custom(new THREE.TorusGeometry(r, 0.04, 6, 32), c); for (const rr of [r + 0.04, r - 0.04]) { const pts: [number, number, number][] = []; for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push([Math.cos(a) * rr, Math.sin(a) * rr, 0]); } sk.line(pts, 'fine'); } }, 0, 0.75, 0);
      const r1 = ringGroup(0.45, c0), r2 = ringGroup(0.36, c1); group.add(r1, r2); const seats = [seat(group, 0, 0.5, 0)];
      return { group, seats, animate: (t, running) => { if (running) { r1.rotation.y = t * 3; r1.rotation.x = Math.PI / 2 + Math.sin(t) * 0.5; r2.rotation.x = t * 2.5; } } };
    }
    case 'motion_simulator': {
      add(sk => { sk.box(0x555555, 0, 0.1, 0, n - 0.2, 0.2, n - 0.2); for (const x of [-0.5, 0, 0.5]) sk.part('cyl6', 0x888888, x, 0.35, 0, 0, 0, 0, 0.1, 0.5, 0.1); });
      const cab = add(sk => { sk.box(c0, 0, 0.5, 0, 1.4, 0.9, 1.1).box(0xbfe3ff, 0, 0.7, -0.56, 1.0, 0.3, 0.02, 0, { cls: 'fine' }).box(0x222222, 0, 0.98, 0, 1.42, 0.05, 1.12, 0, { cls: 'fine' }); }, 0, 0.5, 0);
      return { group, animate: (t, running) => { cab.rotation.z = running ? Math.sin(t * 2) * 0.15 : 0; cab.rotation.x = running ? Math.cos(t * 1.4) * 0.12 : 0; } };
    }
    case 'spiral_slide':
      add(sk => {
        sk.part('cyl6', 0xd9d9d9, 0, 1.2, 0, 0, 0, 0, 0.5, 2.4, 0.5).part('cone', c0, 0, 2.6, 0, 0, 0, 0, 0.7, 0.5, 0.7).box(0xd9d9d9, 0, 2.3, 0, 0.8, 0.05, 0.8, 0, { cls: 'fine' });
        // the chute: a ribbon winding twice round the tower, inked along both rims
        const N = 60, inner: [number, number, number][] = [], outer: [number, number, number][] = [];
        for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 4, y = 2.2 - (i / N) * 2.0; inner.push([Math.cos(a) * 0.5, y, Math.sin(a) * 0.5]); outer.push([Math.cos(a) * 0.86, y + 0.06, Math.sin(a) * 0.86]); }
        for (let i = 0; i < N; i++) sk.quad([inner[i], outer[i], outer[i + 1], inner[i + 1]], c1, null);
        sk.line(outer, 'edge'); sk.line(inner, 'fine');
      });
      { const seats = [0, 1, 2].map(() => seat(group, 0, 0, 0)); const slide = (t: number) => seats.forEach((o, i) => { const f = (t * 0.22 + i / 3) % 1, a = f * Math.PI * 4; o.position.set(Math.cos(a) * 0.68, 2.2 - f * 2.0 + 0.02, Math.sin(a) * 0.68); o.rotation.y = -a; });
        slide(0); return { group, seats, animate: (t, running) => { if (running) slide(t); } }; }
    default:
      add(sk => { sk.box(c0, 0, 0.5, 0, n - 0.2, 1, n - 0.2); });
      return still(group);
  }
}

// ---------- huts and the gate ----------
export function inkHut(exit: boolean, s: InkStyle): THREE.Group {
  return draw(s, sk => { sk.box(exit ? 0xc0392b : 0x2f9e44, 0, 0.45, 0, 0.7, 0.9, 0.7).box(0x333333, 0, 0.95, 0, 0.85, 0.1, 0.85).box(0xffe680, 0, 0.7, -0.36, 0.3, 0.14, 0.02, 0, { cls: 'fine' }).box(0x222222, 0, 0.25, -0.36, 0.3, 0.5, 0.02, 0, { cls: 'fine' }); if (!exit) { sk.at(0.42, 0, -0.42, Math.PI); operator(sk); sk.pop(); } });
}
export function inkGate(s: InkStyle): THREE.Group {
  return draw(s, sk => { sk.box(0xb5894a, -1.1, 1.3, 0, 0.3, 2.6, 0.3).box(0xb5894a, 1.1, 1.3, 0, 0.3, 2.6, 0.3).box(0x8e2a2a, 0, 2.75, 0, 2.6, 0.5, 0.5).box(0xe9c21f, 0, 3.08, 0, 2.0, 0.14, 0.3); for (let i = 0; i < 7; i++) sk.part('ball', 0xffe680, -0.9 + i * 0.3, 2.75, -0.27, 0, 0, 0, 0.08, 0.08, 0.08, { outline: false }); });
}

// ---------- scenery ----------
export function scenerySketch(kind: string, accent?: number): Sketch {
  const sk = new Sketch();
  switch (kind) {
    case 'tree_oak': sk.part('cyl6', 0x6b4a2a, 0, 0.3, 0, 0, 0, 0, 0.16, 0.6, 0.16, { lines: 'none' }).part('ball', 0x2f8f3a, 0, 0.95, 0, 0, 0, 0, 1.0, 0.9, 1.0).part('ball', 0x3aa044, 0.25, 1.15, 0.15, 0, 0, 0, 0.6, 0.55, 0.6).part('ball', 0x287a32, -0.25, 1.1, -0.1, 0, 0, 0, 0.55, 0.5, 0.55); break;
    case 'tree_pine': sk.part('cyl6', 0x5a3d20, 0, 0.25, 0, 0, 0, 0, 0.14, 0.5, 0.14, { lines: 'none' }).part('cone', 0x1f6b2a, 0, 0.75, 0, 0, 0, 0, 0.9, 0.9, 0.9, { lines: 'none' }).part('cone', 0x246e2e, 0, 1.2, 0, 0, 0, 0, 0.7, 0.8, 0.7, { lines: 'none' }).part('cone', 0x2a7a35, 0, 1.6, 0, 0, 0, 0, 0.45, 0.7, 0.45, { lines: 'none' }); break;
    case 'tree_palm': sk.part('cyl6', 0x8a6a3a, 0.05, 0.7, 0, 0, 0, 0.12, 0.12, 1.4, 0.12, { lines: 'none' }); for (let k = 0; k < 6; k++) { const a = k * 1.047; sk.part('box', 0x2f9e44, Math.cos(a) * 0.35, 1.35 - Math.abs(Math.sin(k)) * 0.05, Math.sin(a) * 0.35, 0.35 * Math.sin(a), -a, -0.35 * Math.cos(a), 0.7, 0.05, 0.18, { lines: 'none', outline: true }); } sk.part('ball', 0x8a6a3a, 0.05, 1.4, 0, 0, 0, 0, 0.18, 0.18, 0.18); break;
    case 'tree_cherry': sk.part('cyl6', 0x6b4a2a, 0, 0.3, 0, 0, 0, 0, 0.14, 0.6, 0.14, { lines: 'none' }).part('ball', 0xf2a6c4, 0, 0.95, 0, 0, 0, 0, 0.95, 0.8, 0.95).part('ball', 0xf7c6d9, 0.25, 1.1, 0.2, 0, 0, 0, 0.5, 0.45, 0.5).part('ball', 0xe78fb3, -0.3, 1.05, -0.15, 0, 0, 0, 0.5, 0.45, 0.5); break;
    case 'bush': sk.part('ball', 0x2f7d32, 0, 0.25, 0, 0, 0, 0, 0.7, 0.5, 0.7).part('ball', 0x4caf50, 0.2, 0.3, 0.15, 0, 0, 0, 0.4, 0.35, 0.4); break;
    case 'hedge': sk.box(0x2f7d32, 0, 0.3, 0, 0.9, 0.6, 0.3, 0, { outline: true }); break;
    case 'flowers': { sk.box(0x5a3d20, 0, 0.04, 0, 0.8, 0.08, 0.8, 0, { outline: true }); const cols = [0xe0455a, 0xf0c030, 0xf08bb0, 0xffffff]; for (let i = 0; i < 9; i++) sk.part('ball', cols[i % 4], -0.3 + (i % 3) * 0.3, 0.14, -0.3 + Math.floor(i / 3) * 0.3, 0, 0, 0, 0.14, 0.12, 0.14); break; }
    case 'fountain': sk.part('cyl', 0x9aa5b1, 0, 0.1, 0, 0, 0, 0, 0.9, 0.2, 0.9).part('cyl', 0x3b7dd8, 0, 0.21, 0, 0, 0, 0, 0.75, 0.04, 0.75, { outline: false }).part('cyl', 0x9aa5b1, 0, 0.45, 0, 0, 0, 0, 0.12, 0.5, 0.12).part('ball', 0xbfe3ff, 0, 0.8, 0, 0, 0, 0, 0.3, 0.25, 0.3); break;
    case 'statue': sk.box(0x8c8c8c, 0, 0.15, 0, 0.6, 0.3, 0.6, 0, { outline: true }).box(0xb5b5b5, 0, 0.75, 0, 0.25, 0.9, 0.25, 0, { outline: true }).part('ball', 0xc9c9c9, 0, 1.3, 0, 0, 0, 0, 0.22, 0.22, 0.22).part('box', 0xb5b5b5, 0.25, 0.95, 0, 0, 0, 0.4, 0.35, 0.08, 0.1, { outline: true }); break;
    case 'rock': sk.part('ball', 0x7d7d7d, 0, 0.2, 0, 0.3, 0.2, 0, 0.7, 0.45, 0.6).part('ball', 0x9a9a9a, 0.2, 0.28, 0.1, 0, 0, 0, 0.35, 0.3, 0.35); break;
    case 'lamp_post': sk.part('cyl6', 0x444444, 0, 0.7, 0, 0, 0, 0, 0.06, 1.4, 0.06).box(0xffe680, 0, 1.45, 0, 0.18, 0.16, 0.18, 0, { outline: true }); break;
    case 'sign': sk.part('cyl6', 0x6b4a2a, -0.3, 0.5, 0, 0, 0, 0, 0.06, 1.0, 0.06).part('cyl6', 0x6b4a2a, 0.3, 0.5, 0, 0, 0, 0, 0.06, 1.0, 0.06).box(accent ?? 0xe9dcae, 0, 0.85, 0, 0.8, 0.35, 0.05, 0, { outline: true }); break;
    case 'fence_wood': for (const x of [-0.42, 0, 0.42]) sk.box(0x8a6a3a, x, 0.25, 0.45, 0.06, 0.5, 0.06, 0, { outline: true }); sk.box(0xa07a4a, 0, 0.38, 0.45, 0.95, 0.06, 0.04, 0, { outline: true }).box(0xa07a4a, 0, 0.18, 0.45, 0.95, 0.06, 0.04, 0, { outline: true }); break;
    case 'umbrella_table': sk.part('cyl', 0x8a5a2b, 0, 0.35, 0, 0, 0, 0, 0.6, 0.06, 0.6).part('cyl6', 0x666666, 0, 0.18, 0, 0, 0, 0, 0.06, 0.35, 0.06, { outline: false }).part('cyl6', 0xdddddd, 0, 0.7, 0, 0, 0, 0, 0.03, 0.7, 0.03, { outline: false }).part('cone', accent ?? 0xe0455a, 0, 1.1, 0, 0, 0, 0, 1.0, 0.25, 1.0); break;
    default: sk.box(0x8c8c8c, 0, 0.3, 0, 0.5, 0.6, 0.5, 0, { outline: true });
  }
  return sk;
}

// ---------- water rides and the railway: their track and their vehicles ----------
type TrackFrame = { p: THREE.Vector3; t: THREE.Vector3; up: THREE.Vector3 };
const at3 = (f: TrackFrame, ox: number, oy: number): [number, number, number] => { const side = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); return f.p.clone().addScaledVector(side, ox).addScaledVector(f.up, oy).toArray() as [number, number, number]; };
/** A flume's wooden trough or the rapids' wide concrete channel: floor, two walls inked along their tops, water inside. */
function channel(sk: Sketch, fr: TrackFrame[], n: number, style: 'flume' | 'rapids') {
  const W = style === 'rapids' ? 0.5 : 0.3, H = style === 'rapids' ? 0.2 : 0.26; const wall = style === 'rapids' ? 0x9d9d94 : 0x8a6a3a, floor = style === 'rapids' ? 0x86867d : 0x9c7a4f, water = style === 'rapids' ? 0x4f9fd1 : 0x6bb2dd;
  const topL: [number, number, number][] = [], topR: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = fr[i], b = fr[(i + 1) % fr.length];
    sk.quad([at3(a, -W, 0), at3(b, -W, 0), at3(b, W, 0), at3(a, W, 0)], floor, null);
    sk.quad([at3(a, -W, 0), at3(b, -W, 0), at3(b, -W, H), at3(a, -W, H)], wall, null); sk.quad([at3(a, W, 0), at3(b, W, 0), at3(b, W, H), at3(a, W, H)], wall, null);
    sk.quad([at3(a, -W + 0.03, H * 0.45), at3(b, -W + 0.03, H * 0.45), at3(b, W - 0.03, H * 0.45), at3(a, W - 0.03, H * 0.45)], water, null);
    if (style === 'rapids' && i % 3 === 0) sk.line([at3(a, -W * 0.7 + (i % 5) * 0.1, H * 0.47), at3(a, W * 0.2 + (i % 4) * 0.08, H * 0.47)], 'ripple');   // foam
  }
  for (let i = 0; i <= n; i++) { const f = fr[i % fr.length]; topL.push(at3(f, -W, H)); topR.push(at3(f, W, H)); }
  sk.line(topL, 'edge'); sk.line(topR, 'edge');
}
/** The railway: two narrow rails on wooden sleepers. */
function railTrack(sk: Sketch, fr: TrackFrame[], n: number) {
  for (const off of [-0.12, 0.12]) { const pts: [number, number, number][] = []; for (let i = 0; i <= n; i++) pts.push(at3(fr[i % fr.length], off, 0.05)); sk.line(pts, 'edge'); }
  const M = new THREE.Matrix4();
  for (let i = 0; i < fr.length; i += 1) { const f = fr[i]; const side = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); M.makeBasis(side, f.up, f.t.clone().negate()).setPosition(f.p.clone().addScaledVector(f.up, 0.01)); sk.push(M); sk.box(0x7a5a2e, 0, 0, 0, 0.42, 0.04, 0.1, 0, { cls: 'fine' }); sk.pop(); }
}
/** One car of a train: a log, a round raft, the engine or a carriage, or a coaster car. Seats go into `seats` in boarding order. */
function vehicle(s: InkStyle, style: string, k: number, col: number, seats: THREE.Object3D[]): THREE.Group {
  if (style === 'flume') { const gr = draw(s, c => { c.box(0x8a5a2b, 0, 0.1, 0, 0.32, 0.16, 0.42).part('cyl', 0x7a4e24, 0, 0.1, -0.21, Math.PI / 2, 0, 0, 0.32, 0.06, 0.16).box(0x5e3d1d, 0, 0.17, 0, 0.24, 0.04, 0.32, 0, { cls: 'fine' }); }); for (const z of [-0.08, 0.1]) seats.push(seat(gr, 0, 0.16, z, Math.PI / 2)); return gr; }
  if (style === 'rapids') { const gr = draw(s, c => { c.part('cyl', col, 0, 0.1, 0, 0, 0, 0, 0.84, 0.18, 0.84).part('cyl', 0x3a3a3a, 0, 0.13, 0, 0, 0, 0, 0.5, 0.14, 0.5, { lines: 'rings' }); }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; seats.push(seat(gr, Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3, -a + Math.PI)); } return gr; }
  if (style === 'railway' && k === 0) return draw(s, c => { c.part('cyl', 0x2d2d2d, 0, 0.2, -0.04, Math.PI / 2, 0, 0, 0.22, 0.34, 0.22).part('cyl6', 0x2d2d2d, 0, 0.36, -0.15, 0, 0, 0, 0.07, 0.14, 0.07).box(0xb8322a, 0, 0.24, 0.15, 0.3, 0.26, 0.14).box(0x2d2d2d, 0, 0.39, 0.15, 0.34, 0.04, 0.18, 0, { cls: 'fine' }).box(0x444444, 0, 0.06, 0, 0.3, 0.08, 0.44, 0, { cls: 'fine' }); });
  if (style === 'railway') { const gr = draw(s, c => { c.box(col, 0, 0.1, 0, 0.34, 0.12, 0.42).box(0x444444, 0, 0.03, 0, 0.3, 0.05, 0.42, 0, { cls: 'fine' }); for (const [x, z] of [[-0.15, -0.19], [0.15, -0.19], [-0.15, 0.19], [0.15, 0.19]]) c.box(0x666666, x, 0.3, z, 0.02, 0.36, 0.02, 0, { outline: false, lines: 'none' }); c.box(col, 0, 0.49, 0, 0.38, 0.03, 0.46, 0, { cls: 'fine' }); }); for (const [x, z] of [[-0.08, -0.1], [0.08, -0.1], [-0.08, 0.1], [0.08, 0.1]]) seats.push(seat(gr, x, 0.14, z, Math.PI / 2)); return gr; }
  const gr = draw(s, c => { c.box(col, 0, 0.14, 0, 0.36, 0.2, 0.42).box(0x222222, 0, 0.04, 0, 0.3, 0.06, 0.46, 0, { cls: 'fine' }).box(col, 0, 0.27, -0.19, 0.36, 0.1, 0.05, 0, { cls: 'fine' }); });
  for (const [x, z] of [[-0.09, -0.1], [0.09, -0.1], [-0.09, 0.1], [0.09, 0.1]]) seats.push(seat(gr, x, 0.2, z, Math.PI / 2));   // two rows of two; the train runs along -z
  return gr;
}

// ---------- coasters ----------
const STYLE: Record<string, { rail: number; tie: number; support: number; lattice: boolean }> = {
  wood: { rail: 0x3b3b3b, tie: 0x8a6a3a, support: 0x9c7a4f, lattice: true }, steel: { rail: 0xc0392b, tie: 0x777777, support: 0x9a9a9a, lattice: false },
  mine: { rail: 0x5a4a3a, tie: 0x8a6a3a, support: 0x7a5a2e, lattice: true }, inverted: { rail: 0x2b6cd9, tie: 0x555555, support: 0x8e9aa5, lattice: false },
  flume: { rail: 0x8a6a3a, tie: 0x9c7a4f, support: 0x9c7a4f, lattice: true }, rapids: { rail: 0x8f8f86, tie: 0x7d7d75, support: 0xa3a39a, lattice: false }, railway: { rail: 0x4a4a4a, tie: 0x7a5a2e, support: 0x8a6a3a, lattice: true }, junior: { rail: 0xe67e22, tie: 0x888888, support: 0xaaaaaa, lattice: false },
};
type Frame = ReturnType<typeof trackFrames>[number];
export class InkCoaster {
  group = new THREE.Group(); frames: Frame[] = []; totalM = 0; cars: THREE.Group[][] = []; seats: THREE.Object3D[][] = []; sig = ''; splashes: [number, number][] = []; spray: THREE.Group | null = null;
  constructor(public g: GameState, public ride: Ride, public s: InkStyle) { this.group.userData.rideId = ride.id; this.rebuild(); }
  signature() { const r = this.ride; return r.pieces.length + ':' + r.closedLoop + ':' + r.colours.join(',') + ':' + r.trains.length + ':' + r.pieces.map(p => p.type + p.x + ',' + p.y + ',' + p.z + p.dir + p.bank + (p.chain ? 'c' : '')).join('|'); }
  rebuild() {
    const r = this.ride, g = this.g, s = this.s; this.sig = this.signature();
    for (const ch of [...this.group.children]) { this.group.remove(ch); ch.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    this.cars = []; this.seats = []; this.frames = trackFrames(g, r.pieces, r.closedLoop); this.totalM = r.pieces.reduce((a, p) => a + PIECE_BY_KEY[p.type].length, 0); if (!this.frames.length) return;
    const def = RIDE_BY_KEY[r.type]; const style = def.coaster?.style ?? 'steel'; const st = STYLE[style]; const inv = style === 'inverted';
    const railCol = style === 'wood' || style === 'mine' ? st.rail : rideCol(r, 1);
    const fr = inv ? this.frames.map(f => ({ ...f, p: f.p.clone().addScaledVector(f.up, 0.75) })) : this.frames; const n = fr.length - (r.closedLoop ? 0 : 1);
    const side = (f: Frame) => new THREE.Vector3().crossVectors(f.t, f.up).normalize();
    const sk = new Sketch();
    if (style === 'flume' || style === 'rapids') channel(sk, fr, n, style);
    else if (style === 'railway') railTrack(sk, fr, n);
    else {
    // rails: a thin coloured band each, inked along its top
    for (const off of [-0.17, 0.17]) {
      const top: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) { const f = fr[i % fr.length]; top.push(f.p.clone().addScaledVector(side(f), off).addScaledVector(f.up, 0.05)); }
      for (let i = 0; i < n; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; const A = a.p.clone().addScaledVector(side(a), off), B = b.p.clone().addScaledVector(side(b), off); sk.quad([A.clone().addScaledVector(a.up, 0.05).toArray(), B.clone().addScaledVector(b.up, 0.05).toArray(), B.toArray(), A.toArray()] as [number, number, number][], railCol, null); }
      sk.line(top, 'edge');
    }
    if (inv) { const spine: THREE.Vector3[] = []; for (let i = 0; i <= n; i++) spine.push(fr[i % fr.length].p.clone().addScaledVector(fr[i % fr.length].up, 0.08)); sk.line(spine, 'edge'); }
    // chain lifts: a dashed line between the rails
    let sAt = 0; const chains: [number, number][] = []; for (const p of r.pieces) { const len = PIECE_BY_KEY[p.type].length; if (p.chain) chains.push([sAt, sAt + len]); sAt += len; }
    for (let i = 0; i < fr.length - 1; i += 2) { const f = fr[i]; if (chains.some(([a, b]) => f.s >= a && f.s < b)) { const q = fr[i + 1]; sk.line([f.p.clone().addScaledVector(f.up, 0.03), q.p.clone().addScaledVector(q.up, 0.03)], 'fine'); } }
    // ties across the rails
    const M = new THREE.Matrix4();
    for (let i = 0; i < fr.length; i++) { const f = fr[i]; M.makeBasis(side(f), f.up, f.t.clone().negate()).setPosition(f.p.clone().addScaledVector(f.up, -0.01)); sk.push(M); sk.box(st.tie, 0, 0, 0, 0.5, 0.04, 0.12, 0, { cls: 'fine' }); sk.pop(); }
    }
    // the railway runs on an embankment: earth sides down to the ground where it is low, a trestle where it is high
    if (style === 'railway') for (let i = 0; i < n; i++) { const a = this.frames[i], b = this.frames[(i + 1) % this.frames.length]; const ha = a.p.y - a.ground, hb = b.p.y - b.ground; if (ha > 0.9 || hb > 0.9 || ha < 0.05) continue;
      for (const off of [-0.28, 0.28]) { const A = at3(a, off, 0), B = at3(b, off, 0); sk.quad([A, B, [B[0], b.ground, B[2]], [A[0], a.ground, A[2]]], 0x9a8a72, null); }
      sk.quad([at3(a, -0.28, -0.005), at3(b, -0.28, -0.005), at3(b, 0.28, -0.005), at3(a, 0.28, -0.005)], 0xa69a86, null); }
    // supports where the track stands above the ground
    for (let i = 0; i < this.frames.length; i += st.lattice ? 2 : 3) {
      if (style === 'railway' && this.frames[i].p.y - this.frames[i].ground <= 0.9) continue;
      const f = this.frames[i]; const top = (inv ? f.p.y + 0.75 : f.p.y) - 0.03; const h = top - f.ground; if (h < 0.15) continue;
      sk.at(f.p.x, f.ground, f.p.z, Math.atan2(f.t.x, f.t.z));
      if (st.lattice) { sk.box(st.support, -0.14, h / 2, 0, 0.06, h, 0.06, 0, { cls: 'fine' }).box(st.support, 0.14, h / 2, 0, 0.06, h, 0.06, 0, { cls: 'fine' }); if (h > 0.5) sk.line([[-0.14, 0.1, 0], [0.14, h - 0.1, 0]], 'fine'); }
      else sk.part('cyl6', st.support, 0, h / 2, 0, 0, 0, 0, 0.1, h, 0.1);
      sk.pop();
    }
    // station: platform, roof and a post
    for (const p of r.pieces.filter(p => isStation(p.type))) {
      const cx = p.x + 0.5, cy = p.y + 0.5, z = p.z * HU; const along = p.dir % 2 === 0; const off = along ? [0, 0.55] : [0.55, 0];
      sk.box(0xb5b5b5, cx + off[0], z - 0.05, cy + off[1], along ? 1 : 0.5, 0.1, along ? 0.5 : 1);
      sk.box(rideCol(r, 2), cx + off[0], z + 1.0, cy + off[1], along ? 1.02 : 0.7, 0.08, along ? 0.7 : 1.02);
      sk.part('cyl6', 0x666666, cx + off[0] * 1.6, z + 0.5, cy + off[1] * 1.6, 0, 0, 0, 0.06, 1.05, 0.06, { outline: false });
    }
    this.group.add(buildGroup(sk, s));
    // trains (logs, rafts, a steam engine and its carriages, or coaster cars)
    const carCol = rideCol(r, 0);
    for (const tr of r.trains) { const list: THREE.Group[] = [], seats: THREE.Object3D[] = []; for (let k = 0; k < tr.cars; k++) {
      const gr = vehicle(s, style, k, carCol, seats);
      gr.userData.rideId = r.id; this.group.add(gr); list.push(gr);
    } this.cars.push(list); this.seats.push(seats); }
    // splashes: where they are along the track, and a little spray that plays while a boat ploughs through
    this.splashes = []; let at = 0; for (const p of r.pieces) { const len = PIECE_BY_KEY[p.type].length; if (PIECE_BY_KEY[p.type].splash) this.splashes.push([at, at + len]); at += len; }
    this.spray = null; if (this.splashes.length) { this.spray = new THREE.Group(); for (let i = 0; i < 9; i++) this.spray.add(buildGroup(new Sketch().part('ball', 0xffffff, 0, 0, 0, 0, 0, 0, 0.16, 0.16, 0.16, { outline: false }), s)); this.spray.visible = false; this.group.add(this.spray); }
    this.group.traverse(o => { o.userData.rideId = r.id; });
    this.update();
  }
  frameAt(sm: number): Frame | null {
    const fr = this.frames; if (fr.length < 2) return null; const total = this.totalM; const s = this.ride.closedLoop ? ((sm % total) + total) % total : Math.max(0, Math.min(total - 0.01, sm));
    const n = fr.length - 1; const u = s / total; const i = Math.min(n - 1, Math.floor(u * n)); const f = u * n - i; const a = fr[i], b = fr[i + 1];
    return { ...a, p: a.p.clone().lerp(b.p, f), t: a.t.clone().lerp(b.t, f).normalize(), up: a.up.clone().lerp(b.up, f).normalize(), s };
  }
  update() {
    if (this.signature() !== this.sig) { this.rebuild(); return; }
    const style = RIDE_BY_KEY[this.ride.type].coaster?.style; const inv = style === 'inverted';
    this.ride.trains.forEach((tr, i) => (this.cars[i] ?? []).forEach((car, k) => {
      const s = tr.pos - k * 2.6; const f = this.frameAt(s); if (!f || (!this.ride.closedLoop && s < 0)) { car.visible = false; return; }
      const right = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); car.visible = true;
      car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, f.up, f.t.clone().negate())); car.position.copy(f.p).addScaledVector(f.up, inv ? 0.3 : 0.05);
      if (style === 'rapids') car.rotateY(tr.pos * 0.35);   // rafts turn as they go
    }));
    // spray where a boat is in a splash at speed
    if (this.spray) { const t = performance.now() / 1000; let on: Frame | null = null; for (const tr of this.ride.trains) if (Math.abs(tr.v) > 2.2 && this.splashes.some(([a, b]) => tr.pos >= a && tr.pos < b + 1)) { on = this.frameAt(tr.pos); break; }
      this.spray.visible = !!on; if (on) this.spray.children.forEach((d, i) => { const ph = (t * 1.8 + i / 9) % 1, a = i * 0.7 + t; d.position.copy(on!.p).add(new THREE.Vector3(Math.cos(a) * (0.2 + ph * 0.5), 0.15 + ph * 0.9 - ph * ph * 0.9, Math.sin(a) * (0.2 + ph * 0.5))); d.scale.setScalar(1 - ph * 0.6); }); }
  }
  dispose() { this.group.parent?.remove(this.group); this.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
}
