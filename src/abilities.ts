import { ABILITY, COINS, SLOTS } from './config'
import { canBeHit, type Horse } from './horse'
import { dot, fromAngle, rand, type Vec } from './math'
import { blast, type PhysEvent } from './physics'
import { locate, sample, type Track } from './track'

export type AbilityId = 'grapple' | 'ball' | 'roomba' | 'banana' | 'fireball' | 'emp' | 'hay' | 'papaya'

export interface AbilityDef { id: AbilityId; name: string; icon: string; price: number; desc: string }

export const ABILITIES: AbilityDef[] = [
  { id: 'grapple', name: 'Grappling Hook', icon: '🪝', price: 140, desc: 'Hooks the nearest rival within range and reels them in. Only if they reach you do they get a mini explosion: a short stun and no catch-up boost.' },
  { id: 'ball', name: 'Spiked Soccer Ball', icon: '⚽', price: 90, desc: 'Bounces down the track faster than any horse. Rivals it hits get knocked backwards.' },
  { id: 'roomba', name: 'Dangerous Roomba', icon: '🔪', price: 180, desc: 'A roomba with a knife. Sweeps the track for 6s. Horses pass right through it, and any rival it touches explodes.' },
  { id: 'banana', name: 'Banana Peel of Doom', icon: '🍌', price: 60, desc: 'Drop it behind you. Whoever steps on it spins out of control: they can only pick their speed.' },
  { id: 'fireball', name: 'Fireball', icon: '🔥', price: 120, desc: 'A fireball that bounces around the track for 4.6s, burning through horses. Rivals it touches crawl at 35% speed for 3.5s.' },
  { id: 'emp', name: 'EMP', icon: '⚡', price: 130, desc: 'An electric pulse around you. Every rival inside the ring is stunned for 0.75s, then runs at 0.75x speed for 3s.' },
  { id: 'hay', name: 'Orbiting Hay', icon: '🌾', price: 110, desc: '3 sharp hay bundles orbit you for 8s. Each one that touches a rival slows it to 0.85x for 3s, and hits stack: all 3 is about 0.61x.' },
  { id: 'papaya', name: 'Papaya-Bomb', icon: '🥭', price: 200, desc: 'Tap the track to throw it. It lands 2s later and explodes in a big radius: rivals there get a short stun and no catch-up boost.' },
]
export const abilityDef = (id: AbilityId) => ABILITIES.find((a) => a.id === id)!

// ---- Save data (coins, unlocked abilities, equipped slots) -----------------------------------

export interface Save { coins: number; owned: Record<AbilityId, boolean>; equipped: (AbilityId | null)[] }
const KEY = 'derby.save'
const IDS: AbilityId[] = ['grapple', 'ball', 'roomba', 'banana', 'fireball', 'emp', 'hay', 'papaya']

export function loadSave(): Save {
  let s: Partial<Save> & { inv?: Partial<Record<AbilityId, number>> } = {}
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { s = {} }
  const owned = Object.fromEntries(IDS.map((id) => [id, !!(s.owned && s.owned[id]) || ((s.inv && s.inv[id]) || 0) > 0])) as Record<AbilityId, boolean>
  // v5 saves had charges: anything with charges left is now unlocked for good.
  const equipped = Array.from({ length: SLOTS }, (_, i) => {
    const e = s.equipped && s.equipped[i]
    return e && owned[e] ? e : null
  })
  return { coins: typeof s.coins === 'number' ? s.coins : COINS.start, owned, equipped }
}
export function storeSave(s: Save) { localStorage.setItem(KEY, JSON.stringify({ coins: s.coins, owned: s.owned, equipped: s.equipped })) }

/** Unlock an ability permanently. Auto-equips into an empty slot. False if owned or unaffordable. */
export function buy(s: Save, id: AbilityId): boolean {
  const def = abilityDef(id)
  if (s.owned[id] || s.coins < def.price) return false
  s.coins -= def.price
  s.owned[id] = true
  if (!s.equipped.includes(id)) { const free = s.equipped.indexOf(null); if (free >= 0) s.equipped[free] = id }
  storeSave(s)
  return true
}

