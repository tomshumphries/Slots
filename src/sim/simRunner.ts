// Monte Carlo simulation runner.
//
// Three independent cadences:
//   BATCH_SIZE    — spins between yields; keeps Worker responsive to cancel messages.
//   MAX_PROGRESS  — max progress/UI events per batch; controls React re-render rate.
//   MAX_CHART_PTS — max Recharts data points regardless of run size.
//
// Memory is O(MAX_CHART_PTS + symbol_count). All per-spin stats are aggregated
// inline with running totals; no unbounded arrays are grown.

import { resolveSpin, resolveBonusRound } from '../logic/spinResolver'
import { BET_AMOUNT } from '../config'
import type {
  SimConfig, SimProgress, SimResult, SpinRecord, BonusRecord,
  WinBuckets, AggSymbolStats, AggMultiplierStats,
  NormalAggregates, BonusAggregates,
} from './types'
import type { SymbolWinEntry, MultiplierEntry } from '../logic/spinResolver'

const BATCH_SIZE = 1_000
const MAX_PROGRESS = 200
const MAX_CHART_PTS = 300

const SYMBOLS = ['🍒', '🍀', '🍇', '🔔', '💎']
const NORMAL_BP_LABELS = ['Reach 15', 'Reach 30', 'Reach 45', 'BONUS (60)']

function chartInterval(total: number) {
  return Math.max(1, Math.floor(total / MAX_CHART_PTS))
}
function progressInterval(total: number) {
  const n = Math.max(BATCH_SIZE, Math.floor(total / MAX_PROGRESS))
  return Math.ceil(n / BATCH_SIZE) * BATCH_SIZE
}

function winBucket(win: number, buckets: WinBuckets) {
  if (win === 0) buckets.zero++
  else if (win <= 0.5) buckets.micro++
  else if (win <= 1) buckets.small++
  else if (win <= 2) buckets.medium++
  else if (win <= 5) buckets.large++
  else if (win <= 20) buckets.big++
  else buckets.huge++
}

function mergeSymbolWins(
  agg: Record<string, SymbolWinEntry>,
  incoming: Record<string, SymbolWinEntry>
) {
  for (const [sym, v] of Object.entries(incoming)) {
    if (!agg[sym]) agg[sym] = { clusters: 0, payout: 0, cells: 0 }
    agg[sym].clusters += v.clusters
    agg[sym].payout += v.payout
    agg[sym].cells += v.cells
  }
}

function mergeMultiplierData(
  agg: Record<string, MultiplierEntry>,
  incoming: Record<string, MultiplierEntry>
) {
  for (const [key, v] of Object.entries(incoming)) {
    if (!agg[key]) agg[key] = { count: 0, totalPayout: 0, contribution: 0 }
    agg[key].count += v.count
    agg[key].totalPayout += v.totalPayout
    agg[key].contribution += v.contribution
  }
}

function finalizeSymbolStats(
  agg: Record<string, SymbolWinEntry>,
  totalPayout: number
): AggSymbolStats[] {
  return SYMBOLS
    .filter(s => agg[s])
    .map(s => ({
      symbol: s,
      clusters: agg[s].clusters,
      payout: agg[s].payout,
      cells: agg[s].cells,
      avgClusterSize: agg[s].clusters > 0 ? agg[s].cells / agg[s].clusters : 0,
      payoutPct: totalPayout > 0 ? (agg[s].payout / totalPayout) * 100 : 0,
    }))
    .sort((a, b) => b.payout - a.payout)
}

function finalizeMultiplierStats(agg: Record<string, MultiplierEntry>): AggMultiplierStats[] {
  return Object.entries(agg)
    .map(([value, v]) => ({ value, count: v.count, totalPayout: v.totalPayout, contribution: v.contribution }))
    .sort((a, b) => {
      const av = parseInt(a.value), bv = parseInt(b.value)
      return av - bv
    })
}

// ── Main runner ──────────────────────────────────────────────────────────────

