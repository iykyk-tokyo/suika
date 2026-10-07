import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../core/rng';
import { createEmptySave } from '../core/save';
import type { SaveData, SnapshotBody } from '../core/save';
import { BOX, tierDef } from '../core/tiers';
import { MatterWorld } from '../physics/MatterWorld';
import { Game } from './Game';
import type { GameHost, GameOptions, GamePresenter } from './Game';

function presenterSpy(): GamePresenter {
  return {
    bodiesChanged: vi.fn(),
    aimChanged: vi.fn(),
    merged: vi.fn(),
    dropped: vi.fn(),
    scoreChanged: vi.fn(),
    nextChanged: vi.fn(),
    gameOver: vi.fn(),
    restarted: vi.fn(),
  };
}

function hostSpy(): GameHost {
  return { save: vi.fn(), submitBest: vi.fn() };
}

function run(game: Game, seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) game.update(1 / 60);
}

function make(initial: SaveData = createEmptySave()) {
  const world = new MatterWorld();
  const presenter = presenterSpy();
  const host = hostSpy();
  const game = new Game(world, presenter, host, new Rng(1), initial);
  return { world, presenter, host, game };
}

describe('Game start', () => {
  it('starts playing with a droppable next tier and aim at center', () => {
    const { game } = make();
    expect(game.phase).toBe('playing');
    expect(game.nextTier).toBeLessThanOrEqual(4);
    expect(game.aimX).toBe(0);
    expect(game.dropReady).toBe(true);
    expect(game.score).toBe(0);
  });

  it('restores a snapshot', () => {
    const { game, world } = make({
      v: 1,
      bestScore: 50,
      snapshot: { score: 12, nextTier: 3, bodies: [{ t: 2, x: 1, y: 0.66, a: 0 }, { t: 5, x: -2, y: 1.2, a: 0.3 }] },
    });
    expect(game.score).toBe(12);
    expect(game.best).toBe(50);
    expect(game.nextTier).toBe(3);
    expect(world.getBodies().map((b) => b.tier).sort()).toEqual([2, 5]);
  });
});

describe('aiming', () => {
  it('clamps aim to the walls and notifies the presenter', () => {
    const { game, presenter } = make();
    game.aimAt(100);
    expect(game.aimX).toBeCloseTo(BOX.width / 2 - tierDef(game.nextTier).radius);
    expect(presenter.aimChanged).toHaveBeenLastCalledWith(game.nextTier, game.aimX);
  });

  it('nudges by 0.25 units', () => {
    const { game } = make();
    game.nudge(1);
    game.nudge(1);
    expect(game.aimX).toBeCloseTo(0.5);
    game.nudge(-1);
    expect(game.aimX).toBeCloseTo(0.25);
  });
});

describe('dropping', () => {
  it('spawns the current tier at the aim and blocks further drops until ready', () => {
    const { game, world, presenter } = make();
    const tier = game.nextTier;
    game.aimAt(1);
    game.drop();
    expect(world.getBodies()).toHaveLength(1);
    expect(world.getBodies()[0]!.tier).toBe(tier);
    expect(world.getBodies()[0]!.position.y).toBeCloseTo(BOX.spawnY);
    expect(game.dropReady).toBe(false);
    expect(presenter.dropped).toHaveBeenCalledTimes(1);
    game.drop();
    expect(world.getBodies()).toHaveLength(1);
  });

  it('becomes ready again within 0.6 s even without a collision', () => {
    const { game } = make();
    game.drop();
    run(game, 0.65);
    expect(game.dropReady).toBe(true);
  });

  it('hides the aim ghost while not ready and shows the next tier when ready', () => {
    const { game, presenter } = make();
    game.drop();
    expect(presenter.aimChanged).toHaveBeenLastCalledWith(null, expect.any(Number));
    run(game, 0.7);
    expect(presenter.aimChanged).toHaveBeenLastCalledWith(game.nextTier, game.aimX);
  });
});

describe('merging', () => {
  it('merges two equal bodies dropped on the same spot and scores', () => {
    const { game, world, presenter, host } = make({ v: 1, bestScore: 0, snapshot: { score: 0, nextTier: 1, bodies: [{ t: 1, x: 0, y: 0.52, a: 0 }] } });
    game.aimAt(0);
    game.drop();
    run(game, 3);
    expect(world.getBodies().map((b) => b.tier)).toEqual([2]);
    expect(game.score).toBe(3);
    expect(presenter.merged).toHaveBeenCalledTimes(1);
    expect(presenter.scoreChanged).toHaveBeenLastCalledWith(3, 3);
    expect(host.save).toHaveBeenCalled();
  });
});

