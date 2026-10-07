import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  it('resolves with the inner value when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, () => 'late')).resolves.toBe('ok');
  });

  it('falls back when the inner promise never settles', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const p = withTimeout(never, 1000, () => 'fallback');
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBe('fallback');
    vi.useRealTimers();
  });

  it('propagates rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 50, () => 'late')).rejects.toThrow('x');
  });
});
