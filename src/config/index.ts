// Unified config re-exports.
// All named constants below are derived from GAME_CONFIG — edit values there, not here.

import { GAME_CONFIG } from './gameConfig'

export { GAME_CONFIG }

const C = GAME_CONFIG

// ── Grid ──────────────────────────────────────────────────────────────────────
export const COLS             = C.grid.cols
export const BASE_ROWS        = C.grid.rows
export const MIN_CLUSTER_SIZE = C.grid.minClusterSize
export const BET_AMOUNT       = C.economy.betAmount

// ── Symbols ───────────────────────────────────────────────────────────────────
export const SYMBOLS              = C.symbols.regular as unknown as string[]
export const WILD_SYMBOL          = C.symbols.wild
export const MEGA_WILD_SYMBOL     = C.symbols.megaWild
export const TRANSMUTATION_SYMBOL = C.symbols.transmutation
export const SYMBOL_WEIGHTS       = C.symbols.weights
export const SYMBOL_PAYOUTS       = C.symbols.payouts

export const MEGA_WILD_CHANCE_NORMAL     = C.symbols.spawnChances.normal.megaWild
export const MEGA_WILD_CHANCE_BONUS      = C.symbols.spawnChances.bonus.megaWild
export const TRANSMUTATION_CHANCE_NORMAL = C.symbols.spawnChances.normal.transmutation
export const TRANSMUTATION_CHANCE_BONUS  = C.symbols.spawnChances.bonus.transmutation

// ── Multipliers ───────────────────────────────────────────────────────────────
export const MULTIPLIER_VALUES        = C.multipliers.allValues
export const NORMAL_MULTIPLIER_VALUES = C.multipliers.normal.availableValues
export type  MultiplierValue          = typeof MULTIPLIER_VALUES[number]
export const MULTIPLIER_WEIGHTS       = C.multipliers.weights as Record<MultiplierValue, number>
export const NORMAL_MULTIPLIER_CHANCE = C.multipliers.normal.chance
export const BONUS_MULTIPLIER_CHANCE  = C.multipliers.bonus.chance
export const STICKY_MULTIPLIER_CAP     = C.multipliers.stickyCapDuringBonus
export const STICKY_MULTIPLIER_CHARGES = C.multipliers.stickyCharges

// ── Fruit Meter ───────────────────────────────────────────────────────────────
export const FRUIT_METER_MAX               = C.fruitMeter.normal.max
export const FRUIT_METER_BREAKPOINTS       = C.fruitMeter.normal.breakpoints
export const WILDS_PER_BREAKPOINT          = C.fruitMeter.normal.wildsPerBreakpoint
export const BONUS_FRUIT_METER_MAX         = C.fruitMeter.bonus.max
export const BONUS_FRUIT_METER_BREAKPOINTS = C.fruitMeter.bonus.breakpoints
export const BONUS_WILDS_PER_BREAKPOINT    = C.fruitMeter.bonus.wildsPerBreakpoint

// ── Audio ─────────────────────────────────────────────────────────────────────
export * from './audio'
