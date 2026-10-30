import type { Item } from './abilities'
import type { Horse } from './horse'

/** Draw ability objects in world space. Banana peels go under horses (`ground`), the rest over. */
export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], horses: Horse[], _player: Horse, time: number, ground: boolean) {
  for (const it of items) {
    if (it.kind === 'papaya') {
      if (ground) drawPapayaTarget(ctx, it.to.x, it.to.y, it.r, it.t, it.done, time)
      else if (!it.done) drawPapaya(ctx, it.pos.x, it.pos.y, it.z, it.t)
      continue
    }
    if ((it.kind === 'banana') !== ground) continue
    switch (it.kind) {
      case 'emp': drawEmp(ctx, it.pos.x, it.pos.y, it.r, it.t / it.life); break
      case 'hay': {
        const fade = Math.min(1, (it.life - it.t) / 0.4)
        it.pts.forEach((q, k) => drawHay(ctx, q.x, q.y, time * 2 + k * 2.1, fade))
        break
      }
      case 'banana': drawBanana(ctx, it.pos.x, it.pos.y, it.heading, time); break
      case 'ball': drawBall(ctx, it.pos.x, it.pos.y, it.r, it.spin); break
      case 'fireball': drawFireball(ctx, it.pos.x, it.pos.y, it.r, time, Math.atan2(it.vel.y, it.vel.x)); break
      case 'roomba': drawRoomba(ctx, it.pos.x, it.pos.y, it.r, it.heading, time); break
      case 'hook': {
        const h = horses[it.target]
        if (it.done && (it.result === 'hit' || it.t > 0.25)) break
        const o = horses[it.owner]
        if (it.done) ctx.globalAlpha = 1 - it.t / 0.25 // snapped rope fades out
        drawRope(ctx, o.pos.x, o.pos.y, h.pos.x, h.pos.y - h.z * 0.7, time)
        ctx.globalAlpha = 1
        break
      }
    }
  }
}

export function drawBanana(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  // Danger glow so you can see it coming.
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30)
  g.addColorStop(0, `rgba(255,240,80,${0.35 + 0.15 * Math.sin(time * 8)})`)
  g.addColorStop(1, 'rgba(255,240,80,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffd93b'; ctx.strokeStyle = '#6b4a00'; ctx.lineWidth = 2
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.rotate(k * Math.PI / 2 + 0.3)
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(12, -6, 20, 2); ctx.quadraticCurveTo(10, 4, 0, 0); ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = '#7a5a12'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(x + 4, y + 6, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(x, y)
  ctx.rotate(spin)
  // Spikes.
  ctx.fillStyle = '#c9ced6'; ctx.strokeStyle = '#30343a'; ctx.lineWidth = 1.5
  for (let k = 0; k < 10; k++) {
    const a = k * Math.PI / 5
    ctx.beginPath()
    ctx.moveTo(Math.cos(a - 0.22) * r * 0.9, Math.sin(a - 0.22) * r * 0.9)
    ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6)
    ctx.lineTo(Math.cos(a + 0.22) * r * 0.9, Math.sin(a + 0.22) * r * 0.9)
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#111'
  const pent = (cx: number, cy: number, s: number) => {
    ctx.beginPath()
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s) }
    ctx.closePath(); ctx.fill()
  }
  pent(0, 0, r * 0.38)
  for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 + Math.PI / 2; pent(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.25) }
  ctx.restore()
}

export function drawFireball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, dir: number) {
  ctx.save()
  ctx.translate(x, y)
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.6)
  g.addColorStop(0, 'rgba(255,255,220,1)')
  g.addColorStop(0.25, 'rgba(255,210,60,0.95)')
  g.addColorStop(0.55, 'rgba(255,110,20,0.7)')
  g.addColorStop(1, 'rgba(220,30,0,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2); ctx.fill()
  // Flickering tail.
  ctx.rotate(dir + Math.PI)
  for (let k = 0; k < 3; k++) {
    const f = Math.sin(time * 30 + k * 2) * 4
    ctx.fillStyle = ['rgba(255,80,0,0.6)', 'rgba(255,170,0,0.6)', 'rgba(255,240,150,0.7)'][k]
    ctx.beginPath()
    ctx.moveTo(0, -r * (1 - k * 0.25))
    ctx.quadraticCurveTo(r * 2.2, f, r * (3.2 - k * 0.7), f * 0.5)
    ctx.quadraticCurveTo(r * 2.2, f, 0, r * (1 - k * 0.25))
    ctx.fill()
  }
  ctx.restore()
}

export function drawRoomba(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, heading: number, time: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath(); ctx.ellipse(x + 3, y + 5, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(x, y)
  ctx.rotate(heading)
  // Knife sticking out the front.
  ctx.fillStyle = '#5a3a1c'; ctx.fillRect(r - 4, -4, 12, 8)
  ctx.fillStyle = '#e8edf2'; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(r + 8, -6); ctx.lineTo(r + 40, -1); ctx.lineTo(r + 8, 6); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(r + 10, -3); ctx.lineTo(r + 34, -1); ctx.stroke()
  // Body.
  const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, r)
  g.addColorStop(0, '#6d7480'); g.addColorStop(1, '#22262c')
  ctx.fillStyle = g; ctx.strokeStyle = '#111'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke()
  // Angry red eye.
  ctx.fillStyle = Math.floor(time * 6) % 2 ? '#ff2a2a' : '#8a0000'
  ctx.beginPath(); ctx.arc(r * 0.45, 0, 4, 0, Math.PI * 2); ctx.fill()
  // Spinning side brush.
  ctx.strokeStyle = '#c9a14a'; ctx.lineWidth = 1.5
  for (let k = 0; k < 3; k++) {
    const a = time * 20 + k * 2.1
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.7); ctx.lineTo(r * 0.7 + Math.cos(a) * 12, r * 0.7 + Math.sin(a) * 12); ctx.stroke()
  }
  ctx.restore()
}

