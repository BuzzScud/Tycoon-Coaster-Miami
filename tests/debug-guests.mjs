import { createRequire } from 'node:module'; import path from 'node:path'; import os from 'node:os';
const require = createRequire(path.join(os.homedir(), 'Desktop/MAIN2026/package.json')); const pw = require('playwright');
const browser = await pw.chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('file://' + path.resolve('dist/index.html')); await page.waitForTimeout(300);
await page.click('text=Start a new park'); await page.waitForTimeout(300);
const out = await page.evaluate(() => {
  const R = window.__rct, a = R.app, g = a.g, C = R.cmds; const ex = g.entrance.x, ey = g.entrance.y; const log = [];
  const h = g.tiles[(ey - 2) * g.w + ex].h;
  for (let y = ey - 16; y <= ey - 2; y++) for (let x = ex - 2; x <= ex + 8; x++) { const t = g.tiles[y * g.w + x]; t.h = h; t.water = false; t.scenery = null; }
  for (let i = 3; i <= 10; i++) log.push(C.cmdPath(g, ex, ey - i, false, 0).ok);
  for (let i = 1; i <= 6; i++) log.push(C.cmdPath(g, ex + i, ey - 10, false, 0).ok);
  const rx = ex + 3, ry = ey - 13; log.push(C.cmdPlaceRide(g, 'merry_go_round', rx, ry, 0));
  const r = g.rides[0]; log.push(C.cmdPlaceEntrance(g, r.id, rx, ry + 2, false), C.cmdPlaceEntrance(g, r.id, rx + 2, ry, true));
  log.push(C.cmdPath(g, rx, ry + 3, false, 0)); for (let y = ry + 3; y <= ey - 10; y++) C.cmdPath(g, rx, y, false, 0);
  log.push(R.openRide(g, r));
  for (let i = 0; i < 9000; i++) R.tick(g);
  const states = {}; for (const gu of g.guests) states[gu.state] = (states[gu.state] || 0) + 1;
  const thoughts = {}; for (const gu of g.guests) for (const t of gu.thoughts) thoughts[t.t] = (thoughts[t.t] || 0) + 1;
  const near = g.guests.filter(gu => Math.abs(gu.x - r.entrance.x) + Math.abs(gu.y - r.entrance.y) < 14).length;
  const front = g.tiles[(r.entrance.y + 1) * g.w + r.entrance.x]; 
  return { log, status: r.status, ent: r.entrance, frontPath: !!front.path, states, thoughts, near, admissions: g.totalAdmissions, guests: g.guests.length, customers: r.customers, queue: r.queue.length, riders: r.riders.length, running: r.running, cycle: r.cycle, heading: g.guests.filter(x => x.headingTo === r.id).length, sample: g.guests.slice(0, 3).map(x => ({ s: x.state, x: x.x.toFixed(1), y: x.y.toFixed(1), dest: x.dest, route: x.route && x.route.length, lost: x.lostTimer, intMin: x.intMin, intMax: x.intMax, cash: x.cash })) };
});
console.log(JSON.stringify(out, null, 1)); await browser.close();
