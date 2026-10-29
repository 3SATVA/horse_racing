import { ABILITY, BOT, HORSE } from './config'
import { boostMul, canBeHit, type Horse } from './horse'
import { approach, clamp, dot, fromAngle, wrapAngle } from './math'
import { locate, type Track } from './track'

export type PhysEvent =
  | { type: 'explode'; x: number; y: number; victim: number; mini?: boolean }
  | { type: 'launch'; x: number; y: number; victim: number; attacker: number; kind: HitKind }
  | { type: 'bump'; x: number; y: number; strength: number; a: number; b: number }
  | { type: 'scrape'; x: number; y: number; horse: number }
  | { type: 'bounce'; x: number; y: number; horse: number; strength: number }
  | { type: 'boost'; horse: number }

export type HitKind = 'rear' | 'headon' | 'side'

/**
 * Collision rules (a = one horse, b = the other, n = unit vector a -> b):
 *  - a "points at" b when a's nose is within ~50° of the line to b (dot(fwdA, n) > HORSE.noseCos).
 *  - REAR: a points at b, the two face roughly the same way (within ~65°) and a is behind b
 *    (contact on b's rear half). b ALWAYS explodes, at any speed, as long as they close at
 *    >= HORSE.rearMinClosing (so a parked touch does nothing).
 *  - HEAD-ON: both point at each other with headings roughly opposite (> ~120° apart). BOTH explode
 *    (each one that can be hit), given a small closing speed.
 *  - SIDE / T-bone: a's nose hits b's flank (a points at b, headings neither aligned nor opposite).
 *    b explodes only if a is moving at >= HORSE.sideRamFrac of its top speed and closing fast.
 *  - Anything else (shoulder rubs, flank vs flank, backing into someone) is a normal shove.
 * A horse that is flying, stunned or in its post-stun invulnerable window can't be exploded,
 * and only a horse in the normal state can be the attacker.
 */
export function classifyHit(a: Horse, b: Horse, n: { x: number; y: number }): { aHitsB: HitKind | null; bHitsA: HitKind | null } {
  const fa = fromAngle(a.heading), fb = fromAngle(b.heading)
  const closing = (a.vel.x - b.vel.x) * n.x + (a.vel.y - b.vel.y) * n.y
  const aNose = a.state === 'normal' && dot(fa, n) > HORSE.noseCos
  const bNose = b.state === 'normal' && -dot(fb, n) > HORSE.noseCos
  const align = dot(fa, fb)
  if (aNose && bNose && align < HORSE.headOnCos) {
    if (closing < HORSE.rearMinClosing) return { aHitsB: null, bHitsA: null }
    return { aHitsB: 'headon', bHitsA: 'headon' }
  }
  const one = (atk: Horse, nose: boolean, fAtk: { x: number; y: number }, fTgt: { x: number; y: number }, dir: { x: number; y: number }): HitKind | null => {
    if (!nose || closing < HORSE.rearMinClosing) return null
    const al = dot(fAtk, fTgt)
    // Contact on the target's rear half: attacker is behind it (target heading points away from attacker).
    if (al > HORSE.rearAlignCos && dot(fTgt, dir) > 0) return 'rear'
    if (al > HORSE.rearAlignCos) return null // nose-to-nose-ish from in front while going the same way: just a shove
    if (atk.fwdSpeed >= HORSE.sideRamFrac * atk.topSpeed && closing > HORSE.sideMinClosing) return 'side'
    return null
  }
  return {
    aHitsB: one(a, aNose, fa, fb, n),
    bHitsA: one(b, bNose, fb, fa, { x: -n.x, y: -n.y }),
  }
}

