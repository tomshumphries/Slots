# Game Configuration System

## Overview

All gameplay constants live in a single object: `GAME_CONFIG`, defined in [`src/config/gameConfig.ts`](../src/config/gameConfig.ts).

**The rule:** if a number affects game balance, behaviour, or player-facing text, it belongs in `GAME_CONFIG`. Change it once there and every piece of code that reads it updates automatically — including UI labels, simulation runners, and win logic.

---

## Structure

```
GAME_CONFIG
├── grid              — board dimensions, minimum cluster size
├── economy           — bet amount, deposit amount, big win threshold
├── symbols           — regular symbols, special symbols, weights, payouts, spawn chances
├── clusters          — size-tier table that drives payout multipliers
├── multipliers       — values, weights, per-mode chances, sticky cap
├── fruitMeter        — normal and bonus meter config (max, breakpoints, wilds)
├── bonusRound        — free spin count, finale wilds
└── simulation        — RTP target, healthy range, default inputs
```

---

## Importing

```typescript
// The config object — use for new code
import { GAME_CONFIG } from '../config'

// Legacy named exports — still available for existing code, all derived from GAME_CONFIG
import { FRUIT_METER_MAX, STICKY_MULTIPLIER_CAP, BET_AMOUNT } from '../config'
```

The legacy named exports in [`src/config/index.ts`](../src/config/index.ts) are thin aliases pointing into `GAME_CONFIG`. They exist so old code doesn't need to change, but new code should use `GAME_CONFIG` directly.

---

## Section Reference

### `grid`

| Key | Value | Description |
|-----|-------|-------------|
| `cols` | 12 | Number of columns on the board |
| `rows` | 5 | Number of rows |
| `minClusterSize` | 7 | Minimum connected symbols to form a winning cluster |

### `economy`

| Key | Value | Description |
|-----|-------|-------------|
| `betAmount` | £1 | Cost per spin |
| `depositAmount` | £5 | Amount credited by the deposit button |
| `bigWinThreshold` | £20 | Win floor that triggers the big win celebration screen |

### `symbols`

| Key | Description |
|-----|-------------|
| `regular` | `['🍒', '🍀', '🍇', '🔔', '💎']` — ordered common → rare |
| `wild` | `'⭐'` — bridges gaps in clusters |
| `megaWild` | `'🔮'` — clears all matching symbols on the grid when it wins |
| `transmutation` | `'🌀'` — upgrades all matching symbols one tier when it wins |
| `weights` | Relative spawn frequency per symbol (sums to 100, reads as %) |
| `payouts` | Base £ payout per winning cluster at minimum cluster size |
| `defaultPayout` | `0.5` — fallback if a symbol has no entry in `payouts` |
| `spawnChances.normal` | Per-cell probabilities for megaWild / transmutation in normal play |
| `spawnChances.bonus` | Same for bonus mode (higher rates) |

**Symbol weights:**

| Symbol | Weight | Approx. frequency |
|--------|--------|--------------------|
| 🍒 | 30 | 30% |
| 🍀 | 25 | 25% |
| 🍇 | 22 | 22% |
| 🔔 | 15 | 15% |
| 💎 | 8 | 8% |

**Base payouts** (at minimum cluster size, ×betAmount):

| Symbol | Payout |
|--------|--------|
| 🍒 | £0.265 |
| 🍀 | £0.425 |
| 🍇 | £0.64 |
| 🔔 | £1.07 |
| 💎 | £2.65 |

### `clusters`

`sizeTiers` is an ordered array (largest first). `getClusterSizeMultiplier()` walks it and returns the multiplier for the first tier whose `minSize` the cluster meets.

| Min size | Multiplier |
|----------|------------|
| 25+ | ×12.0 |
| 20+ | ×8.0 |
| 15+ | ×5.0 |
| 12+ | ×3.0 |
| 10+ | ×2.0 |
| 8+ | ×1.4 |
| 7+ | ×1.0 |

**Final win formula:** `payout[symbol] × sizeTierMultiplier × multiplierTotal × betAmount`

### `multipliers`

| Key | Description |
|-----|-------------|
| `allValues` | `[2, 3, 5, 10, 20]` — all possible multiplier symbols |
| `weights` | Relative rarity within the multiplier pool |
| `normal.chance` | `0.005` — ~0.5% per cell in normal play |
| `normal.availableValues` | `[2, 3, 5, 10]` — 20× is bonus-only |
| `bonus.chance` | `0.014` — ~1.4% per cell in bonus mode |
| `bonus.availableValues` | `[2, 3, 5, 10, 20]` |
| `stickyCapDuringBonus` | `8` — max grid positions that can hold sticky multipliers |

### `fruitMeter`

Both modes share the same shape. The bonus meter resets each spin; filling it awards extra free spins.

| Key | Normal | Bonus |
|-----|--------|-------|
| `max` | 40 | 50 |
| `breakpoints` | `[10, 20, 30, 40]` | `[12, 25, 38, 50]` |
| `wildsPerBreakpoint` | `[2, 3, 4, 0]` | `[2, 3, 4, 0]` |
| `extraSpinsOnFill` | — | 2 |

A `0` at the last breakpoint means that breakpoint triggers a reward (bonus trigger / extra spins) rather than spawning wilds.

### `bonusRound`

| Key | Value | Description |
|-----|-------|-------------|
| `freeSpins` | 8 | Free spins awarded when bonus is triggered |
| `finalePreseededWilds` | 5 | Wilds placed on the grid before the final spin begins |

### `simulation`

| Key | Value | Description |
|-----|-------|-------------|
| `targetRtpPercent` | 95 | Design target RTP shown in SimLab |
| `rtpHealthyRange` | 92–98% | Green/red badge threshold in saved runs list |
| `defaults.normalSpins` | 10,000 | Default spin count for a new sim run |
| `defaults.bonusRounds` | 1,000 | Default bonus rounds |
| `defaults.timeLimitSeconds` | 30 | Default time-limited run duration |
| `maxNormalSpins` | 10,000,000 | Upper bound on the normal spins input |

---

## How to change a value

Open [`src/config/gameConfig.ts`](../src/config/gameConfig.ts) and edit the number. That's it.

**Example — change bonus free spins from 8 to 10:**

```typescript
bonusRound: {
  freeSpins: 10,   // ← change here
  finalePreseededWilds: 5,
},
```

The following all update automatically without any further edits:
- `startBonusMode()` in SlotMachine — sets the correct free spin count
- The "BONUS MODE! N Free Spins!" message
- The "Meter Full — N FREE SPINS!" banner and modal text
- `resolveBonusRound()` in the simulation runner

---

## Architecture notes

`src/config/index.ts` exports both `GAME_CONFIG` and a set of backwards-compatible named constants (e.g. `FRUIT_METER_MAX`). These named constants are derived values — they are simple aliases into `GAME_CONFIG` — so there is no duplication. The individual old config files (`grid.ts`, `symbols.ts`, `multipliers.ts`, `fruitMeter.ts`) are now empty shells retained only to avoid stale import errors; their content has fully moved to `gameConfig.ts`.
