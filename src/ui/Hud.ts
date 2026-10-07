import type { HudMode } from '../app/LayoutPlanner';
import type { TierId } from '../core/types';
import type { ScreenRect } from '../render/NextPreview';
import type { Lang } from './i18n';
import { creatureName, t } from './i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

export class Hud {
  private readonly scoreValue = el('div', 'hud-score');
  private readonly bestValue = el('span', 'hud-best-value');
  private readonly nextBubble = el('div', 'hud-bubble');
  private readonly nextName = el('div', 'hud-next-name');
  private readonly overlay = el('div', 'hud-overlay hidden');
  private readonly overScore = el('div', 'hud-over-score');
  private readonly overBest = el('div', 'hud-over-best');
  private readonly playAgain = el('button', 'hud-button');
  private readonly panel = el('div', 'hud-panel');
  private readonly message = el('div', 'hud-message hidden');
  private shownScore = -1;

  constructor(
    private readonly root: HTMLElement,
    private readonly lang: Lang,
  ) {
    const scoreBox = el('div', 'hud-scorebox');
    const best = el('div', 'hud-best', `${t(lang, 'best')} `);
    best.append(this.bestValue);
    scoreBox.append(el('div', 'hud-label', t(lang, 'score')), this.scoreValue, best);

    const nextBox = el('div', 'hud-nextbox');
    const nextText = el('div', 'hud-next-text');
    nextText.append(el('div', 'hud-label', t(lang, 'next')), this.nextName);
    nextBox.append(this.nextBubble, nextText);
    this.panel.append(scoreBox, nextBox);

    const card = el('div', 'hud-card');
    card.setAttribute('role', 'dialog');
    this.playAgain.textContent = t(lang, 'playAgain');
    this.playAgain.type = 'button';
    card.append(el('div', 'hud-over-title', t(lang, 'gameOver')), this.overScore, this.overBest, this.playAgain);
    this.overlay.append(card);

    this.message.textContent = t(lang, 'webglUnsupported');
    this.root.append(this.panel, this.overlay, this.message);
    this.setMode('top');
  }

  setMode(mode: HudMode): void {
    this.root.dataset['mode'] = mode;
  }

  setScore(score: number, best: number): void {
    this.scoreValue.textContent = String(score);
    this.bestValue.textContent = String(best);
    // 加点した瞬間だけ数字をぽよんと弾ませる。
    if (this.shownScore >= 0 && score > this.shownScore) {
      this.scoreValue.classList.remove('bump');
      void this.scoreValue.offsetWidth;
      this.scoreValue.classList.add('bump');
    }
    this.shownScore = score;
  }

  setNext(tier: TierId): void {
    this.nextName.textContent = creatureName(this.lang, tier);
  }

  // 3D プレビューを描く画面上の矩形（CSS ピクセル）。
  nextPreviewRect(): ScreenRect | null {
    if (this.panel.classList.contains('hidden')) return null;
    const r = this.nextBubble.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  showGameOver(score: number, best: number): void {
    this.overScore.textContent = String(score);
    this.overBest.textContent = `${t(this.lang, 'best')} ${best}`;
    this.overlay.classList.remove('hidden');
    this.playAgain.focus();
  }

  hideGameOver(): void {
    this.overlay.classList.add('hidden');
  }

  onPlayAgain(cb: () => void): void {
    this.playAgain.addEventListener('click', cb);
  }

  showWebglUnsupported(): void {
    this.panel.classList.add('hidden');
    this.message.classList.remove('hidden');
  }
}
