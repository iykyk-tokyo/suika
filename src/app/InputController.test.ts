import { describe, expect, it } from 'vitest';
import { mapKeyEvent, mapPointerDown, mapPointerMove, mapPointerUp } from './InputController';

describe('mapKeyEvent', () => {
  it('maps arrows to nudges and allows repeat for movement', () => {
    expect(mapKeyEvent('ArrowLeft', false)).toEqual({ type: 'nudge', direction: -1 });
    expect(mapKeyEvent('ArrowRight', true)).toEqual({ type: 'nudge', direction: 1 });
  });

  it('maps Space and ArrowDown to drop but ignores key auto-repeat', () => {
    expect(mapKeyEvent(' ', false)).toEqual({ type: 'drop' });
    expect(mapKeyEvent('ArrowDown', false)).toEqual({ type: 'drop' });
    expect(mapKeyEvent(' ', true)).toBeNull();
    expect(mapKeyEvent('ArrowDown', true)).toBeNull();
  });

  it('maps Enter to restart and ignores Escape and others', () => {
    expect(mapKeyEvent('Enter', false)).toEqual({ type: 'restart' });
    expect(mapKeyEvent('Escape', false)).toBeNull();
    expect(mapKeyEvent('a', false)).toBeNull();
  });
});

describe('pointer mapping', () => {
  it('pointerdown with the primary button aims', () => {
    expect(mapPointerDown({ clientX: 10, clientY: 20, button: 0 })).toEqual({ type: 'aim', clientX: 10, clientY: 20 });
    expect(mapPointerDown({ clientX: 10, clientY: 20, button: 2 })).toBeNull();
  });

  it('pointermove aims while pressed or for hover (mouse)', () => {
    expect(mapPointerMove({ clientX: 1, clientY: 2 }, true)).toEqual({ type: 'aim', clientX: 1, clientY: 2 });
    expect(mapPointerMove({ clientX: 1, clientY: 2 }, false)).toEqual({ type: 'aim', clientX: 1, clientY: 2 });
  });

  it('pointerup after a press aims to the release point then drops', () => {
    expect(mapPointerUp({ clientX: 5, clientY: 6 }, true)).toEqual([{ type: 'aim', clientX: 5, clientY: 6 }, { type: 'drop' }]);
  });

  it('pointerup without a press does nothing', () => {
    expect(mapPointerUp({ clientX: 5, clientY: 6 }, false)).toEqual([]);
  });
});
