// Procedural low-poly models for stalls, flat rides, huts and the entrance, each with its own animation.
import * as THREE from 'three';
import { COLOURS, RIDE_BY_KEY } from '../sim/rides';
import type { Ride } from '../sim/types';
import { MAT, BOX, CYL, CONE, SPH, CYL6, part, merge, mesh, hexOf } from './world';

export interface Model { group: THREE.Group; animate: (t: number, running: boolean, r: Ride) => void; }
const col = (r: Ride, i: number) => hexOf(COLOURS[r.colours[i] % COLOURS.length]);
const stripes = (n: number, a: number, b: number, radius: number, y: number, h: number) => { const parts: THREE.BufferGeometry[] = []; for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2; parts.push(part(BOX, i % 2 ? a : b, Math.cos(ang) * radius, y, Math.sin(ang) * radius, 0, -ang, 0, 0.1, h, (Math.PI * 2 * radius) / n + 0.02)); } return parts; };

export function stallModel(r: Ride): Model {
  const d = RIDE_BY_KEY[r.type]; const a = col(r, 0); const group = new THREE.Group();
  let body: THREE.BufferGeometry;
  if (d.facility === 'toilet') body = merge([part(BOX, 0x8e8e8e, 0, 0.45, 0, 0, 0, 0, 0.9, 0.9, 0.9), part(BOX, 0x6a6a6a, 0, 0.95, 0, 0, 0, 0, 1.0, 0.1, 1.0), part(BOX, 0x2b6cd9, 0, 0.7, -0.46, 0, 0, 0, 0.3, 0.2, 0.02), part(BOX, 0x444444, 0, 0.3, -0.46, 0, 0, 0, 0.25, 0.6, 0.02)]);
  else if (d.facility === 'firstaid') body = merge([part(BOX, 0xf4f4f4, 0, 0.45, 0, 0, 0, 0, 0.9, 0.9, 0.9), part(BOX, 0xc0392b, 0, 0.95, 0, 0, 0, 0, 1.0, 0.1, 1.0), part(BOX, 0xc0392b, 0, 0.7, -0.46, 0, 0, 0, 0.3, 0.3, 0.02), part(BOX, 0xffffff, 0, 0.7, -0.47, 0, 0, 0, 0.08, 0.24, 0.02), part(BOX, 0xffffff, 0, 0.7, -0.47, 0, 0, 0, 0.24, 0.08, 0.02)]);
  else if (d.facility === 'info') body = merge([part(BOX, 0xe9dcae, 0, 0.4, 0, 0, 0, 0, 0.8, 0.8, 0.8), part(CONE, 0x3a8f4a, 0, 1.0, 0, 0, Math.PI / 4, 0, 1.1, 0.4, 1.1), part(BOX, 0xffffff, 0, 0.55, -0.41, 0, 0, 0, 0.25, 0.3, 0.02), part(BOX, 0x3a8f4a, 0, 0.55, -0.42, 0, 0, 0, 0.06, 0.18, 0.02)]);
  else {
    const parts = [part(BOX, 0xe9dcae, 0, 0.35, 0, 0, 0, 0, 0.9, 0.7, 0.8), part(BOX, 0x6b3a1e, 0, 0.74, 0, 0, 0, 0, 0.98, 0.06, 0.9), part(BOX, 0xb8a97e, 0, 0.42, -0.42, 0, 0, 0, 0.9, 0.08, 0.1)];
    for (let i = 0; i < 6; i++) parts.push(part(BOX, i % 2 ? 0xffffff : a, -0.4 + i * 0.16, 0.86, -0.3, 0.35, 0, 0, 0.16, 0.04, 0.5));
    const icon: Record<string, THREE.BufferGeometry[]> = {
      balloon_stall: [part(SPH, 0xd33a2f, -0.15, 1.1, 0, 0, 0, 0, 0.2, 0.24, 0.2), part(SPH, 0x2b6cd9, 0.12, 1.2, 0, 0, 0, 0, 0.2, 0.24, 0.2), part(SPH, 0x2f9e44, 0, 1.0, -0.15, 0, 0, 0, 0.18, 0.22, 0.18)],
      ice_cream_stall: [part(CONE, 0xf8e7c8, 0, 1.05, 0, Math.PI, 0, 0, 0.22, 0.3, 0.22), part(SPH, 0xe97ab0, 0, 1.25, 0, 0, 0, 0, 0.26, 0.26, 0.26)],
      drink_stall: [part(CYL, 0x2b6cd9, 0, 1.1, 0, 0, 0, 0, 0.22, 0.4, 0.22), part(BOX, 0xffffff, 0, 1.2, 0, 0, 0, 0, 0.26, 0.05, 0.26)],
      lemonade_stall: [part(CYL, 0xe9c21f, 0, 1.1, 0, 0, 0, 0, 0.22, 0.4, 0.22)], coffee_shop: [part(CYL, 0x7a4b2a, 0, 1.08, 0, 0, 0, 0, 0.26, 0.3, 0.26), part(BOX, 0x7a4b2a, 0.18, 1.1, 0, 0, 0, 0, 0.08, 0.16, 0.04)],
      souvenir_stall: [part(BOX, 0x8e44ad, 0, 1.1, 0, 0, 0, 0, 0.4, 0.3, 0.1)], candy_floss_stall: [part(SPH, 0xf8a5d8, 0, 1.15, 0, 0, 0, 0, 0.34, 0.3, 0.34), part(CYL6, 0xffffff, 0, 0.95, 0, 0, 0, 0, 0.04, 0.3, 0.04)],
      pizza_stall: [part(CYL, 0xe9b44c, 0, 1.05, 0, 0.5, 0, 0, 0.42, 0.04, 0.42), part(SPH, 0xc0392b, 0.08, 1.1, 0.05, 0, 0, 0, 0.08, 0.04, 0.08)], hot_dog_stall: [part(CYL, 0xd9a35b, 0, 1.08, 0, 0, 0, Math.PI / 2, 0.16, 0.45, 0.16), part(CYL6, 0xb5451b, 0, 1.12, 0, 0, 0, Math.PI / 2, 0.08, 0.5, 0.08)],
      fries_stall: [part(BOX, 0xc0392b, 0, 1.0, 0, 0, 0, 0, 0.28, 0.24, 0.16), part(BOX, 0xf1c40f, -0.06, 1.2, 0, 0, 0, 0.1, 0.05, 0.3, 0.05), part(BOX, 0xf1c40f, 0.06, 1.22, 0, 0, 0, -0.1, 0.05, 0.3, 0.05)],
    };
    for (const p of icon[r.type] ?? [part(CYL, 0xd9a35b, 0, 1.08, 0, 0, 0, 0, 0.3, 0.1, 0.3), part(CYL, 0x7a3b16, 0, 1.14, 0, 0, 0, 0, 0.3, 0.05, 0.3), part(CYL, 0xd9a35b, 0, 1.2, 0, 0, 0, 0, 0.3, 0.08, 0.3)]) parts.push(p);
    body = merge(parts);
  }
  const m = mesh(body); group.add(m);
  group.rotation.y = -r.rot * Math.PI / 2 - Math.PI / 2;   // the door (−z side) faces the entrance direction
  return { group, animate: () => {} };
}

