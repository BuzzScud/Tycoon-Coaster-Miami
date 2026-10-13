// The ink look's views, shaped like the classic ones in ../three (same methods and fields the game calls), so the
// game draws the park either way: ground in 16×16 patches, scenery as instanced kinds, guests and staff, every ride.
import * as THREE from 'three';
import type { GameState, Guest, Ride } from '../sim/types';
import { RIDE_BY_KEY, COLOURS } from '../sim/rides';
import { tileAt } from '../sim/map';
import { HU, hexOf } from '../three/world';
import { type InkStyle, type LineClass, InkInstances, Sketch, bake, strokeObjects, buildGroup, inkTime } from './kit';
import { SCENERY_BY_KEY, sizeOf } from '../sim/scenery';
import { drawSpacePiece, type DrawnPiece } from './space';
import { inkChunk } from './terrain';
import { inkRideModel, inkHut, inkGate, scenerySketch, InkCoaster, type InkModel } from './models';

const disposeTree = (o: THREE.Object3D) => o.traverse(c => (c as THREE.Mesh).geometry?.dispose());

// ---------- ground ----------
const CH = 16;
export class InkTerrainView {
  group = new THREE.Group(); chunks = new Map<number, THREE.Group>(); dirty = new Set<number>(); landTargets: THREE.Mesh[] = [];
  constructor(public scene: THREE.Scene, public g: GameState, public s: InkStyle) { scene.add(this.group); this.rebuildAll(); }
  setGame(g: GameState) { this.g = g; this.rebuildAll(); }
  key(cx: number, cy: number) { return cy * 64 + cx; }
  markDirty(x: number, y: number) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = Math.floor((x + dx) / CH), cy = Math.floor((y + dy) / CH); if (cx >= 0 && cy >= 0 && cx * CH < this.g.w && cy * CH < this.g.h) this.dirty.add(this.key(cx, cy)); } }
  markAllDirty() { for (let cy = 0; cy * CH < this.g.h; cy++) for (let cx = 0; cx * CH < this.g.w; cx++) this.dirty.add(this.key(cx, cy)); }
  rebuildAll() { for (const c of this.chunks.values()) { this.group.remove(c); disposeTree(c); } this.chunks.clear(); this.landTargets = []; this.markAllDirty(); this.update(); }
  update() { for (const k of this.dirty) this.build(k % 64, Math.floor(k / 64)); this.dirty.clear(); }
  animate(_t: number) {}
  build(cx: number, cy: number) {
    const k = this.key(cx, cy); const old = this.chunks.get(k); if (old) { this.group.remove(old); disposeTree(old); this.landTargets = this.landTargets.filter(m => m.parent !== old); }
    const grp = inkChunk(this.g, this.s, cx * CH, cy * CH, CH); this.group.add(grp); this.chunks.set(k, grp);
    const fills = grp.children.find(o => (o as THREE.Mesh).isMesh && !(o as any).isLineSegments2) as THREE.Mesh | undefined;
    if (fills) { fills.userData.terrain = true; this.landTargets.push(fills); }
  }
}

