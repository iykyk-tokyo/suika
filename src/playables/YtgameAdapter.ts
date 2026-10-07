import type { PlayablesPort } from './PlayablesPort';

export class YtgameAdapter implements PlayablesPort {
  readonly inPlayablesEnv = true;

  firstFrameReady(): void {
    ytgame.game.firstFrameReady();
  }

  gameReady(): void {
    ytgame.game.gameReady();
  }

  loadData(): Promise<string> {
    return ytgame.game.loadData();
  }

  saveData(data: string): Promise<void> {
    return ytgame.game.saveData(data);
  }

  sendScore(value: number): Promise<void> {
    return ytgame.engagement.sendScore({ value: Math.floor(value) });
  }

  isAudioEnabled(): boolean {
    return ytgame.system.isAudioEnabled();
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    return ytgame.system.onAudioEnabledChange(cb);
  }

  onPause(cb: () => void): () => void {
    return ytgame.system.onPause(cb);
  }

  onResume(cb: () => void): () => void {
    return ytgame.system.onResume(cb);
  }

  getLanguage(): Promise<string> {
    return ytgame.system.getLanguage();
  }

  logError(): void {
    ytgame.health.logError();
  }

  logWarning(): void {
    ytgame.health.logWarning();
  }
}
