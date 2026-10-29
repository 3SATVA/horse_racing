import type { Item } from './abilities'
import type { Horse } from './horse'

/** Draw ability objects in world space. Banana peels go under horses (`ground`), the rest over. */
export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], horses: Horse[], player: Horse, time: number, ground: boolean) {
  for (const it of items) {
    if ((it.kind === 'banana') !== ground) continue
    switch (it.kind) {
      case 'banana': drawBanana(ctx, it.pos.x, it.pos.y, it.heading, time); break
      case 'ball': drawBall(ctx, it.pos.x, it.pos.y, it.r, it.spin); break
      case 'fireball': drawFireball(ctx, it.pos.x, it.pos.y, it.r, time, Math.atan2(it.vel.y, it.vel.x)); break
      case 'roomba': drawRoomba(ctx, it.pos.x, it.pos.y, it.r, it.heading, time); break
      case 'hook': {
        const h = horses[it.target]
        if (it.done && it.t > 0.6) break
        drawRope(ctx, player.pos.x, player.pos.y, h.pos.x, h.pos.y - h.z * 0.7, time)
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