/** Put an owned ability into a slot (slot 0 by default). An ability sits in one slot at most. */
export function equip(s: Save, id: AbilityId, slot = 0) {
  if (slot < 0 || slot >= SLOTS || !s.owned[id]) return
  s.equipped = s.equipped.map((e) => (e === id ? null : e))
  s.equipped[slot] = id
  storeSave(s)
}

export function raceReward(place: number, kills: number) {
  const base = COINS.place[Math.min(place, COINS.place.length) - 1]
  return { base, bonus: kills * COINS.perKill, total: base + kills * COINS.perKill }
}

// ---- In-race objects --------------------------------------------------------------------------

export type Item = { owner: number } & (
  | { kind: 'ball'; pos: Vec; vel: Vec; t: number; life: number; r: number; spin: number; hitCd: Map<number, number>; hits: number }
  | { kind: 'fireball'; pos: Vec; vel: Vec; t: number; life: number; r: number; hitCd: Map<number, number>; hits: number }
  | { kind: 'roomba'; pos: Vec; heading: number; s: number; idx: number; t: number; life: number; r: number; phase: number; hits: number; dir: number }
  | { kind: 'banana'; pos: Vec; t: number; life: number; r: number; heading: number }
  | { kind: 'hook'; target: number; t: number; life: number; done: boolean; /** 'hit' = reached you and exploded, 'broken' = pull interrupted. */ result: '' | 'hit' | 'broken' }
  | { kind: 'emp'; pos: Vec; t: number; life: number; r: number; hits: number }
  | { kind: 'hay'; t: number; life: number; phase: number; hit: Set<number>[]; hits: number; pts: Vec[] }
  | { kind: 'papaya'; from: Vec; to: Vec; pos: Vec; z: number; t: number; life: number; r: number; done: boolean; hits: number })

/** `player`: the player is involved (used it, got hit, or scored), so it's worth a toast + sound. */
export interface AbilityNotice { text: string; sound?: 'zap' | 'whoosh' | 'boing' | 'sizzle' | 'slip'; player: boolean }

/** Runs everyone's abilities during a race: the player's and the bots'. An item never hurts its owner. */
export class AbilitySystem {
  items: Item[] = []
  notices: AbilityNotice[] = []
  /** Uses per ability this race (tests / stats). */
  used: Record<string, number> = {}

  constructor(private tr: Track, private horses: Horse[], private player: Horse) {}

  private rivalsOf(o: number) { return this.horses.filter((h) => h.id !== o && !h.finished) }
  private say(text: string, player: boolean, sound?: AbilityNotice['sound']) { this.notices.push({ text, player, sound }) }

