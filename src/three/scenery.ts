// Scenery as instanced low-poly models, one InstancedMesh per kind.
import * as THREE from 'three';
import type { GameState } from '../sim/types';
import { SCENERY } from '../sim/scenery';
import { HU, MAT, BOX, CYL, CONE, SPH, CYL6, part, merge } from './world';

export function sceneryGeometry(kind: string): THREE.BufferGeometry {
  switch (kind) {
    case 'tree_oak': return merge([part(CYL6, 0x6b4a2a, 0, 0.3, 0, 0, 0, 0, 0.16, 0.6, 0.16), part(SPH, 0x2f8f3a, 0, 0.95, 0, 0, 0, 0, 1.0, 0.9, 1.0), part(SPH, 0x3aa044, 0.25, 1.15, 0.15, 0, 0, 0, 0.6, 0.55, 0.6), part(SPH, 0x287a32, -0.25, 1.1, -0.1, 0, 0, 0, 0.55, 0.5, 0.55)]);
    case 'tree_pine': return merge([part(CYL6, 0x5a3d20, 0, 0.25, 0, 0, 0, 0, 0.14, 0.5, 0.14), part(CONE, 0x1f6b2a, 0, 0.75, 0, 0, 0, 0, 0.9, 0.9, 0.9), part(CONE, 0x246e2e, 0, 1.2, 0, 0, 0, 0, 0.7, 0.8, 0.7), part(CONE, 0x2a7a35, 0, 1.6, 0, 0, 0, 0, 0.45, 0.7, 0.45)]);
    case 'tree_palm': { const parts = [part(CYL6, 0x8a6a3a, 0.05, 0.7, 0, 0, 0, 0.12, 0.12, 1.4, 0.12)]; for (let k = 0; k < 6; k++) { const a = k * 1.047; parts.push(part(BOX, 0x2f9e44, Math.cos(a) * 0.35, 1.35 - Math.abs(Math.sin(k)) * 0.05, Math.sin(a) * 0.35, 0.35 * Math.sin(a), -a, -0.35 * Math.cos(a), 0.7, 0.05, 0.18)); } parts.push(part(SPH, 0x8a6a3a, 0.05, 1.4, 0, 0, 0, 0, 0.18, 0.18, 0.18)); return merge(parts); }
    case 'tree_cherry': return merge([part(CYL6, 0x6b4a2a, 0, 0.3, 0, 0, 0, 0, 0.14, 0.6, 0.14), part(SPH, 0xf2a6c4, 0, 0.95, 0, 0, 0, 0, 0.95, 0.8, 0.95), part(SPH, 0xf7c6d9, 0.25, 1.1, 0.2, 0, 0, 0, 0.5, 0.45, 0.5), part(SPH, 0xe78fb3, -0.3, 1.05, -0.15, 0, 0, 0, 0.5, 0.45, 0.5)]);
    case 'bush': return merge([part(SPH, 0x2f7d32, 0, 0.25, 0, 0, 0, 0, 0.7, 0.5, 0.7), part(SPH, 0x4caf50, 0.2, 0.3, 0.15, 0, 0, 0, 0.4, 0.35, 0.4)]);
    case 'hedge': return merge([part(BOX, 0x2f7d32, 0, 0.3, 0, 0, 0, 0, 0.9, 0.6, 0.3)]);
    case 'flowers': { const parts = [part(BOX, 0x5a3d20, 0, 0.04, 0, 0, 0, 0, 0.8, 0.08, 0.8)]; const cols = [0xe0455a, 0xf0c030, 0xf08bb0, 0xffffff]; for (let i = 0; i < 9; i++) parts.push(part(SPH, cols[i % 4], -0.3 + (i % 3) * 0.3, 0.14, -0.3 + Math.floor(i / 3) * 0.3, 0, 0, 0, 0.14, 0.12, 0.14)); return merge(parts); }
    case 'fountain': return merge([part(CYL, 0x9aa5b1, 0, 0.1, 0, 0, 0, 0, 0.9, 0.2, 0.9), part(CYL, 0x3b7dd8, 0, 0.21, 0, 0, 0, 0, 0.75, 0.04, 0.75), part(CYL, 0x9aa5b1, 0, 0.45, 0, 0, 0, 0, 0.12, 0.5, 0.12), part(SPH, 0xbfe3ff, 0, 0.8, 0, 0, 0, 0, 0.3, 0.25, 0.3)]);
    case 'statue': return merge([part(BOX, 0x8c8c8c, 0, 0.15, 0, 0, 0, 0, 0.6, 0.3, 0.6), part(BOX, 0xb5b5b5, 0, 0.75, 0, 0, 0, 0, 0.25, 0.9, 0.25), part(SPH, 0xc9c9c9, 0, 1.3, 0, 0, 0, 0, 0.22, 0.22, 0.22), part(BOX, 0xb5b5b5, 0.25, 0.95, 0, 0, 0, 0.4, 0.35, 0.08, 0.1)]);
    case 'rock': return merge([part(SPH, 0x7d7d7d, 0, 0.2, 0, 0.3, 0.2, 0, 0.7, 0.45, 0.6), part(SPH, 0x9a9a9a, 0.2, 0.28, 0.1, 0, 0, 0, 0.35, 0.3, 0.35)]);
    case 'lamp_post': return merge([part(CYL6, 0x444444, 0, 0.7, 0, 0, 0, 0, 0.06, 1.4, 0.06), part(BOX, 0xffe680, 0, 1.45, 0, 0, 0, 0, 0.2, 0.18, 0.2)]);
    case 'sign': return merge([part(CYL6, 0x6b4a2a, 0, 0.45, 0, 0, 0, 0, 0.06, 0.9, 0.06), part(BOX, 0xe9dcae, 0, 0.95, 0, 0, 0, 0, 0.9, 0.4, 0.06), part(BOX, 0x8e2a2a, 0, 1.0, 0.035, 0, 0, 0, 0.7, 0.08, 0.01)]);
    case 'fence_wood': return merge([part(BOX, 0x8a5a2b, 0, 0.3, 0, 0, 0, 0, 1.0, 0.05, 0.04), part(BOX, 0x8a5a2b, 0, 0.5, 0, 0, 0, 0, 1.0, 0.05, 0.04), part(BOX, 0x6b4a2a, -0.45, 0.3, 0, 0, 0, 0, 0.06, 0.6, 0.06), part(BOX, 0x6b4a2a, 0.45, 0.3, 0, 0, 0, 0, 0.06, 0.6, 0.06)]);
    case 'umbrella_table': return merge([part(CYL, 0x8a5a2b, 0, 0.35, 0, 0, 0, 0, 0.7, 0.05, 0.7), part(CYL6, 0x777777, 0, 0.7, 0, 0, 0, 0, 0.04, 1.4, 0.04), part(CONE, 0xd33a2f, 0, 1.4, 0, 0, 0, 0, 1.1, 0.3, 1.1)]);
    default: return merge([part(BOX, 0xcc00cc, 0, 0.25, 0, 0, 0, 0, 0.4, 0.5, 0.4)]);
  }
}
export class SceneryView {
  meshes = new Map<string, THREE.InstancedMesh>(); geos = new Map<string, THREE.BufferGeometry>(); group = new THREE.Group();
  constructor(public scene: THREE.Scene, public g: GameState) { scene.add(this.group); for (const s of SCENERY) this.geos.set(s.key, sceneryGeometry(s.key)); this.rebuild(); }
  setGame(g: GameState) { this.g = g; this.rebuild(); }
  rebuild() {
    const g = this.g; const lists = new Map<string, { x: number; y: number; h: number; rot: number; v: number }[]>();
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const t = g.tiles[y * g.w + x]; if (!t.scenery) continue; let l = lists.get(t.scenery.kind); if (!l) { l = []; lists.set(t.scenery.kind, l); } l.push({ x, y, h: t.h, rot: t.scenery.rot, v: (x * 7 + y * 13) & 7 }); }
    for (const [kind, m] of this.meshes) { if (!lists.has(kind)) { this.group.remove(m); m.dispose(); this.meshes.delete(kind); } }
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    for (const [kind, l] of lists) {
      let m = this.meshes.get(kind); const geo = this.geos.get(kind) ?? sceneryGeometry(kind);
      if (!m || m.count < l.length || m.count > l.length * 2 + 16) { if (m) { this.group.remove(m); m.dispose(); } m = new THREE.InstancedMesh(geo, MAT, l.length + 16); m.castShadow = true; m.receiveShadow = true; m.userData.kind = kind; this.group.add(m); this.meshes.set(kind, m); }
      const directional = kind === 'hedge' || kind === 'fence_wood' || kind === 'sign';
      l.forEach((it, i) => { const sc = kind.startsWith('tree') ? 0.85 + (it.v % 4) * 0.08 : 1; P.set(it.x + 0.5, it.h * HU, it.y + 0.5); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), directional ? -it.rot * Math.PI / 2 : (it.v * 0.8)); S.set(sc, sc, sc); M.compose(P, Q, S); m!.setMatrixAt(i, M); });
      m.count = l.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    }
  }
}
