// Coaster track as a smooth spline with two rails, ties, supports and a station; trains that follow it with banking.
import * as THREE from 'three';
import type { GameState, Ride, TrackPiece } from '../sim/types';
import { TILE_M } from '../sim/types';
import { RIDE_BY_KEY, COLOURS } from '../sim/rides';
import { PIECE_BY_KEY, pieceSample, sampleUp, isStation } from '../sim/track';
import { tileAt, surfaceZ } from '../sim/map';
import { HU, MAT, BOX, SPH, CYL6, part, merge, mesh, hexOf, MAT_GHOST, MAT_BLOCKED } from './world';

const STYLE: Record<string, { rail: number; tie: number; support: number; lattice: boolean; railW: number }> = {
  wood: { rail: 0x3b3b3b, tie: 0x8a6a3a, support: 0x9c7a4f, lattice: true, railW: 0.05 },
  steel: { rail: 0xc0392b, tie: 0x777777, support: 0x9a9a9a, lattice: false, railW: 0.06 },
  mine: { rail: 0x5a4a3a, tie: 0x8a6a3a, support: 0x7a5a2e, lattice: true, railW: 0.05 },
  inverted: { rail: 0x2b6cd9, tie: 0x555555, support: 0x8e9aa5, lattice: false, railW: 0.07 },
  junior: { rail: 0xe67e22, tie: 0x888888, support: 0xaaaaaa, lattice: false, railW: 0.05 },
  flume: { rail: 0x8a6a3a, tie: 0x9c7a4f, support: 0x9c7a4f, lattice: true, railW: 0.05 }, rapids: { rail: 0x9d9d94, tie: 0x86867d, support: 0xa3a39a, lattice: false, railW: 0.05 },
  railway: { rail: 0x4a4a4a, tie: 0x7a5a2e, support: 0x8a6a3a, lattice: true, railW: 0.04 },
};
interface Frame { p: THREE.Vector3; t: THREE.Vector3; up: THREE.Vector3; bank: number; s: number; ground: number; }

