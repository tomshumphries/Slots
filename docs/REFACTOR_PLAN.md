# Refactoring Plan

## Current State

The codebase has grown significantly and is currently concentrated in just a few files:

| File | Lines | Description |
|------|-------|-------------|
| `SlotMachine.tsx` | 2,062 | Everything - config, logic, sounds, UI |
| `SlotMachine.css` | 1,661 | All styles in one file |
| `App.tsx` | 26 | Main app wrapper |
| `Menu.tsx` | ~100 | Menu component |

**Total: ~3,850 lines in 2 main files**

---

## Proposed Structure

```
src/
├── components/
│   ├── SlotMachine/
│   │   ├── index.tsx                 # Main component (re-export)
│   │   ├── SlotMachine.tsx           # Main component logic
│   │   ├── SlotMachine.css           # Core slot machine styles
│   │   ├── Grid.tsx                  # Grid display component
│   │   ├── Grid.css                  # Grid styles
│   │   ├── FruitMeter.tsx            # Fruit meter component
│   │   ├── FruitMeter.css            # Fruit meter styles
│   │   ├── AdminPanel.tsx            # Admin controls component
│   │   ├── AdminPanel.css            # Admin panel styles
│   │   ├── InfoCards.tsx             # Info cards component
│   │   ├── InfoCards.css             # Info cards styles
│   │   └── modals/
│   │       ├── BonusModal.tsx        # Bonus trigger modal
│   │       ├── BonusEndModal.tsx     # Bonus complete modal
│   │       ├── PayoutInfoModal.tsx   # Payout info modal
│   │       └── Modals.css            # Shared modal styles
│   └── Menu/
│       ├── Menu.tsx
│       └── Menu.css
├── config/
│   ├── index.ts                      # Re-export all config
│   ├── symbols.ts                    # Symbol definitions, weights, payouts
│   ├── multipliers.ts                # Multiplier values, weights
│   ├── fruitMeter.ts                 # Fruit meter breakpoints, rewards
│   ├── grid.ts                       # Grid dimensions, cluster sizes
│   └── audio.ts                      # Audio file paths, thresholds
├── logic/
│   ├── index.ts                      # Re-export all logic
│   ├── gridOperations.ts             # generateGrid, cascadeGrid, spawnWilds
│   ├── clusterDetection.ts           # findClusters, flood fill algorithm
│   ├── winCalculation.ts             # calculateClusterWin, getClusterSizeMultiplier
│   ├── symbolGeneration.ts           # randomSymbol, randomBonusSymbol
│   └── meterHelpers.ts               # getNewBreakpointIndices, getHighestPassedBreakpoint
├── audio/
│   ├── SoundManager.ts               # SoundManager class
│   └── audioHelpers.ts               # playWinSound, playBonusSound
├── types/
│   └── index.ts                      # All TypeScript interfaces and types
├── hooks/
│   ├── useGameState.ts               # Main game state hook
│   ├── useBonusMode.ts               # Bonus mode state and logic
│   ├── useAutoSpin.ts                # Auto-spin functionality
│   └── useAudioSettings.ts           # Audio volume settings
├── utils/
│   └── helpers.ts                    # isMultiplier, isWild, isWildcard, etc.
├── App.tsx
├── App.css
├── main.tsx
└── index.css
```

---

## Detailed Breakdown

### 1. Config (`src/config/`)

Extract all constants into separate, organized files:

**`symbols.ts`**
```typescript
export const SYMBOLS = ['🍒', '🍀', '🍇', '🔔', '💎']
export const WILD_SYMBOL = '⭐'
export const SYMBOL_WEIGHTS = { ... }
export const SYMBOL_PAYOUTS = { ... }
```

**`multipliers.ts`**
```typescript
export const MULTIPLIER_VALUES = [2, 3, 5, 10, 20] as const
export const NORMAL_MULTIPLIER_VALUES = [2, 3, 5, 10] as const
export const MULTIPLIER_WEIGHTS = { ... }
export const NORMAL_MULTIPLIER_CHANCE = 0.005
export const BONUS_MULTIPLIER_FREQUENCY = 1.4
```

