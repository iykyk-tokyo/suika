export interface FrameHost {
  requestFrame(cb: (now: number) => void): number;
  cancelFrame(id: number): void;
}

export interface Pausable {
  pause(): void;
  resume(): void;
}

export interface AudioLifecycle {
  suspend(): void;
  resume(): void;
}

/**
 * Playables の onPause / onResume とゲームループを結ぶ。
 * - onPause で rAF を止め、音を止め、ゲームを一時停止する（MUST）。
 * - 読み込み中に pause が来た場合、準備完了時にループを始めず、resume を待つ。
 * - 再開直後のフレームは dt = 0 にして、停止時間ぶんの物理が一気に進まないようにする。
 */
export class AppLifecycle {
  private paused = false;
  private game: Pausable | null = null;
  private frameId: number | null = null;
  private lastTime: number | null = null;
  private generation = 0;

  constructor(
    private readonly host: FrameHost,
    private readonly audio: AudioLifecycle,
    private readonly onFrame: (dtSec: number) => void,
  ) {}

  start(game: Pausable): void {
    this.game = game;
    if (this.paused) {
      game.pause();
      return;
    }
    this.schedule();
  }

  pause(): void {
    this.paused = true;
    this.game?.pause();
    this.audio.suspend();
    this.generation++;
    if (this.frameId !== null) {
      this.host.cancelFrame(this.frameId);
      this.frameId = null;
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.game?.resume();
    this.audio.resume();
    this.lastTime = null;
    if (this.game !== null && this.frameId === null) this.schedule();
  }

  private schedule(): void {
    const gen = this.generation;
    this.frameId = this.host.requestFrame((now) => {
      if (gen !== this.generation) return;
      this.frameId = null;
      this.schedule();
      const dt = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.onFrame(dt);
    });
  }
}
