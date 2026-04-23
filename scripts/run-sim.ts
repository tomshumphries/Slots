#!/usr/bin/env tsx
// CLI runner: npm run sim [-- --label=name --spins=100000 --bonus=10000]
//
// Usage:
//   npm run sim
//   npm run sim -- --label=after-rebalance --spins=100000 --bonus=10000
//   npm run sim -- --label=quick-test --spins=10000 --bonus=1000

import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { runSimulation } from '../src/sim/simRunner'
import type { SimConfig, SimProgress } from '../src/sim/types'

// ── Parse args ────────────────────────────────────────────────────────────────

function parseArg(name: string, defaultVal: string): string {
  const flag = `--${name}=`
  const found = process.argv.slice(2).find(a => a.startsWith(flag))
  return found ? found.slice(flag.length) : defaultVal
}

const label = parseArg('label', 'cli-run')
const normalSpins = parseInt(parseArg('spins', '100000'), 10)
const bonusSpins = parseInt(parseArg('bonus', '10000'), 10)

const config: SimConfig = {
  label,
  runMode: 'count',
  normalSpins,
  bonusSpins,
  timeLimitSecs: 0,
}

// ── Progress display ──────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function bar(pct: number, width = 30): string {
  const filled = Math.round((pct / 100) * width)
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']'
}

let lastLine = ''
function printProgress(p: SimProgress) {
  const pct = p.timeLimitMs > 0
    ? Math.min(100, (p.elapsedMs / (p.timeLimitMs / 2)) * 100)
    : (p.done / p.total) * 100
  const phase = p.phase === 'normal' ? 'Normal' : 'Bonus '
  const spins = `${p.done.toLocaleString()}/${p.total.toLocaleString()}`
  const speed = p.spinsPerSec >= 1000 ? `${(p.spinsPerSec / 1000).toFixed(1)}k/s` : `${Math.round(p.spinsPerSec)}/s`
  const eta = p.etaMs > 0 ? `ETA ${fmtMs(p.etaMs)}` : 'done'
  const line = `  ${phase} ${bar(pct)} ${pct.toFixed(0).padStart(3)}%  ${spins.padEnd(18)} ${speed.padStart(7)}  ${eta}`
  if (line !== lastLine) {
    process.stdout.write(`\r${line}`)
    lastLine = line
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\nSlots Simulator — ${label}`)
console.log(`  Normal spins: ${normalSpins.toLocaleString()}   Bonus rounds: ${bonusSpins.toLocaleString()}\n`)

const controller = new AbortController()
process.on('SIGINT', () => { controller.abort(); process.stdout.write('\n'); process.exit(0) })

let lastPhase = ''
const result = await runSimulation(
  config,
  (p: SimProgress) => {
    if (p.phase !== lastPhase) {
      if (lastPhase) process.stdout.write('\n')
      lastPhase = p.phase
    }
    printProgress(p)
  },
  controller.signal,
)

process.stdout.write('\n\n')

// ── Print summary ─────────────────────────────────────────────────────────────

const r = result
const s = r.summary
const n = r.normalAgg
const b = r.bonusAgg

console.log('━'.repeat(56))
console.log(`  RTP:          ${s.rtpPercent.toFixed(2)}%  (target 95%, gap ${(s.rtpPercent - 95).toFixed(2)}pp)`)
console.log(`  CI ±:         ${s.ciHalfWidthPercent.toFixed(2)}pp  (95%)`)
console.log(`  p(bonus):     ${(s.pBonus * 100).toFixed(3)}%  (1 in ${(1 / s.pBonus).toFixed(0)})`)
console.log(`  E(normal):    £${s.eNormalWinExclBonus.toFixed(4)} / spin`)
console.log(`  E(bonus):     £${s.eBonus.toFixed(2)} / round`)
console.log('━'.repeat(56))
console.log(`  Meter avg fill:  ${n.avgFinalMeter.toFixed(1)} / ${r.meta.config?.normalMeterMax ?? '?'}`)
console.log(`  Zero-win spins:  ${n.pctZeroWin.toFixed(1)}%`)
console.log(`  Max zero streak: ${n.maxConsecutiveZeroWins} spins`)
console.log(`  Avg zero run:    ${n.avgZeroWinRunLength.toFixed(1)} spins`)
console.log(`  Avg chains/spin: ${n.avgChainsPerSpin.toFixed(3)}`)
console.log(`  Avg wilds/spin:  ${n.avgWildSpawnsPerSpin.toFixed(3)}`)
const mfd = n.meterFillDist
const total = n.totalSpins
console.log(`  Meter dist:      none=${((mfd.none/total)*100).toFixed(1)}% low=${((mfd.low/total)*100).toFixed(1)}% mid=${((mfd.mid/total)*100).toFixed(1)}% high=${((mfd.high/total)*100).toFixed(1)}% near=${((mfd.near/total)*100).toFixed(1)}% full=${((mfd.full/total)*100).toFixed(1)}%`)
console.log('━'.repeat(56))
console.log(`  Bonus free spins: ${b.avgFreeSpinsUsed.toFixed(2)} avg`)
console.log(`  Bonus meter fill rate: ${b.meterFillRate.toFixed(1)}% of rounds`)
console.log(`  Duration:     ${fmtMs(r.meta.durationMs)}  (${(s.normalSpinsPerSec / 1000).toFixed(0)}k n/s, ${(s.bonusSpinsPerSec / 1000).toFixed(0)}k b/s)`)
console.log('━'.repeat(56))

// ── Save to sim-results/ ──────────────────────────────────────────────────────

const outDir = resolve(process.cwd(), 'sim-results')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, `${result.meta.runId}.json`)
writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8')
console.log(`\n  Saved → sim-results/${result.meta.runId}.json\n`)
