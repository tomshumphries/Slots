// SoundManager class for procedural audio generation

export class SoundManager {
  private audioContext: AudioContext | null = null
  private sfxMasterGain: GainNode | null = null
  private musicMasterGain: GainNode | null = null
  private bgMusic: HTMLAudioElement | null = null
  private musicVolume = 0.3
  private sfxVolume = 0.5
  private enabled = true

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    return this.audioContext
  }

  // All SFX oscillators route through this node — volume controlled in one place
  private getSfxDest(): GainNode {
    const ctx = this.getContext()
    if (!this.sfxMasterGain) {
      this.sfxMasterGain = ctx.createGain()
      this.sfxMasterGain.gain.value = this.sfxVolume
      this.sfxMasterGain.connect(ctx.destination)
    }
    return this.sfxMasterGain
  }

  // All music oscillators route through this node
  private getMusicDest(): GainNode {
    const ctx = this.getContext()
    if (!this.musicMasterGain) {
      this.musicMasterGain = ctx.createGain()
      this.musicMasterGain.gain.value = this.musicVolume
      this.musicMasterGain.connect(ctx.destination)
    }
    return this.musicMasterGain
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled && this.bgMusic) {
      this.bgMusic.pause()
    }
  }

  setMusicVolume(volume: number) {
    this.musicVolume = volume
    if (this.bgMusic) this.bgMusic.volume = volume
    if (this.musicMasterGain) this.musicMasterGain.gain.value = volume
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = volume
    if (this.sfxMasterGain) this.sfxMasterGain.gain.value = volume
  }

  // Play a file-based sound (win jingles, bonus proc) respecting sfx volume
  playFileSound(src: string) {
    if (!this.enabled || this.sfxVolume === 0) return
    const audio = new Audio(src)
    audio.volume = this.sfxVolume
    audio.play().catch(() => {})
  }

  // Column settle sound - quick tick
  playSettle(colIndex: number) {
    if (!this.enabled) return
    const ctx = this.getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.frequency.value = 200 + (colIndex * 15)
    osc.type = 'sine'

    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.05)

    osc.connect(gain)
    gain.connect(this.getSfxDest())
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.05)
  }

  // Bonus symbol lands - special sparkle sound
  playBonusLand() {
    if (!this.enabled) return
    const ctx = this.getContext()

    const notes = [400, 500, 600, 800]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.value = freq
      osc.type = 'sine'

      const startTime = ctx.currentTime + (i * 0.05)
      gain.gain.setValueAtTime(0.15, startTime)
      gain.gain.linearRampToValueAtTime(0.001, startTime + 0.15)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(startTime)
      osc.stop(startTime + 0.15)
    })
  }

  // Near bonus tension - sustained tone
  playNearBonus() {
    if (!this.enabled) return
    const ctx = this.getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.frequency.value = 150
    osc.type = 'sawtooth'

    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.3)
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.5)

    osc.connect(gain)
    gain.connect(this.getSfxDest())
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  }

  // Spinning/shuffle sound - gentle whoosh
  private spinInterval: ReturnType<typeof setInterval> | null = null

  startSpin() {
    if (!this.enabled) return
    this.stopSpin()

    this.spinInterval = setInterval(() => {
      if (!this.enabled) return
      const ctx = this.getContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.value = 100 + Math.random() * 50
      osc.type = 'sine'

      gain.gain.setValueAtTime(0.03, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.03)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.03)
    }, 50)
  }

  stopSpin() {
    if (this.spinInterval) {
      clearInterval(this.spinInterval)
      this.spinInterval = null
    }
  }

  // Match sound - gets more exciting with each chain
  private chainCount = 0

  resetChain() {
    this.chainCount = 0
  }

  playMatch() {
    if (!this.enabled) return
    this.chainCount++

    const ctx = this.getContext()
    const baseFreqs = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]
    const chainIndex = Math.min(this.chainCount - 1, baseFreqs.length - 1)
    const numNotes = Math.min(2 + this.chainCount, 5)

    for (let i = 0; i < numNotes; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      const freqIndex = Math.min(chainIndex + i, baseFreqs.length - 1)
      osc.frequency.value = baseFreqs[freqIndex] * (1 + i * 0.01)
      osc.type = 'sine'

      const startTime = ctx.currentTime + (i * 0.03)
      const volume = 0.15 - i * 0.02

      gain.gain.setValueAtTime(volume, startTime)
      gain.gain.linearRampToValueAtTime(0.001, startTime + 0.25)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(startTime)
      osc.stop(startTime + 0.25)
    }

    if (this.chainCount >= 2) {
      for (let i = 0; i < this.chainCount; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.frequency.value = 2000 + Math.random() * 2000
        osc.type = 'sine'

        const startTime = ctx.currentTime + (i * 0.05) + 0.1
        gain.gain.setValueAtTime(0.05, startTime)
        gain.gain.linearRampToValueAtTime(0.001, startTime + 0.1)

        osc.connect(gain)
        gain.connect(this.getSfxDest())
        osc.start(startTime)
        osc.stop(startTime + 0.1)
      }
    }
  }

  // Multiplier win sound - electric zap with power chord
  playMultiplierWin(multiplierValue: number = 2) {
    if (!this.enabled) return
    const ctx = this.getContext()
    const now = ctx.currentTime

    const intensity = Math.min(multiplierValue / 5, 4)
    const baseFreq = 200 + (intensity * 50)

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.setValueAtTime(baseFreq * (i + 1), now)
      osc.frequency.exponentialRampToValueAtTime(baseFreq * (i + 1) * 2, now + 0.1)
      osc.type = 'sawtooth'

      const vol = (0.12 - i * 0.03) * (0.5 + intensity * 0.25)
      gain.gain.setValueAtTime(vol, now)
      gain.gain.linearRampToValueAtTime(vol * 0.5, now + 0.05)
      gain.gain.linearRampToValueAtTime(0.001, now + 0.3)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(now)
      osc.stop(now + 0.3)
    }

    if (multiplierValue >= 5) {
      for (let i = 0; i < multiplierValue / 2; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.frequency.value = 1500 + Math.random() * 2500
        osc.type = 'sine'

        const startTime = now + (i * 0.04)
        gain.gain.setValueAtTime(0.06, startTime)
        gain.gain.linearRampToValueAtTime(0.001, startTime + 0.15)

        osc.connect(gain)
        gain.connect(this.getSfxDest())
        osc.start(startTime)
        osc.stop(startTime + 0.15)
      }
    }
  }

  // Wild symbol win sound - magical shimmer
  playWildWin() {
    if (!this.enabled) return
    const ctx = this.getContext()
    const now = ctx.currentTime

    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.value = freq
      osc.type = 'sine'

      const startTime = now + (i * 0.06)
      gain.gain.setValueAtTime(0.1, startTime)
      gain.gain.linearRampToValueAtTime(0.001, startTime + 0.25)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(startTime)
      osc.stop(startTime + 0.25)
    })

    const padOsc = ctx.createOscillator()
    const padGain = ctx.createGain()
    padOsc.frequency.value = 261.63
    padOsc.type = 'triangle'
    padGain.gain.setValueAtTime(0.05, now)
    padGain.gain.linearRampToValueAtTime(0.001, now + 0.5)
    padOsc.connect(padGain)
    padGain.connect(this.getSfxDest())
    padOsc.start(now)
    padOsc.stop(now + 0.5)
  }

  // Mega Wild win sound - epic explosion with dramatic buildup
  playMegaWildWin() {
    if (!this.enabled) return
    const ctx = this.getContext()
    const now = ctx.currentTime

    const sweepOsc = ctx.createOscillator()
    const sweepGain = ctx.createGain()
    sweepOsc.frequency.setValueAtTime(100, now)
    sweepOsc.frequency.exponentialRampToValueAtTime(2000, now + 0.4)
    sweepOsc.type = 'sawtooth'
    sweepGain.gain.setValueAtTime(0.15, now)
    sweepGain.gain.linearRampToValueAtTime(0.2, now + 0.3)
    sweepGain.gain.linearRampToValueAtTime(0.001, now + 0.5)
    sweepOsc.connect(sweepGain)
    sweepGain.connect(this.getSfxDest())
    sweepOsc.start(now)
    sweepOsc.stop(now + 0.5)

    setTimeout(() => {
      const boomOsc = ctx.createOscillator()
      const boomGain = ctx.createGain()
      boomOsc.frequency.setValueAtTime(80, ctx.currentTime)
      boomOsc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3)
      boomOsc.type = 'sine'
      boomGain.gain.setValueAtTime(0.25, ctx.currentTime)
      boomGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      boomOsc.connect(boomGain)
      boomGain.connect(this.getSfxDest())
      boomOsc.start(ctx.currentTime)
      boomOsc.stop(ctx.currentTime + 0.4)

      const bufferSize = ctx.sampleRate * 0.2
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1))
      }
      const noise = ctx.createBufferSource()
      const noiseGain = ctx.createGain()
      noise.buffer = buffer
      noiseGain.gain.setValueAtTime(0.15, ctx.currentTime)
      noiseGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      noise.connect(noiseGain)
      noiseGain.connect(this.getSfxDest())
      noise.start(ctx.currentTime)
    }, 350)

    setTimeout(() => {
      for (let i = 0; i < 15; i++) {
        const sparkOsc = ctx.createOscillator()
        const sparkGain = ctx.createGain()

        sparkOsc.frequency.value = 1000 + Math.random() * 3000
        sparkOsc.type = 'sine'

        const startTime = ctx.currentTime + (i * 0.05)
        sparkGain.gain.setValueAtTime(0.08, startTime)
        sparkGain.gain.linearRampToValueAtTime(0.001, startTime + 0.2)

        sparkOsc.connect(sparkGain)
        sparkGain.connect(this.getSfxDest())
        sparkOsc.start(startTime)
        sparkOsc.stop(startTime + 0.2)
      }
    }, 450)
  }

  // Big win fanfare - used for large wins in normal play
  playBigWinFanfare() {
    if (!this.enabled) return
    const ctx = this.getContext()
    const now = ctx.currentTime

    const fanfareNotes = [
      { freq: 523.25, time: 0, duration: 0.15 },
      { freq: 659.25, time: 0.12, duration: 0.15 },
      { freq: 783.99, time: 0.24, duration: 0.15 },
      { freq: 1046.50, time: 0.36, duration: 0.4 },
    ]

    fanfareNotes.forEach(note => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.value = note.freq
      osc.type = 'sawtooth'

      const startTime = now + note.time
      gain.gain.setValueAtTime(0.12, startTime)
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.05)
      gain.gain.linearRampToValueAtTime(0.001, startTime + note.duration)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(startTime)
      osc.stop(startTime + note.duration)
    })

    const timpani = ctx.createOscillator()
    const timpaniGain = ctx.createGain()
    timpani.frequency.setValueAtTime(130.81, now)
    timpani.frequency.exponentialRampToValueAtTime(65.41, now + 0.3)
    timpani.type = 'sine'
    timpaniGain.gain.setValueAtTime(0.2, now)
    timpaniGain.gain.linearRampToValueAtTime(0.001, now + 0.4)
    timpani.connect(timpaniGain)
    timpaniGain.connect(this.getSfxDest())
    timpani.start(now)
    timpani.stop(now + 0.4)

    setTimeout(() => {
      for (let i = 0; i < 20; i++) {
        const shimmer = ctx.createOscillator()
        const shimmerGain = ctx.createGain()

        shimmer.frequency.value = 3000 + Math.random() * 5000
        shimmer.type = 'sine'

        const startTime = ctx.currentTime + (i * 0.03)
        shimmerGain.gain.setValueAtTime(0.04, startTime)
        shimmerGain.gain.linearRampToValueAtTime(0.001, startTime + 0.3)

        shimmer.connect(shimmerGain)
        shimmerGain.connect(this.getSfxDest())
        shimmer.start(startTime)
        shimmer.stop(startTime + 0.3)
      }
    }, 300)
  }

  // Cascade/fall sound
  playCascade() {
    if (!this.enabled) return
    const ctx = this.getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.15)
    osc.type = 'sine'

    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.15)

    osc.connect(gain)
    gain.connect(this.getSfxDest())
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  }

  // Countup tick sound for bonus end celebration
  private countupPitch = 0

  resetCountup() {
    this.countupPitch = 0
  }

  playCountup() {
    if (!this.enabled) return
    const ctx = this.getContext()

    this.countupPitch++
    const freq = Math.min(400 + (this.countupPitch * 8), 1200)

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.frequency.value = freq
    osc.type = 'sine'

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.08)

    osc.connect(gain)
    gain.connect(this.getSfxDest())
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.08)
  }

  // Big celebration fanfare when countup completes
  playCountupComplete() {
    if (!this.enabled) return
    const ctx = this.getContext()

    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.value = freq
      osc.type = 'sine'

      const startTime = ctx.currentTime + (i * 0.08)
      gain.gain.setValueAtTime(0.15, startTime)
      gain.gain.linearRampToValueAtTime(0.001, startTime + 0.4)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(startTime)
      osc.stop(startTime + 0.4)
    })

    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.frequency.value = 1500 + Math.random() * 2000
      osc.type = 'sine'

      const startTime = ctx.currentTime + 0.3 + (i * 0.06)
      gain.gain.setValueAtTime(0.06, startTime)
      gain.gain.linearRampToValueAtTime(0.001, startTime + 0.15)

      osc.connect(gain)
      gain.connect(this.getSfxDest())
      osc.start(startTime)
      osc.stop(startTime + 0.15)
    }
  }

  // Procedural background music
  private musicInterval: ReturnType<typeof setInterval> | null = null
  private musicPlaying = false
  private beatIndex = 0
  private bonusModeActive = false

  private melodyNotes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]
  private bassNotes = [65.41, 73.42, 82.41, 98.00, 110.00]
  private bonusMelodyNotes = [329.63, 392.00, 493.88, 587.33, 659.25, 783.99, 880.00, 987.77]
  private bonusBassNotes = [82.41, 98.00, 110.00, 123.47, 146.83]
  private melodyPattern = [0, 2, 4, 5, 4, 2, 3, 1, 0, 2, 4, 6, 5, 4, 2, 0]
  private bassPattern = [0, 0, 2, 2, 3, 3, 4, 4, 0, 0, 1, 1, 2, 2, 0, 0]
  private bonusMelodyPattern = [0, 2, 4, 6, 7, 6, 4, 2, 1, 3, 5, 7, 6, 4, 2, 0, 2, 4, 5, 4, 2, 1, 3, 5, 6, 5, 3, 1, 0, 2, 4, 6]
  private bonusBassPattern = [0, 0, 0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 0, 0]

  setBonusMode(active: boolean) {
    this.bonusModeActive = active
    if (this.musicPlaying) {
      this.stopMusic()
      this.startMusic()
    }
  }

  startMusic() {
    if (this.musicPlaying) return
    this.musicPlaying = true
    this.beatIndex = 0

    const bpm = this.bonusModeActive ? 120 : 85
    const beatTime = 60000 / bpm / 2

    this.musicInterval = setInterval(() => {
      if (!this.enabled || !this.musicPlaying) return

      const ctx = this.getContext()
      const now = ctx.currentTime
      const dest = this.getMusicDest()

      const melodyNotes = this.bonusModeActive ? this.bonusMelodyNotes : this.melodyNotes
      const bassNotes = this.bonusModeActive ? this.bonusBassNotes : this.bassNotes
      const melodyPat = this.bonusModeActive ? this.bonusMelodyPattern : this.melodyPattern
      const bassPat = this.bonusModeActive ? this.bonusBassPattern : this.bassPattern

      const melodyIdx = melodyPat[this.beatIndex % melodyPat.length]
      const melodyFreq = melodyNotes[melodyIdx % melodyNotes.length]

      const melodyOsc = ctx.createOscillator()
      const melodyGain = ctx.createGain()
      melodyOsc.frequency.value = melodyFreq
      melodyOsc.type = this.bonusModeActive ? 'sawtooth' : 'sine'

      const melodyVol = this.bonusModeActive ? 0.1 : 0.08
      melodyGain.gain.setValueAtTime(melodyVol, now)
      melodyGain.gain.linearRampToValueAtTime(melodyVol * 0.7, now + 0.1)
      melodyGain.gain.linearRampToValueAtTime(0.001, now + (this.bonusModeActive ? 0.15 : 0.25))

      melodyOsc.connect(melodyGain)
      melodyGain.connect(dest)
      melodyOsc.start(now)
      melodyOsc.stop(now + (this.bonusModeActive ? 0.15 : 0.25))

      const bassInterval = this.bonusModeActive ? 2 : 4
      if (this.beatIndex % bassInterval === 0) {
        const bassIdx = bassPat[Math.floor(this.beatIndex / bassInterval) % bassPat.length]
        const bassFreq = bassNotes[bassIdx % bassNotes.length]

        const bassOsc = ctx.createOscillator()
        const bassGain = ctx.createGain()
        bassOsc.frequency.value = bassFreq
        bassOsc.type = this.bonusModeActive ? 'sawtooth' : 'triangle'

        const bassVol = this.bonusModeActive ? 0.15 : 0.12
        bassGain.gain.setValueAtTime(bassVol, now)
        bassGain.gain.linearRampToValueAtTime(0.001, now + (this.bonusModeActive ? 0.2 : 0.4))

        bassOsc.connect(bassGain)
        bassGain.connect(dest)
        bassOsc.start(now)
        bassOsc.stop(now + (this.bonusModeActive ? 0.2 : 0.4))
      }

      if (this.bonusModeActive) {
        if (this.beatIndex % 4 === 0) {
          const kickOsc = ctx.createOscillator()
          const kickGain = ctx.createGain()
          kickOsc.frequency.setValueAtTime(150, now)
          kickOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1)
          kickOsc.type = 'sine'
          kickGain.gain.setValueAtTime(0.2, now)
          kickGain.gain.linearRampToValueAtTime(0.001, now + 0.15)
          kickOsc.connect(kickGain)
          kickGain.connect(dest)
          kickOsc.start(now)
          kickOsc.stop(now + 0.15)
        }

        if (this.beatIndex % 2 === 0) {
          const hihatOsc = ctx.createOscillator()
          const hihatGain = ctx.createGain()
          hihatOsc.frequency.value = 8000 + Math.random() * 2000
          hihatOsc.type = 'square'
          hihatGain.gain.setValueAtTime(0.03, now)
          hihatGain.gain.linearRampToValueAtTime(0.001, now + 0.05)
          hihatOsc.connect(hihatGain)
          hihatGain.connect(dest)
          hihatOsc.start(now)
          hihatOsc.stop(now + 0.05)
        }

        if (this.beatIndex % 4 === 2) {
          const bufferSize = ctx.sampleRate * 0.1
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
          const data = buffer.getChannelData(0)
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3))
          }
          const noise = ctx.createBufferSource()
          const noiseGain = ctx.createGain()
          noise.buffer = buffer
          noiseGain.gain.setValueAtTime(0.1, now)
          noiseGain.gain.linearRampToValueAtTime(0.001, now + 0.1)
          noise.connect(noiseGain)
          noiseGain.connect(dest)
          noise.start(now)
        }
      } else {
        if (this.beatIndex % 8 === 0) {
          const padNotes = [
            melodyNotes[0] * 0.5,
            melodyNotes[2] * 0.5,
            melodyNotes[4] * 0.5,
          ]

          padNotes.forEach((freq) => {
            const padOsc = ctx.createOscillator()
            const padGain = ctx.createGain()
            padOsc.frequency.value = freq
            padOsc.type = 'sine'

            padGain.gain.setValueAtTime(0, now)
            padGain.gain.linearRampToValueAtTime(0.03, now + 0.2)
            padGain.gain.linearRampToValueAtTime(0.024, now + 0.8)
            padGain.gain.linearRampToValueAtTime(0.001, now + 1.2)

            padOsc.connect(padGain)
            padGain.connect(dest)
            padOsc.start(now)
            padOsc.stop(now + 1.2)
          })
        }
      }

      this.beatIndex++
    }, beatTime)
  }

  stopMusic() {
    this.musicPlaying = false
    if (this.musicInterval) {
      clearInterval(this.musicInterval)
      this.musicInterval = null
    }
  }

  toggleMusic(): boolean {
    if (this.musicPlaying) {
      this.stopMusic()
      return false
    } else {
      this.startMusic()
      return true
    }
  }

  isMusicPlaying(): boolean {
    return this.musicPlaying
  }
}

// Singleton instance
export const soundManager = new SoundManager()