// 山の安定性ではなく Game の遷移を検証するため、床に置いた 1 体と低い危険ラインで判定する。
// tier 4（半径 1.0）を y=1.0 に置くと上端 2.0 > dangerY 1.5 で静止したまま条件を満たす。
const LOW_LINE: GameOptions = { gameOver: { dangerY: 1.5, restSpeed: 0.2, holdSec: 1.0 } };
const OVERFLOW_BODIES: SnapshotBody[] = [{ t: 4, x: 0, y: 1.0, a: 0 }];

function makeOver() {
  const world = new MatterWorld();
  const presenter = presenterSpy();
  const host = hostSpy();
  const game = new Game(world, presenter, host, new Rng(1), { v: 1, bestScore: 0, snapshot: { score: 70, nextTier: 0, bodies: OVERFLOW_BODIES } }, LOW_LINE);
  return { world, presenter, host, game };
}

describe('game over', () => {
  it('ends when a resting body stays above the danger line and submits the best', () => {
    const { game, presenter, host } = makeOver();
    run(game, 2);
    expect(game.phase).toBe('gameover');
    expect(presenter.gameOver).toHaveBeenCalledWith(70, 70);
    expect(host.submitBest).toHaveBeenCalledWith(70);
    const lastSave = (host.save as ReturnType<typeof vi.fn>).mock.lastCall?.[0] as SaveData;
    expect(lastSave.snapshot).toBeNull();
    expect(lastSave.bestScore).toBe(70);
  });

  it('does not end while the body is still falling', () => {
    const world = new MatterWorld();
    const game = new Game(world, presenterSpy(), hostSpy(), new Rng(1), { v: 1, bestScore: 0, snapshot: { score: 0, nextTier: 0, bodies: [{ t: 4, x: 0, y: 12, a: 0 }] } }, LOW_LINE);
    run(game, 0.5);
    expect(game.phase).toBe('playing');
  });

  it('ignores drops while over and restarts cleanly', () => {
    const { game, world, presenter } = makeOver();
    run(game, 2);
    game.drop();
    expect(world.getBodies().length).toBe(OVERFLOW_BODIES.length);
    game.restart();
    expect(game.phase).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.best).toBe(70);
    expect(world.getBodies()).toEqual([]);
    expect(presenter.restarted).toHaveBeenCalled();
  });
});

describe('snapshot and pause', () => {
  it('snapshot() reflects the live board', () => {
    const { game } = make();
    game.drop();
    run(game, 2);
    const s = game.snapshot();
    expect(s.snapshot?.bodies).toHaveLength(1);
    expect(s.snapshot?.nextTier).toBe(game.nextTier);
  });

  it('pause() saves immediately and freezes updates until resume()', () => {
    const { game, host, world } = make();
    game.drop();
    game.pause();
    expect(host.save).toHaveBeenCalledTimes(1);
    const yBefore = world.getBodies()[0]!.position.y;
    run(game, 1);
    expect(world.getBodies()[0]!.position.y).toBeCloseTo(yBefore);
    game.resume();
    run(game, 1);
    expect(world.getBodies()[0]!.position.y).toBeLessThan(yBefore);
  });
});

describe('restart guard and raiseBest', () => {
  it('restart() is ignored while playing (prevents double restart from Enter + button click)', () => {
    const { game, host, presenter } = make();
    game.drop();
    game.restart();
    expect(presenter.restarted).not.toHaveBeenCalled();
    expect(host.save).not.toHaveBeenCalled();
  });

  it('restart() is ignored while paused even after game over', () => {
    const { game, presenter } = makeOver();
    run(game, 2);
    game.pause();
    game.restart();
    expect(presenter.restarted).not.toHaveBeenCalled();
    expect(game.phase).toBe('gameover');
  });

  it('raiseBest() lifts best from late cloud data and notifies the HUD', () => {
    const { game, presenter } = make({ v: 1, bestScore: 10, snapshot: null });
    game.raiseBest(99);
    expect(game.best).toBe(99);
    expect(presenter.scoreChanged).toHaveBeenLastCalledWith(0, 99);
    game.raiseBest(5);
    expect(game.best).toBe(99);
    expect(game.snapshot().bestScore).toBe(99);
  });
});
