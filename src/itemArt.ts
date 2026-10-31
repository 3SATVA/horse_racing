import type { Item } from './abilities'
import { ABILITY } from './config'
import type { Horse } from './horse'

/** Draw ability objects in world space. Banana peels go under horses (`ground`), the rest over. */
export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], horses: Horse[], _player: Horse, time: number, ground: boolean) {
  for (const it of items) {
    if (it.kind === 'papaya') {
      if (ground) drawPapayaTarget(ctx, it.to.x, it.to.y, it.r, it.t, it.done, time)
      else if (!it.done) drawPapaya(ctx, it.pos.x, it.pos.y, it.z, it.t)
      continue
    }
    if (it.kind === 'nade') {
      if (ground) { if (!it.done) drawNadeTarget(ctx, it.to.x, it.to.y, it.r, it.t, time) }
      else if (!it.done) drawNade(ctx, it.pos.x, it.pos.y, it.z, it.t)
      else drawLightning(ctx, it, horses, time)
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
      case 'robot': if (!it.hits) drawRobotHorse(ctx, it.pos.x, it.pos.y, it.heading, it.gait, time); break
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
  ctx.scale(ABILITY.bananaArtScale, ABILITY.bananaArtScale)
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
  const f = Math.min(1, t / ABILITY.papayaFlight)
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
export function drawAim(ctx: CanvasRenderingContext2D, p: Horse, aim: { range: number; radius: number; electric?: boolean; at: { x: number; y: number } | null }, time: number) {
  ctx.save()
  if (aim.electric) {
    // Electricity-nade: blue, flat, fast throw.
    ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]); ctx.lineDashOffset = time * 30
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, aim.range, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    if (aim.at) {
      const { x, y } = aim.at
      ctx.strokeStyle = 'rgba(160,220,255,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([6, 8])
      ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.quadraticCurveTo((p.pos.x + x) / 2, (p.pos.y + y) / 2 - 50, x, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(80,170,255,0.2)'
      ctx.beginPath(); ctx.arc(x, y, aim.radius, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#7cd0ff'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.arc(x, y, aim.radius, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.moveTo(x, y - 20); ctx.lineTo(x, y + 20); ctx.stroke()
    }
    ctx.restore()
    return
  }
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


/** Robot Horse: a chrome horse with a glowing red visor, legs ticking like pistons. */
export function drawRobotHorse(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, gait: number, time: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(x + 4, y + 6, 26, 12, heading, 0, Math.PI * 2); ctx.fill()
  ctx.translate(x, y)
  ctx.rotate(heading)
  const bob = Math.sin(gait) * 1.2
  // Legs: four steel pistons swinging.
  ctx.strokeStyle = '#5b6270'; ctx.lineWidth = 4; ctx.lineCap = 'round'
  for (const [lx, ly, ph] of [[12, -9, 0], [12, 9, Math.PI], [-12, -9, Math.PI], [-12, 9, 0]] as const) {
    const sw = Math.sin(gait + ph) * 7
    ctx.beginPath(); ctx.moveTo(lx, ly * 0.6); ctx.lineTo(lx + sw, ly * 1.35); ctx.stroke()
  }
  // Tail: a bundle of wires.
  ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 2
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-20, k * 2); ctx.quadraticCurveTo(-28, k * 4 + Math.sin(time * 12 + k) * 3, -34, k * 5); ctx.stroke() }
  // Body: brushed metal.
  const g = ctx.createLinearGradient(0, -12, 0, 12)
  g.addColorStop(0, '#f4f6fa'); g.addColorStop(0.45, '#a9b0bc'); g.addColorStop(1, '#5d6472')
  ctx.fillStyle = g; ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(-22, -11 + bob, 40, 22, 9); ctx.fill(); ctx.stroke()
  // Panel seams and rivets.
  ctx.strokeStyle = 'rgba(40,44,52,0.6)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(-6, -11 + bob); ctx.lineTo(-6, 11 + bob); ctx.moveTo(6, -11 + bob); ctx.lineTo(6, 11 + bob); ctx.stroke()
  ctx.fillStyle = '#3a3f4a'
  for (const [rx, ry] of [[-16, -6], [-16, 6], [0, -6], [0, 6], [12, -6], [12, 6]]) { ctx.beginPath(); ctx.arc(rx, ry + bob, 1.3, 0, Math.PI * 2); ctx.fill() }
  // Neck + head.
  ctx.fillStyle = g; ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(14, -6 + bob, 12, 12, 3); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.roundRect(22, -8 + bob, 16, 16, 5); ctx.fill(); ctx.stroke()
  // Ears / antenna.
  ctx.fillStyle = '#8b929e'
  ctx.beginPath(); ctx.moveTo(24, -8 + bob); ctx.lineTo(27, -14 + bob); ctx.lineTo(30, -8 + bob); ctx.fill()
  ctx.beginPath(); ctx.moveTo(24, 8 + bob); ctx.lineTo(27, 14 + bob); ctx.lineTo(30, 8 + bob); ctx.fill()
  // Glowing red visor.
  const on = 0.7 + 0.3 * Math.sin(time * 14)
  ctx.fillStyle = `rgba(255,40,30,${on})`
  ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 10
  ctx.beginPath(); ctx.roundRect(31, -6 + bob, 5, 12, 2); ctx.fill()
  ctx.shadowBlur = 0
  ctx.restore()
}

/** Electricity-nade in flight: a small canister crackling with sparks. */
export function drawNade(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, t: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 11, 6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.translate(x, y - z * 0.7)
  ctx.rotate(t * 20)
  ctx.fillStyle = '#2f3a4a'; ctx.strokeStyle = '#7cd0ff'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(-8, -11, 16, 22, 5); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#ffe14d'
  ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 8); ctx.lineTo(4, -2); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(170,230,255,0.9)'; ctx.lineWidth = 1.5
  for (let k = 0; k < 3; k++) {
    const a = t * 30 + k * 2.1
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 12); ctx.lineTo(Math.cos(a + 0.3) * 17, Math.sin(a + 0.5) * 18); ctx.stroke()
  }
  ctx.restore()
}

