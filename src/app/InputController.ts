export type GameInput =
  | { readonly type: 'aim'; readonly clientX: number; readonly clientY: number }
  | { readonly type: 'drop' }
  | { readonly type: 'nudge'; readonly direction: -1 | 1 }
  | { readonly type: 'restart' };

export interface PointerLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly button?: number;
}

export function mapKeyEvent(key: string, repeat: boolean): GameInput | null {
  switch (key) {
    case 'ArrowLeft':
      return { type: 'nudge', direction: -1 };
    case 'ArrowRight':
      return { type: 'nudge', direction: 1 };
    case ' ':
    case 'ArrowDown':
      return repeat ? null : { type: 'drop' };
    case 'Enter':
      return repeat ? null : { type: 'restart' };
    default:
      return null;
  }
}

export function mapPointerDown(e: PointerLike): GameInput | null {
  if (e.button !== undefined && e.button !== 0) return null;
  return { type: 'aim', clientX: e.clientX, clientY: e.clientY };
}

// マウスはホバーでも狙い、タッチは押下中だけ move が来るので区別は不要。
export function mapPointerMove(e: PointerLike, _pressed: boolean): GameInput | null {
  return { type: 'aim', clientX: e.clientX, clientY: e.clientY };
}

export function mapPointerUp(e: PointerLike, pressed: boolean): readonly GameInput[] {
  if (!pressed) return [];
  return [{ type: 'aim', clientX: e.clientX, clientY: e.clientY }, { type: 'drop' }];
}

// Esc には何も割り当てず、preventDefault も呼ばない（Playables の MUST NOT）。
export class InputController {
  private pressed = false;
  private interacted = false;
  private readonly abort = new AbortController();

  constructor(
    target: HTMLElement,
    private readonly onInput: (input: GameInput) => void,
    private readonly onFirstInteraction: () => void,
  ) {
    const { signal } = this.abort;
    target.addEventListener(
      'pointerdown',
      (e) => {
        this.markInteracted();
        const input = mapPointerDown(e);
        if (input === null) return;
        this.pressed = true;
        target.setPointerCapture(e.pointerId);
        this.onInput(input);
      },
      { signal },
    );
    target.addEventListener(
      'pointermove',
      (e) => {
        const input = mapPointerMove(e, this.pressed);
        if (input !== null) this.onInput(input);
      },
      { signal },
    );
    const release = (e: PointerEvent): void => {
      const inputs = mapPointerUp(e, this.pressed);
      this.pressed = false;
      for (const i of inputs) this.onInput(i);
    };
    target.addEventListener('pointerup', release, { signal });
    target.addEventListener(
      'pointercancel',
      () => {
        this.pressed = false;
      },
      { signal },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        const input = mapKeyEvent(e.key, e.repeat);
        if (input === null) return;
        this.markInteracted();
        if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
        this.onInput(input);
      },
      { signal },
    );
  }

  private markInteracted(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onFirstInteraction();
  }

  dispose(): void {
    this.abort.abort();
  }
}
