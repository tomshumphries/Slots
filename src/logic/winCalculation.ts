// Win calculation functions

import { SYMBOL_PAYOUTS, BET_AMOUNT } from '../config'
import { isMultiplier, isWild, isMegaWild, isTransmutation, isWildcard, getMultiplierValue } from '../utils/helpers'
import type { ClusterResult } from '../types'

export function getClusterSizeMultiplier(size: number): number {
  if (size >= 25) return 12.0
  if (size >= 20) return 8.0
  if (size >= 15) return 5.0
  if (size >= 12) return 3.0
  if (size >= 10) return 2.0
  if (size >= 8) return 1.4
  return 1.0
}

// Per-cluster detail — used by calculateClusterWin (UI) and getClusterWinDetail (sim).
export interface ClusterWinDetail {
  mainSymbol: string | null
  win: number
  baseWin: number         // win with multiplierTotal = 1 (no multiplier boost)
  size: number
  multiplierValues: number[]
  multiplierTotal: number // additive sum (1 if no multipliers)
  hasWild: boolean
  hasMegaWild: boolean
  hasTransmutation: boolean
}

export function getClusterWinDetail(grid: string[][], cluster: Set<string>): ClusterWinDetail {
  let mainSymbol: string | null = null
  let clusterMultiplier = 0
  let hasMultiplierInCluster = false
  const multiplierValues: number[] = []
  let hasWild = false
  let hasMegaWild = false
  let hasTransmutation = false

  for (const cellKey of cluster) {
    const [col, row] = cellKey.split('-').map(Number)
    const symbol = grid[col][row]
    if (isMegaWild(symbol)) { hasMegaWild = true; continue }
    if (isTransmutation(symbol)) { hasTransmutation = true; continue }
    if (isMultiplier(symbol)) {
      const mult = getMultiplierValue(symbol)
      clusterMultiplier += mult
      multiplierValues.push(mult)
      hasMultiplierInCluster = true
    } else if (isWild(symbol)) { hasWild = true; continue }
    else if (!mainSymbol) mainSymbol = symbol
  }

  if (!hasMultiplierInCluster) clusterMultiplier = 1

  // Count only non-wildcard cells — wilds bridge gaps but don't count toward size
  let regularCount = 0
  for (const cellKey of cluster) {
    const [c, r] = cellKey.split('-').map(Number)
    if (!isWildcard(grid[c][r])) regularCount++
  }

  let win = 0
  let baseWin = 0
  if (mainSymbol) {
    const basePayout = SYMBOL_PAYOUTS[mainSymbol] ?? 0.5
    const sizeMult = getClusterSizeMultiplier(regularCount)
    win = basePayout * sizeMult * clusterMultiplier * BET_AMOUNT
    baseWin = basePayout * sizeMult * 1 * BET_AMOUNT
  }

  return { mainSymbol, win, baseWin, size: regularCount, multiplierValues, multiplierTotal: clusterMultiplier, hasWild, hasMegaWild, hasTransmutation }
}

// Aggregate win across all clusters. Used by the game UI.
// Multipliers stack additively: 2x + 3x = 5x total.
export function calculateClusterWin(grid: string[][], clusters: Set<string>[]): ClusterResult {
  let win = 0
  const multipliers: number[] = []
  let hasWild = false
  let hasMegaWild = false

  for (const cluster of clusters) {
    const d = getClusterWinDetail(grid, cluster)
    win += d.win
    multipliers.push(...d.multiplierValues)
    if (d.hasWild) hasWild = true
    if (d.hasMegaWild) hasMegaWild = true
  }

  return { win, multipliers, hasWild, hasMegaWild }
}
