// Tunable numbers for the whole game live here so balancing is one-file work.

export const RACE = {
  laps: 3,
  /** Rival count is random each race, between these (inclusive). */
  /** Seconds after GO during which bots can't blow each other up (no grid pile-ups). */
  startGrace: 3,
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
  /** Speed (fraction of the horse's CURRENT top speed) needed to launch another. */
  ramThreshold: 0.88,
  launchSpeed: 720,
  /** Fence bounce while launched: speed kept along / off the fence. */
  bounceRestitution: 0.62,
  bounceFriction: 0.86,
  /** Flight (pinball phase) length before the horse lands stunned. */
  flightSeconds: 1.5,
  /** Catch-up boost after getting up from a stun. */
  boostSeconds: 4,
  boostSpeedMul: 1.3,
  boostAccelMul: 1.8,
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