/** Where the Electricity-nade will land: a blue ring filling up over its short flight. */
export function drawNadeTarget(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, time: number) {
  ctx.save()
  const f = Math.min(1, t / ABILITY.nadeFlight)
  ctx.fillStyle = `rgba(80,170,255,${0.12 + 0.2 * f})`
  ctx.beginPath(); ctx.arc(x, y, r * f, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(190,235,255,0.95)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -time * 60
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/** A jagged lightning bolt from a to b (fresh zigzag every frame). */
function bolt(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, width: number) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1
  const nx = -dy / d, ny = dx / d
  const n = Math.max(4, Math.round(d / 18))
  const pts: [number, number][] = [[ax, ay]]
  for (let k = 1; k < n; k++) { const f = k / n, o = (Math.random() - 0.5) * Math.min(26, d * 0.25); pts.push([ax + dx * f + nx * o, ay + dy * f + ny * o]) }
  pts.push([bx, by])
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]) }
  ctx.strokeStyle = 'rgba(90,170,255,0.55)'; ctx.lineWidth = width * 3; path(); ctx.stroke()
  ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = width; path(); ctx.stroke()
}

/** After landing: a flash at the blast and lightning arcs jumping along the chain, hop by hop. */
export function drawLightning(ctx: CanvasRenderingContext2D, it: Extract<Item, { kind: 'nade' }>, horses: Horse[], _time: number) {
  const since = it.t - ABILITY.nadeFlight
  const fade = Math.max(0, 1 - since / (it.life - ABILITY.nadeFlight))
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.globalAlpha = fade
  const g = ctx.createRadialGradient(it.to.x, it.to.y, 4, it.to.x, it.to.y, it.r)
  g.addColorStop(0, 'rgba(220,245,255,0.85)'); g.addColorStop(1, 'rgba(80,160,255,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(it.to.x, it.to.y, it.r * (0.6 + 0.4 * Math.min(1, since * 6)), 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(160,220,255,0.8)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(it.to.x, it.to.y, it.r, 0, Math.PI * 2); ctx.stroke()
  for (const l of it.links) {
    if (since < l.depth * 0.05) continue // the arc jumps one hop at a time
    const b = horses[l.to]
    const a = l.from < 0 ? it.to : horses[l.from].pos
    bolt(ctx, a.x, a.y, b.pos.x, b.pos.y, 2.5)
  }
  ctx.restore()
}
