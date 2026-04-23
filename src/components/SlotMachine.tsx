import { useState, useCallback, useRef, useEffect } from 'react'
import './SlotMachine.css'

// Config imports
import {
  SYMBOL_PAYOUTS,
  SYMBOL_WEIGHTS,
  MULTIPLIER_WEIGHTS,
  NORMAL_MULTIPLIER_CHANCE,
  BONUS_MULTIPLIER_CHANCE,
  STICKY_MULTIPLIER_CAP,
  FRUIT_METER_MAX,
  FRUIT_METER_BREAKPOINTS,
  WILDS_PER_BREAKPOINT,
  BONUS_FRUIT_METER_MAX,
  BONUS_FRUIT_METER_BREAKPOINTS,
  BONUS_WILDS_PER_BREAKPOINT,
  COLS,
  BASE_ROWS,
  MIN_CLUSTER_SIZE,
  BET_AMOUNT,
} from '../config'

// Type imports
import type { SlotMachineProps } from '../types'

// Utility imports
import { isMultiplier, isWild, isMegaWild, isWildcard, isTransmutation, getMultiplierValue } from '../utils/helpers'

// Audio imports
import { soundManager, playWinSound, playBonusSound } from '../audio'

// Logic imports
import {
  randomSymbol,
  randomBonusSymbol,
  findClusters,
  getMegaWildBonusCells,
  getTransmutationCells,
  generateGrid,
  generateBonusGrid,
  spawnWilds,
  cascadeGrid,
  calculateClusterWin,
  getNewBreakpointIndices,
} from '../logic'

