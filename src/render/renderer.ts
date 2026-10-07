// Draws the world into an internal pixel buffer, then scales it up crisply. Painter's order: tiles by depth, objects within a tile by their depth.
import { LAND_STEP, type Dir, type GameState, type Ride, type TrackPiece } from '../sim/types';
import { RIDE_BY_KEY, COLOURS } from '../sim/rides';
import { tileAt } from '../sim/map';
import { pieceTiles } from '../sim/track';
import { monthFraction } from '../sim/time';
import { Projector, toView, viewDir, TW, TH, type Camera } from './iso';
import { tileSprite, waterSprite, cliffSprite, pathSprite, benchSprite, lampSprite, binSprite, litterSprite, vomitSprite, scenerySprite, hutSprite, entranceSprite, peepSprite, balloonSprite, umbrellaSprite, duckSprite, blit } from './sprites';
import { drawFlatRide, drawPiece, drawCar, rideLength, trackPoint } from './rideDraw';
import { SCENERY_BY_KEY } from '../sim/scenery';

export interface Ghost { kind: 'ride' | 'piece' | 'tile' | 'entrance' | 'scenery' | 'path'; x: number; y: number; size?: number; ok: boolean; type?: string; rot?: Dir; piece?: TrackPiece; ride?: Ride; brush?: number }
export interface Overlay { ghost: Ghost | null; selectedRide: number | null; selectedGuest: number | null; highlightTile: { x: number; y: number } | null; showHeights?: boolean }

export class Renderer {
  off: HTMLCanvasElement; octx: CanvasRenderingContext2D; ctx: CanvasRenderingContext2D;
  pr: Projector; cssW = 0; cssH = 0; dpr = 1; time = 0; frame = 0;
  constructor(public cv: HTMLCanvasElement, public cam: Camera, public g: GameState) {
    this.off = document.createElement('canvas'); this.octx = this.off.getContext('2d')!; this.ctx = cv.getContext('2d')!;
    this.pr = new Projector(cam, g);
  }
  setGame(g: GameState) { this.g = g; this.pr = new Projector(this.cam, g); }
  resize(cssW: number, cssH: number) {
    this.cssW = cssW; this.cssH = cssH; this.dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.round(cssW * this.dpr); this.cv.height = Math.round(cssH * this.dpr);
  }
  /** internal buffer size for the current scale */
  bufSize(): [number, number] { return [Math.ceil(this.cssW / this.cam.scale), Math.ceil(this.cssH / this.cam.scale)]; }
  screenToBuf(px: number, py: number): [number, number] { return [px / this.cam.scale, py / this.cam.scale]; }

