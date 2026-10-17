import { newGame, tick, cmdPath, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece, cmdScenery } from './sim/game';
import { serialize, deserialize, writeSlot, readSlot, clearSlot, packSave } from './sim/save';
import { openRide, testRide, closeRide } from './sim/ridesim';
import { cmdBuildDesign } from './sim/designs';
import { autoConnect } from './sim/connect';
import { buildCircuit } from './sim/autotrack';
import { startEvent } from './sim/events';
import { spawnGuest } from './sim/guests';

const has3d = (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; } })();
const hook: any = { newGame, serialize, deserialize, tick, openRide, testRide, closeRide, cmds: { cmdPath, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece, cmdScenery, cmdBuildDesign, autoConnect, buildCircuit, startEvent, spawnGuest }, saves: { writeSlot, readSlot, clearSlot, packSave }, mode: 'none' };
(window as any).__rct = hook;

if (has3d) {
  import('./dock/app3d').then(({ App3D }) => {
    const root = document.getElementById('app3d')!; root.classList.remove('hidden');
    const app = new App3D(root); hook.app = app; hook.mode = '3d'; hook.showTitle = () => app.showTitle();
  });
} else document.getElementById('nogl')!.style.display = 'grid';
