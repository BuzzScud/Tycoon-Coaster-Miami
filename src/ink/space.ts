// The Space set in the retro style (1950s space age: finned rockets with portholes, cream and coral with teal and
// mustard, a starburst beacon, an atomic lamp). Pieces are built at a realistic size next to a guest (who stands about
// 0.85 tall): the launch-pad rocket is about 7 guests high. Each piece is still parts plus parts that move, and has
// one accent colour the player can change.
import * as THREE from 'three';
import { Sketch, buildGroup, type InkStyle } from './kit';

export interface SpacePieceDef { key: string; name: string; size: 1 | 2 | 3; k: number; moves: string }
/** size: footprint in tiles; k: how much larger than the first design round's drawing (size 1 or 2 there). */
export const SPACE_PIECES: SpacePieceDef[] = [
  { key: 'space_launchpad', name: 'Launch pad', size: 3, k: 1.5, moves: 'steam rolls off the pad' },
  { key: 'space_dome', name: 'Moon dome', size: 3, k: 1.5, moves: 'its beacon blinks' },
  { key: 'space_rocket', name: 'Rocket', size: 2, k: 2.4, moves: 'exhaust flickers' },
  { key: 'space_radar', name: 'Radar dish', size: 2, k: 2, moves: 'turns slowly' },
  { key: 'space_satellite', name: 'Satellite', size: 2, k: 2, moves: 'turns and bobs' },
  { key: 'space_saucer', name: 'Flying saucer', size: 2, k: 1.9, moves: 'hovers and spins' },
  { key: 'space_beacon', name: 'Starburst beacon', size: 1, k: 1.8, moves: 'spins' },
  { key: 'space_plant', name: 'Alien plant', size: 1, k: 1.6, moves: 'sways' },
  { key: 'space_lamp', name: 'Atomic lamp', size: 1, k: 1.45, moves: 'electrons orbit' },
  { key: 'space_astronaut', name: 'Astronaut statue', size: 1, k: 1.6, moves: 'flag waves' },
  { key: 'space_rocks', name: 'Moon rocks', size: 1, k: 1.4, moves: '' },
];
export const SPACE_BY_KEY: Record<string, SpacePieceDef> = Object.fromEntries(SPACE_PIECES.map(p => [p.key, p]));
export const SPACE_ACCENT = 0xe4572e;   // coral, the colour a player can change
const P = { body: 0xf2e8cf, second: 0x2a9d8f, soft: 0xa8dadc, gold: 0xe9c46a, metal: 0xb0b7bf, glass: 0x9bd1e5, dark: 0x3d405b, pad: 0xc9c2b2, glow: 0xffd166, rock: 0xa39e93, panel: 0x2b4a7a };
export interface DrawnPiece { group: THREE.Group; animate(t: number): void }

const dome = (r: number) => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const bowl = () => new THREE.LatheGeometry([0, 0.1, 0.2, 0.3, 0.4, 0.46].map(x => new THREE.Vector2(x, x * x * 0.9)), 14);
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

/** The retro rocket: cream body, coral nose, band and three fins, two portholes. k scales it. */
function rocket(sk: Sketch, accent: number, k = 1) {
  sk.part('cyl', P.body, 0, 0.95 * k, 0, 0, 0, 0, 0.4 * k, 1.3 * k, 0.4 * k).part('cone', accent, 0, 1.88 * k, 0, 0, 0, 0, 0.4 * k, 0.56 * k, 0.4 * k).part('cyl', accent, 0, 1.45 * k, 0, 0, 0, 0, 0.42 * k, 0.07 * k, 0.42 * k);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; sk.part('box', accent, Math.cos(a) * 0.27 * k, 0.42 * k, Math.sin(a) * 0.27 * k, 0, -a, 0, 0.3 * k, 0.6 * k, 0.04 * k); }
  for (const y of [1.0, 1.25]) sk.part('ball', P.glass, 0.19 * k, y * k, 0, 0, 0, 0, 0.11 * k, 0.11 * k, 0.04 * k);
}

