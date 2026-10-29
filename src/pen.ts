import type { Audio } from './audio'
import { HORSE_COLORS } from './config'
import { makeHorse, type Horse } from './horse'
import { rand, randInt } from './math'
import { drawHorseBody } from './sprites'

/** Clicks it takes to blow up a pen horse. */
export const PEN_CLICKS = 10
const SCALE = 0.72
const HALF_LEN = 31 * SCALE, HALF_W = 13 * SCALE // horse's footprint, for wall bounces
const HIT_R = 30
const RESPAWN_DELAY = 1.2

interface PenHorse { h: Horse; x: number; y: number; vx: number; vy: number; hits: number; flash: number; shake: number }
interface Bit { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'fire' | 'smoke' | 'debris' | 'star' }

/**
 * The horse pen on the main menu: 1-5 horses bounce around like the old DVD logo.
 * Click one 10 times and it explodes; when the pen is empty a new batch trots in.
 */
export class Pen {
  horses: PenHorse[] = []
  bits: Bit[] = []
  exploded = 0
  batches = 0
  respawnIn = 0
  private ctx: CanvasRenderingContext2D
  private w = 300
  private hgt = 160
  private shake = 0
  private time = 0
  private fenceInset = 12

  constructor(public canvas: HTMLCanvasElement, private audio: Audio) {
    this.ctx = canvas.getContext('2d')!
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      audio.unlock()
      const r = canvas.getBoundingClientRect()
      this.click(e.clientX - r.left, e.clientY - r.top)
    })
    this.resize()
    this.spawn()
  }

  resize() {
    const r = this.canvas.getBoundingClientRect()
    if (r.width < 10 || r.height < 10) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = r.width; this.hgt = r.height
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr)
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Keep everyone inside after a resize.
    for (const p of this.horses) { p.x = Math.min(Math.max(p.x, this.minX()), this.maxX()); p.y = Math.min(Math.max(p.y, this.minY()), this.maxY()) }
  }

  private minX() { return this.fenceInset + HALF_LEN }
  private maxX() { return this.w - this.fenceInset - HALF_LEN }
  private minY() { return this.fenceInset + HALF_LEN * 0.7 }
  private maxY() { return this.hgt - this.fenceInset - HALF_W - 6 }

  spawn(n = randInt(1, 5)) {
    this.batches++
    const cols = [...HORSE_COLORS].sort(() => Math.random() - 0.5)
    this.horses = []
    for (let i = 0; i < n; i++) {
      const h = makeHorse(i + 1, 'pen', cols[i % cols.length], false)
      const sp = rand(80, 130)
      const ang = unAxis(rand(0, Math.PI * 2))
      this.horses.push({
        h, x: rand(this.minX(), Math.max(this.minX(), this.maxX())), y: rand(this.minY(), Math.max(this.minY(), this.maxY())),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, hits: 0, flash: 0, shake: 0,
      })
    }
  }

  /** Click at pen-local CSS pixels. Returns the index hit or -1. */
  click(x: number, y: number): number {
    let best = -1, bd = HIT_R
    this.horses.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i } })
    if (best < 0) return -1
    const p = this.horses[best]
    p.hits++
    p.flash = 0.12
    p.shake = 0.22
    // Hitting it makes it bolt a bit faster.
    const sp = Math.hypot(p.vx, p.vy)
    const k = Math.min(1.08, 220 / sp)
    p.vx *= k; p.vy *= k
    // Same tiny neutral boop on every click: nothing hints at what the 10th does.
    if (p.hits >= PEN_CLICKS) this.explode(best)
    else this.audio.bump(0.35)
    return best
  }

  private bit(x: number, y: number, kind: Bit['kind'], speed: number, color?: string) {
    const a = rand(0, Math.PI * 2)
    const fire = ['#fff6c2', '#ffd23f', '#ff9a1f', '#ff5a1f', '#e8343a']
    const max = kind === 'smoke' ? rand(0.8, 1.4) : kind === 'star' ? rand(0.25, 0.45) : rand(0.4, 0.9)
    this.bits.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: max, max,
      size: kind === 'smoke' ? rand(8, 16) : kind === 'debris' ? rand(3, 6) : kind === 'star' ? 2.5 : rand(2, 5),
      color: color ?? (kind === 'smoke' ? '#555' : kind === 'star' ? '#fff' : fire[randInt(0, fire.length - 1)]), kind,
    })
  }

  private explode(i: number) {
    const p = this.horses[i]
    for (let k = 0; k < 60; k++) this.bit(p.x, p.y, 'fire', rand(60, 340))
    for (let k = 0; k < 14; k++) this.bit(p.x, p.y, 'smoke', rand(20, 90))
    for (let k = 0; k < 16; k++) this.bit(p.x, p.y, 'debris', rand(80, 260), [p.h.colors.coat, p.h.colors.mane, p.h.colors.silk][k % 3])
    this.shake = 0.4
    this.audio.explosion(0.8)
    this.audio.whoosh()
    this.horses.splice(i, 1)
    this.exploded++
    if (!this.horses.length) this.respawnIn = RESPAWN_DELAY
  }

  update(dt: number) {
    this.time += dt
    if (this.respawnIn > 0) { this.respawnIn -= dt; if (this.respawnIn <= 0) this.spawn() }
    const hs = this.horses
    for (const p of hs) {
      p.x += p.vx * dt; p.y += p.vy * dt
      // DVD-logo walls.
      if (p.x < this.minX()) { p.x = this.minX(); p.vx = Math.abs(p.vx) }
      if (p.x > this.maxX()) { p.x = this.maxX(); p.vx = -Math.abs(p.vx) }
      if (p.y < this.minY()) { p.y = this.minY(); p.vy = Math.abs(p.vy) }
      if (p.y > this.maxY()) { p.y = this.maxY(); p.vy = -Math.abs(p.vy) }
      p.flash = Math.max(0, p.flash - dt); p.shake = Math.max(0, p.shake - dt)
      p.h.fwdSpeed = Math.hypot(p.vx, p.vy) * 2
      p.h.gait += dt * (2 + p.h.fwdSpeed / 28)
    }
    // Horses bounce off each other too (equal mass, elastic).
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const a = hs[i], b = hs[j]
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = 30
      if (d >= min || d === 0) continue
      const nx = dx / d, ny = dy / d
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
      const push = (min - d) / 2
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push
      if (rel > 0) {
        const sa = Math.hypot(a.vx, a.vy), sb = Math.hypot(b.vx, b.vy)
        a.vx -= rel * nx; a.vy -= rel * ny; b.vx += rel * nx; b.vy += rel * ny
        // DVD-style: each keeps its own constant speed, and never ends up stuck on a straight up/down or side-to-side line.
        for (const [p, sp] of [[a, sa], [b, sb]] as const) {
          let ang = Math.atan2(p.vy, p.vx)
          ang = unAxis(ang)
          p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp
        }
      }
    }
    for (const p of hs) p.h.heading = Math.atan2(p.vy, p.vx)
    for (const b of this.bits) {
      b.life -= dt
      b.x += b.vx * dt; b.y += b.vy * dt
      const drag = b.kind === 'smoke' ? 1.5 : 3
      b.vx *= Math.exp(-drag * dt); b.vy *= Math.exp(-drag * dt)
      if (b.kind === 'smoke') { b.size += dt * 14; b.vy -= dt * 20 }
    }
    this.bits = this.bits.filter((b) => b.life > 0)
    this.shake = Math.max(0, this.shake - dt)
  }

  draw() {
    const ctx = this.ctx, w = this.w, h = this.hgt
    ctx.save()
    ctx.clearRect(0, 0, w, h)
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake * 14, rand(-1, 1) * this.shake * 14)
    // Dirt floor with straw.
    const inset = this.fenceInset
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#c99a5b'); g.addColorStop(1, '#a8773f')
    ctx.fillStyle = g
    roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill()
    ctx.strokeStyle = 'rgba(255,230,150,0.35)'; ctx.lineWidth = 1.5
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97.3) % (w - 30) + 15, sy = (i * 53.7) % (h - 30) + 15, a = i * 1.7
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7); ctx.stroke()
    }
    // Wooden fence: two rails and posts.
    for (const [lw, col, off] of [[8, '#5e3b1a', 0], [4, '#9c6a37', -1]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = lw
      roundRect(ctx, inset / 2 + off, inset / 2 + off, w - inset, h - inset, 10); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(94,59,26,0.6)'; ctx.lineWidth = 3
    roundRect(ctx, inset + 3, inset + 3, w - inset * 2 - 6, h - inset * 2 - 6, 8); ctx.stroke()
    ctx.fillStyle = '#4a2d12'
    const posts = Math.max(4, Math.round(w / 70))
    for (let i = 0; i <= posts; i++) {
      const x = inset / 2 + (w - inset) * i / posts
      ctx.fillRect(x - 4, inset / 2 - 5, 8, 10); ctx.fillRect(x - 4, h - inset / 2 - 5, 8, 10)
    }
    for (let i = 1; i < 3; i++) {
      const y = inset / 2 + (h - inset) * i / 3
      ctx.fillRect(inset / 2 - 5, y - 4, 10, 8); ctx.fillRect(w - inset / 2 - 5, y - 4, 10, 8)
    }

    // Horses.
    for (const p of [...this.horses].sort((a, b) => a.y - b.y)) {
      ctx.save()
      // Click feedback: a quick squish-and-spring (no damage marks).
      const q = p.shake > 0 ? Math.sin((p.shake / 0.22) * Math.PI) * 0.18 : 0
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 5, 20, 10, p.h.heading, 0, Math.PI * 2); ctx.fill()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.h.heading)
      ctx.scale(SCALE * (1 + q), SCALE * (1 - q))
      drawHorseBody(ctx, p.h)
      if (p.flash > 0) {
        ctx.globalCompositeOperation = 'source-atop'
        ctx.fillStyle = `rgba(255,255,255,${p.flash / 0.12 * 0.45})`
        ctx.fillRect(-40, -25, 80, 50)
      }
      ctx.restore()
    }
    // Explosion bits.
    for (const b of this.bits) {
      const a = Math.max(0, b.life / b.max)
      ctx.globalAlpha = b.kind === 'smoke' ? a * 0.5 : a
      ctx.fillStyle = b.color
      if (b.kind === 'debris') ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size)
      else { ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill() }
    }
    ctx.globalAlpha = 1
    if (!this.horses.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('New horses incoming…', w / 2, h / 2)
    }
    ctx.restore()
  }

  /** For tests: horse positions in page coordinates. */
  debug() {
    const r = this.canvas.getBoundingClientRect()
    return {
      count: this.horses.length, exploded: this.exploded, batches: this.batches, respawnIn: this.respawnIn,
      horses: this.horses.map((p) => ({ x: p.x, y: p.y, px: r.left + p.x, py: r.top + p.y, vx: p.vx, vy: p.vy, hits: p.hits, heading: p.h.heading })),
      w: this.w, h: this.hgt,
    }
  }
}

/** Keep an angle at least ~20 degrees off the horizontal and vertical so bounces look lively. */
function unAxis(a: number) {
  const q = Math.PI / 2
  const m = ((a % q) + q) % q // 0..q within the quadrant
  const lim = 0.35
  if (m < lim) return a + (lim - m)
  if (m > q - lim) return a - (m - (q - lim))
  return a
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
