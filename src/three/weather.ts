// Rain as a cloud of falling points around the camera target, and warm lamp glows at night.
import * as THREE from 'three';
import type { GameState } from '../sim/types';
import { HU } from './world';

export class WeatherFx {
  rain: THREE.Points; rainMat: THREE.PointsMaterial; n = 2500; vel: Float32Array; glows: THREE.InstancedMesh; glowSig = '';
  constructor(public scene: THREE.Scene, public g: GameState) {
    const pos = new Float32Array(this.n * 3); this.vel = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { pos[i * 3] = Math.random() * 60 - 30; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = Math.random() * 60 - 30; this.vel[i] = 18 + Math.random() * 10; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.12, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    this.rain = new THREE.Points(geo, this.rainMat); this.rain.frustumCulled = false; scene.add(this.rain);
    const glowGeo = new THREE.SphereGeometry(0.9, 8, 6); const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glows = new THREE.InstancedMesh(glowGeo, glowMat, 600); this.glows.count = 0; this.glows.frustumCulled = false; scene.add(this.glows);
  }
  setGame(g: GameState) { this.g = g; this.glowSig = ''; }
  update(dt: number, target: THREE.Vector3, light: number) {
    const g = this.g; const level = g.weather.rainLevel; this.rainMat.opacity = Math.min(0.7, level * 0.8);
    if (level > 0.02) { const p = this.rain.geometry.attributes.position as THREE.BufferAttribute; const arr = p.array as Float32Array; const active = Math.floor(this.n * Math.min(1, level + 0.2));
      for (let i = 0; i < active; i++) { arr[i * 3 + 1] -= this.vel[i] * dt; if (arr[i * 3 + 1] < -1) { arr[i * 3] = target.x + Math.random() * 60 - 30; arr[i * 3 + 1] = 28; arr[i * 3 + 2] = target.z + Math.random() * 60 - 30; } }
      p.needsUpdate = true; this.rain.geometry.setDrawRange(0, active); }
    // lamp glows: rebuild the list when paths change (cheap signature), fade with daylight
    const mat = this.glows.material as THREE.MeshBasicMaterial; mat.opacity = light < 0.8 ? Math.min(0.55, (0.8 - light) * 1.4) : 0;
    if (mat.opacity > 0) { let sig = 0; const pts: THREE.Vector3[] = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const t = g.tiles[y * g.w + x]; if ((t.path && t.path.adds.lamp) || (t.scenery && t.scenery.kind === 'lamp_post')) { sig += x * 31 + y * 17; if (pts.length < 600) pts.push(new THREE.Vector3(x + (t.path ? 0.87 : 0.5), t.h * HU + 1.3, y + (t.path ? 0.87 : 0.5))); } }
      const s = pts.length + ':' + sig; if (s !== this.glowSig) { this.glowSig = s; const M = new THREE.Matrix4(); pts.forEach((p, i) => { M.makeTranslation(p.x, p.y, p.z); this.glows.setMatrixAt(i, M); }); this.glows.count = pts.length; this.glows.instanceMatrix.needsUpdate = true; } }
  }
}
