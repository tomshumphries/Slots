// Utility helper functions

import { WILD_SYMBOL, MEGA_WILD_SYMBOL, TRANSMUTATION_SYMBOL, MULTIPLIER_VALUES } from '../config'

// Helper to check if symbol is a multiplier
export function isMultiplier(symbol: string): boolean {
  return symbol.endsWith('x') && MULTIPLIER_VALUES.some(v => symbol === `${v}x`)
}

// Helper to check if symbol is a wild
export function isWild(symbol: string): boolean {
  return symbol === WILD_SYMBOL
}

// Helper to check if symbol is a mega wild (consumes all matching symbols)
export function isMegaWild(symbol: string): boolean {
  return symbol === MEGA_WILD_SYMBOL
}

// Helper to check if symbol is a transmutation wild (upgrades all matching symbols one tier)
export function isTransmutation(symbol: string): boolean {
  return symbol === TRANSMUTATION_SYMBOL
}

// Helper to check if symbol is any wildcard (multiplier, wild, mega wild, or transmutation)
export function isWildcard(symbol: string): boolean {
  return isMultiplier(symbol) || isWild(symbol) || isMegaWild(symbol) || isTransmutation(symbol)
}

// Get multiplier value from symbol
export function getMultiplierValue(symbol: string): number {
  if (!isMultiplier(symbol)) return 1
  return parseInt(symbol.replace('x', ''))
}
