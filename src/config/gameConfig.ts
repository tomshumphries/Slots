// Single source of truth for all gameplay configuration.
// Every constant that affects game balance, behaviour, or player-facing text lives here.
// UI and logic both read from this object — change a value once and it propagates everywhere.

export const GAME_CONFIG = {

  grid: {
    cols: 12,
    rows: 5,
    minClusterSize: 7,
  },

  economy: {
    betAmount: 1,        // £ per spin
    depositAmount: 5,    // £ credited per deposit button press
    bigWinThreshold: 20, // £ floor that triggers the big win celebration screen
  },

  symbols: {
    regular: ['🍒', '🍀', '🍇', '🔔', '💎'] as const,
    wild:          '⭐',
    megaWild:      '🔮',
    transmutation: '🌀',

    // Relative spawn frequency — values sum to 100 so they read directly as percentages
    weights: {
      '🍒': 30,
      '🍀': 25,
      '🍇': 22,
      '🔔': 15,
      '💎':  8,
    } as Record<string, number>,

    // Base payout per winning cluster (multiplied by betAmount).
    // Applies to a minimum-size cluster; larger clusters receive an additional size multiplier.
    payouts: {
      '🍒': 0.250,
      '🍀': 0.400,
      '🍇': 0.610,
      '🔔': 1.550,
      '💎': 5.000,
    } as Record<string, number>,

    // Fallback payout used when a symbol has no entry in the payouts table
    defaultPayout: 0.5,

    // Per-cell spawn probabilities for special symbols
    spawnChances: {
      normal: {
        megaWild:      0.001,  // 0.1%
        transmutation: 0.0008, // 0.08%
      },
      bonus: {
        megaWild:      0.005,  // 0.5%
        transmutation: 0.004,  // 0.4%
      },
    },
  },

  // Ordered largest-first — first matching tier wins.
  // Bottom tier's minSize must equal grid.minClusterSize.
  clusters: {
    sizeTiers: [
      { minSize: 25, multiplier: 12.0 },
      { minSize: 20, multiplier:  8.0 },
      { minSize: 15, multiplier:  5.0 },
      { minSize: 12, multiplier:  3.0 },
      { minSize: 10, multiplier:  2.0 },
      { minSize:  8, multiplier:  1.4 },
      { minSize:  7, multiplier:  1.0 },
    ],
  },

  multipliers: {
    allValues: [2, 3, 5, 10, 20] as const,

    // Relative spawn weights (not direct probabilities — used proportionally within the chance roll)
    weights: { 2: 2.5, 3: 0.6, 5: 0.3, 10: 0.12, 20: 0.04 } as Record<number, number>,

    normal: {
      chance: 0.005,                           // ~0.5% per cell
      availableValues: [2, 3, 5, 10] as const, // 20x reserved for bonus only
    },
    bonus: {
      chance: 0.018,                                // ~1.8% per cell
      availableValues: [2, 3, 5, 10, 20] as const,
    },

    stickyCapDuringBonus: 8,  // maximum grid positions that can accumulate sticky multipliers
    stickyCharges: 3,          // how many times a sticky multiplier fires before breaking
  },

  fruitMeter: {
    normal: {
      max: 40,
      breakpoints:        [10, 20, 30, 40],
      wildsPerBreakpoint: [ 2,  3,  4,  0], // 0 on the final breakpoint = bonus trigger, not wilds
    },
    bonus: {
      max: 50,
      breakpoints:        [12, 25, 38, 50],
      wildsPerBreakpoint: [ 2,  3,  4,  0],
      extraSpinsOnFill: 2, // free spins added when the bonus meter is filled
    },
  },

  bonusRound: {
    freeSpins: 10,
    finalePreseededWilds: 5, // wilds placed on the grid before the final spin begins
  },

  simulation: {
    targetRtpPercent: 95,
    rtpHealthyRange: { min: 92, max: 98 },
    defaults: {
      normalSpins: 10_000,
      bonusRounds: 1_000,
      timeLimitSeconds: 30,
    },
    maxNormalSpins: 10_000_000,
  },
}
