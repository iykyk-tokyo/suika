import type { HudMode } from '../app/LayoutPlanner';
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';
import type { Lang } from './i18n';
import { creatureName, t } from './i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

export class Hud {
  private readonly scoreValue = el('div', 'hud-value');
  private readonly bestValue = el('div', 'hud-value');
  private readonly nextChip = el('div', 'hud-chip');
  private readonly nextName = el('div', 'hud-chip-name');
  private readonly overlay = el('div', 'hud-overlay hidden');
  private readonly overScore = el('div', 'hud-over-score');
  private readonly playAgain = el('button', 'hud-button');
  private readonly panel = el('div', 'hud-panel');
  private readonly message = el('div', 'hud-message hidden');

  constructor(
    private readonly root: HTMLElement,
    private readonly lang: Lang,
  ) {
    const score = el('div', 'hud-stat');
    score.append(el('div', 'hud-label', t(lang, 'score')), this.scoreValue);
    const best = el('div', 'hud-stat');
    best.append(el('div', 'hud-label', t(lang, 'best')), this.bestValue);
    const next = el('div', 'hud-stat');
    const nextBox = el('div', 'hud-next');
    nextBox.append(this.nextChip, this.nextName);
    next.append(el('div', 'hud-label', t(lang, 'next')), nextBox);
    this.panel.append(score, best, next);

    const card = el('div', 'hud-card');
    this.playAgain.textContent = t(lang, 'playAgain');
    this.playAgain.type = 'button';
    card.append(el('div', 'hud-over-title', t(lang, 'gameOver')), this.overScore, this.playAgain);
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
  }

  setNext(tier: TierId): void {
    const def = tierDef(tier);
    this.nextChip.style.background = `#${def.baseColor.toString(16).padStart(6, '0')}`;
    this.nextChip.style.width = `${24 + tier * 6}px`;
    this.nextChip.style.height = `${24 + tier * 6}px`;
    this.nextName.textContent = creatureName(this.lang, tier);
  }

  showGameOver(score: number, best: number): void {
    this.overScore.textContent = `${t(this.lang, 'score')} ${score} / ${t(this.lang, 'best')} ${best}`;
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