// ---------- pieces drawn one by one (they move, are big, or take a colour) ----------
/** Space pieces, the fountain (its jet plays), and the recolourable picnic table and park sign. */
export const isPieceKind = (kind: string) => kind.startsWith('space_') || kind === 'fountain' || SCENERY_BY_KEY[kind]?.recolour === true;
export function drawPiece(kind: string, s: InkStyle, seed: number, colour?: number): DrawnPiece {
  const accent = colour !== undefined ? hexOf(COLOURS[colour % COLOURS.length]) : undefined;
  if (kind.startsWith('space_')) return drawSpacePiece(kind, s, seed, { accent });
  const group = buildGroup(scenerySketch(kind, accent), s); const wrap = new THREE.Group(); wrap.add(group);
  if (kind !== 'fountain') return { group: wrap, animate: () => {} };
  // the fountain's jet: drops leave the spout, rise and fall back into the basin
  const drops = Array.from({ length: 10 }, () => { const d = buildGroup(new Sketch().part('ball', 0xbfe3ff, 0, 0, 0, 0, 0, 0, 0.07, 0.09, 0.07, { outline: false }), s); wrap.add(d); return d; });
  return { group: wrap, animate: t => drops.forEach((d, i) => { const f = (t * 0.9 + i / 10 + seed) % 1, a = i * 2.4; const r = f * 0.32; d.position.set(Math.cos(a) * r, 0.95 + f * 0.5 - f * f * 0.75, Math.sin(a) * r); }) };
}
/** One drawn piece per placed item, kept until it changes (kind, turn, colour) or goes. */
export class InkPieces {
  group = new THREE.Group(); items = new Map<string, { sig: string; d: DrawnPiece }>();
  constructor(public scene: THREE.Scene, public g: GameState, public s: InkStyle) { scene.add(this.group); }
  rebuild() {
    const g = this.g; const seen = new Set<string>();
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const t = g.tiles[y * g.w + x]; const sc = t.scenery; if (!sc || !isPieceKind(sc.kind)) continue; if (sc.root && (sc.root[0] !== x || sc.root[1] !== y)) continue;
      const key = `${x},${y}`, sig = `${sc.kind}:${sc.rot}:${sc.colour ?? ''}:${t.h}`; seen.add(key); const old = this.items.get(key); if (old?.sig === sig) continue;
      if (old) { this.group.remove(old.d.group); disposeTree(old.d.group); }
      const n = sizeOf(sc.kind); const d = drawPiece(sc.kind, this.s, (x * 7 + y * 13) * 0.37, sc.colour);
      d.group.position.set(x + n / 2, t.h * HU, y + n / 2); d.group.rotation.y = -sc.rot * Math.PI / 2; d.group.traverse(o => { o.userData.scenery = [x, y]; });
      this.group.add(d.group); this.items.set(key, { sig, d });
    }
    for (const [key, it] of this.items) if (!seen.has(key)) { this.group.remove(it.d.group); disposeTree(it.d.group); this.items.delete(key); }
  }
  animate(t: number) { for (const it of this.items.values()) it.d.animate(t); }
  setGame(g: GameState) { this.g = g; for (const it of this.items.values()) { this.group.remove(it.d.group); disposeTree(it.d.group); } this.items.clear(); this.rebuild(); }
}

