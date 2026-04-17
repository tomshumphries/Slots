// Multiplier symbol definitions and weights

export const MULTIPLIER_VALUES = [2, 3, 5, 10, 20] as const
export const NORMAL_MULTIPLIER_VALUES = [2, 3, 5, 10] as const // 20x reserved for bonus only

export type MultiplierValue = typeof MULTIPLIER_VALUES[number]

// Base multiplier weights (lower = rarer) - heavily weighted toward lower values
export const MULTIPLIER_WEIGHTS: Record<MultiplierValue, number> = {
  2: 2.5,    // ~70% of multipliers are 2x
  3: 0.6,    // ~17% are 3x
  5: 0.3,    // ~8% are 5x
  10: 0.12,  // ~3% are 10x
  20: 0.04,  // ~1% are 20x - extremely rare, bonus only
}

// Normal play: ~0.5% total multiplier chance (similar to bonus symbol frequency)
export const NORMAL_MULTIPLIER_CHANCE = 0.005

// Bonus mode: multipliers appear 1.2x as frequently (subtle increase)
export const BONUS_MULTIPLIER_FREQUENCY = 1.2
