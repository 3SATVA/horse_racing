import { HORSE, TRACK } from './config'
import type { Effects } from './effects'
import type { Horse } from './horse'
import type { DragState } from './input'
import { clamp, type Vec } from './math'
import { drawHorseBody } from './sprites'
import type { Track } from './track'

export interface Camera { x: number; y: number; zoom: number }

export interface RenderInput {
  track: Track
  horses: Horse[]
  player: Horse
  fx: Effects
  drag: DragState | null
  maxDrag: number
  time: number
  showArrow: boolean
}

interface TrackCache { track: Track; posts: Vec[] }

export class Renderer {
  ctx: CanvasRenderingContext2D
  w = 0
  h = 0
  dpr = 1
  cam: Camera = { x: 0, y: 0, zoom: 1 }
  private cache: TrackCache | null = null

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120))
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = this.h + 'px'
  }

  /** World units visible across the short side of the screen. */
  private baseZoom() {
    const m = Math.min(this.w, this.h)
    return clamp(m / 620, 0.5, 1.35)
  }

  snapCamera(p: Horse) {
    this.cam = { x: p.pos.x, y: p.pos.y, zoom: this.baseZoom() }
  }

  updateCamera(p: Horse, dt: number) {
    const lead = 0.38
    const tx = p.pos.x + p.vel.x * lead, ty = p.pos.y + p.vel.y * lead
    const k = 1 - Math.exp(-5 * dt)
    this.cam.x += (tx - this.cam.x) * k
    this.cam.y += (ty - this.cam.y) * k
    // Pull back a little at speed.
    const speedFrac = clamp(Math.abs(p.fwdSpeed) / HORSE.topSpeed, 0, 1)
    const tz = this.baseZoom() * (1 - 0.12 * speedFrac)
    this.cam.zoom += (tz - this.cam.zoom) * (1 - Math.exp(-2 * dt))
  }

  private buildCache(tr: Track): TrackCache {
    const posts: Vec[] = []
    for (const edge of [tr.left, tr.right]) {
      let acc = 0
      for (let i = 0; i < edge.length; i++) {
        const a = edge[i], b = edge[(i + 1) % edge.length]
        acc += Math.hypot(b.x - a.x, b.y - a.y)
        if (acc >= TRACK.postSpacing) { acc = 0; posts.push(a) }
      }
    }
    return { track: tr, posts }
  }

  draw(r: RenderInput) {
    const { ctx, cam } = this
    if (!this.cache || this.cache.track !== r.track) this.cache = this.buildCache(r.track)
    const shakeX = (Math.random() - 0.5) * r.fx.shake, shakeY = (Math.random() - 0.5) * r.fx.shake
    const z = cam.zoom
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = '#4e9a3a'
    ctx.fillRect(0, 0, this.w, this.h)

    // World space.
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - cam.x * z + shakeX), this.dpr * (this.h / 2 - cam.y * z + shakeY))
    const viewW = this.w / z, viewH = this.h / z
    const vx0 = cam.x - viewW / 2 - 60, vy0 = cam.y - viewH / 2 - 60, vx1 = cam.x + viewW / 2 + 60, vy1 = cam.y + viewH / 2 + 60

    // Mowed grass stripes.
    ctx.fillStyle = '#56a542'
    const band = 140
    for (let x = Math.floor(vx0 / (band * 2)) * band * 2; x < vx1; x += band * 2) ctx.fillRect(x, vy0, band, vy1 - vy0)

    this.drawTrack(r.track)

    // Scorch marks from explosions.
    for (const d of r.fx.decals) {
      const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r)
      g.addColorStop(0, 'rgba(25,18,12,0.7)')
      g.addColorStop(1, 'rgba(25,18,12,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill()
    }

    // Dust behind feet.
    for (const p of r.fx.particles) if (p.kind === 'dust') this.drawParticle(p)

    const sorted = [...r.horses].sort((a, b) => (a.z > 0 ? 1 : 0) - (b.z > 0 ? 1 : 0) || a.pos.y - b.pos.y)
    for (const h of sorted) this.drawHorse(h, h === r.player, r.time)

    for (const p of r.fx.particles) if (p.kind !== 'dust') this.drawParticle(p)
    for (const ring of r.fx.rings) {
      ctx.strokeStyle = `rgba(255,240,200,${ring.life * 1.6})`
      ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke()
    }

    // Screen space.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    if (r.fx.flash > 0) {
      ctx.fillStyle = `rgba(255,236,190,${Math.min(0.75, r.fx.flash)})`
      ctx.fillRect(0, 0, this.w, this.h)
    }
    this.drawOffscreenArrows(r)
    if (r.showArrow && r.drag && r.drag.active) this.drawDragArrow(r.drag, r.maxDrag)
    this.drawMinimap(r)
  }

  private strokeLoop(pts: Vec[]) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
  }

  private drawTrack(tr: Track) {
    const ctx = this.ctx
    const W = tr.halfWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // Grass verge, then dirt.
    this.strokeLoop(tr.pts)
    ctx.strokeStyle = '#3d7d2e'
    ctx.lineWidth = W * 2 + 40
    ctx.stroke()
    ctx.strokeStyle = '#b98b57'
    ctx.lineWidth = W * 2
    ctx.stroke()
    ctx.strokeStyle = '#c99c66'
    ctx.lineWidth = W * 1.3
    ctx.stroke()
    // Lane guides.
    ctx.setLineDash([26, 30])
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.setLineDash([])

    // Start / finish line (checkered).
    const p = tr.pts[0], n = tr.nrm[0], t = tr.tan[0]
    const sq = (W * 2) / 10
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 10; k++) {
        const off = -W + k * sq
        const cx = p.x + n.x * off + t.x * row * sq, cy = p.y + n.y * off + t.y * row * sq
        ctx.fillStyle = (k + row) % 2 ? '#111' : '#fafafa'
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + n.x * sq, cy + n.y * sq)
        ctx.lineTo(cx + n.x * sq + t.x * sq, cy + n.y * sq + t.y * sq)
        ctx.lineTo(cx + t.x * sq, cy + t.y * sq)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Fences: rail + posts on both sides.
    for (const edge of [tr.left, tr.right]) {
      this.strokeLoop(edge)
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 8
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.stroke()
    }
    ctx.fillStyle = '#e9e4da'
    ctx.strokeStyle = '#6b6257'
    ctx.lineWidth = 1.5
    for (const q of this.cache!.posts) {
      ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }

  private drawParticle(p: { x: number; y: number; size: number; life: number; max: number; color: string; kind: string }) {
    const ctx = this.ctx
    const a = Math.max(0, p.life / p.max)
    if (p.kind === 'smoke' || p.kind === 'dust') ctx.fillStyle = p.color + (a * (p.kind === 'smoke' ? 0.55 : 0.5)).toFixed(3) + ')'
    else { ctx.globalAlpha = a; ctx.fillStyle = p.color }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 'spark' ? 0.4 + a * 0.6 : 1), 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  private drawHorse(h: Horse, isPlayer: boolean, time: number) {
    const ctx = this.ctx
    // Shadow on the ground.
    ctx.fillStyle = `rgba(0,0,0,${h.z > 0 ? 0.18 : 0.28})`
    ctx.beginPath()
    ctx.ellipse(h.pos.x + 4, h.pos.y + 6, 26 * (1 - Math.min(0.4, h.z / 200)), 13, h.heading, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    const lift = h.z
    const s = 1 + lift / 140
    ctx.translate(h.pos.x, h.pos.y - lift * 0.7)
    ctx.scale(s, s)
    if (isPlayer && h.state === 'normal') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.rotate(h.heading)
    if (h.state === 'stunned') ctx.rotate(Math.PI / 2 * 0.25) // slumped
    if (h.recoverTimer > 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.45
    drawHorseBody(ctx, h)
    ctx.restore()

    if (h.state === 'stunned') this.drawStun(h, time)

    // Name tag.
    ctx.font = '700 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const label = isPlayer ? 'YOU' : h.name
    const y = h.pos.y - 34 - h.z * 0.7
    ctx.lineWidth = 3.5
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.strokeText(label, h.pos.x, y)
    ctx.fillStyle = isPlayer ? '#fff36b' : '#ffffff'
    ctx.fillText(label, h.pos.x, y)
  }

  private drawStun(h: Horse, time: number) {
    const ctx = this.ctx
    const frac = h.stunTimer / HORSE.stunSeconds
    // Countdown ring.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(h.pos.x, h.pos.y, 30, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#ffd23f'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(h.pos.x, h.pos.y, 30, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke()
    // Dizzy stars.
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * Math.PI * 2) / 3
      this.star(h.pos.x + Math.cos(a) * 20, h.pos.y - 22 + Math.sin(a) * 7, 6)
    }
    ctx.font = '800 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    const txt = `STUNNED ${h.stunTimer.toFixed(1)}`
    ctx.strokeText(txt, h.pos.x, h.pos.y + 44)
    ctx.fillStyle = '#ffd23f'
    ctx.fillText(txt, h.pos.x, h.pos.y + 44)
  }

  private star(x: number, y: number, r: number) {
    const ctx = this.ctx
    ctx.fillStyle = '#fff36b'
    ctx.strokeStyle = '#a26b00'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r
      i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }

  private drawDragArrow(d: DragState, maxDrag: number) {
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(d.ox, d.oy, maxDrag, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath(); ctx.arc(d.ox, d.oy, 9, 0, Math.PI * 2); ctx.fill()
    const len = Math.max(18, d.power * maxDrag)
    const ex = d.ox + Math.cos(d.angle) * len, ey = d.oy + Math.sin(d.angle) * len
    const hue = 120 - d.power * 120
    const col = `hsl(${hue},90%,55%)`
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(d.ox, d.oy); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.strokeStyle = col
    ctx.lineWidth = 8
    ctx.beginPath(); ctx.moveTo(d.ox, d.oy); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.fillStyle = col
    ctx.save()
    ctx.translate(ex, ey)
    ctx.rotate(d.angle)
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-6, -14); ctx.lineTo(-6, 14); ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.restore()
    ctx.font = '800 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.fillText(`${Math.round(d.power * 100)}%`, d.ox, d.oy - maxDrag - 8)
  }

  /** Little arrows at the screen edge pointing to nearby off-screen rivals. */
  private drawOffscreenArrows(r: RenderInput) {
    const ctx = this.ctx
    const z = this.cam.zoom
    for (const h of r.horses) {
      if (h === r.player) continue
      const sx = this.w / 2 + (h.pos.x - this.cam.x) * z, sy = this.h / 2 + (h.pos.y - this.cam.y) * z
      if (sx > 0 && sx < this.w && sy > 0 && sy < this.h) continue
      const dx = sx - this.w / 2, dy = sy - this.h / 2
      const d = Math.hypot(dx, dy)
      if (d / z > 900) continue
      const m = 26
      const k = Math.min((this.w / 2 - m) / Math.abs(dx || 1e-6), (this.h / 2 - m) / Math.abs(dy || 1e-6))
      const ax = this.w / 2 + dx * k, ay = this.h / 2 + dy * k
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(Math.atan2(dy, dx))
      ctx.fillStyle = h.colors.silk
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.restore()
    }
  }

  private drawMinimap(r: RenderInput) {
    const ctx = this.ctx
    const tr = r.track
    const size = Math.min(150, Math.max(96, Math.min(this.w, this.h) * 0.24))
    const pad = 10
    const bw = tr.bounds.maxX - tr.bounds.minX, bh = tr.bounds.maxY - tr.bounds.minY
    const k = (size - 16) / Math.max(bw, bh)
    const boxW = bw * k + 16, boxH = bh * k + 16
    const x0 = this.w - boxW - pad - (this.safeRight || 0), y0 = this.h - boxH - pad - (this.safeBottom || 0)
    ctx.fillStyle = 'rgba(10,30,15,0.55)'
    ctx.beginPath(); ctx.roundRect(x0, y0, boxW, boxH, 10); ctx.fill()
    const tx = (x: number) => x0 + 8 + (x - tr.bounds.minX) * k
    const ty = (y: number) => y0 + 8 + (y - tr.bounds.minY) * k
    ctx.strokeStyle = '#d8b07c'
    ctx.lineWidth = Math.max(3, tr.halfWidth * 2 * k)
    ctx.lineJoin = 'round'
    ctx.beginPath()
    tr.pts.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), ty(p.y)) : ctx.moveTo(tx(p.x), ty(p.y))))
    ctx.closePath(); ctx.stroke()
    const s0 = tr.pts[0], n0 = tr.nrm[0]
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(tx(s0.x + n0.x * tr.halfWidth), ty(s0.y + n0.y * tr.halfWidth)); ctx.lineTo(tx(s0.x - n0.x * tr.halfWidth), ty(s0.y - n0.y * tr.halfWidth)); ctx.stroke()
    for (const h of r.horses) {
      ctx.fillStyle = h.colors.silk
      ctx.strokeStyle = h === r.player ? '#fff36b' : '#fff'
      ctx.lineWidth = h === r.player ? 2.5 : 1.2
      ctx.beginPath(); ctx.arc(tx(h.pos.x), ty(h.pos.y), h === r.player ? 5 : 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }

  safeRight = 0
  safeBottom = 0
}
