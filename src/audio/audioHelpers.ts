// Audio helper functions for playing win/bonus sounds

import { WIN_SOUND_TIERS, BONUS_SOUND } from '../config'
import { soundManager } from './SoundManager'

// Play win sound based on win amount
export function playWinSound(winAmount: number): void {
  for (const tier of WIN_SOUND_TIERS) {
    if (winAmount >= tier.threshold) {
      soundManager.playFileSound(tier.sound)
      return
    }
  }
}

// Play bonus sound
export function playBonusSound(): void {
  soundManager.playFileSound(BONUS_SOUND)
}
