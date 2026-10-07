// The 3D game in a real browser: start a park, build, open a ride, build a coaster, ride it, check the interface and that nothing errors.
// usage: node tests/e2e-3d.mjs [chromium|webkit] [W H] [shots-dir]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const require = createRequire(path.join(os.homedir(), 'Desktop/MAIN2026/package.json')); const pw = require('playwright');
const engine = process.argv[2] || 'chromium'; const W = +(process.argv[3] || 1803), H = +(process.argv[4] || 890); const shots = process.argv[5] || 'test-output'; fs.mkdirSync(shots, { recursive: true });
const browser = await pw[engine].launch({ args: engine === 'chromium' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/WebGL|GPU stall|swiftshader/i.test(m.text())) errors.push('console: ' + m.text()); });
let fails = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };
await page.goto('file://' + path.resolve('dist/index.html')); await page.waitForTimeout(900);
const mode = await page.evaluate(() => window.__rct.mode); check('3D mode chosen', mode === '3d', mode);
check('title shows', await page.isVisible('#title3d'));
await page.screenshot({ path: `${shots}/${engine}-3d-00-title.png` });
await page.click('#title3d [data-a="start"]'); await page.waitForTimeout(1200);
check('title hidden', !(await page.isVisible('#title3d')));
await page.screenshot({ path: `${shots}/${engine}-3d-01-park.png` });
const setup = await page.evaluate(() => {
  const R = window.__rct, a = R.app, g = a.g, C = R.cmds; const ex = g.entrance.x, ey = g.entrance.y; const h = g.tiles[(ey - 2) * g.w + ex].h;
  for (let y = ey - 30; y <= ey - 2; y++) for (let x = ex - 12; x <= ex + 16; x++) { const t = g.tiles[y * g.w + x]; t.h = h; t.water = false; t.scenery = null; }
  for (let i = 3; i <= 24; i++) C.cmdPath(g, ex, ey - i, false, 0);
  const r1 = C.cmdPlaceRide(g, 'merry_go_round', ex - 5, ey - 9, 0); const ride = g.rides[0];
  const e1 = C.cmdPlaceEntrance(g, ride.id, ex - 3, ey - 9, false); const x1 = C.cmdPlaceEntrance(g, ride.id, ex - 5, ey - 7, true);
  for (const x of [ex - 2, ex - 1]) C.cmdPath(g, x, ey - 9, false, 0); for (let x = ex - 5; x <= ex - 1; x++) C.cmdPath(g, x, ey - 6, false, 0);
  const o1 = R.openRide(g, ride);
  const s1 = C.cmdPlaceRide(g, 'burger_bar', ex + 1, ey - 12, 2); const s2 = C.cmdPlaceRide(g, 'balloon_stall', ex + 1, ey - 11, 2);
  a.afterAnyChange();
  return { ex, ey, r1, e1, x1, o1, s1, s2 };
});
check('flat ride placed and opened', setup.r1.ok && setup.e1.ok && setup.x1.ok && setup.o1 === null, JSON.stringify(setup));
// coaster through the hook commands + the app's own build path
const co = await page.evaluate(() => {
  const R = window.__rct, a = R.app, g = a.g, C = R.cmds; const ex = g.entrance.x, ey = g.entrance.y; const sx = ex + 2, sy = ey - 22;
  const st = C.cmdStartCoaster(g, 'wooden_coaster', sx, sy, 0); if (!st.ok) return { st };
  const r = g.rides[g.rides.length - 1]; const add = (k, chain = false) => { const x = C.cmdAddPiece(g, r.id, k, chain, 0); if (!x.ok) throw new Error(k + ': ' + x.error); };
  add('station'); add('station'); for (let i = 0; i < 4; i++) add('up', true); add('turnR'); add('down'); add('steepDown'); add('flat'); add('flat'); add('turnR'); for (let i = 0; i < 7; i++) add('flat'); add('turnR'); for (let i = 0; i < 4; i++) add('flat'); add('turnR');
  const s0 = r.pieces[0], s1 = r.pieces[1]; const e = C.cmdPlaceEntrance(g, r.id, s0.x, s0.y - 1, false); const x = C.cmdPlaceEntrance(g, r.id, s1.x, s1.y - 1, true);
  for (const xx of [s0.x, s1.x, ex + 1]) C.cmdPath(g, xx, sy - 2, false, 0);
  const t = R.testRide(g, r); const o = R.openRide(g, r); r.price = 150; a.afterAnyChange(); a.selectedRide = r.id;
  return { st, closed: r.closedLoop, e: e.ok, x: x.ok, t, o, stats: r.stats && { completed: r.stats.completed, speed: Math.round(r.stats.maxSpeed * 2.237), drops: r.stats.drops, fail: r.stats.failReason }, ratings: r.ratings };
});
check('coaster built, tested and opened', co.closed && co.e && co.x && co.t === null && co.o === null && co.stats && co.stats.completed, JSON.stringify(co));
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 12000; i++) window.__rct.tick(a.g); a.centerOn(a.g.entrance.x + 2, a.g.entrance.y - 12); a.world.controls.distance = 30; });
await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${engine}-3d-02-built.png` });
const after = await page.evaluate(() => { const g = window.__rct.app.g; const r = g.rides.find(x => x.type === 'wooden_coaster'); const m = g.rides[0]; return { guests: g.guestsInPark, admissions: g.totalAdmissions, coasterCustomers: r.customers, coasterRiding: r.trains.reduce((a, t) => a + t.riders.length, 0), carouselCustomers: m.customers, rating: g.rating, cash: g.finance.cash }; });
check('guests arrived', after.admissions > 0, JSON.stringify(after));
check('guests rode something', after.coasterCustomers + after.carouselCustomers + after.coasterRiding > 0);
// the interface: click the coaster to open its page, then the ride camera
const clickWorld = async (x, y, z) => { const p = await page.evaluate(([x, y, z]) => { const a = window.__rct.app; const v = new (a.world.camera.position.constructor)(x, y, z); v.project(a.world.camera); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }, [x, y, z]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); return p; };
const rp = await page.evaluate(() => { const g = window.__rct.app.g; const r = g.rides[0]; const t = g.tiles[r.y * g.w + r.x]; return { x: r.x + 1, y: t.h * 0.25 + 1.2, z: r.y + 1 }; });
await clickWorld(rp.x, rp.y, rp.z);
check('inspector opened for the carousel', await page.evaluate(() => window.__rct.app.panelId === 'ride:' + window.__rct.app.g.rides[0].id), await page.evaluate(() => window.__rct.app.panelId));
await page.screenshot({ path: `${shots}/${engine}-3d-03-inspector.png` });
await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides.find(x => x.type === 'wooden_coaster'); a.openPanel('ride:' + r.id); a.toggleRideCam(r.id); let n = 0; while (n++ < 4000 && !(r.trains[0].state === 'running' && r.trains[0].pos > 30)) window.__rct.tick(a.g); for (let i = 0; i < 40; i++) { window.__rct.tick(a.g); a.updateRideCam(1 / 60); } });
await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/${engine}-3d-04-ridecam.png` });
check('ride camera on', await page.evaluate(() => !!window.__rct.app.rideCam));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('ride camera off with Esc', await page.evaluate(() => !window.__rct.app.rideCam));
// build a second coaster through the real interface: New ride → Coasters → pick → click the map → rail buttons
await page.click('#dock [data-id="newride"]'); await page.waitForTimeout(150); await page.click('#inspector .tab[data-i="2"]'); await page.waitForTimeout(100); await page.click('#inspector [data-a="pick:junior_coaster"]'); await page.waitForTimeout(100);
const spot = await page.evaluate(() => { const a = window.__rct.app; const g = a.g; const x = g.entrance.x - 9, y = g.entrance.y - 16; const t = g.tiles[y * g.w + x]; const v = new (a.world.camera.position.constructor)(x + 0.5, t.h * 0.25, y + 0.5); a.centerOn(x, y); a.world.controls.update(); v.project(a.world.camera); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; });
await page.waitForTimeout(200); await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(300);
const started = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[a.g.rides.length - 1]; return { tool: a.tool.kind, type: r.type, pieces: r.pieces.length, panel: a.panelId }; });
check('junior coaster started by clicking the map', started.tool === 'coaster' && started.type === 'junior_coaster' && started.pieces === 1, JSON.stringify(started));
await page.click('#rail [data-ra="sp:station"]'); await page.click('#rail [data-ra="build"]'); await page.click('#rail [data-ra="slope:up"]'); await page.click('#rail [data-ra="chain"]'); await page.click('#rail [data-ra="build"]'); await page.click('#rail [data-ra="build"]'); await page.click('#rail [data-ra="dir:right"]'); await page.click('#rail [data-ra="build"]'); await page.waitForTimeout(150);
const built = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[a.g.rides.length - 1]; return r.pieces.map(p => p.type + (p.chain ? '*' : '')).join(' '); });
check('rail buttons build pieces', built === 'station station up* up* turnR', built);
await page.click('#rail [data-ra="remove"]'); await page.waitForTimeout(100);
check('rail remove works', await page.evaluate(() => window.__rct.app.g.rides[window.__rct.app.g.rides.length - 1].pieces.length === 4));
await page.screenshot({ path: `${shots}/${engine}-3d-07-building.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
// tools through the dock: paths, land, scenery
await page.click('#dock [data-id="path"]'); await page.waitForTimeout(150); check('path panel open', await page.evaluate(() => window.__rct.app.panelId === 'path'));
await page.click('#dock [data-id="newride"]'); await page.waitForTimeout(150); await page.click('#inspector .tab[data-i="2"]'); await page.waitForTimeout(150);
check('new ride panel shows coasters', (await page.textContent('#inspector .body')).includes('Wooden Roller Coaster'));
for (const id of ['finance', 'research', 'rides', 'guests', 'staff', 'park', 'save', 'options']) { await page.click(`#dock [data-id="${id}"]`); await page.waitForTimeout(80); const ok = await page.evaluate(id => window.__rct.app.panelId === id, id); if (!ok) check('panel ' + id, false); }
await page.click('#dock [data-id="staff"]'); await page.waitForTimeout(100); for (const t of ['handyman', 'mechanic', 'security', 'entertainer']) await page.click(`#inspector [data-a="hire:${t}"]`);
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 2000; i++) window.__rct.tick(a.g); });
check('four staff hired', await page.evaluate(() => window.__rct.app.g.staff.length === 4));
await page.evaluate(() => { const a = window.__rct.app; a.world.controls.yaw += 1.2; a.world.controls.pitch = 0.5; a.world.controls.distance = 22; });
await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${engine}-3d-05-angle.png` });
// night: jump the clock to mid-month
await page.evaluate(() => { const a = window.__rct.app; a.g.monthTick = 8192; a.g.weather.kind = 4; a.g.weather.rainLevel = 0.8; });
await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${engine}-3d-06-night-rain.png` });
const rt = await page.evaluate(() => { const R = window.__rct, a = R.app; const before = { rides: a.g.rides.length, guests: a.g.guests.length, tick: a.g.tick }; const s = R.serialize(a.g); a.start(R.deserialize(s)); return { ...before, after: { rides: a.g.rides.length, guests: a.g.guests.length, tick: a.g.tick }, bytes: s.length }; });
check('save round-trips through the 3D app', rt.rides === rt.after.rides && rt.guests === rt.after.guests && rt.tick === rt.after.tick, JSON.stringify(rt));
await page.waitForTimeout(300);
const fit = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
check('fits the window', fit.sh <= fit.ih && fit.sw <= fit.iw, JSON.stringify(fit));
const fps = await page.evaluate(() => { const f = window.__rct.app.frameTimes; return f.length ? Math.round(1 / (f.reduce((a, b) => a + b, 0) / f.length)) : 0; }); console.log(`frame rate ≈ ${fps} fps (software GL in headless; real GPU is much faster)`);
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
