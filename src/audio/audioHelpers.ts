// Audio helper functions for playing win/bonus sounds

import { WIN_SOUND_TIERS, BONUS_SOUND } from '../config'

// Play win sound based on win amount
export function playWinSound(winAmount: number): void {
  for (const tier of WIN_SOUND_TIERS) {
    if (winAmount >= tier.threshold) {
      new Audio(tier.sound).play().catch(() => {})
      return
    }
  }
}

// Play bonus sound
export function playBonusSound(): void {
  new Audio(BONUS_SOUND).play().catch(() => {})
}
