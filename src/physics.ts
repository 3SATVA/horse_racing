import { HORSE } from './config'
import { canBeHit, type Horse } from './horse'
import { approach, clamp, dot, fromAngle, wrapAngle } from './math'
import { locate, type Track } from './track'

export type PhysEvent =
  | { type: 'launch'; x: number; y: number; victim: number; attacker: number }
  | { type: 'explode'; x: number; y: number; victim: number }
  | { type: 'bump'; x: number; y: number; strength: number; a: number; b: number }
  | { type: 'scrape'; x: number; y: number; horse: number }

/** Can `h` launch something in direction `dir` (unit vector from h to the other horse)? */
export function isRamming(h: Horse, dir: { x: number; y: number }): boolean {
  if (h.state !== 'normal') return false
  if (h.fwdSpeed < HORSE.ramThreshold * HORSE.topSpeed) return false
  return dot(fromAngle(h.heading), dir) > 0.35
}

function applyControl(h: Horse, dt: number) {
  const c = h.ctrl
  let vF = h.fwdSpeed
  const top = h.topSpeed
  switch (c.mode) {
    case 'drive': {
      const target = clamp(c.targetSpeed, 0, top)
      if (vF < 0) vF = approach(vF, 0, HORSE.brake * dt)
      else if (vF < target) vF = Math.min(target, vF + HORSE.accel * (1 - 0.5 * (vF / top)) * dt)
      else vF = approach(vF, target, HORSE.coastDecel * 2 * dt)
      break
    }
    case 'coast': vF = approach(vF, 0, HORSE.coastDecel * dt); break
    case 'stop': vF = approach(vF, 0, HORSE.stopDecel * dt); break
    case 'brake':
    case 'reverse':
      if (vF > 4) vF = approach(vF, 0, HORSE.brake * dt)
      else vF = approach(vF, -HORSE.reverseSpeed, HORSE.reverseAccel * dt)
      break
  }

  const spd = Math.abs(vF)
  const rate = HORSE.turnRate * (0.4 + 0.6 * Math.min(1, spd / 140)) * (1 - 0.3 * clamp(spd / top, 0, 1))
  if (c.aim !== null && c.mode === 'drive') {
    const diff = wrapAngle(c.aim - h.heading)
    h.heading += clamp(diff, -rate * dt, rate * dt)
  } else {
    // Car-like: steering flips when rolling backwards.
    const dir = vF < -4 ? -1 : 1
    h.heading += clamp(c.steer, -1, 1) * rate * dt * dir
  }
  h.heading = wrapAngle(h.heading)

  const fwd = fromAngle(h.heading)
  const side = { x: -fwd.y, y: fwd.x }
  const vS = dot(h.vel, side) * Math.exp(-HORSE.grip * dt)
  h.vel = { x: fwd.x * vF + side.x * vS, y: fwd.y * vF + side.y * vS }
}

/** Advance one horse. Returns any events (explosions, fence scrapes). */
export function stepHorse(h: Horse, tr: Track, dt: number, frozen: boolean): PhysEvent[] {
  const ev: PhysEvent[] = []
  h.recoverTimer = Math.max(0, h.recoverTimer - dt)
  const r = HORSE.radius
  const W = tr.halfWidth

  if (h.state === 'flying') {
    h.flyTimer += dt
    h.pos.x += h.vel.x * dt; h.pos.y += h.vel.y * dt
    h.vel.x *= Math.exp(-0.5 * dt); h.vel.y *= Math.exp(-0.5 * dt)
    const t = h.flyTimer
    h.z = Math.max(0, 260 * t - 330 * t * t) + 6
    h.spin += 16 * dt
    h.heading = wrapAngle(h.heading + 9 * dt)
    const loc = locate(tr, h.pos, h.trackIdx)
    h.trackIdx = loc.i
    if (loc.lat * h.flySide >= W - r * 0.6 || h.flyTimer > 1.4) {
      // Slam into the fence: boom.
      const side = loc.lat * h.flySide >= 0 ? h.flySide : Math.sign(loc.lat) || h.flySide
      const lat = side * (W - r)
      h.pos = { x: loc.p.x + loc.nrm.x * lat, y: loc.p.y + loc.nrm.y * lat }
      h.vel = { x: 0, y: 0 }
      h.fwdSpeed = 0
      h.z = 0
      h.state = 'stunned'
      h.stunTimer = HORSE.stunSeconds
      h.reverseTimer = 0
      const fx = loc.p.x + loc.nrm.x * side * W, fy = loc.p.y + loc.nrm.y * side * W
      ev.push({ type: 'explode', x: fx, y: fy, victim: h.id })
    }
    return ev
  }

  if (h.state === 'stunned') {
    h.stunTimer -= dt
    h.vel = { x: 0, y: 0 }
    h.fwdSpeed = 0
    if (h.stunTimer <= 0) {
      h.state = 'normal'
      h.stunTimer = 0
      h.recoverTimer = HORSE.recoverSeconds
      h.spin = 0
    }
    return ev
  }

  if (frozen) { h.vel = { x: 0, y: 0 }; h.fwdSpeed = 0; return ev }

  applyControl(h, dt)
  h.pos.x += h.vel.x * dt; h.pos.y += h.vel.y * dt

  // Fences on both sides.
  const loc = locate(tr, h.pos, h.trackIdx)
  h.trackIdx = loc.i
  const limit = W - r
  if (Math.abs(loc.lat) > limit) {
    const sgn = Math.sign(loc.lat)
    const n = { x: loc.nrm.x * sgn, y: loc.nrm.y * sgn }
    const over = Math.abs(loc.lat) - limit
    h.pos.x -= n.x * over; h.pos.y -= n.y * over
    const vn = dot(h.vel, n)
    if (vn > 0) {
      h.vel.x -= n.x * vn * 1.3; h.vel.y -= n.y * vn * 1.3
      h.vel.x *= 0.93; h.vel.y *= 0.93
      if (vn > 90) ev.push({ type: 'scrape', x: h.pos.x + n.x * r, y: h.pos.y + n.y * r, horse: h.id })
    }
  }
  h.fwdSpeed = dot(h.vel, fromAngle(h.heading))
  h.gait += dt * (2 + Math.abs(h.fwdSpeed) / 28)
  return ev
}

