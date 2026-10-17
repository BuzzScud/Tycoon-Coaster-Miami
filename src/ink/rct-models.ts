// The flat rides RCT has that this game did not: drawn once, as sketches, so the ink look outlines them and the lit 3D
// look shades them. Each model sits on its footprint's centre and animates while it runs; seats mark where riders go.
import * as THREE from 'three';
import { RIDE_BY_KEY } from '../sim/rides';
import type { Ride } from '../sim/types';
import type { Sketch } from './kit';

export type DrawFn = (fn: (sk: Sketch) => void, x?: number, y?: number, z?: number) => THREE.Group;
export interface FlatModel { group: THREE.Group; animate: (t: number, running: boolean) => void; seats?: THREE.Object3D[] }
const seat = (parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
/** A pitched roof over a w × d box top at height y (ridge along x). */
function roof(sk: Sketch, color: number, w: number, d: number, y: number, h: number) {
  sk.quad([[-w / 2, y, -d / 2], [w / 2, y, -d / 2], [w / 2, y + h, 0], [-w / 2, y + h, 0]], color, 'edge');
  sk.quad([[-w / 2, y, d / 2], [w / 2, y, d / 2], [w / 2, y + h, 0], [-w / 2, y + h, 0]], color, 'edge');
  sk.quad([[-w / 2, y, -d / 2], [-w / 2, y, d / 2], [-w / 2, y + h, 0]], color, 'fine'); sk.quad([[w / 2, y, -d / 2], [w / 2, y, d / 2], [w / 2, y + h, 0]], color, 'fine');
}
/** An A-frame of two legs either side, meeting at height h (for swinging rides), along z at x = ±s. */
function aFrame(sk: Sketch, color: number, s: number, h: number, spread: number) {
  for (const x of [-s, s]) { sk.part('box', color, x, h / 2, -spread / 2, Math.atan2(spread / 2, h), 0, 0, 0.12, Math.hypot(h, spread / 2), 0.12).part('box', color, x, h / 2, spread / 2, -Math.atan2(spread / 2, h), 0, 0, 0.12, Math.hypot(h, spread / 2), 0.12); }
  sk.part('cyl6', 0x666666, 0, h, 0, 0, 0, Math.PI / 2, 0.16, s * 2 + 0.2, 0.16);
}

export function rctFlatModel(r: Ride, draw: DrawFn, c: [number, number, number]): FlatModel | null {
  const d = RIDE_BY_KEY[r.type]; const n = d.size; const [c0, c1, c2] = c; const group = new THREE.Group();
  const add = (fn: (sk: Sketch) => void, x = 0, y = 0, z = 0) => { const g = draw(fn, x, y, z); group.add(g); return g; };
  switch (r.type) {
    case 'crooked_house': {   // a wonky house: leaning walls, a slipped roof, crooked windows
      const tilt = (rz: number, x: number, y: number) => new THREE.Matrix4().makeRotationZ(rz).setPosition(x, y, 0);
      const windows = (sk: Sketch, w: number, d: number, y: number) => { for (const [x, rz] of [[-w / 4, 0.2], [w / 4, -0.15]] as const) sk.part('box', 0xfff2b0, x, y, -d / 2 - 0.01, 0, 0, rz, 0.28, 0.32, 0.03).part('box', 0xfff2b0, x, y, d / 2 + 0.01, 0, 0, -rz, 0.28, 0.32, 0.03); sk.part('box', 0xfff2b0, w / 2 + 0.01, y, 0.1, 0.15, 0, 0, 0.03, 0.3, 0.3).part('box', 0xfff2b0, -w / 2 - 0.01, y, -0.1, -0.12, 0, 0, 0.03, 0.3, 0.3); };
      const house = add(sk => {
        sk.box(0x6b5a4a, 0, 0.06, 0, n - 0.2, 0.12, n - 0.2);
        sk.at(0, 0, 0, 0.06); sk.box(c0, 0, 0.7, 0, 1.9, 1.16, 1.7); windows(sk, 1.9, 1.7, 0.85); sk.part('box', 0x4a2e1e, 0.2, 0.42, -0.86, 0, 0, -0.06, 0.34, 0.62, 0.03); sk.pop();   // the ground floor, turned a little
        sk.push(tilt(-0.1, 0.1, 1.28)); sk.at(0, 0, 0, -0.1); sk.box(c2, 0, 0.42, 0, 1.6, 0.84, 1.5); windows(sk, 1.6, 1.5, 0.45);   // the upper floor leans one way...
        sk.push(tilt(0.22, -0.05, 0.84)); roof(sk, c1, 1.95, 1.8, 0, 0.75); sk.part('box', 0x8a8a8a, 0.45, 0.55, 0.3, 0, 0, -0.3, 0.16, 0.6, 0.16); sk.pop(); sk.pop(); sk.pop();   // ...the roof the other, with a bent chimney
      });
      house.rotation.z = 0.04;
      return { group, animate: (t, running) => { house.rotation.z = 0.04 + (running ? Math.sin(t * 1.3) * 0.03 : 0); } };
    }
    case 'flying_saucers': {   // a fenced arena where saucers hover and bump
      add(sk => { sk.box(0x4a5560, 0, 0.05, 0, n, 0.1, n).box(0x5f6d7a, 0, 0.11, 0, n - 0.2, 0.02, n - 0.2, 0, { cls: 'fine' });
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) sk.part('cyl6', 0x999999, sx * (n / 2 - 0.1), 0.35, sz * (n / 2 - 0.1), 0, 0, 0, 0.08, 0.7, 0.08, { outline: false });
        for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; sk.at(0, 0, 0, a); sk.box(c1, 0, 0.55, n / 2 - 0.1, n - 0.2, 0.06, 0.06, 0, { cls: 'fine' }); sk.pop(); } });
      const saucers: THREE.Group[] = []; for (let i = 0; i < 6; i++) { const sc = [c0, c2, 0x2f9e44][i % 3]; const g = draw(sk => { sk.part('cyl', sc, 0, 0.25, 0, 0, 0, 0, 0.62, 0.1, 0.62).part('ball', 0xbfe3ff, 0, 0.33, 0, 0, 0, 0, 0.3, 0.2, 0.3, { lines: 'none' }).part('cyl', 0x333333, 0, 0.18, 0, 0, 0, 0, 0.5, 0.05, 0.5, { lines: 'none' }); }); group.add(g); saucers.push(g); }
      const move = (t: number) => saucers.forEach((g, i) => { const a = t * 0.7 + i * 1.05; const rr = n / 2 - 0.6; g.position.set(Math.cos(a * 1.2 + i) * rr * 0.8, Math.sin(t * 3 + i) * 0.05, Math.sin(a) * rr * 0.8); g.rotation.y = a * 2; });
      move(0); return { group, seats: saucers.map(g => seat(g, 0, 0.3, 0)), animate: (t, running) => { if (running) move(t); } };
    }
    case 'maze': {   // hedges in a maze on a gravel floor (one fixed layout)
      add(sk => {
        sk.box(0xc9b48a, 0, 0.03, 0, n, 0.06, n, 0, { cls: 'fine' }); const cells = n * 2, s = n / cells, h = 0.45, w = 0.12;
        const walls: [number, number, number, number][] = [];   // x0, z0, x1, z1 in cell units; the outer wall in single cells, with a gap in and a gap out
        for (let i = 0; i < cells; i++) { if (i !== 0) walls.push([i, 0, i + 1, 0]); if (i !== cells - 1) walls.push([i, cells, i + 1, cells]); walls.push([0, i, 0, i + 1], [cells, i, cells, i + 1]); }
        const inner = [[1, 1, 1, 4], [1, 4, 3, 4], [3, 2, 3, 6], [2, 6, 6, 6], [5, 1, 5, 4], [5, 4, 7, 4], [2, 2, 3, 2], [6, 2, 7, 2], [4, 6, 4, 8]];
        for (const [a, b, e, f] of inner) if (Math.max(a, b, e, f) < cells) walls.push([a, b, e, f]);
        for (const [a, b, e, f] of walls) { const x0 = -n / 2 + a * s, z0 = -n / 2 + b * s, x1 = -n / 2 + e * s, z1 = -n / 2 + f * s; const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
          sk.box(0x2f7d32, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, along ? Math.abs(x1 - x0) + w : w, h, along ? w : Math.abs(z1 - z0) + w, 0, { outline: true }); }
      });
      const walkers = [0, 1, 2, 3].map(i => seat(group, 0, 0.05, 0, i)); const walk = (t: number) => walkers.forEach((o, i) => { const a = t * 0.3 + i * 1.6; o.position.set(Math.cos(a) * n * 0.3, 0.05, Math.sin(a * 0.7) * n * 0.3); o.rotation.y = -a; });
      walk(0); return { group, seats: walkers, animate: (t, running) => { if (running) walk(t); } };
    }
    case '3d_cinema': {   // a dome on a square base, a canopy over the doors, a marquee
      add(sk => { sk.box(0xd8d2c4, 0, 0.35, 0, n - 0.3, 0.7, n - 0.3).part('ball', c0, 0, 0.7, 0, 0, 0, 0, n - 0.5, 1.6, n - 0.5).box(c1, 0, 0.62, -(n - 0.3) / 2 - 0.2, 1.2, 0.08, 0.5).box(0x222222, 0, 0.3, -(n - 0.3) / 2 - 0.01, 0.7, 0.55, 0.02, 0, { cls: 'fine' }).box(0xffe680, 0, 0.88, -(n - 0.3) / 2 - 0.05, 1.0, 0.28, 0.04, 0, { cls: 'fine' }); });
      const glow = add(sk => { sk.box(0xffffff, 0, 0.88, -(n - 0.3) / 2 - 0.08, 0.9, 0.2, 0.02, 0, { lines: 'none', outline: false }); }); glow.visible = false;
      return { group, animate: (t, running) => { glow.visible = running && Math.sin(t * 6) > 0; } };
    }
    case 'enterprise': {   // a wheel of gondolas on an arm that spins and tilts up on end
      add(sk => { sk.part('cyl', 0x555555, 0, 0.1, 0, 0, 0, 0, n - 0.4, 0.2, n - 0.4).part('cyl6', 0x7f8c8d, 0, 0.9, 0, 0, 0, 0, 0.4, 1.6, 0.4).box(c1, 0, 1.7, 0, 0.5, 0.3, 0.5); });
      const tilt = new THREE.Group(); tilt.position.y = 1.75; group.add(tilt); const R = n / 2 - 0.3;
      const wheel = draw(sk => { sk.part('cyl', 0x666666, 0, 0, 0, 0, 0, 0, 0.5, 0.15, 0.5); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; sk.part('box', 0x8a8a8a, Math.cos(a) * R / 2, 0, Math.sin(a) * R / 2, 0, -a, 0, R, 0.04, 0.04, { lines: 'none', outline: false }); sk.part('box', i % 2 ? c0 : c2, Math.cos(a) * R, -0.12, Math.sin(a) * R, 0, -a, 0, 0.32, 0.3, 0.26); } });
      tilt.add(wheel); const seats = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return seat(wheel, Math.cos(a) * R, -0.1, Math.sin(a) * R, -a); });
      return { group, seats, animate: (t, running) => { if (running) { wheel.rotation.y = t * 2.2; tilt.rotation.x = (0.5 - 0.5 * Math.cos(t * 0.25)) * 1.25; } else { tilt.rotation.x = 0; } } };
    }
    case 'magic_carpet': {   // a level carpet of seats swung round on two arms
      add(sk => { aFrame(sk, 0x8e8e8e, 0.9, 2.4, 1.6); });
      const swing = new THREE.Group(); swing.position.y = 2.4; group.add(swing); const carpet = draw(sk => { sk.box(c0, 0, 0, 0, 1.6, 0.12, 0.8).box(c1, 0, 0.08, 0, 1.5, 0.05, 0.7, 0, { cls: 'fine' }); for (const x of [-0.5, 0, 0.5]) sk.box(c2, x, 0.2, 0.3, 0.35, 0.2, 0.05, 0, { cls: 'fine' }); });
      for (const x of [-0.75, 0.75]) swing.add(draw(sk => { sk.part('box', 0x777777, x, -0.75, 0, 0, 0, 0, 0.08, 1.5, 0.08); }));
      carpet.position.y = -1.5; swing.add(carpet); const seats = [-0.5, 0, 0.5].flatMap(x => [seat(carpet, x, 0.08, 0.1, Math.PI / 2), seat(carpet, x, 0.08, -0.15, Math.PI / 2)]);
      return { group, seats, animate: (t, running) => { const a = running ? t * 1.6 : 0; swing.rotation.x = a; carpet.rotation.x = -a; } };
    }
    case 'swinging_inverter_ship': {   // a ship on a rigid arm that swings right over the top
      add(sk => { aFrame(sk, 0x8e8e8e, 1.0, 2.6, 1.8); });
      const arm = new THREE.Group(); arm.position.y = 2.6; group.add(arm);
      const ship = draw(sk => { sk.part('box', 0x777777, 0, 0.9, 0, 0, 0, 0, 0.12, 1.8, 0.12).box(c0, 0, 0, 0, 1.3, 0.35, 0.7).box(c1, 0, 0.2, 0, 1.2, 0.06, 0.6, 0, { cls: 'fine' }).part('box', c0, 0.75, 0.1, 0, 0, 0, 0.5, 0.35, 0.25, 0.6).part('box', c0, -0.75, 0.1, 0, 0, 0, -0.5, 0.35, 0.25, 0.6); });
      ship.position.y = -1.8; arm.add(ship); const seats = [-0.4, 0, 0.4].flatMap(x => [seat(ship, x, 0.22, 0.15, Math.PI / 2), seat(ship, x, 0.22, -0.15, Math.PI / 2)]);
      return { group, seats, animate: (t, running) => { arm.rotation.x = running ? Math.sin(t * 0.9) * (0.3 + (Math.PI - 0.3) * (0.5 - 0.5 * Math.cos(t * 0.1))) : 0; } };
    }
    case 'roto_drop': {   // a tall tower with a ring of seats that turns its way up, then drops
      add(sk => { sk.part('cyl6', 0xa0a0a0, 0, 3.6, 0, 0, 0, 0, 0.3, 7.2, 0.3).part('cyl', c1, 0, 7.3, 0, 0, 0, 0, 0.5, 0.2, 0.5).part('cyl', 0x555555, 0, 0.08, 0, 0, 0, 0, 0.9, 0.16, 0.9); });
      const ring = add(sk => { sk.part('cyl', c0, 0, 0, 0, 0, 0, 0, 1.1, 0.25, 1.1); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sk.part('box', c2, Math.cos(a) * 0.55, -0.15, Math.sin(a) * 0.55, 0, -a, 0, 0.18, 0.25, 0.22); } }, 0, 0.4, 0);
      const seats = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return seat(ring, Math.cos(a) * 0.62, -0.12, Math.sin(a) * 0.62, -a); });
      return { group, seats, animate: (t, running) => { const ph = running ? (t * 0.12) % 1 : 0; ring.position.y = 0.4 + (ph < 0.85 ? ph / 0.85 : 1 - (ph - 0.85) / 0.15) * 6.2; ring.rotation.y = running ? t * 0.4 : 0; } };
    }
    case 'lift': {   // a lift shaft with a cab that goes up and down
      add(sk => { for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) sk.part('box', 0x888888, x, 3, z, 0, 0, 0, 0.08, 6, 0.08); for (let y = 0.5; y < 6; y += 1) sk.box(0x777777, 0, y, 0, 0.66, 0.05, 0.66, 0, { cls: 'fine' }); sk.box(c1, 0, 6.05, 0, 0.8, 0.12, 0.8); });
      const cab = add(sk => { sk.box(c0, 0, 0.3, 0, 0.5, 0.6, 0.5).box(0xbfe3ff, 0, 0.38, -0.26, 0.36, 0.3, 0.02, 0, { cls: 'fine' }); }, 0, 0.05, 0);
      return { group, seats: [seat(cab, -0.1, 0.05, 0), seat(cab, 0.1, 0.05, 0)], animate: (t, running) => { cab.position.y = 0.05 + (running ? (0.5 - 0.5 * Math.cos(t * 0.6)) * 5.3 : 0); } };
    }
  }
  return null;
}
/** The cash machine: a little kiosk with a screen and a card slot. */
export function cashMachineSketch(sk: Sketch, a: number) {
  sk.box(0xd8d8d8, 0, 0.45, 0, 0.5, 0.9, 0.4).box(a, 0, 0.98, 0, 0.56, 0.16, 0.46).box(0x2b6cd9, 0, 0.62, -0.205, 0.3, 0.2, 0.02, 0, { cls: 'fine' }).box(0x333333, 0, 0.42, -0.205, 0.2, 0.04, 0.02, 0, { cls: 'fine' }).box(0x2f9e44, 0, 1.08, 0, 0.3, 0.06, 0.3, 0, { cls: 'fine' });
}
