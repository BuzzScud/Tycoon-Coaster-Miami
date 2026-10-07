// Coaster flow in a real browser: build a loop through the construction window, test it, open it, watch guests ride.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const require = createRequire(path.join(os.homedir(), 'Desktop/MAIN2026/package.json')); const pw = require('playwright');
const engine = process.argv[2] || 'chromium'; const shots = process.argv[3] || 'test-output'; fs.mkdirSync(shots, { recursive: true });
const browser = await pw[engine].launch(); const page = await browser.newPage({ viewport: { width: 1803, height: 890 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let fails = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };
await page.goto('file://' + path.resolve('dist/index.html') + '?classic'); await page.waitForTimeout(400);
await page.click('text=Start a new park'); await page.waitForTimeout(500);
// flatten a big area and lay a path north from the entrance
const setup = await page.evaluate(() => {
  const R = window.__rct, g = R.app.g, C = R.cmds; const ex = g.entrance.x, ey = g.entrance.y; const h = g.tiles[(ey - 2) * g.w + ex].h;
  for (let y = ey - 30; y <= ey - 2; y++) for (let x = ex - 12; x <= ex + 16; x++) { const t = g.tiles[y * g.w + x]; t.h = h; t.water = false; t.scenery = null; }
  for (let i = 3; i <= 14; i++) C.cmdPath(g, ex, ey - i, false, 0);
  for (let i = 1; i <= 4; i++) C.cmdPath(g, ex + i, ey - 14, false, 0);
  return { ex, ey, h };
});
// start a wooden coaster through the UI: New ride window → pick → click a tile
await page.keyboard.press('n'); await page.waitForTimeout(200);
await page.click('.win.newride .tabsrow i[data-tab="2"]'); await page.waitForTimeout(100);
await page.click('.win.newride [data-a="pick:wooden_coaster"]'); await page.waitForTimeout(100);
const sx = setup.ex + 5, sy = setup.ey - 18;
const pos = await page.evaluate(([x, y]) => { const a = window.__rct.app; const t = a.g.tiles[y * a.g.w + x]; const p = a.renderer.pr.project(x + 0.5, y + 0.5, t.h); return { x: p.x * a.cam.scale, y: p.y * a.cam.scale }; }, [sx, sy]);
await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(300);
check('construction window opened', await page.isVisible('.win.build'));
const started = await page.evaluate(() => { const r = window.__rct.app.g.rides[0]; return r ? { pieces: r.pieces.length, type: r.type, x: r.x, y: r.y, rot: r.rot } : null; });
check('coaster started with a station', !!started && started.pieces === 1, JSON.stringify(started));
// use the window: station ×2, then a lift hill, turns, drops... Build this via the real buttons
const click = async a => { await page.click(`.win.build [data-a="${a}"]`); await page.waitForTimeout(40); };
await click('sp:station'); await click('build'); await click('build');
await click('slope:up'); await click('chain'); for (let i = 0; i < 4; i++) await click('build');
await click('dir:right'); await click('build');
await click('dir:straight'); await click('slope:down'); await click('build'); await click('slope:steepDown'); await click('build'); await click('slope:level'); await click('build'); await click('build');
await click('dir:right'); await click('build'); await click('dir:straight'); for (let i = 0; i < 7; i++) await click('build');
await click('dir:right'); await click('build'); await click('dir:straight'); for (let i = 0; i < 4; i++) await click('build');
await click('dir:right'); await click('build');
const loop = await page.evaluate(() => { const r = window.__rct.app.g.rides[0]; return { pieces: r.pieces.length, closed: r.closedLoop, cash: window.__rct.app.g.finance.cash }; });
check('circuit closed through the window', loop.closed, JSON.stringify(loop));
await page.screenshot({ path: `${shots}/${engine}-c1-track.png` });
// entrance and exit next to the station, then a path to them
const ok2 = await page.evaluate(() => { const R = window.__rct, g = R.app.g, C = R.cmds; const r = g.rides[0]; const s0 = r.pieces[0], s1 = r.pieces[1];
  const e = C.cmdPlaceEntrance(g, r.id, s0.x, s0.y - 1, false); const x = C.cmdPlaceEntrance(g, r.id, s1.x, s1.y - 1, true);
  // path from the entrance hut's front tile back to the main path
  for (let y = s0.y - 2; y >= g.entrance.y - 14 - 0 && y >= s0.y - 5; y--) C.cmdPath(g, s0.x, y, false, 0);
  for (let y = s0.y - 2; y <= g.entrance.y - 14; y++) { C.cmdPath(g, s0.x, y, false, 0); }
  for (let x = g.entrance.x + 4; x <= s0.x; x++) C.cmdPath(g, x, g.entrance.y - 14, false, 0);
  C.cmdPath(g, s1.x, s1.y - 2, false, 0);
  return { e, x, ent: r.entrance, exit: r.exit }; });
check('entrance and exit placed', ok2.e.ok && ok2.x.ok, JSON.stringify(ok2));
await page.click('.win.build [data-a="ridewin"]'); await page.waitForTimeout(200);
await page.click('.win.ride [data-a="test"]'); await page.waitForTimeout(300);
const tested = await page.evaluate(() => { const r = window.__rct.app.g.rides[0]; return { status: r.status, completed: r.stats && r.stats.completed, fail: r.stats && r.stats.failReason, e: r.ratings && r.ratings.e, i: r.ratings && r.ratings.i, n: r.ratings && r.ratings.n, speed: r.stats && Math.round(r.stats.maxSpeed * 2.237), drops: r.stats && r.stats.drops, trains: r.trains.length }; });
check('test run completed', tested.completed === true, JSON.stringify(tested));
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 400; i++) window.__rct.tick(a.g); });
await page.waitForTimeout(150); await page.screenshot({ path: `${shots}/${engine}-c2-testing.png` });
await page.click('.win.ride .tabsrow i[data-tab="1"]'); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/${engine}-c3-stats.png` });
await page.click('.win.ride .tabsrow i[data-tab="0"]'); await page.waitForTimeout(100);
await page.click('.win.ride [data-a="open"]'); await page.waitForTimeout(200);
const opened = await page.evaluate(() => window.__rct.app.g.rides[0].status);
check('coaster opened', opened === 'open', opened);
await page.evaluate(() => { const a = window.__rct.app; a.g.rides[0].price = 150; for (let i = 0; i < 14000; i++) window.__rct.tick(a.g); });
const after = await page.evaluate(() => { const g = window.__rct.app.g; const r = g.rides[0]; return { customers: r.customers, queue: r.queue.length, riding: r.trains.reduce((a, t) => a + t.riders.length, 0), guests: g.guestsInPark, income: r.income, rating: g.rating, trainStates: r.trains.map(t => t.state + '@' + t.pos.toFixed(0)) }; });
check('guests ride the coaster', after.customers > 0 || after.riding > 0, JSON.stringify(after));
await page.evaluate(() => { const a = window.__rct.app; a.centerOn(a.g.rides[0].x + 3, a.g.rides[0].y + 3); a.cam.scale = 3; });
await page.waitForTimeout(250); await page.screenshot({ path: `${shots}/${engine}-c4-running.png` });
// staff: hire one of each and let them work
await page.evaluate(() => window.__rct.app.action('staff')); await page.waitForTimeout(100);
for (const t of ['handyman', 'mechanic', 'security', 'entertainer']) await page.click(`.win.staff [data-a="hire:${t}"]`);
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 3000; i++) window.__rct.tick(a.g); });
const staff = await page.evaluate(() => window.__rct.app.g.staff.map(s => s.type + ':' + s.state));
check('four staff hired and working', staff.length === 4, staff.join(' '));
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
