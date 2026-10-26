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
  kind: TrackKind
  solidity: number
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

export type TrackKind = 'blob' | 'hull' | 'blocks'

function convexHull(points: Vec[]): Vec[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const turn = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec[] = [], upper: Vec[] = []
  for (const q of p) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function polyArea(pts: Vec[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) a += cross(pts[i], pts[(i + 1) % pts.length])
  return a / 2
}

/** Area / convex-hull area. 1 = convex (oval-like); lower = more bays, bends and hairpins. */
export function solidity(pts: Vec[]): number {
  return Math.abs(polyArea(pts)) / (Math.abs(polyArea(convexHull(pts))) || 1)
}

function splineLoop(ctrl: Vec[], per = 24): Vec[] {
  const n = ctrl.length, dense: Vec[] = []
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n]
    for (let k = 0; k < per; k++) dense.push(catmull(p0, p1, p2, p3, k / per))
  }
  return dense
}

function chaikin(pts: Vec[], passes: number): Vec[] {
  let cur = pts
  for (let k = 0; k < passes; k++) {
    const out: Vec[] = []
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length]
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
    }
    cur = out
  }
  return cur
}

/** Lumpy radial blob: deep bays and bulges, sometimes a pinched waist. */
function blobShape(): Vec[] {
  const n = randInt(7, 14)
  const sx = rand(1.0, 1.7), sy = rand(0.75, 1.05)
  const pinch = Math.random() < 0.5
  const ctrl: Vec[] = []
  for (let i = 0; i < n; i++) {
    const step = (Math.PI * 2) / n
    const a = i * step + rand(-0.3, 0.3) * step
    let r = rand(0.38, 1.0)
    if (pinch && i % Math.max(2, Math.floor(n / 2)) === 0) r *= 0.45
    ctrl.push({ x: Math.cos(a) * r * sx, y: Math.sin(a) * r * sy })
  }
  return splineLoop(ctrl)
}

/** Random points, convex hull, then midpoints pushed in/out: classic race-circuit look. */
function hullShape(): Vec[] {
  const pts: Vec[] = []
  const n = randInt(10, 24), ax = rand(1.2, 1.8)
  for (let i = 0; i < n; i++) pts.push({ x: rand(-1, 1) * ax, y: rand(-1, 1) })
  const hull = convexHull(pts)
  const ctrl: Vec[] = []
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    ctrl.push(a)
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L > 0.45) {
      const nx = (b.y - a.y) / L, ny = -(b.x - a.x) / L
      const pieces = L > 1.3 && Math.random() < 0.5 ? 2 : 1
      for (let k = 1; k <= pieces; k++) {
        const t = k / (pieces + 1), d = rand(-0.5, 0.5) * L / pieces
        ctrl.push({ x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d })
      }
    }
  }
  // Keep control points apart so the spline doesn't kink.
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < ctrl.length; i++) {
      const a = ctrl[i], b = ctrl[(i + 1) % ctrl.length]
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6
      if (d < 0.3) { const k = (0.3 - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k }
    }
  }
  return splineLoop(ctrl)
}

/** Union of grid cells (L, U, T, S, zig-zag...), corners rounded: long straights and hairpins. */
function blockShape(): Vec[] | null {
  const cols = randInt(3, 5), rows = randInt(2, 4)
  const want = randInt(Math.ceil(cols * rows * 0.4), Math.floor(cols * rows * 0.75))
  const key = (x: number, y: number) => x + ',' + y
  const cells = new Set<string>()
  const list: [number, number][] = []
  const add = (x: number, y: number) => { cells.add(key(x, y)); list.push([x, y]) }
  add(randInt(0, cols - 1), randInt(0, rows - 1))
  for (let guard = 0; list.length < want && guard < 500; guard++) {
    const [cx, cy] = list[randInt(0, list.length - 1)]
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][randInt(0, 3)]
    const nx = cx + dx, ny = cy + dy
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || cells.has(key(nx, ny))) continue
    add(nx, ny)
  }
  // Boundary edges (shared edges cancel out).
  const edges = new Map<string, [number, number, number, number]>()
  for (const [x, y] of list) {
    const c: [number, number][] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = c[k], [bx, by] = c[(k + 1) % 4]
      const rev = `${bx},${by}>${ax},${ay}`
      if (edges.has(rev)) edges.delete(rev)
      else edges.set(`${ax},${ay}>${bx},${by}`, [ax, ay, bx, by])
    }
  }
  const from = new Map<string, [number, number, number, number]>()
  for (const e of edges.values()) {
    const k = key(e[0], e[1])
    if (from.has(k)) return null // cells touching only at a corner
    from.set(k, e)
  }
  const first = edges.values().next().value!
  const loop: Vec[] = []
  let e = first
  for (let i = 0; i <= edges.size; i++) {
    loop.push({ x: e[0], y: e[1] })
    const nxt = from.get(key(e[2], e[3]))
    if (!nxt) return null
    e = nxt
    if (e === first) break
  }
  if (loop.length !== edges.size) return null // has a hole
  // Drop collinear corners.
  const corners = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length]
    return Math.abs(cross({ x: p.x - a.x, y: p.y - a.y }, { x: b.x - p.x, y: b.y - p.y })) > 1e-9
  })
  const j = 0.14
  const poly = corners.map((p) => ({ x: p.x + rand(-j, j), y: p.y + rand(-j, j) }))
  // Subdivide long edges so straights can get a slight curve, then round the corners.
  const sub: Vec[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    sub.push(a)
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const parts = Math.floor(L / 1.0)
    for (let k = 1; k < parts; k++) {
      const t = k / parts, w = rand(-0.08, 0.08)
      sub.push({ x: a.x + (b.x - a.x) * t + ((b.y - a.y) / L) * w, y: a.y + (b.y - a.y) * t - ((b.x - a.x) / L) * w })
    }
  }
  return chaikin(sub, 4)
}

