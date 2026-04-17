// Types for the Monte Carlo simulation system

export interface SimConfig {
  label: string
  normalSpins: number
  bonusSpins: number
}

export interface SimProgress {
  phase: 'normal' | 'bonus'
  done: number
  total: number
  currentMean: number
  pBonus: number
  elapsedMs: number
  spinsPerSec: number
  etaMs: number
}

// Chart-sampled record — series only stores ~300 points regardless of run size
export interface SpinRecord {
  i: number
  runningMean: number
}

export interface BonusRecord {
  i: number
  runningMean: number
}

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
  normalSeries: SpinRecord[]
  bonusSeries: BonusRecord[]
}
