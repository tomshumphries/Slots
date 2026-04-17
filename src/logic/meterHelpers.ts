// Fruit meter helper functions

import { FRUIT_METER_BREAKPOINTS } from '../config'

// Check which breakpoints have been passed given a meter value
// Returns array of breakpoint indices that were newly passed
export function getNewBreakpointIndices(
  currentMeter: number,
  previousMeter: number,
  breakpoints: number[] = FRUIT_METER_BREAKPOINTS
): number[] {
  const indices: number[] = []
  for (let i = 0; i < breakpoints.length; i++) {
    const breakpoint = breakpoints[i]
    if (currentMeter >= breakpoint && previousMeter < breakpoint) {
      indices.push(i)
    }
  }
  return indices
}