/** One Space piece, drawn at its realistic size (big) or the first round's size; accent recolours it. */
export function drawSpacePiece(key: string, s: InkStyle, seed = 0, opts: { big?: boolean; accent?: number } = {}): DrawnPiece {
  const def = SPACE_BY_KEY[key]; const k = opts.big === false ? 1 : def?.k ?? 1; const A = opts.accent ?? SPACE_ACCENT;
  const group = new THREE.Group(); const anims: ((t: number) => void)[] = []; const scaleM = new THREE.Matrix4().makeScale(k, k, k);
  /** Draw in the first round's units; the whole piece comes out k times larger with the same outline weight. */
  const add = (fn: (sk: Sketch) => void, x = 0, y = 0, z = 0, parent: THREE.Object3D = group) => { const sk = new Sketch(); sk.push(scaleM); fn(sk); const g = buildGroup(sk, s); g.position.set(x * k, y * k, z * k); parent.add(g); return g; };
  switch (key) {
    case 'space_rocket': {
      add(sk => { sk.box(P.metal, 0, 0.03, 0, 0.7, 0.06, 0.7); rocket(sk, A); });
      const flame = add(sk => { sk.part('cone', 0xf4a261, 0, -0.14, 0, Math.PI, 0, 0, 0.22, 0.28, 0.22, { outline: false }); }, 0, 0.4, 0);
      anims.push(t => { flame.scale.set(1, 0.7 + 0.35 * Math.abs(Math.sin(t * 9 + seed)), 1); }); break;
    }
    case 'space_launchpad': {
      add(sk => {
        sk.box(P.pad, 0, 0.06, 0, 1.8, 0.12, 1.8);
        for (let i = 0; i < 6; i++) sk.quad([[-0.9 + i * 0.3, 0.125, 0.82], [-0.75 + i * 0.3, 0.125, 0.82], [-0.75 + i * 0.3, 0.125, 0.9], [-0.9 + i * 0.3, 0.125, 0.9]], i % 2 ? 0x2c3530 : P.gold, null);
        for (const z of [-0.22, 0.22]) sk.box(A, 0.8, 2.2, z, 0.1, 4.2, 0.1); for (let y = 0.4; y < 4.1; y += 0.45) sk.line([[0.8, y, -0.22], [0.8, y + 0.45, 0.22]], 'fine');
        sk.box(0xffffff, 0.8, 4.38, 0, 0.16, 0.14, 0.6); for (const y of [1.6, 2.9]) sk.box(A, 0.6, y, 0, 0.4, 0.06, 0.08);
        sk.push(M(-0.12, 0.12, 0)); rocket(sk, A, 1.9); sk.pop();
      });
      const puffs = [0, 1, 2, 3, 4].map(() => add(sk => { sk.part('ball', 0xf3f4f1, 0, 0, 0, 0, 0, 0, 0.36, 0.28, 0.36); }));
      anims.push(t => puffs.forEach((pf, i) => { const f = (t * 0.35 + i / 5) % 1, a = i * 1.26 + seed; pf.position.set((-0.12 + Math.cos(a) * (0.4 + f * 0.5)) * k, (0.2 + f * 0.25) * k, Math.sin(a) * (0.4 + f * 0.5) * k); pf.scale.setScalar(0.6 + f * 0.9); }));
      break;
    }
    case 'space_dome': {
      add(sk => {
        sk.part('cyl', P.metal, 0, 0.08, 0, 0, 0, 0, 1.85, 0.16, 1.85); sk.custom(dome(0.85), P.body, M(0, 0.16, 0));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, pts: [number, number, number][] = []; for (let j = 0; j <= 8; j++) { const b = (j / 8) * Math.PI / 2; pts.push([Math.cos(a) * Math.cos(b) * 0.86, 0.16 + Math.sin(b) * 0.86, Math.sin(a) * Math.cos(b) * 0.86]); } sk.line(pts, 'fine'); }
        sk.ring(0, 0.165, 0, 0.86, 24, 'edge'); for (const a of [0.7, 1.6, 2.5, 3.4]) sk.part('ball', P.glass, Math.cos(a) * 0.76, 0.48, Math.sin(a) * 0.76, 0, -a, 0, 0.16, 0.16, 0.06);
        sk.box(P.second, 0.86, 0.47, 0, 0.18, 0.62, 0.3); sk.box(A, 0.95, 0.82, 0, 0.04, 0.08, 0.36, 0, { cls: 'fine' });   // a door a guest can walk through
        sk.part('cyl6', P.metal, 0, 1.22, 0, 0, 0, 0, 0.04, 0.5, 0.04, { outline: false });
      });
      const tip = add(sk => { sk.part('ball', A, 0, 0, 0, 0, 0, 0, 0.12, 0.12, 0.12); }, 0, 1.5, 0);
      anims.push(t => { tip.visible = Math.sin(t * 3 + seed) > -0.3; }); break;
    }
    case 'space_radar': {
      add(sk => { sk.box(P.metal, 0, 0.05, 0, 0.5, 0.1, 0.5); sk.part('cyl6', P.second, 0, 0.6, 0, 0, 0, 0, 0.1, 1.0, 0.1); });
      const head = add(sk => { sk.custom(bowl(), P.body, M(0, 0, 0, -0.6, 0, 0)); const rim: [number, number, number][] = []; for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2; const v = new THREE.Vector3(Math.cos(a) * 0.46, 0.19, Math.sin(a) * 0.46).applyEuler(new THREE.Euler(-0.6, 0, 0)); rim.push([v.x, v.y, v.z]); } sk.line(rim, 'edge');
        const tv = new THREE.Vector3(0, 0.5, 0).applyEuler(new THREE.Euler(-0.6, 0, 0)); sk.line([[0, 0.05, 0], [tv.x, tv.y, tv.z]], 'fine'); sk.part('ball', A, tv.x, tv.y, tv.z, 0, 0, 0, 0.09, 0.09, 0.09); }, 0, 1.12, 0);
      anims.push(t => { head.rotation.y = t * 0.45 + seed; }); break;
    }
    case 'space_satellite': {
      add(sk => { sk.box(P.metal, 0, 0.05, 0, 0.4, 0.1, 0.4); sk.part('cyl6', P.metal, 0, 0.65, 0, 0, 0, 0, 0.05, 1.2, 0.05, { outline: false }); });
      const sat = add(sk => { sk.box(P.gold, 0, 0, 0, 0.26, 0.26, 0.26); for (const x of [-0.42, 0.42]) { sk.box(P.panel, x, 0, 0, 0.5, 0.02, 0.26); for (let i = 1; i < 4; i++) sk.line([[x - 0.25 + i * 0.125, 0.012, -0.13], [x - 0.25 + i * 0.125, 0.012, 0.13]], 'fine'); }
        sk.part('cone', P.body, 0, 0.2, 0, Math.PI, 0, 0, 0.18, 0.12, 0.18); sk.part('ball', A, 0, 0.27, 0, 0, 0, 0, 0.05, 0.05, 0.05, { outline: false }); }, 0, 1.35, 0);
      anims.push(t => { sat.rotation.y = t * 0.3 + seed; sat.position.y = (1.35 + Math.sin(t * 1.2 + seed) * 0.05) * k; }); break;
    }
    case 'space_beacon': {
      add(sk => { sk.box(P.second, 0, 0.06, 0, 0.36, 0.12, 0.36); sk.part('cyl6', P.second, 0, 0.75, 0, 0, 0, 0, 0.07, 1.4, 0.07); });
      const star = add(sk => { sk.part('ball', A, 0, 0, 0, 0, 0, 0, 0.16, 0.16, 0.16); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const len = i % 2 ? 0.32 : 0.46; sk.line([[0, 0, 0], [Math.cos(a) * len, Math.sin(a) * len, 0]], 'edge'); sk.part('ball', P.gold, Math.cos(a) * len, Math.sin(a) * len, 0, 0, 0, 0, 0.07, 0.07, 0.07); } }, 0, 1.55, 0);
      anims.push(t => { star.rotation.z = t * 0.8 + seed; }); break;
    }
    case 'space_saucer': {
      add(sk => { sk.box(P.metal, 0, 0.05, 0, 0.4, 0.1, 0.4); sk.part('cyl6', P.metal, 0, 0.55, 0, 0, 0, 0, 0.04, 1.0, 0.04, { outline: false }); });
      const ufo = add(sk => { sk.part('ball', P.metal, 0, 0, 0, 0, 0, 0, 0.95, 0.2, 0.95); sk.custom(dome(0.22), P.glass, M(0, 0.05, 0)); sk.ring(0, 0.0, 0, 0.475, 20, 'fine');
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; sk.part('ball', A, Math.cos(a) * 0.4, -0.04, Math.sin(a) * 0.4, 0, 0, 0, 0.07, 0.07, 0.07, { outline: false }); } }, 0, 1.2, 0);
      anims.push(t => { ufo.rotation.y = t * 1.2 + seed; ufo.position.y = (1.2 + Math.sin(t * 1.8 + seed) * 0.08) * k; }); break;
    }
    case 'space_plant': {
      const plant = add(sk => { const bulb = [A, P.gold, A];
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.4, h = [0.9, 0.65, 0.75][i]; const tx = Math.cos(a) * 0.25 * h, tz = Math.sin(a) * 0.25 * h;
          sk.line([[0, 0, 0], [tx * 0.5, h * 0.55, tz * 0.5], [tx, h, tz]], 'edge'); sk.part('ball', bulb[i], tx, h, tz, 0, 0, 0, 0.18, 0.22, 0.18); }
        sk.part('ball', P.second, 0, 0.06, 0, 0, 0, 0, 0.42, 0.14, 0.42); });
      anims.push(t => { plant.rotation.z = Math.sin(t * 1.1 + seed) * 0.06; plant.rotation.x = Math.cos(t * 0.9 + seed) * 0.05; }); break;
    }
    case 'space_lamp': {
      add(sk => { sk.box(P.dark, 0, 0.05, 0, 0.3, 0.1, 0.3); sk.part('cyl6', P.dark, 0, 0.7, 0, 0, 0, 0, 0.05, 1.3, 0.05, { outline: false }); sk.part('ball', P.glow, 0, 1.45, 0, 0, 0, 0, 0.2, 0.2, 0.2); });
      const orbit = new THREE.Group(); orbit.position.y = 1.45 * k; group.add(orbit);
      const electrons = [0, 1.05, 2.1].map((tl, i) => { const rg = add(sk => { const pts: [number, number, number][] = []; for (let j = 0; j <= 24; j++) { const a = (j / 24) * Math.PI * 2; pts.push([Math.cos(a) * 0.32, Math.sin(a) * 0.12, 0]); } sk.line(pts, 'fine'); }, 0, 0, 0, orbit); rg.rotation.y = tl;
        const e = add(sk => { sk.part('ball', A, 0, 0, 0, 0, 0, 0, 0.07, 0.07, 0.07); }, 0, 0, 0, rg); return { e, i }; });
      anims.push(t => electrons.forEach(({ e, i }) => { const a = t * 2.2 + i * 2.1 + seed; e.position.set(Math.cos(a) * 0.32 * k, Math.sin(a) * 0.12 * k, 0); })); break;
    }
    case 'space_astronaut': {
      add(sk => { sk.box(P.pad, 0, 0.18, 0, 0.55, 0.36, 0.55);
        sk.box(0xf4f4f4, -0.06, 0.52, 0, 0.09, 0.32, 0.1).box(0xf4f4f4, 0.06, 0.52, 0, 0.09, 0.32, 0.1).box(0xf4f4f4, 0, 0.82, 0, 0.26, 0.32, 0.17).box(P.metal, 0, 0.84, -0.12, 0.2, 0.26, 0.08).box(0xf4f4f4, -0.17, 0.85, 0, 0.08, 0.26, 0.09).box(0xf4f4f4, 0.17, 1.02, 0, 0.08, 0.26, 0.09);
        sk.part('ball', 0xf4f4f4, 0, 1.12, 0, 0, 0, 0, 0.26, 0.26, 0.26).part('ball', P.gold, 0, 1.12, 0.07, 0, 0, 0, 0.18, 0.13, 0.14); sk.line([[0.2, 0.95, 0], [0.2, 1.75, 0]], 'edge'); });
      const flag = add(sk => { sk.box(A, 0.18, 0, 0, 0.36, 0.22, 0.015, 0, { cls: 'fine' }); }, 0.2, 1.62, 0);
      anims.push(t => { flag.rotation.y = Math.sin(t * 2.4 + seed) * 0.35; }); break;
    }
    case 'space_rocks': default: {
      add(sk => { sk.custom(new THREE.RingGeometry(0.22, 0.42, 24).rotateX(-Math.PI / 2), 0xb8b2a6, M(0.1, 0.02, 0.12)); sk.custom(new THREE.CircleGeometry(0.22, 18).rotateX(-Math.PI / 2), 0x8f897d, M(0.1, 0.015, 0.12)); sk.ring(0.1, 0.022, 0.12, 0.42, 18, 'fine'); sk.ring(0.1, 0.02, 0.12, 0.22, 18, 'fine');
        sk.part('ball', P.rock, -0.28, 0.12, -0.2, 0.2, 0.4, 0, 0.36, 0.26, 0.3).part('ball', P.rock, 0.3, 0.08, -0.3, 0, 1.1, 0.2, 0.24, 0.17, 0.2).part('ball', P.rock, -0.3, 0.07, 0.3, 0.3, 0, 0, 0.2, 0.14, 0.18); });
    }
  }
  return { group, animate: t => anims.forEach(f => f(t)) };
}
