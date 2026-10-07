import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';

export type Lang = 'ja' | 'en';

export type MessageKey = 'title' | 'score' | 'best' | 'next' | 'gameOver' | 'playAgain' | 'webglUnsupported';

const MESSAGES: Readonly<Record<Lang, Readonly<Record<MessageKey, string>>>> = {
  ja: {
    title: 'オーシャンマージ',
    score: 'スコア',
    best: 'ベスト',
    next: 'つぎ',
    gameOver: 'ゲームオーバー',
    playAgain: 'もう一度',
    webglUnsupported: 'この端末では WebGL が使えないため、ゲームを表示できません。',
  },
  en: {
    title: 'Ocean Merge',
    score: 'Score',
    best: 'Best',
    next: 'Next',
    gameOver: 'Game Over',
    playAgain: 'Play again',
    webglUnsupported: 'WebGL is not available on this device, so the game cannot be displayed.',
  },
};

export function resolveLang(tag: string | null): Lang {
  if (tag === null) return 'en';
  const lower = tag.toLowerCase();
  return lower === 'ja' || lower.startsWith('ja-') ? 'ja' : 'en';
}

export function t(lang: Lang, key: MessageKey): string {
  return MESSAGES[lang][key];
}

export function creatureName(lang: Lang, tier: TierId): string {
  const def = tierDef(tier);
  return lang === 'ja' ? def.nameJa : def.nameEn;
}
