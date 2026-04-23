# Fruit Meter Mechanics

## Overview

The fruit meter is a Tome of Madness-style progression system. It fills as clusters are matched during cascades. Crossing a breakpoint spawns wilds onto the grid; filling the meter to its maximum triggers a major reward.

> **Authoritative values** live in `GAME_CONFIG.fruitMeter` in [`src/config/gameConfig.ts`](../src/config/gameConfig.ts). The numbers below are for reference — do not edit them here independently.

---

## Current Values

### Normal Play

| Constant | Value |
|----------|-------|
| Max | 40 |
| Breakpoints | 10, 20, 30, 40 |
| Wilds per breakpoint | 2, 3, 4, 0 |
| Reward at max | Bonus mode triggered |

### Bonus Mode

| Constant | Value |
|----------|-------|
| Max | 50 |
| Breakpoints | 12, 25, 38, 50 |
| Wilds per breakpoint | 2, 3, 4, 0 |
| Reward at max | +2 free spins |

The `0` wilds at the final breakpoint is intentional — that slot triggers the reward rather than spawning wilds.

---

## Behavior

### Normal Play

The meter accumulates across all cascades within a single spin. It **does not reset between cascades** — only between spins. Crossing a breakpoint spawns wilds immediately, which can trigger further cascades. Filling the meter to max triggers bonus mode; the current value carries over as overfill at the start of bonus.

```
Spin starts: meter = 0
Match 14 symbols → meter = 14 (no breakpoint yet)
Cascade...
Match 8 more → meter = 22, crossed BP 10 → spawn 2 wilds, crossed BP 20 → spawn 3 wilds
Cascade...
Match 20 more → meter = 42, crossed BP 30 → spawn 4 wilds, crossed BP 40 → BONUS TRIGGERED
```

### Bonus Mode

The meter **resets to 0 at the start of every free spin**. Only one fill event is awarded per spin (capped to prevent runaway feedback with sticky multipliers). Filling the meter awards +2 free spins then resets.

```
Free spin starts: meter = 0
Match 15 symbols → meter = 15, crossed BP 12 → spawn 2 wilds
Cascade...
Match 40 more → meter = 55 ≥ 50 → +2 FREE SPINS awarded, meter resets
Spin ends
```

---

## Summary Table

| Aspect | Normal Play | Bonus Mode |
|--------|-------------|------------|
| Max | 40 | 50 |
| Breakpoints | 10, 20, 30, 40 | 12, 25, 38, 50 |
| Wilds per BP | 2, 3, 4, 0 | 2, 3, 4, 0 |
| Resets between cascades | No | No |
| Resets between spins | Yes | Yes (each free spin) |
| Overfill carries over | Yes → into bonus | No |
| Final reward | Bonus triggered | +2 free spins |
| Reward cap per spin | N/A | Once per free spin |

---

## Key Points

1. Meter accumulates continuously within a spin — it does not reset between cascades
2. Breakpoints can only be crossed once per spin (direction: upward only)
3. Wilds spawn immediately when a breakpoint is crossed, which can trigger further cascades
4. In bonus mode, the fill reward is capped to once per spin to prevent exponential spin accumulation with sticky multipliers
