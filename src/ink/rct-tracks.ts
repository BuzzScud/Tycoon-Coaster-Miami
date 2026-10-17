// The track and vehicles of the ride styles RCT has that this game did not: stand-up, flying, lay-down and suspended
// coasters, bobsleighs, single rails, monorails, a chairlift's cable, roads (cars, trucks, karts, the ghost train),
// mini golf and the small boats. Drawn as sketches, so the ink look outlines them and the lit 3D look shades them.
import * as THREE from 'three';
import type { Sketch } from './kit';

type Frame = { p: THREE.Vector3; t: THREE.Vector3; up: THREE.Vector3 };
type DrawFn = (fn: (sk: Sketch) => void) => THREE.Group;
/** Hanging cars sit this far below the raised track (their origin; the track is 0.75 up, the car 0.3). */
export const HANG = 0.45;
/** Styles whose track runs overhead with the cars hanging below it. */
export const hangs = (style?: string) => style === 'inverted' || style === 'suspended' || style === 'flying' || style === 'laydown' || style === 'cable';
/** Cars that turn round as they go (rafts, tubs, spinning mice). */
export const spins = (type: string, style?: string) => type === 'virginia_reel' || type === 'spinning_wild_mouse' || (style === 'rapids' && type !== 'submarine_ride' && type !== 'boat_hire');
/** Cars that swing out on the turns. */
export const swings = (style?: string) => style === 'suspended' || style === 'cable';
/** How far a swinging car leans at track metres s: the turn just ahead, as an angle about the direction of travel. */
export function swingAt(frameAt: (s: number) => Frame | null, s: number): number {
  const a = frameAt(s - 0.6), b = frameAt(s + 0.6); if (!a || !b) return 0;
  const turn = new THREE.Vector3().crossVectors(a.t, b.t).y; return Math.max(-0.9, Math.min(0.9, turn * 6));
}
const at3 = (f: Frame, ox: number, oy: number): [number, number, number] => { const side = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); return f.p.clone().addScaledVector(side, ox).addScaledVector(f.up, oy).toArray() as [number, number, number]; };
/** A box section along the track: from ox0 to ox1 across, oy0 to oy1 up; top and both sides filled, top edges inked. */
function beam(sk: Sketch, fr: Frame[], n: number, ox0: number, ox1: number, oy0: number, oy1: number, top: number, side: number, ink: 'edge' | 'fine' = 'edge', under = false) {
  for (let i = 0; i < n; i++) { const a = fr[i], b = fr[(i + 1) % fr.length];
    sk.quad([at3(a, ox0, oy1), at3(b, ox0, oy1), at3(b, ox1, oy1), at3(a, ox1, oy1)], top, null);
    sk.quad([at3(a, ox0, oy0), at3(b, ox0, oy0), at3(b, ox0, oy1), at3(a, ox0, oy1)], side, null); sk.quad([at3(a, ox1, oy0), at3(b, ox1, oy0), at3(b, ox1, oy1), at3(a, ox1, oy1)], side, null);
    if (under) sk.quad([at3(a, ox0, oy0), at3(b, ox0, oy0), at3(b, ox1, oy0), at3(a, ox1, oy0)], side, null); }
  const L: [number, number, number][] = [], R: [number, number, number][] = []; for (let i = 0; i <= n; i++) { const f = fr[i % fr.length]; L.push(at3(f, ox0, oy1)); R.push(at3(f, ox1, oy1)); }
  sk.line(L, ink); sk.line(R, ink);
}
const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
/** Draw the track of a new style into the sketch; false for styles drawn the old way (two rails, channels, the railway). */
export function trackSketch(sk: Sketch, fr: Frame[], n: number, style: string | undefined, type: string, col: number): boolean {
  switch (style) {
    case 'singlerail': {   // one tall I-beam, thin ties under it
      beam(sk, fr, n, -0.05, 0.05, -0.04, 0.08, col, shade(col, 0.75));
      const M = new THREE.Matrix4(); for (let i = 0; i < fr.length; i += 2) { const f = fr[i]; const side = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); M.makeBasis(side, f.up, f.t.clone().negate()).setPosition(f.p.clone().addScaledVector(f.up, -0.06)); sk.push(M); sk.box(0x777777, 0, 0, 0, 0.24, 0.03, 0.06, 0, { cls: 'fine' }); sk.pop(); }
      return true;
    }
    case 'monorail': {   // a wide concrete beam with a coloured stripe; monorail cycles ride a thinner one
      const w = type === 'monorail' ? 0.17 : 0.1; beam(sk, fr, n, -w, w, -0.22, 0.02, 0xc9c6bd, 0xa9a69d, 'edge', true); beam(sk, fr, n, -w - 0.005, w + 0.005, -0.12, -0.07, col, col, 'fine'); return true;
    }
    case 'cable': {   // the hauling cable, a fine steel band
      beam(sk, fr, n, -0.015, 0.015, -0.015, 0.015, 0x4a4a4a, 0x4a4a4a, 'fine'); return true;
    }
    case 'bobsleigh': {   // a half-pipe: white inside, a coloured outer skin, inked rims
      const pts = [[-0.3, 0.26], [-0.26, 0.1], [-0.16, 0], [0.16, 0], [0.26, 0.1], [0.3, 0.26]];
      for (let i = 0; i < n; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; for (let k = 0; k < pts.length - 1; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; sk.quad([at3(a, x0, y0), at3(b, x0, y0), at3(b, x1, y1), at3(a, x1, y1)], k === 2 ? 0xdfe8f0 : 0xf3f7fa, null); sk.quad([at3(a, x0 * 1.15, y0 - 0.06), at3(b, x0 * 1.15, y0 - 0.06), at3(b, x1 * 1.15, y1 - 0.06), at3(a, x1 * 1.15, y1 - 0.06)], col, null); } }
      for (const x of [-0.3, 0.3]) { const L: [number, number, number][] = []; for (let i = 0; i <= n; i++) L.push(at3(fr[i % fr.length], x, 0.26)); sk.line(L, 'edge'); }
      return true;
    }
    case 'road': case 'ghost': {   // a road with kerbs and a dashed centre line; the ghost train's runs through dark arches
      const ghost = style === 'ghost'; const kart = type === 'go_karts'; const W = kart ? 0.42 : 0.34;
      beam(sk, fr, n, -W, W, -0.03, 0.01, ghost ? 0x3b3346 : kart ? 0x555555 : 0x6d6d6d, ghost ? 0x2a2433 : 0x4d4d4d, 'fine');
      for (let i = 0; i < n; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; for (const x of [-W, W - 0.05]) sk.quad([at3(a, x, 0.04), at3(b, x, 0.04), at3(b, x + 0.05, 0.04), at3(a, x + 0.05, 0.04)], ghost ? 0x6b4f8a : i % 2 ? 0xffffff : 0xc0392b, null);
        if (!ghost && i % 2 === 0) sk.quad([at3(a, -0.015, 0.012), at3(b, -0.015, 0.012), at3(b, 0.015, 0.012), at3(a, 0.015, 0.012)], 0xf2f2f2, null); }
      if (ghost) for (let i = 0; i < fr.length; i += 4) { const f = fr[i]; const side = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); const M = new THREE.Matrix4().makeBasis(side, f.up, f.t.clone().negate()).setPosition(f.p); sk.push(M);
        sk.box(0x2a2433, -W - 0.03, 0.3, 0, 0.06, 0.6, 0.08).box(0x2a2433, W + 0.03, 0.3, 0, 0.06, 0.6, 0.08).box(0x4b3a63, 0, 0.62, 0, W * 2 + 0.12, 0.06, 0.1); if (i % 8 === 0) sk.part('ball', 0x8fff6a, 0, 0.52, 0, 0, 0, 0, 0.07, 0.07, 0.07, { outline: false }); sk.pop(); }
      return true;
    }
    case 'golf': {   // putting greens with wooden borders and a flag on every other piece
      beam(sk, fr, n, -0.3, 0.3, -0.03, 0.01, 0x46a84f, 0x3b8a42, 'fine');
      for (let i = 0; i < n; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; for (const x of [-0.33, 0.28]) sk.quad([at3(a, x, 0.05), at3(b, x, 0.05), at3(b, x + 0.05, 0.05), at3(a, x + 0.05, 0.05)], 0x8a6a3a, null); }
      for (let i = 3; i < fr.length; i += 7) { const f = fr[i]; const side = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); const M = new THREE.Matrix4().makeBasis(side, f.up, f.t.clone().negate()).setPosition(f.p); sk.push(M);
        sk.part('cyl6', 0xeeeeee, 0.12, 0.2, 0, 0, 0, 0, 0.02, 0.4, 0.02, { outline: false }).box(0xd33a2f, 0.18, 0.36, 0, 0.12, 0.08, 0.01, 0, { cls: 'fine' }).part('cyl', 0x1b1b1b, 0.12, 0.012, 0, 0, 0, 0, 0.06, 0.01, 0.06, { lines: 'none', outline: false }); sk.pop(); }
      return true;
    }
  }
  return false;
}

