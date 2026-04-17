// Headless spin resolvers for Monte Carlo simulation.
// These are exact ports of the spin() and bonusSpin() logic from SlotMachine.tsx
// with all UI state (setState, setTimeout, soundManager) stripped out.
// The UI callbacks and these resolvers must stay in sync when game math changes.

import {
  FRUIT_METER_MAX,
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
import { calculateClusterWin } from './winCalculation'
import { getNewBreakpointIndices } from './meterHelpers'
import { isWildcard, isMegaWild } from '../utils/helpers'

export interface SpinResult {
  totalWin: number
  bonusTriggered: boolean
  chainCount: number
  finalMeter: number
  clustersHit: number
  megaWildTriggered: boolean
}

export interface BonusResult {
  totalWin: number
  freeSpinsUsed: number
  maxRowsReached: number
  perSpinWins: number[]
}

// Resolves a single normal spin end-to-end (grid gen → cascade loop → meter → bonus check).
// Mirrors spin() in SlotMachine.tsx — same outer/inner loop, same breakpoint logic.
export function resolveSpin(): SpinResult {
  let currentGrid = generateGrid()
  let currentMeterValue = 0
  let totalWin = 0
  let chain = 0
  let bonusTriggered = false
  let clustersHit = 0
  let megaWildTriggered = false

  // Outer loop: re-enters after spawning wilds at breakpoints (identical to spin())
  outer: while (true) {
    const meterBeforePhase = currentMeterValue

    // Inner loop: cascade until no clusters remain
    while (true) {
      const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, BASE_ROWS)
      if (clusters.length === 0) break

      chain++
      clustersHit += clusters.length

      let matchedSymbolCount = 0
      const allMatchedSet = new Set<string>()
      for (const cluster of clusters) {
        cluster.forEach(cell => {
          allMatchedSet.add(cell)
          matchedSymbolCount++
        })
      }

      currentMeterValue = Math.min(currentMeterValue + matchedSymbolCount, FRUIT_METER_MAX)

      const megaWildBonus = getMegaWildBonusCells(currentGrid, clusters, BASE_ROWS)
      let expandedClusters = clusters

      if (megaWildBonus && megaWildBonus.positions.size > 0) {
        megaWildTriggered = true
        expandedClusters = clusters.map(cluster => {
          let hasMegaWildInCluster = false
          let clusterMainSymbol: string | null = null
          for (const cellKey of cluster) {
            const [c, r] = cellKey.split('-').map(Number)
            const sym = currentGrid[c][r]
            if (isMegaWild(sym)) hasMegaWildInCluster = true
            if (!isWildcard(sym) && !clusterMainSymbol) clusterMainSymbol = sym
          }
          if (hasMegaWildInCluster && clusterMainSymbol === megaWildBonus.symbol) {
            const expanded = new Set(cluster)
            megaWildBonus.positions.forEach(pos => expanded.add(pos))
            return expanded
          }
          return cluster
        })
        megaWildBonus.positions.forEach(pos => allMatchedSet.add(pos))
      }

      const { win: clusterWin } = calculateClusterWin(currentGrid, expandedClusters)
      totalWin += clusterWin

      const { newGrid } = cascadeGrid(currentGrid, allMatchedSet, BASE_ROWS)
      currentGrid = newGrid
    }

    const newBreakpointIndices = getNewBreakpointIndices(currentMeterValue, meterBeforePhase)
    const wildsToSpawn = newBreakpointIndices.reduce(
      (sum, idx) => sum + WILDS_PER_BREAKPOINT[idx],
      0
    )

    if (wildsToSpawn > 0) {
      const { newGrid } = spawnWilds(currentGrid, wildsToSpawn, BASE_ROWS)
      currentGrid = newGrid
      continue outer
    }

    if (currentMeterValue >= FRUIT_METER_MAX) {
      bonusTriggered = true
    }
    break
  }

  return { totalWin, bonusTriggered, chainCount: chain, finalMeter: currentMeterValue, clustersHit, megaWildTriggered }
}

