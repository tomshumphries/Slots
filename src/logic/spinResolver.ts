// Headless spin resolvers for Monte Carlo simulation.
// These are exact ports of spin() and bonusSpin() from SlotMachine.tsx with all
// UI side effects (setState, setTimeout, soundManager) removed.
// Each resolver returns rich per-spin statistics used by the sim aggregator.

import {
  FRUIT_METER_MAX,
  FRUIT_METER_BREAKPOINTS,
  WILDS_PER_BREAKPOINT,
  BONUS_FRUIT_METER_MAX,
  BONUS_FRUIT_METER_BREAKPOINTS,
  BONUS_WILDS_PER_BREAKPOINT,
  BASE_ROWS,
  MIN_CLUSTER_SIZE,
  STICKY_MULTIPLIER_CAP,
  STICKY_MULTIPLIER_CHARGES,
  SYMBOL_PAYOUTS,
  GAME_CONFIG,
} from '../config'

import { generateGrid, generateBonusGrid, cascadeGrid, spawnWilds } from './gridOperations'
import { findClusters, getMegaWildBonusCells, getTransmutationCells } from './clusterDetection'
import { getClusterWinDetail } from './winCalculation'
import { getNewBreakpointIndices } from './meterHelpers'
import { isWildcard, isMegaWild, isMultiplier, isTransmutation } from '../utils/helpers'
import { mulberry32, randomSeed } from './rng'
import type { Rng } from './rng'

// ── Per-spin data structures ─────────────────────────────────────────────────

export interface SymbolWinEntry {
  clusters: number    // times this symbol formed a winning cluster
  payout: number      // total £ paid
  cells: number       // total cells in winning clusters
}

export interface MultiplierEntry {
  count: number           // times this multiplier value appeared in a winning cluster
  totalPayout: number     // total payout from clusters containing this multiplier
  contribution: number    // extra vs no-multiplier (payout - baseWin) across all clusters
}

export interface SpinResult {
  totalWin: number
  bonusTriggered: boolean
  chainCount: number
  finalMeter: number
  meterPeakBP: number   // highest FRUIT_METER_BREAKPOINTS index crossed (-1 = none)
  symbolWins: Record<string, SymbolWinEntry>
  multiplierData: Record<string, MultiplierEntry>
  megaWildTriggered: boolean
  megaWildPayout: number
  transmutationTriggered: boolean
  transmutationPayout: number
  clusterSizes: number[]
  wildSpawnsTotal: number
  baseWin: number         // total win without any multipliers
  seed: number            // seed used to produce this spin
}

