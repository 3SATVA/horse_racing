import { BOT } from './config'
import { canBeHit, type Horse } from './horse'
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
export function thinkBot(h: Horse, all: Horse[], tr: Track, dt: number, player: Horse | undefined, mayRam = true, mayHunt = true) {
  const c = h.ctrl
  if (h.state !== 'normal' || h.frozen) { if (h.ai.hunting > 0) endHunt(h, all); h.surge = 0; c.mode = 'coast'; c.aim = null; return }
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

  // Hunting: now and then one bot (only one at a time) goes after the player, lines up behind
  // them and rams them from behind. A rear hit always explodes, so the player has to dodge.
  if (h.ai.ramCooldown > 0) h.ai.ramCooldown -= dt
  if (h.ai.huntCooldown > 0) h.ai.huntCooldown -= dt
  const prey = player && !player.finished && canBeHit(player) ? player : null
  const gap = player ? player.progress - h.progress : 0
  if (h.ai.hunting > 0) {
    h.ai.hunting -= dt
    if (!prey || gap < -BOT.huntAheadMax - 150 || gap > 900 || h.ai.hunting <= 0) endHunt(h, all)
  } else if (mayHunt && prey && h.ai.huntCooldown <= 0 && gap > -BOT.huntAheadMax && gap < 650 && !all.some((o) => o.ai.hunting > 0)) {
    if (Math.random() < dt * (BOT.huntChancePerSec + h.ai.aggression * BOT.huntChanceAggro)) { h.ai.hunting = rand(BOT.huntMin, BOT.huntMax); h.ai.huntsStarted++ }
  }
  const hunting = h.ai.hunting > 0 && prey !== null
  h.surge = hunting ? BOT.huntSurge : 0

  // Traffic: dodge or attack a horse just ahead.
  let ramTarget: Horse | null = hunting ? prey : null
  let followCap = Infinity
  for (const o of all) {
    if (o === h || o.state !== 'normal' || o === ramTarget) continue
    const dx = o.pos.x - h.pos.x, dy = o.pos.y - h.pos.y
    const d = Math.hypot(dx, dy)
    if (d > 230 || d < 1) continue
    const ahead = dot({ x: dx / d, y: dy / d }, fwd)
    if (ahead < 0.6) continue
    const wantsRam = !ramTarget && mayRam && !o.isPlayer && h.ai.ramCooldown <= 0 && h.fwdSpeed > h.topSpeed * 0.8 && o.recoverTimer <= 0 && h.ai.aggression > BOT.botRamAggro
    if (wantsRam && d < 200) { ramTarget = o; break }
    const oLat = locate(tr, o.pos, o.trackIdx).lat / W
    lane = oLat > 0 ? Math.min(lane, oLat - 0.7) : Math.max(lane, oLat + 0.7)
    // Not attacking: a rear hit always explodes, so don't blunder into the back of a slower horse.
    if (d < 140 && ahead > 0.8) followCap = Math.min(followCap, Math.max(0, o.fwdSpeed) * (d < 75 ? 0.8 : 0.95))
  }
  lane = clamp(lane, -0.65, 0.65)

  let tx: number, ty: number
  if (ramTarget) {
    const d = Math.hypot(ramTarget.pos.x - h.pos.x, ramTarget.pos.y - h.pos.y)
    if (hunting && d > 110) {
      // Line up behind the player's tail, leading their motion a little.
      const pf = fromAngle(ramTarget.heading)
      tx = ramTarget.pos.x - pf.x * 45 + ramTarget.vel.x * 0.3
      ty = ramTarget.pos.y - pf.y * 45 + ramTarget.vel.y * 0.3
    } else {
      tx = ramTarget.pos.x + ramTarget.vel.x * 0.15
      ty = ramTarget.pos.y + ramTarget.vel.y * 0.15
    }
  } else {
    const tgt = sample(tr, loc.s + lookAhead)
    tx = tgt.p.x + tgt.nrm.x * lane * W
    ty = tgt.p.y + tgt.nrm.y * lane * W
  }

  // Slow for bends ahead.
  const bend = bendAhead(tr, loc.s, 260 + Math.max(0, h.fwdSpeed) * 0.3)
  // Bots ride a touch under their (shared, random) top speed; tighter bends mean harder braking.
  let speed = hunting
    ? h.topSpeed * (1 + BOT.huntSurge) * (1 - clamp((bend - 0.5) / 1.6, 0, 1) * 0.3)
    : h.topSpeed * h.ai.skill * (1 - clamp((bend - 0.5) / 1.6, 0, 1) * 0.55)

  // Gentle rubber band so races stay close.
  if (player && !player.finished && !hunting) {
    const gap = h.progress - player.progress
    if (gap > 700) speed *= 0.93
    else if (gap < -900) speed = Math.min(h.topSpeed, speed * 1.04)
  }

  if (!ramTarget) speed = Math.min(speed, followCap)
  // A hunter that is still ahead of the player eases off and lets them come past, then pounces.
  if (hunting && prey && gap < -10) {
    speed = Math.min(speed, Math.max(0, prey.fwdSpeed) * 0.75)
    const pl = locate(tr, prey.pos, prey.trackIdx).lat / W
    const tgt = sample(tr, loc.s + lookAhead)
    const side = clamp(pl > 0 ? pl - 0.75 : pl + 0.75, -0.7, 0.7)
    tx = tgt.p.x + tgt.nrm.x * side * W
    ty = tgt.p.y + tgt.nrm.y * side * W
  }

  const aim = Math.atan2(ty - h.pos.y, tx - h.pos.x)
  const off = Math.abs(wrapAngle(aim - h.heading))
  if (off > 1.2) speed *= 0.5

  c.mode = 'drive'
  c.aim = aim
  c.steer = 0
  c.targetSpeed = speed
}

/** Stop hunting; this bot rests a while and the others wait a little before the next hunt. */
export function endHunt(h: Horse, all: Horse[]) {
  h.ai.hunting = 0
  h.ai.huntCooldown = Math.max(h.ai.huntCooldown, rand(BOT.huntRestMin, BOT.huntRestMax))
  for (const o of all) if (o !== h && !o.isPlayer) o.ai.huntCooldown = Math.max(o.ai.huntCooldown, BOT.huntSpacing)
}