// Resolves an entire bonus round (all free spins) end-to-end.
// Mirrors bonusSpin() in SlotMachine.tsx — same cascade loop, row unlocks, +2 spin reward.
export function resolveBonusRound(): BonusResult {
  let freeSpins = 10
  let totalWin = 0
  let unlockedRows = 0
  const perSpinWins: number[] = []
  let maxRowsReached = BASE_ROWS

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

    // Single cascade loop per spin (mirrors bonusSpin — wilds spawned inline)
    while (true) {
      const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, activeRows)
      if (clusters.length === 0) break

      let matchedSymbolCount = 0
      const allMatchedSet = new Set<string>()
      for (const cluster of clusters) {
        cluster.forEach(cell => {
          allMatchedSet.add(cell)
          matchedSymbolCount++
        })
      }

      previousMeterValue = currentMeterValue
      currentMeterValue = currentMeterValue + matchedSymbolCount
      const cappedMeter = Math.min(currentMeterValue, BONUS_FRUIT_METER_MAX)

      const megaWildBonus = getMegaWildBonusCells(currentGrid, clusters, activeRows)
      let expandedClusters = clusters

      if (megaWildBonus && megaWildBonus.positions.size > 0) {
        expandedClusters = clusters.map(cluster => {
          let hasMegaWildInCluster = false
          let clusterMainSymbol: string | null = null
          for (const cellKey of cluster) {
            const [c, r] = cellKey.split('-').map(Number)
            const sym = currentGrid[c][r]
            if (isMegaWild(sym)) hasMegaWildInCluster = true
            if (!isWildcard(sym) && !clusterMainSymbol) clusterMainSymbol = sym
          }
          if (hasMegaWildInCluster && clusterMainSymbol === megaWildBonus.symbol) {
            const expanded = new Set(cluster)
            megaWildBonus.positions.forEach(pos => expanded.add(pos))
            return expanded
          }
          return cluster
        })
        megaWildBonus.positions.forEach(pos => allMatchedSet.add(pos))
      }

      const { win: clusterWin } = calculateClusterWin(currentGrid, expandedClusters)
      spinWin += clusterWin

      // +2 free spins if meter fills for the first time this spin
      if (cappedMeter >= BONUS_FRUIT_METER_MAX && !addedSpins) {
        addedSpins = true
        freeSpins += 2
      }

      const newBreakpointIndices = getNewBreakpointIndices(
        currentMeterValue,
        previousMeterValue,
        BONUS_FRUIT_METER_BREAKPOINTS
      )

      // Wilds from breakpoints (last breakpoint gives +2 spins, not wilds)
      const wildsToSpawn = newBreakpointIndices
        .filter(idx => idx < BONUS_FRUIT_METER_BREAKPOINTS.length - 1)
        .reduce((sum, idx) => sum + BONUS_WILDS_PER_BREAKPOINT[idx], 0)

      // Row unlocks at breakpoints 0, 1, 2 (meter values 25, 50, 75)
      rowsToUnlock += newBreakpointIndices.filter(idx => idx < 3).length

      const { newGrid } = cascadeGrid(currentGrid, allMatchedSet, activeRows, true)
      currentGrid = newGrid

      if (wildsToSpawn > 0) {
        const { newGrid: gridWithWilds } = spawnWilds(currentGrid, wildsToSpawn, activeRows)
        currentGrid = gridWithWilds
      }
    }

    // Row unlocks persist across spins within the bonus round
    if (rowsToUnlock > 0) {
      unlockedRows = Math.min(unlockedRows + rowsToUnlock, MAX_BONUS_ROWS)
    }

    totalWin += spinWin
    perSpinWins.push(spinWin)
  }

  return {
    totalWin,
    freeSpinsUsed: perSpinWins.length,
    maxRowsReached,
    perSpinWins,
  }
}
