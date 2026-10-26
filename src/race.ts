import { setupBot, thinkBot } from './ai'
import type { Audio } from './audio'
import { HORSE, HORSE_COLORS, HORSE_NAMES, RACE } from './config'
import type { Effects } from './effects'
import { makeHorse, rollTopSpeed, updateTopSpeed, type Horse } from './horse'
import type { Input } from './input'
import { clamp, dist, dot, fromAngle, rand, randInt } from './math'
import { collide, stepHorse, type PhysEvent } from './physics'
import { generateTrack, locate, sample, type Track } from './track'

export type Phase = 'countdown' | 'racing' | 'done'

/** One race: track, horses, rules, and the per-frame simulation. */
export class Race {
  track: Track
  horses: Horse[]
  player: Horse
  phase: Phase = 'countdown'
  countdown = RACE.countdownSeconds
  time = 0
  laps = RACE.laps
  finishCount = 0
  /** First horse over the line on the final lap. The race ends the moment this is set. */
  winner: Horse | null = null
  playerFinishedAt = -1
  lastInput: 'keys' | 'drag' = 'keys'
  private lastDragId = 0
  /** Messages for the HUD toast (text, seconds). */
  toasts: { text: string; t: number }[] = []
  onEvent: (e: PhysEvent) => void = () => {}

  constructor(public fx: Effects, public audio: Audio, laps = RACE.laps, rivals = -1) {
    this.laps = laps
    this.track = generateTrack()
    const bots = rivals >= RACE.minBots && rivals <= RACE.maxBots ? rivals : randInt(RACE.minBots, RACE.maxBots)
    // Random, unique bot names each race; the player is always 'You'.
    const pool = [...HORSE_NAMES]
    for (let i = pool.length - 1; i > 0; i--) { const j = randInt(0, i); [pool[i], pool[j]] = [pool[j], pool[i]] }
    this.horses = HORSE_COLORS.slice(0, bots + 1).map((c, i) => makeHorse(i, i === 0 ? 'You' : pool[i - 1], c, i === 0))
    this.player = this.horses[0]
    this.horses.forEach((h, i) => {
      if (i > 0) setupBot(h, i - 1)
      rollTopSpeed(h)
      h.topSpeed = h.topTarget
      h.topTimer = rand(0, HORSE.topSpeedMaxInterval) // stagger: nobody changes at the same moment
    })
    this.placeOnGrid()
  }

  private placeOnGrid() {
    const tr = this.track
    const L = tr.length
    // Two-wide grid. The player starts on the back row, so there is someone to catch.
    const n = this.horses.length
    const rows = Math.ceil(n / 2)
    this.horses.forEach((h, k) => {
      const slot = k === 0 ? n - 1 : k - 1
      const row = Math.min(rows - 1, Math.floor(slot / 2))
      const side = slot % 2 === 0 ? -1 : 1
      const s = L - 70 - row * 62
      const at = sample(tr, s)
      const lat = side * tr.halfWidth * 0.4
      h.pos = { x: at.p.x + at.nrm.x * lat, y: at.p.y + at.nrm.y * lat }
      h.heading = Math.atan2(at.tan.y, at.tan.x)
      h.vel = { x: 0, y: 0 }
      h.trackIdx = at.i
      const loc = locate(tr, h.pos, h.trackIdx)
      h.lastS = loc.s
      h.progress = loc.s - L
    })
  }

  get L() { return this.track.length }

  /** Standings: finished horses by finish order, then by distance covered. */
  standings(): Horse[] {
    return [...this.horses].sort((a, b) => {
      if (a.finished && b.finished) return a.finishPlace - b.finishPlace
      if (a.finished) return -1
      if (b.finished) return 1
      return b.progress - a.progress
    })
  }

  placeOf(h: Horse) { return this.standings().indexOf(h) + 1 }

  toast(text: string, t = 1.6) { this.toasts.push({ text, t }) }

  private playerControl(input: Input, dt: number) {
    const p = this.player
    const c = p.ctrl
    if (input.dragStarts !== this.lastDragId) { this.lastDragId = input.dragStarts; p.reverseTimer = 0 }
    if (input.takeReverseTaps() > 0 && p.state === 'normal') p.reverseTimer = HORSE.tapReverseSeconds
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    c.steer = steer
    c.aim = null
    if (p.reverseTimer > 0) {
      p.reverseTimer -= dt
      c.mode = 'reverse'
      return
    }
    if (input.back) { c.mode = 'brake'; this.lastInput = 'keys'; return }
    if (input.forward) { c.mode = 'drive'; c.targetSpeed = p.topSpeed; this.lastInput = 'keys'; return }
    const d = input.drag
    if (d.active) {
      this.lastInput = 'drag'
      if (d.power > 0) { c.mode = 'drive'; c.aim = d.angle; c.targetSpeed = d.power * p.topSpeed }
      else c.mode = 'stop'
      return
    }
    c.mode = this.lastInput === 'drag' ? 'stop' : 'coast'
  }

