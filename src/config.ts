// Tunable numbers for the whole game live here so balancing is one-file work.

export const RACE = {
  laps: 3,
  /** Rival count is random each race, between these (inclusive). */
  /** Seconds after GO during which bots can't blow each other up (no grid pile-ups). */
  startGrace: 3,
  /** Bots may start hunting the player this many seconds after GO. */
  huntDelay: 1.5,
  minBots: 1,
  maxBots: 7,
  countdownSeconds: 3,
  /** Seconds to linger on the track after the player crosses the line. */
  finishLinger: 1.6,
}

export const TRACK = {
  /** Half the width of the racing surface (fence to centre line), world units. */
  halfWidth: 92,
  /** Each track picks its own width in this range. */
  minHalfWidth: 84,
  maxHalfWidth: 104,
  /** Lap length range (world units). */
  minLength: 6000,
  maxLength: 9500,
  /** Tightest allowed bend, as a multiple of the half width. */
  minTurnRadius: 1.45,
  /** Reject shapes this close to convex (ovals / circles). */
  maxSolidity: 0.9,
  /** Distance between resampled centre-line points. */
  spacing: 18,
  /** Fence post spacing (visual only). */
  postSpacing: 54,
}

export const HORSE = {
  radius: 17,
  topSpeed: 430,
  reverseSpeed: 95,
  accel: 360,
  brake: 1000,
  coastDecel: 150,
  stopDecel: 560,
  reverseAccel: 170,
  /** Max heading change in rad/s at a medium speed. */
  turnRate: 3.1,
  /** How fast sideways slide is damped (bigger = more grip). */
  grip: 9,
  /** Each horse's top speed wanders within +/- this fraction of topSpeed. */
  topSpeedJitter: 0.07,
  /** Seconds between top speed changes (random per horse, per change). */
  topSpeedMinInterval: 2,
  topSpeedMaxInterval: 6,
  /** Collision rules (see classifyHit in physics.ts). Nose "points at" the other horse within ~50°. */
  noseCos: 0.64,
  /** Headings within ~65° count as "same way" (rear hit); more than ~120° apart counts as head-on. */
  rearAlignCos: 0.42,
  headOnCos: -0.5,
  /** Rear and head-on hits explode at any speed once closing at least this fast. */
  rearMinClosing: 35,
  /** Side / T-bone: attacker needs this fraction of its top speed and this closing speed. */
  sideRamFrac: 0.6,
  sideMinClosing: 160,
  launchSpeed: 720,
  /** Fence bounce while launched: speed kept along / off the fence. */
  bounceRestitution: 0.62,
  bounceFriction: 0.86,
  /** Flight (pinball phase) length before the horse lands stunned. */
  flightSeconds: 1.5,
  /** Catch-up boost after getting up from a stun. */
  boostSeconds: 4,
  boostSpeedMul: 1.9,
  boostAccelMul: 3.4,
  /** A fence hit only bumps when it's head-on: normal speed above this AND steeper than ~55°. Grazing keeps all speed. */
  fenceHeadOnSpeed: 180,
  fenceHeadOnCos: 0.82,
  fenceBumpRestitution: 0.35,
  stunSeconds: 3,
  /** Grace period after getting up, so a horse can't be juggled. */
  recoverSeconds: 1.4,
  /** Seconds a tap-reverse lasts (brake, then back up). */
  tapReverseSeconds: 1.4,
}

export const CONTROL = {
  /** Drag distance (CSS px) under which the horse doesn't move. */
  deadZone: 12,
  /** Drag distance (CSS px) for full speed, capped by screen size. */
  maxDrag: 150,
  /** Quick tap = released within this time and movement. */
  tapMs: 220,
  tapMovePx: 14,
}

/** Bots draw random, unique names from this pool every race. */
/** Bot behaviour. One bot at a time may hunt the player: chase, line up behind, ram from behind. */
export const BOT = {
  huntChancePerSec: 0.2,
  huntChanceAggro: 0.35,
  /** Seconds a hunt lasts at most. */
  huntMin: 6,
  huntMax: 12,
  /** A hunting bot may run this much over its top speed so it can actually catch you. */
  huntSurge: 0.1,
  /** A bot up to this far ahead of the player may also start a hunt (it drops back first). */
  huntAheadMax: 500,
  /** After a hunt (hit or miss) this bot rests, and every other bot waits huntSpacing. */
  huntRestMin: 8,
  huntRestMax: 14,
  huntSpacing: 5,
  /** Bots only try to ram other bots when aggression is above this. */
  botRamAggro: 0.6,
}