// ---------- scenery ----------
/** Trees and the rest as instanced kinds, one set per 16×16 patch of the map: a patch off screen is not drawn. */
export class InkSceneryView {
  group = new THREE.Group(); kinds = new Map<string, InkInstances>(); baked = new Map<string, ReturnType<typeof bake>>(); lines: THREE.Object3D[] = []; pieces: InkPieces;
  constructor(public scene: THREE.Scene, public g: GameState, public s: InkStyle) { scene.add(this.group); this.pieces = new InkPieces(scene, g, s); this.rebuild(); }
  setGame(g: GameState) { this.g = g; this.pieces.setGame(g); this.rebuild(); }
  /** Trees sway, pieces play their animations. */
  animate(t: number) { inkTime.value = t; this.pieces.animate(t); }
  rebuild() {
    const g = this.g; const lists = new Map<string, { kind: string; ms: THREE.Matrix4[] }>(); const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const t = g.tiles[y * g.w + x]; if (!t.scenery) continue; const kind = t.scenery.kind; const v = (x * 7 + y * 13) & 7;
      if (isPieceKind(kind) || (t.scenery.root && (t.scenery.root[0] !== x || t.scenery.root[1] !== y))) continue;   // drawn one by one, or another tile of a big piece
      const directional = kind === 'hedge' || kind === 'fence_wood' || kind === 'sign'; const sc = kind.startsWith('tree') ? 0.85 + (v % 4) * 0.08 : 1;
      P.set(x + 0.5, t.h * HU, y + 0.5); Q.setFromAxisAngle(up, directional ? -t.scenery.rot * Math.PI / 2 : v * 0.8); S.setScalar(sc);
      const key = `${kind}@${x >> 4},${y >> 4}`; let l = lists.get(key); if (!l) lists.set(key, l = { kind, ms: [] }); l.ms.push(new THREE.Matrix4().compose(P, Q, S));
    }
    for (const [key, inst] of this.kinds) if (!lists.has(key) || inst.max < lists.get(key)!.ms.length) { for (const m of inst.all()) { this.group.remove(m); m.dispose(); } this.kinds.delete(key); }
    for (const o of this.lines) { this.group.remove(o); disposeTree(o); } this.lines = [];
    const patchStrokes = new Map<string, Record<LineClass, number[]>>(); const v = new THREE.Vector3();
    for (const [key, { kind, ms }] of lists) {
      let b = this.baked.get(kind); if (!b) { b = bake(scenerySketch(kind), this.s); this.baked.set(kind, b); }
      let inst = this.kinds.get(key); if (!inst) { inst = new InkInstances(b, this.s, ms.length + 8, false, kind === 'bush' || kind === 'flowers' || kind === 'rock' ? 0.4 : 0.5, kind.startsWith('tree') || kind === 'bush'); inst.addTo(this.group); this.kinds.set(key, inst); }
      ms.forEach((m, i) => inst!.set(i, m)); inst.commit(ms.length); inst.cullable();
      // strokes are not instanced: copy this kind's strokes to every placed item, batched per patch
      const patch = key.slice(key.indexOf('@')); let out = patchStrokes.get(patch); if (!out) patchStrokes.set(patch, out = { edge: [], fine: [], grid: [], ripple: [] });
      for (const cls of ['edge', 'fine'] as LineClass[]) { const src = b.strokes[cls]; if (!src.length) continue; for (const m of ms) for (let i = 0; i < src.length; i += 3) { v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(m); out[cls].push(v.x, v.y, v.z); } }
    }
    for (const strokes of patchStrokes.values()) for (const o of strokeObjects(this.s, strokes)) { this.group.add(o); this.lines.push(o); }
    this.pieces.rebuild();
  }
}

