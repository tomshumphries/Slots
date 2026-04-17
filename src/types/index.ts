// TypeScript type definitions

export interface SlotMachineProps {
  balance: number
  onBalanceChange: (amount: number) => void
}

export interface ClusterResult {
  win: number
  multipliers: number[]
  hasWild: boolean
  hasMegaWild: boolean
}

export interface CascadeResult {
  newGrid: string[][]
  movedCells: Set<string>
  newCells: Set<string>
}

export interface SpawnResult {
  newGrid: string[][]
  spawnedPositions: string[]
}

// Re-export MultiplierValue from config
export type { MultiplierValue } from '../config/multipliers'
