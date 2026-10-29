import { ABILITY, COINS, SLOTS } from './config'
import { canBeHit, type Horse } from './horse'
import { dot, fromAngle, rand, type Vec } from './math'
import { blast, type PhysEvent } from './physics'
import { locate, sample, type Track } from './track'

export type AbilityId = 'grapple' | 'ball' | 'roomba' | 'banana' | 'fireball'

export interface AbilityDef { id: AbilityId; name: string; icon: string; price: number; desc: string }

export const ABILITIES: AbilityDef[] = [
  { id: 'grapple', name: 'Grappling Hook', icon: '🪝', price: 70, desc: 'Hooks the nearest rival, yanks them to you and gives them a mini explosion: a short stun and no catch-up boost.' },
  { id: 'ball', name: 'Spiked Soccer Ball', icon: '⚽', price: 45, desc: 'Bounces down the track faster than any horse. Rivals it hits get knocked backwards.' },
  { id: 'roomba', name: 'Dangerous Roomba', icon: '🔪', price: 90, desc: 'A roomba with a knife. Sweeps the track for 6s. Horses pass right through it, and any rival it touches explodes.' },
  { id: 'banana', name: 'Banana Peel of Doom', icon: '🍌', price: 30, desc: 'Drop it behind you. Whoever steps on it spins out of control: they can only pick their speed.' },
  { id: 'fireball', name: 'Fireball', icon: '🔥', price: 60, desc: 'A fireball that bounces around the track for 4.6s, burning through horses and slowing rivals down.' },
]
export const abilityDef = (id: AbilityId) => ABILITIES.find((a) => a.id === id)!

// ---- Save data (coins, inventory, equipped slots) -------------------------------------------

export interface Save { coins: number; inv: Record<AbilityId, number>; equipped: (AbilityId | null)[] }
const KEY = 'derby.save'

export function loadSave(): Save {
  let s: Partial<Save> = {}
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { s = {} }
  const inv = { grapple: 0, ball: 0, roomba: 0, banana: 0, fireball: 0, ...(s.inv || {}) }
  const equipped = Array.from({ length: SLOTS }, (_, i) => (s.equipped && s.equipped[i]) || null)
  return { coins: typeof s.coins === 'number' ? s.coins : COINS.start, inv, equipped }
}
export function storeSave(s: Save) { localStorage.setItem(KEY, JSON.stringify(s)) }

/** Buy one charge. Auto-equips into an empty slot. Returns false if you can't afford it. */
export function buy(s: Save, id: AbilityId): boolean {
  const def = abilityDef(id)
  if (s.coins < def.price) return false
  s.coins -= def.price
  s.inv[id]++
  if (!s.equipped.includes(id)) { const free = s.equipped.indexOf(null); if (free >= 0) s.equipped[free] = id }
  storeSave(s)
  return true
}

/** Put an owned ability into a slot (slot 0 by default). An ability sits in one slot at most. */
export function equip(s: Save, id: AbilityId, slot = 0) {
  if (slot < 0 || slot >= SLOTS) return
  s.equipped = s.equipped.map((e) => (e === id ? null : e))
  s.equipped[slot] = id
  storeSave(s)
}

export function raceReward(place: number, kills: number) {
  const base = COINS.place[Math.min(place, COINS.place.length) - 1]
  return { base, bonus: kills * COINS.perKill, total: base + kills * COINS.perKill }
}

// ---- In-race objects --------------------------------------------------------------------------

export type Item =
  | { kind: 'ball'; pos: Vec; vel: Vec; t: number; life: number; r: number; spin: number; hitCd: Map<number, number>; hits: number }
  | { kind: 'fireball'; pos: Vec; vel: Vec; t: number; life: number; r: number; hitCd: Map<number, number>; hits: number }
  | { kind: 'roomba'; pos: Vec; heading: number; s: number; idx: number; t: number; life: number; r: number; phase: number; hits: number; dir: number }
  | { kind: 'banana'; pos: Vec; t: number; life: number; r: number; heading: number }
  | { kind: 'hook'; target: number; t: number; life: number; done: boolean }

export interface AbilityNotice { text: string; sound?: 'zap' | 'whoosh' | 'boing' | 'sizzle' | 'slip' }

/** Runs the player's abilities during a race. Bots don't use abilities. */
export class AbilitySystem {
  items: Item[] = []
  notices: AbilityNotice[] = []
  /** Uses per ability this race (tests / stats). */
  used: Record<string, number> = {}

  constructor(private tr: Track, private horses: Horse[], private player: Horse) {}

  private rivals() { return this.horses.filter((h) => !h.isPlayer) }