// ---------- guests and staff ----------
const MAXP = 2600;
export class InkPeepsView {
  group = new THREE.Group(); bodies: THREE.InstancedMesh; ids: number[] = []; staffIds: number[] = [];
  /** What the camera sees; people outside it are left out of this frame (set by the game before each update). */
  frustum: THREE.Frustum | null = null; private sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  private body: InkInstances; private head: InkInstances; private balloon: InkInstances; private cap: InkInstances;
  constructor(public scene: THREE.Scene, public g: GameState, s: InkStyle) {
    const body = new Sketch().box(0xffffff, 0, 0.42, 0, 0.26, 0.34, 0.16, 0, { outline: true }).box(0x2d2d2d, -0.06, 0.13, 0, 0.09, 0.26, 0.12, 0, { outline: false }).box(0x2d2d2d, 0.06, 0.13, 0, 0.09, 0.26, 0.12, 0, { outline: false })   // dark legs need no ink edge
      .box(0xffffff, -0.18, 0.42, 0, 0.08, 0.3, 0.1, 0, { outline: true }).box(0xffffff, 0.18, 0.42, 0, 0.08, 0.3, 0.1, 0, { outline: true });
    const head = new Sketch().part('ball', 0xf3c98b, 0, 0.72, 0, 0, 0, 0, 0.22, 0.22, 0.22).box(0x3a2a1a, 0, 0.8, 0, 0.2, 0.06, 0.2, 0, { outline: false });
    const balloon = new Sketch().part('ball', 0xffffff, 0, 1.35, 0.1, 0, 0, 0, 0.22, 0.28, 0.22).box(0x555555, 0, 1.0, 0.1, 0.012, 0.45, 0.012, 0, { outline: false });
    const cap = new Sketch().box(0xffd166, 0, 0.88, 0, 0.26, 0.05, 0.26, 0, { outline: true });
    this.body = new InkInstances(body, s, MAXP, true, 0.2); this.head = new InkInstances(head, s, MAXP); this.balloon = new InkInstances(balloon, s, MAXP, true); this.cap = new InkInstances(cap, s, 400);
    for (const k of [this.body, this.head, this.balloon, this.cap]) k.addTo(this.group);
    this.bodies = this.body.fills; this.bodies.userData.peeps = true; scene.add(this.group);
  }
  setGame(g: GameState) { this.g = g; }
  update(_t: number) {
    const g = this.g; const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0); const c = new THREE.Color();
    let n = 0, nb = 0, ns = 0; this.ids.length = 0; this.staffIds.length = 0;
    const place = (x: number, y: number, z: number, dir: number, walking: boolean, phase: number, shirt: number, id: number, isStaff: boolean, balloon: number | null, sit: boolean, yaw?: number) => {
      if (n >= MAXP) return; if (this.frustum) { this.sphere.center.set(x, z * HU + 0.6, y); if (!this.frustum.intersectsSphere(this.sphere)) return; }
      const bob = walking ? Math.abs(Math.sin(phase * 2.5)) * 0.04 : 0;
      P.set(x, z * HU + bob + (sit ? -0.12 : 0), y); Q.setFromAxisAngle(up, yaw ?? [Math.PI / 2, 0, -Math.PI / 2, Math.PI][dir & 3]); M.compose(P, Q, S);
      this.body.set(n, M, c.setHex(hexOf(COLOURS[shirt % COLOURS.length]))); this.head.set(n, M);
      if (isStaff) { this.staffIds.push(id); if (ns < this.cap.max) this.cap.set(ns++, M); } else this.ids.push(id);
      if (balloon !== null) this.balloon.set(nb++, M, c.setHex(hexOf(COLOURS[balloon % COLOURS.length])));
      n++;
    };
    for (const gu of g.guests) { if (gu.state === 'left' || gu.state === 'riding') continue;
      if (gu.state === 'admiring' && gu.using) { const dx = gu.using.x - gu.x, dz = gu.using.y - gu.y, d = Math.hypot(dx, dz) || 1; place(gu.x + (dx / d) * 0.28, gu.y + (dz / d) * 0.28, gu.z, 0, false, 0, gu.shirt, gu.id, false, gu.items.balloon, gu.using.act === 'sit', Math.atan2(dx, dz)); continue; }   /* facing the piece they are using */
      place(gu.x, gu.y, gu.z, gu.dir, gu.state === 'walking' || gu.state === 'entering' || gu.state === 'leaving', gu.walkPhase, gu.shirt, gu.id, false, gu.items.balloon, gu.state === 'sitting'); }
    for (const st of g.staff) place(st.x, st.y, st.z, st.dir, st.state === 'walking' || st.state === 'heading', st.walkPhase, st.type === 'handyman' ? 11 : st.type === 'mechanic' ? 5 : st.type === 'security' ? 9 : 3, st.id, true, null, false);
    this.body.commit(n); this.head.commit(n); this.balloon.commit(nb); this.cap.commit(ns);
  }
  /** guest or staff id for a picked body instance (guests first, then staff, as placed) */
  idAt(instance: number): { kind: 'guest' | 'staff'; id: number } | null {
    if (instance < this.ids.length) return { kind: 'guest', id: this.ids[instance] };
    const k = instance - this.ids.length; return k < this.staffIds.length ? { kind: 'staff', id: this.staffIds[k] } : null;
  }
}

