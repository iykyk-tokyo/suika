import { describe, expect, it, vi } from 'vitest';
import { SfxSynth } from './SfxSynth';
import type { AudioContextLike } from './SfxSynth';

function fakeContext(): AudioContextLike & { resume: ReturnType<typeof vi.fn>; suspend: ReturnType<typeof vi.fn>; gain: { value: number } } {
  const gain = { value: 1 };
  const ctx = {
    state: 'suspended' as AudioContextState,
    sampleRate: 48000,
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    gain,
    resume: vi.fn(() => {
      ctx.state = 'running';
      return Promise.resolve();
    }),
    suspend: vi.fn(() => {
      ctx.state = 'suspended';
      return Promise.resolve();
    }),
    createGain: () => ({ gain, connect: () => undefined }) as unknown as GainNode,
    createOscillator: () => ({}) as OscillatorNode,
    createBuffer: () => ({}) as AudioBuffer,
    createBufferSource: () => ({}) as AudioBufferSourceNode,
    createBiquadFilter: () => ({}) as BiquadFilterNode,
  };
  return ctx;
}

describe('SfxSynth audio enable/pause interplay', () => {
  it('re-enabling audio resumes a suspended context (pause → mute → resume → unmute)', () => {
    const ctx = fakeContext();
    const sfx = new SfxSynth(() => ctx);
    sfx.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    sfx.suspend();
    sfx.setEnabled(false);
    sfx.resume();
    expect(ctx.state).toBe('running');
    sfx.setEnabled(true);
    expect(ctx.gain.value).toBe(1);
    expect(ctx.state).toBe('running');
  });

  it('resume() restarts the context even while muted, keeping gain at 0', () => {
    const ctx = fakeContext();
    const sfx = new SfxSynth(() => ctx);
    sfx.unlock();
    sfx.setEnabled(false);
    sfx.suspend();
    sfx.resume();
    expect(ctx.state).toBe('running');
    expect(ctx.gain.value).toBe(0);
    sfx.setEnabled(true);
    expect(ctx.gain.value).toBe(1);
  });

  it('setEnabled(true) resumes a context left suspended', () => {
    const ctx = fakeContext();
    const sfx = new SfxSynth(() => ctx);
    sfx.unlock();
    sfx.suspend();
    sfx.setEnabled(true);
    expect(ctx.state).toBe('running');
  });

  it('works without any AudioContext', () => {
    const sfx = new SfxSynth(() => null);
    expect(() => {
      sfx.unlock();
      sfx.setEnabled(true);
      sfx.playDrop();
      sfx.playMerge(3);
      sfx.playGameOver();
      sfx.suspend();
      sfx.resume();
    }).not.toThrow();
  });
});
