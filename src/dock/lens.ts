// Map overlays: colour the park by what guests feel, where the litter is, how long the queues are, where the crowds
// are, or a staff member's patrol area. One flat coloured square per tile, laid just over the ground, rebuilt a few
// times a second while an overlay is on; a small legend at the top says what the colours mean.
import * as THREE from 'three';
import { LAND_STEP, type GameState, type Staff } from '../sim/types';
import { RIDE_BY_KEY } from '../sim/rides';
import { queueLine } from '../sim/guests';
import { PATROL, patrolCell } from '../sim/staff';
import { HU } from '../three/world';
import { landZ, waterZ } from '../sim/map';

export type LensMode = 'off' | 'happiness' | 'litter' | 'queues' | 'crowds' | 'patrol';
export const LENSES: [LensMode, string][] = [['off', 'Off'], ['happiness', 'Happiness'], ['litter', 'Litter'], ['queues', 'Queues'], ['crowds', 'Crowds']];
const LEGEND: Record<string, { title: string; stops: [string, string][] }> = {
  happiness: { title: 'How happy the guests on each path are', stops: [['#e5484d', 'unhappy'], ['#f5a524', 'so-so'], ['#30a46c', 'happy']] },
  litter: { title: 'Litter on the paths', stops: [['#30a46c', 'clean'], ['#f5a524', 'some'], ['#e5484d', 'dirty'], ['#8e4ec6', 'bin full']] },
  queues: { title: 'Queue lines, by how full they are', stops: [['#30a46c', 'short'], ['#f5a524', 'busy'], ['#e5484d', 'full']] },
  crowds: { title: 'Where the guests are', stops: [['#6cb4ff', 'a few'], ['#f5a524', 'busy'], ['#e5484d', 'packed']] },
  patrol: { title: 'Patrol area: click or drag squares to add or remove them', stops: [['#12a594', 'in the area']] },
};
const C = (hex: string) => new THREE.Color(hex);
const RED = C('#e5484d'), AMB = C('#f5a524'), GRN = C('#30a46c'), BLUE = C('#6cb4ff'), PURP = C('#8e4ec6'), TEAL = C('#12a594');
/** 0..1 along red → amber → green (or any three stops). */
function ramp(t: number, a: THREE.Color, b: THREE.Color, c: THREE.Color, out: THREE.Color) { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? out.copy(a).lerp(b, t * 2) : out.copy(b).lerp(c, (t - 0.5) * 2); }

export class Lens {
  mode: LensMode = 'off'; staff: Staff | null = null; mesh: THREE.InstancedMesh; legend: HTMLElement; private max = 0; private last = 0; private g: GameState | null = null;
  constructor(root: HTMLElement, public onClose: () => void) {
    const geo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.62, depthWrite: false }), 1); this.mesh.count = 0; this.mesh.renderOrder = 6; this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.legend = document.createElement('div'); this.legend.id = 'legend'; this.legend.className = 'glass'; root.appendChild(this.legend);
    this.legend.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-x]')) this.onClose(); });
  }
  set(mode: LensMode, staff: Staff | null = null) {
    this.mode = mode; this.staff = staff; this.last = 0; this.mesh.visible = mode !== 'off';
    const l = LEGEND[mode]; this.legend.style.display = l ? 'flex' : 'none';
    if (l) this.legend.innerHTML = `<b>${mode === 'patrol' && staff ? staff.name + ': ' : ''}${l.title}</b><span class="stops">${l.stops.map(([c, t]) => `<i style="background:${c}"></i>${t}`).join('')}</span>${mode === 'patrol' ? '' : '<button class="btn sq" data-x="1" title="Overlay off (O)">✕</button>'}`;
  }
  /** Rebuild the colours a few times a second while on (every frame for the patrol area, which is being painted). */
  update(g: GameState, now: number, force = false) {
    if (this.mode === 'off') return; if (!force && g === this.g && now - this.last < (this.mode === 'patrol' ? 0 : 400)) return; this.last = now; this.g = g;
    const n = g.w * g.h; if (n > this.max) { this.max = n; const old = this.mesh; this.mesh = new THREE.InstancedMesh(old.geometry, old.material, n); this.mesh.renderOrder = 6; this.mesh.frustumCulled = false; this.mesh.visible = true; old.parent?.add(this.mesh); old.parent?.remove(old); old.dispose(); }
    const M = new THREE.Matrix4(), col = new THREE.Color(); let k = 0;
    const put = (x: number, y: number, c: THREE.Color) => { const t = g.tiles[y * g.w + x]; const p = t.paths[t.paths.length - 1]; const z = p ? p.z + (p.slope !== -1 ? LAND_STEP / 2 : 0) : Math.max(landZ(t, 0.5, 0.5), waterZ(t) ?? 0); M.makeTranslation(x + 0.5, z * HU + 0.09, y + 0.5); this.mesh.setMatrixAt(k, M); this.mesh.setColorAt(k, c); k++; };
    if (this.mode === 'happiness' || this.mode === 'crowds') {
      const sum = new Float32Array(n), cnt = new Uint16Array(n);
      for (const gu of g.guests) { if (gu.state === 'left' || gu.state === 'entering' || gu.state === 'riding') continue; const i = gu.ty * g.w + gu.tx; if (i < 0 || i >= n) continue; sum[i] += gu.happiness; cnt[i]++; }
      for (let i = 0; i < n; i++) if (cnt[i]) { const x = i % g.w, y = (i - x) / g.w; if (this.mode === 'happiness') put(x, y, ramp((sum[i] / cnt[i] - 60) / 150, RED, AMB, GRN, col)); else put(x, y, ramp(Math.min(1, (cnt[i] - 1) / 7), BLUE, AMB, RED, col)); }
    } else if (this.mode === 'litter') {
      for (let i = 0; i < n; i++) { const t = g.tiles[i]; const p = t.paths.find(q => !q.queue); if (!p) continue; const x = i % g.w, y = (i - x) / g.w; const dirt = t.litter + t.vomit * 2;
        if (t.paths.some(q => (q.adds.bin ?? 0) >= 8)) put(x, y, PURP); else put(x, y, dirt ? ramp(0.5 + Math.min(1, dirt / 4) / 2, GRN, AMB, RED, col) : GRN); }
    } else if (this.mode === 'queues') {
      for (const r of g.rides) { const d = RIDE_BY_KEY[r.type]; if (d.kind === 'stall' || !r.entrance) continue; const line = queueLine(g, r); if (!line.length) continue;
        const full = Math.min(1, r.queue.length / Math.max(3, line.length * 3)); ramp(full, GRN, AMB, RED, col); for (const [x, y] of line) put(x, y, col); }
    } else if (this.mode === 'patrol' && this.staff) {
      const cells = new Set(this.staff.patrol ?? []); const cw = Math.ceil(g.w / PATROL);
      for (const c of cells) { const cx = (c % cw) * PATROL, cy = Math.floor(c / cw) * PATROL; for (let y = cy; y < Math.min(g.h, cy + PATROL); y++) for (let x = cx; x < Math.min(g.w, cx + PATROL); x++) if (patrolCell(g, x, y) === c) put(x, y, TEAL); }
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  hide(on: boolean) { this.legend.style.visibility = on ? 'hidden' : ''; }
}
