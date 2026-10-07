import { describe, expect, it } from 'vitest';
import { creatureName, resolveLang, t } from './i18n';

describe('resolveLang', () => {
  it('maps ja-* to ja', () => {
    expect(resolveLang('ja')).toBe('ja');
    expect(resolveLang('ja-JP')).toBe('ja');
    expect(resolveLang('JA-jp')).toBe('ja');
  });
  it('falls back to en', () => {
    expect(resolveLang('en-US')).toBe('en');
    expect(resolveLang('es-419')).toBe('en');
    expect(resolveLang('')).toBe('en');
    expect(resolveLang(null)).toBe('en');
    expect(resolveLang('japanese')).toBe('en');
  });
});

describe('t', () => {
  it('returns Japanese and English strings', () => {
    expect(t('ja', 'playAgain')).toBe('もう一度');
    expect(t('en', 'playAgain')).toBe('Play again');
    expect(t('en', 'title')).toBe('Ocean Merge');
    expect(t('ja', 'title')).toBe('オーシャンマージ');
  });
  it('has every key in both languages', () => {
    const keys = ['title', 'score', 'best', 'next', 'gameOver', 'playAgain', 'webglUnsupported'] as const;
    for (const k of keys) {
      expect(t('ja', k).length).toBeGreaterThan(0);
      expect(t('en', k).length).toBeGreaterThan(0);
    }
  });
});

describe('creatureName', () => {
  it('uses the tier table', () => {
    expect(creatureName('ja', 10)).toBe('クジラ');
    expect(creatureName('en', 10)).toBe('Whale');
  });
});
