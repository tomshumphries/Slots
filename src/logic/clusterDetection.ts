// Cluster detection using flood fill algorithm

import { COLS, MIN_CLUSTER_SIZE, BASE_ROWS } from '../config'
import { isWildcard, isMegaWild } from '../utils/helpers'

// Find connected clusters using flood fill (no diagonals)
// Wildcards (multipliers and wilds) can join MULTIPLE clusters simultaneously
// Mega Wilds: cluster pays normally, then bonus effect clears remaining symbols
// When matched cells are removed, use a Set to avoid removing wildcards twice
export function findClusters(
  grid: string[][],
  minSize: number = MIN_CLUSTER_SIZE,
  activeRows: number = BASE_ROWS
): Set<string>[] {
  // Track which regular symbols have been assigned to a valid cluster
  // Regular symbols can only belong to ONE cluster
  const assignedRegular = new Set<string>()
  const clusters: Set<string>[] = []

  // Flood fill that explores connected cells
  // Wildcards are allowed to be revisited across different cluster searches
  function floodFill(
    col: number,
    row: number,
    symbol: string,
    cluster: Set<string>,
    localVisited: Set<string>
  ) {
    const key = `${col}-${row}`
    if (
      col < 0 || col >= COLS ||
      row < 0 || row >= activeRows ||
      localVisited.has(key)
    ) {
      return
    }

    const cellSymbol = grid[col][row]

    // Skip if not matching and not a wildcard
    if (cellSymbol !== symbol && !isWildcard(cellSymbol)) {
      return
    }

    // Regular symbols can only be used once
    if (!isWildcard(cellSymbol) && assignedRegular.has(key)) {
      return
    }

    // Wildcards CAN be reused across clusters - don't skip them

    localVisited.add(key)
    cluster.add(key)

    // Only horizontal and vertical neighbors (no diagonals)
    floodFill(col + 1, row, symbol, cluster, localVisited)
    floodFill(col - 1, row, symbol, cluster, localVisited)
    floodFill(col, row + 1, symbol, cluster, localVisited)
    floodFill(col, row - 1, symbol, cluster, localVisited)
  }

  // First pass: find all valid clusters
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < activeRows; row++) {
      const key = `${col}-${row}`
      const symbol = grid[col][row]

      // Skip wildcards (they join clusters, don't start them)
      // Skip regular symbols already assigned to a valid cluster
      if (isWildcard(symbol) || assignedRegular.has(key)) {
        continue
      }

      const cluster = new Set<string>()
      const localVisited = new Set<string>()
      floodFill(col, row, symbol, cluster, localVisited)

      if (cluster.size >= minSize) {
        clusters.push(cluster)

        // Only mark REGULAR symbols as assigned (they can't be reused)
        // Wildcards are NOT marked - they can participate in multiple clusters
        for (const cellKey of cluster) {
          const [c, r] = cellKey.split('-').map(Number)
          if (!isWildcard(grid[c][r])) {
            assignedRegular.add(cellKey)
          }
        }
      }
    }
  }

  // Second pass: attach orphan wildcards to ALL adjacent valid clusters
  // A wildcard can be added to multiple clusters if adjacent to multiple
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < activeRows; row++) {
      const key = `${col}-${row}`
      const symbol = grid[col][row]

      if (isWildcard(symbol)) {
        // Check adjacency to ALL clusters (not just first one found)
        const neighbors = [
          [col + 1, row], [col - 1, row],
          [col, row + 1], [col, row - 1]
        ]

        for (const cluster of clusters) {
          // Check if already in this cluster (from flood fill)
          if (cluster.has(key)) continue

          // Check if adjacent to this cluster
          for (const [nc, nr] of neighbors) {
            const neighborKey = `${nc}-${nr}`
            if (cluster.has(neighborKey)) {
              cluster.add(key)
              break // Added to this cluster, check next cluster
            }
          }
        }
      }
    }
  }

  return clusters
}

// Find cells to clear as a BONUS effect from Mega Wild (not part of cluster, no payout)
// Returns: { symbol, positions } or null if no mega wild effect
export function getMegaWildBonusCells(
  grid: string[][],
  clusters: Set<string>[],
  activeRows: number = BASE_ROWS
): { symbol: string; positions: Set<string> } | null {
  for (const cluster of clusters) {
    let hasMegaWild = false
    let mainSymbol: string | null = null

    for (const cellKey of cluster) {
      const [c, r] = cellKey.split('-').map(Number)
      const sym = grid[c][r]

      if (isMegaWild(sym)) {
        hasMegaWild = true
      } else if (!isWildcard(sym) && !mainSymbol) {
        mainSymbol = sym
      }
    }

    // If cluster has mega wild and a main symbol, find ALL other instances to clear
    if (hasMegaWild && mainSymbol) {
      const bonusCells = new Set<string>()

      for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < activeRows; row++) {
          const key = `${col}-${row}`
          // Only cells NOT already in the cluster
          if (grid[col][row] === mainSymbol && !cluster.has(key)) {
            bonusCells.add(key)
          }
        }
      }

      if (bonusCells.size > 0) {
        return { symbol: mainSymbol, positions: bonusCells }
      }
    }
  }

  return null
}
