import { CONTROL } from './config'

export interface DragState {
  active: boolean
  /** Where the drag started (CSS px, may follow the finger if it goes far). */
  ox: number; oy: number
  /** Current pointer (CSS px). */
  x: number; y: number
  /** Screen-space angle of the drag (0 = right, y down). */
  angle: number
  /** 0..1 how hard you're pulling. */
  power: number
}

/**
 * Keyboard + pointer (mouse / trackpad / touch) input.
 *  - WASD / arrow keys
 *  - press-and-drag anywhere: arrow direction = steering, length = speed
 *  - quick tap, a second finger, or right-click = quick stop then reverse
 */
export class Input {
  keys = new Set<string>()
  drag: DragState = { active: false, ox: 0, oy: 0, x: 0, y: 0, angle: 0, power: 0 }
  private primaryId: number | null = null
  private downAt = 0
  private moved = 0
  private reverseTaps = 0
  enabled = false
  /** Increments each time a new primary drag starts. */
  dragStarts = 0
  /** Called on any pointer/key gesture (used to unlock audio). */
  onGesture: () => void = () => {}

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k)
        if (this.enabled) e.preventDefault()
        this.onGesture()
      }
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))
    window.addEventListener('blur', () => { this.keys.clear(); this.endDrag() })

    el.addEventListener('pointerdown', (e) => this.down(e))
    window.addEventListener('pointermove', (e) => this.move(e))
    window.addEventListener('pointerup', (e) => this.up(e))
    window.addEventListener('pointercancel', (e) => { if (e.pointerId === this.primaryId) this.endDrag() })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  get maxDrag() {
    return Math.max(70, Math.min(CONTROL.maxDrag, Math.min(window.innerWidth, window.innerHeight) * 0.3))
  }

  private down(e: PointerEvent) {
    this.onGesture()
    if (!this.enabled) return
    e.preventDefault()
    if (e.pointerType === 'mouse' && e.button === 2) { this.reverseTaps++; return }
    if (this.primaryId !== null) {
      // A second finger while steering = quick stop / reverse.
      this.reverseTaps++
      return
    }
    this.primaryId = e.pointerId
    this.dragStarts++
    try { this.el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    this.downAt = performance.now()
    this.moved = 0
    this.drag = { active: true, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, angle: 0, power: 0 }
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.primaryId) return
    const d = this.drag
    d.x = e.clientX; d.y = e.clientY
    let dx = d.x - d.ox, dy = d.y - d.oy
    let l = Math.hypot(dx, dy)
    this.moved = Math.max(this.moved, l)
    // Floating stick: if you drag far past full power, the origin follows.
    const max = this.maxDrag
    if (l > max * 1.25) {
      const k = (l - max * 1.25) / l
      d.ox += dx * k; d.oy += dy * k
      dx = d.x - d.ox; dy = d.y - d.oy; l = Math.hypot(dx, dy)
    }
    d.angle = Math.atan2(dy, dx)
    d.power = Math.max(0, Math.min(1, (l - CONTROL.deadZone) / (max - CONTROL.deadZone)))
  }

  private up(e: PointerEvent) {
    if (e.pointerId !== this.primaryId) return
    const quick = performance.now() - this.downAt < CONTROL.tapMs && this.moved < CONTROL.tapMovePx
    this.endDrag()
    if (quick && this.enabled) this.reverseTaps++
  }

  private endDrag() {
    this.primaryId = null
    this.drag.active = false
    this.drag.power = 0
  }

  /** Number of reverse taps since last call. */
  takeReverseTaps(): number { const n = this.reverseTaps; this.reverseTaps = 0; return n }

  get forward() { return this.keys.has('w') || this.keys.has('arrowup') }
  get back() { return this.keys.has('s') || this.keys.has('arrowdown') }
  get left() { return this.keys.has('a') || this.keys.has('arrowleft') }
  get right() { return this.keys.has('d') || this.keys.has('arrowright') }

  reset() { this.keys.clear(); this.endDrag(); this.reverseTaps = 0 }
}
