export interface Vec { x: number; y: number }

export const v = (x = 0, y = 0): Vec => ({ x, y })
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const norm = (a: Vec): Vec => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l } }
export const fromAngle = (a: number, l = 1): Vec => ({ x: Math.cos(a) * l, y: Math.sin(a) * l })
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Wrap an angle into (-PI, PI]. */
export const wrapAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a <= -Math.PI) a += Math.PI * 2; return a }
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
export const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1))
/** Move `cur` toward `target` by at most `step`. */
export const approach = (cur: number, target: number, step: number) =>
  cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step)
