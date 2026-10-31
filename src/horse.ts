import { ABILITY, HORSE } from './config'
import { rand, type Vec } from './math'

export type HorseState = 'normal' | 'flying' | 'stunned'

/** What a horse wants to do this frame. Filled in by the player input or the AI. */
export interface Control {
  /**
   * 'drive'   - head for targetSpeed (forward)
   * 'coast'   - no throttle, roll to a slow stop
   * 'stop'    - released the drag: firm stop
   * 'brake'   - S key: brake hard, then reverse
   * 'reverse' - tap-reverse: brake hard, then back up
   */
  mode: 'drive' | 'coast' | 'stop' | 'brake' | 'reverse'
  targetSpeed: number
  /** Keyboard-style steering, -1 (left) .. 1 (right). */
  steer: number
  /** If set, turn the nose toward this world angle instead of using `steer`. */
  aim: number | null
}

export interface Horse {
  id: number
  name: string
  isPlayer: boolean
  colors: { coat: string; mane: string; silk: string }
  pos: Vec
  vel: Vec
  heading: number
  /** Signed speed along the heading (negative = reversing). */
  fwdSpeed: number
  /** Current top speed (eases toward topTarget). */
  topSpeed: number
  /** The top speed this horse is drifting to; re-rolled on its own timer. */
  topTarget: number
  topTimer: number
  /** Catch-up boost time left after getting up from a stun. */
  boostTimer: number
  /** Fence ricochets during the current launch. */
  bounces: number
  /** Debug: hold still. */
  frozen: boolean
  /** Tutorial practice dummy: stands still (no AI) but can be rammed and blown up like any horse. */
  dummy: boolean
  ctrl: Control
  state: HorseState
  stunTimer: number
  recoverTimer: number
  flyTimer: number
  /** Visual height while launched (world units). */
  z: number
  spin: number
  /** Which fence side a launch is heading for: +1 left, -1 right. */
  flySide: number
  /** Remaining tap-reverse time. */
  reverseTimer: number
  // Race bookkeeping
  trackIdx: number
  lastS: number
  progress: number
  lap: number
  finished: boolean
  finishTime: number
  finishPlace: number
  wrongWayTimer: number
  // Animation
  gait: number
  // AI scratch space
  ai: { lane: number; laneTimer: number; stuckTimer: number; backupTimer: number; aggression: number; skill: number; targetId: number; ramCooldown: number; hunting: number; huntCooldown: number; huntsStarted: number }
  /** Speed bonus (fraction) a hunting bot may use to close in. */
  surge: number
  timesExploded: number
  kills: number
  // Ability effects
  /** Banana peel: steering is random while > 0 (speed still yours). */
  spinOutTimer: number
  spinTurn: number
  /** Fireball: slower top speed while > 0. */
  slowTimer: number
  /** EMP: 0.75x speed while > 0 (only ticks once the EMP stun is over). */
  empSlowTimer: number
  /** Rocket Hooves: self boost left (same strength as the catch-up boost). */
  rocketTimer: number
  /** Electricity-nade: 0.85x speed while > 0 (only ticks once the stun is over). */
  nadeSlowTimer: number
  /** Orbiting hay: one slow timer per bundle, so hits from different bundles stack. */
  haySlow: number[]
  /** EMP zap effect left (visual). */
  zapTimer: number
  /** Spiked ball: knocked backwards, no control while > 0. */
  knockTimer: number
  /** Next landing uses these instead of the defaults (grapple mini-explosion). 0 = default. */
  flyLen: number
  stunLen: number
  /** Skip the catch-up boost after the next stun. */
  noBoost: boolean
  /** Bot ability for this race (the player's lives in Race.slots), its cooldown and first-use time. */
  ability: import('./abilities').AbilityId | null
  abilityCd: number
  abilityFirstAt: number
  /** Floating "used X!" label over the horse. */
  label: { text: string; t: number } | null
}

export function makeHorse(id: number, name: string, colors: Horse['colors'], isPlayer: boolean): Horse {
  return {
    id, name, isPlayer, colors,
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, heading: 0, fwdSpeed: 0,
    topSpeed: HORSE.topSpeed, topTarget: HORSE.topSpeed, topTimer: rand(HORSE.topSpeedMinInterval, HORSE.topSpeedMaxInterval),
    boostTimer: 0, bounces: 0, frozen: false, dummy: false,
    ctrl: { mode: 'coast', targetSpeed: 0, steer: 0, aim: null },
    state: 'normal', stunTimer: 0, recoverTimer: 0, flyTimer: 0, z: 0, spin: 0, flySide: 1,
    reverseTimer: 0,
    trackIdx: -1, lastS: 0, progress: 0, lap: 1, finished: false, finishTime: 0, finishPlace: 0, wrongWayTimer: 0,
    gait: Math.random() * 10,
    ai: { lane: 0, laneTimer: 0, stuckTimer: 0, backupTimer: 0, aggression: 0, skill: 1, targetId: -1, ramCooldown: 0, hunting: 0, huntCooldown: rand(4, 10), huntsStarted: 0 },
    surge: 0, timesExploded: 0, kills: 0,
    spinOutTimer: 0, spinTurn: 0, slowTimer: 0, empSlowTimer: 0, rocketTimer: 0, nadeSlowTimer: 0, haySlow: [0, 0, 0], zapTimer: 0, knockTimer: 0, flyLen: 0, stunLen: 0, noBoost: false, ability: null, abilityCd: 0, abilityFirstAt: 0, label: null,
  }
}

export const canBeHit = (h: Horse) => h.state === 'normal' && h.recoverTimer <= 0

/** Same random distribution for every horse (player included), so it's fair over a race. */
export function rollTopSpeed(h: Horse) {
  h.topTarget = HORSE.topSpeed * (1 + rand(-HORSE.topSpeedJitter, HORSE.topSpeedJitter))
  h.topTimer = rand(HORSE.topSpeedMinInterval, HORSE.topSpeedMaxInterval)
}

/** Tick the top-speed wander. Each horse has its own timer, so they change at different moments. */
export function updateTopSpeed(h: Horse, dt: number) {
  h.topTimer -= dt
  if (h.topTimer <= 0) rollTopSpeed(h)
  const step = 45 * dt
  h.topSpeed = h.topSpeed < h.topTarget ? Math.min(h.topTarget, h.topSpeed + step) : Math.max(h.topTarget, h.topSpeed - step)
}

/** Every slow at once: fireball, EMP after-slow and each hay bundle, multiplied together. */
export function slowMul(h: Horse) {
  let m = 1
  if (h.slowTimer > 0) m *= ABILITY.fireballSlowMul
  if (h.empSlowTimer > 0) m *= ABILITY.empSlowMul
  if (h.nadeSlowTimer > 0) m *= ABILITY.nadeSlowMul
  for (const t of h.haySlow) if (t > 0) m *= ABILITY.haySlowMul
  return m
}

/** Catch-up boost or Rocket Hooves (same strength, they don't stack). */
export const isBoosted = (h: Horse) => h.boostTimer > 0 || h.rocketTimer > 0
export const boostMul = (h: Horse) => (isBoosted(h) ? HORSE.boostSpeedMul : 1) * (1 + h.surge)