export interface BonusResult {
  totalWin: number
  freeSpinsUsed: number
  perSpinWins: number[]
  meterFillEvents: number     // how many +2 spin awards in this round
  symbolWins: Record<string, SymbolWinEntry>
  multiplierData: Record<string, MultiplierEntry>
  megaWildCount: number
  megaWildPayout: number
  transmutationCount: number
  transmutationPayout: number
  seed: number               // seed used to produce this bonus round
  aborted: boolean           // true if maxFreeSpins safety cap was hit
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addSymbolWin(
  map: Record<string, SymbolWinEntry>,
  symbol: string,
  payout: number,
  cells: number
) {
  if (!map[symbol]) map[symbol] = { clusters: 0, payout: 0, cells: 0 }
  map[symbol].clusters++
  map[symbol].payout += payout
  map[symbol].cells += cells
}

function addMultiplierData(
  map: Record<string, MultiplierEntry>,
  values: number[],
  totalPayout: number,
  baseWin: number
) {
  for (const v of values) {
    const key = `${v}x`
    if (!map[key]) map[key] = { count: 0, totalPayout: 0, contribution: 0 }
    map[key].count++
    map[key].totalPayout += totalPayout
    map[key].contribution += totalPayout - baseWin
  }
}

// ── Normal spin ──────────────────────────────────────────────────────────────

export function resolveSpin(seed?: number): SpinResult {
  const usedSeed = seed ?? randomSeed()
  const rng: Rng = mulberry32(usedSeed)

  let currentGrid = generateGrid(undefined, rng)
  let currentMeterValue = 0
  let peakMeter = 0
  let totalWin = 0
  let baseWin = 0
  let chain = 0
  let bonusTriggered = false
  let megaWildTriggered = false
  let megaWildPayout = 0
  let transmutationTriggered = false
  let transmutationPayout = 0
  let wildSpawnsTotal = 0
  const symbolWins: Record<string, SymbolWinEntry> = {}
  const multiplierData: Record<string, MultiplierEntry> = {}
  const clusterSizes: number[] = []

  outer: while (true) {
    const meterBeforePhase = currentMeterValue

    while (true) {
      const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, BASE_ROWS)
      if (clusters.length === 0) break

      chain++

      const allMatchedSet = new Set<string>()
      for (const cluster of clusters) {
        cluster.forEach(cell => allMatchedSet.add(cell))
      }

      // Use unique cell count so shared wildcards aren't double-counted
      currentMeterValue = Math.min(currentMeterValue + allMatchedSet.size, FRUIT_METER_MAX)
      peakMeter = Math.max(peakMeter, currentMeterValue)

      const megaWildBonus = getMegaWildBonusCells(currentGrid, clusters, BASE_ROWS)
      let expandedClusters = clusters

      if (megaWildBonus && megaWildBonus.positions.size > 0) {
        megaWildTriggered = true
        expandedClusters = clusters.map(cluster => {
          let hasMW = false
          let mainSym: string | null = null
          for (const k of cluster) {
            const [c, r] = k.split('-').map(Number)
            const s = currentGrid[c][r]
            if (isMegaWild(s)) hasMW = true
            if (!isWildcard(s) && !mainSym) mainSym = s
          }
          if (hasMW && mainSym === megaWildBonus.symbol) {
            const ex = new Set(cluster)
            megaWildBonus.positions.forEach(p => ex.add(p))
            return ex
          }
          return cluster
        })
        megaWildBonus.positions.forEach(p => allMatchedSet.add(p))
      }

      // Handle transmutation: upgrade all matching symbols one tier
      const transResult = getTransmutationCells(currentGrid, expandedClusters, BASE_ROWS)
      if (transResult) {
        const { originalSymbol, upgradedSymbol, positions: transCells } = transResult
        for (let c = 0; c < currentGrid.length; c++) {
          for (let r = 0; r < BASE_ROWS; r++) {
            if (currentGrid[c][r] === originalSymbol) currentGrid[c][r] = upgradedSymbol
          }
        }
        expandedClusters = expandedClusters.map(cluster => {
          let hasT = false
          for (const k of cluster) {
            const [c, r] = k.split('-').map(Number)
            if (isTransmutation(currentGrid[c][r])) { hasT = true; break }
          }
          if (!hasT) return cluster
          const expanded = new Set(cluster)
          transCells.forEach(p => expanded.add(p))
          return expanded
        })
        transCells.forEach(p => allMatchedSet.add(p))
      }

      // Per-cluster stats + win total using getClusterWinDetail
      for (const cluster of expandedClusters) {
        const d = getClusterWinDetail(currentGrid, cluster)
        totalWin += d.win
        baseWin += d.baseWin
        clusterSizes.push(d.size)

        if (d.mainSymbol) {
          addSymbolWin(symbolWins, d.mainSymbol, d.win, d.size)
          if (d.multiplierValues.length > 0) {
            addMultiplierData(multiplierData, d.multiplierValues, d.win, d.baseWin)
          }
          if (d.hasMegaWild) megaWildPayout += d.win
          if (d.hasTransmutation) { transmutationTriggered = true; transmutationPayout += d.win }
        }
      }

      const { newGrid } = cascadeGrid(currentGrid, allMatchedSet, BASE_ROWS, false, new Set(), rng)
      currentGrid = newGrid
    }

    const newBPIndices = getNewBreakpointIndices(currentMeterValue, meterBeforePhase)
    const wildsToSpawn = newBPIndices.reduce(
      (sum, idx) => sum + WILDS_PER_BREAKPOINT[idx], 0
    )

    if (wildsToSpawn > 0) {
      wildSpawnsTotal += wildsToSpawn
      const { newGrid } = spawnWilds(currentGrid, wildsToSpawn, BASE_ROWS, rng)
      currentGrid = newGrid
      continue outer
    }

    if (currentMeterValue >= FRUIT_METER_MAX) bonusTriggered = true
    break
  }

  const meterPeakBP = FRUIT_METER_BREAKPOINTS.reduce(
    (peak, bp, idx) => peakMeter >= bp ? idx : peak, -1
  )

