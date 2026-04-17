# Monte Carlo RTP Simulation — Plan

## Aim

Build a simulation mode that runs the slot machine headlessly (no UI, no animations,
no audio) thousands of times, records the result of every spin, and computes the
**Expected Return** E(X) — so we can tune symbol weights, payouts, and bonus
frequency until the machine lands at **~95% RTP**.

We also want charts of E(X) **over time** (running mean) so we can eyeball when
the estimate has converged and confirm the sample size is large enough to drown
out variance.

---

## Where the spin logic lives today

| Piece                                   | Location                                         | State |
|-----------------------------------------|--------------------------------------------------|-------|
| Grid generation, symbol RNG             | [src/logic/symbolGeneration.ts](src/logic/symbolGeneration.ts), [src/logic/gridOperations.ts](src/logic/gridOperations.ts) | Pure — reusable as-is |
| Cluster detection (flood fill)          | [src/logic/clusterDetection.ts](src/logic/clusterDetection.ts) | Pure — reusable |
| Win calculation                         | [src/logic/winCalculation.ts](src/logic/winCalculation.ts) | Pure — reusable |
| Cascade & wild spawning                 | [src/logic/gridOperations.ts](src/logic/gridOperations.ts) | Pure — reusable |
| Meter breakpoint helpers                | [src/logic/meterHelpers.ts](src/logic/meterHelpers.ts) | Pure — reusable |
| **Normal spin orchestration** (the loop that ties the above together: cascade → meter → breakpoint wild spawn → repeat → bonus trigger check) | [SlotMachine.tsx:528-888](src/components/SlotMachine.tsx#L528-L888) | **Tangled with UI** — `setGrid`, `setMessage`, `await setTimeout`, `soundManager`, etc. |
| **Bonus spin orchestration** (free-spin loop, row unlocks, +2/+5 spin rewards) | [SlotMachine.tsx:148-526](src/components/SlotMachine.tsx#L148-L526) | **Tangled with UI** |

### The refactor problem

The pure logic is ready. What's missing is a **headless spin function** that
runs the same outer loop as the React callbacks but returns a plain result
object instead of driving UI state. Every `setX(...)` call, every
`await new Promise(setTimeout)`, every `soundManager.playX()` in the two spin
callbacks is a UI/timing concern — none of it affects the payout. Extracting
the pure part is a straightforward "copy the loop, strip the side effects"
refactor; the math is already isolated in `src/logic/`.

---

## Proposed architecture

### 1. Extract `resolveSpin()` and `resolveBonusRound()` (headless)

New file: **`src/logic/spinResolver.ts`**

```ts
export interface SpinResult {
  totalWin: number             // £ won this spin (not counting bonus)
  bonusTriggered: boolean      // did meter fill?
  chainCount: number           // how many cascade steps
  finalMeter: number
  clustersHit: number
  megaWildTriggered: boolean
}

export function resolveSpin(): SpinResult { ... }

export interface BonusResult {
  totalWin: number             // £ won across the whole bonus round
  freeSpinsUsed: number        // 10 + any +2/+5 rewards
  maxRowsReached: number
  perSpinWins: number[]        // for variance analysis
}

export function resolveBonusRound(): BonusResult { ... }
```

Both functions mirror the existing React callback bodies **exactly** for game
math — same cascade loop, same cluster detection, same meter logic, same
breakpoint wild spawning — but with all `setState`, `await`, and sound calls
removed. We then refactor `spin()` / `bonusSpin()` in `SlotMachine.tsx` to
call these resolvers and animate the resulting state transitions, so the
UI and the sim cannot drift out of sync. **Single source of truth for
payouts.**

### 2. Simulation runner

New file: **`src/sim/simRunner.ts`** (runs in browser, ideally in a Web Worker
so the UI stays responsive for large runs).

Two independent batches per run, matching the user's plan:

**Batch A — Normal spins** (N = 1000 by default)
- Call `resolveSpin()` N times.
- Per spin, record: `totalWin`, `bonusTriggered` (boolean), `chainCount`.
- Compute: mean win per spin (excluding bonus EV), bonus trigger frequency
  `p_bonus = bonusHits / N`.

**Batch B — Bonus rounds in isolation** (M = 1000 by default)
- Call `resolveBonusRound()` M times.
- Per round, record: `totalWin`, `freeSpinsUsed`, `maxRowsReached`.
- Compute: `E(bonus) = mean(totalWin)`.

**Combined RTP** (cost per spin = £1):

```
E(X per spin) = E(normal_win_excluding_bonus) + p_bonus * E(bonus)
RTP          = E(X per spin) / BET_AMOUNT
```

We report both batch-level stats and the combined RTP. Running sum is kept so
we can plot E(X) at every sample — that's the convergence chart.

### 3. Output format

Write one file per run to **`sim-results/`** at repo root (committed to git — run history is valuable).

Filename: `sim-<timestamp>-<label>.json` (e.g. `sim-2026-04-17_14-03_baseline.json`)

```jsonc
{
  "meta": {
    "runId": "sim-2026-04-17_14-03_baseline",
    "timestamp": "2026-04-17T14:03:22Z",
    "normalSpins": 1000,
    "bonusSpins": 1000,
    "config": { /* snapshot of SYMBOL_WEIGHTS, payouts, multiplier chances, etc. */ },
    "seed": null      // true Math.random() — no seeding, sample size provides stability
  },
  "summary": {
    "pBonus": 0.012,
    "eNormalWinExclBonus": 0.41,
    "eBonus": 48.7,
    "eTotalPerSpin": 0.994,
    "rtp": 0.994
  },
  "normalSeries": [
    { "i": 1, "win": 0, "bonus": false, "runningMean": 0 },
    { "i": 2, "win": 1.5, "bonus": false, "runningMean": 0.75 },
    ...
  ],
  "bonusSeries": [
    { "i": 1, "win": 42.1, "freeSpinsUsed": 12, "runningMean": 42.1 },
    ...
  ]
}
```

`runningMean` is the series we plot to watch E(X) settle. (If file size gets
heavy with 10k+ samples, switch `normalSeries` / `bonusSeries` to JSONL and
keep only the summary in JSON.)

### 4. UI screen

New route / tab: **Simulation Lab**. No slot-machine graphics needed — just
controls and charts.

**Inputs:**
- Run label (free text)
- Normal spin count (default 1000)
- Bonus spin count (default 1000)
- "Run" / "Cancel" buttons

**Live outputs while running:**
- Progress bar per batch
- Current running E(X) for normal, bonus, combined RTP
- Two line charts: running mean over sample index for each batch
- The chart makes the "is 1000 enough?" question visually obvious — when the
  curve stops moving, you're converged.

**Post-run:**
- Final summary card (p_bonus, E(bonus), RTP, 95% confidence interval)
- "Save results" button → writes the JSON file
- History list of past runs for comparison

### 5. File writing

A small Vite dev-server middleware in `vite.config.ts` accepts POST
`/api/write-sim` with the JSON body and writes to `sim-results/<filename>`.
One-click save from the UI; only active in `npm run dev` (not in production
build, which is fine for a local tooling screen).

`sim-results/` is committed to git so run history is preserved alongside the
config snapshot that produced it.

As the project grows server-side, this endpoint is the natural seam for
moving other compute (e.g. bulk overnight runs via Node CLI) without
changing the UI contract.

---

## Success criteria

- A run of 1000 normal + 1000 bonus completes in **under 10s** in-browser
  (Web Worker, no UI).
- The running-mean chart visibly flattens well before the end of the run —
  if it doesn't, the UI prompts "increase sample size."
- The 95% CI on RTP is reported alongside the point estimate. Rule of thumb
  we should aim for: CI half-width ≤ 0.5 percentage points. If a 1000-spin
  run gives ±2%, we need more spins.
- Tweaking a config constant (e.g. `SYMBOL_PAYOUTS['💎']`) and re-running
  moves RTP in the direction you'd expect.
- `SlotMachine.tsx` uses the same resolver, so UI wins match simulated wins
  over large samples.

---

## Implementation phases

1. ✅ **Extract `resolveSpin()`** — `src/logic/spinResolver.ts`. Mirrors `spin()`
   in `SlotMachine.tsx`: outer/inner cascade loop, meter tracking, mega wild
   expansion, breakpoint wild spawning, bonus trigger detection.
2. ✅ **Extract `resolveBonusRound()`** — same file. Mirrors `bonusSpin()`:
   10 starting free spins, row unlocks, +2 spin reward on meter fill, inline
   wild spawning in cascade loop.
3. **Refactor `SlotMachine.tsx`** to drive animations off the resolver's
   result rather than computing as it goes. (Prevents drift between UI and sim.)
   *Deferred — lower priority while sim is being validated.*
4. ✅ **Build `simRunner`** — `src/sim/simRunner.ts`. Two batches (normal +
   bonus), running mean per sample, 95% CI calculation, AbortSignal cancellation,
   progress callbacks every 50 samples.
5. ✅ **Web Worker wrapper** — `src/sim/sim.worker.ts`. Runs sim off the main
   thread; streams progress messages back to the UI.
6. ✅ **Sim Lab UI** — `src/components/SimLab.tsx` + `SimLab.css`. Config form,
   live progress bars, Recharts convergence charts for both batches, final
   summary stat grid with 95% CI, save button. Accessible from the "Simulation
   Lab" tab in the main nav.
7. ✅ **File output** — Vite plugin in `vite.config.ts` handles POST
   `/api/write-sim` and writes `sim-results/<runId>.json`. `sim-results/`
   committed to git.
8. **(Stretch) Node CLI runner** for very large overnight runs.

---

## Decisions log

| Question | Decision |
|---|---|
| RNG | True `Math.random()` — no seeding. Large samples provide stability. |
| File write | Vite dev-server middleware → auto-writes to `sim-results/` |
| Git | `sim-results/` committed — run history preserved with config snapshots |
| Charts | Recharts (best React-native DX, ~40KB gzipped) |
| EV counting | Option A — normal batch excludes bonus; E(bonus) from batch B, combined separately |
