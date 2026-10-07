import { createEmptySave, parseSave, serializeSave } from '../core/save';
import type { SaveData } from '../core/save';

export interface SavePort {
  saveData(data: string): Promise<void>;
  sendScore(value: number): Promise<void>;
  logError(): void;
  logWarning(): void;
}

// String.prototype.isWellFormed は iOS 16.4 未満に無いので、無い環境では検査を省く。
function isWellFormedString(s: string): boolean {
  return typeof s.isWellFormed === 'function' ? s.isWellFormed() : true;
}

/**
 * loadData / saveData / sendScore の順序を守る。
 * - loadData が完了する前に saveData を呼ばない（MUST）。タイムアウトで先に開始した場合、
 *   保存は保留し、本物のデータが届いたら onLateLoad で知らせてから最新の保留分だけ保存する。
 * - sendScore は saveData 完了後にのみ送り、値はセーブ内 bestScore と一致させる（MUST）。
 */
export class SaveCoordinator {
  private loadSettled = false;
  private pendingSave: SaveData | null = null;
  private pendingScore: number | null = null;
  private sending = false;
  private lateCb: ((late: SaveData) => void) | null = null;

  constructor(
    private readonly port: SavePort,
    private readonly loadData: Promise<string>,
    private readonly timeoutMs: number,
  ) {}

  onLateLoad(cb: (late: SaveData) => void): void {
    this.lateCb = cb;
  }

  initial(): Promise<SaveData> {
    return new Promise<SaveData>((resolve) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        this.port.logWarning();
        resolve(createEmptySave());
      }, this.timeoutMs);

      this.loadData.then(
        (raw) => {
          clearTimeout(timer);
          const parsed = raw === '' ? createEmptySave() : parseSave(raw);
          if (parsed === null) this.port.logError();
          const data = parsed ?? createEmptySave();
          if (timedOut) {
            if (parsed !== null && this.lateCb !== null) this.lateCb(parsed);
          } else {
            resolve(data);
          }
          this.settleLoad();
        },
        () => {
          clearTimeout(timer);
          this.port.logError();
          if (!timedOut) resolve(createEmptySave());
          this.settleLoad();
        },
      );
    });
  }

  save(data: SaveData): void {
    if (!this.loadSettled) {
      this.pendingSave = data;
      return;
    }
    this.doSave(data);
  }

  submitBest(best: number): void {
    this.pendingScore = best;
  }

  private settleLoad(): void {
    this.loadSettled = true;
    if (this.pendingSave !== null) {
      const data = this.pendingSave;
      this.pendingSave = null;
      this.doSave(data);
    }
  }

  private doSave(data: SaveData): void {
    const str = serializeSave(data);
    if (!isWellFormedString(str)) {
      this.port.logError();
      return;
    }
    this.port.saveData(str).then(
      () => this.flushScore(),
      () => this.port.logError(),
    );
  }

  private flushScore(): void {
    if (this.pendingScore === null || this.sending) return;
    const value = this.pendingScore;
    this.pendingScore = null;
    this.sending = true;
    this.port.sendScore(value).then(
      () => {
        this.sending = false;
      },
      () => {
        this.sending = false;
        this.port.logWarning();
        if (this.pendingScore === null) this.pendingScore = value;
      },
    );
  }
}
