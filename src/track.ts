import { TRACK } from './config'
import { clamp, cross, dot, rand, randInt, type Vec } from './math'

/**
 * A closed-loop track described by an evenly spaced centre line.
 * Normals point to the LEFT of the direction of travel (screen coords, y down).
 */
export interface Track {
  pts: Vec[]
  tan: Vec[]
  nrm: Vec[]
  /** Cumulative distance at each point. */
  cum: number[]
  length: number
  halfWidth: number
  left: Vec[]
  right: Vec[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  seed: number
}

export interface TrackPos {
  /** Index of the segment start point. */
  i: number
  /** Distance along the loop, 0..length. */
  s: number
  /** Signed offset from the centre (+ = left of travel). */
  lat: number
  /** Closest centre-line point. */
  p: Vec
  tan: Vec
  nrm: Vec
}

function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t, t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) }
}

function resample(poly: Vec[], spacing: number): Vec[] {
  const out: Vec[] = []
  const n = poly.length
  let carry = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    let d = carry
    while (d < segLen) {
      const t = d / segLen
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      d += spacing
    }
    carry = d - segLen
  }
  return out
}

function smooth(pts: Vec[], passes: number): Vec[] {
  let cur = pts
  for (let k = 0; k < passes; k++) {
    const n = cur.length
    cur = cur.map((p, i) => {
      const a = cur[(i - 1 + n) % n], b = cur[(i + 1) % n]
      return { x: p.x * 0.5 + (a.x + b.x) * 0.25, y: p.y * 0.5 + (a.y + b.y) * 0.25 }
    })
  }
  return cur
}

/** Smallest turning radius along the loop (used to reject hairpins). */
function minRadius(pts: Vec[]): number {
  const n = pts.length
  let best = Infinity
  const k = 3
  for (let i = 0; i < n; i++) {
    const a = pts[(i - k + n) % n], b = pts[i], c = pts[(i + k) % n]
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y)
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    if (area2 < 1e-6) continue
    best = Math.min(best, (ab * bc * ca) / (2 * area2))
  }
  return best
}

/** True if two far-apart parts of the loop come too close (track would overlap). */
function tooClose(pts: Vec[], clearance: number, spacing: number): boolean {
  const n = pts.length
  const skip = Math.ceil((clearance * 2.2) / spacing)
  const c2 = clearance * clearance
  for (let i = 0; i < n; i += 2) {
    for (let j = i + skip; j < n; j += 2) {
      if (n - (j - i) < skip) continue
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
      if (dx * dx + dy * dy < c2) return true
    }
  }
  return false
}

function attempt(): Vec[] | null {
  const n = randInt(8, 13)
  const R = TRACK.baseRadius * rand(0.9, 1.2)
  const sx = rand(1.0, 1.6), sy = rand(0.8, 1.05)
  const rot = rand(0, Math.PI * 2)
  const ctrl: Vec[] = []
  for (let i = 0; i < n; i++) {
    const step = (Math.PI * 2) / n
    const a = i * step + rand(-0.32, 0.32) * step
    const r = R * rand(0.55, 1.0)
    const x = Math.cos(a) * r * sx, y = Math.sin(a) * r * sy
    ctrl.push({ x: x * Math.cos(rot) - y * Math.sin(rot), y: x * Math.sin(rot) + y * Math.cos(rot) })
  }
  const dense: Vec[] = []
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n]
    for (let k = 0; k < 24; k++) dense.push(catmull(p0, p1, p2, p3, k / 24))
  }
  let pts = resample(dense, TRACK.spacing)
  pts = smooth(pts, 6)
  pts = resample(pts, TRACK.spacing)
  const W = TRACK.halfWidth
  if (minRadius(pts) < W * 2.0) return null
  if (tooClose(pts, W * 2 + 90, TRACK.spacing)) return null
  return pts
}

export function generateTrack(): Track {
  let pts: Vec[] | null = null
  for (let tries = 0; tries < 60 && !pts; tries++) pts = attempt()
  if (!pts) {
    // Fallback: a plain oval always works.
    pts = []
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2
      pts.push({ x: Math.cos(a) * 1300, y: Math.sin(a) * 800 })
    }
    pts = resample(pts, TRACK.spacing)
  }
  // Make travel direction clockwise on screen (y down => positive signed area).
  let area = 0
  for (let i = 0; i < pts.length; i++) area += cross(pts[i], pts[(i + 1) % pts.length])
  if (area < 0) pts.reverse()
  return buildTrack(pts)
}