function applyControl(h: Horse, dt: number) {
  const c = h.ctrl
  let vF = h.fwdSpeed
  // A catch-up boost raises both the ceiling and whatever speed the rider asks for.
  const bm = boostMul(h) * (h.slowTimer > 0 ? ABILITY.fireballSlowMul : 1)
  const top = h.topSpeed * bm
  const accel = HORSE.accel * (h.boostTimer > 0 ? HORSE.boostAccelMul : 1)
  switch (c.mode) {
    case 'drive': {
      const target = clamp(c.targetSpeed * bm, 0, top)
      if (vF < 0) vF = approach(vF, 0, HORSE.brake * dt)
      else if (vF < target) vF = Math.min(target, vF + accel * (1 - 0.5 * (vF / top)) * dt)
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
  if (h.spinOutTimer > 0) {
    // Banana peel of doom: the nose turns on its own (random, lurching), the rider only has the throttle.
    if (Math.random() < dt * 2.5) h.spinTurn = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 5)
    h.heading += h.spinTurn * dt
  } else if (c.aim !== null && c.mode === 'drive') {
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
    // Pinball phase: the horse already exploded on impact; now it ricochets off the fences.
    h.flyTimer += dt
    h.pos.x += h.vel.x * dt; h.pos.y += h.vel.y * dt
    h.vel.x *= Math.exp(-0.9 * dt); h.vel.y *= Math.exp(-0.9 * dt)
    const t = h.flyTimer
    // A few hops, each lower than the last.
    h.z = 6 + 70 * Math.abs(Math.sin(t * Math.PI * 2.2)) * Math.exp(-1.6 * t)
    h.heading = wrapAngle(h.heading + h.spin * dt)
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
        const tv = { x: h.vel.x - n.x * vn, y: h.vel.y - n.y * vn }
        h.vel = { x: tv.x * HORSE.bounceFriction - n.x * vn * HORSE.bounceRestitution, y: tv.y * HORSE.bounceFriction - n.y * vn * HORSE.bounceRestitution }
        h.spin = -h.spin * 0.8 + (Math.random() - 0.5) * 6
        h.bounces++
        if (vn > 60) ev.push({ type: 'bounce', x: h.pos.x + n.x * r, y: h.pos.y + n.y * r, horse: h.id, strength: Math.min(1, vn / 600) })
      }
    }
    const spd = Math.hypot(h.vel.x, h.vel.y)
    const flyLen = h.flyLen || HORSE.flightSeconds
    if (h.flyTimer > flyLen || (h.flyTimer > Math.min(0.6, flyLen) && spd < 70)) {
      h.vel = { x: 0, y: 0 }
      h.fwdSpeed = 0
      h.z = 0
      h.state = 'stunned'
      h.stunTimer = h.stunLen || HORSE.stunSeconds
      h.flyLen = 0; h.stunLen = 0
      h.reverseTimer = 0
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
      if (h.noBoost) h.noBoost = false // grapple mini-explosion: no catch-up boost
      else { h.boostTimer = HORSE.boostSeconds; ev.push({ type: 'boost', horse: h.id }) }
    }
    return ev
  }

  if (frozen || h.frozen) { h.vel = { x: 0, y: 0 }; h.fwdSpeed = 0; return ev }
  if (h.boostTimer > 0) h.boostTimer = Math.max(0, h.boostTimer - dt)
  if (h.spinOutTimer > 0) h.spinOutTimer = Math.max(0, h.spinOutTimer - dt)
  if (h.slowTimer > 0) h.slowTimer = Math.max(0, h.slowTimer - dt)

  if (h.knockTimer > 0) {
    // Spiked ball: sliding backwards out of control.
    h.knockTimer -= dt
    h.vel.x *= Math.exp(-1.6 * dt); h.vel.y *= Math.exp(-1.6 * dt)
  } else applyControl(h, dt)
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
      const spd = Math.hypot(h.vel.x, h.vel.y)
      // Fences never explode. Grazing / hugging the rail keeps every bit of speed: the
      // velocity is simply redirected along the fence. Only a real head-on hit bumps.
      if (vn > HORSE.fenceHeadOnSpeed && vn > spd * HORSE.fenceHeadOnCos) {
        const tx = h.vel.x - n.x * vn, ty = h.vel.y - n.y * vn
        const e = HORSE.fenceBumpRestitution
        h.vel.x = tx * 0.85 - n.x * vn * e; h.vel.y = ty * 0.85 - n.y * vn * e
        ev.push({ type: 'scrape', x: h.pos.x + n.x * r, y: h.pos.y + n.y * r, horse: h.id })
      } else {
        let t = { x: -n.y, y: n.x }
        if (dot(t, h.vel) < 0) t = { x: -t.x, y: -t.y }
        h.vel = { x: t.x * spd, y: t.y * spd }
        // Point the horse along the rail too, so its forward speed isn't lost next step.
        const back = h.fwdSpeed < 0
        const want = Math.atan2(back ? -t.y : t.y, back ? -t.x : t.x)
        if (Math.abs(wrapAngle(want - h.heading)) < 1.2) h.heading = want
        if (vn > 120 && Math.random() < 0.25) ev.push({ type: 'scrape', x: h.pos.x + n.x * r, y: h.pos.y + n.y * r, horse: h.id })
      }
    }
  }
  h.fwdSpeed = dot(h.vel, fromAngle(h.heading))
  h.gait += dt * (2 + Math.abs(h.fwdSpeed) / 28)
  return ev
}

