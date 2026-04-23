#!/usr/bin/env tsx
// Compact report formatter for saved sim results.
//
// Usage:
//   npm run analyze-sim                          # analyze all in sim-results/
//   npm run analyze-sim -- sim-results/foo.json  # specific file(s)
//   npm run analyze-sim -- --compare             # side-by-side comparison table

import { readFileSync, readdirSync } from 'fs'
import { resolve, basename } from 'path'
import type { SimResult } from '../src/sim/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, dp = 2) { return `${n.toFixed(dp)}%` }
function p2(n: number) { return n.toFixed(2).padStart(8) }
function col(s: string, w: number) { return s.padEnd(w).slice(0, w) }
function divider(c = '─', n = 60) { return c.repeat(n) }

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function loadResult(path: string): SimResult {
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as SimResult
}

// ── Resolve file list ─────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const compare = process.argv.includes('--compare')

let files: string[]
if (args.length > 0) {
  files = args.map(a => resolve(process.cwd(), a))
} else {
  const dir = resolve(process.cwd(), 'sim-results')
  try {
    files = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => resolve(dir, f))
  } catch {
    console.error('No sim-results/ directory found. Run `npm run sim` first.')
    process.exit(1)
  }
}

if (files.length === 0) {
  console.error('No result files found.')
  process.exit(1)
}

const results = files.map(f => ({ path: f, result: loadResult(f) }))

// ── Compare table mode ────────────────────────────────────────────────────────

if (compare && results.length > 1) {
  const W = [28, ...results.map(() => 10)]
  const hr = divider('─', W.reduce((a, b) => a + b + 3, 0))

  function row(label: string, vals: string[]) {
    return col(label, W[0]) + ' │ ' + vals.map((v, i) => col(v, W[i + 1])).join(' │ ')
  }

  console.log('\n' + divider('═'))
  console.log('COMPARISON')
  console.log(divider('═'))
  console.log(row('', results.map(r => basename(r.path, '.json').slice(0, 10))))
  console.log(hr)
  console.log(row('Label', results.map(r => r.result.meta.label)))
  console.log(row('RTP %', results.map(r => pct(r.result.summary.rtpPercent))))
  console.log(row('CI ±pp', results.map(r => `±${r.result.summary.ciHalfWidthPercent.toFixed(2)}`)))
  console.log(row('p(bonus) %', results.map(r => pct(r.result.summary.pBonus * 100))))
  console.log(row('1 in N spins', results.map(r => (1 / r.result.summary.pBonus).toFixed(0))))
  console.log(row('E(normal) £', results.map(r => `£${r.result.summary.eNormalWinExclBonus.toFixed(4)}`)))
  console.log(row('E(bonus) £', results.map(r => `£${r.result.summary.eBonus.toFixed(2)}`)))
  console.log(hr)
  console.log(row('Meter avg fill', results.map(r => r.result.normalAgg.avgFinalMeter?.toFixed(1) ?? 'n/a')))
  console.log(row('Meter full %', results.map(r => r.result.normalAgg.meterFillDist ? pct((r.result.normalAgg.meterFillDist.full / r.result.normalAgg.totalSpins) * 100) : 'n/a')))
  console.log(row('Zero-win %', results.map(r => pct(r.result.normalAgg.pctZeroWin))))
  console.log(row('Max zero streak', results.map(r => r.result.normalAgg.maxConsecutiveZeroWins?.toString() ?? 'n/a')))
  console.log(row('Avg zero run', results.map(r => r.result.normalAgg.avgZeroWinRunLength?.toFixed(1) ?? 'n/a')))
  console.log(row('Avg chains/spin', results.map(r => r.result.normalAgg.avgChainsPerSpin.toFixed(3))))
  console.log(row('Avg wilds/spin', results.map(r => r.result.normalAgg.avgWildSpawnsPerSpin.toFixed(3))))
  console.log(hr)
  console.log(row('Bonus free spins', results.map(r => r.result.bonusAgg.avgFreeSpinsUsed.toFixed(2))))
  console.log(row('Bonus meter fill%', results.map(r => pct(r.result.bonusAgg.meterFillRate))))
  console.log(row('Spins', results.map(r => r.result.meta.normalSpins.toLocaleString())))
  console.log(row('Duration', results.map(r => fmtMs(r.result.meta.durationMs))))
  console.log()
  process.exit(0)
}

// ── Full report per file ──────────────────────────────────────────────────────

