import { useState, useRef, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import './SimLab.css'
import type { SimConfig, SimProgress, SimResult } from '../sim/types'

type RunState = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

const TARGET_RTP = 95

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function formatRate(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M/s`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k/s`
  return `${Math.round(n)}/s`
}

export default function SimLab() {
  const [label, setLabel] = useState('baseline')
  const [normalSpins, setNormalSpins] = useState(1000)
  const [bonusSpins, setBonusSpins] = useState(1000)

  const [runState, setRunState] = useState<RunState>('idle')
  const [progress, setProgress] = useState<SimProgress | null>(null)
  const [result, setResult] = useState<SimResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  // Chart data — pre-sampled by simRunner to ~300 points, just accumulated here
  const [normalChartData, setNormalChartData] = useState<{ i: number; mean: number }[]>([])
  const [bonusChartData, setBonusChartData] = useState<{ i: number; mean: number }[]>([])

  const workerRef = useRef<Worker | null>(null)
  const normalBufferRef = useRef<{ i: number; mean: number }[]>([])
  const bonusBufferRef = useRef<{ i: number; mean: number }[]>([])
  // Track last progress mean for chart accumulation
  const lastNormalMeanRef = useRef(0)
  const lastBonusMeanRef = useRef(0)

  const startSim = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate()

    setRunState('running')
    setProgress(null)
    setResult(null)
    setErrorMsg('')
    setSaveState('idle')
    normalBufferRef.current = []
    bonusBufferRef.current = []
    lastNormalMeanRef.current = 0
    lastBonusMeanRef.current = 0
    setNormalChartData([])
    setBonusChartData([])

    const worker = new Worker(
      new URL('../sim/sim.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event) => {
      const msg = event.data

      if (msg.type === 'progress') {
        const p: SimProgress = msg.data
        setProgress(p)

        // Chart: add a point on every progress event (simRunner pre-throttles to ~300 points)
        if (p.phase === 'normal') {
          lastNormalMeanRef.current = p.currentMean
          normalBufferRef.current = [...normalBufferRef.current, { i: p.done, mean: p.currentMean }]
          setNormalChartData(normalBufferRef.current)
        }
        if (p.phase === 'bonus') {
          lastBonusMeanRef.current = p.currentMean
          bonusBufferRef.current = [...bonusBufferRef.current, { i: p.done, mean: p.currentMean }]
          setBonusChartData(bonusBufferRef.current)
        }
      }

      if (msg.type === 'result') {
        const r: SimResult = msg.data
        setResult(r)
        // Replace chart data with the full sampled series from the result
        setNormalChartData(r.normalSeries.map(s => ({ i: s.i, mean: s.runningMean })))
        setBonusChartData(r.bonusSeries.map(s => ({ i: s.i, mean: s.runningMean })))
        setRunState('done')
      }

      if (msg.type === 'error') {
        setErrorMsg(msg.message)
        setRunState('error')
      }

      if (msg.type === 'cancelled') {
        setRunState('cancelled')
      }
    }

    const config: SimConfig = { label, normalSpins, bonusSpins }
    worker.postMessage({ type: 'start', config })
  }, [label, normalSpins, bonusSpins])

  const cancelSim = useCallback(() => {
    workerRef.current?.postMessage({ type: 'cancel' })
  }, [])

  const saveResult = useCallback(async () => {
    if (!result) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/write-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaveState('saved')
    } catch (err) {
      console.error('Save failed:', err)
      setSaveState('failed')
    }
  }, [result])

  const normalPhase = progress?.phase === 'normal' ? progress : null
  const bonusPhase = progress?.phase === 'bonus' ? progress : null
  const normalDone = runState === 'done' || bonusPhase !== null
  const normalPct = normalPhase
    ? (normalPhase.done / normalPhase.total) * 100
    : normalDone ? 100 : 0
  const bonusPct = bonusPhase
    ? (bonusPhase.done / bonusPhase.total) * 100
    : runState === 'done' ? 100 : 0

  const activePhase = bonusPhase ?? normalPhase

  return (
    <div className="sim-lab">
      <h2>Simulation Lab</h2>
      <p className="sim-subtitle">
        Monte Carlo RTP analysis — runs headlessly in a Web Worker, no UI lag during simulation.
      </p>

      {/* Config panel */}
      <div className="sim-config-panel">
        <div className="sim-field">
          <label>Run label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            disabled={runState === 'running'}
            placeholder="e.g. baseline"
          />
        </div>
        <div className="sim-field">
          <label>Normal spins</label>
          <input
            type="number"
            min={100}
            max={10_000_000}
            step={1000}
            value={normalSpins}
            onChange={e => setNormalSpins(Number(e.target.value))}
            disabled={runState === 'running'}
          />
        </div>
        <div className="sim-field">
          <label>Bonus rounds</label>
          <input
            type="number"
            min={100}
            max={100_000}
            step={100}
            value={bonusSpins}
            onChange={e => setBonusSpins(Number(e.target.value))}
            disabled={runState === 'running'}
          />
        </div>
        <div className="sim-actions">
          {runState !== 'running' ? (
            <button className="sim-btn sim-btn-run" onClick={startSim}>
              Run Simulation
            </button>
          ) : (
            <button className="sim-btn sim-btn-cancel" onClick={cancelSim}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress + timing */}
      {(runState === 'running' || runState === 'done') && (
        <div className="sim-progress-section">
          <div className="sim-progress-row">
            <span className="sim-progress-label">Normal spins</span>
            <div className="sim-progress-bar">
              <div className="sim-progress-fill" style={{ width: `${normalPct}%` }} />
            </div>
            <span className="sim-progress-pct">{normalPct.toFixed(0)}%</span>
          </div>
          <div className="sim-progress-row">
            <span className="sim-progress-label">Bonus rounds</span>
            <div className="sim-progress-bar">
              <div className="sim-progress-fill bonus" style={{ width: `${bonusPct}%` }} />
            </div>
            <span className="sim-progress-pct">{bonusPct.toFixed(0)}%</span>
          </div>

          {/* Timing metadata */}
          {activePhase && runState === 'running' && (
            <div className="sim-timing-row">
              <div className="sim-timing-stat">
                <span className="timing-label">Speed</span>
                <span className="timing-value">{formatRate(activePhase.spinsPerSec)}</span>
              </div>
              <div className="sim-timing-stat">
                <span className="timing-label">Elapsed</span>
                <span className="timing-value">{formatDuration(activePhase.elapsedMs)}</span>
              </div>
              <div className="sim-timing-stat">
                <span className="timing-label">ETA</span>
                <span className="timing-value eta">{formatDuration(activePhase.etaMs)}</span>
              </div>
              <div className="sim-timing-stat">
                <span className="timing-label">Phase</span>
                <span className="timing-value phase">{activePhase.phase === 'normal' ? 'Normal spins' : 'Bonus rounds'}</span>
              </div>
            </div>
          )}

          {/* Live stats */}
          <div className="sim-live-stats">
            {normalPhase && (
              <>
                <span>E(normal): £{normalPhase.currentMean.toFixed(4)}</span>
                <span>p(bonus): {(normalPhase.pBonus * 100).toFixed(2)}%</span>
              </>
            )}
            {bonusPhase && (
              <>
                <span>E(bonus): £{bonusPhase.currentMean.toFixed(2)}</span>
                <span>p(bonus): {(bonusPhase.pBonus * 100).toFixed(2)}%</span>
              </>
            )}
          </div>
        </div>
      )}

      {runState === 'cancelled' && (
        <div className="sim-status-msg cancelled">Simulation cancelled.</div>
      )}
      {runState === 'error' && (
        <div className="sim-status-msg error">Error: {errorMsg}</div>
      )}

      {/* Live convergence charts */}
      {normalChartData.length > 1 && (
        <div className="sim-chart-section">
          <h3>Normal spin E(X) convergence</h3>
          <p className="chart-subtitle">
            Running mean win per spin (excluding bonus). Flattening = converged.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={normalChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="i"
                stroke="#888"
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                label={{ value: 'Spins', position: 'insideBottomRight', offset: -5, fill: '#888', fontSize: 11 }}
              />
              <YAxis stroke="#888" tickFormatter={v => `£${Number(v).toFixed(3)}`} width={60} />
              <Tooltip
                formatter={(v) => [`£${Number(v).toFixed(4)}`, 'Running mean']}
                labelFormatter={(v) => `Spin ${Number(v).toLocaleString()}`}
              />
              <Line type="monotone" dataKey="mean" stroke="#4ade80" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {bonusChartData.length > 1 && (
        <div className="sim-chart-section">
          <h3>Bonus round E(X) convergence</h3>
          <p className="chart-subtitle">
            Running mean win per bonus round. High variance — needs more rounds to stabilise.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={bonusChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="i"
                stroke="#888"
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                label={{ value: 'Rounds', position: 'insideBottomRight', offset: -5, fill: '#888', fontSize: 11 }}
              />
              <YAxis stroke="#888" tickFormatter={v => `£${Number(v).toFixed(1)}`} width={60} />
              <Tooltip
                formatter={(v) => [`£${Number(v).toFixed(2)}`, 'Running mean']}
                labelFormatter={(v) => `Round ${Number(v).toLocaleString()}`}
              />
              <Line type="monotone" dataKey="mean" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Final results */}
      {runState === 'done' && result && (
        <div className="sim-results">
          <h3>Results — {result.meta.runId}</h3>

          <div className="sim-stat-grid">
            <div className={`sim-stat rtp ${result.summary.rtpPercent >= 90 && result.summary.rtpPercent <= 100 ? 'good' : 'bad'}`}>
              <div className="stat-label">RTP</div>
              <div className="stat-value">{result.summary.rtpPercent.toFixed(2)}%</div>
              <div className="stat-target">Target: {TARGET_RTP}%</div>
            </div>
            <div className="sim-stat">
              <div className="stat-label">E(normal win / spin)</div>
              <div className="stat-value">£{result.summary.eNormalWinExclBonus.toFixed(4)}</div>
            </div>
            <div className="sim-stat">
              <div className="stat-label">Bonus frequency</div>
              <div className="stat-value">{(result.summary.pBonus * 100).toFixed(2)}%</div>
              <div className="stat-sub">1 in {(1 / result.summary.pBonus).toFixed(0)} spins</div>
            </div>
            <div className="sim-stat">
              <div className="stat-label">E(bonus win / round)</div>
              <div className="stat-value">£{result.summary.eBonus.toFixed(2)}</div>
            </div>
            <div className="sim-stat">
              <div className="stat-label">E(X) per spin</div>
              <div className="stat-value">£{result.summary.eTotalPerSpin.toFixed(4)}</div>
            </div>
            <div className="sim-stat">
              <div className="stat-label">95% CI half-width</div>
              <div className="stat-value">±{result.summary.ciHalfWidthPercent.toFixed(2)}%</div>
              <div className="stat-sub">{result.summary.ciHalfWidthPercent <= 0.5 ? 'Converged ✓' : 'Increase sample size'}</div>
            </div>
            <div className="sim-stat timing">
              <div className="stat-label">Total duration</div>
              <div className="stat-value">{formatDuration(result.meta.durationMs)}</div>
            </div>
            <div className="sim-stat timing">
              <div className="stat-label">Normal speed</div>
              <div className="stat-value">{formatRate(result.summary.normalSpinsPerSec)}</div>
            </div>
            <div className="sim-stat timing">
              <div className="stat-label">Bonus speed</div>
              <div className="stat-value">{formatRate(result.summary.bonusSpinsPerSec)}</div>
            </div>
          </div>

          <div className="sim-save-row">
            <button
              className="sim-btn sim-btn-save"
              onClick={saveResult}
              disabled={saveState === 'saving' || saveState === 'saved'}
            >
              {saveState === 'idle' && 'Save to sim-results/'}
              {saveState === 'saving' && 'Saving...'}
              {saveState === 'saved' && `Saved ✓ (${result.meta.runId}.json)`}
              {saveState === 'failed' && 'Save failed — check console'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
