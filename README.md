# RollerCoaster Tycoon · 2026 remake

A theme park game in the spirit of the 1999 original, rebuilt as a modern three.js app and drawn in ink: every ride,
stall, tree and guest is a hand-built model with ink lines on its edges, a fixed shade per side and no sun or shadows,
seen through a flat (orthographic) camera you can turn and tilt. The old shaded 3D look is one switch away in Options.
Every model and effect is generated in code; nothing is downloaded. The whole game builds into one HTML file.

## Play it

- Double-click `Start RollerCoaster Tycoon.command`, or open `dist/index.html`, or the copy at `~/Desktop/rollercoaster-tycoon.html`.
- The game needs WebGL 2 (any current browser). **Options → Look** switches between the ink look and the classic shaded 3D
  look (sun, shadows, night and rain); the choice is remembered.

**Controls.** Drag to pan, right-drag to orbit, scroll to zoom. `W A S D` / arrows pan, `Q` `E` rotate, `+` `−` zoom.
`P` or space pauses, `1`–`4` set the speed. `R` rotates the thing you are placing, `Esc` cancels. `X` bulldozer, `F` paths,
`T` scenery, `L` land, `N` new ride. While building a coaster: `Enter` builds the piece, `Backspace` removes the last one.
`C` rides the selected coaster in first person. `Cmd+Z` undoes a build, `Cmd+S` opens save & load. `Esc` closes the
report and brings the panels back after **Look at the park**.

**How to play.** Lay a path from the entrance. Place a ride, then its entrance and exit next to a path. Guests judge each
ride by Excitement, Intensity and Nausea against their own taste. Keep them fed (stalls), relieved (toilets), happy
(scenery, benches, short queues) and the park clean (handymen, bins). Mechanics fix breakdowns. Research unlocks rides.
Ads bring guests. The park rating (0–999) drives how fast guests arrive.

**Free play or goals.** Parks are free play by default: no clock, the park never ends. On the new-park screen, **Goals**
adds a clock (45, 60 or 90 minutes of play) and three targets scaled to the map and difficulty: guests in the park, a
park rating and cash on hand (no cash goal in sandbox). Hold all of them for two minutes and the goals are met; when the
clock runs out the park gets a verdict. Either way you can keep playing.

**The park report** (Report in the dock, or the clock chip in the top bar) shows the run so far: time played, guests,
admissions, cash and rating, the goals, three small charts on one time axis (guests, cash, rating; hover for the values,
or open the table view) and the chronicle of every message with its time. It opens by itself when goals are met or time
runs out, with **Keep playing**, **Found a new park** and **Look at the park** (every panel hidden; `Esc` brings them back).

## Build and test

```
npm install
npm run dev        # vite dev server
npm run build      # one-file build in dist/ + a copy on the Desktop
npm test           # rule tests (vitest), including goals, history and chronicle
node tests/e2e-3d.mjs chromium|webkit     # the game in a real browser: build, coaster, ride camera, report, both looks, goals
# ink-lab.html (dev server only): the same live park drawn Today / Fine ink / Bold ink, for comparing the looks
```

## Layout

- `src/sim/` — the rules, no DOM: map, guests, rides, coaster physics and ratings, money, research, marketing, awards,
  weather, staff, saves, and `goals.ts` (the optional clock and targets, weekly history, the chronicle).
  `docs/rct-rules.md` holds the research notes the rules follow.
- `src/ink/` — the ink look: `kit.ts` (a model is a sketch of filled parts, ink outlines and strokes; unlit fills shaded
  by face direction; world-unit ink lines; the styles), `models.ts` (every ride, stall, scenery kind, hut, the gate,
  coasters), `terrain.ts` (ground, cliffs, paths, water in 16×16 patches), `views.ts` (the views the game drives).
- `src/three/` — the classic look's views (terrain, scenery, guests, rides, coasters, rain), and `world.ts`: the renderer,
  both cameras (flat for ink, perspective for classic and the ride camera) and the look switch.
- `src/dock/` — the interface: dock, chips, inspector pages, bottom rail, title screen, the park report; `ink.css` is the
  paper interface used with the ink look.

## Left out on purpose

Water rides and transport rides, sound beyond a few clicks, post effects (bloom, ambient occlusion), touch controls,
scenario objectives (it is free play), path slopes steeper than one step, and staff patrol areas.