/**
 * Magic shop abilities. Each purchase adds one charge; a race uses the abilities equipped in the
 * player's slots (SLOTS of them; 1 for now, more can be sold later).
 */
export const SLOTS = 1
export const ABILITY = {
  /** Grappling hook: grabs the nearest rival within range, yanks it to you, mini-explodes it. */
  grappleRange: 1100,
  grapplePullSpeed: 900,
  grapplePullSeconds: 0.45,
  grappleFlySeconds: 0.5,
  grappleStunSeconds: 1.3,
  /** Spiked soccer ball: bounces down the track faster than any horse, knocks rivals backwards. */
  ballSpeedMul: 1.6,
  ballSeconds: 7,
  ballRadius: 15,
  ballKnockSpeed: 330,
  ballKnockSeconds: 0.8,
  /** Dangerous roomba: drives along the track sweeping side to side; rivals touching it explode. */
  roombaSeconds: 6,
  roombaSpeedMul: 1.25,
  roombaRadius: 24,
  /** Banana peel of doom: dropped behind you; whoever steps on it spins out. */
  bananaSpinSeconds: 2.6,
  bananaRadius: 20,
  bananaSeconds: 60,
  /** You can't slip on your own peel for this long after dropping it. */
  bananaOwnerGrace: 2,
  /** Fireball: bounces around the track, passes through horses and slows rivals it touches. */
  fireballSeconds: 4.6,
  fireballSpeedMul: 1.35,
  fireballRadius: 20,
  fireballSlowSeconds: 3,
  fireballSlowMul: 0.55,
}

/** Coins: by finishing place (1st..8th) plus a bonus per rival you blew up. New players start with startCoins. */
export const COINS = {
  place: [100, 70, 55, 45, 35, 28, 22, 18],
  perKill: 10,
  start: 150,
}

export const HORSE_NAMES = [
  'Thunder', 'Biscuit', 'Clover', 'Comet', 'Pepper', 'Duchess', 'Ziggy', 'Noodle',
  'Pickles', 'Sir Gallops', 'Buttercup', 'Rocket', 'Waffles', 'Maple', 'Blaze', 'Pudding',
  'Hay Fever', 'Mr. Trot', 'Sugarfoot', 'Turbo', 'Marshmallow', 'Jellybean', 'Nugget', 'Dynamo',
  'Sparky', 'Hoofhearted', 'Cinnamon', 'Wildfire', 'Muffin', 'Captain Neigh', 'Pebbles', 'Gizmo',
  'Stardust', 'Taco', 'Bramble', 'Zoom Zoom', 'Mango', 'Lady Luck', 'Pumpernickel', 'Tornado',
  'Sprinkles', 'Bandit', 'Fudge', 'Rascal', 'Popcorn', 'Moonpie', 'Dash Rendar', 'Bonbon',
  'Ruckus', 'Cupcake', 'Galaxy', 'Toffee',
]

export const HORSE_COLORS = [
  { name: 'You', coat: '#8b5a2b', mane: '#2a1a0e', silk: '#e8343a' },
  { name: 'Thunder', coat: '#3b3b3f', mane: '#111114', silk: '#2f7ae5' },
  { name: 'Biscuit', coat: '#d9b27c', mane: '#f4ead2', silk: '#f2c230' },
  { name: 'Clover', coat: '#f0ede6', mane: '#9a9a9a', silk: '#2fbf71' },
  { name: 'Comet', coat: '#6b3a1f', mane: '#f1e3c8', silk: '#a24bdb' },
  { name: 'Pepper', coat: '#7d7368', mane: '#2b2622', silk: '#ff8a1f' },
  { name: 'Duchess', coat: '#c47a3c', mane: '#5a2e12', silk: '#ff5fa8' },
  { name: 'Ziggy', coat: '#1f1a17', mane: '#e8e1d4', silk: '#1fc8d8' },
]
