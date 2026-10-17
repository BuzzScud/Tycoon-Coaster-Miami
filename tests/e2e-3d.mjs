// The game in a real browser: start a park, build, open a ride, build a coaster, ride it, the report, both looks, goals, and that nothing errors.
// usage: node tests/e2e-3d.mjs [chromium|webkit] [W H] [shots-dir]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const require = createRequire(path.join(os.homedir(), 'Desktop/MAIN2026/package.json')); const pw = require('playwright');
const engine = process.argv[2] || 'chromium'; const W = +(process.argv[3] || 1803), H = +(process.argv[4] || 890); const shots = process.argv[5] || 'test-output'; fs.mkdirSync(shots, { recursive: true });
const browser = await pw[engine].launch({ args: engine === 'chromium' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); }); page.on('console', m => { if (m.type() === 'error' && !/WebGL|GPU stall|swiftshader/i.test(m.text())) errors.push('console: ' + m.text()); });
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
const clickWorld = async (x, y, z) => { const p = await page.evaluate(([x, y, z]) => { const a = window.__rct.app; const v = new (a.world.camera.position.constructor)(x, y, z); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }, [x, y, z]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); return p; };
const rp = await page.evaluate(() => { const g = window.__rct.app.g; const r = g.rides[0]; const t = g.tiles[r.y * g.w + r.x]; return { x: r.x + 1, y: t.h * 0.25 + 1.2, z: r.y + 1 }; });
await clickWorld(rp.x, rp.y, rp.z);
check('inspector opened for the carousel', await page.evaluate(() => window.__rct.app.panelId === 'ride:' + window.__rct.app.g.rides[0].id), await page.evaluate(() => window.__rct.app.panelId));
await page.screenshot({ path: `${shots}/${engine}-3d-03-inspector.png` });
await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides.find(x => x.type === 'wooden_coaster'); a.openPanel('ride:' + r.id); a.toggleRideCam(r.id); let n = 0; while (n++ < 4000 && !(r.trains[0].state === 'running' && r.trains[0].pos > 30)) window.__rct.tick(a.g); for (let i = 0; i < 40; i++) { window.__rct.tick(a.g); a.updateRideCam(1 / 60); } });
await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/${engine}-3d-04-ridecam.png` });
check('ride camera on', await page.evaluate(() => !!window.__rct.app.rideCam));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('ride camera off with Esc', await page.evaluate(() => !window.__rct.app.rideCam));
// build a second coaster through the real interface: New ride → Coasters → pick → click the map → rail buttons
await page.click('#bar [data-b="tool:newride"]'); await page.waitForTimeout(150); await page.click('#tray .tab[data-i="2"]'); await page.waitForTimeout(100); await page.click('#tray [data-a="pick:junior_coaster"]'); await page.waitForTimeout(100);
const spot = await page.evaluate(() => { const a = window.__rct.app; const g = a.g; const x = g.entrance.x - 9, y = g.entrance.y - 16; const t = g.tiles[y * g.w + x]; const v = new (a.world.camera.position.constructor)(x + 0.5, t.h * 0.25, y + 0.5); a.centerOn(x, y); a.world.render(); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; });
await page.waitForTimeout(200); await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(300);
const started = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[a.g.rides.length - 1]; return { tool: a.tool.kind, type: r.type, pieces: r.pieces.length, panel: a.panelId }; });
check('junior coaster started by clicking the map', started.tool === 'coaster' && started.type === 'junior_coaster' && started.pieces === 1, JSON.stringify(started));
check('the builder takes over the bottom bar', await page.evaluate(() => document.getElementById('bar').classList.contains('builder') && !!document.querySelector('#bar [data-b="b:build"]')));
for (const a of ['sp:station', 'build', 'slope:up', 'chain', 'build', 'build', 'dir:right', 'build']) await page.click(`#bar [data-b="b:${a}"]`); await page.waitForTimeout(150);
const built = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[a.g.rides.length - 1]; return r.pieces.map(p => p.type + (p.chain ? '*' : '')).join(' '); });
check('rail buttons build pieces (a turn while climbing is a climbing turn)', built === 'station station up* up* turnUpR*', built);
await page.click('#bar [data-b="b:remove"]'); await page.waitForTimeout(100);
check('rail remove works', await page.evaluate(() => window.__rct.app.g.rides[window.__rct.app.g.rides.length - 1].pieces.length === 4));
await page.screenshot({ path: `${shots}/${engine}-3d-07-building.png` });
await page.click('#bar [data-b="done"]'); await page.waitForTimeout(100);
check('Done gives the toolbar back', await page.evaluate(() => !document.getElementById('bar').classList.contains('builder') && !!document.querySelector('#bar [data-b="tool:path"]')));
// every icon in the bar and the camera cluster has a size (Safari drew sizeless icons as nothing)
check('the camera controls are in the bar', await page.evaluate(() => !document.getElementById('cam') && !!document.querySelector('#bar [data-b="cam:rotate"]') && !!document.querySelector('#bar [data-b="cam:home"]')));
check('bar icons are drawn', await page.evaluate(() => [...document.querySelectorAll('#bar svg')].every(s => s.getBoundingClientRect().width >= 10)));
// tools: the tray follows the tool in hand; the same button again puts it down
await page.click('#bar [data-b="tool:path"]'); await page.waitForTimeout(150); check('paths tray opens with the tool', await page.evaluate(() => window.__rct.app.ui.tray.id === 'path' && window.__rct.app.tool.kind === 'path'));
await page.click('#bar [data-b="tool:land"]'); await page.waitForTimeout(150); check('land tray replaces it', await page.evaluate(() => window.__rct.app.ui.tray.id === 'land'));
await page.click('#bar [data-b="tool:land"]'); await page.waitForTimeout(150); check('the same tool button puts the tool down', await page.evaluate(() => window.__rct.app.tool.kind === 'inspect' && !window.__rct.app.ui.tray.isOpen));
await page.click('#bar [data-b="tool:newride"]'); await page.waitForTimeout(150); await page.click('#tray .tab[data-i="2"]'); await page.waitForTimeout(150);
check('rides tray shows coasters', (await page.textContent('#tray .body')).includes('Wooden Roller Coaster'));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('Esc closes the tray', await page.evaluate(() => !window.__rct.app.ui.tray.isOpen));
// the Park window: one window, a tab per screen
await page.click('#bar [data-b="park"]'); await page.waitForTimeout(150);
for (const id of ['finance', 'research', 'rides', 'guests', 'staff', 'park', 'news']) { await page.click(`#win .mtab[data-w="${id}"]`); await page.waitForTimeout(80); const ok = await page.evaluate(id => window.__rct.app.winId === id && window.__rct.app.ui.win.id === id && window.__rct.app.ui.win.isOpen, id); if (!ok) check('park window tab ' + id, false); }
check('park window tabs all open', true);
// save & load and options through the menu
for (const m of ['save', 'options']) { await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click(`#menu [data-m="${m}"]`); await page.waitForTimeout(100); if (!(await page.evaluate(m => window.__rct.app.ui.sys.id === m, m))) check('menu opens ' + m, false); }
check('menu opens save and options', true); await page.keyboard.press('Escape');
await page.click('#win .mtab[data-w="staff"]'); await page.waitForTimeout(100); for (const t of ['handyman', 'mechanic', 'security', 'entertainer']) await page.click(`#win [data-a="hire:${t}"]`);
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 2000; i++) window.__rct.tick(a.g); });
check('four staff hired', await page.evaluate(() => window.__rct.app.g.staff.length === 4));
await page.evaluate(() => { const a = window.__rct.app; a.world.controls.yaw += 1.2; a.world.controls.pitch = 0.5; a.world.controls.distance = 22; });
await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${engine}-3d-05-angle.png` });
// night: jump the clock to mid-month
await page.evaluate(() => { const a = window.__rct.app; a.g.monthTick = 8192; a.g.weather.kind = 4; a.g.weather.rainLevel = 0.8; });
await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${engine}-3d-06-night-rain.png` });
// the park report: open it from the dock, hover a chart, close it; then look at the park with every panel hidden
await page.click('#bar [data-b="park"]'); await page.waitForTimeout(100); if (!(await page.evaluate(() => window.__rct.app.winOpen))) { await page.click('#bar [data-b="park"]'); await page.waitForTimeout(100); }
await page.click('#win .mtab[data-w="report"]'); await page.waitForTimeout(200);
const rep = await page.evaluate(() => ({ open: window.__rct.app.ui.win.id === 'report', charts: document.querySelectorAll('#win svg.rc').length, title: document.querySelector('#win .rep h2')?.textContent, chron: document.querySelectorAll('#win .ch').length, news: window.__rct.app.g.news.length }));
check('report opens with three charts and a chronicle', rep.open && rep.charts === 3 && rep.chron >= Math.max(1, rep.news), JSON.stringify(rep));
const hb = await page.locator('#win svg.rc .hit').first().boundingBox(); await page.mouse.move(hb.x + hb.width * 0.6, hb.y + hb.height / 2); await page.waitForTimeout(120);
check('chart hover shows the tooltip', await page.evaluate(() => getComputedStyle(document.querySelector('#win .rtip')).display !== 'none'));
await page.screenshot({ path: `${shots}/${engine}-3d-08-report.png` });
await page.click('#win [data-r="look"]'); await page.waitForTimeout(150);
check('look at the park hides the panels', await page.evaluate(() => document.getElementById('app3d').classList.contains('viewonly') && getComputedStyle(document.getElementById('bar')).display === 'none'));
await page.screenshot({ path: `${shots}/${engine}-3d-09-look.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('Esc brings the panels back', await page.evaluate(() => !document.getElementById('app3d').classList.contains('viewonly')));
// the look switch: classic 3D and back, picking still works in each
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(120); await page.click('#sys [data-a="look:classic"]'); await page.waitForTimeout(400);
check('switched to the classic look', await page.evaluate(() => window.__rct.app.look === 'classic' && window.__rct.app.world.look === 'classic' && document.getElementById('app3d').dataset.look === 'classic'));
await page.evaluate(() => window.__rct.app.resetCamera()); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/${engine}-3d-10-classic.png` });
await page.evaluate(() => { const a = window.__rct.app; a.setTool({ kind: 'inspect' }); a.closePanel(); a.winOpen = false; a.sysOpen = false; a.refreshPanel(); }); await page.waitForTimeout(100); await clickWorld(rp.x, rp.y, rp.z);
check('picking works in the classic look', await page.evaluate(() => window.__rct.app.panelId === 'ride:' + window.__rct.app.g.rides[0].id), await page.evaluate(() => window.__rct.app.panelId));
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(120); await page.click('#sys [data-a="look:ink"]'); await page.waitForTimeout(400);
check('back to the ink look', await page.evaluate(() => window.__rct.app.look === 'ink' && window.__rct.app.world.view.isOrthographicCamera === true));
// the piece system: the Space set in the picker with drawn previews, a 3×3 launch pad placed by clicking the map,
// inspected, recoloured and turned; a row of hedges painted in one drag and taken back with one undo; riders and a breakdown drawn
const proj = async (x, y, z) => page.evaluate(([x, y, z]) => { const a = window.__rct.app; a.world.render(); const v = new (a.world.camera.position.constructor)(x, y, z); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }, [x, y, z]);
await page.evaluate(() => { const a = window.__rct.app; a.setTool({ kind: 'inspect' }); a.closePanel(); a.winOpen = false; a.sysOpen = false; a.refreshPanel(); });
await page.click('#bar [data-b="tool:scenery"]'); await page.waitForTimeout(200); await page.click('#tray .tab[data-i="3"]'); await page.waitForTimeout(900);
const pk = await page.evaluate(() => ({ cards: document.querySelectorAll('#tray .sc').length, imgs: [...document.querySelectorAll('#tray .sc img')].filter(i => i.src.startsWith('data:image/png') && i.naturalWidth > 0).length }));
check('the Space set shows in the picker with drawn previews', pk.cards === 11 && pk.imgs === 11, JSON.stringify(pk));
await page.click('#tray [data-a="item:space_launchpad"]'); await page.waitForTimeout(150);
const lp = await page.evaluate(() => { const a = window.__rct.app, g = a.g; const free = (x, y, h0) => { const t = g.tiles[y * g.w + x]; return t && t.owned && !t.water && !t.path && t.rideId === null && !t.entrance && !t.tracks.length && !t.scenery && t.h === h0; };
  for (let y = 6; y < g.h - 8; y++) for (let x = 6; x < g.w - 8; x++) { const h0 = g.tiles[y * g.w + x].h; let ok = true; for (let yy = y; yy < y + 3 && ok; yy++) for (let xx = x; xx < x + 3 && ok; xx++) ok = free(xx, yy, h0); if (ok) { a.centerOn(x + 1.5, y + 1.5); const c = a.world.controls; c.target.x += Math.sin(c.yaw) * 5; c.target.z += Math.cos(c.yaw) * 5; return { x, y, h: h0 }; } } return null; });   /* the spot sits above the tray, as a player would place it */