  draw(ov: Overlay, dt: number) {
    const g = this.g; this.time += dt; this.frame++;
    const [bw, bh] = this.bufSize();
    if (this.off.width !== bw || this.off.height !== bh) { this.off.width = bw; this.off.height = bh; }
    this.pr.setBuffer(bw, bh);
    const c = this.octx; c.imageSmoothingEnabled = false;
    c.fillStyle = '#1b2a16'; c.fillRect(0, 0, bw, bh);
    const pr = this.pr; const rot = this.cam.rot; const W = g.w, H = g.h;
    // visible range in view space
    const margin = 120;
    const uvMin = (0 - margin - pr.ox) / (TW / 2), uvMax = (bw + margin - pr.ox) / (TW / 2);   // u - v range
    const dMin = Math.floor((0 - margin - pr.oy) / (TH / 2)), dMax = Math.ceil((bh + margin + 14 * 2 * 8 - pr.oy) / (TH / 2) + 2);   // u + v range (allow tall land)
    // bucket dynamic things by front tile (view space key)
    const buckets = new Map<number, { d: number; fn: () => void }[]>();
    const put = (x: number, y: number, d: number, fn: () => void) => { const k = (y << 10) | x; let b = buckets.get(k); if (!b) { b = []; buckets.set(k, b); } b.push({ d, fn }); };
    const frontTile = (tiles: [number, number][]): [number, number] => { let best = tiles[0], bd = -Infinity; for (const t of tiles) { const [u, v] = toView(t[0], t[1], rot, W, H); if (u + v > bd) { bd = u + v; best = t; } } return best; };
    for (const r of g.rides) {
      const def = RIDE_BY_KEY[r.type];
      if (def.kind === 'coaster') {
        r.pieces.forEach((p, i) => { const ft = frontTile(pieceTiles(p)); put(ft[0], ft[1], 0.3 + p.z * 0.01, () => drawPiece(c, g, pr, r, p)); void i; });
        const len = rideLength(r);
        for (const tr of r.trains) for (let k = 0; k < tr.cars; k++) { const s = tr.pos - k * 2.6; if (!r.closedLoop && s < 0) continue; const pt = trackPointSafe(r, s, len); if (!pt) continue; const kk = k; put(Math.floor(pt.x), Math.floor(pt.y), 0.5 + pt.z * 0.01, () => drawCar(c, g, pr, r, s, COLOURS[r.colours[0] % COLOURS.length], Math.max(0, Math.min(4, tr.riders.length - kk * 4)), kk === 0)); }
      } else {
        const tiles: [number, number][] = []; for (let yy = r.y; yy < r.y + def.size; yy++) for (let xx = r.x; xx < r.x + def.size; xx++) tiles.push([xx, yy]);
        const ft = frontTile(tiles); const t0 = tileAt(g, r.x, r.y)!;
        put(ft[0], ft[1], 0.9, () => { const p = pr.project(r.x + def.size / 2, r.y + def.size / 2, t0.h); drawFlatRide(c, g, r, p.x, p.y, this.time); });
      }
      for (const e of [r.entrance, r.exit]) if (e) { const ee = e; const t = tileAt(g, e.x, e.y)!; put(e.x, e.y, 0.6, () => { const p = pr.project(ee.x + 0.5, ee.y + 0.5, t.h); blit(c, hutSprite(ee === r.exit), p.x, p.y); }); }
    }
    for (const gu of g.guests) { if (gu.state === 'left') continue; const tx = Math.floor(gu.x), ty = Math.floor(gu.y); put(tx, ty, 0.5 + (gu.x - tx) + (gu.y - ty), () => this.drawGuest(gu)); }
    for (const st of g.staff) { const tx = Math.floor(st.x), ty = Math.floor(st.y); put(tx, ty, 0.5 + (st.x - tx) + (st.y - ty), () => { const p = pr.project(st.x, st.y, st.z); blit(c, peepSprite(st.type === 'handyman' ? 11 : st.type === 'mechanic' ? 5 : st.type === 'security' ? 9 : 3, 0, 1, Math.floor(st.walkPhase) & 1, st.type), p.x, p.y); }); }
    // entrance arch
    put(g.entrance.x + 1, g.entrance.y, 0.95, () => { const p = pr.project(g.entrance.x + 1, g.entrance.y + 0.5, 0); blit(c, entranceSprite(), p.x, p.y); });
    // ghost
    if (ov.ghost) this.bucketGhost(ov.ghost, put, frontTile);

    const wf = Math.floor(this.time * 3) & 3; const light = this.lightLevel();
    // painter's sweep over view space
    for (let d = Math.max(0, dMin); d <= Math.min(W + H - 2, dMax); d++) {
      const uLo = Math.max(0, Math.ceil((d + uvMin) / 2)), uHi = Math.min(W + H, Math.floor((d + uvMax) / 2));
      for (let u = uLo; u <= uHi; u++) {
        const v = d - u; if (v < 0) continue;
        const xy = fromViewInt(u, v, rot, W, H); if (!xy) continue; const [x, y] = xy;
        const t = g.tiles[y * W + x]; const p = pr.project(x + 0.5, y + 0.5, t.h);
        if (p.y < -40 || p.y > bh + 14 * 16 + 40 || p.x < -40 || p.x > bw + 40) continue;
        // cliffs: faces toward +u (east in view) and +v (south in view)
        const nE = fromViewInt(u + 1, v, rot, W, H), nS = fromViewInt(u, v + 1, rot, W, H);
        const hE = nE ? g.tiles[nE[1] * W + nE[0]].h : 0, hS = nS ? g.tiles[nS[1] * W + nS[0]].h : 0;
        if (t.h > hS) blit(c, cliffSprite(0, (t.h - hS) * 8, t.surf), p.x, p.y);
        if (t.h > hE) blit(c, cliffSprite(1, (t.h - hE) * 8, t.surf), p.x, p.y);
        if (t.water) { const q = pr.project(x + 0.5, y + 0.5, t.h + LAND_STEP); blit(c, waterSprite(wf), q.x, q.y); if (((x * 7 + y * 13) & 31) === 0) blit(c, duckSprite(wf), q.x + Math.sin(this.time + x) * 6, q.y + Math.cos(this.time * 0.7 + y) * 3); }
        else blit(c, tileSprite(t.surf, (x * 7 + y * 13) & 3, !t.owned), p.x, p.y);
        if (t.path) {
          const vd = t.path.slope === -1 ? -1 : viewDir(t.path.slope, rot);
          blit(c, pathSprite(t.path.style, t.path.queue, vd, x + y), p.x, p.y);
          if (t.path.adds.bench) blit(c, benchSprite(), p.x - 6, p.y + 2);
          if (t.path.adds.lamp) blit(c, lampSprite(light < 0.75), p.x + 9, p.y + 2);
          if (t.path.adds.bin !== undefined) blit(c, binSprite(t.path.adds.bin >= 8), p.x - 10, p.y - 1);
          for (let i = 0; i < Math.min(t.litter, 6); i++) blit(c, litterSprite(i + x), p.x - 8 + ((i * 7 + x * 3) % 16), p.y - 3 + ((i * 5 + y) % 7));
          for (let i = 0; i < Math.min(t.vomit, 3); i++) blit(c, vomitSprite(), p.x - 4 + i * 5, p.y + 2 + (i % 2) * 2);
        }
        if (t.scenery) { const d2 = SCENERY_BY_KEY[t.scenery.kind]; const rv = d2?.directional ? viewDir(t.scenery.rot, rot) : 0; blit(c, scenerySprite(t.scenery.kind, rv, x * 3 + y, d2?.waterable ? t.scenery.age > 6000 : false), p.x, p.y + 6); }
        if (ov.highlightTile && ov.highlightTile.x === x && ov.highlightTile.y === y) this.outlineTile(c, p.x, p.y, '#ffffff');
        const b = buckets.get((y << 10) | x);
        if (b) { b.sort((a, bb) => a.d - bb.d); for (const it of b) it.fn(); }
      }
    }
    if (ov.selectedRide !== null) this.outlineRide(c, ov.selectedRide);
    this.lighting(c, bw, bh, light);
    // blit scaled
    const o = this.ctx; o.imageSmoothingEnabled = false; o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); o.clearRect(0, 0, this.cssW, this.cssH);
    o.drawImage(this.off, 0, 0, bw, bh, 0, 0, bw * this.cam.scale, bh * this.cam.scale);
  }
  drawGuest(gu: GameState['guests'][number]) {
    const c = this.octx; const p = this.pr.project(gu.x, gu.y, gu.z); const frame = Math.floor(gu.walkPhase) & 1;
    blit(c, peepSprite(gu.shirt, gu.trousers, gu.hair, gu.state === 'walking' || gu.state === 'entering' || gu.state === 'leaving' ? frame : 0), p.x, p.y - (gu.state === 'sitting' ? 2 : 0));
    if (gu.items.balloon !== null) blit(c, balloonSprite(gu.items.balloon), p.x + 3, p.y - 7);
    if (gu.items.umbrella && this.g.weather.kind >= 3) blit(c, umbrellaSprite((gu.id * 3) % 12), p.x, p.y - 10);
    if (gu.flags.tracked) { c.strokeStyle = '#ffe600'; c.beginPath(); c.arc(p.x, p.y - 5, 7, 0, 6.28); c.stroke(); }
  }
  bucketGhost(gh: Ghost, put: (x: number, y: number, d: number, fn: () => void) => void, frontTile: (t: [number, number][]) => [number, number]) {
    const c = this.octx, g = this.g, pr = this.pr;
    if (gh.kind === 'tile' || gh.kind === 'path' || gh.kind === 'scenery' || gh.kind === 'entrance') {
      const n = gh.brush ?? 1;
      for (let yy = gh.y; yy < gh.y + n; yy++) for (let xx = gh.x; xx < gh.x + n; xx++) { const t = tileAt(g, xx, yy); if (!t) continue; const x0 = xx, y0 = yy; put(xx, yy, 0.05, () => { const p = pr.project(x0 + 0.5, y0 + 0.5, t.water ? t.h + LAND_STEP : t.h); this.outlineTile(c, p.x, p.y, gh.ok ? '#ffe600' : '#ff3b3b'); if (gh.kind === 'scenery' && gh.type) { c.globalAlpha = 0.6; blit(c, scenerySprite(gh.type, viewDir(gh.rot ?? 0, this.cam.rot), x0 * 3 + y0), p.x, p.y + 6); c.globalAlpha = 1; } if (gh.kind === 'entrance') { c.globalAlpha = 0.6; blit(c, hutSprite(gh.type === 'exit'), p.x, p.y); c.globalAlpha = 1; } }); }
    } else if (gh.kind === 'ride' && gh.type) {
      const def = RIDE_BY_KEY[gh.type]; const n = def.size; const tiles: [number, number][] = [];
      for (let yy = gh.y; yy < gh.y + n; yy++) for (let xx = gh.x; xx < gh.x + n; xx++) tiles.push([xx, yy]);
      for (const [xx, yy] of tiles) { const t = tileAt(g, xx, yy); if (!t) continue; put(xx, yy, 0.05, () => { const p = pr.project(xx + 0.5, yy + 0.5, t.water ? t.h + LAND_STEP : t.h); this.outlineTile(c, p.x, p.y, gh.ok ? '#ffe600' : '#ff3b3b'); }); }
      const ft = frontTile(tiles); const t0 = tileAt(g, gh.x, gh.y);
      if (t0) put(ft[0], ft[1], 0.95, () => { c.globalAlpha = 0.6; const p = pr.project(gh.x + n / 2, gh.y + n / 2, t0.h); const fake = { ...(gh.ride ?? fakeRide(gh.type!, gh.x, gh.y, gh.rot ?? 0)), running: true } as Ride; drawFlatRide(c, g, fake, p.x, p.y, this.time); c.globalAlpha = 1; });
    } else if (gh.kind === 'piece' && gh.piece && gh.ride) {
      const ft = frontTile(pieceTiles(gh.piece)); const piece = gh.piece, ride = gh.ride; put(ft[0], ft[1], 0.35 + piece.z * 0.01, () => drawPiece(c, g, pr, ride, piece, true, !gh.ok));
    }
  }
  outlineTile(c: CanvasRenderingContext2D, x: number, y: number, col: string) { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 16, y); c.lineTo(x, y + 8); c.lineTo(x - 16, y); c.closePath(); c.stroke(); }
  outlineRide(c: CanvasRenderingContext2D, id: number) {
    const r = this.g.rides.find(x => x.id === id); if (!r) return; const def = RIDE_BY_KEY[r.type];
    const tiles: [number, number][] = def.kind === 'coaster' ? r.pieces.flatMap(p => pieceTiles(p)) : [];
    if (def.kind !== 'coaster') for (let yy = r.y; yy < r.y + def.size; yy++) for (let xx = r.x; xx < r.x + def.size; xx++) tiles.push([xx, yy]);
    c.save(); c.setLineDash([2, 2]); for (const [x, y] of tiles) { const t = tileAt(this.g, x, y); if (!t) continue; const p = this.pr.project(x + 0.5, y + 0.5, t.h); this.outlineTile(c, p.x, p.y, '#ffffff'); } c.restore();
  }
  lightLevel(): number {
    const f = monthFraction(this.g); const day = 0.5 + 0.5 * Math.cos(f * Math.PI * 2);   // 1 at the start of a month, 0 mid-month (night)
    return Math.max(0.35, (0.5 + 0.5 * day) * (1 - this.g.weather.gloom * 0.5));
  }
  lighting(c: CanvasRenderingContext2D, bw: number, bh: number, light: number) {
    if (light < 0.98) {
      c.globalCompositeOperation = 'multiply'; const l = light; const r = Math.round(255 * (0.55 + 0.45 * l)), gg = Math.round(255 * (0.6 + 0.4 * l)), b = Math.round(255 * (0.75 + 0.25 * l));
      c.fillStyle = `rgb(${r},${gg},${b})`; c.fillRect(0, 0, bw, bh); c.globalCompositeOperation = 'source-over';
      if (light < 0.75) { // lamp glows
        c.globalCompositeOperation = 'lighter'; const g = this.g;
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const t = g.tiles[y * g.w + x]; const lamp = (t.path && t.path.adds.lamp) || (t.scenery && t.scenery.kind === 'lamp_post'); if (!lamp) continue; const p = this.pr.project(x + 0.5, y + 0.5, t.h); if (p.x < -30 || p.y < -30 || p.x > bw + 30 || p.y > bh + 30) continue; const gr = c.createRadialGradient(p.x + 9, p.y - 14, 1, p.x + 9, p.y - 14, 22); gr.addColorStop(0, 'rgba(255,220,120,.55)'); gr.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = gr; c.fillRect(p.x - 14, p.y - 36, 46, 46); }
        c.globalCompositeOperation = 'source-over';
      }
    }
    const rain = this.g.weather.rainLevel; if (rain > 0.05) { c.strokeStyle = `rgba(200,220,255,${0.25 * rain})`; c.lineWidth = 1; const n = Math.floor(bw * bh * rain / 900); const t = this.time * 400; c.beginPath(); for (let i = 0; i < n; i++) { const x = ((i * 97 + t) % (bw + 20)) - 10, y = (i * 61 + t * 1.7) % (bh + 20) - 10; c.moveTo(x, y); c.lineTo(x - 2, y + 7); } c.stroke(); }
  }
}
function fromViewInt(u: number, v: number, rot: Dir, w: number, h: number): [number, number] | null {
  let x: number, y: number;
  switch (rot) { case 0: x = u; y = v; break; case 1: x = w - 1 - v; y = u; break; case 2: x = w - 1 - u; y = h - 1 - v; break; default: x = v; y = h - 1 - u; }
  if (x < 0 || y < 0 || x >= w || y >= h) return null; return [x, y];
}
function trackPointSafe(r: Ride, s: number, len: number) { if (len <= 0) return null; return trackPoint(r, s); }
function fakeRide(type: string, x: number, y: number, rot: Dir): Ride { return { id: -1, type, name: '', x, y, rot, status: 'closed', price: 0, price2: 0, ratings: null, stats: null, built: 0, reliability: 0, breakdown: null, lastInspection: 0, inspection: 0, downtime: 0, downHist: 0, customers: 0, recent: [], income: 0, incomeHist: [], popularity: 0, satisfaction: 0, value: 0, queue: [], riders: [], cycle: 0, running: true, colours: [0, 1, 2], entrance: null, exit: null, pieces: [], trains: [], numTrains: 1, carsPerTrain: 0, closedLoop: false, crashes: 0, thoughtGood: 0, thoughtBad: 0 }; }
export { toView };