function attempt(kind: TrackKind, W: number): Vec[] | null {
  const raw = kind === 'blob' ? blobShape() : kind === 'hull' ? hullShape() : blockShape()
  if (!raw || raw.length < 8) return null
  // Normalise the loop to a random lap length.
  let rough = 0
  for (let i = 0; i < raw.length; i++) rough += Math.hypot(raw[(i + 1) % raw.length].x - raw[i].x, raw[(i + 1) % raw.length].y - raw[i].y)
  const k = rand(TRACK.minLength, TRACK.maxLength) / rough
  const rot = rand(0, Math.PI * 2), c = Math.cos(rot), sn = Math.sin(rot)
  const scaled = raw.map((p) => ({ x: (p.x * c - p.y * sn) * k, y: (p.x * sn + p.y * c) * k }))
  let pts = resample(scaled, TRACK.spacing)
  // Smooth until every bend is wide enough to gallop round (or give up).
  // (Smoothing on a coarse copy rounds tight kinks far faster.)
  pts = resample(smooth(pts, 6), TRACK.spacing)
  for (let pass = 0; pass < 10 && minRadius(pts) < W * TRACK.minTurnRadius; pass++) {
    pts = resample(smooth(resample(pts, 60), 2), TRACK.spacing)
  }
  pts = resample(smooth(pts, 3), TRACK.spacing)
  if (pts.length < 40) return null
  if (minRadius(pts) < W * TRACK.minTurnRadius) return null
  if (tooClose(pts, W * 2 + 90, TRACK.spacing)) return null
  if (solidity(pts) > TRACK.maxSolidity) return null
  return pts
}

/** Rotate the loop so the start line sits on the straightest stretch (room for the grid). */
function startOnStraight(pts: Vec[]): Vec[] {
  const n = pts.length
  const turnAt = (i: number) => {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n]
    const u = { x: b.x - a.x, y: b.y - a.y }, v2 = { x: c.x - b.x, y: c.y - b.y }
    return Math.abs(Math.atan2(cross(u, v2), dot(u, v2)))
  }
  const turns = pts.map((_, i) => turnAt(i))
  const back = Math.ceil(340 / TRACK.spacing), fwd = Math.ceil(120 / TRACK.spacing)
  let best = 0, bestV = Infinity
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let k = -back; k <= fwd; k++) sum += turns[(i + k + n) % n]
    if (sum < bestV) { bestV = sum; best = i }
  }
  return pts.slice(best).concat(pts.slice(0, best))
}

export function generateTrack(): Track {
  const W = Math.round(rand(TRACK.minHalfWidth, TRACK.maxHalfWidth))
  const kinds: TrackKind[] = ['blob', 'hull', 'blocks']
  let pts: Vec[] | null = null
  let kind: TrackKind = kinds[randInt(0, 2)]
  // Stick with the chosen style for a while so every style shows up evenly.
  for (let tries = 0; tries < 300 && !pts; tries++) {
    if (tries > 0 && tries % 100 === 0) kind = kinds[randInt(0, 2)]
    pts = attempt(kind, W)
  }
  if (!pts) {
    // Fallback: a kidney bean always works.
    kind = 'blob'
    pts = []
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2
      const r = 1 - 0.35 * Math.max(0, Math.cos(a)) ** 3
      pts.push({ x: Math.cos(a) * 1300 * r, y: Math.sin(a) * 800 })
    }
    pts = resample(pts, TRACK.spacing)
  }
  // Make travel direction clockwise on screen (y down => positive signed area).
  if (polyArea(pts) < 0) pts.reverse()
  pts = startOnStraight(pts)
  const tr = buildTrack(pts, W)
  tr.kind = kind
  return tr
}

export function buildTrack(pts: Vec[], W: number = TRACK.halfWidth): Track {
  const n = pts.length
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
  return { pts, tan, nrm, cum, length: total, halfWidth: W, left, right, bounds, seed: Math.random(), kind: 'blob', solidity: solidity(pts) }
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
