import { describe, expect, it } from 'vitest';
import { LocalAdapter } from './LocalAdapter';
import type { StorageLike } from './PlayablesPort';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('LocalAdapter', () => {
  it('is not the playables env', () => {
    expect(new LocalAdapter(memoryStorage()).inPlayablesEnv).toBe(false);
  });

  it('loads empty string when nothing is stored', async () => {
    await expect(new LocalAdapter(memoryStorage()).loadData()).resolves.toBe('');
  });

  it('saves and loads through the storage', async () => {
    const storage = memoryStorage();
    const port = new LocalAdapter(storage);
    await port.saveData('{"v":1}');
    expect(storage.map.get(LocalAdapter.KEY)).toBe('{"v":1}');
    await expect(port.loadData()).resolves.toBe('{"v":1}');
  });

  it('reports audio enabled and ja language', async () => {
    const port = new LocalAdapter(memoryStorage());
    expect(port.isAudioEnabled()).toBe(true);
    await expect(port.getLanguage()).resolves.toBe('ja');
  });

  it('lifecycle hooks return unsubscribe functions and never throw', () => {
    const port = new LocalAdapter(memoryStorage());
    expect(typeof port.onPause(() => {})).toBe('function');
    expect(typeof port.onResume(() => {})).toBe('function');
    expect(typeof port.onAudioEnabledChange(() => {})).toBe('function');
    expect(() => {
      port.firstFrameReady();
      port.gameReady();
      port.logError();
      port.logWarning();
    }).not.toThrow();
  });

  it('sendScore resolves', async () => {
    await expect(new LocalAdapter(memoryStorage()).sendScore(10)).resolves.toBeUndefined();
  });
});
