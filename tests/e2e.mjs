// Smoke test of the built game in a real browser: start a park, build, play for a while, check for errors and that the layout fits.
// usage: node tests/e2e.mjs [chromium|webkit] [W H] [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const require = createRequire(path.join(os.homedir(), 'Desktop/MAIN2026/package.json'));
const pw = require('playwright');
const engine = process.argv[2] || 'chromium'; const W = +(process.argv[3] || 1803), H = +(process.argv[4] || 890);
const shots = process.argv[5] || 'test-output'; fs.mkdirSync(shots, { recursive: true });
const file = path.resolve('dist/index.html');
const browser = await pw[engine].launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let fails = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };
await page.goto('file://' + file); await page.waitForTimeout(500);
check('title screen shows', await page.isVisible('#title'));
await page.screenshot({ path: `${shots}/${engine}-00-title.png` });
await page.click('text=Start a new park'); await page.waitForTimeout(800);
check('title hidden after start', !(await page.isVisible('#title')));
const info = await page.evaluate(() => { const a = window.__rct.app; return { w: a.g.w, h: a.g.h, cash: a.g.finance.cash, ex: a.g.entrance.x, ey: a.g.entrance.y }; });
check('map generated', info.w === 64 && info.h === 64, JSON.stringify(info));
await page.screenshot({ path: `${shots}/${engine}-01-park.png` });
// helper: click a tile through the real projector
const tileClick = async (x, y, button = 'left') => { const pos = await page.evaluate(([x, y]) => { const a = window.__rct.app; const t = a.g.tiles[y * a.g.w + x]; const p = a.renderer.pr.project(x + 0.5, y + 0.5, t.water ? t.h + 2 : t.h); return { x: p.x * a.cam.scale, y: p.y * a.cam.scale }; }, [x, y]); await page.mouse.click(pos.x, pos.y, { button }); await page.waitForTimeout(60); return pos; };
// paths: open the path tool and lay a line north from the entrance
await page.keyboard.press('f'); await page.waitForTimeout(200);
check('path window open', await page.isVisible('.win.path'));
const ex = info.ex, ey = info.ey;
for (let i = 3; i <= 10; i++) await tileClick(ex, ey - i);
for (let i = 1; i <= 6; i++) await tileClick(ex + i, ey - 10);
const paths = await page.evaluate(() => window.__rct.app.g.tiles.filter(t => t.path).length);
check('paths laid', paths >= 16, `${paths} path tiles`);
// scenery
await page.keyboard.press('Escape'); await page.keyboard.press('t'); await page.waitForTimeout(200);
await page.click('.win.scenery [data-a="item:tree_oak"]'); await tileClick(ex - 2, ey - 6); await tileClick(ex - 2, ey - 8);
const trees = await page.evaluate(() => window.__rct.app.g.tiles.filter(t => t.scenery && t.scenery.kind === 'tree_oak' && t.owned).length);
check('trees placed', trees >= 2, `${trees} oaks on owned land`);
// land: raise a tile
await page.keyboard.press('Escape'); await page.keyboard.press('l'); await page.waitForTimeout(200);
const before = await page.evaluate(([x, y]) => window.__rct.app.g.tiles[y * window.__rct.app.g.w + x].h, [ex + 4, ey - 14]);
await tileClick(ex + 4, ey - 14);
const after = await page.evaluate(([x, y]) => window.__rct.app.g.tiles[y * window.__rct.app.g.w + x].h, [ex + 4, ey - 14]);
check('land raised', after === before + 2, `${before} → ${after}`);
await page.screenshot({ path: `${shots}/${engine}-02-built.png` });
// a flat ride next to the path, then entrance and exit
await page.keyboard.press('Escape'); await page.keyboard.press('n'); await page.waitForTimeout(200);
await page.click('.win.newride [data-a="pick:merry_go_round"]'); await page.waitForTimeout(100);
await tileClick(ex + 3, ey - 13);   // 2x2 ride centred near (ex+3, ey-13) → origin (ex+3, ey-13) since size 2 offset 0
const ride = await page.evaluate(() => { const r = window.__rct.app.g.rides[0]; return r ? { x: r.x, y: r.y, type: r.type } : null; });
check('ride placed', !!ride, JSON.stringify(ride));
if (ride) {
  // entrance: a tile south of the ride that touches it; exit east of the ride
  await tileClick(ride.x, ride.y + 2); await tileClick(ride.x + 2, ride.y);
  const r2 = await page.evaluate(() => { const r = window.__rct.app.g.rides[0]; return { ent: !!r.entrance, ex: !!r.exit }; });
  check('entrance and exit placed', r2.ent && r2.ex, JSON.stringify(r2));
  // connect the entrance to the path with a tile of path if needed
  await page.keyboard.press('Escape'); await page.keyboard.press('f'); await page.waitForTimeout(100);
  for (let yy = ride.y + 3; yy <= ey - 10; yy++) await tileClick(ride.x, yy);
  await page.keyboard.press('Escape');
  // open the ride via its window
  await page.evaluate(() => { window.__rct.app.wm.closeAll(); });
  await page.evaluate(() => { const a = window.__rct.app; a.inspectAt(0, 0); });
  await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[0]; const w = (window.__rct.openRide = null); void w; });
}
// run the clock quickly for a minute of game time
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 2400; i++) window.__rct.tick(a.g); });
const t2 = await page.evaluate(() => ({ tick: window.__rct.app.g.tick, cash: window.__rct.app.g.finance.cash, rating: window.__rct.app.g.rating }));
check('simulation advanced', t2.tick >= 2400, JSON.stringify(t2));
// zoom + rotate render without errors
await page.keyboard.press('e'); await page.waitForTimeout(150); await page.keyboard.press('+'); await page.waitForTimeout(150);
await page.screenshot({ path: `${shots}/${engine}-03-rotated.png` });
await page.keyboard.press('q'); await page.keyboard.press('-'); await page.keyboard.press('-'); await page.waitForTimeout(150);
await page.screenshot({ path: `${shots}/${engine}-04-zoomout.png` });
// windows open
for (const k of ['finance', 'park', 'rides', 'guests', 'staff', 'research', 'options', 'save', 'news']) { await page.evaluate(k => window.__rct.app.action(k), k); }
await page.waitForTimeout(300);
const wins = await page.evaluate(() => document.querySelectorAll('.win').length);
check('management windows open', wins >= 8, `${wins} windows`);
await page.screenshot({ path: `${shots}/${engine}-05-windows.png` });
const fit = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, cs: document.characterSet }));
check('page fits the window', fit.sh <= fit.ih && fit.sw <= fit.iw, JSON.stringify(fit));
check('utf-8', fit.cs === 'UTF-8');
// save round trip
const rt = await page.evaluate(() => { const a = window.__rct.app; const s = window.__rct.serialize(a.g); const g2 = window.__rct.deserialize(s); return g2.tiles.length === a.g.tiles.length && g2.rides.length === a.g.rides.length && s.length; });
check('save round-trips', !!rt, `${rt} bytes`);
const fps = await page.evaluate(() => { const f = window.__rct.app.frameTimes; return f.length ? Math.round(1 / (f.reduce((a, b) => a + b, 0) / f.length)) : 0; });
console.log(`frame rate ≈ ${fps} fps (headless)`);
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