export async function runSimulation(
  config: SimConfig,
  onProgress: (p: SimProgress) => void,
  signal: AbortSignal
): Promise<SimResult> {

  const isTimeBased = config.runMode === 'time'
  const halfTimeMs = isTimeBased ? (config.timeLimitSecs * 1000) / 2 : 0
  const timeLimitMs = isTimeBased ? config.timeLimitSecs * 1000 : 0

  // ── Batch A: Normal spins ─────────────────────────────────────────────────

  const normalSeries: SpinRecord[] = []
  let normalWinSum = 0
  let bonusHits = 0

  // Welford's online variance — constant memory
  let wMean = 0, wM2 = 0

  // Aggregation state
  const nSymbolAgg: Record<string, SymbolWinEntry> = {}
  const nMultiplierAgg: Record<string, MultiplierEntry> = {}
  let nMegaWildCount = 0
  let nMegaWildPayout = 0
  let nBaseWinTotal = 0
  let nMultiplierContrib = 0
  let nTotalWildSpawns = 0
  let nTotalChains = 0
  const nChainCounts: Record<number, number> = {}
  const nMeterBPHits = [0, 0, 0, 0]
  const nWinDist: WinBuckets = { zero: 0, micro: 0, small: 0, medium: 0, large: 0, big: 0, huge: 0 }

  const normalStart = Date.now()

  // Determine loop bounds — for time mode, we loop until half-time elapses
  const normalCount = isTimeBased ? Infinity : config.normalSpins
  const normalChartEvery = isTimeBased ? BATCH_SIZE : chartInterval(config.normalSpins)
  const normalProgEvery = isTimeBased ? BATCH_SIZE : progressInterval(config.normalSpins)

  let ni = 0
  for (; ni < normalCount; ni++) {
    if (ni > 0 && ni % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 0))
      if (signal.aborted) throw new DOMException('Simulation cancelled', 'AbortError')
      if (isTimeBased && Date.now() - normalStart >= halfTimeMs) break
    }

    const spin = resolveSpin()
    const n = ni + 1
    normalWinSum += spin.totalWin
    if (spin.bonusTriggered) bonusHits++
    nBaseWinTotal += spin.baseWin

    // Welford
    const delta = spin.totalWin - wMean
    wMean += delta / n
    wM2 += delta * (spin.totalWin - wMean)

    // Aggregate stats
    mergeSymbolWins(nSymbolAgg, spin.symbolWins)
    mergeMultiplierData(nMultiplierAgg, spin.multiplierData)
    if (spin.megaWildTriggered) { nMegaWildCount++; nMegaWildPayout += spin.megaWildPayout }
    for (const [, v] of Object.entries(spin.multiplierData)) nMultiplierContrib += v.contribution
    nTotalWildSpawns += spin.wildSpawnsTotal
    nTotalChains += spin.chainCount
    const c = spin.chainCount
    nChainCounts[c] = (nChainCounts[c] ?? 0) + 1
    const bp = spin.meterPeakBP
    if (bp >= 0) nMeterBPHits[0]++
    if (bp >= 1) nMeterBPHits[1]++
    if (bp >= 2) nMeterBPHits[2]++
    if (bp >= 3) nMeterBPHits[3]++
    winBucket(spin.totalWin, nWinDist)

    const runningMean = normalWinSum / n
    if (n % normalChartEvery === 0) normalSeries.push({ i: n, runningMean })

    if (n % normalProgEvery === 0) {
      const elapsedMs = Date.now() - normalStart
      const spinsPerSec = n / (elapsedMs / 1000)
      const estimatedTotal = isTimeBased ? Math.round(n + (halfTimeMs - elapsedMs) / 1000 * spinsPerSec) : config.normalSpins
      const etaMs = isTimeBased ? Math.max(0, halfTimeMs - elapsedMs) : ((config.normalSpins - n) / spinsPerSec) * 1000
      onProgress({ phase: 'normal', done: n, total: estimatedTotal, currentMean: runningMean, pBonus: bonusHits / n, elapsedMs, spinsPerSec, etaMs, timeLimitMs })
    }
  }
  // Final chart point
  if (normalSeries.length === 0 || normalSeries[normalSeries.length - 1].i !== ni) {
    normalSeries.push({ i: ni, runningMean: normalWinSum / ni })
  }

  const actualNormalSpins = ni
  const normalDurationMs = Date.now() - normalStart
  const eNormalWinExclBonus = normalWinSum / actualNormalSpins
  const pBonus = bonusHits / actualNormalSpins
  const normalSpinsPerSec = actualNormalSpins / (normalDurationMs / 1000)
  const variance = actualNormalSpins > 1 ? wM2 / (actualNormalSpins - 1) : 0
  const stdErr = Math.sqrt(variance / actualNormalSpins)
  const ciHalfWidth = 1.96 * stdErr

  // ── Batch B: Bonus rounds ─────────────────────────────────────────────────

  const bonusSeries: BonusRecord[] = []
  let bonusWinSum = 0

  const bSymbolAgg: Record<string, SymbolWinEntry> = {}
  const bMultiplierAgg: Record<string, MultiplierEntry> = {}
  let bMegaWildCount = 0
  let bMegaWildPayout = 0
  let bMultiplierContrib = 0
  let bTotalBaseWin = 0
  let bTotalFreeSpins = 0
  let bTotalMaxRows = 0
  let bMeterFillEvents = 0
  let bRoundsWithExtraSpins = 0
  const bRowUnlockTotals: Record<number, { count: number; winSum: number }> = {
    0: { count: 0, winSum: 0 },
    1: { count: 0, winSum: 0 },
    2: { count: 0, winSum: 0 },
    3: { count: 0, winSum: 0 },
  }
  const bWinDist: WinBuckets = { zero: 0, micro: 0, small: 0, medium: 0, large: 0, big: 0, huge: 0 }

  const bonusCount = isTimeBased ? Infinity : config.bonusSpins
  const bonusChartEvery = isTimeBased ? Math.max(1, Math.floor(BATCH_SIZE / 10)) : chartInterval(config.bonusSpins)
  const bonusProgEvery = isTimeBased ? Math.max(10, Math.floor(BATCH_SIZE / 10)) : progressInterval(config.bonusSpins)
  const bonusStart = Date.now()

  let bi = 0
  for (; bi < bonusCount; bi++) {
    if (bi > 0 && bi % Math.max(10, Math.floor(BATCH_SIZE / 20)) === 0) {
      await new Promise(r => setTimeout(r, 0))
      if (signal.aborted) throw new DOMException('Simulation cancelled', 'AbortError')
      if (isTimeBased && Date.now() - bonusStart >= halfTimeMs) break
    }

    const bonus = resolveBonusRound()
    const n = bi + 1
    bonusWinSum += bonus.totalWin

    mergeSymbolWins(bSymbolAgg, bonus.symbolWins)
    mergeMultiplierData(bMultiplierAgg, bonus.multiplierData)
    if (bonus.megaWildCount > 0) { bMegaWildCount += bonus.megaWildCount; bMegaWildPayout += bonus.megaWildPayout }
    for (const [, v] of Object.entries(bonus.multiplierData)) bMultiplierContrib += v.contribution
    bTotalBaseWin += bonus.totalWin - bonus.megaWildPayout  // approximate base
    bTotalFreeSpins += bonus.freeSpinsUsed
    bTotalMaxRows += bonus.maxRowsReached
    if (bonus.meterFillEvents > 0) { bMeterFillEvents += bonus.meterFillEvents; bRoundsWithExtraSpins++ }
    const rows = bonus.rowsUnlockedFinal
    bRowUnlockTotals[rows].count++
    bRowUnlockTotals[rows].winSum += bonus.totalWin
    winBucket(bonus.totalWin, bWinDist)

    const runningMean = bonusWinSum / n
    if (n % bonusChartEvery === 0) bonusSeries.push({ i: n, runningMean })

    if (n % bonusProgEvery === 0) {
      const elapsedMs = Date.now() - bonusStart
      const spinsPerSec = n / (elapsedMs / 1000)
      const estimatedTotal = isTimeBased ? Math.round(n + (halfTimeMs - elapsedMs) / 1000 * spinsPerSec) : config.bonusSpins
      const etaMs = isTimeBased ? Math.max(0, halfTimeMs - elapsedMs) : ((config.bonusSpins - n) / spinsPerSec) * 1000
      onProgress({ phase: 'bonus', done: n, total: estimatedTotal, currentMean: runningMean, pBonus, elapsedMs, spinsPerSec, etaMs, timeLimitMs })
    }
  }
  if (bonusSeries.length === 0 || bonusSeries[bonusSeries.length - 1].i !== bi) {
    bonusSeries.push({ i: bi, runningMean: bonusWinSum / Math.max(1, bi) })
  }

  const actualBonusSpins = bi
  const bonusDurationMs = Date.now() - bonusStart
  const eBonus = bonusWinSum / Math.max(1, actualBonusSpins)
  const bonusSpinsPerSec = actualBonusSpins / (bonusDurationMs / 1000)

  // ── Finalize aggregates ───────────────────────────────────────────────────

  const normalAgg: NormalAggregates = {
    totalSpins: actualNormalSpins,
    winDist: nWinDist,
    symbolStats: finalizeSymbolStats(nSymbolAgg, normalWinSum),
    multiplierStats: finalizeMultiplierStats(nMultiplierAgg),
    megaWildCount: nMegaWildCount,
    megaWildPayout: nMegaWildPayout,
    megaWildPayoutPct: normalWinSum > 0 ? (nMegaWildPayout / normalWinSum) * 100 : 0,
    totalMultiplierContribution: nMultiplierContrib,
    multiplierContributionPct: normalWinSum > 0 ? (nMultiplierContrib / normalWinSum) * 100 : 0,
    chainDist: Object.entries(nChainCounts)
      .map(([chains, count]) => ({ chains: Number(chains), count, pct: (count / actualNormalSpins) * 100 }))
      .sort((a, b) => a.chains - b.chains),
    meterBPRates: NORMAL_BP_LABELS.map((label, i) => ({
      label,
      hits: nMeterBPHits[i],
      rate: nMeterBPHits[i] / actualNormalSpins,
    })),
    avgWildSpawnsPerSpin: nTotalWildSpawns / actualNormalSpins,
    avgChainsPerSpin: nTotalChains / actualNormalSpins,
    pctZeroWin: (nWinDist.zero / actualNormalSpins) * 100,
    pctPositiveReturn: ((actualNormalSpins - nWinDist.zero - nWinDist.micro) / actualNormalSpins) * 100,
  }

  const bonusAgg: BonusAggregates = {
    totalRounds: actualBonusSpins,
    winDist: bWinDist,
    symbolStats: finalizeSymbolStats(bSymbolAgg, bonusWinSum),
    multiplierStats: finalizeMultiplierStats(bMultiplierAgg),
    megaWildCount: bMegaWildCount,
    megaWildPayout: bMegaWildPayout,
    megaWildPayoutPct: bonusWinSum > 0 ? (bMegaWildPayout / bonusWinSum) * 100 : 0,
    totalMultiplierContribution: bMultiplierContrib,
    multiplierContributionPct: bonusWinSum > 0 ? (bMultiplierContrib / bonusWinSum) * 100 : 0,
    rowUnlockDist: [0, 1, 2, 3].map(r => ({
      rows: r,
      count: bRowUnlockTotals[r].count,
      pct: (bRowUnlockTotals[r].count / Math.max(1, actualBonusSpins)) * 100,
      avgWin: bRowUnlockTotals[r].count > 0 ? bRowUnlockTotals[r].winSum / bRowUnlockTotals[r].count : 0,
    })),
    avgFreeSpinsUsed: bTotalFreeSpins / Math.max(1, actualBonusSpins),
    avgMaxRows: bTotalMaxRows / Math.max(1, actualBonusSpins),
    meterFillRate: (bRoundsWithExtraSpins / Math.max(1, actualBonusSpins)) * 100,
    totalExtraSpinEvents: bMeterFillEvents,
    roundsWithExtraSpins: bRoundsWithExtraSpins,
  }

  const eTotalPerSpin = eNormalWinExclBonus + pBonus * eBonus
  const rtp = eTotalPerSpin / BET_AMOUNT
  const totalDurationMs = normalDurationMs + bonusDurationMs

  const timestamp = new Date().toISOString()
  const safeLabel = config.label.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)
  const runId = `sim-${timestamp.slice(0, 10)}_${timestamp.slice(11, 16).replace(':', '-')}_${safeLabel}`

  return {
    meta: {
      runId, timestamp, label: config.label,
      normalSpins: actualNormalSpins, bonusSpins: actualBonusSpins,
      durationMs: totalDurationMs, seed: null,
    },
    summary: {
      pBonus, eNormalWinExclBonus, eBonus, eTotalPerSpin, rtp,
      rtpPercent: rtp * 100, ciHalfWidthPercent: ciHalfWidth * 100,
      normalSpinsPerSec, bonusSpinsPerSec,
    },
    normalAgg,
    bonusAgg,
    normalSeries,
    bonusSeries,
  }
}
