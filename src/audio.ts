/** All sounds are synthesized with WebAudio, so there are no audio files to load. */
export class Audio {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  muted = false
  private noiseBuf: AudioBuffer | null = null
  private beepClock = 0
  /** True while the backup beeper is sounding (exposed for tests). */
  beeping = false
  beepCount = 0
  private hoofClock = 0

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.8
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate * 1.2
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02)
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime + when
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.03))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master)
    o.start(t); o.stop(t + dur + 0.02)
  }

  private noise(dur: number, vol: number, from: number, to: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(from, t)
    f.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.master)
    src.start(t); src.stop(t + dur)
  }

  countdown(go: boolean) { go ? this.tone(1046, 0.45, 'square', 0.12) : this.tone(523, 0.18, 'square', 0.1) }

  explosion(near = 1) {
    this.noise(1.1, 0.55 * near, 4000, 120)
    this.tone(120, 0.5, 'sine', 0.5 * near, 0, 38)
  }

  whoosh() { this.noise(0.35, 0.18, 2500, 600) }
  bump(s: number) { this.tone(160, 0.12, 'triangle', 0.12 + 0.2 * s, 0, 70) }
  scrape() { this.noise(0.12, 0.06, 1800, 500) }

  fanfare(won: boolean) {
    const notes = won ? [523, 659, 784, 1046] : [392, 440, 494]
    notes.forEach((f, i) => this.tone(f, 0.22, 'square', 0.09, i * 0.15))
  }

  /**
   * Call every frame. While reversing, plays a truck-style
   * "beep ... beep ..." (on 0.45 s, off 0.45 s).
   */
  updateBackup(reversing: boolean, dt: number) {
    if (!reversing) { this.beepClock = 0; this.beeping = false; return }
    const period = 0.9
    const before = this.beepClock
    this.beepClock += dt
    if (before === 0 || Math.floor(before / period) !== Math.floor(this.beepClock / period)) {
      this.tone(1040, 0.42, 'square', 0.07)
      this.beepCount++
    }
    this.beeping = (this.beepClock % period) < 0.45
  }

  /** Soft hoof clicks that speed up with the player's pace. */
  updateHooves(speedFrac: number, dt: number) {
    if (speedFrac < 0.05) { this.hoofClock = 0; return }
    this.hoofClock += dt * (2 + speedFrac * 9)
    if (this.hoofClock >= 1) {
      this.hoofClock -= 1
      this.tone(220 + Math.random() * 60, 0.04, 'triangle', 0.035)
    }
  }
}
