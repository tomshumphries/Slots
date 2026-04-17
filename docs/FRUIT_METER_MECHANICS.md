# Fruit Meter Mechanics Documentation

## Overview

The fruit meter is a Tome of Madness-style progression system that fills as clusters are matched. Both Normal Play and Bonus Mode now work the same way - just with different target values.

---

## Constants

### Normal Play
- `FRUIT_METER_MAX = 60`
- `FRUIT_METER_BREAKPOINTS = [15, 30, 45, 60]`
- `WILDS_PER_BREAKPOINT = [2, 3, 4, 0]` (9 wilds total before bonus triggers)

### Bonus Mode
- `BONUS_FRUIT_METER_MAX = 100`
- `BONUS_FRUIT_METER_BREAKPOINTS = [25, 50, 75, 100]`
- `BONUS_WILDS_PER_BREAKPOINT = [2, 3, 4, 0]` (9 wilds total before +5 spins)

### Win Calculation
- **No chain multipliers** - cascades fill the meter but don't multiply wins
- **Cluster size multipliers** are the primary scaling factor
- **Symbol multipliers** (2x-20x) provide additional win boosts

---

## Meter Behavior (Both Modes)

Both Normal Play and Bonus Mode now work identically:

### Start of Spin
1. Meter is reset to 0

### During Cascades
1. Find clusters of 7+ matching symbols
2. Count matched symbols
3. Add to meter (capped at max)
4. Update visual
5. Check for breakpoints → spawn wilds
6. Check for full meter → trigger reward (bonus or +5 spins)
7. Cascade (remove matches, drop tiles, fill from top)
8. Repeat until no more matches

### End of Spin
1. Meter resets to 0 (no overflow carries over)

---

## Normal Play Flow

```
Spin starts: meter = 0
Match 20 symbols: meter = 20
Check breakpoints: passed 15 → spawn 2 wilds
Cascade...
Match 15 more: meter = 35
Check breakpoints: passed 30 → spawn 3 wilds
Cascade...
Match 10 more: meter = 45
Check breakpoints: passed 45 → spawn 4 wilds
Cascade...
Match 20 more: meter = 60
Check breakpoints: passed 60 → BONUS TRIGGERED!
Spin ends: meter resets to 0
```

---

## Bonus Mode Flow

Same as normal play, but breakpoints also unlock extra rows:

```
Spin starts: meter = 0
Match 30 symbols: meter = 30
Check breakpoints: passed 25 → spawn 2 wilds + UNLOCK ROW 1
Cascade...
Match 25 more: meter = 55
Check breakpoints: passed 50 → spawn 3 wilds + UNLOCK ROW 2
Cascade...
Match 25 more: meter = 80
Check breakpoints: passed 75 → spawn 4 wilds + UNLOCK ROW 3
Cascade...
Match 25 more: meter = 100
Check breakpoints: passed 100 → +5 FREE SPINS!
Spin ends: meter resets to 0
```

---

## Summary Table

| Aspect | Normal Play | Bonus Mode |
|--------|-------------|------------|
| Meter Max | 60 | 100 |
| Breakpoints | 15, 30, 45, 60 | 25, 50, 75, 100 |
| Wilds per BP | 2, 3, 4, 0 | 2, 3, 4, 0 |
| Row Unlocks | N/A | At 25, 50, 75 (1 row each) |
| Reset at spin start | YES (to 0) | YES (to 0) |
| Reset at spin end | YES (to 0) | YES (to 0) |
| Final reward | Trigger Bonus | +5 Free Spins |

---

## Key Points

1. **Both modes work the same** - just different target values
2. **No overflow** - meter always resets to 0 between spins
3. **No mid-spin consumption** - meter accumulates continuously
4. **Wilds spawn immediately** when breakpoints are passed during cascades
5. **Breakpoints can only be hit once per spin** - no repeating
6. **Row unlocks in bonus mode** - first 3 breakpoints (25, 50, 75) unlock 1 extra row each (max 3 extra rows = 8 total)
