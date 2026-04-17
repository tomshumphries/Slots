// Types for the Monte Carlo simulation system

export type RunMode = 'count' | 'time'

export interface SimConfig {
  label: string
  runMode: RunMode
  normalSpins: number     // used when runMode === 'count'
  bonusSpins: number      // used when runMode === 'count'
  timeLimitSecs: number   // used when runMode === 'time', split 50/50 between batches
}

export interface SimProgress {
  phase: 'normal' | 'bonus'
  done: number
  total: number           // estimated final count (time mode) or configured count (count mode)
  currentMean: number
  pBonus: number
  elapsedMs: number
  spinsPerSec: number
  etaMs: number
  timeLimitMs: number     // 0 = count mode; >0 = time mode (used for progress % in time mode)
}

// Chart-sampled series point (~300 max regardless of run size)
export interface SpinRecord {
  i: number
  runningMean: number
}

export interface BonusRecord {
  i: number
  runningMean: number
}

// ── Aggregated stats ──────────────────────────────────────────────────────────

export interface WinBuckets {
  zero: number      // win == 0
  micro: number     // 0 < win <= 0.5
  small: number     // 0.5 < win <= 1
  medium: number    // 1 < win <= 2
  large: number     // 2 < win <= 5
  big: number       // 5 < win <= 20
  huge: number      // win > 20
}

export interface AggSymbolStats {
  symbol: string
  clusters: number
  payout: number
  cells: number
  avgClusterSize: number
  payoutPct: number   // % of total payout
}

export interface AggMultiplierStats {
  value: string         // "2x", "3x" etc.
  count: number
  totalPayout: number
  contribution: number  // extra £ vs no multiplier
}

export interface MeterBPRate {
  label: string         // e.g. "Reach 15"
  hits: number
  rate: number          // 0-1
}

export interface ChainEntry {
  chains: number
  count: number
  pct: number
}

export interface RowUnlockEntry {
  rows: number          // 0-3
  count: number
  pct: number
  avgWin: number
}

export interface NormalAggregates {
  totalSpins: number
  winDist: WinBuckets
  symbolStats: AggSymbolStats[]
  multiplierStats: AggMultiplierStats[]
  megaWildCount: number
  megaWildPayout: number
  megaWildPayoutPct: number
  totalMultiplierContribution: number
  multiplierContributionPct: number
  chainDist: ChainEntry[]
  meterBPRates: MeterBPRate[]
  avgWildSpawnsPerSpin: number
  avgChainsPerSpin: number
  pctZeroWin: number
  pctPositiveReturn: number   // % spins that returned >= bet amount
}

export interface BonusAggregates {
  totalRounds: number
  winDist: WinBuckets
  symbolStats: AggSymbolStats[]
  multiplierStats: AggMultiplierStats[]
  megaWildCount: number
  megaWildPayout: number
  megaWildPayoutPct: number
  totalMultiplierContribution: number
  multiplierContributionPct: number
  rowUnlockDist: RowUnlockEntry[]
  avgFreeSpinsUsed: number
  avgMaxRows: number
  meterFillRate: number         // % of rounds where meter filled at least once
  totalExtraSpinEvents: number  // total +2 spin awards across all rounds
  roundsWithExtraSpins: number
}

// ── Final result ──────────────────────────────────────────────────────────────

export interface SimResult {
  meta: {
    runId: string
    timestamp: string
    label: string
    normalSpins: number
    bonusSpins: number
    durationMs: number
    seed: null
  }
  summary: {
    pBonus: number
    eNormalWinExclBonus: number
    eBonus: number
    eTotalPerSpin: number
    rtp: number
    rtpPercent: number
    ciHalfWidthPercent: number
    normalSpinsPerSec: number
    bonusSpinsPerSec: number
  }
  normalAgg: NormalAggregates
  bonusAgg: BonusAggregates
  normalSeries: SpinRecord[]
  bonusSeries: BonusRecord[]
}