  /** True if the straight line a -> b stays on the track (doesn't cut across the infield / over a fence). */
  lineOnTrack(a: Horse, b: Horse): boolean {
    const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y)
    const n = Math.max(1, Math.ceil(d / 25))
    let idx = a.trackIdx
    for (let k = 1; k < n; k++) {
      const q = { x: a.pos.x + (b.pos.x - a.pos.x) * k / n, y: a.pos.y + (b.pos.y - a.pos.y) * k / n }
      const loc = locate(this.tr, q, idx)
      if (Math.abs(loc.lat) > this.tr.halfWidth + 4) return false
      idx = loc.i
    }
    return true
  }

  /** Nearest hookable rival within the hook's straight-line range with a clear line along the track, or null. */
  grappleTarget(o: Horse): Horse | null {
    const cands = this.rivalsOf(o.id)
      .filter((h) => canBeHit(h))
      .map((h) => ({ h, d: Math.hypot(h.pos.x - o.pos.x, h.pos.y - o.pos.y) }))
      .filter((c) => c.d <= ABILITY.grappleRange)
      .sort((x, y) => x.d - y.d)
    for (const c of cands) if (this.lineOnTrack(o, c.h)) return c.h
    return null
  }

  /** Snap a world point onto the racing surface and within throwing range of `o`. */
  clampThrow(o: Horse, to: Vec): Vec {
    let x = to.x, y = to.y
    const dx = x - o.pos.x, dy = y - o.pos.y, d = Math.hypot(dx, dy)
    if (d > ABILITY.papayaRange) { x = o.pos.x + dx / d * ABILITY.papayaRange; y = o.pos.y + dy / d * ABILITY.papayaRange }
    const loc = locate(this.tr, { x, y })
    const lim = this.tr.halfWidth - 12
    if (Math.abs(loc.lat) > lim) { const l = Math.sign(loc.lat) * lim; x = loc.p.x + loc.nrm.x * l; y = loc.p.y + loc.nrm.y * l }
    return { x, y }
  }

  /** Bots: where a rival ahead of `o` (or the player) will be when a papaya lands. Null if nobody is in range. */
  papayaTarget(o: Horse): Vec | null {
    let best: Vec | null = null, bd = Infinity
    for (const h of this.rivalsOf(o.id)) {
      if (!canBeHit(h) || !(h.isPlayer || h.progress > o.progress)) continue
      const guess = { x: h.pos.x + h.vel.x * ABILITY.papayaFlight, y: h.pos.y + h.vel.y * ABILITY.papayaFlight }
      const d = Math.hypot(guess.x - o.pos.x, guess.y - o.pos.y)
      if (d > ABILITY.papayaRange || d < ABILITY.papayaRadius * 0.9) continue // don't bomb yourself
      const tgt = this.clampThrow(o, guess)
      if (Math.hypot(tgt.x - o.pos.x, tgt.y - o.pos.y) < ABILITY.papayaRadius * 0.9) continue
      if (d < bd) { bd = d; best = tgt }
    }
    return best
  }

  /** Spawn ability `id` for horse `owner` (the player by default). False if it can't fire right now. */
  use(id: AbilityId, owner: Horse = this.player, quiet = false, aim: Vec | null = null): boolean {
    const p = owner
    const me = p.isPlayer
    if (p.state !== 'normal' || p.finished) return false
    const tr = this.tr
    const loc = locate(tr, p.pos, p.trackIdx)
    const tanA = Math.atan2(loc.tan.y, loc.tan.x)
    const fwdOnTrack = dot(fromAngle(p.heading), loc.tan) >= 0 ? 1 : -1
    const dirA = fwdOnTrack > 0 ? tanA : tanA + Math.PI
    switch (id) {
      case 'grapple': {
        const best = this.grappleTarget(p)
        if (!best) { if (me && !quiet) this.say('No rival in hook range!', true); return false }
        this.items.push({ owner: p.id, kind: 'hook', target: best.id, t: 0, life: ABILITY.grapplePullSeconds + 0.35, done: false, result: '' })
        this.say(me ? `🪝 Hooked ${best.name}!` : best.isPlayer ? `🪝 ${p.name} hooked you!` : '', me || best.isPlayer, 'zap')
        break
      }
      case 'ball': {
        const a = dirA + rand(-0.35, 0.35)
        const sp = p.topSpeed * ABILITY.ballSpeedMul
        const start = fromAngle(dirA, 40)
        this.items.push({ owner: p.id, kind: 'ball', pos: { x: p.pos.x + start.x, y: p.pos.y + start.y }, vel: fromAngle(a, sp), t: 0, life: ABILITY.ballSeconds, r: ABILITY.ballRadius, spin: 0, hitCd: new Map(), hits: 0 })
        this.say(me ? '⚽ Spiked ball away!' : '', me, 'boing')
        break
      }
      case 'fireball': {
        const a = dirA + rand(-0.6, 0.6)
        const sp = p.topSpeed * ABILITY.fireballSpeedMul
        const start = fromAngle(dirA, 40)
        this.items.push({ owner: p.id, kind: 'fireball', pos: { x: p.pos.x + start.x, y: p.pos.y + start.y }, vel: fromAngle(a, sp), t: 0, life: ABILITY.fireballSeconds, r: ABILITY.fireballRadius, hitCd: new Map(), hits: 0 })
        this.say(me ? '🔥 FIREBALL!' : '', me, 'sizzle')
        break
      }
      case 'roomba': {
        const s = loc.s + 50 * fwdOnTrack
        const at = sample(tr, s)
        this.items.push({ owner: p.id, kind: 'roomba', pos: { ...at.p }, heading: dirA, s, idx: at.i, t: 0, life: ABILITY.roombaSeconds, r: ABILITY.roombaRadius, phase: Math.asin(Math.max(-1, Math.min(1, loc.lat / (tr.halfWidth * 0.6)))) || 0, hits: 0, dir: fwdOnTrack })
        this.say(me ? '🔪 Dangerous roomba deployed!' : '', me, 'whoosh')
        break
      }
      case 'emp': {
        let n = 0, hitMe = false
        for (const h of this.rivalsOf(p.id)) {
          if (!canBeHit(h)) continue
          if (Math.hypot(h.pos.x - p.pos.x, h.pos.y - p.pos.y) > ABILITY.empRadius) continue
          h.state = 'stunned'; h.stunTimer = ABILITY.empStunSeconds; h.noBoost = true
          h.vel = { x: 0, y: 0 }; h.fwdSpeed = 0; h.reverseTimer = 0
          h.empSlowTimer = ABILITY.empSlowSeconds; h.zapTimer = ABILITY.empStunSeconds + 0.2
          n++; if (h.isPlayer) hitMe = true
        }
        this.items.push({ owner: p.id, kind: 'emp', pos: { ...p.pos }, t: 0, life: 0.6, r: ABILITY.empRadius, hits: n })
        this.say(me ? (n ? `⚡ EMP! Zapped ${n} rival${n > 1 ? 's' : ''}!` : '⚡ EMP! Nobody in range.') : hitMe ? `⚡ ${p.name}'s EMP zapped you!` : '', me || hitMe, 'zap')
        break
      }
      case 'hay': {
        const old = this.items.find((it) => it.kind === 'hay' && it.owner === p.id)
        if (old) old.t = old.life
        this.items.push({ owner: p.id, kind: 'hay', t: 0, life: ABILITY.haySeconds, phase: rand(0, Math.PI * 2), hit: Array.from({ length: ABILITY.hayBundles }, () => new Set<number>()), hits: 0, pts: [] })
        this.say(me ? '🌾 Sharp hay is orbiting you!' : '', me, 'whoosh')
        break
      }
      case 'papaya': {
        const to = aim ? this.clampThrow(p, aim) : this.papayaTarget(p)
        if (!to) return false
        this.items.push({ owner: p.id, kind: 'papaya', from: { ...p.pos }, to, pos: { ...p.pos }, z: 0, t: 0, life: ABILITY.papayaFlight + 0.05, r: ABILITY.papayaRadius, done: false, hits: 0 })
        this.say(me ? '🥭 Papaya-Bomb away!' : '', me, 'whoosh')
        break
      }
      case 'banana': {
        const back = fromAngle(p.heading, -48)
        const mine = this.items.filter((it) => it.kind === 'banana' && it.owner === p.id)
        if (mine.length >= ABILITY.bananaMaxPerOwner) mine[0].t = mine[0].life // oldest peel rots away
        this.items.push({ owner: p.id, kind: 'banana', pos: { x: p.pos.x + back.x, y: p.pos.y + back.y }, t: 0, life: ABILITY.bananaSeconds, r: ABILITY.bananaRadius, heading: rand(0, Math.PI * 2) })
        this.say(me ? '🍌 Banana peel dropped!' : '', me, 'whoosh')
        break
      }
    }
    this.used[id] = (this.used[id] || 0) + 1
    if (!me) p.label = { text: `${abilityDef(id).icon} ${abilityDef(id).name}!`, t: 1.8 }
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
    for (const it of this.items) {
      it.t += dt
      const p = this.horses[it.owner]
      switch (it.kind) {
        case 'hook': {
          const h = this.horses[it.target]
          if (it.done) break
          const dx = p.pos.x - h.pos.x, dy = p.pos.y - h.pos.y
          const d = Math.hypot(dx, dy) || 1
          // Reached you: now (and only now) it explodes.
          if (d < ABILITY.grappleContact && h.state === 'normal' && p.state === 'normal') {
            it.done = true; it.result = 'hit'; it.t = 0
            if (canBeHit(h)) {
              ev.push(...blast(h, p.pos, this.tr, true)); p.kills++
              this.say(p.isPlayer ? `💥 Mini explosion on ${h.name}!` : h.isPlayer ? `💥 ${p.name}'s hook blew you up!` : '', p.isPlayer || h.isPlayer)
            }
            break
          }
          // Pull broken: you got stunned/blown up, it got knocked out of the pull, slipped out of range, or timed out.
          if (p.state !== 'normal' || h.state !== 'normal' || d > ABILITY.grappleRange * ABILITY.grappleBreak || it.t > ABILITY.grapplePullSeconds) {
            it.done = true; it.result = 'broken'; it.t = 0
            if (h.state === 'normal') h.knockTimer = 0
            if (p.isPlayer || h.isPlayer) this.say(p.isPlayer ? `🪝 ${h.name} got away!` : h.isPlayer ? '🪝 You slipped the hook!' : '', true)
            break
          }
          // Reel the rival in toward you.
          h.vel = { x: (dx / d) * ABILITY.grapplePullSpeed, y: (dy / d) * ABILITY.grapplePullSpeed }
          h.fwdSpeed = 0
          h.knockTimer = Math.max(h.knockTimer, 0.05) // no control while reeled in
          break
        }
        case 'ball':
        case 'fireball': {
          it.pos.x += it.vel.x * dt; it.pos.y += it.vel.y * dt
          if (this.bounceInTrack(it.pos, it.vel, it.r) && it.kind === 'ball' && p.isPlayer) this.say('', true, 'boing')
          if (it.kind === 'ball') it.spin += dt * 14
          for (const [k, v] of it.hitCd) it.hitCd.set(k, v - dt)
          for (const h of this.rivalsOf(it.owner)) {
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
              this.say(p.isPlayer ? `⚽ ${h.name} got spiked backwards!` : h.isPlayer ? `⚽ ${p.name}'s spiked ball knocked you back!` : '', p.isPlayer || h.isPlayer, 'boing')
            } else {
              // Pierces straight through; burns and slows.
              h.slowTimer = ABILITY.fireballSlowSeconds
              h.vel.x *= 0.45; h.vel.y *= 0.45; h.fwdSpeed *= 0.45
              this.say(p.isPlayer ? `🔥 ${h.name} is scorched and slowed!` : h.isPlayer ? `🔥 ${p.name}'s fireball scorched you!` : '', p.isPlayer || h.isPlayer, 'sizzle')
            }
          }
          break
        }
        case 'roomba': {
          const dir = it.dir
          it.s += dir * ABILITY.roombaSpeed * dt
          const at = sample(this.tr, it.s)
          const lat = Math.sin(it.phase + it.t * 2.2) * this.tr.halfWidth * 0.6
          const nx = at.p.x + at.nrm.x * lat, ny = at.p.y + at.nrm.y * lat
          it.heading = Math.atan2(ny - it.pos.y, nx - it.pos.x)
          it.pos = { x: nx, y: ny }
          it.idx = at.i
          // No collisions: horses drive right through it, but rivals that touch it explode.
          for (const h of this.rivalsOf(it.owner)) {
            if (!canBeHit(h)) continue
            if (Math.hypot(h.pos.x - it.pos.x, h.pos.y - it.pos.y) > it.r + 17) continue
            ev.push(...blast(h, it.pos, this.tr))
            p.kills++
            it.hits++
            this.say(p.isPlayer ? `🔪 The roomba got ${h.name}!` : h.isPlayer ? `🔪 ${p.name}'s roomba got you!` : '', p.isPlayer || h.isPlayer)
          }
          break
        }
        case 'emp': break
        case 'hay': {
          const n = ABILITY.hayBundles
          it.pts = []
          for (let k = 0; k < n; k++) {
            const a = it.phase + it.t * ABILITY.haySpin + k * Math.PI * 2 / n
            const q = { x: p.pos.x + Math.cos(a) * ABILITY.hayOrbit, y: p.pos.y + Math.sin(a) * ABILITY.hayOrbit }
            it.pts.push(q)
            for (const h of this.rivalsOf(it.owner)) {
              if (h.state !== 'normal' || it.hit[k].has(h.id)) continue
              if (Math.hypot(h.pos.x - q.x, h.pos.y - q.y) > ABILITY.hayRadius + 17) continue
              it.hit[k].add(h.id) // this bundle never hits this horse again
              h.haySlow[k] = ABILITY.haySlowSeconds
              it.hits++
              const stack = h.haySlow.filter((t) => t > 0).length
              this.say(p.isPlayer ? `🌾 ${h.name} got haystabbed${stack > 1 ? ` x${stack}` : ''}!` : h.isPlayer ? `🌾 ${p.name}'s hay got you${stack > 1 ? ` x${stack}` : ''}!` : '', p.isPlayer || h.isPlayer, 'slip')
            }
          }
          break
        }
        case 'papaya': {
          const f = Math.min(1, it.t / ABILITY.papayaFlight)
          it.pos = { x: it.from.x + (it.to.x - it.from.x) * f, y: it.from.y + (it.to.y - it.from.y) * f }
          it.z = Math.sin(f * Math.PI) * 160
          if (f >= 1 && !it.done) {
            it.done = true
            ev.push({ type: 'explode', x: it.to.x, y: it.to.y, victim: -1, big: true })
            let hitMe = false
            for (const h of this.rivalsOf(it.owner)) {
              if (!canBeHit(h)) continue
              if (Math.hypot(h.pos.x - it.to.x, h.pos.y - it.to.y) > it.r) continue
              ev.push(...blast(h, it.to, this.tr, true, ABILITY.papayaFlySeconds, ABILITY.papayaStunSeconds))
              p.kills++; it.hits++
              if (h.isPlayer) hitMe = true
            }
            this.say(p.isPlayer ? (it.hits ? `🥭 SPLAT! Papaya got ${it.hits} rival${it.hits > 1 ? 's' : ''}!` : '🥭 Splat! Missed.') : hitMe ? `🥭 ${p.name}'s Papaya-Bomb blew you up!` : '', p.isPlayer || hitMe)
          }
          break
        }
        case 'banana': {
          for (const h of this.horses) {
            if (h.state !== 'normal' || h.spinOutTimer > 0) continue
            if (h.id === it.owner && it.t < ABILITY.bananaOwnerGrace) continue
            if (Math.hypot(h.pos.x - it.pos.x, h.pos.y - it.pos.y) > it.r + 14) continue
            h.spinOutTimer = ABILITY.bananaSpinSeconds
            h.spinTurn = (Math.random() < 0.5 ? -1 : 1) * 6
            it.life = 0
            const own = h.id === it.owner
            this.say(
              h.isPlayer ? (own ? '🍌 You slipped on your own peel!' : `🍌 You slipped on ${p.name}'s BANANA PEEL OF DOOM!`) : p.isPlayer ? `🍌 ${h.name} slipped on the BANANA PEEL OF DOOM!` : '',
              h.isPlayer || p.isPlayer, 'slip')
            break
          }
          break
        }
      }
    }
    this.items = this.items.filter((it) => (it.kind === 'hook' ? !(it.done && it.t > 0.6) : it.t < it.life))
    return ev
  }
}
