import type { Horse } from './horse'

/**
 * Horse art lives ONLY in this file.
 *
 * Today every horse is drawn with simple canvas shapes. To use real sprites,
 * call `setHorseSprite(index, url)` (index 0 = player, 1..3 = bots) at startup,
 * e.g. in main.ts:
 *
 *   setHorseSprite(0, './sprites/horse-player.png')
 *
 * A sprite should be a top-down image with the horse's nose pointing RIGHT
 * (+x). It is drawn centred on the horse, rotated to its heading, scaled so
 * its width equals SPRITE_LENGTH world units. Animation frames can be added
 * later by passing several URLs; they're cycled by the horse's gait.
 */
export const SPRITE_LENGTH = 62

const sprites = new Map<number, HTMLImageElement[]>()

export function setHorseSprite(index: number, urls: string | string[]) {
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => { const img = new Image(); img.src = u; return img })
  sprites.set(index, list)
}

function drawImageHorse(ctx: CanvasRenderingContext2D, frames: HTMLImageElement[], h: Horse): boolean {
  const img = frames[Math.floor(h.gait) % frames.length]
  if (!img || !img.complete || img.naturalWidth === 0) return false
  const w = SPRITE_LENGTH, hh = (img.naturalHeight / img.naturalWidth) * w
  ctx.drawImage(img, -w / 2, -hh / 2, w, hh)
  return true
}

/** Draw a horse at the origin, nose toward +x. Caller sets position/rotation. */
export function drawHorseBody(ctx: CanvasRenderingContext2D, h: Horse) {
  const frames = sprites.get(h.id)
  if (frames && drawImageHorse(ctx, frames, h)) return
  drawPlaceholder(ctx, h)
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, h: Horse) {
  const { coat, mane, silk } = h.colors
  const moving = Math.abs(h.fwdSpeed) > 8 && h.state === 'normal'
  const g = h.gait * Math.PI
  const stride = moving ? Math.min(1, Math.abs(h.fwdSpeed) / 200) * 7 : 0

  // Legs (peek out from under the body).
  ctx.fillStyle = shade(coat, -0.35)
  const legs: [number, number, number][] = [[13, -8, 0], [13, 8, Math.PI], [-12, -8, Math.PI], [-12, 8, 0]]
  for (const [lx, ly, ph] of legs) {
    ctx.beginPath()
    ctx.ellipse(lx + Math.sin(g + ph) * stride, ly * 1.15, 5, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Tail.
  ctx.strokeStyle = mane
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-21, 0)
  ctx.quadraticCurveTo(-30, Math.sin(g * 0.5) * 6, -36, Math.sin(g * 0.5 + 1) * 5)
  ctx.stroke()

  // Body.
  ctx.fillStyle = coat
  ctx.strokeStyle = shade(coat, -0.45)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // Neck + head.
  ctx.beginPath()
  ctx.ellipse(21, 0, 9, 6.5, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(31, 0, 8, 5.5, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  // Muzzle.
  ctx.fillStyle = shade(coat, -0.25)
  ctx.beginPath(); ctx.ellipse(37, 0, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill()
  // Ears.
  ctx.fillStyle = shade(coat, -0.2)
  ctx.beginPath(); ctx.ellipse(27, -4.5, 3, 1.8, -0.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(27, 4.5, 3, 1.8, 0.4, 0, Math.PI * 2); ctx.fill()
  // Mane along the neck.
  ctx.strokeStyle = mane
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(28, 0); ctx.stroke()

  // Saddle cloth + jockey.
  ctx.fillStyle = silk
  ctx.beginPath()
  ctx.roundRect(-9, -11.5, 14, 23, 3)
  ctx.fill()
  ctx.fillStyle = shade(silk, -0.3)
  ctx.beginPath(); ctx.ellipse(-1, 0, 7, 8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(1, 0, 4.2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = silk
  ctx.beginPath(); ctx.arc(1.5, 0, 2.6, 0, Math.PI * 2); ctx.fill()
}

/** Lighten (amt>0) or darken (amt<0) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)
  r = f(r); g = f(g); b = f(b)
  return `rgb(${r},${g},${b})`
}
