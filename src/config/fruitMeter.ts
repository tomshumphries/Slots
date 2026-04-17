// Fruit Meter System (Tome of Madness style)
// Meter fills as clusters are matched. Breakpoints spawn wild symbols.

// ========== NORMAL PLAY ==========
// Full meter triggers bonus mode
export const FRUIT_METER_MAX = 60
export const FRUIT_METER_BREAKPOINTS = [15, 30, 45, 60] // Meter values that trigger wild symbol spawns
export const WILDS_PER_BREAKPOINT = [2, 3, 4, 0] // Wilds spawned at each breakpoint (9 total before bonus)

// ========== BONUS MODE ==========
// Larger meter with different breakpoints, meter is consumed at breakpoints
export const BONUS_FRUIT_METER_MAX = 100
export const BONUS_FRUIT_METER_BREAKPOINTS = [25, 50, 75, 100] // Breakpoints for +5 spins reward
export const BONUS_WILDS_PER_BREAKPOINT = [2, 3, 4, 0] // Wilds spawned at each breakpoint (9 total before +5 spins)
