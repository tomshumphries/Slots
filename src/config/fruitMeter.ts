// Fruit Meter System (Tome of Madness style)
// Meter fills as clusters are matched. Breakpoints spawn wild symbols.

// ========== NORMAL PLAY ==========
// Full meter triggers bonus mode
export const FRUIT_METER_MAX = 40
export const FRUIT_METER_BREAKPOINTS = [10, 20, 30, 40] // Meter values that trigger wild symbol spawns
export const WILDS_PER_BREAKPOINT = [2, 3, 4, 0] // Wilds spawned at each breakpoint (9 total before bonus)

// ========== BONUS MODE ==========
// Meter accumulates across all free spins in the round; filling awards +2 extra spins then resets
export const BONUS_FRUIT_METER_MAX = 50
export const BONUS_FRUIT_METER_BREAKPOINTS = [12, 25, 38, 50] // Breakpoints for wild spawns / +2 spins
export const BONUS_WILDS_PER_BREAKPOINT = [2, 3, 4, 0] // Wilds spawned at each breakpoint (9 total before +2 spins)