  /** Spawn ability `id` for the player. Returns false if it can't be used right now (charge kept). */
  use(id: AbilityId): boolean {
    const p = this.player
    if (p.state !== 'normal') return false
    const tr = this.tr
    const loc = locate(tr, p.pos, p.trackIdx)
    const tanA = Math.atan2(loc.tan.y, loc.tan.x)
    const fwdOnTrack = dot(fromAngle(p.heading), loc.tan) >= 0 ? 1 : -1
    const dirA = fwdOnTrack > 0 ? tanA : tanA + Math.PI
    switch (id) {
      case 'grapple': {
        let best: Horse | null = null, bd = ABILITY.grappleRange
        for (const h of this.rivals()) {
          if (!canBeHit(h)) continue
          const d = Math.hypot(h.pos.x - p.pos.x, h.pos.y - p.pos.y)
          if (d < bd) { bd = d; best = h }
        }
        if (!best) { this.notices.push({ text: 'No rival in hook range!' }); return false }
        this.items.push({ kind: 'hook', target: best.id, t: 0, life: ABILITY.grapplePullSeconds + 0.35, done: false })
        this.notices.push({ text: `🪝 Hooked ${best.name}!`, sound: 'zap' })
        break
      }
      case 'ball': {
        const a = dirA + rand(-0.35, 0.35)
        const sp = p.topSpeed * ABILITY.ballSpeedMul
        const start = fromAngle(dirA, 40)
        this.items.push({ kind: 'ball', pos: { x: p.pos.x + start.x, y: p.pos.y + start.y }, vel: fromAngle(a, sp), t: 0, life: ABILITY.ballSeconds, r: ABILITY.ballRadius, spin: 0, hitCd: new Map(), hits: 0 })
        this.notices.push({ text: '⚽ Spiked ball away!', sound: 'boing' })
        break
      }
      case 'fireball': {
        const a = dirA + rand(-0.6, 0.6)
        const sp = p.topSpeed * ABILITY.fireballSpeedMul
        const start = fromAngle(dirA, 40)
        this.items.push({ kind: 'fireball', pos: { x: p.pos.x + start.x, y: p.pos.y + start.y }, vel: fromAngle(a, sp), t: 0, life: ABILITY.fireballSeconds, r: ABILITY.fireballRadius, hitCd: new Map(), hits: 0 })
        this.notices.push({ text: '🔥 FIREBALL!', sound: 'sizzle' })
        break
      }
      case 'roomba': {
        const s = loc.s + 50 * fwdOnTrack
        const at = sample(tr, s)
        this.items.push({ kind: 'roomba', pos: { ...at.p }, heading: dirA, s, idx: at.i, t: 0, life: ABILITY.roombaSeconds, r: ABILITY.roombaRadius, phase: Math.asin(Math.max(-1, Math.min(1, loc.lat / (tr.halfWidth * 0.6)))) || 0, hits: 0, dir: fwdOnTrack })
        this.notices.push({ text: '🔪 Dangerous roomba deployed!', sound: 'whoosh' })
        break
      }
      case 'banana': {
        const back = fromAngle(p.heading, -48)
        this.items.push({ kind: 'banana', pos: { x: p.pos.x + back.x, y: p.pos.y + back.y }, t: 0, life: ABILITY.bananaSeconds, r: ABILITY.bananaRadius, heading: rand(0, Math.PI * 2) })
        this.notices.push({ text: '🍌 Banana peel dropped!', sound: 'whoosh' })
        break
      }
    }
    this.used[id] = (this.used[id] || 0) + 1
    return true
  }

  /** Keep a moving item inside the fences: reflect off the rail like a pinball. */
  private bounceInTrack(pos: Vec, vel: Vec, r: number): boolean {
    const loc = locate(this.tr, pos)
    const lim = this.tr.halfWidth - r
    if (Math.abs(loc.lat) <= lim) return false
    const sg = Math.sign(loc.lat)
    const n = { x: loc.nrm.x * sg, y: loc.nrm.y * sg }
    const over = Math.abs(loc.lat) - lim
    pos.x -= n.x * over; pos.y -= n.y * over
    const vn = dot(vel, n)
    if (vn > 0) { vel.x -= 2 * vn * n.x; vel.y -= 2 * vn * n.y }
    return vn > 0
  }

