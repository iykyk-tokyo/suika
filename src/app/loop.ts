export const FIXED_STEP_SEC = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export function advanceAccumulator(
  accumulatorSec: number,
  dtSec: number,
  step: number = FIXED_STEP_SEC,
  maxSteps: number = MAX_STEPS_PER_FRAME,
): { steps: number; accumulatorSec: number } {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return { steps: 0, accumulatorSec };
  let acc = accumulatorSec + dtSec;
  let steps = 0;
  while (acc >= step && steps < maxSteps) {
    acc -= step;
    steps++;
  }
  if (steps === maxSteps) acc = 0;
  return { steps, accumulatorSec: acc };
}
