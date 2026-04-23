// Symbol generation functions

import {
  SYMBOLS,
  SYMBOL_WEIGHTS,
  MULTIPLIER_VALUES,
  NORMAL_MULTIPLIER_VALUES,
  MULTIPLIER_WEIGHTS,
  NORMAL_MULTIPLIER_CHANCE,
  BONUS_MULTIPLIER_CHANCE,
  MEGA_WILD_SYMBOL,
  MEGA_WILD_CHANCE_NORMAL,
  TRANSMUTATION_SYMBOL,
  TRANSMUTATION_CHANCE_NORMAL,
  TRANSMUTATION_CHANCE_BONUS,
} from '../config'

// Generate a weighted random symbol (normal play - includes multipliers except 20x)
export function randomSymbol(inCascade: boolean = false): string {
  // Mega Wild chance first (very rare - 0.1% in normal play)
  // Only spawns on initial grid generation, not during cascades
  if (!inCascade && Math.random() < MEGA_WILD_CHANCE_NORMAL) {
    return MEGA_WILD_SYMBOL
  }

  // Transmutation Wild chance (0.08% in normal play - slightly rarer than Mega Wild)
  if (!inCascade && Math.random() < TRANSMUTATION_CHANCE_NORMAL) {
    return TRANSMUTATION_SYMBOL
  }

  // Multiplier chance in normal play (~0.5% total)
  // Excludes 20x which is reserved for bonus mode
  if (!inCascade && Math.random() < NORMAL_MULTIPLIER_CHANCE) {
    // Select multiplier based on relative weights (excluding 20x)
    const normalWeights = NORMAL_MULTIPLIER_VALUES.map(v => MULTIPLIER_WEIGHTS[v])
    const totalMultWeight = normalWeights.reduce((a, b) => a + b, 0)
    let multRandom = Math.random() * totalMultWeight

    for (let i = 0; i < NORMAL_MULTIPLIER_VALUES.length; i++) {
      multRandom -= normalWeights[i]
      if (multRandom <= 0) {
        return `${NORMAL_MULTIPLIER_VALUES[i]}x`
      }
    }
    return `${NORMAL_MULTIPLIER_VALUES[0]}x` // Fallback to 2x
  }

  // Weighted random selection for regular symbols
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0)
  let random = Math.random() * totalWeight

  for (const symbol of SYMBOLS) {
    random -= SYMBOL_WEIGHTS[symbol]
    if (random <= 0) {
      return symbol
    }
  }

  return SYMBOLS[0] // Fallback
}

// Generate symbol for bonus mode (includes multipliers at higher frequency, including 20x)
export function randomBonusSymbol(): string {
  // Mega Wild chance - same as normal play (0.1%)
  if (Math.random() < MEGA_WILD_CHANCE_NORMAL) {
    return MEGA_WILD_SYMBOL
  }

  // Transmutation Wild chance (0.4% in bonus mode)
  if (Math.random() < TRANSMUTATION_CHANCE_BONUS) {
    return TRANSMUTATION_SYMBOL
  }

  // Multiplier chance in bonus play (~1.5% per cell — 3× normal rate, includes 20x)
  if (Math.random() < BONUS_MULTIPLIER_CHANCE) {
    const totalMultWeight = MULTIPLIER_VALUES.reduce((sum, v) => sum + MULTIPLIER_WEIGHTS[v], 0)
    let multRandom = Math.random() * totalMultWeight
    for (const value of MULTIPLIER_VALUES) {
      multRandom -= MULTIPLIER_WEIGHTS[value]
      if (multRandom <= 0) return `${value}x`
    }
    return '2x'
  }

  // Regular symbol
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0)
  let random = Math.random() * totalWeight

  for (const symbol of SYMBOLS) {
    random -= SYMBOL_WEIGHTS[symbol]
    if (random <= 0) {
      return symbol
    }
  }

  return SYMBOLS[0]
}