const seatAt = (parent: THREE.Object3D, x: number, y: number, z: number, ry = Math.PI / 2) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };
const wheels = (c: Sketch, w: number, z: number, r: number, y = r) => { for (const x of [-w, w]) for (const zz of [-z, z]) c.part('cyl', 0x222222, x, y, zz, 0, 0, Math.PI / 2, r * 2, 0.06, r * 2, { lines: 'rings' }); };
/** One car of a new style (or of a ride type with its own vehicle); null for the old vehicles. The car runs along −z. */
export function vehicleSketch(type: string, style: string | undefined, k: number, col: number, seats: THREE.Object3D[], draw: DrawFn): THREE.Group | null {
  const out = (fn: (c: Sketch) => void, at: [number, number, number][]) => { const g = draw(fn); for (const [x, y, z] of at) seats.push(seatAt(g, x, y, z)); return g; };
  const hanger = (c: Sketch, from: number) => c.part('cyl6', 0x666666, 0, (from + HANG) / 2, 0, 0, 0, 0, 0.05, HANG - from, 0.05, { outline: false });   // up to the track overhead
  switch (type) {
    case 'car_ride': return out(c => { c.box(col, 0, 0.12, 0, 0.3, 0.12, 0.44).box(col, 0, 0.22, 0.08, 0.28, 0.1, 0.2).box(0xbfe3ff, 0, 0.25, -0.05, 0.26, 0.08, 0.02, 0, { cls: 'fine' }); wheels(c, 0.15, 0.14, 0.05); }, [[-0.06, 0.16, 0.06], [0.06, 0.16, 0.06]]);
    case 'monster_trucks': return out(c => { c.box(col, 0, 0.3, 0.02, 0.3, 0.14, 0.42).box(col, 0, 0.42, 0.06, 0.26, 0.12, 0.2).box(0xbfe3ff, 0, 0.44, -0.05, 0.24, 0.08, 0.02, 0, { cls: 'fine' }); wheels(c, 0.17, 0.15, 0.11); }, [[-0.06, 0.36, 0.06], [0.06, 0.36, 0.06]]);
    case 'go_karts': return out(c => { c.box(col, 0, 0.06, 0, 0.26, 0.05, 0.4).box(0x222222, 0, 0.12, 0.06, 0.14, 0.08, 0.12, 0, { cls: 'fine' }).box(col, 0, 0.09, -0.19, 0.3, 0.05, 0.04, 0, { cls: 'fine' }); wheels(c, 0.14, 0.15, 0.04); }, [[0, 0.1, 0.04]]);
    case 'ghost_train': return out(c => { c.box(0x2d2240, 0, 0.12, 0, 0.32, 0.16, 0.42).box(col, 0, 0.22, -0.19, 0.32, 0.1, 0.04, 0, { cls: 'fine' }).part('ball', 0xeeeedd, 0, 0.3, -0.2, 0, 0, 0, 0.12, 0.12, 0.1).box(0x111111, -0.025, 0.31, -0.25, 0.025, 0.025, 0.01, 0, { lines: 'none' }).box(0x111111, 0.025, 0.31, -0.25, 0.025, 0.025, 0.01, 0, { lines: 'none' }); }, [[-0.07, 0.18, 0.06], [0.07, 0.18, 0.06]]);
    case 'mini_golf': return out(c => { c.box(0x2d2d2d, -0.03, 0.08, 0, 0.04, 0.16, 0.05).box(0x2d2d2d, 0.03, 0.08, 0, 0.04, 0.16, 0.05).box(col, 0, 0.24, 0, 0.12, 0.16, 0.07, 0, { outline: true }).part('ball', 0xf3c98b, 0, 0.37, 0, 0, 0, 0, 0.09, 0.09, 0.09).part('box', 0x888888, 0.07, 0.12, -0.04, 0.3, 0, 0, 0.012, 0.22, 0.012, { lines: 'none' }).part('ball', 0xffffff, 0.05, 0.015, -0.14, 0, 0, 0, 0.03, 0.03, 0.03, { outline: false }); }, []);
    case 'mini_helicopters': return out(c => { c.part('ball', col, 0, 0.18, 0, 0, 0, 0, 0.3, 0.24, 0.36).part('cyl6', col, 0, 0.2, 0.26, Math.PI / 2, 0, 0, 0.06, 0.26, 0.06).part('cyl6', 0x555555, 0, 0.34, 0, 0, 0, 0, 0.02, 0.08, 0.02, { outline: false }).box(0x333333, 0, 0.38, 0, 0.6, 0.01, 0.04, 0.6, { lines: 'none' }).box(0xbfe3ff, 0, 0.22, -0.15, 0.2, 0.1, 0.03, 0, { cls: 'fine' }); }, [[-0.05, 0.12, 0], [0.05, 0.12, 0]]);
    case 'monorail_cycles': return out(c => { c.box(col, 0, 0.1, 0, 0.06, 0.06, 0.34).part('cyl', 0x222222, 0, 0.08, -0.14, 0, 0, Math.PI / 2, 0.14, 0.03, 0.14, { lines: 'rings' }).part('cyl', 0x222222, 0, 0.08, 0.14, 0, 0, Math.PI / 2, 0.14, 0.03, 0.14, { lines: 'rings' }).box(0x333333, 0, 0.2, 0.06, 0.1, 0.03, 0.08, 0, { cls: 'fine' }); }, [[0, 0.18, 0.05]]);
    case 'dinghy_slide': return out(c => { c.part('cyl', col, 0, 0.08, 0, 0, 0, 0, 0.42, 0.1, 0.48).part('cyl', 0x222222, 0, 0.1, 0, 0, 0, 0, 0.28, 0.08, 0.34, { lines: 'none', outline: false }); }, [[0, 0.08, -0.08], [0, 0.08, 0.08]]);
    case 'splash_boats': return out(c => { c.box(col, 0, 0.1, 0.03, 0.34, 0.14, 0.42).part('cone', col, 0, 0.1, -0.25, -Math.PI / 2, 0, 0, 0.34, 0.16, 0.14).box(0x333333, 0, 0.15, 0.04, 0.26, 0.04, 0.34, 0, { cls: 'fine' }); }, [[-0.08, 0.14, -0.08], [0.08, 0.14, -0.08], [-0.08, 0.14, 0.06], [0.08, 0.14, 0.06], [-0.08, 0.14, 0.18], [0.08, 0.14, 0.18]]);
    case 'submarine_ride': return out(c => { c.part('cyl', 0xe9c21f, 0, 0.08, 0, Math.PI / 2, 0, 0, 0.26, 0.5, 0.26).part('ball', 0xe9c21f, 0, 0.08, -0.25, 0, 0, 0, 0.26, 0.26, 0.2).box(0xe9c21f, 0, 0.26, 0.04, 0.1, 0.14, 0.14).part('cyl', 0xbfe3ff, -0.13, 0.1, -0.05, 0, 0, Math.PI / 2, 0.08, 0.01, 0.08, { lines: 'none', outline: false }).part('cyl', 0xbfe3ff, 0.13, 0.1, -0.05, 0, 0, Math.PI / 2, 0.08, 0.01, 0.08, { lines: 'none', outline: false }); }, []);
    case 'boat_hire': return out(c => { c.box(col, 0, 0.07, 0.03, 0.26, 0.08, 0.36).part('cone', col, 0, 0.07, -0.21, -Math.PI / 2, 0, 0, 0.26, 0.1, 0.08).box(0x8a6a3a, 0, 0.12, 0.02, 0.24, 0.02, 0.05, 0, { cls: 'fine' }).part('box', 0x8a6a3a, 0, 0.13, 0.05, 0, 0, Math.PI / 2 - 0.2, 0.02, 0.6, 0.02, { lines: 'none' }); }, [[0, 0.1, -0.06], [0, 0.1, 0.1]]);
    case 'virginia_reel': return out(c => { c.part('cyl', col, 0, 0.12, 0, 0, 0, 0, 0.5, 0.18, 0.5).part('cyl', 0x3a3a3a, 0, 0.15, 0, 0, 0, 0, 0.36, 0.14, 0.36, { lines: 'rings' }); }, [0, 1, 2, 3].map(i => [Math.cos(i * 1.57) * 0.12, 0.14, Math.sin(i * 1.57) * 0.12] as [number, number, number]));
  }
  switch (style) {
    case 'standup': return out(c => { c.box(col, 0, 0.08, 0, 0.36, 0.1, 0.44).box(0x222222, 0, 0.03, 0, 0.3, 0.05, 0.46, 0, { cls: 'fine' }); for (const z of [-0.1, 0.12]) c.box(0x333333, 0, 0.32, z + 0.06, 0.32, 0.36, 0.03, 0, { cls: 'fine' }); }, [[-0.09, 0.14, -0.1], [0.09, 0.14, -0.1], [-0.09, 0.14, 0.12], [0.09, 0.14, 0.12]]);
    case 'flying': case 'laydown': return out(c => { hanger(c, 0.38); c.box(col, 0, 0.34, 0, 0.36, 0.08, 0.5).box(0x333333, 0, 0.29, 0, 0.3, 0.03, 0.46, 0, { cls: 'fine' }).box(col, 0, 0.3, -0.24, 0.36, 0.14, 0.04, 0, { cls: 'fine' }); }, [[-0.09, 0.14, -0.1], [0.09, 0.14, -0.1], [-0.09, 0.14, 0.12], [0.09, 0.14, 0.12]]);
    case 'suspended': return out(c => { hanger(c, 0.29); c.box(col, 0, 0.16, 0, 0.36, 0.22, 0.42).box(0x222222, 0, 0.04, 0, 0.3, 0.05, 0.42, 0, { cls: 'fine' }).box(col, 0, 0.28, 0, 0.38, 0.04, 0.44, 0, { cls: 'fine' }); }, [[-0.09, 0.2, -0.04], [0.09, 0.2, -0.04], [-0.09, 0.2, 0.12], [0.09, 0.2, 0.12]]);
    case 'cable': return out(c => { hanger(c, 0.21); c.box(0x555555, 0, 0.2, 0.02, 0.36, 0.03, 0.18).box(col, 0, 0.32, 0.1, 0.36, 0.22, 0.03, 0, { cls: 'fine' }).box(0x555555, 0, 0.42, -0.08, 0.38, 0.02, 0.02, 0, { lines: 'none' }); }, [[-0.08, 0.2, 0.02], [0.08, 0.2, 0.02]]);
    case 'bobsleigh': return out(c => { c.box(col, 0, 0.12, 0.03, 0.26, 0.14, 0.38).part('cone', col, 0, 0.12, -0.22, -Math.PI / 2, 0, 0, 0.26, 0.14, 0.14).box(0x222222, 0, 0.18, 0.06, 0.18, 0.04, 0.26, 0, { cls: 'fine' }); }, [[0, 0.16, -0.04], [0, 0.16, 0.12]]);
    case 'singlerail': return out(c => { c.box(col, 0, 0.18, 0, 0.2, 0.16, 0.44).box(0x222222, 0, 0.1, 0, 0.12, 0.05, 0.46, 0, { cls: 'fine' }).box(col, 0, 0.3, -0.2, 0.2, 0.08, 0.04, 0, { cls: 'fine' }); }, [[0, 0.24, -0.08], [0, 0.24, 0.12]]);
    case 'monorail': return out(c => { c.box(col, 0, 0.2, 0, 0.36, 0.28, 0.56).box(0xffffff, 0, 0.36, 0, 0.32, 0.04, 0.52, 0, { cls: 'fine' }).box(0x2b4a6b, -0.182, 0.24, 0, 0.01, 0.1, 0.46, 0, { lines: 'none' }).box(0x2b4a6b, 0.182, 0.24, 0, 0.01, 0.1, 0.46, 0, { lines: 'none' }); if (k === 0) c.part('cone', col, 0, 0.2, -0.33, -Math.PI / 2, 0, 0, 0.36, 0.12, 0.28); }, [[-0.09, 0.14, -0.14], [0.09, 0.14, -0.14], [-0.09, 0.14, 0.12], [0.09, 0.14, 0.12]]);
  }
  return null;
}
