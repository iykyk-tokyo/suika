import type { PlayablesPort, StorageLike } from './PlayablesPort';

// 開発時（Playables 環境外）のみ使う。本番では YtgameAdapter が選ばれる。
export class LocalAdapter implements PlayablesPort {
  static readonly KEY = 'ocean-merge-save';
  readonly inPlayablesEnv = false;

  constructor(private readonly storage: StorageLike) {}

  firstFrameReady(): void {}
  gameReady(): void {}

  loadData(): Promise<string> {
    return Promise.resolve(this.storage.getItem(LocalAdapter.KEY) ?? '');
  }

  saveData(data: string): Promise<void> {
    this.storage.setItem(LocalAdapter.KEY, data);
    return Promise.resolve();
  }

  sendScore(_value: number): Promise<void> {
    return Promise.resolve();
  }

  isAudioEnabled(): boolean {
    return true;
  }

  onAudioEnabledChange(_cb: (enabled: boolean) => void): () => void {
    return () => {};
  }

  onPause(_cb: () => void): () => void {
    return () => {};
  }

  onResume(_cb: () => void): () => void {
    return () => {};
  }

  getLanguage(): Promise<string> {
    return Promise.resolve('ja');
  }

  logError(): void {}
  logWarning(): void {}
}
