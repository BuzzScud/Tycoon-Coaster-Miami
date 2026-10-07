import { App } from './ui/app';
import { Title } from './ui/title';
import { newGame } from './sim/game';
import { serialize, deserialize } from './sim/save';
import { tick } from './sim/game';

const root = document.getElementById('app')!;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const app = new App(root, canvas);
const title = new Title(root, g => app.start(g));
// test / automation hook
(window as any).__rct = { app, title, newGame, serialize, deserialize, tick, showTitle: () => { app.running = false; title.show(); } };
