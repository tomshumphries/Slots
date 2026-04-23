// Seeded pseudo-random number generator (mulberry32 algorithm).
// A single 32-bit integer seed fully determines all randomness for a spin,
// making any spin reproducible by replaying with the same seed.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Generate a random 32-bit seed using the browser/node PRNG.
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}