**`fruitMeter.ts`**
```typescript
// Normal mode
export const FRUIT_METER_MAX = 60
export const FRUIT_METER_BREAKPOINTS = [15, 30, 45, 60]
export const WILDS_PER_BREAKPOINT = [2, 3, 4, 0]

// Bonus mode
export const BONUS_FRUIT_METER_MAX = 100
export const BONUS_FRUIT_METER_BREAKPOINTS = [25, 50, 75, 100]
export const BONUS_WILDS_PER_BREAKPOINT = [2, 3, 4, 0]
```

**`grid.ts`**
```typescript
export const COLS = 12
export const BASE_ROWS = 5
export const MAX_BONUS_ROWS = 3
export const MIN_CLUSTER_SIZE = 7
export const BET_AMOUNT = 1
```

**`audio.ts`**
```typescript
export const WIN_SOUND_TIERS = [ ... ]
export const BONUS_SOUND = '/audio/bonus_proc.ogg'
```

---

### 2. Types (`src/types/`)

**`index.ts`**
```typescript
export interface SlotMachineProps {
  balance: number
  onBalanceChange: (amount: number) => void
}

export type MultiplierValue = 2 | 3 | 5 | 10 | 20

export interface ClusterResult {
  win: number
  multipliers: number[]
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

export interface GameState {
  grid: string[][]
  spinning: boolean
  matches: Map<string, string>
  // ... etc
}
```

---

### 3. Utils (`src/utils/`)

**`helpers.ts`**
```typescript
export function isMultiplier(symbol: string): boolean
export function isWild(symbol: string): boolean
export function isWildcard(symbol: string): boolean
export function getMultiplierValue(symbol: string): number
```

---

### 4. Logic (`src/logic/`)

**`gridOperations.ts`**
```typescript
export function generateGrid(rowCount?: number): string[][]
export function generateBonusGrid(rowCount: number): string[][]
export function cascadeGrid(...): CascadeResult
export function spawnWilds(...): SpawnResult
```

**`clusterDetection.ts`**
```typescript
export function findClusters(grid, minSize, activeRows): Set<string>[]
// Internal: floodFill function
```

**`winCalculation.ts`**
```typescript
export function getClusterSizeMultiplier(size: number): number
export function calculateClusterWin(grid, clusters): ClusterResult
```

**`symbolGeneration.ts`**
```typescript
export function randomSymbol(inCascade?: boolean): string
export function randomBonusSymbol(): string
```

**`meterHelpers.ts`**
```typescript
export function getNewBreakpointIndices(current, previous, breakpoints?): number[]
export function getHighestPassedBreakpoint(meterValue, breakpoints?): number
```

---

### 5. Audio (`src/audio/`)

**`SoundManager.ts`**
- Extract the entire `SoundManager` class
- Export singleton instance

**`audioHelpers.ts`**
```typescript
export function playWinSound(winAmount: number): void
export function playBonusSound(): void
```

---

### 6. Hooks (`src/hooks/`)

**`useGameState.ts`**
```typescript
export function useGameState() {
  // Grid state
  // Match state
  // Spin state
  // Message state
  return { grid, setGrid, spinning, ... }
}
```

**`useBonusMode.ts`**
```typescript
export function useBonusMode() {
  // Bonus mode state
  // Free spins
  // Unlocked rows
  // Bonus total win
  return { bonusMode, freeSpins, ... }
}
```

**`useAutoSpin.ts`**
```typescript
export function useAutoSpin(spinFn, balance, bonusMode) {
  // Auto-spin logic
  // Auto-deposit logic
  return { autoSpin, setAutoSpin, autoDeposit, setAutoDeposit }
}
```

---

### 7. Components

**`Grid.tsx`** (~150 lines)
- Grid rendering
- Cell rendering logic
- Match color classes
- Spinning/settled states

**`FruitMeter.tsx`** (~80 lines)
- Vertical meter display
- Breakpoint markers
- Normal vs bonus mode display