export function drawRope(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, time: number) {
  ctx.save()
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 14 * Math.sin(time * 25)
  ctx.strokeStyle = '#5b3a17'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke()
  ctx.strokeStyle = '#c89a5a'; ctx.lineWidth = 2; ctx.setLineDash([6, 5])
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke()
  ctx.setLineDash([])
  // Hook.
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.translate(x2, y2); ctx.rotate(a)
  ctx.strokeStyle = '#d8dde3'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(0, 0, 10, -Math.PI / 2, Math.PI / 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI / 2, Math.PI * 1.5, false); ctx.stroke()
  ctx.restore()
}

/** EMP: a fast electric shockwave out to the full radius, plus a faint filled disc showing the area. */
export function drawEmp(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, f: number) {
  ctx.save()
  const r = R * Math.min(1, 0.25 + f * 1.4)
  const a = Math.max(0, 1 - f)
  ctx.fillStyle = `rgba(90,200,255,${0.22 * a})`
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill()
  ctx.shadowColor = '#40c8ff'; ctx.shadowBlur = 18
  ctx.strokeStyle = `rgba(160,235,255,${0.95 * a})`; ctx.lineWidth = 7
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.lineWidth = 2
  ctx.beginPath()
  for (let k = 0; k <= 48; k++) { const t = k / 48 * Math.PI * 2, rr = r * (0.86 + Math.random() * 0.12); ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) }
  ctx.stroke()
  ctx.restore()
}

/** A sharp hay bundle: straw body tied with twine, sharp spikes poking out. */
export function drawHay(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 13, 8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(x, y); ctx.rotate(rot)
  ctx.strokeStyle = '#6b4a10'; ctx.lineWidth = 1.5; ctx.fillStyle = '#f3d36b'
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4
    ctx.beginPath()
    ctx.moveTo(Math.cos(a - 0.25) * 9, Math.sin(a - 0.25) * 9)
    ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21)
    ctx.lineTo(Math.cos(a + 0.25) * 9, Math.sin(a + 0.25) * 9)
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 12)
  g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#c99a2e')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#a37a22'; ctx.lineWidth = 1
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-11, k * 3.4); ctx.lineTo(11, k * 3.4); ctx.stroke() }
  ctx.strokeStyle = '#8b2d1a'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(-3, -10); ctx.lineTo(-3, 10); ctx.moveTo(4, -10); ctx.lineTo(4, 10); ctx.stroke()
  ctx.restore()
}

/** The papaya in the air: shadow on the ground under it, fruit lifted by its arc height. */
export function drawPapaya(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, t: number) {
  ctx.save()
  const s = 1 + z / 220
  ctx.fillStyle = `rgba(0,0,0,${0.32 - z / 1000})`
  ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 16 / s, 9 / s, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(x, y - z * 0.7)
  ctx.scale(s, s)
  ctx.rotate(t * 7)
  const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 20)
  g.addColorStop(0, '#ffd27a'); g.addColorStop(0.5, '#ff9a2e'); g.addColorStop(1, '#5f8f2a')
  ctx.fillStyle = g; ctx.strokeStyle = '#3d5a18'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Fuse.
  ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(19, 0); ctx.quadraticCurveTo(26, -6, 28, -12); ctx.stroke()
  ctx.fillStyle = Math.floor(t * 20) % 2 ? '#fff36b' : '#ff5a1f'
  ctx.beginPath(); ctx.arc(28, -13, 4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/** Landing marker: red blast-radius ring + crosshair, filling up as the papaya comes down. */
export function drawPapayaTarget(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, done: boolean, time: number) {
  if (done) return
  ctx.save()
  const f = Math.min(1, t / 2)
  ctx.fillStyle = `rgba(255,60,30,${0.1 + 0.18 * f})`
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = `rgba(255,60,30,${0.18 + 0.1 * Math.sin(time * 16)})`
  ctx.beginPath(); ctx.arc(x, y, r * f, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(255,240,220,0.95)'; ctx.lineWidth = 4; ctx.setLineDash([16, 10])
  ctx.lineDashOffset = -time * 40
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = '#d8231a'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y); ctx.moveTo(x, y - 22); ctx.lineTo(x, y + 22); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

/** Aim mode: throw range around the player, and the landing spot under the mouse (if any). */
export function drawAim(ctx: CanvasRenderingContext2D, p: Horse, aim: { range: number; radius: number; at: { x: number; y: number } | null }, time: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,180,70,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]); ctx.lineDashOffset = time * 30
  ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, aim.range, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  if (aim.at) {
    const { x, y } = aim.at
    ctx.strokeStyle = 'rgba(255,200,120,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([6, 8])
    ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.quadraticCurveTo((p.pos.x + x) / 2, (p.pos.y + y) / 2 - 140, x, y); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,120,40,0.18)'
    ctx.beginPath(); ctx.arc(x, y, aim.radius, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(x, y, aim.radius, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.lineTo(x + 26, y); ctx.moveTo(x, y - 26); ctx.lineTo(x, y + 26); ctx.stroke()
  }
  ctx.restore()
}