  update(dt: number, input: Input) {
    const frozen = this.phase === 'countdown'
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown)
      this.countdown -= dt
      const after = Math.ceil(this.countdown)
      if (after !== before && after > 0) this.audio.countdown(false)
      if (this.countdown <= 0) { this.phase = 'racing'; this.audio.countdown(true); input.takeReverseTaps() }
      this.player.ctrl.mode = 'coast'
    } else {
      this.time += dt
      if (!this.player.finished) this.playerControl(input, dt)
      else { this.player.ctrl.mode = 'stop'; this.player.ctrl.aim = null; this.player.ctrl.steer = 0 }
    }

    for (const h of this.horses) updateTopSpeed(h, dt)

    for (const h of this.horses) {
      if (h.isPlayer) continue
      if (frozen) { h.ctrl.mode = 'coast'; continue }
      thinkBot(h, this.horses, this.track, dt, this.player, this.time > RACE.startGrace, this.time > RACE.huntDelay)
    }

    const events: PhysEvent[] = []
    for (const h of this.horses) events.push(...stepHorse(h, this.track, dt, frozen))
    if (!frozen) events.push(...collide(this.horses, this.track, this.time > RACE.startGrace))
    for (const e of events) this.handle(e)

    // Dust from galloping hooves; sparks trail a boosting horse.
    for (const h of this.horses) {
      if (h.state === 'normal' && h.boostTimer > 0 && Math.random() < dt * 40) {
        const back = fromAngle(h.heading, -24)
        this.fx.boostTrail(h.pos.x + back.x, h.pos.y + back.y, h.colors.silk)
      }
      if (h.state === 'normal' && Math.abs(h.fwdSpeed) > 160 && Math.random() < dt * 14) {
        const back = fromAngle(h.heading, -20)
        this.fx.dust(h.pos.x + back.x, h.pos.y + back.y, 1)
      }
    }

    this.updateProgress(dt)

    const p = this.player
    this.audio.updateBackup(p.state === 'normal' && p.fwdSpeed < -6, dt)
    this.audio.updateHooves(p.state === 'normal' ? clamp(Math.abs(p.fwdSpeed) / HORSE.topSpeed, 0, 1) : 0, dt)

    if (p.finished && this.playerFinishedAt < 0) this.playerFinishedAt = this.time
    for (const t of this.toasts) t.t -= dt
    this.toasts = this.toasts.filter((t) => t.t > 0)
  }

  private updateProgress(dt: number) {
    const L = this.L
    const goal = this.laps * L
    for (const h of this.horses) {
      const loc = locate(this.track, h.pos, h.trackIdx)
      let ds = loc.s - h.lastS
      if (ds > L / 2) ds -= L
      else if (ds < -L / 2) ds += L
      h.lastS = loc.s
      h.progress += ds
      const prevLap = h.lap
      h.lap = clamp(Math.floor(h.progress / L) + 1, 1, this.laps)
      if (h.isPlayer && h.lap > prevLap && !h.finished && this.phase === 'racing') this.toast(h.lap === this.laps ? 'FINAL LAP!' : `LAP ${h.lap}`)
      if (!this.winner && this.phase === 'racing' && h.progress >= goal) {
        // Race over as soon as the first horse crosses: nobody else "finishes".
        this.winner = h
        h.finished = true
        h.finishTime = this.time
        h.finishPlace = ++this.finishCount
        this.toast(h.isPlayer ? 'YOU WIN!' : `${h.name} WINS!`, 3)
        this.audio.fanfare(h.isPlayer)
      }
      if (h.isPlayer) {
        const facingBack = dot(fromAngle(h.heading), loc.tan) < -0.3 && h.fwdSpeed > 60
        h.wrongWayTimer = facingBack ? h.wrongWayTimer + dt : Math.max(0, h.wrongWayTimer - dt * 2)
      }
    }
  }

  private handle(e: PhysEvent) {
    const p = this.player
    const near = (x: number, y: number) => clamp(1 - dist(p.pos, { x, y }) / 900, 0.15, 1)
    switch (e.type) {
      case 'launch': {
        this.audio.whoosh()
        const v = this.horses[e.victim], a = this.horses[e.attacker]
        if (e.kind === 'headon' && (a.isPlayer || v.isPlayer)) {
          if (v.isPlayer) this.toast(`HEAD-ON! You and ${a.name} both blew up!`)
          else if (a.state !== 'flying') this.toast(`HEAD-ON! You blew up ${v.name}!`)
        } else if (a.isPlayer) this.toast(e.kind === 'rear' ? `BOOM! Rear-ended ${v.name}!` : `BOOM! You blew up ${v.name}!`)
        else if (v.isPlayer) this.toast(e.kind === 'rear' ? `${a.name} rammed you from behind!` : `${a.name} blew you up!`)
        break
      }
      case 'explode': {
        const k = near(e.x, e.y)
        this.fx.explode(e.x, e.y, 1)
        this.fx.addShake(26 * k)
        this.fx.flash = Math.max(this.fx.flash, 0.7 * k)
        this.audio.explosion(k)
        break
      }
      case 'bump':
        if (e.a === p.id || e.b === p.id) this.audio.bump(e.strength)
        this.fx.dust(e.x, e.y, 3)
        break
      case 'bounce': {
        const k = near(e.x, e.y)
        this.audio.bump(0.4 + 0.6 * e.strength)
        this.fx.dust(e.x, e.y, 5)
        this.fx.addShake(5 * k * e.strength)
        break
      }
      case 'boost':
        if (e.horse === p.id) { this.toast('CATCH-UP BOOST!', 1.8); this.audio.whoosh() }
        break
      case 'scrape':
        if (e.horse === p.id) this.audio.scrape()
        break
    }
    this.onEvent(e)
  }
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