export function rideModel(r: Ride): Model {
  const d = RIDE_BY_KEY[r.type]; if (d.kind === 'stall') return stallModel(r);
  const n = d.size; const group = new THREE.Group(); const c0 = col(r, 0), c1 = col(r, 1), c2 = col(r, 2);
  const add = (g: THREE.BufferGeometry) => { const m = mesh(g); group.add(m); return m; };
  switch (r.type) {
    case 'merry_go_round': {
      add(merge([part(CYL, 0x7a5a2e, 0, 0.1, 0, 0, 0, 0, n, 0.2, n), part(CYL, 0xc9a76b, 0, 0.22, 0, 0, 0, 0, n - 0.1, 0.06, n - 0.1), part(CYL6, 0xa0a0a0, 0, 1.3, 0, 0, 0, 0, 0.12, 2.2, 0.12), part(CONE, c0, 0, 2.6, 0, 0, 0, 0, n + 0.2, 0.9, n + 0.2), part(CYL, 0xe9c21f, 0, 2.17, 0, 0, 0, 0, n + 0.2, 0.08, n + 0.2), ...stripes(12, c1, 0xffffff, n / 2 + 0.05, 2.3, 0.14)]));
      const spin = new THREE.Group(); group.add(spin); const horses: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const hc = [0xffffff, c1, c2, 0xe9c21f][i % 4]; const h = mesh(merge([part(CYL6, 0xdddddd, 0, 1.15, 0, 0, 0, 0, 0.04, 1.9, 0.04), part(BOX, hc, 0, 0.75, 0, 0, 0, 0, 0.45, 0.22, 0.18), part(BOX, hc, 0.2, 0.92, 0, 0, 0, 0.4, 0.18, 0.28, 0.14), part(BOX, 0x333333, -0.12, 0.55, 0.05, 0, 0, 0, 0.05, 0.25, 0.05), part(BOX, 0x333333, 0.12, 0.55, -0.05, 0, 0, 0, 0.05, 0.25, 0.05)])); h.position.set(Math.cos(a) * (n / 2 - 0.35), 0, Math.sin(a) * (n / 2 - 0.35)); h.rotation.y = -a + Math.PI / 2; spin.add(h); horses.push(h); }
      return { group, animate: (t, running) => { if (running) { spin.rotation.y = t * 1.0; horses.forEach((h, i) => { h.position.y = Math.abs(Math.sin(t * 2 + i)) * 0.18; }); } } };
    }
    case 'ferris_wheel': {
      const R = n * 0.95; add(merge([part(BOX, 0x8a8a8a, -0.6, R / 2 + 0.2, 0, 0, 0, 0.35, 0.12, R + 0.6, 0.12), part(BOX, 0x8a8a8a, 0.6, R / 2 + 0.2, 0, 0, 0, -0.35, 0.12, R + 0.6, 0.12), part(BOX, 0x8a8a8a, -0.6, R / 2 + 0.2, 0.6, 0, 0, 0.35, 0.12, R + 0.6, 0.12), part(BOX, 0x8a8a8a, 0.6, R / 2 + 0.2, 0.6, 0, 0, -0.35, 0.12, R + 0.6, 0.12), part(BOX, 0x777777, 0, R + 0.3, 0.3, 0, 0, 0, 0.3, 0.3, 0.9)]));
      const wheel = new THREE.Group(); wheel.position.set(0, R + 0.3, 0.3); group.add(wheel);
      const rim: THREE.BufferGeometry[] = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; rim.push(part(BOX, c0, Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a + Math.PI / 2, (Math.PI * 2 * R) / 24 + 0.05, 0.08, 0.06)); rim.push(part(BOX, c0, Math.cos(a) * R, Math.sin(a) * R, 0.6, 0, 0, a + Math.PI / 2, (Math.PI * 2 * R) / 24 + 0.05, 0.08, 0.06)); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rim.push(part(BOX, 0xbbbbbb, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a, R, 0.05, 0.05)); rim.push(part(BOX, 0xbbbbbb, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0.6, 0, 0, a, R, 0.05, 0.05)); }
      wheel.add(mesh(merge(rim)));
      const gondolas: THREE.Mesh[] = []; for (let i = 0; i < 8; i++) { const gm = mesh(merge([part(BOX, [c1, c2, 0x2f9e44, 0xe67e22][i % 4], 0, -0.25, 0, 0, 0, 0, 0.5, 0.4, 0.5), part(BOX, 0x222222, 0, -0.47, 0, 0, 0, 0, 0.5, 0.05, 0.5)])); wheel.add(gm); gondolas.push(gm); }
      return { group, animate: (t, running) => { const a0 = running ? t * 0.45 : 0; wheel.rotation.z = a0; gondolas.forEach((gm, i) => { const a = (i / 8) * Math.PI * 2; gm.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.3); gm.rotation.z = -a0; }); } };
    }
    case 'twist': {
      add(merge([part(CYL, 0x555555, 0, 0.08, 0, 0, 0, 0, n, 0.16, n), part(CYL, 0x7f8c8d, 0, 0.18, 0, 0, 0, 0, n - 0.1, 0.05, n - 0.1), part(CYL6, 0x2c3e50, 0, 0.6, 0, 0, 0, 0, 0.18, 0.9, 0.18)]));
      const hub = new THREE.Group(); hub.position.y = 1.0; group.add(hub); const pods: THREE.Group[] = [];
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const arm = new THREE.Group(); arm.rotation.y = a; hub.add(arm); arm.add(mesh(part(BOX, c0, 0.45, 0, 0, 0, 0, 0, 0.9, 0.1, 0.1))); const pg = new THREE.Group(); pg.position.x = 0.9; arm.add(pg); pods.push(pg); for (let k = 0; k < 3; k++) { const b = (k / 3) * Math.PI * 2; pg.add(mesh(part(BOX, [c1, c2, 0xe9c21f][k], Math.cos(b) * 0.28, -0.2, Math.sin(b) * 0.28, 0, -b, 0, 0.28, 0.22, 0.22))); } }
      return { group, animate: (t, running) => { if (running) { hub.rotation.y = t * 1.6; pods.forEach(p => p.rotation.y = -t * 4); } } };
    }
    case 'dodgems': {
      add(merge([part(BOX, 0x555555, 0, 0.05, 0, 0, 0, 0, n, 0.1, n), part(BOX, 0x7a7a7a, 0, 0.11, 0, 0, 0, 0, n - 0.2, 0.02, n - 0.2), ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => part(CYL6, 0x999999, sx * (n / 2 - 0.1), 0.9, sz * (n / 2 - 0.1), 0, 0, 0, 0.08, 1.7, 0.08)), part(BOX, c0, 0, 1.8, 0, 0, 0, 0, n + 0.1, 0.08, n + 0.1), part(BOX, c1, 0, 1.88, 0, 0, 0, 0, n - 0.6, 0.08, n - 0.6)]));
      const cars: THREE.Mesh[] = []; for (let i = 0; i < 6; i++) { const cm = mesh(merge([part(BOX, [c0, c1, c2][i % 3], 0, 0.22, 0, 0, 0, 0, 0.4, 0.14, 0.26), part(BOX, 0x222222, 0, 0.16, 0, 0, 0, 0, 0.44, 0.05, 0.3), part(SPH, 0xf3c98b, 0, 0.36, 0, 0, 0, 0, 0.14, 0.14, 0.14)])); group.add(cm); cars.push(cm); }
      return { group, animate: (t, running) => { cars.forEach((cm, i) => { const a = (running ? t * 0.9 : 0) + i * 1.05; const rr = n / 2 - 0.5; cm.position.set(Math.cos(a * 1.3 + i) * rr * 0.8, 0, Math.sin(a) * rr * 0.8); cm.rotation.y = -a; }); } };
    }
    case 'haunted_house': {
      add(merge([part(BOX, 0x3b2f4a, 0, 0.75, 0, 0, 0, 0, n, 1.5, n), part(CONE, 0x1e1628, 0, 1.95, 0, 0, Math.PI / 4, 0, n * 1.5, 0.9, n * 1.5), part(BOX, 0x6b5a7a, -0.5, 0.9, -n / 2 - 0.01, 0, 0, 0, 0.25, 0.3, 0.02), part(BOX, 0x6b5a7a, 0.5, 0.9, -n / 2 - 0.01, 0, 0, 0, 0.25, 0.3, 0.02), part(BOX, 0x111111, 0, 0.3, -n / 2 - 0.01, 0, 0, 0, 0.3, 0.6, 0.02), part(CYL6, 0x555555, 0.5, 2.4, 0.4, 0, 0, 0, 0.1, 0.6, 0.1)]));
      const win = mesh(part(BOX, 0xffe680, -0.5, 0.9, -n / 2 - 0.02, 0, 0, 0, 0.25, 0.3, 0.02)); group.add(win);
      const ghost = mesh(part(SPH, 0xe8e8ff, 0, 0, 0, 0, 0, 0, 0.3, 0.4, 0.3)); ghost.position.set(0.6, 2.2, -0.4); group.add(ghost);
      return { group, animate: (t, running) => { win.visible = running && Math.sin(t * 7) > 0.3; ghost.visible = running; ghost.position.y = 2.2 + Math.abs(Math.sin(t * 2)) * 0.4; } };
    }
    case 'observation_tower': {
      add(merge([part(CYL6, 0x9a9a9a, 0, 2.6, 0, 0, 0, 0, 0.24, 5.2, 0.24), part(BOX, 0x777777, 0, 5.3, 0, 0, 0, 0, 0.6, 0.2, 0.6), part(CYL6, 0xc0392b, 0, 5.7, 0, 0, 0, 0, 0.06, 0.6, 0.06)]));
      const cab = mesh(merge([part(CYL, c0, 0, 0, 0, 0, 0, 0, 1.2, 0.25, 1.2), part(CYL, 0xbfe3ff, 0, 0.2, 0, 0, 0, 0, 1.1, 0.18, 1.1), part(CYL, c0, 0, 0.36, 0, 0, 0, 0, 1.2, 0.08, 1.2)])); group.add(cab);
      return { group, animate: (t, running) => { cab.position.y = 0.3 + (running ? (0.5 - 0.5 * Math.cos(t * 0.5)) * 4.3 : 0); cab.rotation.y = running ? t * 0.5 : 0; } };
    }
    case 'circus': {
      add(merge([part(CYL, c0, 0, 0.3, 0, 0, 0, 0, n, 0.6, n), ...Array.from({ length: 10 }, (_, i) => part(CONE, i % 2 ? 0xffffff : c0, 0, 1.4, 0, 0, (i / 10) * Math.PI * 2, 0, n * 1.05, 1.6, n * 1.05)), part(CYL6, 0x555555, 0, 2.5, 0, 0, 0, 0, 0.05, 0.6, 0.05), part(BOX, 0xe9c21f, 0.15, 2.7, 0, 0, 0, 0, 0.3, 0.18, 0.02), part(BOX, 0x2c2238, 0, 0.3, -n / 2 - 0.02, 0, 0, 0, 0.5, 0.6, 0.04)]));
      return { group, animate: () => {} };
    }
    case 'swinging_ship': {
      add(merge([part(BOX, 0x8a8a8a, -0.5, 1.0, -0.5, 0, 0, 0.35, 0.1, 2.2, 0.1), part(BOX, 0x8a8a8a, 0.5, 1.0, -0.5, 0, 0, -0.35, 0.1, 2.2, 0.1), part(BOX, 0x8a8a8a, -0.5, 1.0, 0.5, 0, 0, 0.35, 0.1, 2.2, 0.1), part(BOX, 0x8a8a8a, 0.5, 1.0, 0.5, 0, 0, -0.35, 0.1, 2.2, 0.1), part(BOX, 0x444444, 0, 2.0, 0, 0, 0, 0, 0.3, 0.3, 1.3)]));
      const pivot = new THREE.Group(); pivot.position.y = 2.0; group.add(pivot);
      pivot.add(mesh(merge([part(BOX, 0xaaaaaa, 0, -0.7, 0, 0, 0, 0, 0.08, 1.4, 0.08), part(BOX, c0, 0, -1.5, 0, 0, 0, 0, 1.9, 0.35, 0.6), part(BOX, c1, 0, -1.3, 0, 0, 0, 0, 1.5, 0.12, 0.62), part(BOX, c0, -1.0, -1.25, 0, 0, 0, 0.5, 0.3, 0.4, 0.5), part(BOX, c0, 1.0, -1.25, 0, 0, 0, -0.5, 0.3, 0.4, 0.5)])));
      return { group, animate: (t, running) => { pivot.rotation.z = running ? Math.sin(t * 1.6) * 1.1 : 0; } };
    }
    case 'launched_freefall': {
      add(merge([part(BOX, 0x8e9aa5, 0, 3.6, 0, 0, 0, 0, 0.3, 7.2, 0.3), part(BOX, 0xd0d8e0, 0, 3.6, 0.16, 0, 0, 0, 0.1, 7.2, 0.02), part(BOX, 0x555555, 0, 7.3, 0, 0, 0, 0, 0.6, 0.3, 0.6)]));
      const car = mesh(merge([part(BOX, c0, 0, 0, 0, 0, 0, 0, 1.0, 0.3, 1.0), part(BOX, 0x222222, 0, -0.18, 0, 0, 0, 0, 1.0, 0.06, 1.0), ...[-0.3, 0.3].flatMap(x => [-0.3, 0.3].map(z => part(SPH, 0xf3c98b, x, 0.25, z, 0, 0, 0, 0.14, 0.14, 0.14)))])); group.add(car);
      return { group, animate: (t, running) => { car.position.y = 0.4 + (running ? Math.max(0, Math.sin(t * 1.3)) * 6.2 : 0); } };
    }
    case 'top_spin': {
      add(merge([part(BOX, c1, -0.95, 1.1, 0, 0, 0, 0, 0.25, 2.2, 0.4), part(BOX, c1, 0.95, 1.1, 0, 0, 0, 0, 0.25, 2.2, 0.4), part(BOX, 0x555555, 0, 2.2, 0, 0, 0, 0, 2.1, 0.12, 0.12)]));
      const arm = new THREE.Group(); arm.position.y = 2.2; group.add(arm);
      arm.add(mesh(merge([part(BOX, 0x888888, 0, -0.55, 0, 0, 0, 0, 0.14, 1.1, 0.14), part(BOX, c0, 0, -1.1, 0, 0, 0, 0, 1.6, 0.28, 0.5), ...Array.from({ length: 6 }, (_, i) => part(SPH, 0xf3c98b, -0.6 + i * 0.24, -0.88, 0, 0, 0, 0, 0.14, 0.14, 0.14))])));
      return { group, animate: (t, running) => { arm.rotation.z = running ? t * 2.4 : 0; } };
    }
    case 'space_rings': {
      add(merge([part(CYL, 0x555555, 0, 0.1, 0, 0, 0, 0, 0.9, 0.2, 0.9)]));
      const r1 = mesh(part(new THREE.TorusGeometry(0.45, 0.04, 6, 24), c0)); const r2 = mesh(part(new THREE.TorusGeometry(0.36, 0.04, 6, 24), c1)); r1.position.y = 0.75; r2.position.y = 0.75; group.add(r1, r2); const head = mesh(part(SPH, 0xf3c98b, 0, 0.75, 0, 0, 0, 0, 0.16, 0.16, 0.16)); group.add(head);
      return { group, animate: (t, running) => { if (running) { r1.rotation.y = t * 3; r1.rotation.x = Math.PI / 2 + Math.sin(t) * 0.5; r2.rotation.x = t * 2.5; } } };
    }
    case 'motion_simulator': {
      add(merge([part(BOX, 0x555555, 0, 0.1, 0, 0, 0, 0, n - 0.2, 0.2, n - 0.2), ...[-0.5, 0, 0.5].map(x => part(CYL6, 0x888888, x, 0.35, 0, 0, 0, 0, 0.1, 0.5, 0.1))]));
      const cab = mesh(merge([part(BOX, c0, 0, 0.5, 0, 0, 0, 0, 1.4, 0.9, 1.1), part(BOX, 0xbfe3ff, 0, 0.7, -0.56, 0, 0, 0, 1.0, 0.3, 0.02), part(BOX, 0x222222, 0, 0.98, 0, 0, 0, 0, 1.42, 0.05, 1.12)])); cab.position.y = 0.5; group.add(cab);
      return { group, animate: (t, running) => { cab.rotation.z = running ? Math.sin(t * 2) * 0.15 : 0; cab.rotation.x = running ? Math.cos(t * 1.4) * 0.12 : 0; } };
    }
    case 'spiral_slide': {
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 4; pts.push(new THREE.Vector3(Math.cos(a) * 0.7, 2.2 - i / 60 * 2.0, Math.sin(a) * 0.7)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.14, 6, false);
      add(merge([part(CYL6, 0xd9d9d9, 0, 1.2, 0, 0, 0, 0, 0.5, 2.4, 0.5), part(CONE, c0, 0, 2.6, 0, 0, 0, 0, 0.7, 0.5, 0.7), part(tube, c1), part(BOX, 0xd9d9d9, 0, 2.3, 0, 0, 0, 0, 0.8, 0.05, 0.8)]));
      return { group, animate: () => {} };
    }
    default: { add(part(BOX, c0, 0, 0.5, 0, 0, 0, 0, n - 0.2, 1, n - 0.2)); return { group, animate: () => {} }; }
  }
}
export function hutModel(exit: boolean): THREE.Mesh { return mesh(merge([part(BOX, exit ? 0xc0392b : 0x2f9e44, 0, 0.45, 0, 0, 0, 0, 0.7, 0.9, 0.7), part(BOX, 0x333333, 0, 0.95, 0, 0, 0, 0, 0.85, 0.1, 0.85), part(BOX, 0xffe680, 0, 0.7, -0.36, 0, 0, 0, 0.3, 0.14, 0.02), part(BOX, 0x222222, 0, 0.25, -0.36, 0, 0, 0, 0.3, 0.5, 0.02)])); }
export function entranceModel(): THREE.Mesh { return mesh(merge([part(BOX, 0xb5894a, -1.1, 1.3, 0, 0, 0, 0, 0.3, 2.6, 0.3), part(BOX, 0xb5894a, 1.1, 1.3, 0, 0, 0, 0, 0.3, 2.6, 0.3), part(BOX, 0x8e2a2a, 0, 2.75, 0, 0, 0, 0, 2.6, 0.5, 0.5), part(BOX, 0xe9c21f, 0, 3.05, 0, 0, 0, 0, 2.0, 0.12, 0.3), ...Array.from({ length: 7 }, (_, i) => part(SPH, 0xffe680, -0.9 + i * 0.3, 2.75, -0.27, 0, 0, 0, 0.08, 0.08, 0.08))])); }
export { CYL, CONE, SPH, BOX, MAT };
