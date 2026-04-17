// Symbol definitions and payouts

// Regular symbols (ordered common to rare)
export const SYMBOLS = ['🍒', '🍀', '🍇', '🔔', '💎']

// Wild symbol - acts as a wildcard only (no multiplier value)
export const WILD_SYMBOL = '⭐'

// Mega Wild symbol - consumes ALL matching symbols on the grid when it forms a cluster
// Very rare, creates massive wins and cascade potential
export const MEGA_WILD_SYMBOL = '🔮'

// Mega Wild spawn chances (percentage)
export const MEGA_WILD_CHANCE_NORMAL = 0.001  // 0.1% in normal play
export const MEGA_WILD_CHANCE_BONUS = 0.005   // 0.5% in bonus mode

// Symbol weights (higher = more common)
// Total = 100, so percentages
export const SYMBOL_WEIGHTS: Record<string, number> = {
  '🍒': 30,  // 30% - most common
  '🍀': 25,  // 25%
  '🍇': 22,  // 22%
  '🔔': 15,  // 15%
  '💎': 8,   // 8% - rarest
}

// Base payout per cluster (not per symbol) - multiply by bet
// These are for minimum cluster size (7), larger clusters get bonuses
// Rarer symbols pay significantly more to reward lucky hits
export const SYMBOL_PAYOUTS: Record<string, number> = {
  '🍒': 0.265,  // cherries (most common)
  '🍀': 0.425,  // clovers
  '🍇': 0.64,   // grapes
  '🔔': 1.07,   // bells (uncommon)
  '💎': 2.65,   // diamonds (rare)
}