**`AdminPanel.tsx`** (~120 lines)
- Auto-spin toggle
- Auto-deposit toggle
- Volume sliders
- Test buttons

**`InfoCards.tsx`** (~150 lines)
- Normal play info card
- Bonus mode info card
- Bonus preview section

**`modals/BonusModal.tsx`** (~40 lines)
- Bonus triggered modal

**`modals/BonusEndModal.tsx`** (~50 lines)
- Bonus complete celebration modal
- Win count-up animation

**`modals/PayoutInfoModal.tsx`** (~200 lines)
- Detailed payout tables
- All game mechanics

---

### 8. CSS Splitting

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `SlotMachine.css` | Core layout, controls, messages | ~200 |
| `Grid.css` | Grid, cells, animations | ~400 |
| `FruitMeter.css` | Meter styles, breakpoints | ~200 |
| `AdminPanel.css` | Admin panel styles | ~100 |
| `InfoCards.css` | Info card styles | ~250 |
| `Modals.css` | All modal styles | ~400 |
| `variables.css` | CSS custom properties (colors, etc.) | ~50 |

---

## Migration Order

### Phase 1: Config & Types (Low Risk) ✅ COMPLETE
1. ✅ Create `src/config/` with all constants
2. ✅ Create `src/types/` with interfaces
3. ✅ Create `src/utils/helpers.ts`
4. ✅ Update imports in SlotMachine.tsx
5. ✅ **Tested - Build successful**

### Phase 2: Logic Functions (Medium Risk) ✅ COMPLETE
1. ✅ Create `src/logic/` with all pure functions
2. ✅ Create `src/audio/` with SoundManager
3. ✅ Update imports in SlotMachine.tsx
4. ✅ **Tested - Build successful**

### Phase 3: Sub-Components (Medium Risk)
1. Extract `AdminPanel` component
2. Extract `FruitMeter` component
3. Extract `InfoCards` component
4. Extract modal components
5. **Test each extraction**

### Phase 4: Grid Component (Higher Risk)
1. Extract `Grid` component with all cell rendering
2. Pass necessary props and callbacks
3. **Test thoroughly**

### Phase 5: Custom Hooks (Optional)
1. Extract game state into hooks
2. Simplify main component
3. **Test thoroughly**

### Phase 6: CSS Splitting
1. Create `variables.css` with shared values
2. Split CSS into component-specific files
3. Update imports
4. **Visual regression testing**

---

## Estimated Final Line Counts

| File | Lines |
|------|-------|
| `SlotMachine.tsx` | ~400 (main logic, spin functions) |
| `Grid.tsx` | ~150 |
| `FruitMeter.tsx` | ~80 |
| `AdminPanel.tsx` | ~120 |
| `InfoCards.tsx` | ~150 |
| `PayoutInfoModal.tsx` | ~200 |
| `BonusModal.tsx` | ~40 |
| `BonusEndModal.tsx` | ~50 |
| Config files (total) | ~150 |
| Logic files (total) | ~300 |
| Audio files (total) | ~450 |
| Types/Utils | ~100 |
| **Total** | ~2,190 |

The total line count stays similar, but is now organized across ~20 focused files instead of 2 monolithic ones.

---

## Benefits

1. **Easier to navigate** - Find what you need quickly
2. **Easier to test** - Pure functions can be unit tested
3. **Easier to modify** - Changes isolated to specific files
4. **Better code reuse** - Config and logic can be imported anywhere
5. **Clearer ownership** - Each file has a single responsibility
6. **Better IDE support** - Smaller files = faster intellisense

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking functionality | Test after each phase |
| Circular imports | Careful dependency ordering |
| Prop drilling | Consider context for deeply nested data |
| CSS specificity issues | Use consistent naming conventions |
| Lost during refactor | Git commits after each phase |

---

## Ready to Proceed?

Let me know when you'd like to start. I recommend beginning with **Phase 1 (Config & Types)** as it's the lowest risk and provides immediate organization benefits.
