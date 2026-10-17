// Guests and staff as instanced low-poly figures: a body (coloured per guest), a head, and balloons / umbrellas.
import * as THREE from 'three';
import type { GameState } from '../sim/types';
import { COLOURS } from '../sim/rides';
import { walkZ } from '../sim/map';
import { HU, BOX, SPH, CONE, part, merge, hexOf } from './world';

const MAX = 4200;
export class PeepsView {
  bodies: THREE.InstancedMesh; heads: THREE.InstancedMesh; balloons: THREE.InstancedMesh; umbrellas: THREE.InstancedMesh; staffMark: THREE.InstancedMesh;
  ids: number[] = []; staffIds: number[] = [];
  constructor(public scene: THREE.Scene, public g: GameState) {
    const bodyGeo = merge([part(BOX, 0xffffff, 0, 0.42, 0, 0, 0, 0, 0.26, 0.34, 0.16), part(BOX, 0x2d2d2d, -0.06, 0.13, 0, 0, 0, 0, 0.09, 0.26, 0.12), part(BOX, 0x2d2d2d, 0.06, 0.13, 0, 0, 0, 0, 0.09, 0.26, 0.12), part(BOX, 0xffffff, -0.18, 0.42, 0, 0, 0, 0, 0.08, 0.3, 0.1), part(BOX, 0xffffff, 0.18, 0.42, 0, 0, 0, 0, 0.08, 0.3, 0.1)]);
    const headGeo = merge([part(SPH, 0xf3c98b, 0, 0.72, 0, 0, 0, 0, 0.22, 0.22, 0.22), part(BOX, 0x3a2a1a, 0, 0.8, 0, 0, 0, 0, 0.2, 0.06, 0.2)]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    this.bodies = new THREE.InstancedMesh(bodyGeo, mat, MAX); this.heads = new THREE.InstancedMesh(headGeo, mat, MAX);
    this.balloons = new THREE.InstancedMesh(merge([part(SPH, 0xffffff, 0, 1.35, 0.1, 0, 0, 0, 0.22, 0.28, 0.22), part(BOX, 0x555555, 0, 1.0, 0.1, 0, 0, 0, 0.012, 0.45, 0.012)]), mat, MAX);
    this.umbrellas = new THREE.InstancedMesh(merge([part(CONE, 0xffffff, 0, 1.05, 0, 0, 0, 0, 0.6, 0.18, 0.6), part(BOX, 0x444444, 0, 0.85, 0, 0, 0, 0, 0.02, 0.35, 0.02)]), mat, MAX);
    this.staffMark = new THREE.InstancedMesh(merge([part(BOX, 0xffffff, 0, 0.9, 0, 0, 0, 0, 0.3, 0.06, 0.3)]), mat, 400);
    for (const m of [this.bodies, this.heads, this.balloons, this.umbrellas, this.staffMark]) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.bodies.userData.peeps = true;
  }
  setGame(g: GameState) { this.g = g; }
  update(t: number) {
    const g = this.g; const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0); const c = new THREE.Color();
    let n = 0, nb = 0, nu = 0, ns = 0; this.ids.length = 0; this.staffIds.length = 0; const raining = g.weather.kind >= 3;
    const place = (x: number, y: number, z: number, dir: number, walking: boolean, phase: number, shirt: number, id: number, isStaff: boolean, balloon: number | null, umbrella: boolean, sit: boolean) => {
      if (n >= MAX) return;
      const bob = walking ? Math.abs(Math.sin(phase * 2.5)) * 0.04 : 0; const yaw = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][dir & 3];
      P.set(x, z * HU + bob + (sit ? -0.12 : 0), y); Q.setFromAxisAngle(up, yaw); M.compose(P, Q, S);
      this.bodies.setMatrixAt(n, M); this.heads.setMatrixAt(n, M); c.setHex(hexOf(COLOURS[shirt % COLOURS.length])); this.bodies.setColorAt(n, c); this.heads.setColorAt(n, c.setHex(0xffffff));
      if (isStaff) this.staffIds.push(id); else this.ids.push(id); (isStaff ? this.staffIds : this.ids); if (isStaff) { this.staffMark.setMatrixAt(ns, M); this.staffMark.setColorAt(ns, c.setHex(0xffd166)); ns++; }
      if (balloon !== null) { this.balloons.setMatrixAt(nb, M); this.balloons.setColorAt(nb, c.setHex(hexOf(COLOURS[balloon % COLOURS.length]))); nb++; }
      if (umbrella && raining) { this.umbrellas.setMatrixAt(nu, M); this.umbrellas.setColorAt(nu, c.setHex(hexOf(COLOURS[(id * 3) % COLOURS.length]))); nu++; }
      n++;
    };
    for (const gu of g.guests) { if (gu.state === 'left' || gu.state === 'riding') continue; const walking = gu.state === 'walking' || gu.state === 'entering' || gu.state === 'leaving'; place(gu.x, gu.y, gu.z, gu.dir, walking, gu.walkPhase + t * 0, gu.shirt, gu.id, false, gu.items.balloon, gu.items.umbrella, gu.state === 'sitting'); }
    for (const s of g.staff) { place(s.x, s.y, s.z, s.dir, s.state === 'walking' || s.state === 'heading', s.walkPhase, s.type === 'handyman' ? 11 : s.type === 'mechanic' ? 5 : s.type === 'security' ? 9 : 3, s.id, true, null, false, false); }
    this.bodies.count = n; this.heads.count = n; this.balloons.count = nb; this.umbrellas.count = nu; this.staffMark.count = ns;
    for (const m of [this.bodies, this.heads, this.balloons, this.umbrellas, this.staffMark]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  /** guest or staff id for a picked body instance */
  idAt(instance: number): { kind: 'guest' | 'staff'; id: number } | null {
    // bodies are placed guests first then staff, in the same order as ids/staffIds
    if (instance < this.ids.length) return { kind: 'guest', id: this.ids[instance] };
    const s = instance - this.ids.length; if (s < this.staffIds.length) return { kind: 'staff', id: this.staffIds[s] }; return null;
  }
}
export { walkZ };