  return {
    totalWin, bonusTriggered, chainCount: chain, finalMeter: currentMeterValue,
    meterPeakBP, symbolWins, multiplierData, megaWildTriggered, megaWildPayout,
    transmutationTriggered, transmutationPayout, clusterSizes, wildSpawnsTotal, baseWin,
    seed: usedSeed,
  }
}

// ── Bonus round ──────────────────────────────────────────────────────────────

// Safety cap: if a bonus round ever exceeds this many total free-spin iterations
// it is almost certainly stuck in a runaway feedback loop. Abort and record the seed.
const BONUS_MAX_FREE_SPINS = 500

export function resolveBonusRound(seed?: number): BonusResult {
  const usedSeed = seed ?? randomSeed()
  const rng: Rng = mulberry32(usedSeed)

  let freeSpins = GAME_CONFIG.bonusRound.freeSpins
  let totalSpinsUsed = 0
  let aborted = false
  let totalWin = 0
  const perSpinWins: number[] = []
  let meterFillEvents = 0
  const symbolWins: Record<string, SymbolWinEntry> = {}
  const multiplierData: Record<string, MultiplierEntry> = {}
  let megaWildCount = 0
  let megaWildPayout = 0
  let transmutationCount = 0
  let transmutationPayout = 0

  // Sticky multipliers: position → { symbol, charges remaining }
  // Each sticky fires only when it's in the priority cluster; breaks when charges hit 0.
  const stickyMultipliers = new Map<string, { symbol: string; charges: number }>()

  while (freeSpins > 0) {
    if (totalSpinsUsed >= BONUS_MAX_FREE_SPINS) {
      aborted = true
      break
    }
    totalSpinsUsed++
    freeSpins--

    const activeRows = BASE_ROWS

    let currentGrid = generateBonusGrid(activeRows, rng)

    // Overlay sticky multipliers from previous spins
    for (const [pos, entry] of stickyMultipliers) {
      const [c, r] = pos.split('-').map(Number)
      if (r < activeRows) currentGrid[c][r] = entry.symbol
    }

    // Finale spin: last spin always gets pre-seeded wilds
    if (freeSpins === 0) {
      const { newGrid: finaleGrid } = spawnWilds(currentGrid, GAME_CONFIG.bonusRound.finalePreseededWilds, activeRows, rng)
      currentGrid = finaleGrid
    }

    // Meter resets each spin; one fill per spin caps the feedback loop
    let currentMeterValue = 0
    let previousMeterValue = 0
    let spinWin = 0
    let addedSpins = false

    while (true) {
      const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, activeRows)
      if (clusters.length === 0) break

      const allMatchedSet = new Set<string>()
      for (const cluster of clusters) {
        cluster.forEach(cell => allMatchedSet.add(cell))
      }

      previousMeterValue = currentMeterValue
      currentMeterValue = currentMeterValue + allMatchedSet.size

      const megaWildBonus = getMegaWildBonusCells(currentGrid, clusters, activeRows)
      let expandedClusters = clusters

      if (megaWildBonus && megaWildBonus.positions.size > 0) {
        expandedClusters = clusters.map(cluster => {
          let hasMW = false
          let mainSym: string | null = null
          for (const k of cluster) {
            const [c, r] = k.split('-').map(Number)
            const s = currentGrid[c][r]
            if (isMegaWild(s)) hasMW = true
            if (!isWildcard(s) && !mainSym) mainSym = s
          }
          if (hasMW && mainSym === megaWildBonus.symbol) {
            const ex = new Set(cluster)
            megaWildBonus.positions.forEach(p => ex.add(p))
            return ex
          }
          return cluster
        })
        megaWildBonus.positions.forEach(p => allMatchedSet.add(p))
      }

      // Handle transmutation: upgrade all matching symbols one tier
      const transResult = getTransmutationCells(currentGrid, expandedClusters, activeRows)
      if (transResult) {
        const { originalSymbol, upgradedSymbol, positions: transCells } = transResult
        for (let c = 0; c < currentGrid.length; c++) {
          for (let r = 0; r < activeRows; r++) {
            if (currentGrid[c][r] === originalSymbol) currentGrid[c][r] = upgradedSymbol
          }
        }
        expandedClusters = expandedClusters.map(cluster => {
          let hasT = false
          for (const k of cluster) {
            const [c, r] = k.split('-').map(Number)
            if (isTransmutation(currentGrid[c][r])) { hasT = true; break }
          }
          if (!hasT) return cluster
          const expanded = new Set(cluster)
          transCells.forEach(p => expanded.add(p))
          return expanded
        })
        transCells.forEach(p => allMatchedSet.add(p))
      }

      // ── Exclusive multiplier claiming ────────────────────────────────────────
      // Only the cluster with the highest-value main symbol gets multiplier benefit.
      // Others score at base payout. Prevents all clusters compounding simultaneously.
      const clusterDetails = expandedClusters.map(c => getClusterWinDetail(currentGrid, c))
      const priorityIdx = clusterDetails.reduce((best, d, i) => {
        const bestPayout = SYMBOL_PAYOUTS[clusterDetails[best].mainSymbol ?? ''] ?? 0
        const thisPayout = SYMBOL_PAYOUTS[d.mainSymbol ?? ''] ?? 0
        return thisPayout > bestPayout ? i : best
      }, 0)

      for (let i = 0; i < clusterDetails.length; i++) {
        const d = clusterDetails[i]
        const effectiveWin = i === priorityIdx ? d.win : d.baseWin
        spinWin += effectiveWin

        if (d.mainSymbol) {
          addSymbolWin(symbolWins, d.mainSymbol, effectiveWin, d.size)
          if (i === priorityIdx && d.multiplierValues.length > 0) {
            addMultiplierData(multiplierData, d.multiplierValues, effectiveWin, d.baseWin)
          }
          if (d.hasMegaWild) { megaWildCount++; megaWildPayout += effectiveWin }
          if (d.hasTransmutation) { transmutationCount++; transmutationPayout += effectiveWin }
        }
      }

      // ── Sticky multiplier management ─────────────────────────────────────────
      // Snapshot existing stickies BEFORE adding new ones so that a multiplier's
      // first hit fills its orbs (no charge consumed) and only subsequent hits deplete.
      const preExistingSticky = new Set(stickyMultipliers.keys())

      for (const cluster of expandedClusters) {
        for (const k of cluster) {
          const [c, r] = k.split('-').map(Number)
          const sym = currentGrid[c][r]
          if (isMultiplier(sym) && !stickyMultipliers.has(k) && stickyMultipliers.size < STICKY_MULTIPLIER_CAP) {
            stickyMultipliers.set(k, { symbol: sym, charges: STICKY_MULTIPLIER_CHARGES })
          }
        }
      }

      // Decrement charges only for stickies that were already locked before this step
      const depleted = new Set<string>()
      for (const k of expandedClusters[priorityIdx]) {
        if (!preExistingSticky.has(k)) continue  // first hit — orbs just filled, no charge consumed
        const entry = stickyMultipliers.get(k)
        if (entry) {
          entry.charges--
          if (entry.charges <= 0) {
            stickyMultipliers.delete(k)
            depleted.add(k)
          }
        }
      }

      // Protect live stickies from cascade; let depleted ones fall away naturally
      const stickyKeys = new Set(stickyMultipliers.keys())
      for (const k of stickyKeys) allMatchedSet.delete(k)
      // Depleted keys stay in allMatchedSet so they cascade away

      // BP detection for wild spawns
      const newBPIndices = getNewBreakpointIndices(
        currentMeterValue, previousMeterValue, BONUS_FRUIT_METER_BREAKPOINTS
      )
      const wildsToSpawn = newBPIndices
        .filter(idx => idx < BONUS_FRUIT_METER_BREAKPOINTS.length - 1)
        .reduce((sum, idx) => sum + BONUS_WILDS_PER_BREAKPOINT[idx], 0)

      // Fill detection: one award per spin caps the feedback loop
      if (!addedSpins && currentMeterValue >= BONUS_FRUIT_METER_MAX) {
        addedSpins = true
        meterFillEvents++
        freeSpins += GAME_CONFIG.fruitMeter.bonus.extraSpinsOnFill
      }

      const { newGrid } = cascadeGrid(currentGrid, allMatchedSet, activeRows, true, stickyKeys, rng)
      currentGrid = newGrid

      if (wildsToSpawn > 0) {
        const { newGrid: gw } = spawnWilds(currentGrid, wildsToSpawn, activeRows, rng)
        currentGrid = gw
      }
    }

    totalWin += spinWin
    perSpinWins.push(spinWin)
  }

  return {
    totalWin, freeSpinsUsed: perSpinWins.length,
    perSpinWins, meterFillEvents,
    symbolWins, multiplierData, megaWildCount, megaWildPayout,
    transmutationCount, transmutationPayout,
    seed: usedSeed, aborted,
  }
}
