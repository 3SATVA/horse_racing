// Tunable numbers for the whole game live here so balancing is one-file work.

export const RACE = {
  laps: 3,
  bots: 3,
  countdownSeconds: 3,
  /** Seconds to linger on the track after the player crosses the line. */
  finishLinger: 1.6,
}

export const TRACK = {
  /** Half the width of the racing surface (fence to centre line), world units. */
  halfWidth: 92,
  /** Nominal radius of the loop before random wobble. */
  baseRadius: 1050,
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
  /** Speed (fraction of base top speed) a horse must be at to launch another. */
  ramThreshold: 0.88,
  launchSpeed: 640,
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
]