/** World-space sample points for a list of pieces (metres along the track kept in s). */
export function trackFrames(g: GameState, pieces: TrackPiece[], closed: boolean): Frame[] {
  const pts: { p: THREE.Vector3; s: number; up: THREE.Vector3 }[] = []; let s = 0;
  pieces.forEach(pc => {
    const def = PIECE_BY_KEY[pc.type];
    for (const smp of def.samples) {
      const w = pieceSample(pc, smp); const p = new THREE.Vector3(w.x, w.z * HU, w.y);
      if (pts.length && pts[pts.length - 1].p.distanceToSquared(p) < 1e-6) continue;   // an old piece starts where the last one ended
      const [ux, uy, uz] = sampleUp(pc, smp); const up = new THREE.Vector3(ux, uz, uy);
      pts.push({ p, s: s + smp.s, up });
    }
    s += def.length;
  });
  if (!pts.length) return [];
  const curve = new THREE.CatmullRomCurve3(pts.map(x => x.p), closed, 'centripetal', 0.5);
  const totalM = s; const n = Math.max(8, Math.round(totalM / 0.8)); const frames: Frame[] = [];
  const legacyBank = pieces.map(p => (PIECE_BY_KEY[p.type].legacy ? p.bank * 0.5 : 0)); let at = 0; const starts = pieces.map(p => { const v = at; at += PIECE_BY_KEY[p.type].length; return v; });
  let k = 1, pi = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n; const p = curve.getPointAt(Math.min(u, 0.9999)); const t = curve.getTangentAt(Math.min(u, 0.9999)).normalize();
    const sm = u * totalM; let up = pts[pts.length - 1].up.clone();
    while (k < pts.length - 1 && pts[k].s < sm) k++;   // frames run forward along the track: walk the points with them
    if (k > 0 && pts[k].s >= sm) { const a = pts[k - 1], b = pts[k]; const f = b.s === a.s ? 0 : Math.max(0, Math.min(1, (sm - a.s) / (b.s - a.s))); up = a.up.clone().lerp(b.up, f); }
    up.addScaledVector(t, -up.dot(t)); if (up.lengthSq() < 1e-8) up.set(0, 1, 0); up.normalize();
    while (pi < starts.length - 1 && starts[pi + 1] <= sm) pi++; const bank = legacyBank[pi]; if (bank) up.applyAxisAngle(t, bank);   // old parks: their banked turns
    const tile = tileAt(g, Math.floor(p.x), Math.floor(p.z)); const ground = tile ? surfaceZ(tile, p.x - Math.floor(p.x), p.z - Math.floor(p.z)) * HU : 0;
    frames.push({ p, t, up, bank, s: sm, ground });
  }
  return frames;
}
function ribbon(frames: Frame[], offset: number, w: number, h: number, hex: number, closed: boolean): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = []; const c = new THREE.Color(hex);
  const corner = (f: Frame, ox: number, oy: number) => { const right = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); return f.p.clone().addScaledVector(right, offset + ox).addScaledVector(f.up, oy); };
  const n = frames.length - (closed ? 0 : 1);
  for (let i = 0; i < n; i++) {
    const a = frames[i], b = frames[(i + 1) % frames.length];
    const A = [corner(a, -w / 2, 0), corner(a, w / 2, 0), corner(a, w / 2, h), corner(a, -w / 2, h)], B = [corner(b, -w / 2, 0), corner(b, w / 2, 0), corner(b, w / 2, h), corner(b, -w / 2, h)];
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; for (const v of [A[k], B[k], B[k2], A[k], B[k2], A[k2]]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); } }
  }
  const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ge.computeVertexNormals(); return ge;
}
export class CoasterView {
  group = new THREE.Group(); track: THREE.Mesh | null = null; frames: Frame[] = []; totalM = 0; trains: THREE.Group[] = []; sig = ''; style = STYLE.wood; ties: THREE.InstancedMesh | null = null; supports: THREE.InstancedMesh | null = null; stationMesh: THREE.Mesh | null = null;
  constructor(public scene: THREE.Scene, public g: GameState, public ride: Ride) { scene.add(this.group); this.group.userData.rideId = ride.id; this.rebuild(); }
  signature() { const r = this.ride; return r.pieces.length + ':' + r.closedLoop + ':' + r.colours.join(',') + ':' + r.pieces.map(p => p.type + p.x + ',' + p.y + ',' + p.z + p.dir + p.bank + (p.chain ? 'c' : '')).join('|'); }
  rebuild() {
    const r = this.ride; const def = RIDE_BY_KEY[r.type]; const style = STYLE[def.coaster?.style ?? 'steel']; this.style = style; this.sig = this.signature();
    for (const ch of [...this.group.children]) { this.group.remove(ch); (ch as any).geometry?.dispose?.(); }
    this.trains = []; this.frames = trackFrames(this.g, r.pieces, r.closedLoop); if (!this.frames.length) return; this.totalM = r.pieces.reduce((a, p) => a + PIECE_BY_KEY[p.type].length, 0);
    const inv = def.coaster?.style === 'inverted'; const railCol = (def.coaster?.style === 'steel' || def.coaster?.style === 'junior' || inv) ? hexOf(COLOURS[r.colours[1] % COLOURS.length]) : style.rail;
    const fr = inv ? this.frames.map(f => ({ ...f, p: f.p.clone().addScaledVector(f.up, 0.75) })) : this.frames; const kind = def.coaster?.style;
    const water = kind === 'flume' || kind === 'rapids'; const W = kind === 'rapids' ? 0.5 : 0.3, H = kind === 'rapids' ? 0.2 : 0.26;
    const geo = water ? merge([ribbon(fr, 0, W * 2, 0.03, style.tie, r.closedLoop), ribbon(fr, -W, 0.05, H, style.rail, r.closedLoop), ribbon(fr, W, 0.05, H, style.rail, r.closedLoop), ribbon(fr, 0, W * 2 - 0.08, H * 0.45, kind === 'rapids' ? 0x4f9fd1 : 0x6bb2dd, r.closedLoop)])
      : kind === 'railway' ? merge([ribbon(fr, -0.12, 0.03, 0.06, style.rail, r.closedLoop), ribbon(fr, 0.12, 0.03, 0.06, style.rail, r.closedLoop)])
      : merge([ribbon(fr, -0.17, style.railW, 0.05, railCol, r.closedLoop), ribbon(fr, 0.17, style.railW, 0.05, railCol, r.closedLoop), ...(inv ? [ribbon(fr, 0, 0.12, 0.08, style.tie, r.closedLoop)] : [])]);
    this.track = mesh(geo); this.track.userData.rideId = r.id; this.group.add(this.track);
    // ties
    const tieGeo = part(BOX, style.tie, 0, 0, 0, 0, 0, 0, water ? 0.02 : kind === 'railway' ? 0.42 : 0.5, 0.04, water ? 0.02 : 0.12); const nTies = Math.floor(fr.length / 1); this.ties = new THREE.InstancedMesh(tieGeo, MAT, nTies); this.ties.castShadow = true;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1); let ti = 0;
    for (let i = 0; i < fr.length; i += 1) { const f = fr[i]; const right = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); const m3 = new THREE.Matrix4().makeBasis(right, f.up, f.t.clone().negate()); Q.setFromRotationMatrix(m3); M.compose(f.p.clone().addScaledVector(f.up, -0.03), Q, S); this.ties.setMatrixAt(ti++, M); }
    this.ties.count = ti; this.ties.instanceMatrix.needsUpdate = true; this.group.add(this.ties);
    // supports every ~1.5 m where the track is above the ground
    const sup: { p: THREE.Vector3; h: number }[] = []; for (let i = 0; i < this.frames.length; i += 2) { const f = this.frames[i]; const top = (inv ? f.p.y + 0.75 : f.p.y) - 0.03; if (top - f.ground > 0.15) sup.push({ p: new THREE.Vector3(f.p.x, f.ground, f.p.z), h: top - f.ground }); }
    if (sup.length) { const sg = style.lattice ? merge([part(BOX, style.support, -0.14, 0.5, 0, 0, 0, 0, 0.06, 1, 0.06), part(BOX, style.support, 0.14, 0.5, 0, 0, 0, 0, 0.06, 1, 0.06), part(BOX, 0x7a5a2e, 0, 0.5, 0, 0, 0, 0.5, 0.04, 0.9, 0.04)]) : part(CYL6, style.support, 0, 0.5, 0, 0, 0, 0, 0.1, 1, 0.1);
      this.supports = new THREE.InstancedMesh(sg, MAT, sup.length); this.supports.castShadow = true; sup.forEach((s, i) => { M.compose(s.p, new THREE.Quaternion(), new THREE.Vector3(1, s.h, 1)); this.supports!.setMatrixAt(i, M); }); this.supports.instanceMatrix.needsUpdate = true; this.group.add(this.supports); }
    // station platforms and roof
    const st = r.pieces.filter(p => isStation(p.type)); if (st.length) { const parts: THREE.BufferGeometry[] = []; for (const p of st) { const cx = p.x + 0.5, cy = p.y + 0.5, z = p.z * HU; const along = p.dir % 2 === 0; const off = along ? [0, 0.55] : [0.55, 0]; parts.push(part(BOX, 0xb5b5b5, cx + off[0], z - 0.05, cy + off[1], 0, 0, 0, along ? 1 : 0.5, 0.1, along ? 0.5 : 1)); parts.push(part(BOX, hexOf(COLOURS[r.colours[2] % COLOURS.length]), cx + off[0], z + 1.0, cy + off[1], 0, 0, 0, along ? 1.02 : 0.7, 0.08, along ? 0.7 : 1.02)); parts.push(part(CYL6, 0x666666, cx + off[0] * 1.6, z + 0.5, cy + off[1] * 1.6, 0, 0, 0, 0.06, 1.05, 0.06)); }
      this.stationMesh = mesh(merge(parts)); this.group.add(this.stationMesh); }
    // trains
    const carCol = hexOf(COLOURS[r.colours[0] % COLOURS.length]);
    for (const tr of r.trains) { const tg = new THREE.Group(); this.group.add(tg); this.trains.push(tg); for (let k = 0; k < tr.cars; k++) { const car = mesh(merge(carParts(kind, k, carCol))); car.userData.rideId = r.id; tg.add(car); } }
    this.update();
  }
  frameAt(sm: number): Frame | null {
    const fr = this.frames; if (fr.length < 2) return null; const total = this.totalM; let s = this.ride.closedLoop ? ((sm % total) + total) % total : Math.max(0, Math.min(total - 0.01, sm));
    const n = fr.length - 1; const u = s / total; const i = Math.min(n - 1, Math.floor(u * n)); const f = u * n - i; const a = fr[i], b = fr[i + 1];
    return { p: a.p.clone().lerp(b.p, f), t: a.t.clone().lerp(b.t, f).normalize(), up: a.up.clone().lerp(b.up, f).normalize(), bank: a.bank, s, ground: a.ground };
  }
  /** position/orientation of a train car at track metres `sm` (for the ride camera too) */
  poseAt(sm: number): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    const f = this.frameAt(sm); if (!f) return null; const inv = RIDE_BY_KEY[this.ride.type].coaster?.style === 'inverted';
    const right = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); const m = new THREE.Matrix4().makeBasis(right, f.up, f.t.clone().negate()); const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const pos = f.p.clone().addScaledVector(f.up, inv ? 0.3 : 0.05); return { pos, quat: q };
  }
  update() {
    if (this.signature() !== this.sig) { this.rebuild(); return; }
    const r = this.ride; if (this.trains.length !== r.trains.length) { this.rebuild(); return; }
    const spin = RIDE_BY_KEY[r.type].coaster?.style === 'rapids';
    r.trains.forEach((tr, i) => { const tg = this.trains[i]; tg.children.forEach((car, k) => { const s = tr.pos - k * 2.6; if (!r.closedLoop && s < 0) { car.visible = false; return; } const pose = this.poseAt(s); if (!pose) { car.visible = false; return; } car.visible = true; car.position.copy(pose.pos); car.quaternion.copy(pose.quat); if (spin) car.rotateY(tr.pos * 0.35); const riders = Math.max(0, Math.min(4, tr.riders.length - k * 4)); (car as THREE.Mesh).userData.riders = riders; }); });
  }
  dispose() { this.scene.remove(this.group); this.group.traverse(o => { (o as any).geometry?.dispose?.(); }); }
}
/** The parts of one car: a log, a round raft, the engine or a carriage, or a coaster car with four riders' heads. */
function carParts(kind: string | undefined, k: number, col: number): THREE.BufferGeometry[] {
  const head = (x: number, z: number, y = 0.34) => part(SPH, 0xf3c98b, x, y, z, 0, 0, 0, 0.1, 0.1, 0.1);
  if (kind === 'flume') return [part(BOX, 0x8a5a2b, 0, 0.1, 0, 0, 0, 0, 0.32, 0.16, 0.42), part(BOX, 0x5e3d1d, 0, 0.17, 0, 0, 0, 0, 0.24, 0.04, 0.32), head(0, -0.08, 0.28), head(0, 0.1, 0.28)];
  if (kind === 'rapids') return [part(CYL6, col, 0, 0.1, 0, 0, 0, 0, 0.84, 0.18, 0.84), part(CYL6, 0x3a3a3a, 0, 0.13, 0, 0, 0, 0, 0.5, 0.14, 0.5), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => head(Math.cos(i * 0.785) * 0.3, Math.sin(i * 0.785) * 0.3, 0.3))];
  if (kind === 'railway' && k === 0) return [part(CYL6, 0x2d2d2d, 0, 0.2, -0.04, Math.PI / 2, 0, 0, 0.22, 0.34, 0.22), part(CYL6, 0x2d2d2d, 0, 0.36, -0.15, 0, 0, 0, 0.07, 0.14, 0.07), part(BOX, 0xb8322a, 0, 0.24, 0.15, 0, 0, 0, 0.3, 0.26, 0.14), part(BOX, 0x2d2d2d, 0, 0.39, 0.15, 0, 0, 0, 0.34, 0.04, 0.18), part(BOX, 0x444444, 0, 0.06, 0, 0, 0, 0, 0.3, 0.08, 0.44)];
  if (kind === 'railway') return [part(BOX, col, 0, 0.1, 0, 0, 0, 0, 0.34, 0.12, 0.42), part(BOX, col, 0, 0.49, 0, 0, 0, 0, 0.38, 0.03, 0.46), ...[[-0.15, -0.19], [0.15, -0.19], [-0.15, 0.19], [0.15, 0.19]].map(([x, z]) => part(BOX, 0x666666, x, 0.3, z, 0, 0, 0, 0.02, 0.36, 0.02)), head(-0.08, -0.1, 0.26), head(0.08, 0.1, 0.26)];
  return [part(BOX, col, 0, 0.14, 0, 0, 0, 0, 0.36, 0.2, 0.42), part(BOX, 0x222222, 0, 0.04, 0, 0, 0, 0, 0.3, 0.06, 0.46), part(BOX, col, 0, 0.26, -0.19, 0, 0, 0, 0.36, 0.1, 0.04), ...[[-0.09, -0.08], [0.09, -0.08], [-0.09, 0.1], [0.09, 0.1]].map(([x, z]) => head(x, z))];
}
/** A ghost of one piece for the construction preview. */
export function pieceGhost(g: GameState, ride: Ride, piece: TrackPiece, ok: boolean): THREE.Mesh {
  const frames = trackFrames(g, [piece], false); const geo = merge([ribbon(frames, -0.17, 0.08, 0.06, 0xffffff, false), ribbon(frames, 0.17, 0.08, 0.06, 0xffffff, false), ribbon(frames, 0, 0.5, 0.03, 0xffffff, false)]);
  const m = new THREE.Mesh(geo, ok ? MAT_GHOST : MAT_BLOCKED); m.renderOrder = 5; return m;
}
/** A ghost of a whole layout (a ready-made ride) before it is placed. */
export function trackGhost(g: GameState, pieces: TrackPiece[], ok: boolean): THREE.Mesh {
  const frames = trackFrames(g, pieces, true); const geo = merge([ribbon(frames, -0.17, 0.08, 0.06, 0xffffff, true), ribbon(frames, 0.17, 0.08, 0.06, 0xffffff, true), ribbon(frames, 0, 0.5, 0.03, 0xffffff, true)]);
  const m = new THREE.Mesh(geo, ok ? MAT_GHOST : MAT_BLOCKED); m.renderOrder = 5; return m;
}
export { TILE_M };