for (const { path, result: r } of results) {
  const s = r.summary
  const n = r.normalAgg
  const b = r.bonusAgg
  const cfg = r.meta.config

  const rtpGap = s.rtpPercent - 95
  const rtpTag = Math.abs(rtpGap) <= 1 ? '✓' : rtpGap > 0 ? '↑' : '↓'

  console.log('\n' + divider('═'))
  console.log(`  ${r.meta.label.toUpperCase()}`)
  console.log(`  ${basename(path)}`)
  console.log(`  ${new Date(r.meta.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}  ·  ${r.meta.normalSpins.toLocaleString()} normal  ·  ${r.meta.bonusSpins.toLocaleString()} bonus`)
  console.log(divider('═'))

  console.log(`\n  RTP       ${s.rtpPercent.toFixed(2)}%  ${rtpTag}  (gap ${rtpGap >= 0 ? '+' : ''}${rtpGap.toFixed(2)}pp vs 95%)`)
  console.log(`  CI ±      ${s.ciHalfWidthPercent.toFixed(2)}pp  ${s.ciHalfWidthPercent <= 0.5 ? '✓ converged' : '⚠ needs more samples'}`)
  console.log(`  p(bonus)  ${(s.pBonus * 100).toFixed(3)}%  =  1 in ${(1 / s.pBonus).toFixed(0)} spins`)
  console.log(`  E(normal) £${s.eNormalWinExclBonus.toFixed(4)} / spin`)
  console.log(`  E(bonus)  £${s.eBonus.toFixed(2)} / round`)
  console.log(`  Duration  ${fmtMs(r.meta.durationMs)}`)

  if (cfg) {
    console.log(`\n${divider()}`)
    console.log('  CONFIG')
    console.log(divider())
    console.log(`  Normal meter:   max=${cfg.normalMeterMax}  breakpoints=[${cfg.normalBreakpoints.join(',')}]  wilds=[${cfg.wildsPerBreakpoint.join(',')}]`)
    console.log(`  Bonus meter:    max=${cfg.bonusMeterMax}  breakpoints=[${cfg.bonusBreakpoints.join(',')}]`)
    console.log(`  Min cluster:    ${cfg.minClusterSize}`)
    console.log(`  Mult chance:    normal=${pct(cfg.normalMultiplierChance * 100)}  bonus=${pct(cfg.bonusMultiplierChance * 100)}`)
    console.log(`  Bet amount:     £${cfg.betAmount.toFixed(2)}`)
  }

  console.log(`\n${divider()}`)
  console.log('  NORMAL PLAY — METER & DRY SPELLS')
  console.log(divider())
  const mfd = n.meterFillDist
  const tot = n.totalSpins
  const mMax = cfg?.normalMeterMax ?? '?'
  console.log(`  Avg meter fill:   ${n.avgFinalMeter?.toFixed(2) ?? 'n/a'} / ${mMax}`)
  if (mfd) {
    console.log(`  Meter dist (% of spins):`)
    console.log(`    none=${p2((mfd.none/tot)*100)}%  low=${p2((mfd.low/tot)*100)}%  mid=${p2((mfd.mid/tot)*100)}%`)
    console.log(`    high=${p2((mfd.high/tot)*100)}%  near=${p2((mfd.near/tot)*100)}%  full=${p2((mfd.full/tot)*100)}%`)
  }
  console.log(`  Zero-win spins:   ${n.pctZeroWin.toFixed(2)}%`)
  console.log(`  Max zero streak:  ${n.maxConsecutiveZeroWins ?? 'n/a'} spins`)
  console.log(`  Avg zero run:     ${n.avgZeroWinRunLength?.toFixed(1) ?? 'n/a'} spins before a win`)
  console.log(`  Return ≥ bet:     ${n.pctPositiveReturn.toFixed(2)}%`)

  console.log(`\n${divider()}`)
  console.log('  NORMAL PLAY — MECHANICS')
  console.log(divider())
  console.log(`  Avg chains / spin: ${n.avgChainsPerSpin.toFixed(3)}`)
  console.log(`  Avg wilds / spin:  ${n.avgWildSpawnsPerSpin.toFixed(3)}`)
  console.log(`  Multiplier uplift: ${n.multiplierContributionPct.toFixed(1)}% of normal wins`)
  console.log(`  Mega wild rate:    ${((n.megaWildCount / n.totalSpins) * 100).toFixed(2)}%  (£${n.megaWildPayout.toFixed(2)} total)`)

  console.log(`\n${divider()}`)
  console.log('  BREAKPOINT HIT RATES')
  console.log(divider())
  n.meterBPRates.forEach(bp => {
    const bar = '#'.repeat(Math.round(bp.rate * 40)).padEnd(40)
    console.log(`  ${bp.label.padEnd(14)} [${bar}] ${pct(bp.rate * 100, 2)}`)
  })

  console.log(`\n${divider()}`)
  console.log('  SYMBOL BREAKDOWN — NORMAL')
  console.log(divider())
  console.log('  ' + ['Symbol', 'Clusters', 'Avg size', '£ total', '% RTP'].map((h, i) => h.padEnd([8, 10, 10, 10, 8][i])).join(''))
  n.symbolStats.forEach(sym => {
    console.log('  ' + [
      sym.symbol.padEnd(8),
      sym.clusters.toLocaleString().padEnd(10),
      sym.avgClusterSize.toFixed(1).padEnd(10),
      `£${sym.payout.toFixed(2)}`.padEnd(10),
      pct(sym.payoutPct),
    ].join(''))
  })

  console.log(`\n${divider()}`)
  console.log('  BONUS ROUND')
  console.log(divider())
  console.log(`  Avg free spins:    ${b.avgFreeSpinsUsed.toFixed(2)}`)
  console.log(`  Meter fill rate:   ${b.meterFillRate.toFixed(1)}% of rounds earn +2 spins`)
  console.log(`  Total extra spins: ${b.totalExtraSpinEvents.toLocaleString()}  (${b.roundsWithExtraSpins.toLocaleString()} rounds)`)
  console.log(`  Multiplier uplift: ${b.multiplierContributionPct.toFixed(1)}% of bonus wins`)

  console.log()
}
