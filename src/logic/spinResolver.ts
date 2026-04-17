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
  MAX_BONUS_ROWS,
  MIN_CLUSTER_SIZE,
} from '../config'

import { generateGrid, generateBonusGrid, cascadeGrid, spawnWilds } from './gridOperations'
import { findClusters, getMegaWildBonusCells } from './clusterDetection'
import { getClusterWinDetail } from './winCalculation'
import { getNewBreakpointIndices } from './meterHelpers'
import { isWildcard, isMegaWild } from '../utils/helpers'

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
  clusterSizes: number[]
  wildSpawnsTotal: number
  baseWin: number         // total win without any multipliers
}

export interface BonusResult {
  totalWin: number
  freeSpinsUsed: number
  maxRowsReached: number
  perSpinWins: number[]
  rowsUnlockedFinal: number   // 0-3
  meterFillEvents: number     // how many +2 spin awards in this round
  symbolWins: Record<string, SymbolWinEntry>
  multiplierData: Record<string, MultiplierEntry>
  megaWildCount: number
  megaWildPayout: number
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

export function resolveSpin(): SpinResult {
  let currentGrid = generateGrid()
  let currentMeterValue = 0
  let peakMeter = 0
  let totalWin = 0
  let baseWin = 0
  let chain = 0
  let bonusTriggered = false
  let megaWildTriggered = false
  let megaWildPayout = 0
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

      let matchedSymbolCount = 0
      const allMatchedSet = new Set<string>()
      for (const cluster of clusters) {
        cluster.forEach(cell => { allMatchedSet.add(cell); matchedSymbolCount++ })
      }

      currentMeterValue = Math.min(currentMeterValue + matchedSymbolCount, FRUIT_METER_MAX)
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
        }
      }

      const { newGrid } = cascadeGrid(currentGrid, allMatchedSet, BASE_ROWS)
      currentGrid = newGrid
    }

    const newBPIndices = getNewBreakpointIndices(currentMeterValue, meterBeforePhase)
    const wildsToSpawn = newBPIndices.reduce(
      (sum, idx) => sum + WILDS_PER_BREAKPOINT[idx], 0
    )

    if (wildsToSpawn > 0) {
      wildSpawnsTotal += wildsToSpawn
      const { newGrid } = spawnWilds(currentGrid, wildsToSpawn, BASE_ROWS)
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
    clusterSizes, wildSpawnsTotal, baseWin,
  }
}

// ── Bonus round ──────────────────────────────────────────────────────────────

export function resolveBonusRound(): BonusResult {
  let freeSpins = 10
  let totalWin = 0
  let unlockedRows = 0
  const perSpinWins: number[] = []
  let maxRowsReached = BASE_ROWS
  let meterFillEvents = 0
  const symbolWins: Record<string, SymbolWinEntry> = {}
  const multiplierData: Record<string, MultiplierEntry> = {}
  let megaWildCount = 0
  let megaWildPayout = 0

  while (freeSpins > 0) {
    freeSpins--

    const activeRows = BASE_ROWS + unlockedRows
    maxRowsReached = Math.max(maxRowsReached, activeRows)

    let currentGrid = generateBonusGrid(activeRows)
    let currentMeterValue = 0
    let previousMeterValue = 0
    let spinWin = 0
    let addedSpins = false
    let rowsToUnlock = 0

    while (true) {
      const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, activeRows)
      if (clusters.length === 0) break

      let matchedSymbolCount = 0
      const allMatchedSet = new Set<string>()
      for (const cluster of clusters) {
        cluster.forEach(cell => { allMatchedSet.add(cell); matchedSymbolCount++ })
      }

      previousMeterValue = currentMeterValue
      currentMeterValue = currentMeterValue + matchedSymbolCount
      const cappedMeter = Math.min(currentMeterValue, BONUS_FRUIT_METER_MAX)

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

      for (const cluster of expandedClusters) {
        const d = getClusterWinDetail(currentGrid, cluster)
        spinWin += d.win

        if (d.mainSymbol) {
          addSymbolWin(symbolWins, d.mainSymbol, d.win, d.size)
          if (d.multiplierValues.length > 0) {
            addMultiplierData(multiplierData, d.multiplierValues, d.win, d.baseWin)
          }
          if (d.hasMegaWild) {
            megaWildCount++
            megaWildPayout += d.win
          }
        }
      }

      if (cappedMeter >= BONUS_FRUIT_METER_MAX && !addedSpins) {
        addedSpins = true
        meterFillEvents++
        freeSpins += 2
      }

      const newBPIndices = getNewBreakpointIndices(
        currentMeterValue, previousMeterValue, BONUS_FRUIT_METER_BREAKPOINTS
      )
      const wildsToSpawn = newBPIndices
        .filter(idx => idx < BONUS_FRUIT_METER_BREAKPOINTS.length - 1)
        .reduce((sum, idx) => sum + BONUS_WILDS_PER_BREAKPOINT[idx], 0)

      rowsToUnlock += newBPIndices.filter(idx => idx < 3).length

      const { newGrid } = cascadeGrid(currentGrid, allMatchedSet, activeRows, true)
      currentGrid = newGrid

      if (wildsToSpawn > 0) {
        const { newGrid: gw } = spawnWilds(currentGrid, wildsToSpawn, activeRows)
        currentGrid = gw
      }
    }

    if (rowsToUnlock > 0) {
      unlockedRows = Math.min(unlockedRows + rowsToUnlock, MAX_BONUS_ROWS)
    }

    totalWin += spinWin
    perSpinWins.push(spinWin)
  }

  return {
    totalWin, freeSpinsUsed: perSpinWins.length, maxRowsReached,
    perSpinWins, rowsUnlockedFinal: unlockedRows, meterFillEvents,
    symbolWins, multiplierData, megaWildCount, megaWildPayout,
  }
}
