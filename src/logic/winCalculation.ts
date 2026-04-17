// Win calculation functions

import { SYMBOL_PAYOUTS, BET_AMOUNT } from '../config'
import { isMultiplier, isWild, isMegaWild, getMultiplierValue } from '../utils/helpers'
import type { ClusterResult } from '../types'

// Calculate cluster size bonus multiplier
// This is the primary scaling factor (chain multipliers removed)
// Larger clusters are rare and should be well rewarded
export function getClusterSizeMultiplier(size: number): number {
  if (size >= 25) return 12.0  // Legendary cluster
  if (size >= 20) return 8.0   // Massive cluster
  if (size >= 15) return 5.0   // Huge cluster
  if (size >= 12) return 3.0   // Large cluster
  if (size >= 10) return 2.0   // Good cluster
  if (size >= 8) return 1.4    // Decent cluster
  return 1.0  // Base (7 symbols)
}

// Calculate win for a set of clusters
// Multipliers stack ADDITIVELY (2x + 3x = 5x, not 6x)
// Returns info about wildcards involved for sound effects
export function calculateClusterWin(
  grid: string[][],
  clusters: Set<string>[]
): ClusterResult {
  let win = 0
  const multipliers: number[] = []
  let hasWild = false
  let hasMegaWild = false

  for (const cluster of clusters) {
    // Find the main symbol (non-wildcard) and any multipliers in the cluster
    // Wild symbols are just wildcards with no multiplier value
    let mainSymbol: string | null = null
    let clusterMultiplier = 0 // Start at 0 for additive stacking
    let hasMultiplierInCluster = false

    for (const cellKey of cluster) {
      const [col, row] = cellKey.split('-').map(Number)
      const symbol = grid[col][row]

      if (isMegaWild(symbol)) {
        hasMegaWild = true
        continue
      } else if (isMultiplier(symbol)) {
        // Add all multipliers together (additive stacking)
        const mult = getMultiplierValue(symbol)
        clusterMultiplier += mult
        multipliers.push(mult)
        hasMultiplierInCluster = true
      } else if (isWild(symbol)) {
        // Wilds are just wildcards - no multiplier value, skip for main symbol
        hasWild = true
        continue
      } else if (!mainSymbol) {
        mainSymbol = symbol
      }
    }

    // If no multipliers, use 1x; otherwise use the additive total
    if (!hasMultiplierInCluster) {
      clusterMultiplier = 1
    }

    if (mainSymbol) {
      const basePayout = SYMBOL_PAYOUTS[mainSymbol] || 0.5
      const sizeMultiplier = getClusterSizeMultiplier(cluster.size)

      // Payout = base payout × size multiplier × cluster multiplier × bet
      win += basePayout * sizeMultiplier * clusterMultiplier * BET_AMOUNT
    }
  }

  return { win, multipliers, hasWild, hasMegaWild }
}