  update(dt: number): PhysEvent[] {
    const ev: PhysEvent[] = []
    const p = this.player
    for (const it of this.items) {
      it.t += dt
      switch (it.kind) {
        case 'hook': {
          const h = this.horses[it.target]
          if (it.done || h.state !== 'normal') { it.done = true; break }
          // Reel the rival in toward you.
          const dx = p.pos.x - h.pos.x, dy = p.pos.y - h.pos.y
          const d = Math.hypot(dx, dy) || 1
          h.vel = { x: (dx / d) * ABILITY.grapplePullSpeed, y: (dy / d) * ABILITY.grapplePullSpeed }
          h.fwdSpeed = 0
          h.knockTimer = Math.max(h.knockTimer, 0.05) // no control while reeled in
          if (d < 70 || it.t > ABILITY.grapplePullSeconds) {
            it.done = true
            if (canBeHit(h)) { ev.push(...blast(h, p.pos, this.tr, true)); p.kills++; this.notices.push({ text: `💥 Mini explosion on ${h.name}!` }) }
          }
          break
        }
        case 'ball':
        case 'fireball': {
          it.pos.x += it.vel.x * dt; it.pos.y += it.vel.y * dt
          if (this.bounceInTrack(it.pos, it.vel, it.r) && it.kind === 'ball') this.notices.push({ text: '', sound: 'boing' })
          if (it.kind === 'ball') it.spin += dt * 14
          for (const [k, v] of it.hitCd) it.hitCd.set(k, v - dt)
          for (const h of this.rivals()) {
            if (h.state !== 'normal' || (it.hitCd.get(h.id) ?? 0) > 0) continue
            const dx = h.pos.x - it.pos.x, dy = h.pos.y - it.pos.y
            const d = Math.hypot(dx, dy)
            if (d > it.r + 17) continue
            it.hitCd.set(h.id, it.kind === 'ball' ? 0.6 : 1.2)
            it.hits++
            if (it.kind === 'ball') {
              // Knocked backwards, then the ball caroms off.
              const back = fromAngle(h.heading, -ABILITY.ballKnockSpeed)
              h.vel = { x: back.x, y: back.y }
              h.fwdSpeed = -ABILITY.ballKnockSpeed
              h.knockTimer = ABILITY.ballKnockSeconds
              const n = { x: dx / (d || 1), y: dy / (d || 1) }
              const vn = dot(it.vel, n)
              if (vn > 0) { it.vel.x -= 2 * vn * n.x; it.vel.y -= 2 * vn * n.y }
              ev.push({ type: 'bump', x: h.pos.x, y: h.pos.y, strength: 1, a: p.id, b: h.id })
              this.notices.push({ text: `⚽ ${h.name} got spiked backwards!`, sound: 'boing' })
            } else {
              // Pierces straight through; burns and slows.
              h.slowTimer = ABILITY.fireballSlowSeconds
              h.vel.x *= 0.6; h.vel.y *= 0.6; h.fwdSpeed *= 0.6
              this.notices.push({ text: `🔥 ${h.name} is scorched and slowed!`, sound: 'sizzle' })
            }
          }
          break
        }
        case 'roomba': {
          const dir = it.dir
          it.s += dir * p.topSpeed * ABILITY.roombaSpeedMul * dt
          const at = sample(this.tr, it.s)
          const lat = Math.sin(it.phase + it.t * 2.2) * this.tr.halfWidth * 0.6
          const nx = at.p.x + at.nrm.x * lat, ny = at.p.y + at.nrm.y * lat
          it.heading = Math.atan2(ny - it.pos.y, nx - it.pos.x)
          it.pos = { x: nx, y: ny }
          it.idx = at.i
          // No collisions: horses drive right through it, but rivals that touch it explode.
          for (const h of this.rivals()) {
            if (!canBeHit(h)) continue
            if (Math.hypot(h.pos.x - it.pos.x, h.pos.y - it.pos.y) > it.r + 17) continue
            ev.push(...blast(h, it.pos, this.tr))
            p.kills++
            it.hits++
            this.notices.push({ text: `🔪 The roomba got ${h.name}!` })
          }
          break
        }
        case 'banana': {
          for (const h of this.horses) {
            if (h.state !== 'normal' || h.spinOutTimer > 0) continue
            if (h.isPlayer && it.t < ABILITY.bananaOwnerGrace) continue
            if (Math.hypot(h.pos.x - it.pos.x, h.pos.y - it.pos.y) > it.r + 14) continue
            h.spinOutTimer = ABILITY.bananaSpinSeconds
            h.spinTurn = (Math.random() < 0.5 ? -1 : 1) * 6
            it.life = 0
            this.notices.push({ text: h.isPlayer ? '🍌 You slipped on your own peel!' : `🍌 ${h.name} slipped on the BANANA PEEL OF DOOM!`, sound: 'slip' })
            break
          }
          break
        }
      }
    }
    this.items = this.items.filter((it) => (it.kind === 'hook' ? !(it.done && it.t > it.life) : it.t < it.life))
    return ev
  }
}
