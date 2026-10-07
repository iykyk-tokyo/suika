import { bootstrap } from './app/bootstrap';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
if (!(canvas instanceof HTMLCanvasElement) || hud === null) {
  throw new Error('index.html must contain #game canvas and #hud div');
}

// グローバルエラーはポート生成前にも起こりうるため、ここだけ直接 ytgame を参照する。
window.addEventListener('error', () => {
  if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) ytgame.health.logError();
});
window.addEventListener('unhandledrejection', () => {
  if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) ytgame.health.logError();
});

void bootstrap(canvas, hud);
