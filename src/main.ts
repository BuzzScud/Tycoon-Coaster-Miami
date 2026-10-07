import { newGame, tick, cmdPath, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece } from './sim/game';
import { serialize, deserialize } from './sim/save';
import { openRide, testRide, closeRide } from './sim/ridesim';

const has3d = (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; } })();
const want2d = /[?&]classic/.test(location.search);
const hook: any = { newGame, serialize, deserialize, tick, openRide, testRide, closeRide, cmds: { cmdPath, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece }, mode: '2d' };
(window as any).__rct = hook;

if (has3d && !want2d) {
  import('./dock/app3d').then(({ App3D }) => {
    document.getElementById('app')!.style.display = 'none';
    const root = document.getElementById('app3d')!; root.classList.remove('hidden');
    const app = new App3D(root); hook.app = app; hook.mode = '3d'; hook.showTitle = () => app.showTitle();
  });
} else {
  Promise.all([import('./ui/app'), import('./ui/title')]).then(([{ App }, { Title }]) => {
    document.getElementById('app3d')!.classList.add('hidden');
    const root = document.getElementById('app')!; root.style.display = '';
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    const app = new App(root, canvas); const title = new Title(root, g => app.start(g));
    hook.app = app; hook.title = title; hook.showTitle = () => { app.running = false; title.show(); };
  });
}
