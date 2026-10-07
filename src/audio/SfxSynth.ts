import type { TierId } from '../core/types';

// 効果音は全て Web Audio で合成する。マスターゲインは YouTube のミュート状態に直結し、
// ゲーム内に音量 UI は置かない（Playables の MUST / SHOULD NOT）。
export type AudioContextLike = Pick<
  AudioContext,
  | 'state'
  | 'sampleRate'
  | 'currentTime'
  | 'destination'
  | 'resume'
  | 'suspend'
  | 'createGain'
  | 'createOscillator'
  | 'createBuffer'
  | 'createBufferSource'
  | 'createBiquadFilter'
>;

function defaultContextFactory(): AudioContextLike | null {
  return typeof AudioContext === 'undefined' ? null : new AudioContext();
}

export class SfxSynth {
  private ctx: AudioContextLike | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  constructor(private readonly createContext: () => AudioContextLike | null = defaultContextFactory) {}

  private ensure(): { ctx: AudioContextLike; master: GainNode } | null {
    if (this.ctx !== null && this.master !== null) return { ctx: this.ctx, master: this.master };
    const ctx = this.createContext();
    if (ctx === null) return null;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 1 : 0;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return { ctx, master };
  }

  // ミュートはマスターゲインで表現する。有効化時に AudioContext が止まっていれば再開する
  // （ポーズ中にミュート → 再開 → ミュート解除、で無音のままになるのを防ぐ）。
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master !== null) this.master.gain.value = enabled ? 1 : 0;
    if (enabled) this.resume();
  }

  // 最初のユーザー操作で呼ぶ。自動再生制限で suspended のときに再開する。
  unlock(): void {
    if (this.ensure() !== null) this.resume();
  }

  suspend(): void {
    if (this.ctx !== null && this.ctx.state === 'running') void this.ctx.suspend();
  }

  // ミュート中でも再開する（出力はゲイン 0 で抑えている）。iOS の 'interrupted' も対象。
  resume(): void {
    if (this.ctx !== null && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
  }

  playDrop(): void {
    const a = this.ensure();
    if (a === null) return;
    const { ctx, master } = a;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  playMerge(tier: TierId): void {
    const a = this.ensure();
    if (a === null) return;
    const { ctx, master } = a;
    const base = 330 * Math.pow(1.12, tier);
    const now = ctx.currentTime;
    const ratios = [1, 1.25, 1.5] as const;
    [0, 0.06, 0.12].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * (ratios[i] ?? 1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);
      osc.connect(gain).connect(master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
  }

  playGameOver(): void {
    const a = this.ensure();
    if (a === null) return;
    const { ctx, master } = a;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 1.0);
  }
}