function launch(victim: Horse, attacker: Horse, tr: Track, kind: HitKind, slowAttacker = true): PhysEvent[] {
  attacker.ai.ramCooldown = 8 // bots don't go hunting again straight away
  if (attacker.ai.hunting > 0) { attacker.ai.hunting = 0; attacker.ai.huntCooldown = BOT.huntRestMin + Math.random() * (BOT.huntRestMax - BOT.huntRestMin) }
  victim.timesExploded++
  attacker.kills++
  const loc = locate(tr, victim.pos, victim.trackIdx)
  let side = Math.sign(loc.lat)
  if (Math.abs(loc.lat) < 6) {
    const push = { x: victim.pos.x - attacker.pos.x, y: victim.pos.y - attacker.pos.y }
    side = dot(push, loc.nrm) >= 0 ? 1 : -1
  }
  // Mostly sideways (into a fence) plus a lot of the attacker's momentum, so it pinballs down the track.
  const out = { x: loc.nrm.x * side, y: loc.nrm.y * side }
  const af = fromAngle(attacker.heading)
  const carry = attacker.fwdSpeed * 0.75
  victim.vel = { x: out.x * HORSE.launchSpeed + af.x * carry, y: out.y * HORSE.launchSpeed + af.y * carry }
  victim.state = 'flying'
  victim.flyTimer = 0
  victim.flySide = side
  victim.reverseTimer = 0
  victim.boostTimer = 0
  victim.bounces = 0
  victim.knockTimer = 0; victim.spinOutTimer = 0; victim.flyLen = 0; victim.stunLen = 0; victim.noBoost = false
  victim.spin = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 6)
  if (slowAttacker) { attacker.vel.x *= 0.72; attacker.vel.y *= 0.72; attacker.fwdSpeed *= 0.72 }
  // The explosion happens right here, at the moment of impact.
  const ix = (victim.pos.x + attacker.pos.x) / 2, iy = (victim.pos.y + attacker.pos.y) / 2
  return [
    { type: 'launch', x: victim.pos.x, y: victim.pos.y, victim: victim.id, attacker: attacker.id, kind },
    { type: 'explode', x: ix, y: iy, victim: victim.id },
  ]
}

/**
 * Explode a horse without a horse attacker (abilities). `mini` = grapple: a short hop and short
 * stun, and no catch-up boost afterwards.
 */
export function blast(victim: Horse, from: { x: number; y: number }, tr: Track, mini = false): PhysEvent[] {
  victim.timesExploded++
  const loc = locate(tr, victim.pos, victim.trackIdx)
  let side = Math.sign(loc.lat) || 1
  if (Math.abs(loc.lat) < 6) side = dot({ x: victim.pos.x - from.x, y: victim.pos.y - from.y }, loc.nrm) >= 0 ? 1 : -1
  const sp = mini ? HORSE.launchSpeed * 0.4 : HORSE.launchSpeed
  victim.vel = { x: loc.nrm.x * side * sp, y: loc.nrm.y * side * sp }
  victim.state = 'flying'
  victim.flyTimer = 0
  victim.flySide = side
  victim.reverseTimer = 0
  victim.boostTimer = 0
  victim.bounces = 0
  victim.knockTimer = 0
  victim.spinOutTimer = 0
  victim.spin = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 6)
  victim.flyLen = mini ? ABILITY.grappleFlySeconds : 0
  victim.stunLen = mini ? ABILITY.grappleStunSeconds : 0
  victim.noBoost = mini
  return [{ type: 'explode', x: victim.pos.x, y: victim.pos.y, victim: victim.id, mini }]
}

/** Horse-vs-horse contacts: normal shoves, or a rear / head-on / side hit (see classifyHit) that launches. */
/** `botRams` false = bots can't blow each other up (start-of-race grace, avoids a grid pile-up). */
export function collide(horses: Horse[], tr: Track, botRams = true): PhysEvent[] {
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
      const armed = botRams || a.isPlayer || b.isPlayer
      if (armed) {
        const hit = classifyHit(a, b, n)
        const aOk = hit.aHitsB !== null && canBeHit(b)
        const bOk = hit.bHitsA !== null && canBeHit(a)
        if (hit.aHitsB === 'headon' && (aOk || bOk)) {
          // Both explode (whoever can be hit). launch() leaves the victim's fwdSpeed alone and we skip
          // slowing an attacker that is itself about to be launched, so each carry uses pre-impact speed.
          if (aOk) ev.push(...launch(b, a, tr, 'headon', !bOk))
          if (bOk) ev.push(...launch(a, b, tr, 'headon', !aOk))
          continue
        }
        if (aOk && (!bOk || a.fwdSpeed >= b.fwdSpeed)) { ev.push(...launch(b, a, tr, hit.aHitsB!)); continue }
        if (bOk) { ev.push(...launch(a, b, tr, hit.bHitsA!)); continue }
      }

      // Ordinary shove. A horse lying stunned acts like a wall.
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
