import { SfxSynth } from '../audio/SfxSynth';
import { Rng, randomSeed } from '../core/rng';
import { MatterWorld } from '../physics/MatterWorld';
import { createPort } from '../playables/createPort';
import type { PlayablesPort } from '../playables/PlayablesPort';
import { withTimeout } from '../playables/withTimeout';
import { SceneRenderer } from '../render/SceneRenderer';
import { Hud } from '../ui/Hud';
import { resolveLang } from '../ui/i18n';
import type { Lang } from '../ui/i18n';
import { AppLifecycle } from './AppLifecycle';
import { Game } from './Game';
import type { GameHost, GamePresenter } from './Game';
import { InputController } from './InputController';
import type { GameInput } from './InputController';
import { planLayout, shouldApplyResize } from './LayoutPlanner';
import { SaveCoordinator } from './SaveCoordinator';

const LOAD_TIMEOUT_MS = 1000;

async function loadLang(port: PlayablesPort): Promise<Lang> {
  try {
    return resolveLang(await withTimeout(port.getLanguage(), LOAD_TIMEOUT_MS, () => 'en'));
  } catch {
    return 'en';
  }
}

export async function bootstrap(canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<void> {
  const port = createPort();
  const sfx = new SfxSynth();
  let liveGame: Game | null = null;

  // Playables の MUST: onPause で全実行を止め、onResume でだけ再開する。
  const lifecycle = new AppLifecycle(
    { requestFrame: (cb) => requestAnimationFrame(cb), cancelFrame: (id) => cancelAnimationFrame(id) },
    sfx,
    (dt) => {
      liveGame?.update(dt);
      renderer?.render(dt);
    },
  );
  port.onPause(() => lifecycle.pause());
  port.onResume(() => lifecycle.resume());
  sfx.setEnabled(port.isAudioEnabled());
  port.onAudioEnabledChange((enabled) => sfx.setEnabled(enabled));

  // loadData 完了前に saveData を呼ばない（MUST）。タイムアウト時は SaveCoordinator が保存を保留する。
  const saves = new SaveCoordinator(port, port.loadData(), LOAD_TIMEOUT_MS);
  saves.onLateLoad((late) => liveGame?.raiseBest(late.bestScore));
  const [initial, lang] = await Promise.all([saves.initial(), loadLang(port)]);
  const hud = new Hud(hudRoot, lang);

  const renderer = SceneRenderer.tryCreate(canvas);
  if (renderer === null) {
    hud.showWebglUnsupported();
    port.logError();
    port.firstFrameReady();
    return;
  }

  const applyLayout = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!shouldApplyResize(w, h)) return;
    const plan = planLayout(w, h);
    renderer.applyLayout(plan, window.devicePixelRatio);
    hud.setMode(plan.hudMode);
  };
  applyLayout();
  window.addEventListener('resize', applyLayout);

  const presenter: GamePresenter = {
    bodiesChanged: (bodies) => renderer.syncBodies(bodies),
    aimChanged: (tier, x) => renderer.setAim(tier, x),
    merged: (position, tier) => {
      renderer.spawnMergeEffect(position, tier);
      sfx.playMerge(tier);
    },
    dropped: () => sfx.playDrop(),
    scoreChanged: (score, best) => hud.setScore(score, best),
    nextChanged: (tier) => hud.setNext(tier),
    gameOver: (score, best) => {
      hud.showGameOver(score, best);
      sfx.playGameOver();
    },
    restarted: () => hud.hideGameOver(),
  };

  const host: GameHost = {
    save: (data) => saves.save(data),
    submitBest: (best) => saves.submitBest(best),
  };

  const world = new MatterWorld();
  const game = new Game(world, presenter, host, new Rng(randomSeed()), initial);
  liveGame = game;

  const handleInput = (input: GameInput): void => {
    switch (input.type) {
      case 'aim':
        game.aimAt(renderer.clientToUnit(input.clientX, input.clientY).x);
        break;
      case 'nudge':
        game.nudge(input.direction);
        break;
      case 'drop':
        game.drop();
        break;
      case 'restart':
        game.restart();
        break;
    }
  };
  new InputController(canvas, handleInput, () => sfx.unlock());
  hud.onPlayAgain(() => {
    sfx.unlock();
    game.restart();
  });

  renderer.render(0);
  port.firstFrameReady();
  port.gameReady();
  lifecycle.start(game);
}
