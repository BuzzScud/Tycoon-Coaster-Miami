// Sketches (the ink look's drawings) shown in the lit 3D look: their fills as a shaded mesh, both sides lit, since
// the sketches draw some one-sided sheets. Their ink strokes are left out.
import * as THREE from 'three';
import { Sketch, bake, FINE } from '../ink/kit';
import { MAT } from './world';

const MAT2 = MAT.clone(); MAT2.side = THREE.DoubleSide;
export function litMesh(sk: Sketch): THREE.Mesh | null { const f = bake(sk, FINE).fills; if (!f) return null; const m = new THREE.Mesh(f, MAT2); m.castShadow = true; m.receiveShadow = true; return m; }
export function drawLit(fn: (sk: Sketch) => void, x = 0, y = 0, z = 0): THREE.Group { const sk = new Sketch(); fn(sk); const g = new THREE.Group(); const m = litMesh(sk); if (m) g.add(m); g.position.set(x, y, z); return g; }