function SlotMachine({ balance, onBalanceChange }: SlotMachineProps) {
  const [grid, setGrid] = useState<string[][]>(() => generateGrid())
  const [spinning, setSpinning] = useState(false)
  const [settledCols, setSettledCols] = useState<number>(0)
  const [matches, setMatches] = useState<Map<string, string>>(new Map()) // cellKey -> symbol
  const [fallingCells, setFallingCells] = useState<Set<string>>(new Set())
  const [lastWin, setLastWin] = useState(0)
  const [message, setMessage] = useState('')
  const [chainCount, setChainCount] = useState(0)
  const [showBonusModal, setShowBonusModal] = useState(false)
  const [minWinForAudio, setMinWinForAudio] = useState(0)
  const spinningRef = useRef(false)

  // Bonus mode state
  const [bonusMode, setBonusMode] = useState(false)
  const [freeSpins, setFreeSpins] = useState(0)
  const freeSpinsRef = useRef(0)
  const [bonusTotalWin, setBonusTotalWin] = useState(0)
  const bonusTotalWinRef = useRef(0)
  const stickyMultipliersRef = useRef<Map<string, string>>(new Map())

  // Fruit meter state (Tome of Madness style bonus trigger)
  const [fruitMeter, setFruitMeter] = useState(0)
  const [multiplierSpawnPositions, setMultiplierSpawnPositions] = useState<string[]>([]) // For spawn animation
  const [megaWildBonusCells, setMegaWildBonusCells] = useState<Set<string>>(new Set()) // Cells being cleared by mega wild effect

  // Bonus end celebration state
  const [showBonusEnd, setShowBonusEnd] = useState(false)
  const [countingWin, setCountingWin] = useState(0)
  const [countingDone, setCountingDone] = useState(false)

  // Big win celebration state (for normal play)
  const [showBigWin, setShowBigWin] = useState(false)
  const BIG_WIN_THRESHOLD = 20 // £20+ triggers big win celebration

  // Panel visibility — start collapsed on small screens
  const [showInfoCard, setShowInfoCard] = useState(() => window.innerWidth > 1100)
  const [showAdminPanel, setShowAdminPanel] = useState(() => window.innerWidth > 900)

  // Admin/testing features
  const [autoSpin, setAutoSpin] = useState(false)
  const [autoDeposit, setAutoDeposit] = useState(true)
  const autoSpinRef = useRef(false)
  const balanceRef = useRef(balance)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [sfxVolume, setSfxVolume] = useState(50)
  const [musicVolume, setMusicVolume] = useState(30)
  const [showPayoutInfo, setShowPayoutInfo] = useState(false)

  // Keep refs updated
  useEffect(() => {
    balanceRef.current = balance
  }, [balance])

  useEffect(() => {
    freeSpinsRef.current = freeSpins
  }, [freeSpins])

  // Update autoSpinRef when autoSpin changes
  useEffect(() => {
    autoSpinRef.current = autoSpin
  }, [autoSpin])

  // Update sound volumes
  useEffect(() => {
    soundManager.setSfxVolume(sfxVolume / 100)
  }, [sfxVolume])

  useEffect(() => {
    soundManager.setMusicVolume(musicVolume / 100)
  }, [musicVolume])

  // Auto-deposit when balance hits 0
  useEffect(() => {
    if (autoDeposit && balance <= 0 && !spinning && !bonusMode && !showBonusModal && !showBonusEnd) {
      const timer = setTimeout(() => {
        onBalanceChange(5)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [balance, autoDeposit, spinning, bonusMode, showBonusModal, showBonusEnd, onBalanceChange])

  // Start bonus mode
  const startBonusMode = useCallback(() => {
    setShowBonusModal(false)
    setBonusMode(true)
    setFreeSpins(10)
    freeSpinsRef.current = 10 // Update ref immediately
    setBonusTotalWin(0)
    bonusTotalWinRef.current = 0 // Reset ref too
    stickyMultipliersRef.current = new Map()
    // Generate a fresh grid for bonus mode with BASE_ROWS
    setGrid(generateGrid(BASE_ROWS))
    setMessage('BONUS MODE! 10 Free Spins!')
    // Switch to intense bonus music
    soundManager.setBonusMode(true)
  }, [])

  // Bonus spin function (with fruit meter - filling it adds +5 spins)
  const bonusSpin = useCallback(async () => {
    // Use ref to check free spins (state may be stale in callback)
    if (freeSpinsRef.current <= 0 || spinningRef.current) return

    spinningRef.current = true
    // Decrement free spins - update ref immediately so async code sees correct value
    const newSpinCount = freeSpinsRef.current - 1
    freeSpinsRef.current = newSpinCount
    setFreeSpins(newSpinCount)
    setSpinning(true)
    soundManager.startSpin()
    soundManager.resetChain()
    setMatches(new Map())
    setFallingCells(new Set())
    setMultiplierSpawnPositions([])
    setLastWin(0)
    setMessage('')
    setChainCount(0)
    setSettledCols(0)

    // Reset meter to 0 at start of each spin (same as normal play)
    let currentMeterValue = 0
    setFruitMeter(0)

    const activeRows = BASE_ROWS

    // Generate final grid with current active rows (bonus mode includes 2x multipliers)
    let currentGrid = generateBonusGrid(activeRows)

    // Overlay sticky multipliers accumulated from previous spins in this bonus round
    for (const [pos, sym] of stickyMultipliersRef.current) {
      const [c, r] = pos.split('-').map(Number)
      if (r < activeRows) currentGrid[c][r] = sym
    }

    // Sticky cells stay locked in place during spin; only non-sticky cells cycle randomly
    const spinCol = (colIdx: number): string[] =>
      Array(activeRows).fill(null).map((_, rowIdx) =>
        stickyMultipliersRef.current.get(`${colIdx}-${rowIdx}`) ?? randomBonusSymbol()
      )

    // Start with all columns spinning
    setGrid(Array(COLS).fill(null).map((_, colIdx) => spinCol(colIdx)))

    // Initial spin for 0.5 seconds before settling starts
    const initialSpinStart = Date.now()
    while (Date.now() - initialSpinStart < 500) {
      await new Promise(resolve => setTimeout(resolve, 25))
      setGrid(Array(COLS).fill(null).map((_, colIdx) => spinCol(colIdx)))
    }

    // Settle columns one at a time from left to right
    for (let col = 0; col < COLS; col++) {
      const delay = 20

      // Brief spin before settling this column
      const spinDuration = 60
      const spinStart = Date.now()

      while (Date.now() - spinStart < spinDuration) {
        await new Promise(resolve => setTimeout(resolve, 25))
        setGrid(prev => {
          const newGrid = prev.map((c, i) => {
            if (i < col) return [...c]
            return spinCol(i)
          })
          return newGrid
        })
      }

      // Settle this column with final values
      setGrid(prev => {
        const newGrid = prev.map((c, i) => {
          if (i === col) return [...currentGrid[col]]
          if (i < col) return [...c]
          return spinCol(i)
        })
        return newGrid
      })
      setSettledCols(col + 1)
      soundManager.playSettle(col)

      await new Promise(resolve => setTimeout(resolve, delay))
    }

    setSpinning(false)
    soundManager.stopSpin()

    // Finale spin: when this was the last spin (newSpinCount === 0), pre-seed 5 wilds
    if (newSpinCount === 0) {
      setMessage('⚡ FINALE SPIN! Bonus wilds incoming!')
      soundManager.playBonusLand()
      await new Promise(resolve => setTimeout(resolve, 600))
      const { newGrid: finaleGrid, spawnedPositions } = spawnWilds(currentGrid, 5, activeRows)
      currentGrid = finaleGrid
      setGrid(currentGrid)
      setMultiplierSpawnPositions(spawnedPositions)
      await new Promise(resolve => setTimeout(resolve, 700))
      setMultiplierSpawnPositions([])
    }

    // Now process cascades with fruit meter (bonus mode - filling meter adds +5 spins)
    let totalWin = 0
    let chain = 0
    let addedSpins = false
    let previousMeterValue = 0
    // Cascade loop - same as normal play, just with bigger meter target
    while (true) {
      const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, activeRows)

      if (clusters.length === 0) {
        break // No more matches
      }

      chain++
      setChainCount(chain)
      soundManager.playMatch()

      // Count matched symbols for meter (original clusters only)
      let matchedSymbolCount = 0
      const allMatchedMap = new Map<string, string>()
      const allMatchedSet = new Set<string>()

      for (const cluster of clusters) {
        let clusterSymbol = '🍒' // default
        for (const cell of cluster) {
          const [col, row] = cell.split('-').map(Number)
          const sym = currentGrid[col][row]
          if (!isWildcard(sym)) {
            clusterSymbol = sym
            break
          }
        }
        cluster.forEach(cell => {
          allMatchedMap.set(cell, clusterSymbol)
          allMatchedSet.add(cell)
          matchedSymbolCount++
        })
      }

      // Update fruit meter with ORIGINAL cluster count only (not mega wild bonus)
      previousMeterValue = currentMeterValue
      currentMeterValue = currentMeterValue + matchedSymbolCount
      setFruitMeter(Math.min(currentMeterValue, BONUS_FRUIT_METER_MAX))

      // Check for mega wild bonus cells BEFORE calculating win
      // These count towards cluster size for payout but NOT for meter
      const megaWildBonus = getMegaWildBonusCells(currentGrid, clusters, activeRows)
      let expandedClusters = clusters

      if (megaWildBonus && megaWildBonus.positions.size > 0) {
        // Create expanded clusters for win calculation
        expandedClusters = clusters.map(cluster => {
          let hasMegaWildInCluster = false
          let clusterMainSymbol: string | null = null
          for (const cellKey of cluster) {
            const [c, r] = cellKey.split('-').map(Number)
            const sym = currentGrid[c][r]
            if (isMegaWild(sym)) hasMegaWildInCluster = true
            if (!isWildcard(sym) && !clusterMainSymbol) clusterMainSymbol = sym
          }
          if (hasMegaWildInCluster && clusterMainSymbol === megaWildBonus.symbol) {
            const expandedCluster = new Set(cluster)
            megaWildBonus.positions.forEach(pos => expandedCluster.add(pos))
            return expandedCluster
          }
          return cluster
        })
      }

      // Handle transmutation: upgrade all matching symbols one tier
      const transResult = getTransmutationCells(currentGrid, expandedClusters, activeRows)
      if (transResult) {
        const { originalSymbol, upgradedSymbol, positions: transCells } = transResult
        for (let col = 0; col < COLS; col++) {
          for (let row = 0; row < activeRows; row++) {
            if (currentGrid[col][row] === originalSymbol) currentGrid[col][row] = upgradedSymbol
          }
        }
        expandedClusters = expandedClusters.map(cluster => {
          let hasT = false
          for (const k of cluster) {
            const [c, r] = k.split('-').map(Number)
            if (isTransmutation(currentGrid[c][r])) { hasT = true; break }
          }
          if (!hasT) return cluster
          const expanded = new Set(cluster)
          transCells.forEach(p => { expanded.add(p); allMatchedMap.set(p, upgradedSymbol); allMatchedSet.add(p) })
          return expanded
        })
        setGrid(currentGrid.map(col => [...col]))
      }

      // Record sticky multipliers from winning clusters (persists across spins in this bonus round)
      for (const cluster of expandedClusters) {
        for (const k of cluster) {
          const [c, r] = k.split('-').map(Number)
          const sym = currentGrid[c][r]
          if (isMultiplier(sym)) {
              if (stickyMultipliersRef.current.has(k) || stickyMultipliersRef.current.size < STICKY_MULTIPLIER_CAP) {
                stickyMultipliersRef.current.set(k, sym)
              }
            }
        }
      }

      // Show matches with symbol info (original clusters for display)
      setMatches(allMatchedMap)

      // Calculate win using EXPANDED clusters (includes mega wild bonus for payout)
      const { win: clusterWin, multipliers: clusterMultipliers, hasWild, hasMegaWild } = calculateClusterWin(currentGrid, expandedClusters)
      totalWin += clusterWin

      // Play appropriate sound based on wildcards involved
      // Note: Mega wild sound plays during bonus clear effect, not initial match
      if (hasMegaWild) {
        soundManager.playWildWin() // Activation sound - big sound comes during clear effect
      } else if (clusterMultipliers.length > 0) {
        const maxMult = Math.max(...clusterMultipliers)
        soundManager.playMultiplierWin(maxMult)
      } else if (hasWild) {
        soundManager.playWildWin()
      }

      // Display message with multiplier info
      const meterPercent = Math.round((Math.min(currentMeterValue, BONUS_FRUIT_METER_MAX) / BONUS_FRUIT_METER_MAX) * 100)
      if (transResult) {
        setMessage(`🌀 TRANSMUTATION! ${transResult.originalSymbol}→${transResult.upgradedSymbol}! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
      } else if (hasMegaWild) {
        setMessage(`🔮 MEGA WILD! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
      } else if (clusterMultipliers.length > 0) {
        const multTotal = clusterMultipliers.reduce((a, b) => a + b, 0)
        setMessage(`MULTIPLIER ${multTotal}x! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
      } else if (chain > 1) {
        setMessage(`Cascade ${chain}! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
      }

      // Check for +2 spins (meter filled)
      if (currentMeterValue >= BONUS_FRUIT_METER_MAX && !addedSpins) {
        addedSpins = true
        // Update ref immediately so async code sees correct value
        freeSpinsRef.current += 2
        setFreeSpins(freeSpinsRef.current)
        setMessage('+2 FREE SPINS!')
        soundManager.playBonusLand()
        await new Promise(resolve => setTimeout(resolve, 800))
      }

      // Check for breakpoint wild spawns and row unlocks
      const newBreakpointIndices = getNewBreakpointIndices(currentMeterValue, previousMeterValue, BONUS_FRUIT_METER_BREAKPOINTS)
      const wildsToSpawn = newBreakpointIndices
        .filter(idx => idx < BONUS_FRUIT_METER_BREAKPOINTS.length - 1) // Don't spawn on final breakpoint (that's +5 spins)
        .reduce((sum, idx) => sum + BONUS_WILDS_PER_BREAKPOINT[idx], 0)

      // Wait to show the match
      const hasMultiplier = clusterMultipliers.length > 0
      const matchDisplayTime = hasMultiplier ? 1800 : 1000
      await new Promise(resolve => setTimeout(resolve, matchDisplayTime))

      // MEGA WILD BONUS EFFECT: Animate clearing of bonus symbols
      // (megaWildBonus was already detected earlier for win calculation)
      if (megaWildBonus && megaWildBonus.positions.size > 0) {
        // Show the bonus cells being targeted
        setMegaWildBonusCells(megaWildBonus.positions)
        setMessage(`🔮 MEGA WILD CLEARS ALL ${megaWildBonus.symbol}! (+${megaWildBonus.positions.size} symbols)`)
        soundManager.playMegaWildWin()

        // Longer pause to let player enjoy the effect
        await new Promise(resolve => setTimeout(resolve, 1800))

        // Add bonus cells to the removal set (already counted for payout, not meter)
        for (const cell of megaWildBonus.positions) {
          allMatchedSet.add(cell)
        }

        // Clear the animation state
        setMegaWildBonusCells(new Set())
      }

      // Sticky multipliers stay in place — exclude from removal, treat as fixed during cascade
      const stickyKeys = new Set(stickyMultipliersRef.current.keys())
      for (const k of stickyKeys) allMatchedSet.delete(k)

      // Cascade - remove matches and drop tiles (gravity applies per-segment around fixed cells)
      const { newGrid, movedCells, newCells } = cascadeGrid(currentGrid, allMatchedSet, activeRows, true, stickyKeys)
      currentGrid = newGrid

      const allFalling = new Set([...movedCells, ...newCells])

      setMatches(new Map())
      setFallingCells(allFalling)
      setGrid(currentGrid)
      soundManager.playCascade()

      await new Promise(resolve => setTimeout(resolve, 350))
      setFallingCells(new Set())

      // Spawn wilds if breakpoints were passed
      if (wildsToSpawn > 0) {
        setMessage(`BREAKPOINT! Spawning ${wildsToSpawn} wilds!`)
        soundManager.playBonusLand()

        await new Promise(resolve => setTimeout(resolve, 500))

        const { newGrid: gridWithWilds, spawnedPositions } = spawnWilds(
          currentGrid,
          wildsToSpawn,
          activeRows
        )
        currentGrid = gridWithWilds
        setGrid(currentGrid)
        setMultiplierSpawnPositions(spawnedPositions)

        await new Promise(resolve => setTimeout(resolve, 600))
        setMultiplierSpawnPositions([])
      }

      await new Promise(resolve => setTimeout(resolve, 150))
    }

    // Reset meter at end of spin (no overflow)
    setFruitMeter(0)

    spinningRef.current = false

    if (totalWin > 0) {
      const roundedWin = Math.round(totalWin * 100) / 100
      setLastWin(roundedWin)
      // Update ref immediately so async code sees correct value
      bonusTotalWinRef.current += roundedWin
      setBonusTotalWin(bonusTotalWinRef.current)

      if (roundedWin >= minWinForAudio) {
        playWinSound(roundedWin)
      }

      if (chain <= 1) {
        setMessage(`You won £${roundedWin.toFixed(2)}!`)
      }
    } else {
      setMessage('')
    }

    // Check if bonus mode is over (use ref for accurate value)
    const spinsRemaining = freeSpinsRef.current

    if (spinsRemaining > 0 && autoSpinRef.current) {
      // Continue bonus autospin
      setTimeout(() => {
        if (autoSpinRef.current && !spinningRef.current && freeSpinsRef.current > 0) {
          bonusSpin()
        }
      }, 1500)
    } else if (spinsRemaining <= 0) {
      // Bonus is over - show celebration
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Use ref for accurate total (totalWin was already added to ref above)
      const finalWin = bonusTotalWinRef.current

      // Start the countup celebration
      setShowBonusEnd(true)
      setCountingWin(0)
      setCountingDone(false)
      soundManager.resetCountup()

      const countDuration = 3000
      const steps = 60
      const stepTime = countDuration / steps
      const increment = finalWin / steps

      for (let i = 1; i <= steps; i++) {
        await new Promise(resolve => setTimeout(resolve, stepTime))
        setCountingWin(Math.min(increment * i, finalWin))
        if (i % 3 === 0) {
          soundManager.playCountup()
        }
      }

      setCountingWin(finalWin)
      setCountingDone(true)
      soundManager.playCountupComplete()

      if (finalWin >= minWinForAudio) {
        playWinSound(finalWin)
      }

      // Wait for celebration, but shorter if autospin is on
      const celebrationWait = autoSpinRef.current ? 2500 : 5000
      await new Promise(resolve => setTimeout(resolve, celebrationWait))

      setShowBonusEnd(false)
      setCountingDone(false)
      onBalanceChange(finalWin)
      setBonusMode(false)
      soundManager.setBonusMode(false) // Switch back to normal music
      setBonusTotalWin(0)
      bonusTotalWinRef.current = 0 // Reset ref too
      setFruitMeter(0)
      setMessage(`BONUS COMPLETE! Total: £${finalWin.toFixed(2)}`)
      setGrid(generateGrid(BASE_ROWS))
      spinningRef.current = false // Ensure spinning is false

      // If autospin is on, continue with normal play after a brief delay
      if (autoSpinRef.current) {
        setTimeout(() => {
          // Trigger normal spin if conditions are met
          if (autoSpinRef.current && !spinningRef.current && balanceRef.current >= BET_AMOUNT) {
            // Find the NORMAL spin button (not bonus) - it doesn't have bonus-spin-btn class
            const spinBtn = document.querySelector('.spin-btn:not(.bonus-spin-btn):not(:disabled)') as HTMLButtonElement
            if (spinBtn) {
              spinBtn.click()
            }
          }
        }, 1500)
      }
    }
  }, [bonusTotalWin, onBalanceChange, minWinForAudio])

  const spin = useCallback(async () => {
    // Don't allow normal spin during bonus mode
    if (bonusMode) return

    if (balance < BET_AMOUNT || spinningRef.current) {
      if (balance < BET_AMOUNT) {
        setMessage('Not enough balance! Deposit more.')
      }
      return
    }

    spinningRef.current = true
    onBalanceChange(-BET_AMOUNT)
    setSpinning(true)
    soundManager.startSpin()
    soundManager.resetChain()
    setMatches(new Map())
    setFallingCells(new Set())
    setMultiplierSpawnPositions([])
    setLastWin(0)
    setMessage('')
    setChainCount(0)
    setSettledCols(0)

    // Reset fruit meter at start of each normal spin (overfill only applies in bonus mode)
    setFruitMeter(0)
    let currentMeterValue = 0

    // Generate final grid upfront (guaranteed no instant wins)
    let currentGrid = generateGrid()

    // Start with all columns spinning
    const spinningGrid: string[][] = Array(COLS).fill(null).map(() =>
      Array(BASE_ROWS).fill(null).map(() => randomSymbol(true))
    )
    setGrid(spinningGrid)

    // Initial spin for 0.5 seconds before settling starts
    const initialSpinStart = Date.now()
    while (Date.now() - initialSpinStart < 500) {
      await new Promise(resolve => setTimeout(resolve, 25))
      setGrid(Array(COLS).fill(null).map(() =>
        Array(BASE_ROWS).fill(null).map(() => randomSymbol(true))
      ))
    }

    // Settle columns one at a time from left to right
    for (let col = 0; col < COLS; col++) {
      const delay = 20

      // Brief spin before settling this column
      const spinDuration = 60
      const spinStart = Date.now()

      while (Date.now() - spinStart < spinDuration) {
        await new Promise(resolve => setTimeout(resolve, 25))
        setGrid(prev => {
          const newGrid = prev.map((c, i) => {
            // Columns already settled - keep their values
            if (i < col) return [...c]
            // All other columns keep spinning
            return Array(BASE_ROWS).fill(null).map(() => randomSymbol(true))
          })
          return newGrid
        })
      }

      // Settle this column with final values
      setGrid(prev => {
        const newGrid = prev.map((c, i) => {
          if (i === col) return [...currentGrid[col]]
          if (i < col) return [...c] // Already settled
          return Array(BASE_ROWS).fill(null).map(() => randomSymbol(true)) // Keep spinning
        })
        return newGrid
      })
      setSettledCols(col + 1)
      soundManager.playSettle(col)

      await new Promise(resolve => setTimeout(resolve, delay))
    }

    setSpinning(false)
    soundManager.stopSpin()

    // Now process cascades with fruit meter system
    let totalWin = 0
    let chain = 0
    let bonusTriggered = false

    // Outer loop: handles breakpoint re-triggering
    while (true) {
      const meterBeforePhase = currentMeterValue

      // Inner loop: standard cascade until no more matches
      while (true) {
        const clusters = findClusters(currentGrid, MIN_CLUSTER_SIZE, BASE_ROWS)

        if (clusters.length === 0) {
          break // No more matches in this phase
        }

        chain++
        setChainCount(chain)
        soundManager.playMatch()

        // Count matched symbols for meter (original clusters only)
        let matchedSymbolCount = 0
        const allMatchedMap = new Map<string, string>()
        const allMatchedSet = new Set<string>()

        for (const cluster of clusters) {
          // Find the main symbol for this cluster
          let clusterSymbol = '🍒' // default
          for (const cell of cluster) {
            const [col, row] = cell.split('-').map(Number)
            const sym = currentGrid[col][row]
            if (!isWildcard(sym)) {
              clusterSymbol = sym
              break
            }
          }
          cluster.forEach(cell => {
            allMatchedMap.set(cell, clusterSymbol)
            allMatchedSet.add(cell)
            matchedSymbolCount++
          })
        }

        // Update fruit meter with ORIGINAL cluster count only (not mega wild bonus)
        currentMeterValue = Math.min(currentMeterValue + matchedSymbolCount, FRUIT_METER_MAX)
        setFruitMeter(currentMeterValue)

        // Check for mega wild bonus cells BEFORE calculating win
        // These count towards cluster size for payout but NOT for meter
        const megaWildBonus = getMegaWildBonusCells(currentGrid, clusters, BASE_ROWS)
        let expandedClusters = clusters

        if (megaWildBonus && megaWildBonus.positions.size > 0) {
          // Create expanded clusters for win calculation
          // Find which cluster has the mega wild and expand it
          expandedClusters = clusters.map(cluster => {
            // Check if this cluster triggered the mega wild
            let hasMegaWildInCluster = false
            let clusterMainSymbol: string | null = null
            for (const cellKey of cluster) {
              const [c, r] = cellKey.split('-').map(Number)
              const sym = currentGrid[c][r]
              if (isMegaWild(sym)) hasMegaWildInCluster = true
              if (!isWildcard(sym) && !clusterMainSymbol) clusterMainSymbol = sym
            }
            // If this cluster has mega wild and matches the bonus symbol, expand it
            if (hasMegaWildInCluster && clusterMainSymbol === megaWildBonus.symbol) {
              const expandedCluster = new Set(cluster)
              megaWildBonus.positions.forEach(pos => expandedCluster.add(pos))
              return expandedCluster
            }
            return cluster
          })
        }

        // Handle transmutation: upgrade all matching symbols one tier
        const transResult = getTransmutationCells(currentGrid, expandedClusters, BASE_ROWS)
        if (transResult) {
          const { originalSymbol, upgradedSymbol, positions: transCells } = transResult
          for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < BASE_ROWS; row++) {
              if (currentGrid[col][row] === originalSymbol) currentGrid[col][row] = upgradedSymbol
            }
          }
          expandedClusters = expandedClusters.map(cluster => {
            let hasT = false
            for (const k of cluster) {
              const [c, r] = k.split('-').map(Number)
              if (isTransmutation(currentGrid[c][r])) { hasT = true; break }
            }
            if (!hasT) return cluster
            const expanded = new Set(cluster)
            transCells.forEach(p => { expanded.add(p); allMatchedMap.set(p, upgradedSymbol); allMatchedSet.add(p) })
            return expanded
          })
          setGrid(currentGrid.map(col => [...col]))
        }

        // Show matches with symbol info (original clusters for display)
        setMatches(allMatchedMap)

        // Calculate win using EXPANDED clusters (includes mega wild bonus for payout)
        const { win: clusterWin, multipliers: clusterMultipliers, hasWild, hasMegaWild } = calculateClusterWin(currentGrid, expandedClusters)
        totalWin += clusterWin

        // Play appropriate sound based on wildcards involved
        // Note: Mega wild sound plays during bonus clear effect, not initial match
        if (hasMegaWild) {
          soundManager.playWildWin() // Activation sound - big sound comes during clear effect
        } else if (clusterMultipliers.length > 0) {
          const maxMult = Math.max(...clusterMultipliers)
          soundManager.playMultiplierWin(maxMult)
        } else if (hasWild) {
          soundManager.playWildWin()
        }

        // Display message with meter progress
        const meterPercent = Math.round((currentMeterValue / FRUIT_METER_MAX) * 100)
        if (transResult) {
          setMessage(`🌀 TRANSMUTATION! ${transResult.originalSymbol}→${transResult.upgradedSymbol}! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
        } else if (hasMegaWild) {
          setMessage(`🔮 MEGA WILD! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
        } else if (clusterMultipliers.length > 0) {
          const multTotal = clusterMultipliers.reduce((a, b) => a + b, 0)
          setMessage(`MULTIPLIER ${multTotal}x! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
        } else if (chain > 1) {
          setMessage(`Cascade ${chain}! +£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
        } else {
          setMessage(`+£${clusterWin.toFixed(2)} | Meter: ${meterPercent}%`)
        }

        // Wait to show the match (longer for special wins)
        const hasSpecialWin = hasMegaWild || clusterMultipliers.length > 0
        await new Promise(resolve => setTimeout(resolve, hasSpecialWin ? 1500 : 1000))

        // MEGA WILD BONUS EFFECT: Animate clearing of bonus symbols
        // (megaWildBonus was already detected earlier for win calculation)
        if (megaWildBonus && megaWildBonus.positions.size > 0) {
          // Show the bonus cells being targeted
          setMegaWildBonusCells(megaWildBonus.positions)
          setMessage(`🔮 MEGA WILD CLEARS ALL ${megaWildBonus.symbol}! (+${megaWildBonus.positions.size} symbols)`)
          soundManager.playMegaWildWin()

          // Longer pause to let player enjoy the effect
          await new Promise(resolve => setTimeout(resolve, 1800))

          // Add bonus cells to the removal set (already counted for payout, not meter)
          for (const cell of megaWildBonus.positions) {
            allMatchedSet.add(cell)
          }

          // Clear the animation state
          setMegaWildBonusCells(new Set())
        }

        // Cascade - remove matches and drop tiles
        const { newGrid, movedCells, newCells } = cascadeGrid(currentGrid, allMatchedSet, BASE_ROWS)
        currentGrid = newGrid

        // Combine moved and new cells for falling animation
        const allFalling = new Set([...movedCells, ...newCells])

        setMatches(new Map())
        setFallingCells(allFalling)
        setGrid(currentGrid)
        soundManager.playCascade()

        // Wait for fall animation
        await new Promise(resolve => setTimeout(resolve, 350))
        setFallingCells(new Set())

        // Small delay before checking next cascade
        await new Promise(resolve => setTimeout(resolve, 150))
      }

      // Inner loop ended (no more matches)
      // Check if any NEW breakpoints were passed during this phase
      const newBreakpointIndices = getNewBreakpointIndices(currentMeterValue, meterBeforePhase)

      // Calculate total wilds to spawn based on which breakpoints were hit
      // (last breakpoint has 0 wilds - it's the bonus trigger)
      const wildsToSpawn = newBreakpointIndices.reduce((sum, idx) => sum + WILDS_PER_BREAKPOINT[idx], 0)

      // Always spawn wilds first if any breakpoints were passed (even if bonus will trigger)
      if (wildsToSpawn > 0) {
        setMessage(`BREAKPOINT! Spawning ${wildsToSpawn} wilds!`)
        soundManager.playBonusLand()

        await new Promise(resolve => setTimeout(resolve, 500))

        // Spawn wilds at random positions
        const { newGrid, spawnedPositions } = spawnWilds(
          currentGrid,
          wildsToSpawn,
          BASE_ROWS
        )
        currentGrid = newGrid
        setGrid(currentGrid)
        setMultiplierSpawnPositions(spawnedPositions) // Reuse for wild spawn animation

        // Brief animation delay for spawned wilds
        await new Promise(resolve => setTimeout(resolve, 600))
        setMultiplierSpawnPositions([])

        // Continue outer loop to let spawned wilds cascade
        continue
      }

      // No wilds to spawn - check if we should trigger bonus or end cascading
      if (currentMeterValue >= FRUIT_METER_MAX) {
        bonusTriggered = true
      }

      // No new breakpoints with wilds, we're done cascading
      break
    }

    // Check for bonus trigger (meter full) - only after all cascading and rewards collected
    if (bonusTriggered) {
      // Keep overfill for bonus mode (meter value above 60 carries into bonus)
      const overfill = currentMeterValue - FRUIT_METER_MAX
      setFruitMeter(overfill)

      setMessage('BONUS! Meter Full - 10 FREE SPINS!')
      setShowBonusModal(true)
      playBonusSound()
    }
    // Normal mode: meter stays at current value visually until next spin resets it to 0
    // No consumption or overfill calculation needed - meter simply accumulates toward 60

    spinningRef.current = false

    if (totalWin > 0) {
      const roundedWin = Math.round(totalWin * 100) / 100
      setLastWin(roundedWin)

      // Big win celebration for normal play (threshold: £5+)
      if (!bonusTriggered && roundedWin >= BIG_WIN_THRESHOLD) {
        // Show big win celebration with count-up
        soundManager.playBigWinFanfare()
        setShowBigWin(true)
        setCountingWin(0)
        setCountingDone(false)
        soundManager.resetCountup()

        const countDuration = 2000
        const steps = 40
        const stepTime = countDuration / steps
        const increment = roundedWin / steps

        for (let i = 1; i <= steps; i++) {
          await new Promise(resolve => setTimeout(resolve, stepTime))
          setCountingWin(Math.min(increment * i, roundedWin))
          if (i % 2 === 0) {
            soundManager.playCountup()
          }
        }

        setCountingWin(roundedWin)
        setCountingDone(true)
        soundManager.playCountupComplete()

        if (roundedWin >= minWinForAudio) {
          playWinSound(roundedWin)
        }

        await new Promise(resolve => setTimeout(resolve, 2500))
        setShowBigWin(false)
        setCountingDone(false)
        onBalanceChange(totalWin)
      } else {
        // Regular win
        onBalanceChange(totalWin)

        // Play win sound based on win amount (only if not bonus and above min threshold)
        if (!bonusTriggered && roundedWin >= minWinForAudio) {
          playWinSound(roundedWin)
        }

        if (!bonusTriggered) {
          if (chain > 1) {
            setMessage(`${chain} cascades! Total: £${roundedWin.toFixed(2)}`)
          } else {
            setMessage(`You won £${roundedWin.toFixed(2)}!`)
          }
        }
      }
    } else if (!bonusTriggered) {
      setMessage('')
    }

    // Autospin continuation (if not going to bonus and have balance)
    if (autoSpinRef.current && !bonusTriggered) {
      setTimeout(() => {
        if (autoSpinRef.current && !spinningRef.current && balanceRef.current >= BET_AMOUNT) {
          spin()
        }
      }, 1500)
    }
  }, [balance, bonusMode, onBalanceChange, minWinForAudio, fruitMeter, BIG_WIN_THRESHOLD])

  // Convert column-based grid to row-based for display
  const activeRows = BASE_ROWS
  const displayRows: (string | null)[][] = []

  for (let row = 0; row < activeRows; row++) {
    displayRows.push(grid.map(col => (col[row] ?? null)))
  }

  return (
    <div className={`slot-machine ${bonusMode ? 'bonus-mode' : ''}`}>
      {/* Info Cards - positioned to the left of the game area */}
      <div className="info-cards-container">
        <button className="panel-toggle" onClick={() => setShowInfoCard(v => !v)}>
          {showInfoCard ? '▲ Hide' : '▼ How to Play'}
        </button>
        {showInfoCard && (!bonusMode ? (
          // Normal Play Info Card
          <div className="info-card normal-info">
            <h3>How to Play</h3>
            <div className="info-section">
              <h4>Matching</h4>
              <p>Connect <strong>7+</strong> matching symbols horizontally or vertically to win.</p>
            </div>
            <div className="info-section">
              <h4>Symbols</h4>
              <div className="symbol-list">
                <span>🍒 Common</span>
                <span>🍀 Common</span>
                <span>🍇 Medium</span>
                <span>🔔 Rare</span>
                <span>💎 Jackpot</span>
              </div>
            </div>
            <div className="info-section">
              <h4>Cascades</h4>
              <p>Winning symbols disappear and new ones fall. Keep matching to fill the meter!</p>
            </div>
            <div className="info-section">
              <h4>Fruit Meter</h4>
              <p>Every matched symbol fills the meter. Hit breakpoints to spawn ⭐ wild symbols!</p>
              <div className="breakpoint-list">
                <span>15 → +2⭐</span>
                <span>30 → +3⭐</span>
                <span>45 → +4⭐</span>
                <span>60 → BONUS!</span>
              </div>
            </div>
            <div className="info-section">
              <h4>Wilds & Multipliers</h4>
              <p>⭐ Wilds match any symbol. Multipliers (2x-10x) boost your cluster wins!</p>
              <p className="mega-wild-info">🔮 <strong>Mega Wild</strong> (Rare!) - Consumes ALL matching symbols on the grid!</p>
            </div>

            {/* Bonus Preview Section */}
            <div className="bonus-preview">
              <div className="bonus-preview-header">
                <span>🎰</span>
                <h4>Bonus Round</h4>
                <span>🎰</span>
              </div>
              <div className="info-section">
                <h4>10 Free Spins</h4>
                <p>Fill the meter to 60 to trigger the bonus and win <strong>10 free spins</strong>!</p>
              </div>
              <div className="info-section">
                <h4>Expanding Grid</h4>
                <p>Hit meter milestones (25, 50, 75) to unlock extra rows - up to <strong>8 rows</strong> total!</p>
              </div>
              <div className="info-section">
                <h4>Better Multipliers</h4>
                <p>Multipliers appear more often, including the exclusive <strong>20x multiplier</strong>!</p>
              </div>
              <div className="info-section">
                <h4>Bigger Target</h4>
                <p>Meter target is <strong>100</strong> (vs 60 in normal). Fill it to earn <strong>+5 Free Spins!</strong></p>
              </div>
            </div>
          </div>
        ) : (
          // Bonus Mode Info Card
          <div className="info-card bonus-info">
            <h3>Bonus Mode Active</h3>
            <div className="info-section">
              <h4>Free Spins</h4>
              <p>You have <strong>free spins</strong> - no cost per spin! Use them wisely.</p>
            </div>
            <div className="info-section">
              <h4>Unlock Rows</h4>
              <p>Reach meter milestones <strong>25, 50, 75</strong> to unlock extra rows (up to 8 total).</p>
            </div>
            <div className="info-section">
              <h4>More Multipliers</h4>
              <p>Multipliers appear more frequently, including the rare <strong>20x</strong>!</p>
            </div>
            <div className="info-section">
              <h4>Bonus Meter (100)</h4>
              <p>Larger meter with new breakpoints. Fill it completely to earn <strong>+5 extra spins</strong>!</p>
              <div className="breakpoint-list">
                <span>25 → +2⭐</span>
                <span>50 → +3⭐</span>
                <span>75 → +4⭐</span>
                <span>100 → +5 Spins</span>
              </div>
            </div>
            <div className="info-section highlight">
              <h4>Key Mechanic</h4>
              <p>The meter works just like normal play but with a <strong>bigger target (100)</strong>. Fill it completely to earn <strong>+5 Free Spins!</strong></p>
            </div>
          </div>
        ))}
      </div>

      {bonusMode && (
        <div className="bonus-mode-header">
          <span className="free-spins-display">
            FREE SPINS: {freeSpins}
          </span>
          <span className="bonus-total-display">
            BONUS WIN: £{bonusTotalWin.toFixed(2)}
          </span>
        </div>
      )}

      {/* Chain display - fixed position to avoid layout shift */}
      <div className="chain-display-container">
        <span className={`chain-display ${chainCount > 0 ? 'visible' : ''}`}>
          Chain x{chainCount || 1}
        </span>
      </div>

      <div className="game-area">
        {/* Vertical Fruit Meter on the left - shown in both normal and bonus mode */}
        {(() => {
          const meterMax = bonusMode ? BONUS_FRUIT_METER_MAX : FRUIT_METER_MAX
          const breakpoints = bonusMode ? BONUS_FRUIT_METER_BREAKPOINTS : FRUIT_METER_BREAKPOINTS
          const wildsPerBp = bonusMode ? BONUS_WILDS_PER_BREAKPOINT : WILDS_PER_BREAKPOINT
          const fillPercent = Math.min((fruitMeter / meterMax) * 100, 100)
          return (
            <div className={`fruit-meter-container ${bonusMode ? 'bonus-meter' : ''}`}>
              {/* Header */}
              <div className="meter-header">
                <div className="meter-title">{bonusMode ? 'BONUS' : 'BONUS'}</div>
                <div className="meter-subtitle">METER</div>
              </div>

              {/* Main meter area */}
              <div className="meter-body">
                {/* The actual meter bar */}
                <div className="fruit-meter">
                  <div className="meter-track">
                    <div
                      className={`fruit-meter-fill ${fruitMeter >= meterMax ? 'full' : ''}`}
                      style={{ height: `${fillPercent}%` }}
                    />
                    {/* Glow overlay */}
                    <div className="meter-glow" style={{ height: `${fillPercent}%` }} />
                  </div>
                </div>

                {/* Breakpoint indicators */}
                <div className="breakpoint-track">
                  {breakpoints.map((bp, i) => {
                    const isLast = i === breakpoints.length - 1
                    const isPassed = fruitMeter >= bp
                    const posPercent = (bp / meterMax) * 100
                    return (
                      <div
                        key={i}
                        className={`breakpoint-node ${isPassed ? 'passed' : ''} ${isLast ? 'final' : ''}`}
                        style={{ bottom: `${posPercent}%` }}
                      >
                        <div className="node-pip" />
                        <div className="node-label">
                          {isLast ? (
                            <span className="bonus-reward">{bonusMode ? '+5 🎰' : '🎰 GO!'}</span>
                          ) : (
                            <span className="wild-reward">+{wildsPerBp[i]}⭐</span>
                          )}
                        </div>
                        <div className="node-value">{bp}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Footer with current value */}
              <div className="meter-footer">
                <div className="meter-current">{fruitMeter}</div>
                <div className="meter-divider">/</div>
                <div className="meter-max">{meterMax}</div>
              </div>
            </div>
          )
        })()}

        <div className={`grid ${spinning ? 'spinning' : ''} ${bonusMode ? 'bonus-grid' : ''}`}>
        {displayRows.map((row, rowIndex) => {
          const isLockedRow = bonusMode && rowIndex >= activeRows
          return (
            <div key={rowIndex} className={`row ${isLockedRow ? 'locked-row' : ''}`}>
              {row.map((symbol, colIndex) => {
                const cellKey = `${colIndex}-${rowIndex}`
                const isMatched = matches.has(cellKey)
                const matchedSymbol = matches.get(cellKey) // Get the symbol for color coding
                const isFalling = fallingCells.has(cellKey)
                const isMultiplierSymbol = symbol ? isMultiplier(symbol) : false
                const isWildSymbol = symbol ? isWild(symbol) : false
                const isMegaWildSymbol = symbol ? isMegaWild(symbol) : false
                const multiplierVal = isMultiplierSymbol ? getMultiplierValue(symbol!) : 0
                const isSettled = colIndex < settledCols
                const isSpinning = spinning && !isSettled && !isLockedRow
                const isLocked = isLockedRow

                // Get match color class based on symbol
                const getMatchColorClass = (sym: string | undefined): string => {
                  if (!sym) return 'match-default'
                  switch (sym) {
                    case '🍒': return 'match-cherry'
                    case '🍀': return 'match-clover'
                    case '🍇': return 'match-grape'
                    case '🔔': return 'match-bell'
                    case '💎': return 'match-diamond'
                    default: return 'match-default'
                  }
                }

                const isSpawnedWild = multiplierSpawnPositions.includes(cellKey)
                const isMegaWildClearing = megaWildBonusCells.has(cellKey)

                return (
                  <div
                    key={cellKey}
                    className={`cell
                      ${isMatched ? `matched ${getMatchColorClass(matchedSymbol)}` : ''}
                      ${isFalling ? 'falling' : ''}
                      ${isMultiplierSymbol ? `multiplier-symbol mult-${multiplierVal}` : ''}
                      ${isWildSymbol ? 'wild-symbol' : ''}
                      ${isMegaWildSymbol ? 'mega-wild-symbol' : ''}
                      ${isSpawnedWild ? 'wild-spawned' : ''}
                      ${isMegaWildClearing ? 'mega-wild-clearing' : ''}
                      ${isSpinning ? 'spinning-cell' : ''}
                      ${isSettled && spinning ? 'settled' : ''}
                      ${isLocked ? 'locked' : ''}
                    `}
                  >
                    {isLocked ? (
                      <span className="lock-icon">🔒</span>
                    ) : isMegaWildSymbol ? (
                      <span className="mega-wild-icon">{symbol}</span>
                    ) : isMultiplierSymbol ? (
                      <span className="multiplier-icon">{symbol}</span>
                    ) : isWildSymbol ? (
                      <span className="wild-icon">{symbol}</span>
                    ) : (
                      symbol
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      </div> {/* End game-area */}

      <div className="controls">
        {bonusMode ? (
          <button
            className="spin-btn bonus-spin-btn"
            onClick={bonusSpin}
            disabled={spinning || freeSpins <= 0}
          >
            {spinning ? 'Spinning...' : `FREE SPIN (${freeSpins} left)`}
          </button>
        ) : (
          <button
            className="spin-btn"
            onClick={spin}
            disabled={spinning || balance < BET_AMOUNT}
          >
            {spinning ? 'Spinning...' : `Spin (£${BET_AMOUNT})`}
          </button>
        )}
      </div>

      {/* Admin Panel - positioned off to the side */}
      <div className="admin-panel">
        <div className="admin-title" style={{ cursor: 'pointer' }} onClick={() => setShowAdminPanel(v => !v)}>
          Admin {showAdminPanel ? '▲' : '▼'}
        </div>
        {showAdminPanel && <>

        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={autoSpin}
            onChange={(e) => setAutoSpin(e.target.checked)}
          />
          Auto Spin
        </label>

        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={autoDeposit}
            onChange={(e) => setAutoDeposit(e.target.checked)}
          />
          Auto Deposit (£5 when empty)
        </label>

        <div className="admin-slider">
          <span>Min audio: £{minWinForAudio.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={minWinForAudio}
            onChange={(e) => setMinWinForAudio(parseFloat(e.target.value))}
          />
        </div>

        <div className="admin-divider" />

        <button
          className={`admin-btn ${musicPlaying ? 'active' : ''}`}
          onClick={() => {
            const playing = soundManager.toggleMusic()
            setMusicPlaying(playing)
          }}
        >
          {musicPlaying ? '🔊 Music ON' : '🔇 Music OFF'}
        </button>

        <div className="admin-slider">
          <span>Music: {musicVolume}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={musicVolume}
            onChange={(e) => setMusicVolume(parseInt(e.target.value))}
          />
        </div>

        <div className="admin-slider">
          <span>SFX: {sfxVolume}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={sfxVolume}
            onChange={(e) => setSfxVolume(parseInt(e.target.value))}
          />
        </div>

        <div className="admin-divider" />

        <button
          className="admin-btn"
          onClick={() => {
            setFruitMeter(0) // Reset meter when using test bonus
            setShowBonusModal(true)
            playBonusSound()
          }}
        >
          Test Bonus
        </button>

        <button
          className="admin-btn"
          onClick={() => onBalanceChange(100)}
        >
          +£100
        </button>

        <button
          className="admin-btn mega-wild-btn"
          onClick={() => {
            // Spawn a mega wild at a random position on the grid
            const newGrid = grid.map(col => [...col])
            const col = Math.floor(Math.random() * COLS)
            const row = Math.floor(Math.random() * (bonusMode ? activeRows : BASE_ROWS))
            newGrid[col][row] = '🔮'
            setGrid(newGrid)
            setMessage('🔮 MEGA WILD SPAWNED! Spin to see its power!')
          }}
          disabled={spinning}
        >
          Test 🔮
        </button>

        <div className="admin-divider" />

        <button
          className="admin-btn"
          onClick={() => setShowPayoutInfo(true)}
        >
          Payout Info
        </button>
        </>}
      </div>

      <div className="message-container">
        <div className={`message ${lastWin > 0 ? 'win' : ''}`}>
          {message || '\u00A0'}
        </div>
        {lastWin > 0 && !showBonusEnd && !showBigWin && (
          <div className="win-display">
            +£{lastWin.toFixed(2)}
          </div>
        )}
      </div>

      {showBonusModal && (
        <div className="bonus-modal-overlay">
          <div className="bonus-modal" onClick={e => e.stopPropagation()}>
            <h2>🎉 BONUS TRIGGERED! 🎉</h2>
            <p className="bonus-intro">Fruit Meter Full = 10 FREE SPINS!</p>
            <div className="bonus-features">
              <p>✨ Hit meter milestones to unlock extra rows!</p>
              <p>🎰 2x multiplier frequency!</p>
              <p>📈 Bigger board = BIGGER WINS!</p>
            </div>
            <button className="close-bonus-btn" onClick={startBonusMode}>
              START BONUS!
            </button>
          </div>
        </div>
      )}

      {showBonusEnd && (
        <div className="bonus-end-overlay">
          <div className={`bonus-end-modal ${countingDone ? 'celebration' : ''}`}>
            <h2>🎰 BONUS COMPLETE! 🎰</h2>
            <div className={`bonus-end-win ${countingDone ? 'done' : ''}`}>
              <span className="win-label">TOTAL WIN</span>
              <span className="win-amount">£{countingWin.toFixed(2)}</span>
            </div>
            {countingDone && (
              <div className="celebration-text">
                🎉 CONGRATULATIONS! 🎉
              </div>
            )}
          </div>
        </div>
      )}

      {/* Big Win Celebration Modal (normal play) */}
      {showBigWin && (
        <div className="big-win-overlay">
          <div className={`big-win-modal ${countingDone ? 'celebration' : ''}`}>
            <h2>💰 BIG WIN! 💰</h2>
            <div className={`big-win-amount ${countingDone ? 'done' : ''}`}>
              <span className="win-amount">£{countingWin.toFixed(2)}</span>
            </div>
            {countingDone && (
              <div className="celebration-sparkles">
                ✨ AMAZING! ✨
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payout Info Modal */}
      {showPayoutInfo && (
        <div className="payout-modal-overlay" onClick={() => setShowPayoutInfo(false)}>
          <div className="payout-modal" onClick={e => e.stopPropagation()}>
            <button className="payout-close-btn" onClick={() => setShowPayoutInfo(false)}>×</button>
            <h2>Payout Information</h2>

            <div className="payout-section">
              <h3>Symbol Payouts (Base, £{BET_AMOUNT} bet)</h3>
              <p className="payout-note">For minimum cluster of {MIN_CLUSTER_SIZE} symbols</p>
              <table className="payout-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Payout</th>
                    <th>Spawn Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>🍒 Cherry</td><td>£{SYMBOL_PAYOUTS['🍒'].toFixed(3)}</td><td>{SYMBOL_WEIGHTS['🍒']}%</td></tr>
                  <tr><td>🍀 Clover</td><td>£{SYMBOL_PAYOUTS['🍀'].toFixed(3)}</td><td>{SYMBOL_WEIGHTS['🍀']}%</td></tr>
                  <tr><td>🍇 Grape</td><td>£{SYMBOL_PAYOUTS['🍇'].toFixed(3)}</td><td>{SYMBOL_WEIGHTS['🍇']}%</td></tr>
                  <tr><td>🔔 Bell</td><td>£{SYMBOL_PAYOUTS['🔔'].toFixed(3)}</td><td>{SYMBOL_WEIGHTS['🔔']}%</td></tr>
                  <tr><td>💎 Diamond</td><td>£{SYMBOL_PAYOUTS['💎'].toFixed(3)}</td><td>{SYMBOL_WEIGHTS['💎']}%</td></tr>
                </tbody>
              </table>
            </div>

            <div className="payout-section">
              <h3>Cluster Size Multipliers</h3>
              <p className="payout-note">Larger clusters are rare and well rewarded!</p>
              <table className="payout-table">
                <thead>
                  <tr>
                    <th>Cluster Size</th>
                    <th>Multiplier</th>
                    <th>Example (🍇)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>7 symbols</td><td>1.0x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 1.0).toFixed(2)}</td></tr>
                  <tr><td>8-9 symbols</td><td>1.4x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 1.4).toFixed(2)}</td></tr>
                  <tr><td>10-11 symbols</td><td>2.0x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 2.0).toFixed(2)}</td></tr>
                  <tr><td>12-14 symbols</td><td>3.0x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 3.0).toFixed(2)}</td></tr>
                  <tr><td>15-19 symbols</td><td>5.0x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 5.0).toFixed(2)}</td></tr>
                  <tr><td>20-24 symbols</td><td>8.0x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 8.0).toFixed(2)}</td></tr>
                  <tr><td>25+ symbols</td><td>12.0x</td><td>£{(SYMBOL_PAYOUTS['🍇'] * 12.0).toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="payout-section">
              <h3>Multiplier Symbols</h3>
              <p className="payout-note">Normal play: {(NORMAL_MULTIPLIER_CHANCE * 100).toFixed(1)}% chance per cell | Bonus: {(BONUS_MULTIPLIER_CHANCE * 100).toFixed(1)}% chance per cell</p>
              <table className="payout-table">
                <thead>
                  <tr>
                    <th>Multiplier</th>
                    <th>Relative Weight</th>
                    <th>Approx %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>2x</td><td>{MULTIPLIER_WEIGHTS[2]}</td><td>~70%</td></tr>
                  <tr><td>3x</td><td>{MULTIPLIER_WEIGHTS[3]}</td><td>~17%</td></tr>
                  <tr><td>5x</td><td>{MULTIPLIER_WEIGHTS[5]}</td><td>~8%</td></tr>
                  <tr><td>10x</td><td>{MULTIPLIER_WEIGHTS[10]}</td><td>~3%</td></tr>
                  <tr><td>20x (Bonus only)</td><td>{MULTIPLIER_WEIGHTS[20]}</td><td>~1%</td></tr>
                </tbody>
              </table>
              <p className="payout-note">Multipliers stack additively: 2x + 3x = 5x total</p>
            </div>

            <div className="payout-section">
              <h3>Special Wildcards</h3>
              <table className="payout-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Effect</th>
                    <th>Spawn Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>⭐ Wild</td>
                    <td>Matches any symbol</td>
                    <td>Spawned from meter breakpoints</td>
                  </tr>
                  <tr className="mega-wild-row">
                    <td>🔮 Mega Wild</td>
                    <td><strong>Consumes ALL matching symbols on grid!</strong></td>
                    <td>0.1% normal / 0.5% bonus</td>
                  </tr>
                </tbody>
              </table>
              <p className="payout-note">Mega Wild creates massive clusters and chain reactions!</p>
            </div>

            <div className="payout-section">
              <h3>Fruit Meter - Normal Play</h3>
              <p className="payout-note">Meter max: {FRUIT_METER_MAX} | Resets each spin</p>
              <table className="payout-table">
                <thead>
                  <tr>
                    <th>Breakpoint</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {FRUIT_METER_BREAKPOINTS.map((bp, i) => (
                    <tr key={bp}>
                      <td>{bp} symbols</td>
                      <td>{i === FRUIT_METER_BREAKPOINTS.length - 1 ? 'BONUS TRIGGERED!' : `+${WILDS_PER_BREAKPOINT[i]} ⭐ Wilds`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="payout-section">
              <h3>Fruit Meter - Bonus Mode</h3>
              <p className="payout-note">Meter max: {BONUS_FRUIT_METER_MAX} | Resets each spin (same as normal)</p>
              <table className="payout-table">
                <thead>
                  <tr>
                    <th>Breakpoint</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {BONUS_FRUIT_METER_BREAKPOINTS.map((bp, i) => (
                    <tr key={bp}>
                      <td>{bp} symbols</td>
                      <td>{i === BONUS_FRUIT_METER_BREAKPOINTS.length - 1 ? '+5 Free Spins' : `+${BONUS_WILDS_PER_BREAKPOINT[i]} ⭐ Wilds`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="payout-section">
              <h3>Bonus Mode Details</h3>
              <table className="payout-table">
                <tbody>
                  <tr><td>Starting Free Spins</td><td>10</td></tr>
                  <tr><td>Grid Size</td><td>{COLS} × {BASE_ROWS}</td></tr>
                  <tr><td>Multiplier Frequency</td><td>{(BONUS_MULTIPLIER_CHANCE * 100).toFixed(1)}% per cell ({(BONUS_MULTIPLIER_CHANCE / NORMAL_MULTIPLIER_CHANCE).toFixed(1)}× normal rate)</td></tr>
                  <tr><td>20x Multiplier</td><td>Available (bonus only)</td></tr>
                </tbody>
              </table>
            </div>

            <div className="payout-section">
              <h3>Win Formula</h3>
              <div className="formula-box">
                <code>Win = Base Payout × Size Multiplier × Symbol Multiplier × Bet</code>
              </div>
              <p className="payout-note">No chain multipliers - cascades fill meter but don't multiply wins</p>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

export default SlotMachine
