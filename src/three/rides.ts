// Keeps a 3D model for every ride, stall, hut and coaster in the park in step with the game state.
import * as THREE from 'three';
import type { GameState, Ride } from '../sim/types';
import { RIDE_BY_KEY } from '../sim/rides';
import { tileAt } from '../sim/map';
import { HU } from './world';
import { rideModel, hutModel, entranceModel, type Model } from './models';
import { CoasterView } from './coaster';

interface Entry { model: Model | null; huts: THREE.Mesh[]; hutSig: string; coaster: CoasterView | null; colourSig: string; }
export class RidesView {
  group = new THREE.Group(); entries = new Map<number, Entry>(); entrance: THREE.Mesh;
  constructor(public scene: THREE.Scene, public g: GameState) { scene.add(this.group); this.entrance = entranceModel(); this.group.add(this.entrance); this.placeEntrance(); }
  setGame(g: GameState) { this.g = g; for (const e of this.entries.values()) this.drop(e); this.entries.clear(); this.placeEntrance(); }
  placeEntrance() { const g = this.g; const e = g.entrance; const t = tileAt(g, e.x, e.y); this.entrance.position.set(e.x + 1, (t ? t.h : 0) * HU, e.y + 0.5); this.entrance.rotation.y = e.dir === 3 || e.dir === 1 ? 0 : Math.PI / 2; }
  drop(e: Entry) { if (e.model) this.group.remove(e.model.group); for (const h of e.huts) this.group.remove(h); e.coaster?.dispose(); }
  hutSig(r: Ride) { return `${r.entrance?.x},${r.entrance?.y},${r.entrance?.dir}|${r.exit?.x},${r.exit?.y},${r.exit?.dir}`; }
  sync(t: number) {
    const g = this.g; const seen = new Set<number>();
    for (const r of g.rides) {
      seen.add(r.id); const def = RIDE_BY_KEY[r.type]; let e = this.entries.get(r.id);
      const colourSig = r.colours.join(',') + r.rot;
      if (e && e.colourSig !== colourSig && e.model) { this.group.remove(e.model.group); e.model = null; e.colourSig = colourSig; }
      if (!e) { e = { model: null, huts: [], hutSig: '', coaster: null, colourSig }; this.entries.set(r.id, e); }
      if (def.kind === 'coaster') { if (!e.coaster) e.coaster = new CoasterView(this.scene, g, r); else { e.coaster.ride = r; e.coaster.g = g; } e.coaster.update(); }
      else if (!e.model) { const m = rideModel(r); const tile = tileAt(g, r.x, r.y); m.group.position.set(r.x + def.size / 2, (tile ? tile.h : 0) * HU, r.y + def.size / 2); m.group.userData.rideId = r.id; m.group.traverse(o => { o.userData.rideId = r.id; }); this.group.add(m.group); e.model = m; }
      if (e.model) e.model.animate(t, r.running || r.status === 'testing', r);
      const hs = this.hutSig(r); if (hs !== e.hutSig) { for (const h of e.huts) this.group.remove(h); e.huts = []; e.hutSig = hs; for (const [hut, exit] of [[r.entrance, false], [r.exit, true]] as const) { if (!hut) continue; const m = hutModel(exit); const tile = tileAt(g, hut.x, hut.y); m.position.set(hut.x + 0.5, (tile ? tile.h : 0) * HU, hut.y + 0.5); m.rotation.y = -hut.dir * Math.PI / 2 + Math.PI / 2; m.userData.rideId = r.id; this.group.add(m); e.huts.push(m); } }
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) { this.drop(e); this.entries.delete(id); }
  }
  coasterOf(id: number) { return this.entries.get(id)?.coaster ?? null; }
}