await page.waitForTimeout(250); const lpAt = await proj(lp.x + 1.5, lp.h * 0.25, lp.y + 1.5); await page.mouse.move(lpAt.x, lpAt.y); await page.waitForTimeout(120); await page.mouse.click(lpAt.x, lpAt.y); await page.waitForTimeout(200);
const placed = await page.evaluate(([x, y]) => { const g = window.__rct.app.g; const sc = g.tiles[y * g.w + x].scenery; let n = 0; for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) if (g.tiles[yy * g.w + xx].scenery?.kind === 'space_launchpad') n++; return { kind: sc?.kind, n }; }, [lp.x, lp.y]);
check('a 3×3 launch pad is placed by clicking the map', placed.kind === 'space_launchpad' && placed.n === 9, JSON.stringify(placed));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.mouse.click(lpAt.x, lpAt.y); await page.waitForTimeout(200);
check('clicking a piece opens it in the inspector', await page.evaluate(([x, y]) => window.__rct.app.panelId === `scen:${x},${y}`, [lp.x, lp.y]), await page.evaluate(() => window.__rct.app.panelId));
await page.click('#inspector [data-a="col:1"]'); await page.waitForTimeout(100); await page.click('#inspector [data-a="rot"]'); await page.waitForTimeout(150);
check('the inspector recolours and turns the whole piece', await page.evaluate(([x, y]) => { const g = window.__rct.app.g; const t = g.tiles[(y + 2) * g.w + x + 2].scenery; return t?.colour === 1 && t?.rot === 1; }, [lp.x, lp.y]));
await page.keyboard.press('Escape'); await page.click('#bar [data-b="tool:scenery"]'); await page.waitForTimeout(150); if (!(await page.evaluate(() => window.__rct.app.ui.tray.isOpen))) { await page.click('#bar [data-b="tool:scenery"]'); await page.waitForTimeout(150); }
await page.click('#tray .tab[data-i="1"]'); await page.waitForTimeout(500); await page.click('#tray [data-a="item:hedge"]'); await page.waitForTimeout(150);
const row = await page.evaluate(() => { const a = window.__rct.app, g = a.g; for (let y = 6; y < g.h - 6; y++) for (let x = 6; x < g.w - 12; x++) { const h0 = g.tiles[y * g.w + x].h; let ok = true; for (let i = 0; i < 6 && ok; i++) { const t = g.tiles[y * g.w + x + i]; ok = t.owned && !t.water && !t.path && t.rideId === null && !t.entrance && !t.tracks.length && !t.scenery && t.h === h0; } if (ok) { a.centerOn(x + 3, y + 0.5); const c = a.world.controls; c.target.x += Math.sin(c.yaw) * 5; c.target.z += Math.cos(c.yaw) * 5; return { x, y, h: h0 }; } } return null; });
await page.waitForTimeout(250); const r0 = await proj(row.x + 0.5, row.h * 0.25, row.y + 0.5), r1 = await proj(row.x + 5.5, row.h * 0.25, row.y + 0.5);
const hedges0 = await page.evaluate(() => window.__rct.app.g.tiles.filter(t => t.scenery?.kind === 'hedge').length);
await page.mouse.move(r0.x, r0.y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(r0.x + (r1.x - r0.x) * i / 8, r0.y + (r1.y - r0.y) * i / 8); await page.mouse.up(); await page.waitForTimeout(200);
const hedges1 = await page.evaluate(() => window.__rct.app.g.tiles.filter(t => t.scenery?.kind === 'hedge').length);
check('dragging paints a row of hedges', hedges1 - hedges0 === 6, `${hedges1 - hedges0} placed`);
await page.keyboard.press('Meta+z'); await page.waitForTimeout(150);
check('one undo takes the whole painted row back', await page.evaluate(n => window.__rct.app.g.tiles.filter(t => t.scenery?.kind === 'hedge').length === n, hedges0));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
const live = await page.evaluate(async () => { const a = window.__rct.app, g = a.g; a.resetCamera(); for (let i = 0; i < 3000; i++) window.__rct.tick(g); a.wake(); await new Promise(r => setTimeout(r, 300));
  const r = g.rides.find(x => x.type === 'merry_go_round'); r.breakdown = { type: 'safety_cut_out', since: g.tick, mechanicId: null, fixing: 0 }; a.wake(); await new Promise(r => setTimeout(r, 300));
  const fx = !!a.rides.entries.get(r.id)?.fx; const riders = a.rides.riderBody?.count ?? 0; const onRides = g.rides.reduce((s, x) => s + x.riders.length + x.trains.reduce((q, t) => q + t.riders.length, 0), 0); r.breakdown = null; return { fx, riders, onRides }; });
check('riders are drawn in the seats and a breakdown shows smoke and a sign', live.fx && (live.onRides === 0 || live.riders > 0), JSON.stringify(live));
// risky buttons ask in the game, never in a browser pop-up: demolish (keep it, then do it), fire, save over a slot
await page.evaluate(() => { const a = window.__rct.app, g = a.g; a.setTool({ kind: 'inspect' }); a.winOpen = false; a.sysOpen = false; const r = g.rides.find(x => x.type === 'burger_bar'); a.openPanel('ride:' + r.id); });
await page.waitForTimeout(150); await page.click('#inspector [data-a="arm:demolish"]'); await page.waitForTimeout(120);
check('Demolish asks in the game first', await page.evaluate(() => !!document.querySelector('#inspector .ask [data-a="demolish"]') && !!document.querySelector('#inspector .ask [data-a="keep"]')));
await page.click('#inspector .ask [data-a="keep"]'); await page.waitForTimeout(100);
check('Keep it leaves the ride standing', await page.evaluate(() => !!window.__rct.app.g.rides.find(x => x.type === 'burger_bar') && !document.querySelector('#inspector .ask')));
await page.click('#inspector [data-a="arm:demolish"]'); await page.waitForTimeout(100); await page.click('#inspector .ask [data-a="demolish"]'); await page.waitForTimeout(150);
check('the question\'s button demolishes it', await page.evaluate(() => !window.__rct.app.g.rides.find(x => x.type === 'burger_bar')));
await page.keyboard.press('Meta+z'); await page.waitForTimeout(100);
await page.evaluate(() => { const a = window.__rct.app; const s = a.g.staff[0]; a.openPanel('staff:' + s.id); }); await page.waitForTimeout(150); await page.click('#inspector [data-a="arm:fire"]'); await page.waitForTimeout(100);
const staffBefore = await page.evaluate(() => window.__rct.app.g.staff.length); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
check('Esc closes the question and nothing happens', await page.evaluate(n => !document.querySelector('#inspector .ask') && window.__rct.app.g.staff.length === n, staffBefore));
await page.evaluate(async () => { const R = window.__rct; await R.saves.writeSlot('2', R.app.g, 'Earlier park', 'March, Year 1'); window.__rct.app.openPanel('save'); }); await page.waitForTimeout(200);
await page.click('#sys [data-a="arm:save:2"]'); await page.waitForTimeout(120);
check('saving over a used slot asks first', await page.evaluate(() => (document.querySelector('#sys .ask')?.textContent ?? '').includes('Save over')));
await page.click('#sys .ask [data-a="keep"]'); await page.evaluate(async () => { await window.__rct.saves.clearSlot('2'); window.__rct.app.sysOpen = false; window.__rct.app.refreshPanel(); });
check('no browser pop-up appeared anywhere', dialogs.length === 0, dialogs.join(' | '));
const rt = await page.evaluate(() => { const R = window.__rct, a = R.app; const before = { rides: a.g.rides.length, guests: a.g.guests.length, tick: a.g.tick }; const s = R.serialize(a.g); a.start(R.deserialize(s)); return { ...before, after: { rides: a.g.rides.length, guests: a.g.guests.length, tick: a.g.tick }, bytes: s.length }; });
check('save round-trips through the 3D app', rt.rides === rt.after.rides && rt.guests === rt.after.guests && rt.tick === rt.after.tick, JSON.stringify(rt));
await page.waitForTimeout(300);
// optional goals: found a 45-minute park from the title screen, then meet every goal and see the report open
await page.evaluate(() => window.__rct.showTitle()); await page.waitForTimeout(200); await page.click('#title3d [data-a="goals:45"]'); await page.waitForTimeout(80);
check('title shows the goal targets', (await page.textContent('#title3d')).includes('Hold them all for two minutes'));
await page.screenshot({ path: `${shots}/${engine}-3d-11-title-goals.png` });
await page.click('#title3d [data-a="start"]'); await page.waitForTimeout(500);
check('goals park started with a clock chip', await page.evaluate(() => !!window.__rct.app.g.goals && !!document.querySelector('#stats .goalchip')));
await page.evaluate(() => { const a = window.__rct.app, o = a.g.goals; o.guests = 0; o.rating = 0; o.cash = 1; for (let i = 0; i < 40 * 125; i++) window.__rct.tick(a.g); });
await page.waitForTimeout(400);
check('meeting the goals opens the report', await page.evaluate(() => document.querySelector('#report').classList.contains('open') && document.querySelector('#report h2').textContent === 'Goals met'));
await page.screenshot({ path: `${shots}/${engine}-3d-12-goals-met.png` });
await page.click('#report [data-r="close"]'); await page.waitForTimeout(100);
// speed: a busy park (1,500 guests in view) stays inside the triangle budget, saves into every slot, rests when paused
const heavy = await page.evaluate(async () => {
  const R = window.__rct, a = R.app, g = a.g; g.speed = 1; const proto = g.guests.find(q => q.state === 'walking') ?? g.guests[0]; const paths = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const t = g.tiles[y * g.w + x]; if (t.path && !t.path.queue) paths.push([x, y, t.h]); }
  let id = g.nextGuestId; while (g.guests.filter(q => q.state !== 'left').length < 1500) { const [x, y, hz] = paths[id % paths.length]; const q = JSON.parse(JSON.stringify(proto)); Object.assign(q, { id: id++, x: x + 0.5, y: y + 0.5, z: hz, tx: x, ty: y, state: 'walking', route: null, dest: null, headingTo: null, rideId: null, entered: g.tick }); g.guests.push(q); }
  g.nextGuestId = id; g.guestsInPark = g.guests.filter(q => q.state !== 'left').length; a.resetCamera(); a.wake();
  await new Promise(r => setTimeout(r, 600)); const tris = a.world.renderer.info.render.triangles;
  const saves = []; for (const slot of ['autosave', '1', '2', '3']) saves.push(await R.saves.writeSlot(slot, g, g.parkName, '') ?? 'ok');
  const back = await R.saves.readSlot('3'); for (const s of ['1', '2', '3']) await R.saves.clearSlot(s);
  return { guests: g.guestsInPark, tris, saves, backGuests: back?.guests.length, guestsNow: g.guests.length };
});
check('a busy park stays inside the triangle budget', heavy.tris > 0 && heavy.tris < 900000, `${heavy.tris} triangles with ${heavy.guests} guests (budget 900,000; before this round about 2.5 M)`);
check('a busy park saves into every slot and loads back', heavy.saves.every(x => x === 'ok') && heavy.backGuests === heavy.guestsNow, JSON.stringify({ saves: heavy.saves, back: heavy.backGuests }));
const rest = await page.evaluate(async () => { const a = window.__rct.app, info = a.world.renderer.info.render; a.g.speed = 0; a.wakeUntil = 0; a.keys.clear(); await new Promise(r => setTimeout(r, 300)); const f0 = info.frame; await new Promise(r => setTimeout(r, 800)); const still = info.frame - f0;
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 300 })); const f1 = info.frame; await new Promise(r => setTimeout(r, 300)); return { still, woke: info.frame - f1 }; });
check('paused and untouched, nothing is drawn; a mouse move wakes it', rest.still === 0 && rest.woke > 0, JSON.stringify(rest));
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(150);
const res = await page.evaluate(() => { const a = window.__rct.app; const row = !!document.querySelector('#sys [data-a="res:auto"]'); a.setResMode(false); const full = a.world.renderer.getPixelRatio(); a.setResMode(true); return { row, full, max: a.res.max, auto: a.resAuto }; });
check('Options has the Resolution switch; Full draws every pixel', res.row && res.full === res.max && res.auto, JSON.stringify(res)); await page.keyboard.press('Escape');
const fit = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
check('fits the window', fit.sh <= fit.ih && fit.sw <= fit.iw, JSON.stringify(fit));
const fps = await page.evaluate(() => { const f = window.__rct.app.frameTimes; return f.length ? Math.round(1 / (f.reduce((a, b) => a + b, 0) / f.length)) : 0; }); console.log(`frame rate ≈ ${fps} fps (software GL in headless; real GPU is much faster)`);
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
