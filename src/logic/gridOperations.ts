// Grid generation and manipulation functions

import { COLS, BASE_ROWS, WILD_SYMBOL } from '../config'
import { isWildcard } from '../utils/helpers'
import { randomSymbol, randomBonusSymbol } from './symbolGeneration'
import type { Rng } from './rng'
import type { CascadeResult, SpawnResult } from '../types'

// Generate a random grid with specified row count
export function generateGrid(rowCount: number = BASE_ROWS, rng: Rng = Math.random): string[][] {
  return Array(COLS).fill(null).map(() =>
    Array(rowCount).fill(null).map(() => randomSymbol(false, rng))
  )
}

// Generate a bonus mode grid (includes multipliers)
export function generateBonusGrid(rowCount: number, rng: Rng = Math.random): string[][] {
  return Array(COLS).fill(null).map(() =>
    Array(rowCount).fill(null).map(() => randomBonusSymbol(rng))
  )
}

// Spawn wild symbols at random positions on the grid (for fruit meter breakpoints)
// Returns the modified grid and positions where wilds were spawned
export function spawnWilds(
  grid: string[][],
  count: number,
  activeRows: number,
  rng: Rng = Math.random
): SpawnResult {
  const newGrid = grid.map(col => [...col])
  const spawnedPositions: string[] = []

  // Get all valid positions (non-wildcard cells)
  const validPositions: string[] = []
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < activeRows; row++) {
      if (!isWildcard(newGrid[col][row])) {
        validPositions.push(`${col}-${row}`)
      }
    }
  }

  // Shuffle and pick random positions
  for (let i = validPositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]]
  }

  // Spawn wilds at selected positions
  const positionsToUse = validPositions.slice(0, Math.min(count, validPositions.length))

  for (const pos of positionsToUse) {
    const [col, row] = pos.split('-').map(Number)
    newGrid[col][row] = WILD_SYMBOL
    spawnedPositions.push(pos)
  }

  return { newGrid, spawnedPositions }
}

// Remove matched cells and drop tiles down, fill from top.
// fixedCells are immovable (sticky multipliers in bonus) — gravity applies per-segment between them.
export function cascadeGrid(
  grid: string[][],
  matchedCells: Set<string>,
  activeRows: number = BASE_ROWS,
  isBonusMode: boolean = false,
  fixedCells: Set<string> = new Set(),
  rng: Rng = Math.random
): CascadeResult {
  const newGrid = grid.map(col => [...col])
  const movedCells = new Set<string>()
  const newCells = new Set<string>()

  for (let col = 0; col < COLS; col++) {
    // Collect fixed rows for this column (sorted ascending)
    const fixedRows: number[] = []
    for (let row = 0; row < activeRows; row++) {
      if (fixedCells.has(`${col}-${row}`)) fixedRows.push(row)
    }

    // Build segments: ranges of non-fixed rows, split at each fixed row
    const segStarts: number[] = [0]
    const segEnds: number[] = []
    for (const fr of fixedRows) {
      segEnds.push(fr - 1)
      segStarts.push(fr + 1)
    }
    segEnds.push(activeRows - 1)

    for (let s = 0; s < segStarts.length; s++) {
      const start = segStarts[s]
      const end = segEnds[s]
      if (start > end) continue

      const toRemove: number[] = []
      for (let row = start; row <= end; row++) {
        if (matchedCells.has(`${col}-${row}`)) toRemove.push(row)
      }
      if (toRemove.length === 0) continue

      const remaining: { symbol: string; originalRow: number }[] = []
      for (let row = start; row <= end; row++) {
        if (!toRemove.includes(row)) {
          remaining.push({ symbol: newGrid[col][row], originalRow: row })
        }
      }

      const newSymbols = Array(toRemove.length).fill(null).map(() =>
        isBonusMode ? randomBonusSymbol(rng) : randomSymbol(false, rng)
      )

      // New symbols at top of segment, remaining compact to bottom
      const segContent = [...newSymbols, ...remaining.map(r => r.symbol)]
      for (let i = 0; i < segContent.length; i++) {
        const row = start + i
        newGrid[col][row] = segContent[i]
        if (i < toRemove.length) {
          newCells.add(`${col}-${row}`)
        } else {
          const origRow = remaining[i - toRemove.length].originalRow
          if (row !== origRow) movedCells.add(`${col}-${row}`)
        }
      }
    }
  }

  return { newGrid, movedCells, newCells }
}
