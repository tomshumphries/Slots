import { useState, useRef, useCallback, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import './SimLab.css'
import type { SimConfig, SimProgress, SimResult, RunMode } from '../sim/types'

type RunState = 'idle' | 'running' | 'done' | 'error' | 'cancelled'
type DashTab = 'overview' | 'windist' | 'symbols' | 'meter' | 'bonus' | 'convergence'

interface SavedRunMeta {
  runId: string
  label: string
  timestamp: string
  normalSpins: number
  bonusSpins: number
  durationMs: number
  rtpPercent: number
  ciHalfWidthPercent: number
}

const TARGET_RTP = 95
const SYMBOL_COLORS: Record<string, string> = {
  '🍒': '#ef4444', '🍀': '#22c55e', '🍇': '#a855f7', '🔔': '#eab308', '💎': '#3b82f6',
}
const MULT_COLORS: Record<string, string> = {
  '2x': '#6ee7b7', '3x': '#34d399', '5x': '#10b981', '10x': '#059669', '20x': '#d97706',
}

function fmt(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}
function fmtRate(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M/s`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k/s`
  return `${Math.round(n)}/s`
}
function pct(n: number) { return `${n.toFixed(1)}%` }

const WIN_BUCKET_LABELS = ['Zero', '<£0.5', '£0.5-1', '£1-2', '£2-5', '£5-20', '£20+']
const WIN_BUCKET_KEYS: (keyof SimResult['normalAgg']['winDist'])[] = ['zero', 'micro', 'small', 'medium', 'large', 'big', 'huge']

export default function SimLab() {
  const [label, setLabel] = useState('baseline')
  const [runMode, setRunMode] = useState<RunMode>('count')
  const [normalSpins, setNormalSpins] = useState(10_000)
  const [bonusSpins, setBonusSpins] = useState(1_000)
  const [timeLimitSecs, setTimeLimitSecs] = useState(30)

  const [runState, setRunState] = useState<RunState>('idle')
  const [progress, setProgress] = useState<SimProgress | null>(null)
  const [result, setResult] = useState<SimResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [activeTab, setActiveTab] = useState<DashTab>('overview')
  const [savedRuns, setSavedRuns] = useState<SavedRunMeta[]>([])
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const [normalChartData, setNormalChartData] = useState<{ i: number; mean: number }[]>([])
  const [bonusChartData, setBonusChartData] = useState<{ i: number; mean: number }[]>([])
  const normalBufRef = useRef<{ i: number; mean: number }[]>([])
  const bonusBufRef = useRef<{ i: number; mean: number }[]>([])
  const workerRef = useRef<Worker | null>(null)

  const startSim = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate()
    setRunState('running')
    setProgress(null)
    setResult(null)
    setErrorMsg('')
    setSaveState('idle')
    normalBufRef.current = []
    bonusBufRef.current = []
    setNormalChartData([])
    setBonusChartData([])

    const worker = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'progress') {
        const p: SimProgress = msg.data
        setProgress(p)
        if (p.phase === 'normal') {
          normalBufRef.current = [...normalBufRef.current, { i: p.done, mean: p.currentMean }]
          setNormalChartData(normalBufRef.current)
        } else {
          bonusBufRef.current = [...bonusBufRef.current, { i: p.done, mean: p.currentMean }]
          setBonusChartData(bonusBufRef.current)
        }
      }
      if (msg.type === 'result') {
        const r: SimResult = msg.data
        setResult(r)
        setNormalChartData(r.normalSeries.map(s => ({ i: s.i, mean: s.runningMean })))
        setBonusChartData(r.bonusSeries.map(s => ({ i: s.i, mean: s.runningMean })))
        setRunState('done')
        setActiveTab('overview')
      }
      if (msg.type === 'error') { setErrorMsg(msg.message); setRunState('error') }
      if (msg.type === 'cancelled') setRunState('cancelled')
    }

    const config: SimConfig = { label, runMode, normalSpins, bonusSpins, timeLimitSecs }
    worker.postMessage({ type: 'start', config })
  }, [label, runMode, normalSpins, bonusSpins, timeLimitSecs])

  const cancelSim = useCallback(() => workerRef.current?.postMessage({ type: 'cancel' }), [])

  const fetchSavedRuns = useCallback(() => {
    try {
      const index = JSON.parse(localStorage.getItem('sim-results-index') ?? '[]') as SavedRunMeta[]
      setSavedRuns(index)
    } catch { setSavedRuns([]) }
  }, [])

  const loadRun = useCallback((runId: string) => {
    setLoadingRunId(runId)
    try {
      const raw = localStorage.getItem(`sim-result-${runId}`)
      if (!raw) return
      const data: SimResult = JSON.parse(raw)
      setResult(data)
      setNormalChartData(data.normalSeries.map(s => ({ i: s.i, mean: s.runningMean })))
      setBonusChartData(data.bonusSeries.map(s => ({ i: s.i, mean: s.runningMean })))
      setRunState('done')
      setSaveState('saved')
      setActiveTab('overview')
    } finally {
      setLoadingRunId(null)
    }
  }, [])

  const deleteRun = useCallback((runId: string) => {
    if (!confirm(`Delete "${runId}"?`)) return
    localStorage.removeItem(`sim-result-${runId}`)
    const index = JSON.parse(localStorage.getItem('sim-results-index') ?? '[]') as SavedRunMeta[]
    const updated = index.filter(r => r.runId !== runId)
    localStorage.setItem('sim-results-index', JSON.stringify(updated))
    setSavedRuns(updated)
  }, [])

  const saveResult = useCallback((data: SimResult) => {
    setSaveState('saving')
    try {
      localStorage.setItem(`sim-result-${data.meta.runId}`, JSON.stringify(data))
      const meta: SavedRunMeta = {
        runId: data.meta.runId,
        label: data.meta.label ?? '',
        timestamp: data.meta.timestamp ?? '',
        normalSpins: data.meta.normalSpins ?? 0,
        bonusSpins: data.meta.bonusSpins ?? 0,
        durationMs: data.meta.durationMs ?? 0,
        rtpPercent: data.summary?.rtpPercent ?? 0,
        ciHalfWidthPercent: data.summary?.ciHalfWidthPercent ?? 0,
      }
      const index = JSON.parse(localStorage.getItem('sim-results-index') ?? '[]') as SavedRunMeta[]
      const updated = [meta, ...index.filter(r => r.runId !== data.meta.runId)]
      localStorage.setItem('sim-results-index', JSON.stringify(updated))
      setSavedRuns(updated)
      setSaveState('saved')
    } catch { setSaveState('failed') }
  }, [])

  const exportRun = useCallback((runId: string) => {
    const raw = localStorage.getItem(`sim-result-${runId}`)
    if (!raw) return
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${runId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importRun = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data: SimResult = JSON.parse(reader.result as string)
        saveResult(data)
        setResult(data)
        setNormalChartData(data.normalSeries.map(s => ({ i: s.i, mean: s.runningMean })))
        setBonusChartData(data.bonusSeries.map(s => ({ i: s.i, mean: s.runningMean })))
        setRunState('done')
        setActiveTab('overview')
      } catch { alert('Invalid sim result file') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [saveResult])

  // Load saved runs on mount
  useEffect(() => { fetchSavedRuns() }, [fetchSavedRuns])

  // Auto-save when a run completes
  useEffect(() => {
    if (runState === 'done' && result && saveState === 'idle') saveResult(result)
  }, [runState, result, saveState, saveResult])

  const isTimeBased = runMode === 'time'
  const normalPhase = progress?.phase === 'normal' ? progress : null
  const bonusPhase = progress?.phase === 'bonus' ? progress : null
  const normalDone = runState === 'done' || bonusPhase !== null

  function phasePct(p: SimProgress) {
    if (p.timeLimitMs > 0) return Math.min(100, (p.elapsedMs / (p.timeLimitMs / 2)) * 100)
    return (p.done / p.total) * 100
  }

  const normalPct = normalPhase ? phasePct(normalPhase) : normalDone ? 100 : 0
  const bonusPct = bonusPhase ? phasePct(bonusPhase) : runState === 'done' ? 100 : 0
  const activePhase = bonusPhase ?? normalPhase

  return (
    <div className="sim-lab">
      <h2>Simulation Lab</h2>
      <p className="sim-subtitle">Monte Carlo RTP analysis — runs in a Web Worker, zero UI lag.</p>

      {/* ── Saved Runs ── */}
      <div className="saved-runs-panel">
        <div className="saved-runs-header">
          <span>Saved Runs{savedRuns.length > 0 ? ` (${savedRuns.length})` : ''}</span>
          <button className="saved-runs-refresh" onClick={fetchSavedRuns} title="Refresh list">↻</button>
          <button className="saved-runs-refresh" onClick={() => importRef.current?.click()} title="Import JSON">↑ Import</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importRun} />
        </div>
        {savedRuns.length === 0 ? (
          <p className="saved-runs-empty">No saved runs yet — results auto-save when a sim completes.</p>
        ) : (
          <div className="saved-runs-list">
            {savedRuns.map(run => {
              const rtpGood = run.rtpPercent >= 92 && run.rtpPercent <= 98
              const isLoaded = result?.meta.runId === run.runId
              return (
                <div key={run.runId} className={`saved-run-row${isLoaded ? ' active' : ''}`}>
                  <div className="saved-run-info">
                    <span className="saved-run-label">{run.label || run.runId}</span>
                    <span className="saved-run-meta">
                      {new Date(run.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                      {' · '}{run.normalSpins.toLocaleString()} normal
                      {' · '}{run.bonusSpins.toLocaleString()} bonus
                      {' · '}±{run.ciHalfWidthPercent.toFixed(2)}pp CI
                    </span>
                  </div>
                  <span className={`rtp-badge${rtpGood ? ' good' : ' off'}`}>{run.rtpPercent.toFixed(1)}%</span>
                  <button className="saved-run-btn load" onClick={() => loadRun(run.runId)}
                    disabled={loadingRunId === run.runId || isLoaded}>
                    {loadingRunId === run.runId ? '…' : isLoaded ? 'Loaded' : 'Load'}
                  </button>
                  <button className="saved-run-btn load" onClick={() => exportRun(run.runId)}
                    title={`Export ${run.runId}`}>↓</button>
                  <button className="saved-run-btn delete" onClick={() => deleteRun(run.runId)}
                    title={`Delete ${run.runId}`}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Config ── */}
      <div className="sim-config-panel">
        <div className="sim-field">
          <label>Run label</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            disabled={runState === 'running'} placeholder="e.g. baseline" />
        </div>

        <div className="sim-field">
          <label>Mode</label>
          <div className="sim-mode-toggle">
            {(['count', 'time'] as RunMode[]).map(m => (
              <button key={m} className={`mode-btn ${runMode === m ? 'active' : ''}`}
                onClick={() => setRunMode(m)} disabled={runState === 'running'}>
                {m === 'count' ? 'By count' : 'By time'}
              </button>
            ))}
          </div>
        </div>

        {!isTimeBased ? (
          <>
            <div className="sim-field">
              <label>Normal spins</label>
              <input type="number" min={100} max={10_000_000} step={1000} value={normalSpins}
                onChange={e => setNormalSpins(Number(e.target.value))} disabled={runState === 'running'} />
            </div>
            <div className="sim-field">
              <label>Bonus rounds</label>
              <input type="number" min={100} max={100_000} step={100} value={bonusSpins}
                onChange={e => setBonusSpins(Number(e.target.value))} disabled={runState === 'running'} />
            </div>
          </>
        ) : (
          <div className="sim-field">
            <label>Time limit (seconds)</label>
            <input type="number" min={5} max={3600} step={5} value={timeLimitSecs}
              onChange={e => setTimeLimitSecs(Number(e.target.value))} disabled={runState === 'running'} />
            <span className="field-hint">Split 50/50 between normal &amp; bonus</span>
          </div>
        )}

        <div className="sim-actions">
          {runState !== 'running'
            ? <button className="sim-btn sim-btn-run" onClick={startSim}>Run Simulation</button>
            : <button className="sim-btn sim-btn-cancel" onClick={cancelSim}>Cancel</button>}
        </div>
      </div>

      {/* ── Progress ── */}
      {(runState === 'running' || runState === 'done') && (
        <div className="sim-progress-section">
          <div className="sim-progress-row">
            <span className="sim-progress-label">Normal spins</span>
            <div className="sim-progress-bar"><div className="sim-progress-fill" style={{ width: `${normalPct}%` }} /></div>
            <span className="sim-progress-pct">{normalPct.toFixed(0)}%</span>
          </div>
          <div className="sim-progress-row">
            <span className="sim-progress-label">Bonus rounds</span>
            <div className="sim-progress-bar"><div className="sim-progress-fill bonus" style={{ width: `${bonusPct}%` }} /></div>
            <span className="sim-progress-pct">{bonusPct.toFixed(0)}%</span>
          </div>
          {activePhase && runState === 'running' && (
            <div className="sim-timing-row">
              <div className="sim-timing-stat"><span className="timing-label">Speed</span><span className="timing-value">{fmtRate(activePhase.spinsPerSec)}</span></div>
              <div className="sim-timing-stat"><span className="timing-label">Elapsed</span><span className="timing-value">{fmt(activePhase.elapsedMs)}</span></div>
              <div className="sim-timing-stat"><span className="timing-label">ETA</span><span className="timing-value eta">{fmt(activePhase.etaMs)}</span></div>
              <div className="sim-timing-stat"><span className="timing-label">Samples</span><span className="timing-value">{activePhase.done.toLocaleString()}</span></div>
              <div className="sim-timing-stat"><span className="timing-label">Phase</span><span className="timing-value phase">{activePhase.phase === 'normal' ? 'Normal' : 'Bonus'}</span></div>
            </div>
          )}
          <div className="sim-live-stats">
            {normalPhase && <><span>E(normal): £{normalPhase.currentMean.toFixed(4)}</span><span>p(bonus): {pct(normalPhase.pBonus * 100)}</span></>}
            {bonusPhase && <><span>E(bonus): £{bonusPhase.currentMean.toFixed(2)}</span><span>p(bonus): {pct(bonusPhase.pBonus * 100)}</span></>}
          </div>
        </div>
      )}
      {runState === 'cancelled' && <div className="sim-status-msg cancelled">Simulation cancelled.</div>}
      {runState === 'error' && <div className="sim-status-msg error">Error: {errorMsg}</div>}

      {/* ── Dashboard tabs ── */}
      {result && (
        <div className="sim-dashboard">
          <div className="dash-tab-bar">
            {([
              ['overview', 'Overview'],
              ['windist', 'Win Distribution'],
              ['symbols', 'Symbols & Multipliers'],
              ['meter', 'Meter & Cascades'],
              ['bonus', 'Bonus Deep Dive'],
              ['convergence', 'Convergence'],
            ] as [DashTab, string][]).map(([id, name]) => (
              <button key={id} className={`dash-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}>{name}</button>
            ))}
          </div>

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="dash-panel">
              <div className={`rtp-hero ${result.summary.rtpPercent >= 90 && result.summary.rtpPercent <= 100 ? 'good' : 'bad'}`}>
                <div className="rtp-hero-label">Return to Player</div>
                <div className="rtp-hero-value">{result.summary.rtpPercent.toFixed(2)}%</div>
                <div className="rtp-hero-target">Target: {TARGET_RTP}% | Gap: {(result.summary.rtpPercent - TARGET_RTP).toFixed(2)}pp</div>
              </div>

              <div className="formula-card">
                <span className="formula-part">E(total) = £{result.summary.eTotalPerSpin.toFixed(4)}</span>
                <span className="formula-eq">=</span>
                <span className="formula-part normal">£{result.summary.eNormalWinExclBonus.toFixed(4)} (normal)</span>
                <span className="formula-eq">+</span>
                <span className="formula-part bonus">{pct(result.summary.pBonus * 100)} × £{result.summary.eBonus.toFixed(2)} (bonus)</span>
              </div>

              <div className="sim-stat-grid">
                <StatCard label="p(Bonus)" value={pct(result.summary.pBonus * 100)} sub={`1 in ${(1 / result.summary.pBonus).toFixed(0)} spins`} />
                <StatCard label="E(normal win)" value={`£${result.summary.eNormalWinExclBonus.toFixed(4)}`} sub="excl. bonus contribution" />
                <StatCard label="E(bonus win)" value={`£${result.summary.eBonus.toFixed(2)}`} sub="per round" />
                <StatCard label="95% CI ±" value={`${result.summary.ciHalfWidthPercent.toFixed(2)}pp`} sub={result.summary.ciHalfWidthPercent <= 0.5 ? 'Converged ✓' : 'Need more samples'} />
                <StatCard label="Normal spins" value={result.meta.normalSpins.toLocaleString()} sub={fmtRate(result.summary.normalSpinsPerSec)} />
                <StatCard label="Bonus rounds" value={result.meta.bonusSpins.toLocaleString()} sub={fmtRate(result.summary.bonusSpinsPerSec)} />
                <StatCard label="Total duration" value={fmt(result.meta.durationMs)} />
                <StatCard label="Zero-win spins" value={pct(result.normalAgg.pctZeroWin)} sub="normal play" />
                <StatCard label="Multiplier uplift" value={pct(result.normalAgg.multiplierContributionPct)} sub="% of normal RTP from multipliers" />
                <StatCard label="Bonus RTP contribution" value={pct((result.summary.pBonus * result.summary.eBonus / result.summary.eTotalPerSpin) * 100)} sub="% of total EV from bonus" />
              </div>

              <div className="sim-save-row">
                {saveState === 'saving' && <span className="save-status saving">Saving…</span>}
                {saveState === 'saved' && <span className="save-status saved">Saved to browser ✓ <button className="sim-btn sim-btn-save" onClick={() => exportRun(result.meta.runId)}>↓ Export JSON</button></span>}
                {saveState === 'failed' && (
                  <>
                    <span className="save-status failed">Auto-save failed</span>
                    <button className="sim-btn sim-btn-save" onClick={() => saveResult(result)}>Retry</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Win Distribution ── */}
          {activeTab === 'windist' && (
            <div className="dash-panel">
              <div className="dual-chart-row">
                <div className="chart-col">
                  <h3>Normal spin win distribution</h3>
                  <p className="chart-subtitle">{result.normalAgg.totalSpins.toLocaleString()} spins — % of spins in each win bracket</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={WIN_BUCKET_KEYS.map((k, i) => ({
                      name: WIN_BUCKET_LABELS[i],
                      pct: (result.normalAgg.winDist[k] / result.normalAgg.totalSpins) * 100,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#888" tickFormatter={v => `${v.toFixed(0)}%`} />
                      <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, '% of spins']} />
                      <Bar dataKey="pct" fill="#4ade80" radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="pct" position="top" formatter={(v: unknown) => Number(v) > 1 ? `${Number(v).toFixed(1)}%` : ''} style={{ fontSize: 10, fill: '#aaa' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="dist-stats">
                    <span>Zero-win: {pct(result.normalAgg.pctZeroWin)}</span>
                    <span>Return ≥ bet: {pct(result.normalAgg.pctPositiveReturn)}</span>
                  </div>
                </div>

                <div className="chart-col">
                  <h3>Bonus round win distribution</h3>
                  <p className="chart-subtitle">{result.bonusAgg.totalRounds.toLocaleString()} rounds — % of rounds in each win bracket</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={WIN_BUCKET_KEYS.map((k, i) => ({
                      name: WIN_BUCKET_LABELS[i],
                      pct: (result.bonusAgg.winDist[k] / Math.max(1, result.bonusAgg.totalRounds)) * 100,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#888" tickFormatter={v => `${v.toFixed(0)}%`} />
                      <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, '% of rounds']} />
                      <Bar dataKey="pct" fill="#f59e0b" radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="pct" position="top" formatter={(v: unknown) => Number(v) > 1 ? `${Number(v).toFixed(1)}%` : ''} style={{ fontSize: 10, fill: '#aaa' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="dist-stats">
                    <span>Avg win: £{(result.summary.eBonus).toFixed(2)}</span>
                    <span>Avg free spins: {result.bonusAgg.avgFreeSpinsUsed.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Symbols & Multipliers ── */}
          {activeTab === 'symbols' && (
            <div className="dash-panel">
              <div className="dual-chart-row">
                <div className="chart-col">
                  <h3>Symbol contribution — normal play</h3>
                  <p className="chart-subtitle">% of total normal win attributed to each symbol</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={result.normalAgg.symbolStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis type="number" stroke="#888" tickFormatter={v => `${v.toFixed(0)}%`} />
                      <YAxis type="category" dataKey="symbol" stroke="#888" width={30} tick={{ fontSize: 16 }} />
                      <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, '% of wins']} />
                      <Bar dataKey="payoutPct" radius={[0, 3, 3, 0]}>
                        {result.normalAgg.symbolStats.map(s => (
                          <Cell key={s.symbol} fill={SYMBOL_COLORS[s.symbol] ?? '#888'} />
                        ))}
                        <LabelList dataKey="payoutPct" position="right" formatter={(v: unknown) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 11, fill: '#ccc' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-col">
                  <h3>Symbol contribution — bonus</h3>
                  <p className="chart-subtitle">% of total bonus win attributed to each symbol</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={result.bonusAgg.symbolStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis type="number" stroke="#888" tickFormatter={v => `${v.toFixed(0)}%`} />
                      <YAxis type="category" dataKey="symbol" stroke="#888" width={30} tick={{ fontSize: 16 }} />
                      <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, '% of wins']} />
                      <Bar dataKey="payoutPct" radius={[0, 3, 3, 0]}>
                        {result.bonusAgg.symbolStats.map(s => (
                          <Cell key={s.symbol} fill={SYMBOL_COLORS[s.symbol] ?? '#888'} />
                        ))}
                        <LabelList dataKey="payoutPct" position="right" formatter={(v: unknown) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 11, fill: '#ccc' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <h3 style={{ marginTop: 24 }}>Symbol detail table — normal play</h3>
              <table className="sim-table">
                <thead><tr><th>Symbol</th><th>Win clusters</th><th>Avg cluster size</th><th>Total £</th><th>£ per spin</th><th>% of RTP</th></tr></thead>
                <tbody>
                  {result.normalAgg.symbolStats.map(s => (
                    <tr key={s.symbol}>
                      <td style={{ fontSize: '1.2rem' }}>{s.symbol}</td>
                      <td>{s.clusters.toLocaleString()}</td>
                      <td>{s.avgClusterSize.toFixed(1)}</td>
                      <td>£{s.payout.toFixed(2)}</td>
                      <td>£{(s.payout / result.normalAgg.totalSpins).toFixed(4)}</td>
                      <td>{pct(s.payoutPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="dual-chart-row" style={{ marginTop: 24 }}>
                <div className="chart-col">
                  <h3>Multiplier activation count — normal</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={result.normalAgg.multiplierStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="value" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'activations']} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {result.normalAgg.multiplierStats.map(m => <Cell key={m.value} fill={MULT_COLORS[m.value] ?? '#888'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-col">
                  <h3>Multiplier contribution £ — normal</h3>
                  <p className="chart-subtitle">Extra £ added vs no multiplier. Total uplift: £{result.normalAgg.totalMultiplierContribution.toFixed(0)} ({pct(result.normalAgg.multiplierContributionPct)} of wins)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={result.normalAgg.multiplierStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="value" stroke="#888" />
                      <YAxis stroke="#888" tickFormatter={v => `£${Number(v).toFixed(0)}`} />
                      <Tooltip formatter={(v) => [`£${Number(v).toFixed(2)}`, 'contribution']} />
                      <Bar dataKey="contribution" radius={[3, 3, 0, 0]}>
                        {result.normalAgg.multiplierStats.map(m => <Cell key={m.value} fill={MULT_COLORS[m.value] ?? '#888'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="special-row">
                <div className="special-card">
                  <div className="special-icon">🔮</div>
                  <div className="special-label">Mega Wild — normal</div>
                  <div className="special-stat"><span>Triggers:</span><span>{result.normalAgg.megaWildCount.toLocaleString()}</span></div>
                  <div className="special-stat"><span>Rate:</span><span>{pct((result.normalAgg.megaWildCount / result.normalAgg.totalSpins) * 100)}</span></div>
                  <div className="special-stat"><span>Total payout:</span><span>£{result.normalAgg.megaWildPayout.toFixed(2)}</span></div>
                  <div className="special-stat"><span>% of wins:</span><span>{pct(result.normalAgg.megaWildPayoutPct)}</span></div>
                </div>
                <div className="special-card">
                  <div className="special-icon">🔮</div>
                  <div className="special-label">Mega Wild — bonus</div>
                  <div className="special-stat"><span>Triggers:</span><span>{result.bonusAgg.megaWildCount.toLocaleString()}</span></div>
                  <div className="special-stat"><span>Rate:</span><span>{pct((result.bonusAgg.megaWildCount / Math.max(1, result.bonusAgg.totalRounds)) * 100)}</span></div>
                  <div className="special-stat"><span>Total payout:</span><span>£{result.bonusAgg.megaWildPayout.toFixed(2)}</span></div>
                  <div className="special-stat"><span>% of wins:</span><span>{pct(result.bonusAgg.megaWildPayoutPct)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* ── Meter & Cascades ── */}
          {activeTab === 'meter' && (
            <div className="dash-panel">
              <div className="dual-chart-row">
                <div className="chart-col">
                  <h3>Bonus meter tier hit rates — normal play</h3>
                  <p className="chart-subtitle">P(meter reaching each breakpoint) per spin. Cumulative — reaching 30 implies reaching 15.</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={result.normalAgg.meterBPRates}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="label" stroke="#888" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#888" tickFormatter={v => `${(Number(v) * 100).toFixed(1)}%`} />
                      <Tooltip formatter={(v) => [`${(Number(v) * 100).toFixed(2)}%`, 'hit rate']} />
                      <Bar dataKey="rate" fill="#4ade80" radius={[3, 3, 0, 0]}>
                        <LabelList dataKey="rate" position="top"
                          formatter={(v: unknown) => `${(Number(v) * 100).toFixed(1)}%`}
                          style={{ fontSize: 11, fill: '#aaa' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-col">
                  <h3>Cascade chain distribution — normal play</h3>
                  <p className="chart-subtitle">% of spins with each chain count. Avg chains: {result.normalAgg.avgChainsPerSpin.toFixed(2)}</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={result.normalAgg.chainDist.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="chains" stroke="#888" label={{ value: 'Chains', position: 'insideBottomRight', offset: -5, fill: '#888', fontSize: 11 }} />
                      <YAxis stroke="#888" tickFormatter={v => `${v.toFixed(1)}%`} />
                      <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, '% of spins']} labelFormatter={v => `${v} cascade(s)`} />
                      <Bar dataKey="pct" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="sim-stat-grid" style={{ marginTop: 16 }}>
                <StatCard label="Avg chains / spin" value={result.normalAgg.avgChainsPerSpin.toFixed(3)} />
                <StatCard label="Avg wild spawns / spin" value={result.normalAgg.avgWildSpawnsPerSpin.toFixed(3)} />
                <StatCard label="Bonus trigger rate" value={pct(result.summary.pBonus * 100)} sub={`1 in ${(1 / result.summary.pBonus).toFixed(0)} spins`} />
                <StatCard label="P(meter reaches 15)" value={pct((result.normalAgg.meterBPRates[0] ? result.normalAgg.meterBPRates[0].rate * 100 : 0))} />
                <StatCard label="P(meter reaches 30)" value={pct((result.normalAgg.meterBPRates[1] ? result.normalAgg.meterBPRates[1].rate * 100 : 0))} />
                <StatCard label="P(meter reaches 45)" value={pct((result.normalAgg.meterBPRates[2] ? result.normalAgg.meterBPRates[2].rate * 100 : 0))} />
              </div>
            </div>
          )}

          {/* ── Bonus Deep Dive ── */}
          {activeTab === 'bonus' && (
            <div className="dash-panel">
              <div className="sim-stat-grid" style={{ marginTop: 16 }}>
                <StatCard label="Avg free spins / round" value={result.bonusAgg.avgFreeSpinsUsed.toFixed(2)} sub="10 base + extras" />
                <StatCard label="Bonus meter fill rate" value={pct(result.bonusAgg.meterFillRate)} sub="% rounds earning +2 spins" />
                <StatCard label="Total extra spin events" value={result.bonusAgg.totalExtraSpinEvents.toLocaleString()} />
                <StatCard label="Rounds with extra spins" value={pct(result.bonusAgg.roundsWithExtraSpins / result.bonusAgg.totalRounds * 100)} />
                <StatCard label="Bonus multiplier uplift" value={pct(result.bonusAgg.multiplierContributionPct)} sub="% of bonus RTP from multipliers" />
              </div>

              <h3 style={{ marginTop: 20 }}>Bonus multiplier detail</h3>
              <table className="sim-table">
                <thead><tr><th>Multiplier</th><th>Activations</th><th>Total payout</th><th>Contribution vs 1x</th></tr></thead>
                <tbody>
                  {result.bonusAgg.multiplierStats.map(m => (
                    <tr key={m.value}>
                      <td style={{ color: MULT_COLORS[m.value] ?? '#ccc', fontWeight: 700 }}>{m.value}</td>
                      <td>{m.count.toLocaleString()}</td>
                      <td>£{m.totalPayout.toFixed(2)}</td>
                      <td>£{m.contribution.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Convergence ── */}
          {activeTab === 'convergence' && (
            <div className="dash-panel">
              {normalChartData.length > 1 && (
                <div className="sim-chart-section">
                  <h3>Normal spin E(X) convergence</h3>
                  <p className="chart-subtitle">Running mean win/spin (excl. bonus). Flat = converged.</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={normalChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="i" stroke="#888" tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <YAxis stroke="#888" tickFormatter={v => `£${Number(v).toFixed(3)}`} width={65} />
                      <Tooltip formatter={v => [`£${Number(v).toFixed(4)}`, 'Running mean']} labelFormatter={v => `Spin ${Number(v).toLocaleString()}`} />
                      <Line type="monotone" dataKey="mean" stroke="#4ade80" dot={false} strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {bonusChartData.length > 1 && (
                <div className="sim-chart-section">
                  <h3>Bonus round E(X) convergence</h3>
                  <p className="chart-subtitle">Running mean win/round. High variance — needs more rounds.</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={bonusChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="i" stroke="#888" tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <YAxis stroke="#888" tickFormatter={v => `£${Number(v).toFixed(1)}`} width={65} />
                      <Tooltip formatter={v => [`£${Number(v).toFixed(2)}`, 'Running mean']} labelFormatter={v => `Round ${Number(v).toLocaleString()}`} />
                      <Line type="monotone" dataKey="mean" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="sim-stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
