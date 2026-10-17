// Coaster track as a smooth spline with two rails, ties, supports and a station; trains that follow it with banking.
import * as THREE from 'three';
import type { GameState, Ride, TrackPiece } from '../sim/types';
import { TILE_M } from '../sim/types';
import { RIDE_BY_KEY, COLOURS } from '../sim/rides';
import { PIECE_BY_KEY, pieceSample } from '../sim/track';
import { tileAt } from '../sim/map';
import { HU, MAT, BOX, SPH, CYL6, part, merge, mesh, hexOf, MAT_GHOST, MAT_BLOCKED } from './world';

const STYLE: Record<string, { rail: number; tie: number; support: number; lattice: boolean; railW: number }> = {
  wood: { rail: 0x3b3b3b, tie: 0x8a6a3a, support: 0x9c7a4f, lattice: true, railW: 0.05 },
  steel: { rail: 0xc0392b, tie: 0x777777, support: 0x9a9a9a, lattice: false, railW: 0.06 },
  mine: { rail: 0x5a4a3a, tie: 0x8a6a3a, support: 0x7a5a2e, lattice: true, railW: 0.05 },
  inverted: { rail: 0x2b6cd9, tie: 0x555555, support: 0x8e9aa5, lattice: false, railW: 0.07 },
  junior: { rail: 0xe67e22, tie: 0x888888, support: 0xaaaaaa, lattice: false, railW: 0.05 },
};
interface Frame { p: THREE.Vector3; t: THREE.Vector3; up: THREE.Vector3; bank: number; s: number; ground: number; }