export function buildTrack(pts: Vec[]): Track {
  const n = pts.length
  const W = TRACK.halfWidth
  const tan: Vec[] = [], nrm: Vec[] = [], cum: number[] = [], left: Vec[] = [], right: Vec[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n]
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1
    const t = { x: dx / l, y: dy / l }
    tan.push(t)
    // Left of travel on a y-down screen.
    const nn = { x: t.y, y: -t.x }
    nrm.push(nn)
    cum.push(total)
    const c = pts[(i + 1) % n]
    total += Math.hypot(c.x - pts[i].x, c.y - pts[i].y)
    left.push({ x: pts[i].x + nn.x * W, y: pts[i].y + nn.y * W })
    right.push({ x: pts[i].x - nn.x * W, y: pts[i].y - nn.y * W })
  }
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of [...left, ...right]) {
    bounds.minX = Math.min(bounds.minX, p.x); bounds.minY = Math.min(bounds.minY, p.y)
    bounds.maxX = Math.max(bounds.maxX, p.x); bounds.maxY = Math.max(bounds.maxY, p.y)
  }
  return { pts, tan, nrm, cum, length: total, halfWidth: W, left, right, bounds, seed: Math.random() }
}

function projectSeg(tr: Track, i: number, p: Vec) {
  const n = tr.pts.length
  const a = tr.pts[i], b = tr.pts[(i + 1) % n]
  const abx = b.x - a.x, aby = b.y - a.y
  const l2 = abx * abx + aby * aby || 1
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / l2, 0, 1)
  const q = { x: a.x + abx * t, y: a.y + aby * t }
  const d2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2
  return { t, q, d2 }
}

/**
 * Locate a point on the track. Pass the previous segment index as `hint`
 * to search only nearby segments (much faster, and avoids snapping across).
 */
export function locate(tr: Track, p: Vec, hint = -1): TrackPos {
  const n = tr.pts.length
  let bestI = 0, bestT = 0, bestD = Infinity, bestQ = tr.pts[0]
  const scan = (i: number) => {
    const r = projectSeg(tr, i, p)
    if (r.d2 < bestD) { bestD = r.d2; bestI = i; bestT = r.t; bestQ = r.q }
  }
  if (hint >= 0) for (let k = -24; k <= 24; k++) scan((hint + k + n) % n)
  if (hint < 0 || bestD > (tr.halfWidth * 3) ** 2) for (let i = 0; i < n; i++) scan(i)
  const segLen = tr.cum[(bestI + 1) % n] - tr.cum[bestI]
  const s = tr.cum[bestI] + bestT * (segLen > 0 ? segLen : tr.length - tr.cum[bestI])
  // Blend tangents for a smooth normal.
  const t0 = tr.tan[bestI], t1 = tr.tan[(bestI + 1) % n]
  const tx = t0.x + (t1.x - t0.x) * bestT, ty = t0.y + (t1.y - t0.y) * bestT
  const tl = Math.hypot(tx, ty) || 1
  const tan = { x: tx / tl, y: ty / tl }
  const nrm = { x: tan.y, y: -tan.x }
  const lat = dot({ x: p.x - bestQ.x, y: p.y - bestQ.y }, nrm)
  return { i: bestI, s, lat, p: bestQ, tan, nrm }
}

/** Point, tangent and normal at distance `s` along the loop. */
export function sample(tr: Track, s: number): { p: Vec; tan: Vec; nrm: Vec; i: number } {
  const L = tr.length
  s = ((s % L) + L) % L
  // Binary search the cumulative table.
  let lo = 0, hi = tr.cum.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tr.cum[mid] <= s) lo = mid; else hi = mid - 1 }
  const n = tr.pts.length
  const a = tr.pts[lo], b = tr.pts[(lo + 1) % n]
  const segLen = (lo + 1 < n ? tr.cum[lo + 1] : L) - tr.cum[lo]
  const t = segLen > 0 ? (s - tr.cum[lo]) / segLen : 0
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  return { p, tan: tr.tan[lo], nrm: tr.nrm[lo], i: lo }
}

/** Total heading change (radians) over the next `ahead` units of track. */
export function bendAhead(tr: Track, s: number, ahead: number): number {
  let total = 0
  let prev = sample(tr, s).tan
  const steps = 6
  for (let k = 1; k <= steps; k++) {
    const t = sample(tr, s + (ahead * k) / steps).tan
    total += Math.abs(Math.atan2(cross(prev, t), dot(prev, t)))
    prev = t
  }
  return total
}