// ---------- riders and breakdowns ----------
/** A guest sitting down, facing +x: the body takes the shirt colour, the head is drawn apart so it keeps its skin. */
const riderBody = () => new Sketch().box(0xffffff, 0, 0.13, 0, 0.14, 0.26, 0.22, 0, { outline: true }).box(0xffffff, 0.02, 0.14, 0.15, 0.1, 0.22, 0.07, 0, { outline: true }).box(0xffffff, 0.02, 0.14, -0.15, 0.1, 0.22, 0.07, 0, { outline: true }).box(0x2d2d2d, 0.12, 0.02, 0, 0.22, 0.06, 0.18, 0, { outline: false });
const riderHead = () => new Sketch().part('ball', 0xf3c98b, 0, 0.38, 0, 0, 0, 0, 0.2, 0.2, 0.2).box(0x3a2a1a, 0, 0.47, 0, 0.18, 0.05, 0.18, 0, { outline: false });
/** Smoke rising from a broken ride and a red warning sign beside it, until the mechanic has fixed it. */
function breakdownFx(s: InkStyle, top: number, half: number): { group: THREE.Group; animate: (t: number) => void } {
  const group = new THREE.Group();
  const sign = new Sketch(); sign.part('cyl6', 0x6b6b6b, 0, 0.6, 0, 0, 0, 0, 0.06, 1.2, 0.06).box(0xc0392b, 0, 1.25, 0, 0.36, 0.36, 0.05).box(0xffffff, 0, 1.3, 0.03, 0.06, 0.16, 0.01, 0, { lines: 'none' }).box(0xffffff, 0, 1.15, 0.03, 0.06, 0.05, 0.01, 0, { lines: 'none' });
  const sg = buildGroup(sign, s); sg.position.set(-half - 0.25, 0, -half - 0.25); group.add(sg);
  const puffs = [0, 1, 2, 3].map(() => { const p = buildGroup(new Sketch().part('ball', 0xc9cdd1, 0, 0, 0, 0, 0, 0, 0.5, 0.42, 0.5), s); group.add(p); return p; });
  const animate = (t: number) => puffs.forEach((p, i) => { const f = (t * 0.4 + i / 4) % 1; p.position.set(Math.sin(i * 2.1 + t) * 0.25, top + f * 1.6, Math.cos(i * 1.7) * 0.2); p.scale.setScalar(0.45 + f * 0.9); });
  animate(0); return { group, animate };
}

