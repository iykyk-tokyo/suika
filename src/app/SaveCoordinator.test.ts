import { describe, expect, it, vi } from 'vitest';
import type { SaveData } from '../core/save';
import { SaveCoordinator } from './SaveCoordinator';
import type { SavePort } from './SaveCoordinator';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function portSpy(): SavePort & { saved: string[]; scores: number[] } {
  const saved: string[] = [];
  const scores: number[] = [];
  return {
    saved,
    scores,
    saveData: vi.fn((s: string) => {
      saved.push(s);
      return Promise.resolve();
    }),
    sendScore: vi.fn((v: number) => {
      scores.push(v);
      return Promise.resolve();
    }),
    logError: vi.fn(),
    logWarning: vi.fn(),
  };
}

const data = (best: number): SaveData => ({ v: 1, bestScore: best, snapshot: null });

describe('SaveCoordinator.initial', () => {
  it('returns the parsed save when loadData resolves in time', async () => {
    const port = portSpy();
    const c = new SaveCoordinator(port, Promise.resolve('{"v":1,"bestScore":42,"snapshot":null}'), 1000);
    await expect(c.initial()).resolves.toEqual(data(42));
  });

  it('returns an empty save and logs an error on garbage', async () => {
    const port = portSpy();
    const c = new SaveCoordinator(port, Promise.resolve('garbage'), 1000);
    await expect(c.initial()).resolves.toEqual(data(0));
    expect(port.logError).toHaveBeenCalled();
  });

  it('returns an empty save and logs a warning on timeout', async () => {
    vi.useFakeTimers();
    const port = portSpy();
    const load = deferred<string>();
    const c = new SaveCoordinator(port, load.promise, 1000);
    const p = c.initial();
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toEqual(data(0));
    expect(port.logWarning).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('SaveCoordinator.save after a timeout', () => {
  it('holds saves until the real loadData settles, then saves only the latest', async () => {
    vi.useFakeTimers();
    const port = portSpy();
    const load = deferred<string>();
    const c = new SaveCoordinator(port, load.promise, 1000);
    const p = c.initial();
    vi.advanceTimersByTime(1000);
    await p;
    c.save(data(3));
    c.save(data(6));
    expect(port.saveData).not.toHaveBeenCalled();
    load.resolve('');
    await vi.runAllTimersAsync();
    expect(port.saved).toEqual([JSON.stringify(data(6))]);
    vi.useRealTimers();
  });

  it('reports late cloud data so the game can raise its best before saving', async () => {
    vi.useFakeTimers();
    const port = portSpy();
    const load = deferred<string>();
    const c = new SaveCoordinator(port, load.promise, 1000);
    const late = vi.fn();
    c.onLateLoad(late);
    const p = c.initial();
    vi.advanceTimersByTime(1000);
    await p;
    c.save(data(3));
    load.resolve('{"v":1,"bestScore":99,"snapshot":null}');
    await vi.runAllTimersAsync();
    expect(late).toHaveBeenCalledWith(data(99));
    // onLateLoad のコールバックが呼ばれた後に保留分が保存される
    expect(late.mock.invocationCallOrder[0]!).toBeLessThan((port.saveData as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
    vi.useRealTimers();
  });

  it('releases held saves when the real loadData rejects', async () => {
    vi.useFakeTimers();
    const port = portSpy();
    const load = deferred<string>();
    const c = new SaveCoordinator(port, load.promise, 1000);
    const p = c.initial();
    vi.advanceTimersByTime(1000);
    await p;
    c.save(data(3));
    load.reject(new Error('sdk'));
    await vi.runAllTimersAsync();
    expect(port.saved).toEqual([JSON.stringify(data(3))]);
    expect(port.logError).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('SaveCoordinator score submission', () => {
  it('sends the best only after a save completes, once', async () => {
    const port = portSpy();
    const c = new SaveCoordinator(port, Promise.resolve(''), 1000);
    await c.initial();
    c.submitBest(50);
    expect(port.sendScore).not.toHaveBeenCalled();
    c.save(data(50));
    await Promise.resolve();
    await Promise.resolve();
    expect(port.scores).toEqual([50]);
    c.save(data(50));
    await Promise.resolve();
    await Promise.resolve();
    expect(port.scores).toEqual([50]);
  });

  it('retries a failed send on the next save', async () => {
    const port = portSpy();
    let fail = true;
    port.sendScore = vi.fn((v: number) => {
      if (fail) return Promise.reject(new Error('x'));
      port.scores.push(v);
      return Promise.resolve();
    });
    const c = new SaveCoordinator(port, Promise.resolve(''), 1000);
    await c.initial();
    c.submitBest(7);
    c.save(data(7));
    await vi.waitFor(() => expect(port.logWarning).toHaveBeenCalled());
    fail = false;
    c.save(data(7));
    await vi.waitFor(() => expect(port.scores).toEqual([7]));
  });

  it('logs an error when saveData rejects', async () => {
    const port = portSpy();
    port.saveData = vi.fn(() => Promise.reject(new Error('x')));
    const c = new SaveCoordinator(port, Promise.resolve(''), 1000);
    await c.initial();
    c.save(data(1));
    await vi.waitFor(() => expect(port.logError).toHaveBeenCalled());
  });
});