function launch(victim: Horse, attacker: Horse, tr: Track): PhysEvent {
  const loc = locate(tr, victim.pos, victim.trackIdx)
  let side = Math.sign(loc.lat)
  if (Math.abs(loc.lat) < 6) {
    // Dead centre: send it to the side the hit pushes toward.
    const push = { x: victim.pos.x - attacker.pos.x, y: victim.pos.y - attacker.pos.y }
    side = dot(push, loc.nrm) >= 0 ? 1 : -1
  }
  const out = { x: loc.nrm.x * side, y: loc.nrm.y * side }
  const af = fromAngle(attacker.heading)
  const carry = attacker.fwdSpeed * 0.3
  victim.vel = { x: out.x * HORSE.launchSpeed + af.x * carry, y: out.y * HORSE.launchSpeed + af.y * carry }
  victim.state = 'flying'
  victim.flyTimer = 0
  victim.flySide = side
  victim.reverseTimer = 0
  attacker.vel.x *= 0.72; attacker.vel.y *= 0.72
  attacker.fwdSpeed *= 0.72
  return { type: 'launch', x: victim.pos.x, y: victim.pos.y, victim: victim.id, attacker: attacker.id }
}

/** Horse-vs-horse contacts: normal bumps, or a top-speed ram that launches the other horse. */
export function collide(horses: Horse[], tr: Track): PhysEvent[] {
  const ev: PhysEvent[] = []
  const R2 = HORSE.radius * 2
  for (let i = 0; i < horses.length; i++) {
    for (let j = i + 1; j < horses.length; j++) {
      const a = horses[i], b = horses[j]
      if (a.state === 'flying' || b.state === 'flying') continue
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y
      const d = Math.hypot(dx, dy)
      if (d >= R2 || d === 0) continue
      const n = { x: dx / d, y: dy / d }
      const aRams = isRamming(a, n) && canBeHit(b)
      const bRams = isRamming(b, { x: -n.x, y: -n.y }) && canBeHit(a)
      if (aRams && (!bRams || a.fwdSpeed >= b.fwdSpeed)) { ev.push(launch(b, a, tr)); continue }
      if (bRams) { ev.push(launch(a, b, tr)); continue }

      // Ordinary shove. A horse lying stunned on the fence acts like a wall.
      const overlap = R2 - d
      const aFixed = a.state === 'stunned', bFixed = b.state === 'stunned'
      const wa = aFixed ? 0 : bFixed ? 1 : 0.5
      const wb = bFixed ? 0 : aFixed ? 1 : 0.5
      a.pos.x -= n.x * overlap * wa; a.pos.y -= n.y * overlap * wa
      b.pos.x += n.x * overlap * wb; b.pos.y += n.y * overlap * wb
      const rel = (b.vel.x - a.vel.x) * n.x + (b.vel.y - a.vel.y) * n.y
      if (rel < 0) {
        const jimp = -1.4 * rel
        a.vel.x -= n.x * jimp * wa; a.vel.y -= n.y * jimp * wa
        b.vel.x += n.x * jimp * wb; b.vel.y += n.y * jimp * wb
        a.fwdSpeed = dot(a.vel, fromAngle(a.heading))
        b.fwdSpeed = dot(b.vel, fromAngle(b.heading))
        if (-rel > 80) ev.push({ type: 'bump', x: a.pos.x + n.x * HORSE.radius, y: a.pos.y + n.y * HORSE.radius, strength: Math.min(1, -rel / 400), a: a.id, b: b.id })
      }
    }
  }
  return ev
}
