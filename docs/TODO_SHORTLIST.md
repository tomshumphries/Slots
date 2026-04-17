# Next Task Shortlist

In depth look at your next task:

---

## Task 1: Add Cascade Mechanics (Bejeweled-style)

### Goal
When 3+ symbols match, they should disappear and new symbols should "fall" into place from above, potentially causing chain reactions.

### Requirements
- Matched symbols animate out (shrink/fade)
- Empty cells fill from top as new symbols "drop" in
- Check for new matches after cascade
- Each cascade in a chain multiplies winnings
- Visual feedback showing the chain count

### Implementation Steps
1. After finding matches, animate matched cells disappearing
2. Mark cells as empty
3. For each column, shift remaining symbols down
4. Generate new symbols for empty top rows
5. Animate the "falling" effect
6. Check for new matches
7. Repeat until no matches found
8. Calculate total win with cascade multiplier

### Files to Modify
- `src/components/SlotMachine.tsx` - Core cascade logic
- `src/components/SlotMachine.css` - Cascade animations

---

## Task 2: Improve Win Feedback

### Goal
Make wins feel more exciting and rewarding.

### Requirements
- Different animations for small/medium/big wins
- Show win lines visually (draw line through matches)
- Add screen shake for big wins
- Display win amount prominently

---

## Task 3: Variable Bet Amounts

### Goal
Let players choose how much to bet per spin.

### Requirements
- Add bet selector (£0.50, £1, £2, £5)
- Scale winnings based on bet amount
- Show current bet clearly
- Remember last bet amount
