export type HudMode = 'top' | 'sides';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutPlan {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly hudMode: HudMode;
  readonly boardRect: Rect;
  readonly unitsPerPx: number;
}

// 箱（幅 10、高さ 13）の周りに左右 1、下 0.5、上 0.5 ユニットの余白を足した表示域。
export const BOARD_UNITS = { width: 12, height: 14, originX: -6, originY: -0.5 } as const;

const PORTRAIT_TOP_RATIO = 0.14;
const SQUARE_TOP_RATIO = 0.1;
const LANDSCAPE_SIDE_RATIO = 0.22;

function fitAspect(area: Rect, aspect: number): Rect {
  let width = area.width;
  let height = width / aspect;
  if (height > area.height) {
    height = area.height;
    width = height * aspect;
  }
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

export function planLayout(width: number, height: number): LayoutPlan {
  const ratio = height / width;
  let hudMode: HudMode;
  let area: Rect;
  if (ratio >= 1.2) {
    hudMode = 'top';
    const top = height * PORTRAIT_TOP_RATIO;
    area = { x: 0, y: top, width, height: height - top };
  } else if (width / height >= 1.2) {
    hudMode = 'sides';
    const side = width * LANDSCAPE_SIDE_RATIO;
    area = { x: side, y: 0, width: width - 2 * side, height };
  } else {
    hudMode = 'top';
    const top = height * SQUARE_TOP_RATIO;
    area = { x: 0, y: top, width, height: height - top };
  }
  const boardRect = fitAspect(area, BOARD_UNITS.width / BOARD_UNITS.height);
  return { viewport: { width, height }, hudMode, boardRect, unitsPerPx: BOARD_UNITS.width / boardRect.width };
}

export function shouldApplyResize(width: number, height: number): boolean {
  return width > 0 && height > 0;
}
