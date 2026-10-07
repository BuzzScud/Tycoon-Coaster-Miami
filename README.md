# RollerCoaster Tycoon · 2026 remake

A free-play theme park game in the spirit of the 1999 original, rebuilt as a modern three.js app. Every model, sound and
effect is generated in code; nothing is downloaded. The whole game builds into one HTML file.

## Play it

- Double-click `Start RollerCoaster Tycoon.command`, or open `dist/index.html`, or the copy at `~/Desktop/rollercoaster-tycoon.html`.
- Add `?classic` to the address to force the 2D isometric version (it also loads by itself when WebGL is unavailable).

**Controls.** Drag to pan, right-drag to orbit, scroll to zoom. `W A S D` / arrows pan, `Q` `E` rotate, `+` `−` zoom.
`P` or space pauses, `1`–`4` set the speed. `R` rotates the thing you are placing, `Esc` cancels. `X` bulldozer, `F` paths,
`T` scenery, `L` land, `N` new ride. While building a coaster: `Enter` builds the piece, `Backspace` removes the last one.
`C` rides the selected coaster in first person. `Cmd+Z` undoes a build, `Cmd+S` opens save & load.

**How to play.** Lay a path from the entrance. Place a ride, then its entrance and exit next to a path. Guests judge each
ride by Excitement, Intensity and Nausea against their own taste. Keep them fed (stalls), relieved (toilets), happy
(scenery, benches, short queues) and the park clean (handymen, bins). Mechanics fix breakdowns. Research unlocks rides.
Ads bring guests. The park rating (0–999) drives how fast guests arrive.

## Build and test

```
npm install
npm run dev        # vite dev server
npm run build      # one-file build in dist/ + a copy on the Desktop
npm test           # rule tests (vitest)
node tests/e2e-3d.mjs chromium|webkit     # the 3D game in a real browser
node tests/e2e.mjs chromium|webkit        # the 2D fallback
node tests/e2e-coaster.mjs chromium       # the 2D coaster flow
```

## Layout

- `src/sim/` — the rules, no DOM: map, guests, rides, coaster physics and ratings, money, research, marketing, awards,
  weather, staff, saves. Shared by both front ends. `docs/rct-rules.md` holds the research notes the rules follow.
- `src/three/` — the 3D world: terrain chunks, water, instanced scenery and guests, ride models, spline coaster track,
  trains, lighting, rain.
- `src/dock/` — the modern interface: dock, chips, inspector pages, bottom rail, title screen.
- `src/render/` + `src/ui/` — the 2D isometric fallback with the classic 1999 windows.

## Left out on purpose

Water rides and transport rides, sound beyond a few clicks, post effects (bloom, ambient occlusion), touch controls,
scenario objectives (it is free play), path slopes steeper than one step, and staff patrol areas.
