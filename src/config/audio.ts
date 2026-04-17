// Audio configuration

// Audio files for wins based on win amount (ordered high to low)
export const WIN_SOUND_TIERS = [
  { threshold: 100, sound: '/audio/max_win.ogg' },         // £100+ (jackpot!)
  { threshold: 50, sound: '/audio/unbelievable_win.ogg' }, // £50+
  { threshold: 20, sound: '/audio/mega_win.ogg' },         // £20+
  { threshold: 10, sound: '/audio/huge_win.ogg' },         // £10+
  { threshold: 5, sound: '/audio/big_win.ogg' },           // £5+
]

export const BONUS_SOUND = '/audio/bonus_proc.ogg'
