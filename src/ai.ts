import { HORSE } from './config'
import type { Horse } from './horse'
import { clamp, dot, fromAngle, rand, wrapAngle } from './math'
import { bendAhead, locate, sample, type Track } from './track'

/** Give each bot its own personality. */
export function setupBot(h: Horse, index: number) {
  h.ai.skill = [0.965, 0.95, 0.935][index % 3] + rand(-0.01, 0.01)
  h.ai.aggression = rand(0.35, 0.8)
  h.ai.lane = rand(-0.4, 0.4)
  h.ai.laneTimer = rand(1, 3)
}

/**
 * Bots follow a point a little way down the track, slow for sharp bends,
 * swing wide to pass, and sometimes line up a ram on a horse in front.
 */
export function thinkBot(h: Horse, all: Horse[], tr: Track, dt: number, player: Horse | undefined, mayRam = true) {
  const c = h.ctrl
  if (h.state !== 'normal' || h.frozen) { c.mode = 'coast'; c.aim = null; return }
  const W = tr.halfWidth
  const loc = locate(tr, h.pos, h.trackIdx)

  // Unstick: if pinned against something, back up for a moment.
  if (h.ai.backupTimer > 0) {
    h.ai.backupTimer -= dt
    c.mode = 'brake'; c.aim = null
    // Back the nose toward the track direction.
    c.steer = wrapAngle(Math.atan2(loc.tan.y, loc.tan.x) - h.heading) > 0 ? -1 : 1
    return
  }
  if (Math.abs(h.fwdSpeed) < 25 && h.recoverTimer <= 0) h.ai.stuckTimer += dt
  else h.ai.stuckTimer = Math.max(0, h.ai.stuckTimer - dt * 2)
  if (h.ai.stuckTimer > 1.1) { h.ai.stuckTimer = 0; h.ai.backupTimer = 0.7; return }

  // Pick a racing lane now and then.
  h.ai.laneTimer -= dt
  if (h.ai.laneTimer <= 0) { h.ai.lane = rand(-0.5, 0.5); h.ai.laneTimer = rand(1.5, 4) }

  const lookAhead = 120 + Math.max(0, h.fwdSpeed) * 0.45
  let lane = h.ai.lane
  const fwd = fromAngle(h.heading)

  // Traffic: dodge or attack a horse just ahead.
  let ramTarget: Horse | null = null
  let followCap = Infinity
  if (h.ai.ramCooldown > 0) h.ai.ramCooldown -= dt
  for (const o of all) {
    if (o === h || o.state !== 'normal') continue
    const dx = o.pos.x - h.pos.x, dy = o.pos.y - h.pos.y
    const d = Math.hypot(dx, dy)
    if (d > 230 || d < 1) continue
    const ahead = dot({ x: dx / d, y: dy / d }, fwd)
    if (ahead < 0.6) continue
    const wantsRam = mayRam && h.ai.ramCooldown <= 0 && h.fwdSpeed > h.topSpeed * 0.8 && o.recoverTimer <= 0 && h.ai.aggression > 0.5
    if (wantsRam && d < 200) { ramTarget = o; break }
    const oLat = locate(tr, o.pos, o.trackIdx).lat / W
    lane = oLat > 0 ? Math.min(lane, oLat - 0.7) : Math.max(lane, oLat + 0.7)
    // Not attacking: don't blunder into the back of a slower horse while passing.
    if (d < 120 && ahead > 0.85) followCap = Math.min(followCap, Math.max(0, o.fwdSpeed) * 0.97)
  }
  lane = clamp(lane, -0.65, 0.65)

  let tx: number, ty: number
  if (ramTarget) {
    tx = ramTarget.pos.x + ramTarget.vel.x * 0.15
    ty = ramTarget.pos.y + ramTarget.vel.y * 0.15
  } else {
    const tgt = sample(tr, loc.s + lookAhead)
    tx = tgt.p.x + tgt.nrm.x * lane * W
    ty = tgt.p.y + tgt.nrm.y * lane * W
  }

  // Slow for bends ahead.
  const bend = bendAhead(tr, loc.s, 260 + Math.max(0, h.fwdSpeed) * 0.3)
  // Bots ride a touch under their (shared, random) top speed; tighter bends mean harder braking.
  let speed = h.topSpeed * h.ai.skill * (1 - clamp((bend - 0.5) / 1.6, 0, 1) * 0.55)

  // Gentle rubber band so races stay close.
  if (player && !player.finished) {
    const gap = h.progress - player.progress
    if (gap > 700) speed *= 0.93
    else if (gap < -900) speed = Math.min(h.topSpeed, speed * 1.04)
  }

  if (!ramTarget) speed = Math.min(speed, Math.max(followCap, HORSE.ramThreshold * h.topSpeed * 0.9))

  const aim = Math.atan2(ty - h.pos.y, tx - h.pos.x)
  const off = Math.abs(wrapAngle(aim - h.heading))
  if (off > 1.2) speed *= 0.5

  c.mode = 'drive'
  c.aim = aim
  c.steer = 0
  c.targetSpeed = speed
}
