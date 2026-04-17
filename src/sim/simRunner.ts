// Monte Carlo simulation runner.
//
// Three independent cadences, all tuneable:
//   BATCH_SIZE   — spins between yields. Keeps the Worker responsive to cancel
//                  messages without overloading the event loop.
//   MAX_PROGRESS — how many progress/UI events to fire per batch. Controls
//                  React re-render frequency on the main thread.
//   MAX_CHART_PTS — max data points fed to Recharts, regardless of run size.
//
// Memory is O(MAX_CHART_PTS) — we never grow an unbounded array of spin records.
// Variance is computed with Welford's online algorithm (constant memory).

import { resolveSpin, resolveBonusRound } from '../logic/spinResolver'
import { BET_AMOUNT } from '../config'
import type { SimConfig, SimProgress, SimResult, SpinRecord, BonusRecord } from './types'

const BATCH_SIZE = 1_000      // yield to event loop every N spins
const MAX_PROGRESS = 200      // at most this many progress events per batch
const MAX_CHART_PTS = 300     // max chart data points stored regardless of run size

function chartInterval(total: number) {
  return Math.max(1, Math.floor(total / MAX_CHART_PTS))
}

function progressInterval(total: number) {
  // Report every BATCH_SIZE spins at minimum (aligns with our yield points),
  // but fewer updates for huge runs so the main thread isn't overwhelmed.
  const natural = Math.max(BATCH_SIZE, Math.floor(total / MAX_PROGRESS))
  // Snap to a multiple of BATCH_SIZE so progress always fires on a yield boundary
  return Math.ceil(natural / BATCH_SIZE) * BATCH_SIZE
}


export async function runSimulation(
  config: SimConfig,
  onProgress: (progress: SimProgress) => void,
  signal: AbortSignal
): Promise<SimResult> {
  // ── Batch A: Normal spins ─────────────────────────────────────────────────
  const normalSeries: SpinRecord[] = []
  let normalWinSum = 0
  let bonusHits = 0

  // Welford's online variance — O(1) memory, no need to store all wins
  let wMean = 0, wM2 = 0

  const normalChartEvery = chartInterval(config.normalSpins)
  const normalProgEvery = progressInterval(config.normalSpins)
  const normalStart = Date.now()

  for (let i = 0; i < config.normalSpins; i++) {
    // Yield every BATCH_SIZE — keeps Worker message loop alive for cancel signals
    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 0))
      if (signal.aborted) throw new DOMException('Simulation cancelled', 'AbortError')
    }

    const spin = resolveSpin()
    const n = i + 1
    normalWinSum += spin.totalWin
    if (spin.bonusTriggered) bonusHits++

    // Welford update (variance, no stored array needed)
    const delta = spin.totalWin - wMean
    wMean += delta / n
    wM2 += delta * (spin.totalWin - wMean)

    const runningMean = normalWinSum / n

    // Store chart sample
    if (n % normalChartEvery === 0 || i === config.normalSpins - 1) {
      normalSeries.push({ i: n, runningMean })
    }

    // Progress event — fires on BATCH_SIZE boundaries that cross a progress interval
    if (n % normalProgEvery === 0 || i === config.normalSpins - 1) {
      const elapsed = Date.now() - normalStart
      const spinsPerSec = n / (elapsed / 1000)
      const etaMs = ((config.normalSpins - n) / spinsPerSec) * 1000
      onProgress({
        phase: 'normal',
        done: n,
        total: config.normalSpins,
        currentMean: runningMean,
        pBonus: bonusHits / n,
        elapsedMs: elapsed,
        spinsPerSec,
        etaMs,
      })
    }
  }

  const normalDurationMs = Date.now() - normalStart
  const eNormalWinExclBonus = normalWinSum / config.normalSpins
  const pBonus = bonusHits / config.normalSpins
  const normalSpinsPerSec = config.normalSpins / (normalDurationMs / 1000)

  const variance = config.normalSpins > 1 ? wM2 / (config.normalSpins - 1) : 0
  const stdErr = Math.sqrt(variance / config.normalSpins)
  const ciHalfWidth = 1.96 * stdErr

  // ── Batch B: Bonus rounds ─────────────────────────────────────────────────
  const bonusSeries: BonusRecord[] = []
  let bonusWinSum = 0

  const bonusChartEvery = chartInterval(config.bonusSpins)
  const bonusProgEvery = progressInterval(config.bonusSpins)
  const bonusStart = Date.now()

  for (let i = 0; i < config.bonusSpins; i++) {
    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 0))
      if (signal.aborted) throw new DOMException('Simulation cancelled', 'AbortError')
    }

    const bonus = resolveBonusRound()
    const n = i + 1
    bonusWinSum += bonus.totalWin

    const runningMean = bonusWinSum / n

    if (n % bonusChartEvery === 0 || i === config.bonusSpins - 1) {
      bonusSeries.push({ i: n, runningMean })
    }

    if (n % bonusProgEvery === 0 || i === config.bonusSpins - 1) {
      const elapsed = Date.now() - bonusStart
      const spinsPerSec = n / (elapsed / 1000)
      const etaMs = ((config.bonusSpins - n) / spinsPerSec) * 1000
      onProgress({
        phase: 'bonus',
        done: n,
        total: config.bonusSpins,
        currentMean: runningMean,
        pBonus,
        elapsedMs: elapsed,
        spinsPerSec,
        etaMs,
      })
    }
  }

  const bonusDurationMs = Date.now() - bonusStart
  const eBonus = bonusWinSum / config.bonusSpins
  const bonusSpinsPerSec = config.bonusSpins / (bonusDurationMs / 1000)

  // ── Combine ───────────────────────────────────────────────────────────────
  const eTotalPerSpin = eNormalWinExclBonus + pBonus * eBonus
  const rtp = eTotalPerSpin / BET_AMOUNT

  const totalDurationMs = normalDurationMs + bonusDurationMs
  const timestamp = new Date().toISOString()
  const safeLabel = config.label.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)
  const runId = `sim-${timestamp.slice(0, 10)}_${timestamp.slice(11, 16).replace(':', '-')}_${safeLabel}`

  return {
    meta: {
      runId,
      timestamp,
      label: config.label,
      normalSpins: config.normalSpins,
      bonusSpins: config.bonusSpins,
      durationMs: totalDurationMs,
      seed: null,
    },
    summary: {
      pBonus,
      eNormalWinExclBonus,
      eBonus,
      eTotalPerSpin,
      rtp,
      rtpPercent: rtp * 100,
      ciHalfWidthPercent: ciHalfWidth * 100,
      normalSpinsPerSec,
      bonusSpinsPerSec,
    },
    normalSeries,
    bonusSeries,
  }
}
