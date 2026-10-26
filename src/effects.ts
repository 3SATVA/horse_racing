import { rand } from './math'

export interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; color: string
  kind: 'spark' | 'smoke' | 'debris' | 'dust' | 'boost'
}

export interface Decal { x: number; y: number; r: number; age: number }

export interface Ring { x: number; y: number; r: number; life: number }

/** Particles, screen flash and shake. Pure data; render.ts draws it. */
export class Effects {
  particles: Particle[] = []
  decals: Decal[] = []
  rings: Ring[] = []
  shake = 0
  flash = 0

  explode(x: number, y: number, intensity = 1) {
    const fire = ['#fff6c2', '#ffd23f', '#ff9a1f', '#ff5a1f', '#e8343a']
    for (let i = 0; i < 46 * intensity; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 520)
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.35, 0.9), max: 0.9, size: rand(4, 11), color: fire[(Math.random() * fire.length) | 0], kind: 'spark' })
    }
    for (let i = 0; i < 18 * intensity; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(20, 140)
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.9, 1.8), max: 1.8, size: rand(14, 30), color: 'rgba(60,55,50,', kind: 'smoke' })
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(150, 420)
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 1.1), max: 1.1, size: rand(3, 6), color: '#f4f1ea', kind: 'debris' })
    }
    this.rings.push({ x, y, r: 10, life: 0.5 })
    this.decals.push({ x, y, r: rand(34, 46), age: 0 })
    if (this.decals.length > 30) this.decals.shift()
  }

  dust(x: number, y: number, n = 2) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-30, 30), vy: rand(-30, 30), life: rand(0.3, 0.6), max: 0.6, size: rand(4, 8), color: 'rgba(196,160,110,', kind: 'dust' })
    }
  }

  boostTrail(x: number, y: number, color: string) {
    this.particles.push({ x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.45, max: 0.45, size: rand(7, 11), color, kind: 'boost' })
  }

  addShake(amount: number) { this.shake = Math.min(28, this.shake + amount) }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt
      p.x += p.vx * dt; p.y += p.vy * dt
      const drag = p.kind === 'smoke' ? 1.5 : p.kind === 'dust' ? 3 : 2.6
      p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt)
      if (p.kind === 'smoke') p.size += 18 * dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const r of this.rings) { r.life -= dt; r.r += 520 * dt }
    this.rings = this.rings.filter((r) => r.life > 0)
    for (const d of this.decals) d.age += dt
    this.shake = Math.max(0, this.shake - 40 * dt)
    this.flash = Math.max(0, this.flash - 2.4 * dt)
  }

  clear() { this.particles = []; this.decals = []; this.rings = []; this.shake = 0; this.flash = 0 }
}
