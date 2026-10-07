import { describe, expect, it, vi } from 'vitest';
import { AppLifecycle } from './AppLifecycle';
import type { FrameHost } from './AppLifecycle';

function hostSpy(): FrameHost & { callbacks: Array<(now: number) => void>; cancelled: number[] } {
  const callbacks: Array<(now: number) => void> = [];
  const cancelled: number[] = [];
  return {
    callbacks,
    cancelled,
    requestFrame: (cb) => {
      callbacks.push(cb);
      return callbacks.length;
    },
    cancelFrame: (id) => {
      cancelled.push(id);
    },
  };
}

function make() {
  const host = hostSpy();
  const audio = { suspend: vi.fn(), resume: vi.fn() };
  const onFrame = vi.fn();
  const game = { pause: vi.fn(), resume: vi.fn() };
  const life = new AppLifecycle(host, audio, onFrame);
  return { host, audio, onFrame, game, life };
}

describe('AppLifecycle', () => {
  it('starts the loop when ready and not paused', () => {
    const { host, game, life } = make();
    life.start(game);
    expect(host.callbacks).toHaveLength(1);
    expect(game.pause).not.toHaveBeenCalled();
  });

  it('does not start the loop when a pause arrived before ready, and pauses the game', () => {
    const { host, game, life, audio } = make();
    life.pause();
    life.start(game);
    expect(host.callbacks).toHaveLength(0);
    expect(game.pause).toHaveBeenCalledTimes(1);
    expect(audio.suspend).toHaveBeenCalled();
  });

  it('resume after a pre-ready pause starts the loop once', () => {
    const { host, game, life } = make();
    life.pause();
    life.start(game);
    life.resume();
    life.resume();
    expect(host.callbacks).toHaveLength(1);
    expect(game.resume).toHaveBeenCalled();
  });

  it('pause cancels the pending frame and suspends audio; resume restarts with dt 0', () => {
    const { host, game, life, audio, onFrame } = make();
    life.start(game);
    host.callbacks[0]!(1000);
    host.callbacks[1]!(1016);
    expect(onFrame).toHaveBeenLastCalledWith(expect.closeTo(0.016, 3));
    life.pause();
    expect(host.cancelled).toEqual([3]);
    expect(audio.suspend).toHaveBeenCalled();
    expect(game.pause).toHaveBeenCalled();
    life.resume();
    expect(audio.resume).toHaveBeenCalled();
    host.callbacks[3]!(5000);
    expect(onFrame).toHaveBeenLastCalledWith(0);
  });

  it('ignores frames that were scheduled before a pause', () => {
    const { host, game, life, onFrame } = make();
    life.start(game);
    life.pause();
    host.callbacks[0]!(1000);
    expect(onFrame).not.toHaveBeenCalled();
  });
});