// ---------- rides, huts and the gate ----------
// ---------- rides, huts and the gate ----------
interface Entry { model: InkModel | null; huts: THREE.Group[]; hutSig: string; coaster: InkCoaster | null; colourSig: string; top: number; fx: ReturnType<typeof breakdownFx> | null }
const MAXR = 800;
export class InkRidesView {
  group = new THREE.Group(); entries = new Map<number, Entry>(); entrance: THREE.Group; riderBody: InkInstances; riderHead: InkInstances; private c = new THREE.Color();
  constructor(public scene: THREE.Scene, public g: GameState, public s: InkStyle) {
    scene.add(this.group); this.entrance = inkGate(s); this.group.add(this.entrance); this.placeEntrance();
    this.riderBody = new InkInstances(riderBody(), s, MAXR, true); this.riderHead = new InkInstances(riderHead(), s, MAXR); this.riderBody.addTo(this.group); this.riderHead.addTo(this.group);
  }
  setGame(g: GameState) { this.g = g; for (const e of this.entries.values()) this.drop(e); this.entries.clear(); this.placeEntrance(); }
  placeEntrance() { const e = this.g.entrance; const t = tileAt(this.g, e.x, e.y); this.entrance.position.set(e.x + 1, (t ? t.h : 0) * HU, e.y + 0.5); this.entrance.rotation.y = e.dir === 3 || e.dir === 1 ? 0 : Math.PI / 2; }
  drop(e: Entry) { if (e.fx) { this.group.remove(e.fx.group); disposeTree(e.fx.group); e.fx = null; } if (e.model) { this.group.remove(e.model.group); disposeTree(e.model.group); } for (const h of e.huts) { this.group.remove(h); disposeTree(h); } e.coaster?.dispose(); }
  hutSig(r: Ride) { return `${r.entrance?.x},${r.entrance?.y},${r.entrance?.dir}|${r.exit?.x},${r.exit?.y},${r.exit?.dir}`; }
  sync(t: number) {
    const g = this.g; const seen = new Set<number>();
    for (const r of g.rides) {
      seen.add(r.id); const def = RIDE_BY_KEY[r.type]; let e = this.entries.get(r.id); const colourSig = r.colours.join(',') + r.rot + ':' + r.x + ',' + r.y;
      if (e && e.colourSig !== colourSig && e.model) { this.group.remove(e.model.group); disposeTree(e.model.group); e.model = null; }
      if (!e) { e = { model: null, huts: [], hutSig: '', coaster: null, colourSig, top: 1, fx: null }; this.entries.set(r.id, e); } e.colourSig = colourSig;
      if (def.kind === 'coaster') { if (!e.coaster) { e.coaster = new InkCoaster(g, r, this.s); this.group.add(e.coaster.group); } else { e.coaster.ride = r; e.coaster.g = g; } e.coaster.update(); }
      else if (!e.model) { const m = inkRideModel(r, this.s); const tile = tileAt(g, r.x, r.y); m.group.position.set(r.x + def.size / 2, (tile ? tile.h : 0) * HU, r.y + def.size / 2); m.group.traverse(o => { o.userData.rideId = r.id; }); this.group.add(m.group); e.model = m; e.top = new THREE.Box3().setFromObject(m.group).max.y - m.group.position.y; }
      if (e.model) e.model.animate(t, !r.breakdown && (r.running || r.status === 'testing'));
      // a breakdown shows: smoke over the ride, a warning sign beside it, until the mechanic has fixed it
      if (r.breakdown && !e.fx && def.kind !== 'stall') { const st = def.kind === 'coaster' ? r.pieces[0] : null; const half = def.kind === 'coaster' ? 0.5 : def.size / 2;
        e.fx = breakdownFx(this.s, def.kind === 'coaster' ? 1.1 : e.top, half); const tile = tileAt(g, st ? st.x : r.x, st ? st.y : r.y);
        e.fx.group.position.set(st ? st.x + 0.5 : r.x + def.size / 2, st ? st.z * HU : (tile ? tile.h : 0) * HU, st ? st.y + 0.5 : r.y + def.size / 2); e.fx.group.traverse(o => { o.userData.rideId = r.id; }); this.group.add(e.fx.group); }
      else if (!r.breakdown && e.fx) { this.group.remove(e.fx.group); disposeTree(e.fx.group); e.fx = null; }
      e.fx?.animate(t);
      const hs = this.hutSig(r);
      if (hs !== e.hutSig) { for (const h of e.huts) { this.group.remove(h); disposeTree(h); } e.huts = []; e.hutSig = hs;
        for (const [hut, exit] of [[r.entrance, false], [r.exit, true]] as const) { if (!hut) continue; const m = inkHut(exit, this.s); const tile = tileAt(g, hut.x, hut.y); m.position.set(hut.x + 0.5, (tile ? tile.h : 0) * HU, hut.y + 0.5); m.rotation.y = -hut.dir * Math.PI / 2 + Math.PI / 2; m.traverse(o => { o.userData.rideId = r.id; }); this.group.add(m); e.huts.push(m); } }
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) { this.drop(e); this.entries.delete(id); }
    this.placeRiders();
  }
  /** Every guest on a ride sits in a seat, in their own shirt colour: flat rides fill seats in boarding order, coaster trains car by car. */
  placeRiders() {
    const g = this.g; let n = 0; let byId: Map<number, Guest> | null = null; const c = this.c;
    const put = (at: THREE.Object3D, id: number) => { if (n >= MAXR) return; byId ??= new Map(g.guests.map(x => [x.id, x])); const gu = byId.get(id); if (!gu) return; this.riderBody.set(n, at.matrixWorld, c.setHex(hexOf(COLOURS[gu.shirt % COLOURS.length]))); this.riderHead.set(n, at.matrixWorld); n++; };
    for (const r of g.rides) {
      const e = this.entries.get(r.id); if (!e) continue;
      if (e.model?.seats && r.riders.length) { e.model.group.updateMatrixWorld(true); r.riders.slice(0, e.model.seats.length).forEach((id, i) => put(e.model!.seats![i], id)); }
      if (e.coaster) { e.coaster.group.updateMatrixWorld(true); r.trains.forEach((tr, i) => { const seats = e.coaster!.seats[i] ?? []; tr.riders.forEach((id, k) => { const at = seats[k]; if (at && at.parent?.visible) put(at, id); }); }); }
    }
    this.riderBody.commit(n); this.riderHead.commit(n);
  }
  coasterOf(id: number) { return this.entries.get(id)?.coaster ?? null; }
}
