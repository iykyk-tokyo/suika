import { SfxSynth } from '../audio/SfxSynth';
import { Rng, randomSeed } from '../core/rng';
import { createEmptySave, parseSave, serializeSave } from '../core/save';
import type { SaveData } from '../core/save';
import { MatterWorld } from '../physics/MatterWorld';
import { createPort } from '../playables/createPort';
import type { PlayablesPort } from '../playables/PlayablesPort';
import { withTimeout } from '../playables/withTimeout';
import { SceneRenderer } from '../render/SceneRenderer';
import { Hud } from '../ui/Hud';
import { resolveLang } from '../ui/i18n';
import type { Lang } from '../ui/i18n';
import { Game } from './Game';
import type { GameHost, GamePresenter } from './Game';
import { InputController } from './InputController';
import type { GameInput } from './InputController';
import { planLayout, shouldApplyResize } from './LayoutPlanner';

const LOAD_TIMEOUT_MS = 1000;

// String.prototype.isWellFormed は iOS 16.4 未満に無いので、無い環境では検査を省く。
function isWellFormedString(s: string): boolean {
  return typeof s.isWellFormed === 'function' ? s.isWellFormed() : true;
}

async function loadInitialSave(port: PlayablesPort): Promise<SaveData> {
  let raw: string;
  try {
    raw = await withTimeout(port.loadData(), LOAD_TIMEOUT_MS, () => {
      port.logWarning();
      return '';
    });
  } catch {
    port.logError();
    return createEmptySave();
  }
  if (raw === '') return createEmptySave();
  const parsed = parseSave(raw);
  if (parsed === null) {
    port.logError();
    return createEmptySave();
  }
  return parsed;
}

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

  let game: Game | null = null;
  let rafId: number | null = null;
  let lastTime: number | null = null;
  let pendingScore: number | null = null;
  let frame: ((now: number) => void) | null = null;

  // Playables の MUST: onPause で全実行を止め、onResume でだけ再開する。
  port.onPause(() => {
    game?.pause();
    sfx.suspend();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });
  port.onResume(() => {
    game?.resume();
    if (port.isAudioEnabled()) sfx.resume();
    lastTime = null;
    if (rafId === null && frame !== null) rafId = requestAnimationFrame(frame);
  });
  sfx.setEnabled(port.isAudioEnabled());
  port.onAudioEnabledChange((enabled) => sfx.setEnabled(enabled));

  const [initial, lang] = await Promise.all([loadInitialSave(port), loadLang(port)]);
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

  // sendScore はセーブ完了後に送る（送信値 = セーブ内 bestScore の MUST）。
  const flushScore = (): void => {
    if (pendingScore === null) return;
    const value = pendingScore;
    port.sendScore(value).then(
      () => {
        if (pendingScore === value) pendingScore = null;
      },
      () => port.logWarning(),
    );
  };

  const host: GameHost = {
    save: (data) => {
      const str = serializeSave(data);
      if (!isWellFormedString(str)) {
        port.logError();
        return;
      }
      port.saveData(str).then(flushScore, () => port.logError());
    },
    submitBest: (best) => {
      pendingScore = best;
    },
  };

  const world = new MatterWorld();
  const liveGame = new Game(world, presenter, host, new Rng(randomSeed()), initial);
  game = liveGame;

  const handleInput = (input: GameInput): void => {
    switch (input.type) {
      case 'aim':
        liveGame.aimAt(renderer.clientToUnit(input.clientX, input.clientY).x);
        break;
      case 'nudge':
        liveGame.nudge(input.direction);
        break;
      case 'drop':
        liveGame.drop();
        break;
      case 'restart':
        if (liveGame.phase === 'gameover') liveGame.restart();
        break;
    }
  };
  new InputController(canvas, handleInput, () => sfx.unlock());
  hud.onPlayAgain(() => {
    sfx.unlock();
    liveGame.restart();
  });

  frame = (now: number): void => {
    rafId = requestAnimationFrame(frame!);
    const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
    lastTime = now;
    liveGame.update(dt);
    renderer.render(dt);
  };

  renderer.render(0);
  port.firstFrameReady();
  port.gameReady();
  rafId = requestAnimationFrame(frame);
}