/** The short way round between two roll angles (a corkscrew ends a full turn on, which is no turn at all). */
const wrapAngle = (d: number) => { const t = Math.PI * 2; return ((((d + Math.PI) % t) + t) % t) - Math.PI; };
/** World-space sample points for a list of pieces (metres along the track kept in s). */
export function trackFrames(g: GameState, pieces: TrackPiece[], closed: boolean): Frame[] {
  const pts: { p: THREE.Vector3; s: number; bank: number }[] = []; let s = 0;
  pieces.forEach((pc, i) => { const def = PIECE_BY_KEY[pc.type]; def.samples.forEach((smp, k) => { if (k === 0 && i > 0) return; const w = pieceSample(pc, smp); pts.push({ p: new THREE.Vector3(w.x, w.z * HU, w.y), s: s + smp.s, bank: pc.bank * 0.5 + (smp.roll ?? 0) }); }); s += def.length; });
  if (!pts.length) return [];
  const curve = new THREE.CatmullRomCurve3(pts.map(x => x.p), closed, 'centripetal', 0.5);
  const totalM = s; const n = Math.max(8, Math.round(totalM / 0.8)); const frames: Frame[] = []; const up0 = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n; const p = curve.getPointAt(Math.min(u, 0.9999)); const t = curve.getTangentAt(Math.min(u, 0.9999)).normalize();
    const sm = u * totalM; let bank = 0; for (let k = 1; k < pts.length; k++) if (pts[k].s >= sm) { const a = pts[k - 1], b = pts[k]; const f = b.s === a.s ? 0 : (sm - a.s) / (b.s - a.s); bank = a.bank + wrapAngle(b.bank - a.bank) * f; break; }
    const right = new THREE.Vector3().crossVectors(t, up0).normalize(); if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(right, t).normalize(); up.applyAxisAngle(t, bank);
    const tile = tileAt(g, Math.floor(p.x), Math.floor(p.z)); const ground = tile ? (tile.water ? tile.h + 2 : tile.h) * HU : 0;
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
    const fr = inv ? this.frames.map(f => ({ ...f, p: f.p.clone().addScaledVector(f.up, 0.75) })) : this.frames;
    const geo = merge([ribbon(fr, -0.17, style.railW, 0.05, railCol, r.closedLoop), ribbon(fr, 0.17, style.railW, 0.05, railCol, r.closedLoop), ...(inv ? [ribbon(fr, 0, 0.12, 0.08, style.tie, r.closedLoop)] : [])]);
    this.track = mesh(geo); this.track.userData.rideId = r.id; this.group.add(this.track);
    // ties
    const tieGeo = part(BOX, style.tie, 0, 0, 0, 0, 0, 0, 0.5, 0.04, 0.12); const nTies = Math.floor(fr.length / 1); this.ties = new THREE.InstancedMesh(tieGeo, MAT, nTies); this.ties.castShadow = true;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1); let ti = 0;
    for (let i = 0; i < fr.length; i += 1) { const f = fr[i]; const right = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); const m3 = new THREE.Matrix4().makeBasis(right, f.up, f.t.clone().negate()); Q.setFromRotationMatrix(m3); M.compose(f.p.clone().addScaledVector(f.up, -0.03), Q, S); this.ties.setMatrixAt(ti++, M); }
    this.ties.count = ti; this.ties.instanceMatrix.needsUpdate = true; this.group.add(this.ties);
    // supports every ~1.5 m where the track is above the ground
    const sup: { p: THREE.Vector3; h: number }[] = []; for (let i = 0; i < this.frames.length; i += 2) { const f = this.frames[i]; const top = (inv ? f.p.y + 0.75 : f.p.y) - 0.03; if (top - f.ground > 0.15) sup.push({ p: new THREE.Vector3(f.p.x, f.ground, f.p.z), h: top - f.ground }); }
    if (sup.length) { const sg = style.lattice ? merge([part(BOX, style.support, -0.14, 0.5, 0, 0, 0, 0, 0.06, 1, 0.06), part(BOX, style.support, 0.14, 0.5, 0, 0, 0, 0, 0.06, 1, 0.06), part(BOX, 0x7a5a2e, 0, 0.5, 0, 0, 0, 0.5, 0.04, 0.9, 0.04)]) : part(CYL6, style.support, 0, 0.5, 0, 0, 0, 0, 0.1, 1, 0.1);
      this.supports = new THREE.InstancedMesh(sg, MAT, sup.length); this.supports.castShadow = true; sup.forEach((s, i) => { M.compose(s.p, new THREE.Quaternion(), new THREE.Vector3(1, s.h, 1)); this.supports!.setMatrixAt(i, M); }); this.supports.instanceMatrix.needsUpdate = true; this.group.add(this.supports); }
    // station platforms and roof
    const st = r.pieces.filter(p => p.type === 'station'); if (st.length) { const parts: THREE.BufferGeometry[] = []; for (const p of st) { const cx = p.x + 0.5, cy = p.y + 0.5, z = p.z * HU; const along = p.dir % 2 === 0; const off = along ? [0, 0.55] : [0.55, 0]; parts.push(part(BOX, 0xb5b5b5, cx + off[0], z - 0.05, cy + off[1], 0, 0, 0, along ? 1 : 0.5, 0.1, along ? 0.5 : 1)); parts.push(part(BOX, hexOf(COLOURS[r.colours[2] % COLOURS.length]), cx + off[0], z + 1.0, cy + off[1], 0, 0, 0, along ? 1.02 : 0.7, 0.08, along ? 0.7 : 1.02)); parts.push(part(CYL6, 0x666666, cx + off[0] * 1.6, z + 0.5, cy + off[1] * 1.6, 0, 0, 0, 0.06, 1.05, 0.06)); }
      this.stationMesh = mesh(merge(parts)); this.group.add(this.stationMesh); }
    // trains
    const carCol = hexOf(COLOURS[r.colours[0] % COLOURS.length]);
    for (const tr of r.trains) { const tg = new THREE.Group(); this.group.add(tg); this.trains.push(tg); for (let k = 0; k < tr.cars; k++) { const car = mesh(merge([part(BOX, carCol, 0, 0.14, 0, 0, 0, 0, 0.36, 0.2, 0.42), part(BOX, 0x222222, 0, 0.04, 0, 0, 0, 0, 0.3, 0.06, 0.46), part(BOX, carCol, 0, 0.26, -0.19, 0, 0, 0, 0.36, 0.1, 0.04), ...[[-0.09, -0.08], [0.09, -0.08], [-0.09, 0.1], [0.09, 0.1]].map(([x, z]) => part(SPH, 0xf3c98b, x, 0.34, z, 0, 0, 0, 0.1, 0.1, 0.1))])); car.userData.rideId = r.id; tg.add(car); } }
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
    r.trains.forEach((tr, i) => { const tg = this.trains[i]; tg.children.forEach((car, k) => { const s = tr.pos - k * 2.6; if (!r.closedLoop && s < 0) { car.visible = false; return; } const pose = this.poseAt(s); if (!pose) { car.visible = false; return; } car.visible = true; car.position.copy(pose.pos); car.quaternion.copy(pose.quat); const riders = Math.max(0, Math.min(4, tr.riders.length - k * 4)); (car as THREE.Mesh).userData.riders = riders; }); });
  }
  dispose() { this.scene.remove(this.group); this.group.traverse(o => { (o as any).geometry?.dispose?.(); }); }
}
/** A ghost of one piece for the construction preview. */
export function pieceGhost(g: GameState, ride: Ride, piece: TrackPiece, ok: boolean): THREE.Mesh {
  const frames = trackFrames(g, [piece], false); const geo = merge([ribbon(frames, -0.17, 0.08, 0.06, 0xffffff, false), ribbon(frames, 0.17, 0.08, 0.06, 0xffffff, false), ribbon(frames, 0, 0.5, 0.03, 0xffffff, false)]);
  const m = new THREE.Mesh(geo, ok ? MAT_GHOST : MAT_BLOCKED); m.renderOrder = 5; return m;
}
export { TILE_M };
