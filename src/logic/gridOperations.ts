// Grid generation and manipulation functions

import { COLS, BASE_ROWS, WILD_SYMBOL } from '../config'
import { isWildcard } from '../utils/helpers'
import { randomSymbol, randomBonusSymbol } from './symbolGeneration'
import type { CascadeResult, SpawnResult } from '../types'

// Generate a random grid with specified row count
export function generateGrid(rowCount: number = BASE_ROWS): string[][] {
  return Array(COLS).fill(null).map(() =>
    Array(rowCount).fill(null).map(() => randomSymbol(false))
  )
}

// Generate a bonus mode grid (includes multipliers)
export function generateBonusGrid(rowCount: number): string[][] {
  return Array(COLS).fill(null).map(() =>
    Array(rowCount).fill(null).map(() => randomBonusSymbol())
  )
}

// Spawn wild symbols at random positions on the grid (for fruit meter breakpoints)
// Returns the modified grid and positions where wilds were spawned
export function spawnWilds(
  grid: string[][],
  count: number,
  activeRows: number
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
    const j = Math.floor(Math.random() * (i + 1))
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

// Remove matched cells and drop tiles down, fill from top
// Returns new grid and set of cells that moved/are new
export function cascadeGrid(
  grid: string[][],
  matchedCells: Set<string>,
  activeRows: number = BASE_ROWS,
  isBonusMode: boolean = false
): CascadeResult {
  const newGrid = grid.map(col => [...col])
  const movedCells = new Set<string>()
  const newCells = new Set<string>()

  for (let col = 0; col < COLS; col++) {
    // Get cells to remove in this column
    const toRemove: number[] = []
    for (let row = 0; row < activeRows; row++) {
      if (matchedCells.has(`${col}-${row}`)) {
        toRemove.push(row)
      }
    }

    if (toRemove.length > 0) {
      // Track which symbols are remaining and their original positions
      const remaining: { symbol: string, originalRow: number }[] = []
      for (let row = 0; row < activeRows; row++) {
        if (!toRemove.includes(row)) {
          remaining.push({ symbol: newGrid[col][row], originalRow: row })
        }
      }

      // Generate new symbols (use bonus symbols in bonus mode)
      const newSymbols = Array(toRemove.length).fill(null).map(() =>
        isBonusMode ? randomBonusSymbol() : randomSymbol(false)
      )

      // Build new column: new symbols at top, then remaining
      const newColumn = [...newSymbols, ...remaining.map(r => r.symbol)]
      newGrid[col] = newColumn

      // Mark new cells (top positions)
      for (let row = 0; row < toRemove.length; row++) {
        newCells.add(`${col}-${row}`)
      }

      // Mark cells that moved (remaining cells that shifted down)
      for (let i = 0; i < remaining.length; i++) {
        const newRow = toRemove.length + i
        const originalRow = remaining[i].originalRow
        if (newRow !== originalRow) {
          movedCells.add(`${col}-${newRow}`)
        }
      }
    }
  }

  return { newGrid, movedCells, newCells }
}
